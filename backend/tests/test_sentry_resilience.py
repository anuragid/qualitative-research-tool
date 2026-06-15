"""Regression tests for the 2026-06-15 Sentry hardening batch.

Ties each production Sentry issue cluster to a test:

- Cluster B/C/D (LLM returns null content / unparseable output / malformed
  HTTP body): these are TRANSIENT LLM failures that were being classified as
  ``validation_error`` -> non-retryable -> ``NonRetryableAnalysisError`` ->
  the user's analysis permanently errored on a single bad model response.
  They must classify as ``llm_error`` (retryable) so Celery autoretries.
  (PYTHON-FASTAPI-11, -1A, -19, -15, -16, -17, -18, -R, -12)

- Log hygiene: Sentry's LoggingIntegration turns ``logger.error`` into issues.
  A handled/recoverable failure (one that falls back or will be retried) must
  log at WARNING (breadcrumb), not ERROR (issue). Only genuinely unrecoverable
  failures stay ERROR.

See also test_project_analysis_chain.py (Cluster A — redelivery idempotency)
and test_llm_service_retry.py (tenacity-level retry of decode failures).
"""

import json
import logging

import httpx
import pytest

from app.sentry_setup import _drop_transient_openai_decode_errors
from app.services.llm_service import LLMService, LLMUnusableResponseError
from app.tasks.analysis_steps import NonRetryableAnalysisError, _raise_for_node_error
from app.utils.error_classification import (
    ERROR_TYPE_LLM,
    ERROR_TYPE_VALIDATION,
    classify_error,
    is_retryable,
)

# ---------------------------------------------------------------------------
# classify_error: LLM-output failures are retryable, genuine ValueErrors aren't
# ---------------------------------------------------------------------------


class TestClassifyErrorRetryability:
    def test_llm_unusable_response_is_retryable_llm_error(self):
        """Null content / unparseable output -> llm_error (retryable), NOT
        validation_error. This is the core fix for clusters B and C: a single
        empty/garbled model response must not permanently fail the analysis."""
        exc = LLMUnusableResponseError(
            "LLM returned null content (model=x). Finish reason: length"
        )
        assert classify_error(exc) == ERROR_TYPE_LLM
        assert is_retryable(classify_error(exc)) is True

    def test_json_decode_error_is_retryable_llm_error(self):
        """A JSONDecodeError from the OpenAI SDK deserializing a malformed HTTP
        body (cluster D) is a transient transport problem -> llm_error."""
        exc = json.JSONDecodeError("Expecting value", "line 147 garbage", 803)
        assert classify_error(exc) == ERROR_TYPE_LLM
        assert is_retryable(classify_error(exc)) is True

    def test_plain_value_error_still_validation_error(self):
        """A genuine ValueError (our own data validation) stays non-retryable
        validation_error — we only reclassify the LLM-output subclass."""
        assert classify_error(ValueError("bad input")) == ERROR_TYPE_VALIDATION
        assert is_retryable(ERROR_TYPE_VALIDATION) is False

    def test_llm_unusable_is_a_value_error_subclass(self):
        """LLMUnusableResponseError must subclass ValueError so call_llm's
        existing ``except ValueError`` fallback loop still advances models."""
        assert issubclass(LLMUnusableResponseError, ValueError)


# ---------------------------------------------------------------------------
# _raise_for_node_error: retryable error_type -> retryable Exception (autoretry)
# ---------------------------------------------------------------------------


class TestRaiseForNodeErrorRetryability:
    def test_llm_error_raises_retryable_exception(self):
        """error_type=llm_error must raise a plain Exception (caught by Celery
        autoretry_for=(Exception,)), NOT NonRetryableAnalysisError."""
        with pytest.raises(Exception) as exc_info:
            _raise_for_node_error(
                "cross_relate",
                {"error": "LLM returned null content", "error_type": "llm_error"},
            )
        assert not isinstance(exc_info.value, NonRetryableAnalysisError), (
            "llm_error is retryable; raising NonRetryableAnalysisError permanently "
            "fails the analysis on a transient LLM hiccup (the production bug)."
        )

    def test_validation_error_still_non_retryable(self):
        """A genuine validation_error stays non-retryable (unchanged)."""
        with pytest.raises(NonRetryableAnalysisError):
            _raise_for_node_error(
                "cross_relate",
                {"error": "schema mismatch", "error_type": "validation_error"},
            )


