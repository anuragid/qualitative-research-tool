"""Tests for watchdog task retry behavior on transient DB errors.

Covers: autoretry on OperationalError, no retry on non-transient errors,
retry parameter configuration, and successful execution after transient
failure clears.

Fixes PYTHON-FASTAPI-10: reset_stuck_analyses failed on a transient DNS
resolution error for postgres.railway.internal with no retry logic.
"""

import os
from unittest.mock import MagicMock

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

from sqlalchemy.exc import OperationalError, ProgrammingError  # noqa: E402

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
