"""Tests for the DatabaseTask base class.

Covers: after_return rollback/close behaviour, thread-local isolation,
        session creation, __call__ reset.
"""

import threading
from unittest.mock import MagicMock, patch

from app.tasks.base import DatabaseTask


def _make_task():
    """Create a DatabaseTask instance for testing."""
    task = DatabaseTask()
    task.name = "test_task"
    return task


class TestAfterReturn:
    """Tests for after_return cleanup behaviour."""

    @patch("app.tasks.base.SessionLocal")
    def test_failure_triggers_rollback(self, mock_session_local):
        """On FAILURE status, should rollback before close."""
        task = _make_task()
        mock_db = MagicMock()
        task._thread_local.db = mock_db

        task.after_return("FAILURE", None, "task-1", [], {}, MagicMock())

        mock_db.rollback.assert_called_once()
        mock_db.close.assert_called_once()
        assert task._thread_local.db is None

    @patch("app.tasks.base.SessionLocal")
    def test_retry_triggers_rollback(self, mock_session_local):
        """On RETRY status, should rollback before close."""
        task = _make_task()
        mock_db = MagicMock()
        task._thread_local.db = mock_db

        task.after_return("RETRY", None, "task-2", [], {}, None)

        mock_db.rollback.assert_called_once()
        mock_db.close.assert_called_once()

    @patch("app.tasks.base.SessionLocal")
    def test_revoked_triggers_rollback(self, mock_session_local):
        """On REVOKED status, should rollback before close."""
        task = _make_task()
        mock_db = MagicMock()
        task._thread_local.db = mock_db

        task.after_return("REVOKED", None, "task-3", [], {}, None)

        mock_db.rollback.assert_called_once()
        mock_db.close.assert_called_once()

    @patch("app.tasks.base.SessionLocal")
    def test_success_no_rollback(self, mock_session_local):
        """On SUCCESS status, should close without rollback."""
        task = _make_task()
        mock_db = MagicMock()
        task._thread_local.db = mock_db

        task.after_return("SUCCESS", {"result": "ok"}, "task-4", [], {}, None)

        mock_db.rollback.assert_not_called()
        mock_db.close.assert_called_once()
        assert task._thread_local.db is None

    @patch("app.tasks.base.SessionLocal")
    def test_einfo_present_triggers_rollback(self, mock_session_local):
        """If einfo is present (even with SUCCESS), rollback is called."""
        task = _make_task()
        mock_db = MagicMock()
        task._thread_local.db = mock_db

        # Unusual: SUCCESS status but einfo is present
        task.after_return("SUCCESS", None, "task-5", [], {}, MagicMock())

        mock_db.rollback.assert_called_once()
        mock_db.close.assert_called_once()

    @patch("app.tasks.base.SessionLocal")
    def test_no_session_does_nothing(self, mock_session_local):
        """If no db session exists, after_return should not fail."""
        task = _make_task()
        # Ensure no db set
        task._thread_local.db = None

        # Should not raise
        task.after_return("SUCCESS", None, "task-6", [], {}, None)

    @patch("app.tasks.base.SessionLocal")
    def test_rollback_exception_still_closes(self, mock_session_local):
        """If rollback raises, session should still be closed."""
        task = _make_task()
        mock_db = MagicMock()
        mock_db.rollback.side_effect = Exception("rollback failed")
        task._thread_local.db = mock_db

        # Should not raise — error is logged and session is still cleaned
        task.after_return("FAILURE", None, "task-7", [], {}, MagicMock())

        mock_db.close.assert_called_once()
        assert task._thread_local.db is None


class TestDbProperty:
    """Tests for the db property session creation."""

    @patch("app.tasks.base.SessionLocal")
    def test_creates_session_lazily(self, mock_session_local):
        """First access to .db creates a new session."""
        mock_session = MagicMock()
        mock_session_local.return_value = mock_session

        task = _make_task()
        task._thread_local.db = None

        db = task.db
        assert db is mock_session
        mock_session_local.assert_called_once()

    @patch("app.tasks.base.SessionLocal")
    def test_reuses_existing_session(self, mock_session_local):
        """Subsequent access returns the same session."""
        mock_session = MagicMock()
        task = _make_task()
        task._thread_local.db = mock_session

        assert task.db is mock_session
        mock_session_local.assert_not_called()


class TestCallResetSession:
    """Tests for __call__ resetting the session."""

    @patch("app.tasks.base.SessionLocal")
    def test_call_resets_db(self, mock_session_local):
        """__call__ should set db to None (forcing fresh session)."""
        task = _make_task()
        task._thread_local.db = MagicMock()

        # __call__ delegates to Task.__call__ which needs .run()
        # We mock super().__call__ to avoid needing a real Celery environment
        with patch.object(DatabaseTask.__bases__[0], "__call__", return_value="result"):
            task.__call__()

        assert task._thread_local.db is None


class TestThreadLocalIsolation:
    """Verify that different threads get different sessions."""

    @patch("app.tasks.base.SessionLocal")
    def test_different_threads_different_sessions(self, mock_session_local):
        """Sessions created in different threads should be independent."""
        task = _make_task()
        sessions = {}

        def worker(name):
            mock_session_local.return_value = MagicMock(name=name)
            task._thread_local.db = None
            sessions[name] = task.db

        t1 = threading.Thread(target=worker, args=("session-1",))
        t2 = threading.Thread(target=worker, args=("session-2",))
        t1.start()
        t2.start()
        t1.join()
        t2.join()

        # Each thread should have gotten its own session
        assert "session-1" in sessions
        assert "session-2" in sessions
        assert sessions["session-1"] is not sessions["session-2"]
