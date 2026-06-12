"""Tests for ``VideoAnalysisStateMachine`` and ``ProjectAnalysisStateMachine``."""

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

from app.models.database_models import ProjectAnalysis, VideoAnalysis  # noqa: E402
from app.state import (  # noqa: E402
    PROJECT_ANALYSIS_TRANSITIONS,
    VIDEO_ANALYSIS_TRANSITIONS,
    InvalidTransitionError,
    ProjectAnalysisEvent,
    ProjectAnalysisStateMachine,
    VideoAnalysisEvent,
    VideoAnalysisStateMachine,
    VideoAnalysisStatus,
)


def _make_va(status: str | None) -> VideoAnalysis:
    return VideoAnalysis(id=uuid.uuid4(), video_id=uuid.uuid4(), status=status)


def _make_pa(status: str | None) -> ProjectAnalysis:
    return ProjectAnalysis(
        id=uuid.uuid4(), project_id=uuid.uuid4(), video_ids=[], status=status
    )


# ---------------------------------------------------------------------------
# VideoAnalysis
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "from_state,event,to_state",
    [
        (from_state, event, to_state)
        for (from_state, event), to_state in VIDEO_ANALYSIS_TRANSITIONS.items()
        if from_state is not None
    ],
    ids=lambda v: str(v),
)
def test_every_video_analysis_transition(
    from_state: VideoAnalysisStatus,
    event: VideoAnalysisEvent,
    to_state: VideoAnalysisStatus,
) -> None:
    va = _make_va(status=from_state.value)
    result = VideoAnalysisStateMachine.transition(va, event)
    assert result is to_state
    assert va.status == to_state.value


def test_video_analysis_row_created_from_none() -> None:
    va = _make_va(status=None)
    VideoAnalysisStateMachine.transition(va, VideoAnalysisEvent.ROW_CREATED)
    assert va.status == VideoAnalysisStatus.PENDING.value


def test_video_analysis_happy_path() -> None:
    va = _make_va(status=None)
    VideoAnalysisStateMachine.transition(va, VideoAnalysisEvent.ROW_CREATED)
    VideoAnalysisStateMachine.transition(va, VideoAnalysisEvent.CHAIN_STARTED)
    assert va.status == VideoAnalysisStatus.PROCESSING.value
    VideoAnalysisStateMachine.transition(va, VideoAnalysisEvent.CHAIN_SUCCEEDED)
    assert va.status == VideoAnalysisStatus.COMPLETED.value


def test_video_analysis_retry_reset_clears_error() -> None:
    va = _make_va(status=VideoAnalysisStatus.ERROR.value)
    VideoAnalysisStateMachine.transition(va, VideoAnalysisEvent.RETRY_RESET)
    assert va.status == VideoAnalysisStatus.PENDING.value


def test_video_analysis_illegal_completed_to_running_raises() -> None:
    va = _make_va(status=VideoAnalysisStatus.COMPLETED.value)
    with pytest.raises(InvalidTransitionError):
        VideoAnalysisStateMachine.transition(va, VideoAnalysisEvent.CHAIN_STARTED)


def test_video_analysis_chain_failed_idempotent_from_error() -> None:
    """The chain .on_error handler runs after a per-step except block
    already stamped the row — must be a no-op."""
    va = _make_va(status=VideoAnalysisStatus.ERROR.value)
    VideoAnalysisStateMachine.transition(va, VideoAnalysisEvent.CHAIN_FAILED)
    assert va.status == VideoAnalysisStatus.ERROR.value


# ---------------------------------------------------------------------------
# ProjectAnalysis
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "from_state,event,to_state",
    [
        (from_state, event, to_state)
        for (from_state, event), to_state in PROJECT_ANALYSIS_TRANSITIONS.items()
        if from_state is not None
    ],
    ids=lambda v: str(v),
)
def test_every_project_analysis_transition(
    from_state: VideoAnalysisStatus,
    event: ProjectAnalysisEvent,
    to_state: VideoAnalysisStatus,
) -> None:
    pa = _make_pa(status=from_state.value)
    result = ProjectAnalysisStateMachine.transition(pa, event)
    assert result is to_state
    assert pa.status == to_state.value


def test_project_analysis_row_created_goes_directly_to_processing() -> None:
    """Unlike VideoAnalysis which starts PENDING, ProjectAnalysis goes
    straight to PROCESSING because there's no separate lazy-create step."""
    pa = _make_pa(status=None)
    ProjectAnalysisStateMachine.transition(pa, ProjectAnalysisEvent.ROW_CREATED)
    assert pa.status == VideoAnalysisStatus.PROCESSING.value


def test_project_analysis_happy_path() -> None:
    pa = _make_pa(status=None)
    ProjectAnalysisStateMachine.transition(pa, ProjectAnalysisEvent.ROW_CREATED)
    ProjectAnalysisStateMachine.transition(
        pa, ProjectAnalysisEvent.CHAIN_STEP_PROGRESS
    )
    assert pa.status == VideoAnalysisStatus.PROCESSING.value
    ProjectAnalysisStateMachine.transition(
        pa, ProjectAnalysisEvent.CHAIN_SUCCEEDED
    )
    assert pa.status == VideoAnalysisStatus.COMPLETED.value


def test_project_analysis_illegal_completed_to_running_raises() -> None:
    pa = _make_pa(status=VideoAnalysisStatus.COMPLETED.value)
    with pytest.raises(InvalidTransitionError):
        ProjectAnalysisStateMachine.transition(
            pa, ProjectAnalysisEvent.CHAIN_STEP_PROGRESS
        )


def test_project_analysis_retry_reset_clears_error() -> None:
    """RETRY_RESET on an errored ProjectAnalysis must flip it back to a
    runnable state. ProjectAnalysis has no PENDING state (it is born
    PROCESSING), so the runnable state it returns to is PROCESSING — the
    mirror of VideoAnalysis's error -> pending reset (PR #21). Without
    this edge, the cross_relate precheck (status == "error" -> skipped)
    swallows every retry and the row stays error forever."""
    pa = _make_pa(status=VideoAnalysisStatus.ERROR.value)
    ProjectAnalysisStateMachine.transition(
        pa, ProjectAnalysisEvent.RETRY_RESET
    )
    assert pa.status == VideoAnalysisStatus.PROCESSING.value


def test_project_analysis_retry_reset_idempotent_on_processing() -> None:
    """RETRY_RESET on a row already in PROCESSING is an idempotent
    self-loop (mirrors the PENDING -> PENDING video self-loop), so a
    second racing retry click doesn't raise InvalidTransitionError."""
    pa = _make_pa(status=VideoAnalysisStatus.PROCESSING.value)
    ProjectAnalysisStateMachine.transition(
        pa, ProjectAnalysisEvent.RETRY_RESET
    )
    assert pa.status == VideoAnalysisStatus.PROCESSING.value


def test_project_analysis_retry_reset_from_completed_raises() -> None:
    """Mirror of the video policy: RETRY_RESET is NOT allowed from
    COMPLETED. A deliberate re-trigger of a completed cross-video
    analysis must not be silently clobbered by the reset block — the
    route's reset block only fires for error rows, exactly like the
    video route. This pins the intended semantics."""
    pa = _make_pa(status=VideoAnalysisStatus.COMPLETED.value)
    with pytest.raises(InvalidTransitionError):
        ProjectAnalysisStateMachine.transition(
            pa, ProjectAnalysisEvent.RETRY_RESET
        )
