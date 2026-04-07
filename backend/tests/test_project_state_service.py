"""Tests for ProjectStateService transitions.

Covers the project state machine, including the ready -> completed
transition that was previously trapped (HAIC bug, 2026-04-07).
"""

import os
import uuid

import pytest

# --- Env vars must be set before any app.* import ---
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

from sqlalchemy import ARRAY, create_engine  # noqa: E402
from sqlalchemy.dialects.postgresql import JSONB, UUID  # noqa: E402
from sqlalchemy.ext.compiler import compiles  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402

# ---------------------------------------------------------------------------
# Register SQLite dialect compilers for PostgreSQL-specific types so we can
# use the real ORM models (which declare UUID, JSONB, ARRAY columns) against
# an in-memory SQLite database in tests. Mirrors test_watchdog_race.py.
# Guarded so re-importing this module in the same pytest session is a no-op.
# ---------------------------------------------------------------------------


if not getattr(compiles, "_project_state_test_registered", False):
    @compiles(UUID, "sqlite")
    def _compile_uuid_sqlite(type_, compiler, **kw):
        return "CHAR(36)"

    @compiles(JSONB, "sqlite")
    def _compile_jsonb_sqlite(type_, compiler, **kw):
        return "JSON"

    @compiles(ARRAY, "sqlite")
    def _compile_array_sqlite(type_, compiler, **kw):
        return "JSON"

    compiles._project_state_test_registered = True  # type: ignore[attr-defined]


from app.database import Base  # noqa: E402
from app.models.database_models import (  # noqa: E402, I001
    Project,
    User,
    Video,
    VideoAnalysis,
)
from app.services.project_state_service import ProjectStateService  # noqa: E402

# ---------------------------------------------------------------------------
# Fixture: lightweight ORM-aware SQLite session
# ---------------------------------------------------------------------------


@pytest.fixture
def db_session(tmp_path):
    """Create a SQLite DB with all ORM tables and yield a session."""
    db_path = tmp_path / "project_state_test.db"
    engine = create_engine(f"sqlite:///{db_path}")
    Base.metadata.create_all(bind=engine)

    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_user(db, user_id="test_user"):
    if not db.query(User).filter(User.id == user_id).first():
        db.add(User(id=user_id, email=f"{user_id}@test.com", role="user"))
        db.commit()


def _make_project(db, project_id=None, user_id="test_user", status="planning"):
    _make_user(db, user_id)
    pid = project_id or uuid.uuid4()
    p = Project(id=pid, user_id=user_id, name="Test Project", status=status)
    db.add(p)
    db.commit()
    return p


def _make_video(db, project_id, video_id=None, status="uploaded"):
    vid = video_id or uuid.uuid4()
    v = Video(
        id=vid,
        project_id=project_id,
        filename="test.mp4",
        s3_key="videos/test.mp4",
        s3_url="https://test/test.mp4",
        status=status,
    )
    db.add(v)
    db.commit()
    return v


def _make_video_analysis(db, video_id, status="pending"):
    va = VideoAnalysis(id=uuid.uuid4(), video_id=video_id, status=status)
    db.add(va)
    db.commit()
    return va


# ---------------------------------------------------------------------------
# Test: ready -> completed transition (regression for HAIC bug)
# ---------------------------------------------------------------------------


class TestReadyToCompletedTransition:
    """Project at status='ready' must still advance to 'completed' once all
    videos finish analysis.

    Bug context (2026-04-07): the HAIC project (id 8b894631-2d32-4593-ae2a-
    e76e6d9f84f3) was stuck at status='ready' even though all its videos had
    VideoAnalysis.status='completed'. Root cause was an exclusive gate in
    ProjectStateService.update_project_state_for_completion that only allowed
    the transition from 'planning' or 'processing' — never from 'ready'.
    """

    def test_ready_to_completed_transition(self, db_session):
        """Project in 'ready' with all videos analyzed -> 'completed'."""
        project = _make_project(db_session, status="ready")
        for _ in range(3):
            video = _make_video(db_session, project.id, status="analyzed")
            _make_video_analysis(db_session, video.id, status="completed")

        ProjectStateService.update_project_state_for_completion(project.id, db_session)

        db_session.refresh(project)
        assert project.status == "completed"


# ---------------------------------------------------------------------------
# Regression tests: existing transitions still work
# ---------------------------------------------------------------------------


class TestExistingTransitionsStillWork:
    """Guardrails so the surgical fix doesn't break the other transitions."""

    def test_planning_to_completed_still_works(self, db_session):
        project = _make_project(db_session, status="planning")
        video = _make_video(db_session, project.id, status="analyzed")
        _make_video_analysis(db_session, video.id, status="completed")

        ProjectStateService.update_project_state_for_completion(project.id, db_session)

        db_session.refresh(project)
        assert project.status == "completed"

    def test_planning_to_ready_still_works(self, db_session):
        project = _make_project(db_session, status="planning")
        _make_video(db_session, project.id, status="transcribed")

        ProjectStateService.update_project_state_for_completion(project.id, db_session)

        db_session.refresh(project)
        assert project.status == "ready"

    def test_partial_completion_does_not_advance(self, db_session):
        """Ready project with some-but-not-all videos completed stays 'ready'."""
        project = _make_project(db_session, status="ready")
        v1 = _make_video(db_session, project.id, status="analyzed")
        _make_video_analysis(db_session, v1.id, status="completed")
        v2 = _make_video(db_session, project.id, status="transcribed")
        _make_video_analysis(db_session, v2.id, status="pending")

        ProjectStateService.update_project_state_for_completion(project.id, db_session)

        db_session.refresh(project)
        assert project.status == "ready"
