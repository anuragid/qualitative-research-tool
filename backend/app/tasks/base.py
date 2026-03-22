"""Base Celery task class with thread-safe database session management."""

import logging
import threading

from celery import Task
from sqlalchemy.orm import Session

from app.database import SessionLocal

logger = logging.getLogger(__name__)


class DatabaseTask(Task):
    """
    Base task with thread-safe, per-invocation database session management.

    Uses threading.local() so each Celery thread gets its own DB session.
    This is required when using --pool=threads (concurrent task execution).
    """

    abstract = True
    _thread_local = threading.local()

    def __call__(self, *args, **kwargs):
        """Ensure fresh session per invocation (defense-in-depth)."""
        self._thread_local.db = None
        return super().__call__(*args, **kwargs)

    @property
    def db(self) -> Session:
        """Get or create database session for this thread."""
        if not hasattr(self._thread_local, "db") or self._thread_local.db is None:
            self._thread_local.db = SessionLocal()
        return self._thread_local.db

    def after_return(self, status, retval, task_id, args, kwargs, einfo):
        """Clean up database session after task completes."""
        if hasattr(self._thread_local, "db") and self._thread_local.db is not None:
            try:
                self._thread_local.db.close()
            except Exception as e:
                logger.warning(f"Error closing database session for task {task_id}: {e}")
            finally:
                self._thread_local.db = None
