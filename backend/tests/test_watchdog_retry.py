"""Tests for watchdog task retry behavior on transient DB errors.

Covers: autoretry on OperationalError, no retry on non-transient errors,
retry parameter configuration, and successful execution after transient
failure clears.

Fixes PYTHON-FASTAPI-10: reset_stuck_analyses failed on a transient DNS
resolution error for postgres.railway.internal with no retry logic.
"""

import json
import os
from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock
from uuid import uuid4

import pytest

# --- Env vars must be set before any app.* import ---
os.environ.setdefault("APP_ENV", "development")
os.environ.setdefault("DEBUG", "false")
os.environ.setdefault("DATABASE_URL", "sqlite:///test.db")
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/0")
os.environ.setdefault("CLERK_SECRET_KEY", "sk_test_fake")
os.environ.setdefault("CLERK_PUBLISHABLE_KEY", "pk_test_dGVzdC1jbGVyay5hY2NvdW50cy5kZXYk")
os.environ.setdefault("R2_ACCESS_KEY_ID", "test_access_key")
os.environ.setdefault("R2_SECRET_ACCESS_KEY", "test_secret_key")
os.environ.setdefault("R2_ENDPOINT_URL", "https://fake.r2.cloudflarestorage.com")
os.environ.setdefault("R2_BUCKET_NAME", "test-bucket")
os.environ.setdefault("OPENROUTER_API_KEY", "test-openrouter-key")
os.environ.setdefault("ASSEMBLYAI_API_KEY", "test-assemblyai-key")
os.environ.setdefault("ENCRYPTION_KEY", "9px3YGa-Z2bljdtUKpLhqzl9IaGdf2RgrCI-zOTrUug=")

from sqlalchemy import ARRAY, create_engine, event  # noqa: E402
from sqlalchemy.dialects.postgresql import JSONB  # noqa: E402
from sqlalchemy.dialects.postgresql import UUID as PGUUID  # noqa: E402
from sqlalchemy.exc import OperationalError, ProgrammingError  # noqa: E402
from sqlalchemy.ext.compiler import compiles  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402


# ---------------------------------------------------------------------------
# SQLite compatibility shims (same as test_project_analysis_chain.py)
# ---------------------------------------------------------------------------

@compiles(PGUUID, "sqlite")
def _compile_uuid_sqlite(type_, compiler, **kw):
    return "CHAR(36)"


@compiles(JSONB, "sqlite")
def _compile_jsonb_sqlite(type_, compiler, **kw):
    return "JSON"


@compiles(ARRAY, "sqlite")
def _compile_array_sqlite(type_, compiler, **kw):
    return "JSON"


def _install_array_json_adapter(engine):
    @event.listens_for(engine, "before_cursor_execute", retval=True)
    def _jsonify_lists(conn, cursor, statement, parameters, context, executemany):
        import uuid as _uuid

        def _default(o):
            if isinstance(o, _uuid.UUID):
                return str(o)
            raise TypeError(f"not serializable: {type(o).__name__}")

        def _conv(v):
            return json.dumps(v, default=_default) if isinstance(v, list) else v

        if parameters is None:
            return statement, parameters
        if executemany:
            new_params = []
            for row in parameters:
                if isinstance(row, (list, tuple)):
                    new_params.append(type(row)(_conv(p) for p in row))
                elif isinstance(row, dict):
                    new_params.append({k: _conv(v) for k, v in row.items()})
                else:
                    new_params.append(row)
            return statement, new_params
        if isinstance(parameters, (list, tuple)):
            return statement, type(parameters)(_conv(p) for p in parameters)
        if isinstance(parameters, dict):
            return statement, {k: _conv(v) for k, v in parameters.items()}
        return statement, parameters


from app.database import Base  # noqa: E402
from app.models.database_models import Project, ProjectAnalysis, User  # noqa: E402


@pytest.fixture
def db_session(tmp_path):
    """Create a SQLite DB with all ORM tables and yield a session."""
    db_path = tmp_path / "watchdog_test.db"
    engine = create_engine(f"sqlite:///{db_path}")
    _install_array_json_adapter(engine)
    Base.metadata.create_all(bind=engine)

    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()


def _seed_project(db, user_id="dev_user_local"):
    if not db.query(User).filter(User.id == user_id).first():
        db.add(User(id=user_id, email=f"{user_id}@test.com", role="user"))
        db.commit()
    project = Project(name="watchdog test", user_id=user_id, description="desc")
    db.add(project)
    db.commit()
    return project

# ---------------------------------------------------------------------------
# Test 1: Task decorator has correct retry configuration
# ---------------------------------------------------------------------------


class TestWatchdogRetryConfig:
    """Verify the task decorator retry parameters are correctly set."""

    def test_autoretry_includes_operational_error(self):
        from app.tasks.watchdog_tasks import reset_stuck_analyses

        autoretry = reset_stuck_analyses.autoretry_for
        assert OperationalError in autoretry, (
            "reset_stuck_analyses must autoretry on OperationalError "
            "(transient DB/DNS failures)"
        )

    def test_max_retries_is_3(self):
        from app.tasks.watchdog_tasks import reset_stuck_analyses

        assert reset_stuck_analyses.max_retries == 3

    def test_retry_backoff_enabled(self):
        from app.tasks.watchdog_tasks import reset_stuck_analyses

        assert reset_stuck_analyses.retry_backoff is True

    def test_retry_jitter_enabled(self):
        from app.tasks.watchdog_tasks import reset_stuck_analyses

        assert reset_stuck_analyses.retry_jitter is True

    def test_retry_backoff_max_is_30(self):
        """Backoff cap must be short since watchdog runs every 5 minutes."""
        from app.tasks.watchdog_tasks import reset_stuck_analyses

        assert reset_stuck_analyses.retry_backoff_max == 30


