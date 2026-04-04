"""Sentry SDK initialization for both FastAPI and Celery worker processes.

Call `init_sentry()` once per process — in main.py (API) and via
the celeryd_init signal (worker). If SENTRY_DSN is unset or empty,
Sentry is silently disabled.
"""

import os

import sentry_sdk
from sentry_sdk.integrations.openai import OpenAIIntegration


def init_sentry() -> None:
    dsn = os.environ.get("SENTRY_DSN", "")
    if not dsn:
        return

    sentry_sdk.init(
        dsn=dsn,
        environment=os.environ.get("SENTRY_ENVIRONMENT", os.environ.get("APP_ENV", "production")),
        release=os.environ.get("SENTRY_RELEASE", os.environ.get("RAILWAY_GIT_COMMIT_SHA")),
        send_default_pii=False,

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
