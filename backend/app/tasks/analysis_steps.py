"""Separate Celery tasks for step-by-step analysis."""

import json
import logging
from datetime import datetime, timezone
from typing import Any, Dict
from uuid import UUID

import sentry_sdk
from sqlalchemy.exc import OperationalError
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
from app.state import (
    InvalidTransitionError,
    VideoAnalysisEvent,
    VideoAnalysisStateMachine,
    VideoEvent,
    VideoStateMachine,
)
from app.tasks.base import DatabaseTask
from app.tasks.celery_app import celery_app
from app.utils.error_classification import (
    ERROR_TYPE_INSUFFICIENT_CREDITS,
    is_retryable,
)

logger = logging.getLogger(__name__)


# Monotonic rank for per-step ``step_status`` values. A step can only ever move
# FORWARD through these ranks; an update is dropped if it would move a key
# backward. ``completed`` and ``error`` are both terminal (rank 2): a step that
# has reached either must never be silently bounced back to ``processing`` /
# ``pending`` by a stale, re-delivered earlier-step write. An unknown value is
# treated as the lowest rank so a real, known state always wins over garbage.
_STEP_STATUS_RANK = {
    "pending": 0,
    "processing": 1,
    "completed": 2,
    "error": 2,
}


def _step_status_rank(value: Any) -> int:
    return _STEP_STATUS_RANK.get(value, -1)


def _merge_step_status(
    current: Dict[str, str] | None,
    updates: Dict[str, str],
) -> Dict[str, str]:
    """Monotonically merge ``updates`` into ``current`` step_status.

    For each key in ``updates`` the new value is applied ONLY if its rank is
    ``>=`` the existing value's rank (see ``_STEP_STATUS_RANK``). This makes
    every step_status write idempotent and forward-only, so a re-delivered
    earlier step (Celery ``acks_late`` + ``visibility_timeout`` re-running the
    chain's first link while the original is still in flight) can never
    DOWNGRADE a later step that already advanced.

    Concretely, the production bug this fixes: the re-delivered
    ``analyze_chunk_step`` applied a whole-map reset
    ``{chunk:"processing", infer:"pending", ...}`` that clobbered
    ``explain``/``activate`` rows already ``"completed"``, persisting an
    impossible map (chain order is chunk -> infer -> relate -> explain ->
    activate) that the frontend rendered as a step stuck "processing" forever.
    Routed through this helper, that same reset becomes a no-op for any step
    that already moved on, while still SEEDING never-run keys.

    Returns a NEW dict (does not mutate ``current`` or ``updates``), preserving
    the whole-dict-reassignment pattern the step tasks rely on for SQLAlchemy
    JSONB change-tracking.

    NOTE: This is deliberately NOT used by the explicit retry-from-error reset
    in ``routes/videos.py`` — that is a user-initiated, row-locked, TRUE reset
    of the whole row and must clear step_status to ``{}`` outright.
    """
    merged: Dict[str, str] = dict(current or {})
    for key, new_value in updates.items():
        if _step_status_rank(new_value) >= _step_status_rank(merged.get(key)):
            merged[key] = new_value
    return merged


