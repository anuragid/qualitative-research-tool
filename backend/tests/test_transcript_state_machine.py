"""Tests for ``TranscriptStateMachine``."""

from __future__ import annotations

import os
import uuid

import pytest

os.environ.setdefault("APP_ENV", "development")
os.environ.setdefault("DEBUG", "false")
os.environ.setdefault("DATABASE_URL", "sqlite:///test.db")
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/0")
os.environ.setdefault("CLERK_SECRET_KEY", "sk_test_fake")
os.environ.setdefault("CLERK_PUBLISHABLE_KEY", "pk_test_dGVzdC5jbGVyay5hY2NvdW50cy5kZXYk")
os.environ.setdefault("R2_ACCESS_KEY_ID", "test_access_key")
os.environ.setdefault("R2_SECRET_ACCESS_KEY", "test_secret_key")
os.environ.setdefault("R2_ENDPOINT_URL", "https://fake.r2.cloudflarestorage.com")
os.environ.setdefault("R2_BUCKET_NAME", "test-bucket")
os.environ.setdefault("OPENROUTER_API_KEY", "test-openrouter-key")
os.environ.setdefault("ASSEMBLYAI_API_KEY", "test-assemblyai-key")
os.environ.setdefault("ENCRYPTION_KEY", "9px3YGa-Z2bljdtUKpLhqzl9IaGdf2RgrCI-zOTrUug=")

from app.models.database_models import Transcript  # noqa: E402
from app.state import (  # noqa: E402
    TRANSCRIPT_TRANSITIONS,
    InvalidTransitionError,
    TranscriptEvent,
    TranscriptStateMachine,
    TranscriptStatus,
)


def _make_transcript(status: str | None) -> Transcript:
    return Transcript(id=uuid.uuid4(), video_id=uuid.uuid4(), status=status)


@pytest.mark.parametrize(
    "from_state,event,to_state",
    [
        (from_state, event, to_state)
        for (from_state, event), to_state in TRANSCRIPT_TRANSITIONS.items()
        if from_state is not None
    ],
    ids=lambda v: str(v),
)
def test_every_allowed_transition(
    from_state: TranscriptStatus, event: TranscriptEvent, to_state: TranscriptStatus
) -> None:
    t = _make_transcript(status=from_state.value)
    result = TranscriptStateMachine.transition(t, event)
    assert result is to_state
    assert t.status == to_state.value


def test_row_created_from_none() -> None:
    t = _make_transcript(status=None)
    TranscriptStateMachine.transition(t, TranscriptEvent.ROW_CREATED)
    assert t.status == TranscriptStatus.PENDING.value


def test_happy_path_pending_to_completed() -> None:
    t = _make_transcript(status=None)
    TranscriptStateMachine.transition(t, TranscriptEvent.ROW_CREATED)
    TranscriptStateMachine.transition(t, TranscriptEvent.TRANSCRIBE_STARTED)
    assert t.status == TranscriptStatus.PROCESSING.value
    TranscriptStateMachine.transition(t, TranscriptEvent.TRANSCRIBE_SUCCEEDED)
    assert t.status == TranscriptStatus.COMPLETED.value


def test_retry_reset_back_to_pending() -> None:
    """Transcribe route resets an errored transcript via ROW_CREATED."""
    t = _make_transcript(status=TranscriptStatus.ERROR.value)
    TranscriptStateMachine.transition(t, TranscriptEvent.ROW_CREATED)
    assert t.status == TranscriptStatus.PENDING.value


def test_illegal_completed_to_processing_raises() -> None:
    t = _make_transcript(status=TranscriptStatus.COMPLETED.value)
    with pytest.raises(InvalidTransitionError):
        TranscriptStateMachine.transition(t, TranscriptEvent.TRANSCRIBE_STARTED)


def test_pending_to_error_early_failure() -> None:
    """transcribe_video_task can fail before promoting to processing."""
    t = _make_transcript(status=TranscriptStatus.PENDING.value)
    TranscriptStateMachine.transition(t, TranscriptEvent.TRANSCRIBE_FAILED)
    assert t.status == TranscriptStatus.ERROR.value


def test_watchdog_timeout_from_processing() -> None:
    t = _make_transcript(status=TranscriptStatus.PROCESSING.value)
    TranscriptStateMachine.transition(t, TranscriptEvent.WATCHDOG_TIMEOUT)
    assert t.status == TranscriptStatus.ERROR.value
