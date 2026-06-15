"""Sentry SDK initialization for both FastAPI and Celery worker processes.

Call `init_sentry()` once per process — in main.py (API) and via
the celeryd_init signal (worker). If SENTRY_DSN is unset or empty,
Sentry is silently disabled.
"""

import json
import logging
import os

import httpx
import sentry_sdk
from sentry_sdk.integrations.logging import LoggingIntegration
from sentry_sdk.integrations.openai import OpenAIIntegration

# Transient transport glitches the OpenAI SDK raises while deserializing an
# OpenRouter HTTP response body (HTTP 200 with a malformed/truncated/streamed
# body). These are retried in-place by the LLM service and recover, but the
# OpenAIIntegration wraps Completions.create() itself and captures the exception
# at the SDK boundary (mechanism type "openai", handled=False) on EVERY attempt
# — before our retry/log-hygiene can see it. There is no per-integration opt-out,
# so before_send is the only lever. See Sentry PYTHON-FASTAPI-R / -12.
_TRANSIENT_OPENAI_DECODE_ERRORS = (
    json.JSONDecodeError,
    httpx.RemoteProtocolError,
    httpx.DecodingError,
)


def _drop_transient_openai_decode_errors(event, hint):
    """Drop the per-attempt OpenAI-SDK capture of a transient body-decode error.

    Only events captured by the OpenAI integration (mechanism.type == "openai")
    are dropped — a genuinely-persistent decode failure still surfaces once at
    Celery retry exhaustion (mechanism.type == "celery"), which is the signal we
    want. Returning ``None`` tells the SDK to discard the event.
    """
    exc_info = hint.get("exc_info") if hint else None
    if not exc_info:
        return event
    exc = exc_info[1]
    if not isinstance(exc, _TRANSIENT_OPENAI_DECODE_ERRORS):
        return event
    values = ((event.get("exception") or {}).get("values")) or []
    for value in values:
        if (value.get("mechanism") or {}).get("type") == "openai":
            return None
    return event


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
        # Discard the per-attempt OpenAI-SDK capture of transient body-decode
        # errors that the LLM service retries and recovers from.
        before_send=_drop_transient_openai_decode_errors,

        integrations=[
            # Pin the LoggingIntegration event level explicitly. It is auto-enabled
            # with this same default, but the log-hygiene contract (logger.error ->
            # Sentry issue, logger.warning -> breadcrumb/log only) is load-bearing,
            # so make it resistant to a future default_integrations=False refactor.
            LoggingIntegration(level=logging.INFO, event_level=logging.ERROR),
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