def _check_cancellation(db: Session, video_id: str, require_existing: bool = True) -> bool:
    """Return True if the analysis should stop (watchdog error, row gone).

    Called at the start of every step task in the chain so a halted
    pipeline doesn't do redundant work on subsequent links.

    Args:
        db: SQLAlchemy session.
        video_id: Video UUID string.
        require_existing: When True (default), a missing VideoAnalysis row
            is treated as cancelled (the chain cannot make progress without
            it). When False, a missing row is treated as "not cancelled" —
            used by analyze_chunk_step, which is the first chain link and
            is responsible for creating the row if it doesn't yet exist.

    Raises:
        OperationalError: A transient DB outage (connection lost/refused)
            is *not* swallowed. Returning False here would let the step
            proceed and burn an LLM call (and BYOK credits) on work that
            may already be cancelled. Re-raising lets the task's
            ``autoretry_for=(Exception,)`` decorator retry the precheck with
            bounded backoff (``max_retries=3``) until the DB recovers, at
            which point we read the real cancellation state. A *missing*
            row is a clean signal (handled via ``require_existing``), not an
            error — only genuine query failures propagate.
    """
    try:
        db.expire_all()
        analysis = db.query(VideoAnalysis).filter(
            VideoAnalysis.video_id == UUID(video_id)
        ).first()
        if analysis is None:
            return require_existing
        if analysis.status == "error":
            return True
        return False
    except OperationalError:
        # Transient DB outage — surface it so Celery autoretries instead of
        # guessing "not cancelled" and proceeding to burn an LLM call.
        try:
            db.rollback()
        except Exception:
            pass
        logger.warning(
            "_check_cancellation: transient DB error for %s — re-raising "
            "for autoretry",
            video_id,
        )
        raise


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
            current_step="chunk",
            step_status={}
        )
        # Route the initial status write through the state machine so the
        # transition table owns the (None -> PENDING) edge.
        VideoAnalysisStateMachine.transition(
            analysis, VideoAnalysisEvent.ROW_CREATED, db=db
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

    Mirrors the structured error_message shape the analysis pipeline emits
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


def _is_retryable_step_exc(exc: Exception | None) -> bool:
    """Decide whether the exception that ended a step will be *autoretried*
    by Celery (``autoretry_for=(Exception,)``) rather than failing the chain.

    Non-retryable failures (``NonRetryableAnalysisError`` and its
    ``InsufficientCreditsNonRetryable`` subclass) are excluded from autoretry
    via ``dont_autoretry_for`` — for those the row should be stamped ``error``
    immediately so the user sees the failure without waiting for the watchdog.

    Every *other* exception that reaches a step's ``except`` block (a retryable
    node error, a transient ``OperationalError``, an unexpected bug) WILL be
    re-run by Celery on the same task. For those we must NOT stamp ``error``:
    the in-progress row has to stay ``processing`` so the retried attempt's
    cancellation precheck (which short-circuits on ``status == "error"``) does
    not swallow it. The chain's terminal ``.on_error`` handler stamps ``error``
    once retries are truly exhausted, and the watchdog is the final backstop.
    """
    return not isinstance(exc, NonRetryableAnalysisError)


def _handle_step_failure(
    db: Session,
    video_id: str,
    step_name: str,
    exc: Exception | None = None,
):
    """Single failure-policy entry point for the 5 per-video step ``except``
    blocks.

    - Retryable failure -> discard the dirty partial transaction (rollback)
      and leave the row ``processing`` so Celery's autoretry can re-run the
      step's node and finish. Stamping ``error`` here would make the retry's
      cancellation precheck skip the step, turning a transient hiccup into a
      permanent error (the bug this PR fixes).
    - Non-retryable failure -> stamp the row ``error`` immediately via
      :func:`_update_analysis_error` (unchanged behaviour, incl. the BYOK
      0-balance structured payload).

    Centralised so the retryable/non-retryable policy lives in ONE place
    instead of being duplicated across the five step bodies.
    """
    if _is_retryable_step_exc(exc):
        # Retryable: just clean the session so the connection is returned to
        # the pool uncorrupted. The row stays ``processing`` for the retry.
        try:
            db.rollback()
        except Exception:
            logger.warning(
                "Rollback after retryable %s failure for %s failed; "
                "session will be reset by the task lifecycle",
                step_name,
                video_id,
                exc_info=True,
            )
        return
    _update_analysis_error(db, video_id, step_name, exc=exc)


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

    Raises:
        Exception: If writing the *error state itself* fails (e.g. the
            commit raises because the DB is still down), the failure is
            **not** swallowed. Previously a bare ``pass`` here meant the row
            stayed ``processing`` with no reason until the watchdog reset it
            ~17 min later. We now log, capture to Sentry, roll back, and
            re-raise so the failure surfaces to Celery's autoretry / the
            chain's ``.on_error`` handler within the same attempt.

            This is loop-safe: ``_update_analysis_error`` is only ever
            called from a step task's ``except Exception as e`` block and
            never recursively (nor from ``handle_pipeline_error``). The
            re-raise therefore replaces the pending ``raise`` in the caller
            and surfaces *exactly once* — the next Celery attempt re-runs
            the step fresh rather than re-entering this writer.
    """
    try:
        db.rollback()
        analysis = db.query(VideoAnalysis).filter(
            VideoAnalysis.video_id == UUID(video_id)
        ).first()
        if analysis and analysis.status != "error":
            try:
                VideoAnalysisStateMachine.transition(
                    analysis, VideoAnalysisEvent.CHAIN_FAILED, db=db
                )
            except InvalidTransitionError as exc_trans:
                logger.warning(
                    f"_update_analysis_error: invalid VideoAnalysis "
                    f"transition for {video_id}: {exc_trans}"
                )
        if analysis:
            analysis.step_status = _merge_step_status(
                analysis.step_status, {step_name: "error"}
            )

        # Stamp structured error_type for the BYOK 0-balance case so the
        # frontend can render the dedicated "Add credits" alert. This must
        # happen BEFORE the video state transition so the error_message is
        # carried into it (the state machine preserves a pre-stamped
        # error_message when no explicit one is passed).
        video = db.query(Video).filter(Video.id == UUID(video_id)).first()
        credits_error_json: str | None = None
        if video is not None and isinstance(exc, InsufficientCreditsNonRetryable):
            credits_error_json = _build_insufficient_credits_error_json(step_name, exc)

        # Also reset video status from "analyzing" so it's not stuck.
        if video and video.status == "analyzing":
            try:
                VideoStateMachine.transition(
                    video,
                    VideoEvent.CHAIN_FAILED,
                    db=db,
                    error_message=credits_error_json,
                )
            except InvalidTransitionError as exc_trans:
                logger.warning(
                    f"_update_analysis_error: invalid Video transition "
                    f"for {video_id}: {exc_trans}"
                )

        db.commit()
    except Exception as commit_error:
        logger.error(
            f"Failed to update error status for {step_name}: {commit_error}",
            exc_info=True,
        )
        # Capture explicitly: if the error-state write itself fails, this is
        # the only place that knows the row is now stuck. The re-raise below
        # would reach Celery's Sentry integration anyway, but we report here
        # too so the failure is never lost if a caller later swallows it.
        sentry_sdk.capture_exception(commit_error)
        try:
            db.rollback()
        except Exception:
            pass
        # Surface the failure instead of swallowing it — see the docstring's
        # loop-safety note. The original step exception is preserved as the
        # __context__ of this one.
        raise


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

    Also responsible for chain-start state transitions: create or reset
    the VideoAnalysis row, mark all steps pending, set status=processing,
    clear any previous error_message on the Video. This logic moved out
    of the route handler into this first chain link as part of the WS3
    chain refactor so the route stays a pure dispatcher.
    """
    try:
        logger.info(f"Starting CHUNK step for video {video_id}")

        # Cancellation precheck — watchdog or prior halted step. First
        # chain link: tolerate missing VideoAnalysis row (we'll create it
        # below via get_video_analysis_state).
        if _check_cancellation(self.db, video_id, require_existing=False):
            logger.info(f"Skipping chunk for {video_id} — already in error state")
            return {"video_id": video_id, "status": "skipped"}

        # Get state from database (also creates VideoAnalysis row if missing)
        state = get_video_analysis_state(self.db, UUID(video_id))
        analysis = state["analysis"]

        # Resolve BYOK API key + preferred model and pre-flight the
        # OpenRouter balance. ``force_refresh=True`` ensures the very
        # first step in the pipeline always sees a live balance number,
        # not a 60s-stale cache. Subsequent steps reuse the cached value.
        byok_api_key, byok_model = _resolve_byok_or_raise_credits_error(
            self.db, user_id, "chunk", force_refresh=True,
        )

        # Chain-start transitions — previously done in the route handler.
        # CHAIN_STARTED: pending -> processing (or processing -> processing
        # if the chunk step is idempotently re-running).
        VideoAnalysisStateMachine.transition(
            analysis, VideoAnalysisEvent.CHAIN_STARTED, db=self.db
        )
        analysis.current_step = "chunk"
        # MONOTONIC reset: seed the five keys via _merge_step_status so a
        # RE-DELIVERED chunk task (Celery acks_late + visibility_timeout
        # re-running this first link while the original is still in flight)
        # only fills in never-run keys and marks chunk processing — it can NEVER
        # pull a downstream step that already advanced (e.g. an explain/activate
        # already "completed") back to "pending"/"processing". On a genuinely
        # fresh row every key is missing, so this seeds the full pending map.
        # The deliberate retry-from-error reset (routes/videos.py, row-locked)
        # is a separate TRUE reset and does NOT go through this merge.
        analysis.step_status = _merge_step_status(
            analysis.step_status,
            {
                "chunk": "processing",
                "infer": "pending",
                "relate": "pending",
                "explain": "pending",
                "activate": "pending",
            },
        )
        analysis.started_at = datetime.now(timezone.utc)

        # Mark the video as analyzing and clear any previous error. The
        # route-level handler has usually already done this, but the
        # ANALYZING -> ANALYZING self-loop in the transition table keeps
        # this call idempotent.
        video = self.db.query(Video).filter(Video.id == UUID(video_id)).first()
        if video:
            VideoStateMachine.transition(
                video, VideoEvent.ANALYZE_DISPATCHED, db=self.db
            )
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
        analysis.step_status = _merge_step_status(
            analysis.step_status, {"chunk": "completed"}
        )
        self.db.commit()

        logger.info(f"CHUNK step completed for video {video_id}")
        return {
            "video_id": video_id,
            "status": "success",
            "chunks_count": len(result.get("chunks", []))
        }

    except Exception as e:
        logger.error(f"CHUNK step failed for video {video_id}: {e}")
        _handle_step_failure(self.db, video_id, "chunk", exc=e)
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

        # Cancellation precheck — watchdog or prior halted step
        if _check_cancellation(self.db, video_id):
            logger.info(f"Skipping infer for {video_id} — already in error state")
            return {"video_id": video_id, "status": "skipped"}

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
        analysis.step_status = _merge_step_status(
            analysis.step_status, {"infer": "processing"}
        )
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
        analysis.step_status = _merge_step_status(
            analysis.step_status, {"infer": "completed"}
        )
        self.db.commit()

        logger.info(f"INFER step completed for video {video_id}")
        return {
            "video_id": video_id,
            "status": "success",
            "inferences_count": len(result.get("inferences", []))
        }

    except Exception as e:
        logger.error(f"INFER step failed for video {video_id}: {e}")
        _handle_step_failure(self.db, video_id, "infer", exc=e)
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

        # Cancellation precheck — watchdog or prior halted step
        if _check_cancellation(self.db, video_id):
            logger.info(f"Skipping relate for {video_id} — already in error state")
            return {"video_id": video_id, "status": "skipped"}

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
        analysis.step_status = _merge_step_status(
            analysis.step_status, {"relate": "processing"}
        )
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
        analysis.step_status = _merge_step_status(
            analysis.step_status, {"relate": "completed"}
        )
        self.db.commit()

        logger.info(f"RELATE step completed for video {video_id}")
        return {
            "video_id": video_id,
            "status": "success",
            "patterns_count": len(result.get("patterns", []))
        }

    except Exception as e:
        logger.error(f"RELATE step failed for video {video_id}: {e}")
        _handle_step_failure(self.db, video_id, "relate", exc=e)
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

        # Cancellation precheck — watchdog or prior halted step
        if _check_cancellation(self.db, video_id):
            logger.info(f"Skipping explain for {video_id} — already in error state")
            return {"video_id": video_id, "status": "skipped"}

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
        analysis.step_status = _merge_step_status(
            analysis.step_status, {"explain": "processing"}
        )
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
        analysis.step_status = _merge_step_status(
            analysis.step_status, {"explain": "completed"}
        )
        self.db.commit()

        logger.info(f"EXPLAIN step completed for video {video_id}")
        return {
            "video_id": video_id,
            "status": "success",
            "insights_count": len(result.get("insights", []))
        }

    except Exception as e:
        logger.error(f"EXPLAIN step failed for video {video_id}: {e}")
        _handle_step_failure(self.db, video_id, "explain", exc=e)
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

        # Cancellation precheck — watchdog or prior halted step
        if _check_cancellation(self.db, video_id):
            logger.info(f"Skipping activate for {video_id} — already in error state")
            return {"video_id": video_id, "status": "skipped"}

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
        analysis.step_status = _merge_step_status(
            analysis.step_status, {"activate": "processing"}
        )
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
        analysis.step_status = _merge_step_status(
            analysis.step_status, {"activate": "completed"}
        )
        # CHAIN_SUCCEEDED: processing -> completed
        VideoAnalysisStateMachine.transition(
            analysis, VideoAnalysisEvent.CHAIN_SUCCEEDED, db=self.db
        )
        analysis.completed_at = datetime.now(timezone.utc)

        # Get video object and update status to analyzed
        video = self.db.query(Video).filter(Video.id == UUID(video_id)).first()
        if video:
            # CHAIN_SUCCEEDED: analyzing -> analyzed
            VideoStateMachine.transition(
                video, VideoEvent.CHAIN_SUCCEEDED, db=self.db
            )

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
        _handle_step_failure(self.db, video_id, "activate", exc=e)
        raise
