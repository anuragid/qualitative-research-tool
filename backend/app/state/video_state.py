"""State machine for the ``Video`` row lifecycle.

See ``docs/production-readiness/prs/pr22-state-machine-enums.md`` for the
full design doc. The ``TRANSITIONS`` table below is the single source of
truth for which state changes are legal.

Every direct ``video.status = "..."`` write site in the codebase routes
through :meth:`VideoStateMachine.transition` — that guarantee is enforced
by the grep audit in PR #22 and by the parametrized transition tests in
``backend/tests/test_video_state_machine.py``.
"""

from __future__ import annotations

import logging
from typing import Optional

from app.models.database_models import Video
from app.state.events import VideoEvent
from app.state.exceptions import InvalidTransitionError
from app.state.statuses import VideoStatus

logger = logging.getLogger(__name__)


# (from_state, event) -> to_state
# A ``None`` ``from_state`` means "any current state" (wildcard). Specific
# entries always take precedence over the wildcard.
TRANSITIONS: dict[tuple[Optional[VideoStatus], VideoEvent], VideoStatus] = {
    # ---- Upload flow ----
    (None, VideoEvent.UPLOAD_URL_REQUESTED): VideoStatus.UPLOADING,
    (VideoStatus.UPLOADING, VideoEvent.UPLOAD_CONFIRMED): VideoStatus.UPLOADED,
    # Idempotent confirm-upload: calling confirm-upload on an already-uploaded
    # row is a no-op but must not raise (the frontend uses confirm-upload as a
    # false-negative recovery probe — see PR #20).
    (VideoStatus.UPLOADED, VideoEvent.UPLOAD_CONFIRMED): VideoStatus.UPLOADED,
    # Recovery: a previous false-negative stamped the row as ERROR; if R2
    # actually has the bytes, confirm-upload can recover it (PR #20).
    (VideoStatus.ERROR, VideoEvent.UPLOAD_CONFIRMED): VideoStatus.UPLOADED,
    # Server-side enforcement at confirm-upload: the R2 object failed the
    # size or magic-byte check, so the row is driven to ERROR with a clear
    # message and the offending object is deleted by the route. Legal from
    # every confirm-eligible source state plus an idempotent ERROR self-loop.
    (VideoStatus.UPLOADING, VideoEvent.UPLOAD_REJECTED): VideoStatus.ERROR,
    (VideoStatus.UPLOADED, VideoEvent.UPLOAD_REJECTED): VideoStatus.ERROR,
    (VideoStatus.ERROR, VideoEvent.UPLOAD_REJECTED): VideoStatus.ERROR,

    # ---- Transcription flow ----
    (VideoStatus.UPLOADED, VideoEvent.TRANSCRIBE_REQUESTED): VideoStatus.TRANSCRIBING,
    (VideoStatus.ERROR, VideoEvent.TRANSCRIBE_REQUESTED): VideoStatus.TRANSCRIBING,  # retry
    # Worker re-issues the same event after the route already flipped the
    # row — treat it as a no-op self-loop.
    (VideoStatus.TRANSCRIBING, VideoEvent.TRANSCRIBE_REQUESTED): VideoStatus.TRANSCRIBING,
    (VideoStatus.TRANSCRIBING, VideoEvent.TRANSCRIBE_SUCCEEDED): VideoStatus.TRANSCRIBED,
    (VideoStatus.TRANSCRIBING, VideoEvent.TRANSCRIBE_FAILED): VideoStatus.ERROR,
    # transcribe_video_task's except block runs before the row is promoted
    # to TRANSCRIBING if the failure is early (e.g., R2 download error):
    # allow UPLOADED -> ERROR on TRANSCRIBE_FAILED so that path still works.
    (VideoStatus.UPLOADED, VideoEvent.TRANSCRIBE_FAILED): VideoStatus.ERROR,
    # Idempotent re-fail: if the task fails twice in a row (already errored),
    # the second pass is a no-op.
    (VideoStatus.ERROR, VideoEvent.TRANSCRIBE_FAILED): VideoStatus.ERROR,

    # ---- Analysis flow ----
    # Normal dispatch from a fresh transcript.
    (VideoStatus.TRANSCRIBED, VideoEvent.ANALYZE_DISPATCHED): VideoStatus.ANALYZING,
    # Retry from an errored video.
    (VideoStatus.ERROR, VideoEvent.ANALYZE_DISPATCHED): VideoStatus.ANALYZING,
    # Re-run from completed — explicit user request to redo analysis.
    (VideoStatus.ANALYZED, VideoEvent.ANALYZE_DISPATCHED): VideoStatus.ANALYZING,
    # Self-loop: the chain's chunk step reassigns ANALYZING from inside the
    # worker even though the route already flipped it, and step-by-step retry
    # routes re-fire the event while the row is already ANALYZING. Both
    # are idempotent.
    (VideoStatus.ANALYZING, VideoEvent.ANALYZE_DISPATCHED): VideoStatus.ANALYZING,

    (VideoStatus.ANALYZING, VideoEvent.CHAIN_SUCCEEDED): VideoStatus.ANALYZED,
    (VideoStatus.ANALYZING, VideoEvent.CHAIN_FAILED): VideoStatus.ERROR,
    # Idempotent: handle_pipeline_error is the chain's .on_error callback and
    # may run after a per-step except block already marked the row errored.
    (VideoStatus.ERROR, VideoEvent.CHAIN_FAILED): VideoStatus.ERROR,

    # ---- Watchdog cleanup ----
    (VideoStatus.ANALYZING, VideoEvent.WATCHDOG_TIMEOUT): VideoStatus.ERROR,
    (VideoStatus.TRANSCRIBING, VideoEvent.WATCHDOG_TIMEOUT): VideoStatus.ERROR,
    # Orphan fix: row was stuck in ANALYZING but the linked VideoAnalysis
    # actually completed — flip to ANALYZED instead of erroring.
    (VideoStatus.ANALYZING, VideoEvent.WATCHDOG_CLEANUP): VideoStatus.ANALYZED,
}


