"""Celery application configuration."""

import logging
import time
from datetime import timedelta

from celery import Celery, signals
from sqlalchemy import inspect

from app.config import settings

logger = logging.getLogger(__name__)

# Required columns the worker depends on at runtime. If a Railway deploy
# fires the worker before the backend's migration step has finished,
# the worker would crash on the first task with an UndefinedColumn error
# from Postgres. The check below loops with backoff so the worker can
# wait for the backend to apply the migration. After 60s of misses we
# give up and exit non-zero so Railway restarts us with the latest image.
_REQUIRED_BALANCE_COLUMNS = (
    "key_total_credits",
    "key_total_usage",
    "key_limit",
    "key_limit_remaining",
    "key_is_free_tier",
    "key_balance_checked_at",
    "key_balance_error",
)
_SCHEMA_CHECK_MAX_ATTEMPTS = 12
_SCHEMA_CHECK_INTERVAL_SECONDS = 5


def _verify_byok_balance_schema() -> None:
    """Confirm the BYOK balance migration has been applied.

    Loops with a 5-second backoff for up to 60 seconds. Raises
    RuntimeError if the columns are still missing — Celery will then
    refuse to start, Railway will restart the worker, and by the time
    it boots again the backend should have run the migration.
    """
    from app.database import engine

    for attempt in range(1, _SCHEMA_CHECK_MAX_ATTEMPTS + 1):
        try:
            inspector = inspect(engine)
            existing_columns = {col["name"] for col in inspector.get_columns("users")}
            missing = [c for c in _REQUIRED_BALANCE_COLUMNS if c not in existing_columns]
            if not missing:
                logger.info(
                    "BYOK balance schema check passed (all 7 columns present)"
                )
                return
            logger.warning(
                f"BYOK balance schema check attempt {attempt}/{_SCHEMA_CHECK_MAX_ATTEMPTS}: "
                f"missing columns {missing}; sleeping {_SCHEMA_CHECK_INTERVAL_SECONDS}s"
            )
        except Exception as exc:  # noqa: BLE001 — DB unreachable, keep retrying
            logger.warning(
                f"BYOK balance schema check attempt {attempt}/{_SCHEMA_CHECK_MAX_ATTEMPTS}: "
                f"DB inspect failed ({exc}); sleeping {_SCHEMA_CHECK_INTERVAL_SECONDS}s"
            )
        time.sleep(_SCHEMA_CHECK_INTERVAL_SECONDS)

    raise RuntimeError(
        "BYOK balance migration has not been applied — worker refusing to start. "
        "The backend service runs migrations on boot; if this persists, manually "
        "run `alembic upgrade head` or check the backend deploy logs."
    )


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


@signals.worker_ready.connect
def verify_schema_on_worker_start(sender=None, **kwargs):
    """Block worker readiness until the BYOK balance migration is applied.

    Runs once when the worker process becomes ready to accept tasks.
    Failing fast here is preferable to crashing on the first task with
    an opaque UndefinedColumn error halfway through a Celery retry chain.
    """
    _verify_byok_balance_schema()


# Create Celery app
celery_app = Celery(
    "qualitative_research_tasks",
    broker=settings.CELERY_BROKER_URL,
    backend=settings.CELERY_RESULT_BACKEND,
    include=[
        "app.tasks.transcription_tasks",
        "app.tasks.analysis_steps",
        "app.tasks.project_analysis_steps",
        "app.tasks.pipeline_errors",
        "app.tasks.watchdog_tasks",
        "app.tasks.model_validation_tasks",
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

    # Queue routing — analyze step tasks + chain error handler on their
    # own "analyze" queue so they can be scaled/isolated independently.
    # transcription pushes to "transcribe"; watchdog and model-validation
    # stay on the default "celery" queue. The worker will need to consume
    # from -Q analyze,transcribe,celery (that change lands in WS4).
    task_default_queue="celery",
    task_routes={
        "analyze_chunk_step":            {"queue": "analyze"},
        "analyze_infer_step":            {"queue": "analyze"},
        "analyze_relate_step":           {"queue": "analyze"},
        "analyze_explain_step":          {"queue": "analyze"},
        "analyze_activate_step":         {"queue": "analyze"},
        "analyze_cross_relate_step":     {"queue": "analyze"},
        "analyze_cross_explain_step":    {"queue": "analyze"},
        "analyze_cross_activate_step":   {"queue": "analyze"},
        "handle_pipeline_error":         {"queue": "analyze"},
        "handle_project_pipeline_error": {"queue": "analyze"},
        "transcribe_video":              {"queue": "transcribe"},
        "check_transcription":           {"queue": "transcribe"},
        # watchdog + model validation use the default "celery" queue
    },

    # Celery Beat schedule for periodic tasks
    beat_schedule={
        "watchdog-reset-stuck-analyses": {
            "task": "reset_stuck_analyses",
            "schedule": timedelta(minutes=5),
        },
        "validate-openrouter-models": {
            "task": "validate_openrouter_models",
            "schedule": timedelta(hours=6),
        },
    },
)

logger.info("Celery app configured")
