"""State machine for the ``Transcript`` row lifecycle."""

from __future__ import annotations

import logging
from typing import Optional

from app.models.database_models import Transcript
from app.state.events import TranscriptEvent
from app.state.exceptions import InvalidTransitionError
from app.state.statuses import TranscriptStatus

logger = logging.getLogger(__name__)


# (from_state, event) -> to_state
TRANSITIONS: dict[
    tuple[Optional[TranscriptStatus], TranscriptEvent], TranscriptStatus
] = {
    # Creation: /transcribe route inserts a fresh pending row.
    (None, TranscriptEvent.ROW_CREATED): TranscriptStatus.PENDING,
    # Retry: /transcribe also resets an existing row back to pending, and
    # the worker then re-promotes it to processing.
    (TranscriptStatus.ERROR, TranscriptEvent.ROW_CREATED): TranscriptStatus.PENDING,
    (TranscriptStatus.PENDING, TranscriptEvent.ROW_CREATED): TranscriptStatus.PENDING,
    (TranscriptStatus.PROCESSING, TranscriptEvent.ROW_CREATED): TranscriptStatus.PENDING,

    # Worker starts: transcribe_video_task promotes pending -> processing.
    (TranscriptStatus.PENDING, TranscriptEvent.TRANSCRIBE_STARTED): TranscriptStatus.PROCESSING,
    # Self-loop when a retrying worker re-issues the event.
    (TranscriptStatus.PROCESSING, TranscriptEvent.TRANSCRIBE_STARTED): TranscriptStatus.PROCESSING,

    # Worker finishes.
    (TranscriptStatus.PROCESSING, TranscriptEvent.TRANSCRIBE_SUCCEEDED): TranscriptStatus.COMPLETED,

    # Worker fails.
    (TranscriptStatus.PROCESSING, TranscriptEvent.TRANSCRIBE_FAILED): TranscriptStatus.ERROR,
    # transcribe_video_task's early-failure path may fire before the row was
    # flipped to processing — allow pending -> error as well.
    (TranscriptStatus.PENDING, TranscriptEvent.TRANSCRIBE_FAILED): TranscriptStatus.ERROR,
    # Idempotent: double-failure during cleanup is a no-op.
    (TranscriptStatus.ERROR, TranscriptEvent.TRANSCRIBE_FAILED): TranscriptStatus.ERROR,

    # Watchdog timeout.
    (TranscriptStatus.PROCESSING, TranscriptEvent.WATCHDOG_TIMEOUT): TranscriptStatus.ERROR,
}


class TranscriptStateMachine:
    """State machine for :class:`Transcript` rows."""

    @staticmethod
    def transition(
        transcript: Transcript,
        event: TranscriptEvent,
        *,
        db=None,  # noqa: ANN001
    ) -> TranscriptStatus:
        """Transition ``transcript`` for ``event``. Does not commit."""
        del db

        from_state = (
            TranscriptStatus(transcript.status) if transcript.status else None
        )

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
                entity_type="Transcript",
                entity_id=str(getattr(transcript, "id", "new")),
                from_state=from_state,
                event=event,
                allowed_from=allowed_from,
            )

        transcript.status = to_state.value
        logger.debug(
            "TranscriptStateMachine: Transcript(%s) %s -> %s via %s",
            getattr(transcript, "id", "new"),
            from_state,
            to_state,
            event,
        )
        return to_state