# ---------------------------------------------------------------------------
# Log hygiene — handled failures must not reach Sentry as ERROR-level events
# ---------------------------------------------------------------------------


class TestLogHygiene:
    def _svc(self):
        from unittest.mock import MagicMock

        svc = LLMService()
        svc._client = MagicMock()
        return svc

    def test_parse_failure_logs_warning_not_error(self, caplog):
        """parse_json_response on unparseable content is handled (raised and
        retried upstream); it must log at WARNING, not ERROR (was -18)."""
        svc = self._svc()
        with caplog.at_level(logging.DEBUG, logger="app.services.llm_service"):
            with pytest.raises(ValueError):
                svc.parse_json_response("I need to analyze these patterns... no JSON here")
        errors = [r for r in caplog.records if r.levelno >= logging.ERROR]
        assert not errors, f"parse failure should not log ERROR, got: {[r.message for r in errors]}"

    def test_null_content_does_not_log_error_in_single_call(self, caplog):
        """A null-content response is handled by the fallback loop; the inner
        _call_llm_single must not log it at ERROR (was -11/-1A/-19). The
        JSONDecodeError-inside-create() case (-12/-R) is captured by the OpenAI
        SDK integration at the boundary, not by this logger — it is suppressed
        by the before_send hook in sentry_setup.py (see TestBeforeSendDropsTransientOpenAIDecode)."""
        from unittest.mock import MagicMock

        svc = self._svc()
        client = MagicMock()
        client.chat.completions.create.return_value = MagicMock(
            choices=[MagicMock(message=MagicMock(content=None, refusal=None), finish_reason="length")]
        )
        with caplog.at_level(logging.DEBUG, logger="app.services.llm_service"):
            with pytest.raises(LLMUnusableResponseError):
                svc._call_llm_single(
                    system_prompt="s",
                    user_message="m",
                    max_tokens=100,
                    temperature=0.0,
                    model="deepseek/deepseek-chat-v3-0324",
                    client=client,
                )
        errors = [r for r in caplog.records if r.levelno >= logging.ERROR]
        assert not errors, f"null content is handled; should not log ERROR, got: {[r.message for r in errors]}"

    def test_node_logs_warning_for_retryable_error(self, caplog, monkeypatch):
        """cross_relate_node catching a retryable LLM failure logs WARNING, not
        ERROR (was -17: 'ValueError: Could not parse JSON' surfaced as an issue)."""
        from app.agents.nodes import cross_relate as cr_mod

        def boom(*a, **k):
            raise LLMUnusableResponseError("Could not parse JSON from LLM response")

        monkeypatch.setattr(cr_mod.llm_service, "call_with_json_list_response", boom)
        state = {
            "project_id": "p", "video_ids": ["v1"],
            "video_patterns": [{"pattern_id": "p1", "text": "x"}],
            "video_insights": [], "video_principles": [],
            "api_key": None, "model": None,
        }
        with caplog.at_level(logging.DEBUG, logger="app.agents.nodes.cross_relate"):
            result = cr_mod.cross_relate_node(state)
        assert result["error_type"] == ERROR_TYPE_LLM
        errors = [r for r in caplog.records if r.levelno >= logging.ERROR]
        assert not errors, f"retryable node error should log WARNING not ERROR, got: {[r.message for r in errors]}"

    def test_node_after_retry_validation_failure_logs_warning(self, caplog, monkeypatch):
        """The in-node OutputValidationError-after-retry branch returns a
        RETRYABLE error_type='llm_error' (the step autoretries), so it must log
        WARNING not ERROR. Parseable-but-schema-invalid output fails validation
        on both the first call and the retry, hitting that inner branch."""
        from app.agents.nodes import cross_relate as cr_mod

        monkeypatch.setattr(
            cr_mod.llm_service,
            "call_with_json_list_response",
            lambda *a, **k: [{"foo": "bar"}],  # valid JSON, invalid meta-pattern schema
        )
        state = {
            "project_id": "p", "video_ids": ["v1"],
            "video_patterns": [{"pattern_id": "p1", "text": "x"}],
            "video_insights": [], "video_principles": [],
            "api_key": None, "model": None,
        }
        with caplog.at_level(logging.DEBUG, logger="app.agents.nodes.cross_relate"):
            result = cr_mod.cross_relate_node(state)
        assert result["error_type"] == ERROR_TYPE_LLM
        errors = [r for r in caplog.records if r.levelno >= logging.ERROR]
        assert not errors, f"after-retry validation failure (retryable) must not log ERROR, got: {[r.message for r in errors]}"
        assert any("after retry" in r.message for r in caplog.records if r.levelno == logging.WARNING)


