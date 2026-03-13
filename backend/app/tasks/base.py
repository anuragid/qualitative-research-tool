"""Base Celery task class with database session management."""

import logging

from celery import Task
from sqlalchemy.orm import Session

from app.database import SessionLocal

logger = logging.getLogger(__name__)


class DatabaseTask(Task):
    """
    Base task with per-invocation database session management.

    Each task invocation gets its own session, which is properly closed
    after the task completes (success, failure, or retry).
    """

    # Abstract prevents Celery from registering this as a task itself
    abstract = True

    def __call__(self, *args, **kwargs):
        """Override __call__ to create a fresh session per invocation."""
        self._db = None
        return super().__call__(*args, **kwargs)

    @property
    def db(self) -> Session:
        """Get or create database session for this task invocation."""
        if self._db is None:
            self._db = SessionLocal()
        return self._db

    def after_return(self, status, retval, task_id, args, kwargs, einfo):
        """Clean up database session after task completes."""
        if hasattr(self, '_db') and self._db is not None:
            try:
                self._db.close()
            except Exception as e:
                logger.warning(f"Error closing database session for task {task_id}: {e}")
            finally:
                self._db = None
