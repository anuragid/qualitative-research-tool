"""Separate Celery tasks for step-by-step cross-video project analysis.

Mirrors backend/app/tasks/analysis_steps.py but for the 3-node project
analysis pipeline: cross_relate -> cross_explain -> cross_activate.
Each step reads state from the ProjectAnalysis row, runs one node,
and writes results back.
"""

import logging
from datetime import datetime, timezone
from typing import Optional
from uuid import UUID

import sentry_sdk
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session

from app.agents.nodes.cross_activate import cross_activate_node
from app.agents.nodes.cross_explain import cross_explain_node
from app.agents.nodes.cross_relate import cross_relate_node
from app.models.database_models import ProjectAnalysis, Video, VideoAnalysis
from app.state import (
    InvalidTransitionError,
    ProjectAnalysisEvent,
    ProjectAnalysisStateMachine,
)
from app.tasks._pipeline_utils import build_error_json
from app.tasks.analysis_steps import (
    NonRetryableAnalysisError,
    _is_retryable_step_exc,
    _raise_for_node_error,
    _resolve_byok_or_raise_credits_error,
)
from app.tasks.base import DatabaseTask
from app.tasks.celery_app import celery_app

logger = logging.getLogger(__name__)


def _check_project_cancellation(db: Session, project_id: str) -> bool:
    """Return True if the project analysis should stop.

    Mirrors _check_cancellation from analysis_steps.py but for
    ProjectAnalysis rows. A missing row is treated as cancelled for
    steps 2 and 3; step 1 (cross_relate) passes require_existing=False
    since it's responsible for creating the row.

    Raises:
        OperationalError: A transient DB outage is re-raised (not swallowed
            as "not cancelled") so the task's ``autoretry_for=(Exception,)``
            decorator retries the precheck instead of proceeding to burn a
            cross-video LLM call on possibly-cancelled work. A missing row
            stays a clean "cancelled" signal — only genuine query failures
            propagate.
    """
    try:
        db.expire_all()
        pa = db.query(ProjectAnalysis).filter(
            ProjectAnalysis.project_id == UUID(project_id)
        ).first()
        if pa is None or pa.status == "error":
            return True
        return False
    except OperationalError:
        try:
            db.rollback()
        except Exception:
            pass
        logger.warning(
            "_check_project_cancellation: transient DB error for %s — "
            "re-raising for autoretry",
            project_id,
        )
        raise


def _get_or_create_project_analysis(db: Session, project_id: UUID) -> ProjectAnalysis:
    """Get existing ProjectAnalysis or create a new one aggregating from videos."""
    pa = db.query(ProjectAnalysis).filter(
        ProjectAnalysis.project_id == project_id
    ).first()
    if pa is None:
        video_analyses = db.query(VideoAnalysis).join(Video).filter(
            Video.project_id == project_id,
            VideoAnalysis.status == "completed",
        ).all()
        if not video_analyses:
            raise Exception(
                "At least one completed video analysis is required"
            )

        video_ids = [va.video_id for va in video_analyses]
        pa = ProjectAnalysis(
            project_id=project_id,
            video_ids=video_ids,
            started_at=datetime.now(timezone.utc),
        )
        # ROW_CREATED: None -> PROCESSING. The transition table captures
        # the "ProjectAnalysis is born already running" semantic (unlike
        # VideoAnalysis which has a separate PENDING state).
        ProjectAnalysisStateMachine.transition(
            pa, ProjectAnalysisEvent.ROW_CREATED, db=db
        )
        db.add(pa)
        db.commit()
        db.refresh(pa)
    return pa


def _handle_project_step_failure(
    db: Session,
    project_id: str,
    step_name: str,
    exc: Exception | None = None,
):
    """Failure policy for the 3 cross-video step ``except`` blocks.

    Mirrors :func:`app.tasks.analysis_steps._handle_step_failure`:

    - Retryable failure -> roll back the dirty partial transaction and leave
      the ProjectAnalysis row ``processing`` so Celery's autoretry can re-run
      the node and finish. Stamping ``error`` here would make the retry's
      ``_check_project_cancellation`` precheck skip the step, turning a
      transient hiccup into a permanent error.
    - Non-retryable failure -> stamp the row ``error`` immediately via
      :func:`_update_project_analysis_error` (unchanged behaviour).
    """
    if _is_retryable_step_exc(exc):
        try:
            db.rollback()
        except Exception:
            logger.warning(
                "Rollback after retryable %s failure for project %s failed; "
                "session will be reset by the task lifecycle",
                step_name,
                project_id,
                exc_info=True,
            )
        return
    _update_project_analysis_error(db, project_id, step_name, exc=exc)


