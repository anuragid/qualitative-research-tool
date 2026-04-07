"""Tests for ``ProjectStateMachine``.

The ``READY`` -> ``COMPLETED`` transition is the canonical Bug B case
(HAIC project, 2026-04-07) — the parametrized coverage here pins it
down so a future edit can't silently regress the gate again.
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

from app.models.database_models import Project  # noqa: E402
from app.state import (  # noqa: E402
    PROJECT_TRANSITIONS,
    InvalidTransitionError,
    ProjectEvent,
    ProjectStateMachine,
    ProjectStatus,
)


def _make_project(status: str | None) -> Project:
    return Project(
        id=uuid.uuid4(),
        user_id="test_user",
        name="Test",
        status=status,
    )


@pytest.mark.parametrize(
    "from_state,event,to_state",
    [
        (from_state, event, to_state)
        for (from_state, event), to_state in PROJECT_TRANSITIONS.items()
        if from_state is not None
    ],
    ids=lambda v: str(v),
)
def test_every_allowed_transition(
    from_state: ProjectStatus, event: ProjectEvent, to_state: ProjectStatus
) -> None:
    project = _make_project(status=from_state.value)
    result = ProjectStateMachine.transition(project, event)
    assert result is to_state
    assert project.status == to_state.value


def test_created_from_none() -> None:
    project = _make_project(status=None)
    ProjectStateMachine.transition(project, ProjectEvent.CREATED)
    assert project.status == ProjectStatus.PLANNING.value


def test_ready_to_completed_bug_b_regression() -> None:
    """Bug B regression: a project in READY must advance to COMPLETED
    when the final video finishes analysis. Prior to PR #17 this was
    silently trapped because the service's gate didn't include READY in
    the allowed-from set. The state machine's transition table makes the
    gate explicit — deleting the (READY, ALL_VIDEOS_COMPLETE) row below
    would break this test."""
    project = _make_project(status=ProjectStatus.READY.value)
    ProjectStateMachine.transition(project, ProjectEvent.ALL_VIDEOS_COMPLETE)
    assert project.status == ProjectStatus.COMPLETED.value


def test_planning_to_ready_on_first_transcript() -> None:
    project = _make_project(status=ProjectStatus.PLANNING.value)
    ProjectStateMachine.transition(project, ProjectEvent.FIRST_TRANSCRIPT_COMPLETE)
    assert project.status == ProjectStatus.READY.value


def test_first_transcript_is_noop_when_already_ready() -> None:
    project = _make_project(status=ProjectStatus.READY.value)
    ProjectStateMachine.transition(project, ProjectEvent.FIRST_TRANSCRIPT_COMPLETE)
    assert project.status == ProjectStatus.READY.value


def test_all_videos_complete_is_idempotent_on_completed() -> None:
    project = _make_project(status=ProjectStatus.COMPLETED.value)
    ProjectStateMachine.transition(project, ProjectEvent.ALL_VIDEOS_COMPLETE)
    assert project.status == ProjectStatus.COMPLETED.value


def test_archived_to_completed_raises() -> None:
    """Archived is a legacy holdover, not a live source state."""
    project = _make_project(status=ProjectStatus.ARCHIVED.value)
    with pytest.raises(InvalidTransitionError):
        ProjectStateMachine.transition(project, ProjectEvent.ALL_VIDEOS_COMPLETE)