class VideoStateMachine:
    """State machine for :class:`Video` rows."""

    @staticmethod
    def transition(
        video: Video,
        event: VideoEvent,
        *,
        db=None,  # noqa: ANN001 - Session type omitted to keep this import-light
        error_message: Optional[str] = None,
    ) -> VideoStatus:
        """Atomically transition ``video`` given the current state and ``event``.

        Does NOT commit — the caller owns the transaction so side effects
        can be batched with other writes (e.g., the retry-reset block in
        ``/analyze`` writes both the video state and a VideoAnalysis reset
        in the same transaction).

        Args:
            video: The video row to mutate.
            event: The triggering event.
            db: Unused; kept as a keyword for symmetry with other state
                machines and to give us an extension point for future
                breadcrumb/audit logging.
            error_message: Optional error payload. Stamped onto
                ``video.error_message`` for the fail-type events
                (TRANSCRIBE_FAILED, CHAIN_FAILED, WATCHDOG_TIMEOUT). For
                happy-path events that clear errors
                (UPLOAD_CONFIRMED, TRANSCRIBE_REQUESTED, ANALYZE_DISPATCHED,
                TRANSCRIBE_SUCCEEDED), ``error_message`` is ignored and
                ``video.error_message`` is cleared.

        Returns:
            The new :class:`VideoStatus` (also written to ``video.status``).

        Raises:
            InvalidTransitionError: if the transition is not in the table.
        """
        del db  # reserved for future use

        from_state = VideoStatus(video.status) if video.status else None

        key_specific = (from_state, event)
        key_wildcard = (None, event)
        if key_specific in TRANSITIONS:
            to_state = TRANSITIONS[key_specific]
        elif key_wildcard in TRANSITIONS:
            to_state = TRANSITIONS[key_wildcard]
        else:
            allowed_from = [
                k[0] for k in TRANSITIONS if k[1] == event and k[0] is not None
            ]
            raise InvalidTransitionError(
                entity_type="Video",
                entity_id=str(video.id),
                from_state=from_state,
                event=event,
                allowed_from=allowed_from,
            )

        video.status = to_state.value

        # ---- Side effects ----
        # Events that imply success / new attempt clear any stale error.
        if event in (
            VideoEvent.UPLOAD_CONFIRMED,
            VideoEvent.TRANSCRIBE_REQUESTED,
            VideoEvent.TRANSCRIBE_SUCCEEDED,
            VideoEvent.ANALYZE_DISPATCHED,
            VideoEvent.CHAIN_SUCCEEDED,
            VideoEvent.WATCHDOG_CLEANUP,
        ):
            video.error_message = None

        # Events that imply failure stamp the provided message (if any) onto
        # the row. Callers that don't pass ``error_message`` keep whatever
        # was already there — existing behaviour in pipeline_errors /
        # analysis_steps (which write ``error_message`` directly before
        # calling the state machine).
        if event in (
            VideoEvent.TRANSCRIBE_FAILED,
            VideoEvent.CHAIN_FAILED,
            VideoEvent.WATCHDOG_TIMEOUT,
            VideoEvent.UPLOAD_REJECTED,
        ):
            if error_message is not None:
                video.error_message = error_message

        logger.debug(
            "VideoStateMachine: %s(%s) %s -> %s via %s",
            "Video",
            video.id,
            from_state,
            to_state,
            event,
        )
        return to_state
