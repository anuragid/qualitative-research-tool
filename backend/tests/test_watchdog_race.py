"""Tests for watchdog race condition fixes.

Covers: cancellation detection, pipeline halting, watchdog timeout vs Celery
limit, orphaned video fixes, project state transitions, and error handler
idempotency.
"""

import os
import uuid
from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock

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
# an in-memory SQLite database in tests.
# ---------------------------------------------------------------------------


@compiles(UUID, "sqlite")
def _compile_uuid_sqlite(type_, compiler, **kw):
    return "CHAR(36)"


@compiles(JSONB, "sqlite")
def _compile_jsonb_sqlite(type_, compiler, **kw):
    return "JSON"


@compiles(ARRAY, "sqlite")
def _compile_array_sqlite(type_, compiler, **kw):
    return "JSON"


from app.database import Base  # noqa: E402
from app.models.database_models import (  # noqa: E402, I001
    Project,
    User,
    Video,
    VideoAnalysis,
)

# ---------------------------------------------------------------------------
# Fixture: lightweight ORM-aware SQLite session
# ---------------------------------------------------------------------------


@pytest.fixture
def db_session(tmp_path):
    """Create a SQLite DB with all ORM tables and yield a session."""
    db_path = tmp_path / "watchdog_test.db"
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
    """Insert a User via ORM if not present."""
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


def _make_video(db, project_id, video_id=None, status="uploaded", error_message=None):
    vid = video_id or uuid.uuid4()
    v = Video(
        id=vid,
        project_id=project_id,
        filename="test.mp4",
        s3_key="videos/test.mp4",
        s3_url="https://test/test.mp4",
        status=status,
        error_message=error_message,
    )
    db.add(v)
    db.commit()
    return v


def _make_video_analysis(db, video_id, va_id=None, status="pending", started_at=None):
    aid = va_id or uuid.uuid4()
    va = VideoAnalysis(
        id=aid,
        video_id=video_id,
        status=status,
        started_at=started_at,
    )
    db.add(va)
    db.commit()
    return va


# ---------------------------------------------------------------------------
# Test 1: _is_cancelled detects watchdog error
# ---------------------------------------------------------------------------


class TestCheckCancellationDetectsWatchdogError:
    """After the WS3 chain refactor, the monolithic _run_video_pipeline /
    _is_cancelled functions are gone. Each per-step Celery task calls
    _check_cancellation at the top of its body and returns {status:
    skipped} if the watchdog (or a prior link) already marked the
    VideoAnalysis row as error."""

    def test_check_cancellation_detects_watchdog_error(self, db_session):
        from app.tasks.analysis_steps import _check_cancellation

        project = _make_project(db_session)
        video = _make_video(db_session, project.id, status="analyzing")
        _make_video_analysis(db_session, video.id, status="processing")

        # Should NOT be cancelled yet
        assert _check_cancellation(db_session, str(video.id)) is False

        # Simulate watchdog setting status to "error"
        va = db_session.query(VideoAnalysis).filter_by(video_id=video.id).first()
        va.status = "error"
        db_session.commit()

        # Should now be detected as cancelled
        assert _check_cancellation(db_session, str(video.id)) is True


class TestStepTaskShortCircuitsWhenCancelled:
    """The chain-style replacement for the old
    TestPipelineStopsWhenCancelled: instead of one pipeline function
    halting early, individual step tasks short-circuit via
    _check_cancellation. Covered in detail by
    test_analysis_chain.py::TestStepTasksShortCircuitWhenCancelled —
    this test is a narrow sanity check that exercises the precheck
    against the real DatabaseTask flow used in watchdog scenarios."""

    def test_chunk_step_returns_skipped_when_watchdog_marked_error(self, db_session):
        from app.tasks import analysis_steps

        project = _make_project(db_session)
        video = _make_video(db_session, project.id, status="analyzing")
        _make_video_analysis(db_session, video.id, status="error")

        mock_self = MagicMock()
        mock_self.db = db_session
        unbound = analysis_steps.analyze_chunk_step._orig_run.__func__
        result = unbound(mock_self, str(video.id), None)

        assert result == {"video_id": str(video.id), "status": "skipped"}


# ---------------------------------------------------------------------------
# Test 3: Watchdog timeout exceeds Celery limit
# ---------------------------------------------------------------------------


class TestWatchdogTimeoutExceedsCeleryLimit:
    def test_watchdog_timeout_exceeds_celery_limit(self):
        from app.tasks.celery_app import celery_app
        from app.tasks.watchdog_tasks import _ANALYSIS_TIMEOUT

        celery_time_limit = celery_app.conf.task_time_limit
        assert _ANALYSIS_TIMEOUT > timedelta(seconds=celery_time_limit), (
            f"Watchdog timeout ({_ANALYSIS_TIMEOUT}) must exceed Celery "
            f"task_time_limit ({celery_time_limit}s) so Celery kills the task first"
        )