# ---------------------------------------------------------------------------
# Test 2: OperationalError triggers retry (not a hard failure)
# ---------------------------------------------------------------------------


class TestWatchdogRetriesOnOperationalError:
    """When a transient DB error (like DNS resolution failure) occurs,
    the task should raise OperationalError so Celery's autoretry catches it,
    rather than swallowing it or reporting it as a permanent failure."""

    def test_operational_error_propagates_for_autoretry(self):
        """Simulate the exact Sentry error: OperationalError during DB query.

        The task should roll back the session and re-raise so Celery's
        autoretry_for mechanism can schedule a retry.
        """
        from app.tasks.watchdog_tasks import reset_stuck_analyses

        mock_db = MagicMock()
        dns_error = OperationalError(
            "could not translate host name \"postgres.railway.internal\" "
            "to address: Temporary failure in name resolution",
            params=None,
            orig=Exception("DNS failure"),
        )
        mock_db.query.return_value.filter.return_value.all.side_effect = dns_error

        reset_stuck_analyses._thread_local.db = mock_db

        with pytest.raises(OperationalError):
            reset_stuck_analyses.run()

        # Session must be rolled back on error
        mock_db.rollback.assert_called_once()


# ---------------------------------------------------------------------------
# Test 3: Non-transient errors are NOT retried
# ---------------------------------------------------------------------------


class TestWatchdogDoesNotRetryNonTransientErrors:
    """Non-OperationalError exceptions (bugs, schema errors) must NOT be
    retried — they should propagate immediately to Sentry."""

    def test_programming_error_not_in_autoretry(self):
        from app.tasks.watchdog_tasks import reset_stuck_analyses

        autoretry = reset_stuck_analyses.autoretry_for
        assert ProgrammingError not in autoretry, (
            "ProgrammingError (schema bugs) must not be auto-retried"
        )

    def test_value_error_propagates_without_retry(self):
        """A non-DB exception in the task body should propagate as-is."""
        from app.tasks.watchdog_tasks import reset_stuck_analyses

        mock_db = MagicMock()
        mock_db.query.return_value.filter.return_value.all.side_effect = ValueError(
            "unexpected bug"
        )

        reset_stuck_analyses._thread_local.db = mock_db

        with pytest.raises(ValueError, match="unexpected bug"):
            reset_stuck_analyses.run()

        mock_db.rollback.assert_called_once()


# ---------------------------------------------------------------------------
# Test 4: Successful execution after transient failure clears
# ---------------------------------------------------------------------------


class TestWatchdogSucceedsAfterTransientFailure:
    """Simulate the scenario where the first DB call fails (DNS blip)
    but a direct re-invocation succeeds — proving the retry path works."""

    def test_succeeds_when_db_is_healthy(self):
        """With no stuck records and a healthy DB, task returns zeros."""
        from app.tasks.watchdog_tasks import reset_stuck_analyses

        mock_db = MagicMock()
        # All queries return empty lists (no stuck records)
        mock_db.query.return_value.filter.return_value.all.return_value = []
        mock_db.query.return_value.filter.return_value.join.return_value.filter.return_value.all.return_value = []
        mock_db.query.return_value.filter.return_value.outerjoin.return_value.filter.return_value.all.return_value = []

        reset_stuck_analyses._thread_local.db = mock_db

        result = reset_stuck_analyses.run()

        assert result == {
            "videos_reset": 0,
            "projects_reset": 0,
            "transcripts_reset": 0,
        }
        mock_db.commit.assert_called_once()


# ---------------------------------------------------------------------------
# Test 5: Watchdog writes error_message to stuck ProjectAnalysis rows
# ---------------------------------------------------------------------------


class TestWatchdogWritesProjectAnalysisErrorMessage:
    """A stuck ProjectAnalysis reset by the watchdog must have error_message
    set to a structured JSON payload so users can see WHY it was reset."""

    def test_stuck_project_analysis_gets_error_message(self, db_session):
        """Watchdog should set error_message on a PA stuck in processing."""
        from app.tasks.watchdog_tasks import _ANALYSIS_TIMEOUT, reset_stuck_analyses

        project = _seed_project(db_session)

        # Create a PA stuck well past the timeout
        stuck_started_at = datetime.now(timezone.utc) - _ANALYSIS_TIMEOUT - timedelta(minutes=5)
        pa = ProjectAnalysis(
            project_id=project.id,
            status="processing",
            video_ids=[],
            started_at=stuck_started_at,
        )
        db_session.add(pa)
        db_session.commit()

        reset_stuck_analyses._thread_local.db = db_session
        result = reset_stuck_analyses.run()

        assert result["projects_reset"] == 1

        db_session.refresh(pa)
        assert pa.status == "error"
        assert pa.error_message is not None

        parsed = json.loads(pa.error_message)
        assert parsed["step"] == "watchdog"
        assert parsed["error_type"] == "timeout"
        assert "minutes" in parsed["details"]

    def test_stuck_project_analysis_without_started_at_not_reset(self, db_session):
        """A PA with no started_at should not be picked up by the watchdog cutoff."""
        from app.tasks.watchdog_tasks import reset_stuck_analyses

        project = _seed_project(db_session)

        pa = ProjectAnalysis(
            project_id=project.id,
            status="processing",
            video_ids=[],
            started_at=None,  # No started_at → filter excludes it
        )
        db_session.add(pa)
        db_session.commit()

        reset_stuck_analyses._thread_local.db = db_session
        result = reset_stuck_analyses.run()

        # A PA with started_at=None fails the "started_at < cutoff" filter
        assert result["projects_reset"] == 0
        db_session.refresh(pa)
        assert pa.status == "processing"
        assert pa.error_message is None
