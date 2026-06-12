"""Tests for ``VideoStateMachine`` — transition table + side effects.

The parametrized ``test_every_allowed_transition`` iterates over every
entry in ``VIDEO_TRANSITIONS`` so that any future edit to the transition
table has to either add or delete a test row. Combined with the explicit
happy-path and error-path tests below, this prevents the class of bug
that caused Bug B (the ``ready``-gate trap, 2026-04-07).
"""

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

from app.models.database_models import Video  # noqa: E402
from app.state import (  # noqa: E402
    VIDEO_TRANSITIONS,
    InvalidTransitionError,
    VideoEvent,
    VideoStateMachine,
    VideoStatus,
)


def _make_video(status: str | None, error_message: str | None = "old error") -> Video:
    """Build an in-memory Video row — no DB commit needed."""
    v = Video(
        id=uuid.uuid4(),
        project_id=uuid.uuid4(),
        filename="test.mp4",
        s3_key="videos/test.mp4",
        s3_url="https://test/test.mp4",
        status=status,
        error_message=error_message,
    )
    return v


# ---------------------------------------------------------------------------
# Parametrized coverage of the full transition table
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "from_state,event,to_state",
    [
        (from_state, event, to_state)
        for (from_state, event), to_state in VIDEO_TRANSITIONS.items()
        if from_state is not None  # skip wildcard None entries
    ],
    ids=lambda v: str(v),
)
def test_every_allowed_transition(from_state: VideoStatus, event: VideoEvent, to_state: VideoStatus) -> None:
    video = _make_video(status=from_state.value)
    result = VideoStateMachine.transition(video, event)
    assert result is to_state
    assert video.status == to_state.value


@pytest.mark.parametrize(
    "event",
    [event for (from_state, event) in VIDEO_TRANSITIONS if from_state is None],
)
def test_wildcard_transitions_apply_to_none_initial_state(event: VideoEvent) -> None:
    video = _make_video(status=None, error_message=None)
    result = VideoStateMachine.transition(video, event)
    assert result.value == video.status


# ---------------------------------------------------------------------------
# Happy path: upload -> uploaded -> transcribing -> transcribed -> analyzing -> analyzed
# ---------------------------------------------------------------------------


def test_happy_path_upload_to_analyzed() -> None:
    video = _make_video(status=None)
    VideoStateMachine.transition(video, VideoEvent.UPLOAD_URL_REQUESTED)
    assert video.status == VideoStatus.UPLOADING.value

    VideoStateMachine.transition(video, VideoEvent.UPLOAD_CONFIRMED)
    assert video.status == VideoStatus.UPLOADED.value
    assert video.error_message is None  # side effect: cleared on happy-path events

    VideoStateMachine.transition(video, VideoEvent.TRANSCRIBE_REQUESTED)
    assert video.status == VideoStatus.TRANSCRIBING.value

    VideoStateMachine.transition(video, VideoEvent.TRANSCRIBE_SUCCEEDED)
    assert video.status == VideoStatus.TRANSCRIBED.value

    VideoStateMachine.transition(video, VideoEvent.ANALYZE_DISPATCHED)
    assert video.status == VideoStatus.ANALYZING.value

    VideoStateMachine.transition(video, VideoEvent.CHAIN_SUCCEEDED)
    assert video.status == VideoStatus.ANALYZED.value


# ---------------------------------------------------------------------------
# Illegal transitions must raise
# ---------------------------------------------------------------------------


def test_illegal_uploading_to_analyzing_raises() -> None:
    video = _make_video(status=VideoStatus.UPLOADING.value)
    with pytest.raises(InvalidTransitionError) as exc:
        VideoStateMachine.transition(video, VideoEvent.ANALYZE_DISPATCHED)
    assert "uploading" in str(exc.value).lower()


def test_illegal_uploaded_to_chain_succeeded_raises() -> None:
    video = _make_video(status=VideoStatus.UPLOADED.value)
    with pytest.raises(InvalidTransitionError):
        VideoStateMachine.transition(video, VideoEvent.CHAIN_SUCCEEDED)


def test_illegal_analyzed_to_transcribe_succeeded_raises() -> None:
    video = _make_video(status=VideoStatus.ANALYZED.value)
    with pytest.raises(InvalidTransitionError):
        VideoStateMachine.transition(video, VideoEvent.TRANSCRIBE_SUCCEEDED)


# ---------------------------------------------------------------------------
# Side effects: error_message handling
# ---------------------------------------------------------------------------


def test_happy_path_events_clear_error_message() -> None:
    video = _make_video(status=VideoStatus.ERROR.value, error_message="prior failure")
    VideoStateMachine.transition(video, VideoEvent.ANALYZE_DISPATCHED)
    assert video.error_message is None