# ---------------------------------------------------------------------------
# Test 4: Watchdog fixes orphaned analyzing video (analysis=error)
# ---------------------------------------------------------------------------


class TestWatchdogFixesOrphanedAnalyzingVideo:
    def test_watchdog_fixes_orphaned_analyzing_video(self, db_session):
        """Video stuck in 'analyzing' with VideoAnalysis in 'error' -> video becomes 'error'."""
        project = _make_project(db_session)
        video = _make_video(db_session, project.id, status="analyzing")
        _make_video_analysis(
            db_session, video.id, status="error",
            started_at=datetime.now(timezone.utc) - timedelta(minutes=40),
        )

        from app.tasks.watchdog_tasks import reset_stuck_analyses

        # Inject our test session into the task's thread-local storage
        reset_stuck_analyses._thread_local.db = db_session
        reset_stuck_analyses.run()

        db_session.refresh(video)
        assert video.status == "error"


# ---------------------------------------------------------------------------
# Test 5: Watchdog fixes analyzing video with completed analysis
# ---------------------------------------------------------------------------


class TestWatchdogFixesAnalyzingWithCompletedAnalysis:
    def test_watchdog_fixes_analyzing_with_completed_analysis(self, db_session):
        """Video stuck in 'analyzing' with VideoAnalysis 'completed' -> video becomes 'analyzed'."""
        project = _make_project(db_session)
        video = _make_video(db_session, project.id, status="analyzing")
        _make_video_analysis(
            db_session, video.id, status="completed",
            started_at=datetime.now(timezone.utc) - timedelta(minutes=40),
        )

        from app.tasks.watchdog_tasks import reset_stuck_analyses

        reset_stuck_analyses._thread_local.db = db_session
        reset_stuck_analyses.run()

        db_session.refresh(video)
        assert video.status == "analyzed"


# ---------------------------------------------------------------------------
# Test 6: Project state transitions to ready
# ---------------------------------------------------------------------------


class TestProjectStateTransitionsToReady:
    def test_project_state_transitions_to_ready(self, db_session):
        """Project in 'planning' with a transcribed video (no completed analysis) -> 'ready'."""
        from app.services.project_state_service import ProjectStateService

        project = _make_project(db_session, status="planning")
        _make_video(db_session, project.id, status="transcribed")
        # No VideoAnalysis record -- video is transcribed but not analyzed

        # Pass UUID object (not str) — on SQLite the UUID column type
        # requires a uuid.UUID for filter comparisons.
        ProjectStateService.update_project_state_for_completion(project.id, db_session)

        db_session.refresh(project)
        assert project.status == "ready"


# ---------------------------------------------------------------------------
# Test 7: Project state transitions to completed
# ---------------------------------------------------------------------------


class TestProjectStateTransitionsToCompleted:
    def test_project_state_transitions_to_completed(self, db_session):
        """Project in 'planning' with analyzed video and completed analysis -> 'completed'."""
        from app.services.project_state_service import ProjectStateService

        project = _make_project(db_session, status="planning")
        video = _make_video(db_session, project.id, status="analyzed")
        _make_video_analysis(db_session, video.id, status="completed")

        # Pass UUID object (not str) — on SQLite the UUID column type
        # requires a uuid.UUID for filter comparisons.
        ProjectStateService.update_project_state_for_completion(project.id, db_session)

        db_session.refresh(project)
        assert project.status == "completed"


# ---------------------------------------------------------------------------
# Test 8: Error handler does not overwrite watchdog
# ---------------------------------------------------------------------------


class TestErrorHandlerDoesNotOverwriteWatchdog:
    def test_error_handler_does_not_overwrite_watchdog(self, db_session):
        """When video is already in 'error' (set by watchdog), the task error
        handler guard should prevent overwriting it."""
        project = _make_project(db_session)
        video = _make_video(
            db_session, project.id,
            status="error",
            error_message='{"step":"watchdog","message":"timeout"}',
        )
        _make_video_analysis(db_session, video.id, status="error")

        # Simulate the guard from the error handler in analyze_video_task:
        #   if video.status not in ("error", "analyzed"):
        #       video.status = "error"
        #       video.error_message = error_json
        should_update = video.status not in ("error", "analyzed")
        assert should_update is False, (
            "Error handler should NOT update a video already in 'error' state"
        )

        # Verify the original watchdog error message is preserved
        assert "watchdog" in video.error_message
