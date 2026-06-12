"""Tests for Sentry SDK configuration security."""

import os
from unittest.mock import patch


def test_sentry_does_not_send_pii():
    """Sentry must NOT send default PII (IPs, emails, cookies)."""
    with patch.dict(os.environ, {"SENTRY_DSN": "https://fake@sentry.io/1", "APP_ENV": "production"}):
        with patch("sentry_sdk.init") as mock_init:
            import importlib

            import app.sentry_setup
            importlib.reload(app.sentry_setup)
            app.sentry_setup.init_sentry()

            mock_init.assert_called_once()
            call_kwargs = mock_init.call_args[1]
            assert call_kwargs.get("send_default_pii") is False, \
                "send_default_pii must be False to avoid capturing user IPs and emails"


def test_sentry_does_not_include_prompts():
    """OpenAI integration must NOT include prompts (contains research transcripts)."""
    with patch.dict(os.environ, {"SENTRY_DSN": "https://fake@sentry.io/1", "APP_ENV": "production"}):
        with patch("sentry_sdk.init") as mock_init:
            import importlib

            import app.sentry_setup
            importlib.reload(app.sentry_setup)
            app.sentry_setup.init_sentry()

            call_kwargs = mock_init.call_args[1]
            integrations = call_kwargs.get("integrations", [])
            for integration in integrations:
                if hasattr(integration, "include_prompts"):
                    assert integration.include_prompts is False, \
                        "include_prompts must be False to avoid logging research data"


def test_sentry_sampling_is_reasonable():
    """Trace and profile sampling should not be 100% in production."""
    with patch.dict(os.environ, {"SENTRY_DSN": "https://fake@sentry.io/1", "APP_ENV": "production"}):
        with patch("sentry_sdk.init") as mock_init:
            import importlib

            import app.sentry_setup
            importlib.reload(app.sentry_setup)
            app.sentry_setup.init_sentry()

            call_kwargs = mock_init.call_args[1]
            assert call_kwargs.get("traces_sample_rate", 1.0) <= 0.2, \
                "traces_sample_rate should be <= 0.2 to avoid excessive data capture"
            assert call_kwargs.get("profile_session_sample_rate", 1.0) <= 0.2, \
                "profile_session_sample_rate should be <= 0.2"


def test_sentry_wires_404_transaction_filter():
    """init_sentry must register the 404 transaction filter."""
    with patch.dict(os.environ, {"SENTRY_DSN": "https://fake@sentry.io/1", "APP_ENV": "production"}):
        with patch("sentry_sdk.init") as mock_init:
            import importlib

            import app.sentry_setup
            importlib.reload(app.sentry_setup)
            app.sentry_setup.init_sentry()

            call_kwargs = mock_init.call_args[1]
            assert call_kwargs.get("before_send_transaction") is app.sentry_setup._drop_404_transactions


def test_drop_404_transactions_drops_not_found():
    """404 transactions (scanner probes) are dropped via trace status or status tag."""
    from app.sentry_setup import _drop_404_transactions

    by_trace_status = {"contexts": {"trace": {"status": "not_found"}}}
    assert _drop_404_transactions(by_trace_status, None) is None

    by_status_tag = {"tags": {"http.status_code": "404"}}
    assert _drop_404_transactions(by_status_tag, None) is None


def test_drop_404_transactions_keeps_real_traffic():
    """Successful (and non-404) transactions pass through unchanged."""
    from app.sentry_setup import _drop_404_transactions

    ok_event = {"contexts": {"trace": {"status": "ok"}}, "tags": {"http.status_code": "200"}}
    assert _drop_404_transactions(ok_event, None) is ok_event

    server_error = {"contexts": {"trace": {"status": "internal_error"}}, "tags": {"http.status_code": "500"}}
    assert _drop_404_transactions(server_error, None) is server_error

    # Missing contexts/tags must not raise.
    assert _drop_404_transactions({}, None) == {}
