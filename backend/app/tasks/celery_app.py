"""Celery application configuration."""

import logging
from datetime import timedelta

from celery import Celery, signals

from app.config import settings

logger = logging.getLogger(__name__)


@signals.celeryd_init.connect
def init_sentry_for_worker(**kwargs):
    """Initialize Sentry in the Celery worker process.

    The API process initializes Sentry in main.py. The worker is a
    separate process and needs its own init call so that task errors,
    traces, and profiling are captured.
    """
    from app.sentry_setup import init_sentry
    init_sentry()
    logger.info("Sentry initialized for Celery worker")


# Create Celery app
celery_app = Celery(
    "qualitative_research_tasks",
    broker=settings.CELERY_BROKER_URL,
    backend=settings.CELERY_RESULT_BACKEND,
    include=[
        "app.tasks.transcription_tasks",
        "app.tasks.analysis_tasks",
        "app.tasks.analysis_steps",
        "app.tasks.watchdog_tasks",
    ]
)

# Configure Celery
celery_app.conf.update(
    # Task settings
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,

    # Result backend settings
    result_expires=600,  # Results expire after 10 minutes (short-lived to limit data exposure)
    result_persistent=True,

    # Task execution settings
    task_track_started=True,
    task_time_limit=1800,  # 30 minutes max per task
    task_soft_time_limit=1700,  # Soft limit at ~28 minutes
    task_acks_late=True,  # Acknowledge tasks after execution (survives worker crash)
    task_reject_on_worker_lost=True,  # Re-queue tasks if worker dies mid-execution

    # Worker settings
    worker_prefetch_multiplier=1,  # Fetch one task per thread (threads handle concurrency)
    worker_max_tasks_per_child=None,  # No limit — threads don't need recycling like forked children
    worker_cancel_long_running_tasks_on_connection_loss=True,

    # Broker connection resilience
    broker_connection_retry_on_startup=True,  # Retry Redis connection on startup
    broker_connection_retry=True,  # Retry on connection loss during operation
    broker_connection_max_retries=10,  # Max retries before giving up
    broker_connection_timeout=30,  # Timeout per connection attempt

    # Logging
    worker_hijack_root_logger=False,
    worker_log_format="[%(asctime)s: %(levelname)s/%(processName)s] %(message)s",

    # Celery Beat schedule for periodic tasks
    beat_schedule={
        "watchdog-reset-stuck-analyses": {
            "task": "reset_stuck_analyses",
            "schedule": timedelta(minutes=5),
        },
    },
)

logger.info("Celery app configured")
