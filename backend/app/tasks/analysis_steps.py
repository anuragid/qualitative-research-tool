"""Separate Celery tasks for step-by-step analysis."""

import json
import logging
from datetime import datetime, timezone
from typing import Any, Dict
from uuid import UUID

from sqlalchemy.orm import Session

from app.agents.nodes.activate import activate_node
from app.agents.nodes.chunk import chunk_node
from app.agents.nodes.explain import explain_node
from app.agents.nodes.infer import infer_node
from app.agents.nodes.relate import relate_node
from app.models.database_models import SpeakerLabel, Transcript, Video, VideoAnalysis
from app.services.byok_service import (
    InsufficientCreditsError,
    resolve_byok_with_preflight,
)
from app.services.project_state_service import ProjectStateService
from app.tasks._pipeline_utils import build_error_json, sanitize_error
from app.tasks.base import DatabaseTask
from app.tasks.celery_app import celery_app
from app.utils.error_classification import (
    ERROR_TYPE_INSUFFICIENT_CREDITS,
    is_retryable,
)

logger = logging.getLogger(__name__)


def _check_cancellation(db: Session, video_id: str) -> bool:
    """Return True if the analysis should stop (watchdog error, row gone).

    Called at the start of every step task in the chain so a halted
    pipeline doesn't do redundant work on subsequent links.
    """
    try:
        db.expire_all()
        analysis = db.query(VideoAnalysis).filter(
            VideoAnalysis.video_id == UUID(video_id)
        ).first()
        if analysis is None or analysis.status == "error":
            return True
        return False
    except Exception:
        logger.exception("_check_cancellation failed, proceeding")
        return False


class NonRetryableAnalysisError(Exception):
    """Pipeline error that Celery should NOT autoretry.

    Raised when a node returns a result with an ``error_type`` classified
    as non-retryable (validation_error, llm_permanent, unknown).  Combined
    with ``dont_autoretry_for=(NonRetryableAnalysisError,)`` on the task
    decorator, this short-circuits Celery's autoretry loop so we don't
    waste 4 attempts × 10-minute backoffs on errors that won't get better.
    """


class InsufficientCreditsNonRetryable(NonRetryableAnalysisError):
    """Specialised non-retryable error for the BYOK 0-balance case.

    Raised by the step tasks when ``resolve_byok_with_preflight`` reports
    that the user's OpenRouter key has zero credits **before** any LLM
    call is made. Carries the structured ``BalanceInfo`` so the error
    writer can stamp ``error_type=insufficient_credits`` on
    ``video.error_message`` and the frontend can render the dedicated
    "Add credits" alert with the user's actual balance.
    """

    def __init__(self, message: str, balance: Any | None = None):
        super().__init__(message)
        self.balance = balance


def _resolve_byok_or_raise_credits_error(
    db: Session,
    user_id: str | None,
    step_name: str,
    *,
    force_refresh: bool,
) -> tuple[str | None, str | None]:
    """Pre-flight resolver wrapper used by every step task.

    Calls :func:`resolve_byok_with_preflight` and converts the
    :class:`InsufficientCreditsError` into the step-task-specific
    :class:`InsufficientCreditsNonRetryable` so it flows through the
    existing ``except`` blocks unchanged and the error writer can stamp
    ``error_type=insufficient_credits`` on ``video.error_message``.

    Returns:
        ``(api_key, model)`` — the ``BalanceInfo`` is intentionally
        dropped because nothing in the step body needs it. The pre-flight
        check was the only reason to fetch it.
    """
    try:
        api_key, model, _balance = resolve_byok_with_preflight(
            db, user_id, force_refresh=force_refresh
        )
    except InsufficientCreditsError as exc:
        raise InsufficientCreditsNonRetryable(
            f"{step_name.capitalize()} step failed: insufficient credits "
            f"(balance_remaining=${exc.balance.balance_remaining:.4f})",
            balance=exc.balance,
        ) from exc
    return api_key, model


