"""Sentry SDK initialization for both FastAPI and Celery worker processes.

Call `init_sentry()` once per process — in main.py (API) and via
the celeryd_init signal (worker). If SENTRY_DSN is unset or empty,
Sentry is silently disabled.
"""

import os

import sentry_sdk
from sentry_sdk.integrations.openai import OpenAIIntegration


def _drop_404_transactions(event, hint):
    """Drop HTTP 404 transactions before they reach Sentry.

    The public origin is constantly probed by automated vulnerability
    scanners requesting paths like ``/.env``, ``/config.php``, ``/phpinfo``
    and database dumps. Every one 404s, but the sampled transactions still
    pollute the tracing data and burn span quota. A 404 transaction has no
    diagnostic value, so we discard it. Returning ``None`` tells the SDK to
    drop the event; any other event passes through unchanged.
    """
    trace = (event.get("contexts") or {}).get("trace") or {}
    if trace.get("status") == "not_found":
        return None
    tags = event.get("tags") or {}
    if isinstance(tags, dict) and str(tags.get("http.status_code")) == "404":
        return None
    return event


def init_sentry() -> None:
    dsn = os.environ.get("SENTRY_DSN", "")
    if not dsn:
        return

    # Only enable Sentry in production — dev errors are noise
    app_env = os.environ.get("APP_ENV", "production")
    if app_env == "development":
        return

    sentry_sdk.init(
        dsn=dsn,
        environment=os.environ.get("SENTRY_ENVIRONMENT", os.environ.get("APP_ENV", "production")),
        release=os.environ.get("SENTRY_RELEASE", os.environ.get("RAILWAY_GIT_COMMIT_SHA")),
        send_default_pii=False,

        # Discard 404 transactions (almost entirely vuln-scanner probes).
        before_send_transaction=_drop_404_transactions,

        integrations=[
            OpenAIIntegration(
                include_prompts=False,
            ),
        ],

        # Tracing — sample 10% to balance observability vs data volume
        traces_sample_rate=0.1,

        # Continuous profiling tied to active spans
        profile_session_sample_rate=0.1,
        profile_lifecycle="trace",

        # Structured logs
        enable_logs=True,
    )