def _update_project_analysis_error(db: Session, project_id: str, step_name: str, exc: Optional[Exception] = None):
    """Mark ProjectAnalysis as error, safe to call on dirty session.

    Raises:
        Exception: If writing the error state itself fails, the failure is
            re-raised (not swallowed) so it surfaces to Celery's autoretry /
            the chain's ``.on_error`` handler instead of leaving the PA row
            ``processing`` until the watchdog reset. Loop-safe: called only
            from a cross-video step's ``except Exception as e`` block, never
            recursively, so the re-raise surfaces exactly once.
    """
    try:
        db.rollback()
        pa = db.query(ProjectAnalysis).filter(
            ProjectAnalysis.project_id == UUID(project_id)
        ).first()
        if pa:
            try:
                ProjectAnalysisStateMachine.transition(
                    pa, ProjectAnalysisEvent.CHAIN_FAILED, db=db
                )
            except InvalidTransitionError as transition_exc:
                logger.warning(
                    f"_update_project_analysis_error: invalid transition "
                    f"for {project_id} ({step_name}): {transition_exc}"
                )
            pa.completed_at = datetime.now(timezone.utc)
            pa.error_message = build_error_json(
                step=step_name,
                exc=exc if exc is not None else Exception(f"Analysis failed at {step_name}"),
                message=str(exc) if exc is not None else f"Analysis failed at step '{step_name}'",
            )
        db.commit()
    except Exception as commit_error:
        logger.error(
            f"Failed to update project error status for {step_name}: {commit_error}",
            exc_info=True,
        )
        sentry_sdk.capture_exception(commit_error)
        try:
            db.rollback()
        except Exception:
            pass
        raise


@celery_app.task(
    base=DatabaseTask,
    bind=True,
    name="analyze_cross_relate_step",
    autoretry_for=(Exception,),
    dont_autoretry_for=(NonRetryableAnalysisError,),
    retry_backoff=True,
    retry_backoff_max=600,
    retry_jitter=True,
    max_retries=3,
)
def analyze_cross_relate_step(self, project_id: str, user_id: str | None = None):
    """Step 1 of 3: find meta-patterns across videos."""
    try:
        logger.info(f"Starting CROSS_RELATE step for project {project_id}")

        # First chain link: skip only on explicit error state (not on
        # missing PA row — we create it below). A transient DB outage is
        # re-raised (not swallowed as "proceed") so Celery autoretries
        # instead of burning a cross-video LLM call on possibly-cancelled
        # work. The outer ``except Exception`` routes it through
        # _update_project_analysis_error + re-raise -> autoretry.
        self.db.expire_all()
        existing = self.db.query(ProjectAnalysis).filter(
            ProjectAnalysis.project_id == UUID(project_id)
        ).first()
        if existing is not None and existing.status == "error":
            logger.info(
                f"Skipping cross_relate for {project_id} — already in error state"
            )
            return {"project_id": project_id, "status": "skipped"}

        pa = _get_or_create_project_analysis(self.db, UUID(project_id))

        # Aggregate patterns from completed videos
        video_analyses = self.db.query(VideoAnalysis).join(Video).filter(
            Video.project_id == UUID(project_id),
            VideoAnalysis.status == "completed",
        ).all()

        all_patterns = []
        all_insights = []
        all_principles = []
        video_ids = []
        for va in video_analyses:
            video_ids.append(str(va.video_id))
            if va.patterns:
                all_patterns.extend(va.patterns)
            if va.insights:
                all_insights.extend(va.insights)
            if va.design_principles:
                all_principles.extend(va.design_principles)

        # Resolve BYOK API key + preferred model with balance pre-flight.
        # First chain link uses ``force_refresh=True`` so the user sees a
        # live OpenRouter balance, not a 60s-stale cache.
        byok_api_key, byok_model = _resolve_byok_or_raise_credits_error(
            self.db, user_id, "cross_relate", force_refresh=True,
        )

        result = cross_relate_node({
            "project_id": project_id,
            "video_ids": video_ids,
            "video_patterns": all_patterns,
            "video_insights": all_insights,
            "video_principles": all_principles,
            "api_key": byok_api_key,
            "model": byok_model,
        })

        if result.get("error") or result.get("cross_video_patterns") is None:
            _raise_for_node_error("cross_relate", result)

        pa.cross_video_patterns = result.get("cross_video_patterns")
        # CHAIN_STEP_PROGRESS: idempotent processing -> processing. Keeps the
        # state machine as the single source of truth even for no-op writes.
        ProjectAnalysisStateMachine.transition(
            pa, ProjectAnalysisEvent.CHAIN_STEP_PROGRESS, db=self.db
        )
        self.db.commit()

        logger.info(f"CROSS_RELATE step completed for project {project_id}")
        return {"project_id": project_id, "status": "success"}

    except Exception as e:
        logger.error(f"CROSS_RELATE step failed for project {project_id}: {e}")
        _handle_project_step_failure(self.db, project_id, "cross_relate", exc=e)
        raise