def _raise_for_node_error(step_name: str, node_result: Dict[str, Any]) -> None:
    """Inspect a node result and raise the appropriate exception type.

    Retryable node errors raise a generic ``Exception`` (caught by Celery's
    ``autoretry_for=(Exception,)``).  Non-retryable errors raise
    ``NonRetryableAnalysisError`` (excluded from autoretry).
    """
    error_msg = node_result.get("error", f"Failed to generate {step_name}")
    error_type = node_result.get("error_type", "unknown")
    if is_retryable(error_type):
        raise Exception(f"{step_name.capitalize()} generation failed: {error_msg}")
    raise NonRetryableAnalysisError(
        f"{step_name.capitalize()} generation failed (non-retryable, "
        f"error_type={error_type}): {error_msg}"
    )


def get_video_analysis_state(db: Session, video_id: UUID) -> Dict[str, Any]:
    """Build the state needed for analysis nodes from database."""
    video = db.query(Video).filter(Video.id == video_id).first()
    if not video:
        raise Exception(f"Video {video_id} not found")

    transcript = db.query(Transcript).filter(Transcript.video_id == video_id).first()
    if not transcript or not transcript.processed_transcript:
        raise Exception(f"No transcript found for video {video_id}")

    # Get speaker labels
    speaker_labels = db.query(SpeakerLabel).filter(
        SpeakerLabel.transcript_id == transcript.id
    ).all()

    # Build speaker mapping with both names and roles
    speaker_mapping = {}
    speaker_roles = {}
    for label in speaker_labels:
        speaker_mapping[label.speaker_label] = label.assigned_name or label.speaker_label
        # Store role information (participant/interviewer)
        if label.role:
            speaker_roles[label.speaker_label] = label.role.lower()

    # Get or create video analysis record
    analysis = db.query(VideoAnalysis).filter(VideoAnalysis.video_id == video_id).first()
    if not analysis:
        analysis = VideoAnalysis(
            video_id=video_id,
            status="pending",
            current_step="chunk",
            step_status={}
        )
        db.add(analysis)
        db.commit()

    return {
        "video_id": str(video_id),
        "transcript": transcript.processed_transcript,
        "speaker_labels": speaker_mapping,
        "speaker_roles": speaker_roles,
        "analysis": analysis
    }


def _build_insufficient_credits_error_json(step_name: str, exc: "InsufficientCreditsNonRetryable") -> str:
    """Build a structured error_message JSON payload for the
    insufficient-credits case.

    Mirrors the shape used by ``analysis_tasks._build_pipeline_error_json``
    so the frontend's ``parseError`` consumer doesn't have to special-case
    step-task errors. Includes the ``balance`` block so
    ``InsufficientCreditsAlert.tsx`` can render the user's actual numbers
    without an extra round-trip.
    """
    payload: Dict[str, Any] = {
        "step": step_name,
        "error_type": ERROR_TYPE_INSUFFICIENT_CREDITS,
        "retryable": False,
        "message": (
            "Your OpenRouter key has no remaining credits. "
            "Add credits at https://openrouter.ai/settings/credits and try again."
        ),
        "details": str(exc),
    }
    if exc.balance is not None:
        try:
            payload["balance"] = exc.balance.as_dict()
        except Exception:  # pragma: no cover - defensive: balance shape mismatch
            pass
    return json.dumps(payload)


def _update_analysis_error(
    db: Session,
    video_id: str,
    step_name: str,
    exc: Exception | None = None,
):
    """Safely update analysis record to error state.

    Rolls back any dirty session state before querying, ensuring the
    error status update succeeds even if the previous transaction was
    left in a broken state.

    Uses a fresh query to avoid UnboundLocalError if the analysis variable
    was never assigned in the calling scope.

    When *exc* is an :class:`InsufficientCreditsNonRetryable`, the
    structured "insufficient_credits" payload is written to
    ``video.error_message`` so the frontend can render the dedicated
    "Add credits" alert. For other exception types this preserves the
    historical behaviour of leaving ``error_message`` untouched (the
    full-pipeline path in ``analysis_tasks.analyze_video_task`` writes
    its own structured payload).
    """
    try:
        db.rollback()
        analysis = db.query(VideoAnalysis).filter(
            VideoAnalysis.video_id == UUID(video_id)
        ).first()
        if analysis:
            analysis.status = "error"
            analysis.step_status = {**(analysis.step_status or {}), step_name: "error"}

        # Also reset video status from "analyzing" so it's not stuck
        video = db.query(Video).filter(Video.id == UUID(video_id)).first()
        if video and video.status == "analyzing":
            video.status = "error"

        # Stamp structured error_type for the BYOK 0-balance case so the
        # frontend can render the dedicated "Add credits" alert.
        if video is not None and isinstance(exc, InsufficientCreditsNonRetryable):
            video.error_message = _build_insufficient_credits_error_json(step_name, exc)

        db.commit()
    except Exception as commit_error:
        logger.error(f"Failed to update error status for {step_name}: {commit_error}")
        try:
            db.rollback()
        except Exception:
            pass


