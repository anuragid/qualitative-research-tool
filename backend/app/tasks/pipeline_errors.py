"""Chain error handler for the Celery analysis pipeline.

When a link in the analysis chain fails after retries are exhausted,
Celery invokes this task via .on_error() with the task request, the
exception, a traceback string, and our explicit video_id argument.

The handler is idempotent — if an individual step task's except block
already marked the analysis as error (the common case), this handler
is a no-op.
"""

import logging
from datetime import datetime, timezone
from uuid import UUID

import sentry_sdk

from app.models.database_models import Video, VideoAnalysis
from app.state import (
    InvalidTransitionError,
    ProjectAnalysisEvent,
    ProjectAnalysisStateMachine,
    VideoAnalysisEvent,
    VideoAnalysisStateMachine,
    VideoEvent,
    VideoStateMachine,
)
from app.tasks._pipeline_utils import build_error_json, sanitize_error
from app.tasks.base import DatabaseTask
from app.tasks.celery_app import celery_app

logger = logging.getLogger(__name__)


@celery_app.task(base=DatabaseTask, bind=True, name="handle_pipeline_error")
def handle_pipeline_error(self, request, exc, traceback, video_id: str):
    """Chain error handler — marks video + analysis as error, idempotent."""
    try:
        try:
            self.db.rollback()
        except Exception:
            pass

        video = self.db.query(Video).filter(Video.id == UUID(video_id)).first()
        analysis = self.db.query(VideoAnalysis).filter(
            VideoAnalysis.video_id == UUID(video_id)
        ).first()

        # Determine which step failed from the request context
        failed_step = "unknown"
        if request is not None:
            task_name = getattr(request, "task", None)
            if task_name and isinstance(task_name, str):
                # e.g. "analyze_infer_step" → "infer"
                failed_step = task_name.replace("analyze_", "").replace("_step", "")

        error_json = build_error_json(
            step=failed_step,
            exc=exc if isinstance(exc, Exception) else Exception(str(exc)),
            message=str(exc),
        )

        # Idempotent update: only set error state if not already set
        if video and video.status not in ("error", "analyzed"):
            try:
                VideoStateMachine.transition(
                    video,
                    VideoEvent.CHAIN_FAILED,
                    db=self.db,
                    error_message=error_json,
                )
                logger.info(
                    f"handle_pipeline_error: marked video {video_id} as error "
                    f"(step={failed_step})"
                )
            except InvalidTransitionError as exc:
                logger.warning(
                    f"handle_pipeline_error: could not transition video "
                    f"{video_id} via CHAIN_FAILED: {exc}"
                )
        elif video:
            logger.info(
                f"handle_pipeline_error: video {video_id} already in "
                f"{video.status}, no-op"
            )

        if analysis and analysis.status != "error":
            try:
                VideoAnalysisStateMachine.transition(
                    analysis, VideoAnalysisEvent.CHAIN_FAILED, db=self.db
                )
            except InvalidTransitionError as exc:
                logger.warning(
                    f"handle_pipeline_error: could not transition "
                    f"VideoAnalysis for video {video_id}: {exc}"
                )
            analysis.completed_at = datetime.now(timezone.utc)

        self.db.commit()

    except Exception as e:
        # This is the chain's terminal .on_error callback. If marking the
        # error state fails here, the row stays "processing" with no reason
        # until the watchdog reset (~17 min). Previously this was swallowed
        # (logger + pass), so the only trace was a worker log line. Capture
        # to Sentry and re-raise so the failed-error-handler is observable.
        # Safe from loops: this task has no autoretry decorator and is never
        # called recursively, so the re-raise surfaces exactly once.
        logger.error(
            f"handle_pipeline_error itself failed: {sanitize_error(str(e))}",
            exc_info=True,
        )
        sentry_sdk.capture_exception(e)
        try:
            self.db.rollback()
        except Exception:
            pass
        raise


@celery_app.task(base=DatabaseTask, bind=True, name="handle_project_pipeline_error")
def handle_project_pipeline_error(self, request, exc, traceback, project_id: str):
    """Chain error handler for the 3-node project analysis chain.

    Marks the ProjectAnalysis row as error. Idempotent — no-op if already
    marked by a per-step except block.
    """
    try:
        self.db.rollback()

        from app.models.database_models import ProjectAnalysis
        pa = self.db.query(ProjectAnalysis).filter(
            ProjectAnalysis.project_id == UUID(project_id)
        ).first()

        failed_step = "unknown"
        if request is not None:
            task_name = getattr(request, "task", None)
            if task_name and isinstance(task_name, str):
                failed_step = task_name.replace("analyze_", "").replace("_step", "")

        if pa and pa.status != "error":
            try:
                ProjectAnalysisStateMachine.transition(
                    pa, ProjectAnalysisEvent.CHAIN_FAILED, db=self.db
                )
                pa.completed_at = datetime.now(timezone.utc)
                pa.error_message = build_error_json(
                    step=failed_step,
                    exc=exc if isinstance(exc, Exception) else Exception(str(exc)),
                    message=str(exc),
                )
                logger.info(
                    f"handle_project_pipeline_error: marked ProjectAnalysis "
                    f"{project_id} as error (step={failed_step})"
                )
            except InvalidTransitionError as exc:
                logger.warning(
                    f"handle_project_pipeline_error: could not transition "
                    f"ProjectAnalysis for {project_id}: {exc}"
                )
        elif pa:
            logger.info(
                f"handle_project_pipeline_error: PA {project_id} already in error, no-op"
            )

        self.db.commit()

    except Exception as e:
        # Terminal .on_error callback for the project chain. Same rationale
        # as handle_pipeline_error: surface a failed error-write to Sentry
        # and re-raise instead of leaving the PA row stuck silently.
        from app.tasks._pipeline_utils import sanitize_error
        logger.error(
            f"handle_project_pipeline_error itself failed: {sanitize_error(str(e))}",
            exc_info=True,
        )
        sentry_sdk.capture_exception(e)
        try:
            self.db.rollback()
        except Exception:
            pass
        raise
