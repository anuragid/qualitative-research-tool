"""Errback tasks for the Celery analysis pipelines.

When a pipeline task fails after retries are exhausted, Celery invokes
the errback attached at dispatch time — either via ``chain(...).on_error()``
(full-chain dispatches) or via ``task.apply_async(..., link_error=...)``
(standalone step dispatches). Both attach the errback to the failed
task's ``request.errbacks``, so delivery is identical.

Errback calling convention (verified against the pinned Celery 5.3.4,
``celery/backends/base.py::_call_task_errbacks``): because these handlers
are ``bind=True``, their ``__header__`` is a ``functools.partial``, which
forces Celery onto the OLD-STYLE errback protocol — the errback is
enqueued as a normal task with the FAILED TASK'S ID STRING as the only
prepended positional argument, plus the kwargs bound in the signature.
``exc`` and ``traceback`` are NOT delivered on this path, hence their
``None`` defaults. The new-style protocol (non-bind errbacks only) would
instead call ``errback(request_context, exc, traceback)`` inline with a
Context object carrying ``.task`` — handled defensively in case the
handlers are ever un-bound or Celery's semantics change.

Step attribution: dispatchers that know which step they dispatched (the
5 standalone step routes) bind ``step_name`` explicitly in the signature
and it takes precedence. Chain dispatches can't know which link will
fail; for them the step falls back to ``request.task`` when a Context is
available (new-style only), else "unknown".

The handlers are idempotent — if an individual step task's except block
already marked the analysis as error (the common case), they are no-ops.
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


def _resolve_failed_step(request, step_name: str | None) -> str:
    """Resolve which pipeline step failed.

    Precedence:
      1. ``step_name`` bound explicitly in the errback signature (the
         standalone step routes know exactly which step they dispatched).
      2. ``request.task`` when ``request`` is a Context object (new-style
         errback protocol only — with our bind=True handlers Celery
         actually delivers the failed task's id STRING here, which carries
         no task name).
      3. "unknown".
    """
    if step_name:
        return step_name
    # Old-style protocol: request is the failed task's id string — no task
    # name available on it. getattr on a str returns the default.
    if request is not None and not isinstance(request, str):
        task_name = getattr(request, "task", None)
        if task_name and isinstance(task_name, str):
            # e.g. "analyze_infer_step" → "infer"
            return task_name.replace("analyze_", "").replace("_step", "")
    return "unknown"


def _coerce_exc(exc, failed_step: str, request) -> Exception:
    """Normalize the (possibly absent) exception for build_error_json.

    On the old-style errback protocol Celery does not deliver the
    exception at all, so synthesize a useful terminal message rather
    than stamping the row with "None".
    """
    if isinstance(exc, Exception):
        return exc
    if exc is not None:
        return Exception(str(exc))
    failed_task_id = request if isinstance(request, str) else "unknown"
    return Exception(
        f"{failed_step} step failed and retries were exhausted "
        f"(failed task id: {failed_task_id}; see worker logs for the "
        f"original exception)"
    )


@celery_app.task(base=DatabaseTask, bind=True, name="handle_pipeline_error")
def handle_pipeline_error(
    self,
    request=None,
    exc=None,
    traceback=None,
    video_id: str = "",
    step_name: str | None = None,
):
    """Pipeline errback — marks video + analysis as error, idempotent.

    Supports both errback calling conventions (see module docstring):
    old-style delivers ``request`` as the failed task's id string with no
    ``exc``/``traceback``; new-style delivers a Context plus exception
    info. ``video_id`` (and ``step_name`` for standalone step dispatches)
    are bound as kwargs in the signature at dispatch time.
    """
    try:
        if not video_id:
            raise ValueError(
                "handle_pipeline_error invoked without a video_id — "
                "dispatch site must bind it in the errback signature"
            )

        try:
            self.db.rollback()
        except Exception:
            pass

        video = self.db.query(Video).filter(Video.id == UUID(video_id)).first()
        analysis = self.db.query(VideoAnalysis).filter(
            VideoAnalysis.video_id == UUID(video_id)
        ).first()

        failed_step = _resolve_failed_step(request, step_name)
        if isinstance(request, str):
            logger.info(
                f"handle_pipeline_error: invoked for failed task {request} "
                f"(video {video_id}, step={failed_step})"
            )

        norm_exc = _coerce_exc(exc, failed_step, request)
        error_json = build_error_json(
            step=failed_step,
            exc=norm_exc,
            message=str(norm_exc),
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
def handle_project_pipeline_error(
    self,
    request=None,
    exc=None,
    traceback=None,
    project_id: str = "",
    step_name: str | None = None,
):
    """Errback for the 3-node project analysis chain.

    Marks the ProjectAnalysis row as error. Idempotent — no-op if already
    marked by a per-step except block. Supports both errback calling
    conventions (see module docstring) — with bind=True Celery delivers
    only the failed task's id string, no exc/traceback.
    """
    try:
        if not project_id:
            raise ValueError(
                "handle_project_pipeline_error invoked without a project_id "
                "— dispatch site must bind it in the errback signature"
            )

        self.db.rollback()

        from app.models.database_models import ProjectAnalysis
        pa = self.db.query(ProjectAnalysis).filter(
            ProjectAnalysis.project_id == UUID(project_id)
        ).first()

        failed_step = _resolve_failed_step(request, step_name)
        if isinstance(request, str):
            logger.info(
                f"handle_project_pipeline_error: invoked for failed task "
                f"{request} (project {project_id}, step={failed_step})"
            )

        if pa and pa.status != "error":
            try:
                ProjectAnalysisStateMachine.transition(
                    pa, ProjectAnalysisEvent.CHAIN_FAILED, db=self.db
                )
                pa.completed_at = datetime.now(timezone.utc)
                norm_exc = _coerce_exc(exc, failed_step, request)
                pa.error_message = build_error_json(
                    step=failed_step,
                    exc=norm_exc,
                    message=str(norm_exc),
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