@celery_app.task(
    base=DatabaseTask,
    bind=True,
    name="analyze_chunk_step",
    autoretry_for=(Exception,),
    dont_autoretry_for=(NonRetryableAnalysisError,),
    retry_backoff=True,
    retry_backoff_max=600,
    retry_jitter=True,
    max_retries=3,
)
def analyze_chunk_step(self, video_id: str, user_id: str | None = None):
    """
    Step 1: CHUNK - Break transcript into discrete pieces.
    """
    try:
        logger.info(f"Starting CHUNK step for video {video_id}")

        # Get state from database
        state = get_video_analysis_state(self.db, UUID(video_id))
        analysis = state["analysis"]

        # Resolve BYOK API key + preferred model and pre-flight the
        # OpenRouter balance. ``force_refresh=True`` ensures the very
        # first step in the pipeline always sees a live balance number,
        # not a 60s-stale cache. Subsequent steps reuse the cached value.
        byok_api_key, byok_model = _resolve_byok_or_raise_credits_error(
            self.db, user_id, "chunk", force_refresh=True,
        )

        # Update status
        analysis.status = "processing"
        analysis.current_step = "chunk"
        analysis.step_status = {**(analysis.step_status or {}), "chunk": "processing"}
        analysis.started_at = datetime.now(timezone.utc)
        self.db.commit()

        # Run chunk node
        result = chunk_node({
            "video_id": video_id,
            "transcript": state["transcript"],
            "speaker_labels": state["speaker_labels"],
            "speaker_roles": state["speaker_roles"],
            "api_key": byok_api_key,
            "model": byok_model,
        })

        # Check for errors in node result
        if result.get("error") or result.get("chunks") is None:
            _raise_for_node_error("chunk", result)

        # Save results
        analysis.chunks = result.get("chunks")
        analysis.chunk_completed_at = datetime.now(timezone.utc)
        analysis.step_status = {**(analysis.step_status or {}), "chunk": "completed"}
        self.db.commit()

        logger.info(f"CHUNK step completed for video {video_id}")
        return {
            "video_id": video_id,
            "status": "success",
            "chunks_count": len(result.get("chunks", []))
        }

    except Exception as e:
        logger.error(f"CHUNK step failed for video {video_id}: {e}")
        _update_analysis_error(self.db, video_id, "chunk", exc=e)
        raise