# ---------------------------------------------------------------------------
# before_send: suppress the per-attempt OpenAI-SDK decode capture (-R / -12)
# ---------------------------------------------------------------------------


class TestBeforeSendDropsTransientOpenAIDecode:
    """The OpenAIIntegration captures a JSONDecodeError raised inside
    client.chat.completions.create() at the SDK boundary (mechanism type
    'openai', handled:False) on EVERY attempt, independent of our tenacity
    retry/recovery and log level. The before_send hook drops those transient
    captures so PYTHON-FASTAPI-R/-12 stop firing, while still letting a
    genuinely-persistent failure surface once at Celery retry exhaustion."""

    @staticmethod
    def _event(mechanism_type):
        return {
            "exception": {
                "values": [
                    {
                        "type": "JSONDecodeError",
                        "value": "Expecting value: line 147 column 1 (char 803)",
                        "mechanism": {"type": mechanism_type, "handled": False},
                    }
                ]
            }
        }

    @staticmethod
    def _hint(exc):
        return {"exc_info": (type(exc), exc, None)}

    def test_drops_openai_mechanism_json_decode_error(self):
        exc = json.JSONDecodeError("Expecting value", "line 147 garbage", 803)
        assert _drop_transient_openai_decode_errors(self._event("openai"), self._hint(exc)) is None

    def test_drops_openai_mechanism_httpx_remote_protocol_error(self):
        exc = httpx.RemoteProtocolError("peer closed connection mid-body")
        assert _drop_transient_openai_decode_errors(self._event("openai"), self._hint(exc)) is None

    def test_keeps_celery_mechanism_decode_error_for_exhaustion_signal(self):
        """A decode error surfaced via Celery (retry exhaustion) is a genuine
        persistent failure and must NOT be dropped."""
        exc = json.JSONDecodeError("Expecting value", "x", 0)
        event = self._event("celery")
        assert _drop_transient_openai_decode_errors(event, self._hint(exc)) is event

    def test_keeps_non_decode_openai_exception(self):
        """A non-decode error captured by the OpenAI integration (e.g. a real
        API error) must NOT be dropped."""
        event = self._event("openai")
        assert _drop_transient_openai_decode_errors(event, self._hint(ValueError("boom"))) is event

    def test_keeps_event_without_exc_info(self):
        event = self._event("openai")
        assert _drop_transient_openai_decode_errors(event, {}) is event


# ---------------------------------------------------------------------------
# Cluster A sibling: per-video chunk redelivery on a completed row is a no-op
# ---------------------------------------------------------------------------


class TestPerVideoCancellationOnCompleted:
    """_check_cancellation must treat a 'completed' VideoAnalysis as a stop
    signal so a Celery-redelivered per-video step (e.g. analyze_chunk_step,
    which would otherwise fire CHAIN_STARTED — illegal from completed) is a
    clean no-op. Mirrors the cross-video guard."""

    def _db_with_status(self, status):
        from unittest.mock import MagicMock

        analysis = MagicMock()
        analysis.status = status
        db = MagicMock()
        db.query.return_value.filter.return_value.first.return_value = analysis
        return db

    def test_completed_row_is_cancelled(self):
        from uuid import uuid4

        from app.tasks.analysis_steps import _check_cancellation

        assert _check_cancellation(self._db_with_status("completed"), str(uuid4())) is True

    def test_error_row_is_cancelled(self):
        from uuid import uuid4

        from app.tasks.analysis_steps import _check_cancellation

        assert _check_cancellation(self._db_with_status("error"), str(uuid4())) is True

    def test_processing_row_is_not_cancelled(self):
        from uuid import uuid4

        from app.tasks.analysis_steps import _check_cancellation

        assert _check_cancellation(self._db_with_status("processing"), str(uuid4())) is False
