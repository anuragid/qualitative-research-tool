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
#
# Add an entry here whenever a migration adds a column that worker task
# code writes to — the API and worker are separate Railway services with
# no deploy-ordering guarantee, so this gate is the only thing standing
# between new worker code and an unmigrated schema.
_REQUIRED_COLUMNS_BY_TABLE = {
    # BYOK balance columns (migration c3d4e5f6g7h8) — balance refresh
    # tasks read/write these on every analysis dispatch.
    "users": (
        "key_total_credits",
        "key_total_usage",
        "key_limit",
        "key_limit_remaining",
        "key_is_free_tier",
        "key_balance_checked_at",
        "key_balance_error",
    ),
    # Cross-video error stamping (migration c1a2b3d4e5f6) — written by
    # project_analysis_steps, pipeline_errors, and watchdog_tasks; the
    # ORM also includes it in every ProjectAnalysis INSERT/UPDATE, so a
    # worker running new code against the old schema crashes on ANY
    # ProjectAnalysis commit, including the error handler itself.
    "project_analyses": (
        "error_message",
    ),
}
_SCHEMA_CHECK_MAX_ATTEMPTS = 12
_SCHEMA_CHECK_INTERVAL_SECONDS = 5


def _verify_worker_schema() -> None:
    """Confirm every migration the worker depends on has been applied.

    Loops with a 5-second backoff for up to 60 seconds. Raises
    RuntimeError if any required column is still missing — Celery will
    then refuse to start, Railway will restart the worker, and by the
    time it boots again the backend should have run the migration.
    """
    from app.database import engine

    for attempt in range(1, _SCHEMA_CHECK_MAX_ATTEMPTS + 1):
        try:
            inspector = inspect(engine)
            missing: list[str] = []
            for table, required in _REQUIRED_COLUMNS_BY_TABLE.items():
                existing_columns = {
                    col["name"] for col in inspector.get_columns(table)
                }
                missing.extend(
                    f"{table}.{c}" for c in required if c not in existing_columns
                )
            if not missing:
                logger.info(
                    "Worker schema check passed (%d tables verified)",
                    len(_REQUIRED_COLUMNS_BY_TABLE),
                )
                return
            logger.warning(
                f"Worker schema check attempt {attempt}/{_SCHEMA_CHECK_MAX_ATTEMPTS}: "
                f"missing columns {missing}; sleeping {_SCHEMA_CHECK_INTERVAL_SECONDS}s"
            )
        except Exception as exc:  # noqa: BLE001 — DB unreachable, keep retrying
            logger.warning(
                f"Worker schema check attempt {attempt}/{_SCHEMA_CHECK_MAX_ATTEMPTS}: "
                f"DB inspect failed ({exc}); sleeping {_SCHEMA_CHECK_INTERVAL_SECONDS}s"
            )
        time.sleep(_SCHEMA_CHECK_INTERVAL_SECONDS)

    raise RuntimeError(
        "A required migration has not been applied — worker refusing to start. "
        "The backend service runs migrations on boot; if this persists, manually "
        "run `alembic upgrade head` or check the backend deploy logs."
    )


# Backwards-compatible alias (old name referenced in runbooks/tests).
_verify_byok_balance_schema = _verify_worker_schema


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
    """Block worker readiness until all worker-required migrations are applied.

    Runs once when the worker process becomes ready to accept tasks.
    Failing fast here is preferable to crashing on the first task with
    an opaque UndefinedColumn error halfway through a Celery retry chain.
    """
    _verify_worker_schema()


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
    # PR #19: tight lifecycle bounds. Chain steps are designed to be small
    # (one LLM call + DB write, ~1-5 min). A 6-minute hard kill with a
    # 30-second soft warning means a stuck step fails fast instead of
    # hanging out for half an hour and blocking the watchdog.
    task_time_limit=360,  # 6 min hard kill
    task_soft_time_limit=330,  # 5.5 min soft warning (SIGUSR1 before SIGKILL)
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

    # PR #19: broker visibility timeout.
    # Celery's Redis broker leaves unacked messages in the pending queue
    # until this many seconds have passed, then re-delivers them. Default
    # is 3600s (1 hour) — far longer than our old 35-min watchdog, so an
    # orphaned task (e.g. worker SIGTERM mid-LLM call during a deploy)
    # would sit stranded in Redis while the watchdog stamped the user's
    # analysis errored. 600s (10 min) is safely > task_time_limit (6 min)
    # so in-flight tasks aren't double-delivered while still running on
    # the original worker, and safely < watchdog _ANALYSIS_TIMEOUT (15 min)
    # so orphans get recovered before the watchdog intervenes.
    # See tests/test_celery_lifecycle.py for the locked invariants.
    broker_transport_options={
        "visibility_timeout": 600,  # 10 min — must be > task_time_limit, < watchdog
    },

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
            # Every 10 min. The watchdog only resets records older than
            # _ANALYSIS_TIMEOUT (17 min), so a 10-min cadence still detects a
            # stuck record within ~10 min of it crossing the threshold while
            # halving the per-day Celery log volume this task generates (it is
            # by far the most frequent thing in the worker logs).
            "task": "reset_stuck_analyses",
            "schedule": timedelta(minutes=10),
        },
        "validate-openrouter-models": {
            "task": "validate_openrouter_models",
            "schedule": timedelta(hours=6),
        },
    },
)

logger.info("Celery app configured")