@celery_app.task(
    base=DatabaseTask,
    bind=True,
    name="analyze_infer_step",
    autoretry_for=(Exception,),
    dont_autoretry_for=(NonRetryableAnalysisError,),
    retry_backoff=True,
    retry_backoff_max=600,
    retry_jitter=True,
    max_retries=3
)
def analyze_infer_step(self, video_id: str, user_id: str | None = None):
    """
    Step 2: INFER - Interpret meaning from each chunk.
    Automatically retries up to 3 times with exponential backoff on failure.
    """
    try:
        logger.info(f"Starting INFER step for video {video_id}")

        # Get analysis record
        analysis = self.db.query(VideoAnalysis).filter(
            VideoAnalysis.video_id == UUID(video_id)
        ).first()

        if not analysis or not analysis.chunks:
            raise Exception("No chunks available for inference")

        # Resolve BYOK API key + preferred model with balance pre-flight.
        # Steps 2-5 use ``force_refresh=False`` because step 1 already
        # burned credits and a 60s-stale value is acceptable.
        byok_api_key, byok_model = _resolve_byok_or_raise_credits_error(
            self.db, user_id, "infer", force_refresh=False,
        )

        # Update status
        analysis.current_step = "infer"
        analysis.step_status = {**(analysis.step_status or {}), "infer": "processing"}
        self.db.commit()

        # Run infer node
        result = infer_node({
            "video_id": video_id,
            "chunks": analysis.chunks,
            "api_key": byok_api_key,
            "model": byok_model,
        })

        # Check if result has error
        if result.get("error") or result.get("inferences") is None:
            _raise_for_node_error("inference", result)

        # Save results
        analysis.inferences = result.get("inferences")
        analysis.infer_completed_at = datetime.now(timezone.utc)
        analysis.step_status = {**(analysis.step_status or {}), "infer": "completed"}
        self.db.commit()

        logger.info(f"INFER step completed for video {video_id}")
        return {
            "video_id": video_id,
            "status": "success",
            "inferences_count": len(result.get("inferences", []))
        }

    except Exception as e:
        logger.error(f"INFER step failed for video {video_id}: {e}")
        _update_analysis_error(self.db, video_id, "infer", exc=e)
        raise


@celery_app.task(
    base=DatabaseTask,
    bind=True,
    name="analyze_relate_step",
    autoretry_for=(Exception,),
    dont_autoretry_for=(NonRetryableAnalysisError,),
    retry_backoff=True,
    retry_backoff_max=600,
    retry_jitter=True,
    max_retries=3,
)
def analyze_relate_step(self, video_id: str, user_id: str | None = None):
    """
    Step 3: RELATE - Find patterns across inferences.
    """
    try:
        logger.info(f"Starting RELATE step for video {video_id}")

        # Get analysis record
        analysis = self.db.query(VideoAnalysis).filter(
            VideoAnalysis.video_id == UUID(video_id)
        ).first()

        if not analysis or not analysis.inferences:
            raise Exception("No inferences available for pattern analysis")

        # Resolve BYOK API key + preferred model with balance pre-flight.
        byok_api_key, byok_model = _resolve_byok_or_raise_credits_error(
            self.db, user_id, "relate", force_refresh=False,
        )

        # Update status
        analysis.current_step = "relate"
        analysis.step_status = {**(analysis.step_status or {}), "relate": "processing"}
        self.db.commit()

        # Run relate node
        result = relate_node({
            "video_id": video_id,
            "inferences": analysis.inferences,
            "api_key": byok_api_key,
            "model": byok_model,
        })

        # Check for errors in node result
        if result.get("error") or result.get("patterns") is None:
            _raise_for_node_error("pattern", result)

        # Save results
        analysis.patterns = result.get("patterns")
        analysis.relate_completed_at = datetime.now(timezone.utc)
        analysis.step_status = {**(analysis.step_status or {}), "relate": "completed"}
        self.db.commit()

        logger.info(f"RELATE step completed for video {video_id}")
        return {
            "video_id": video_id,
            "status": "success",
            "patterns_count": len(result.get("patterns", []))
        }

    except Exception as e:
        logger.error(f"RELATE step failed for video {video_id}: {e}")
        _update_analysis_error(self.db, video_id, "relate", exc=e)
        raise