@celery_app.task(
    base=DatabaseTask,
    bind=True,
    name="analyze_cross_explain_step",
    autoretry_for=(Exception,),
    dont_autoretry_for=(NonRetryableAnalysisError,),
    retry_backoff=True,
    retry_backoff_max=600,
    retry_jitter=True,
    max_retries=3,
)
def analyze_cross_explain_step(self, project_id: str, user_id: str | None = None):
    """Step 2 of 3: synthesize cross-video insights from meta-patterns."""
    try:
        logger.info(f"Starting CROSS_EXPLAIN step for project {project_id}")

        if _check_project_cancellation(self.db, project_id):
            logger.info(
                f"Skipping cross_explain for {project_id} — already in error state"
            )
            return {"project_id": project_id, "status": "skipped"}

        pa = self.db.query(ProjectAnalysis).filter(
            ProjectAnalysis.project_id == UUID(project_id)
        ).first()
        if not pa or not pa.cross_video_patterns:
            raise Exception("No cross-video patterns available for cross_explain")

        # Downstream chain link reuses cached balance from cross_relate.
        byok_api_key, byok_model = _resolve_byok_or_raise_credits_error(
            self.db, user_id, "cross_explain", force_refresh=False,
        )

        result = cross_explain_node({
            "project_id": project_id,
            "cross_video_patterns": pa.cross_video_patterns,
            "api_key": byok_api_key,
            "model": byok_model,
        })

        if result.get("error") or result.get("cross_video_insights") is None:
            _raise_for_node_error("cross_explain", result)

        pa.cross_video_insights = result.get("cross_video_insights")
        self.db.commit()

        logger.info(f"CROSS_EXPLAIN step completed for project {project_id}")
        return {"project_id": project_id, "status": "success"}

    except Exception as e:
        logger.error(f"CROSS_EXPLAIN step failed for project {project_id}: {e}")
        _handle_project_step_failure(self.db, project_id, "cross_explain", exc=e)
        raise


@celery_app.task(
    base=DatabaseTask,
    bind=True,
    name="analyze_cross_activate_step",
    autoretry_for=(Exception,),
    dont_autoretry_for=(NonRetryableAnalysisError,),
    retry_backoff=True,
    retry_backoff_max=600,
    retry_jitter=True,
    max_retries=3,
)
def analyze_cross_activate_step(self, project_id: str, user_id: str | None = None):
    """Step 3 of 3: derive system-level design principles. Terminal step."""
    try:
        logger.info(f"Starting CROSS_ACTIVATE step for project {project_id}")

        if _check_project_cancellation(self.db, project_id):
            logger.info(
                f"Skipping cross_activate for {project_id} — already in error state"
            )
            return {"project_id": project_id, "status": "skipped"}

        pa = self.db.query(ProjectAnalysis).filter(
            ProjectAnalysis.project_id == UUID(project_id)
        ).first()
        if not pa or not pa.cross_video_insights:
            raise Exception("No cross-video insights available for cross_activate")

        # Downstream chain link reuses cached balance from cross_relate.
        byok_api_key, byok_model = _resolve_byok_or_raise_credits_error(
            self.db, user_id, "cross_activate", force_refresh=False,
        )

        result = cross_activate_node({
            "project_id": project_id,
            "cross_video_insights": pa.cross_video_insights,
            "api_key": byok_api_key,
            "model": byok_model,
        })

        if result.get("error") or result.get("cross_video_principles") is None:
            _raise_for_node_error("cross_activate", result)

        pa.cross_video_principles = result.get("cross_video_principles")
        # Final step: CHAIN_SUCCEEDED -> completed.
        ProjectAnalysisStateMachine.transition(
            pa, ProjectAnalysisEvent.CHAIN_SUCCEEDED, db=self.db
        )
        pa.completed_at = datetime.now(timezone.utc)
        self.db.commit()

        logger.info(f"CROSS_ACTIVATE step completed for project {project_id}")
        return {"project_id": project_id, "status": "success"}

    except Exception as e:
        logger.error(f"CROSS_ACTIVATE step failed for project {project_id}: {e}")
        _handle_project_step_failure(self.db, project_id, "cross_activate", exc=e)
        raise