def test_transcribe_requested_clears_error_message() -> None:
    video = _make_video(status=VideoStatus.ERROR.value, error_message="stale")
    VideoStateMachine.transition(video, VideoEvent.TRANSCRIBE_REQUESTED)
    assert video.status == VideoStatus.TRANSCRIBING.value
    assert video.error_message is None


def test_watchdog_cleanup_clears_error_message() -> None:
    video = _make_video(status=VideoStatus.ANALYZING.value, error_message="stale")
    VideoStateMachine.transition(video, VideoEvent.WATCHDOG_CLEANUP)
    assert video.status == VideoStatus.ANALYZED.value
    assert video.error_message is None


def test_chain_failed_sets_error_message_when_provided() -> None:
    video = _make_video(status=VideoStatus.ANALYZING.value, error_message=None)
    VideoStateMachine.transition(
        video,
        VideoEvent.CHAIN_FAILED,
        error_message="new failure payload",
    )
    assert video.status == VideoStatus.ERROR.value
    assert video.error_message == "new failure payload"


def test_chain_failed_preserves_existing_error_message_when_not_provided() -> None:
    """Callers that pre-stamp ``error_message`` and then call the state
    machine without passing a new message should keep the pre-stamp."""
    video = _make_video(status=VideoStatus.ANALYZING.value, error_message="pre-stamped")
    VideoStateMachine.transition(video, VideoEvent.CHAIN_FAILED)
    assert video.status == VideoStatus.ERROR.value
    assert video.error_message == "pre-stamped"


def test_watchdog_timeout_sets_error_message() -> None:
    video = _make_video(status=VideoStatus.ANALYZING.value, error_message=None)
    VideoStateMachine.transition(
        video,
        VideoEvent.WATCHDOG_TIMEOUT,
        error_message="timeout json",
    )
    assert video.status == VideoStatus.ERROR.value
    assert video.error_message == "timeout json"


def test_upload_rejected_drives_to_error_with_message() -> None:
    """confirm-upload server-side validation failure: drive the row to ERROR
    and stamp the rejection reason so the UI can show why the upload failed."""
    video = _make_video(status=VideoStatus.UPLOADING.value, error_message=None)
    VideoStateMachine.transition(
        video,
        VideoEvent.UPLOAD_REJECTED,
        error_message="Uploaded file is too large",
    )
    assert video.status == VideoStatus.ERROR.value
    assert video.error_message == "Uploaded file is too large"


def test_upload_rejected_from_error_is_idempotent() -> None:
    """A re-confirm probe on an already-rejected (ERROR) row re-rejects as a
    no-op self-loop rather than raising."""
    video = _make_video(status=VideoStatus.ERROR.value, error_message="prev reject")
    VideoStateMachine.transition(
        video, VideoEvent.UPLOAD_REJECTED, error_message="still too large"
    )
    assert video.status == VideoStatus.ERROR.value
    assert video.error_message == "still too large"


# ---------------------------------------------------------------------------
# Retry and idempotency
# ---------------------------------------------------------------------------


def test_retry_transcribe_from_error_allowed() -> None:
    video = _make_video(status=VideoStatus.ERROR.value, error_message="prev")
    VideoStateMachine.transition(video, VideoEvent.TRANSCRIBE_REQUESTED)
    assert video.status == VideoStatus.TRANSCRIBING.value
    assert video.error_message is None


def test_retry_analyze_from_analyzed_allowed() -> None:
    """Re-running analysis on an already-analyzed video is allowed."""
    video = _make_video(status=VideoStatus.ANALYZED.value)
    VideoStateMachine.transition(video, VideoEvent.ANALYZE_DISPATCHED)
    assert video.status == VideoStatus.ANALYZING.value


def test_self_loop_analyze_from_analyzing_is_idempotent() -> None:
    """Chain's chunk step re-fires ANALYZE_DISPATCHED from inside the worker."""
    video = _make_video(status=VideoStatus.ANALYZING.value)
    VideoStateMachine.transition(video, VideoEvent.ANALYZE_DISPATCHED)
    assert video.status == VideoStatus.ANALYZING.value


def test_confirm_upload_is_idempotent() -> None:
    video = _make_video(status=VideoStatus.UPLOADED.value, error_message=None)
    VideoStateMachine.transition(video, VideoEvent.UPLOAD_CONFIRMED)
    assert video.status == VideoStatus.UPLOADED.value


def test_confirm_upload_recovers_from_error() -> None:
    """PR #20 false-negative recovery: a previously-errored row can be
    reconfirmed if R2 actually has the bytes."""
    video = _make_video(status=VideoStatus.ERROR.value, error_message="xhr failed")
    VideoStateMachine.transition(video, VideoEvent.UPLOAD_CONFIRMED)
    assert video.status == VideoStatus.UPLOADED.value
    assert video.error_message is None