@celery_app.task(
    base=DatabaseTask,
    bind=True,
    name="analyze_explain_step",
    autoretry_for=(Exception,),
    dont_autoretry_for=(NonRetryableAnalysisError,),
    retry_backoff=True,
    retry_backoff_max=600,
    retry_jitter=True,
    max_retries=3,
)
def analyze_explain_step(self, video_id: str, user_id: str | None = None):
    """
    Step 4: EXPLAIN - Generate insights from patterns.
    """
    try:
        logger.info(f"Starting EXPLAIN step for video {video_id}")

        # Get analysis record
        analysis = self.db.query(VideoAnalysis).filter(
            VideoAnalysis.video_id == UUID(video_id)
        ).first()

        if not analysis or not analysis.patterns:
            raise Exception("No patterns available for insight generation")

        # Resolve BYOK API key + preferred model with balance pre-flight.
        byok_api_key, byok_model = _resolve_byok_or_raise_credits_error(
            self.db, user_id, "explain", force_refresh=False,
        )

        # Update status
        analysis.current_step = "explain"
        analysis.step_status = {**(analysis.step_status or {}), "explain": "processing"}
        self.db.commit()

        # Run explain node - include chunks for evidence (explain_node uses them)
        result = explain_node({
            "video_id": video_id,
            "patterns": analysis.patterns,
            "chunks": analysis.chunks,  # Provide chunks for evidence context
            "api_key": byok_api_key,
            "model": byok_model,
        })

        # Check for errors in node result
        if result.get("error") or result.get("insights") is None:
            _raise_for_node_error("insight", result)

        # Save results
        analysis.insights = result.get("insights")
        analysis.explain_completed_at = datetime.now(timezone.utc)
        analysis.step_status = {**(analysis.step_status or {}), "explain": "completed"}
        self.db.commit()

        logger.info(f"EXPLAIN step completed for video {video_id}")
        return {
            "video_id": video_id,
            "status": "success",
            "insights_count": len(result.get("insights", []))
        }

    except Exception as e:
        logger.error(f"EXPLAIN step failed for video {video_id}: {e}")
        _update_analysis_error(self.db, video_id, "explain", exc=e)
        raise


@celery_app.task(
    base=DatabaseTask,
    bind=True,
    name="analyze_activate_step",
    autoretry_for=(Exception,),
    dont_autoretry_for=(NonRetryableAnalysisError,),
    retry_backoff=True,
    retry_backoff_max=600,
    retry_jitter=True,
    max_retries=3,
)
def analyze_activate_step(self, video_id: str, user_id: str | None = None):
    """
    Step 5: ACTIVATE - Create design principles from insights.
    """
    try:
        logger.info(f"Starting ACTIVATE step for video {video_id}")

        # Get analysis record
        analysis = self.db.query(VideoAnalysis).filter(
            VideoAnalysis.video_id == UUID(video_id)
        ).first()

        if not analysis or not analysis.insights:
            raise Exception("No insights available for design principle generation")

        # Resolve BYOK API key + preferred model with balance pre-flight.
        byok_api_key, byok_model = _resolve_byok_or_raise_credits_error(
            self.db, user_id, "activate", force_refresh=False,
        )

        # Update status
        analysis.current_step = "activate"
        analysis.step_status = {**(analysis.step_status or {}), "activate": "processing"}
        self.db.commit()

        # Run activate node
        result = activate_node({
            "video_id": video_id,
            "insights": analysis.insights,
            "api_key": byok_api_key,
            "model": byok_model,
        })

        # Check for errors in node result
        if result.get("error") or result.get("design_principles") is None:
            _raise_for_node_error("design principle", result)

        # Save results
        analysis.design_principles = result.get("design_principles")
        analysis.activate_completed_at = datetime.now(timezone.utc)
        analysis.step_status = {**(analysis.step_status or {}), "activate": "completed"}
        analysis.status = "completed"
        analysis.completed_at = datetime.now(timezone.utc)

        # Get video object and update status to analyzed
        video = self.db.query(Video).filter(Video.id == UUID(video_id)).first()
        if video:
            video.status = "analyzed"

        self.db.commit()

        # Update project state - mark as completed if all videos are analyzed
        if video:
            try:
                ProjectStateService.update_project_state_for_completion(str(video.project_id), self.db)
            except Exception as project_state_error:
                logger.warning(f"Failed to update project state: {project_state_error}")

        logger.info(f"ACTIVATE step completed for video {video_id}")
        return {
            "video_id": video_id,
            "status": "success",
            "principles_count": len(result.get("design_principles", []))
        }

    except Exception as e:
        logger.error(f"ACTIVATE step failed for video {video_id}: {e}")
        _update_analysis_error(self.db, video_id, "activate", exc=e)
        raise
