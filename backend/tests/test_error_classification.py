"""Tests for the error classification utility.

Covers: classify_error, is_retryable, build_structured_error.
"""


import httpx
from openai import APIConnectionError, APIError, APIStatusError, RateLimitError

from app.utils.error_classification import (
    ERROR_TYPE_INSUFFICIENT_CREDITS,
    ERROR_TYPE_LLM,
    ERROR_TYPE_LLM_PERMANENT,
    ERROR_TYPE_NETWORK,
    ERROR_TYPE_RATE_LIMIT,
    ERROR_TYPE_TIMEOUT,
    ERROR_TYPE_UNKNOWN,
    ERROR_TYPE_VALIDATION,
    build_structured_error,
    classify_error,
    is_retryable,
)

# ---------------------------------------------------------------------------
# helpers to build openai-style exceptions that require an httpx Response
# ---------------------------------------------------------------------------

def _make_response(status_code: int = 500, body: str = "{}") -> httpx.Response:
    """Create a minimal httpx.Response for openai exception constructors."""
    return httpx.Response(
        status_code=status_code,
        request=httpx.Request("POST", "https://api.openrouter.ai/v1/chat/completions"),
        content=body.encode(),
    )


class TestClassifyError:
    """classify_error should map exceptions to canonical error type strings."""

    def test_value_error(self):
        assert classify_error(ValueError("bad input")) == ERROR_TYPE_VALIDATION

    def test_rate_limit_error(self):
        exc = RateLimitError(
            message="rate limited",
            response=_make_response(429),
            body=None,
        )
        assert classify_error(exc) == ERROR_TYPE_RATE_LIMIT

    def test_api_connection_error(self):
        exc = APIConnectionError(request=httpx.Request("POST", "https://x.com"))
        assert classify_error(exc) == ERROR_TYPE_NETWORK

    def test_api_error(self):
        exc = APIError(
            message="server error",
            request=httpx.Request("POST", "https://x.com"),
            body=None,
        )
        assert classify_error(exc) == ERROR_TYPE_LLM

    def test_api_status_error_402_classifies_as_insufficient_credits(self):
        """402 from OpenRouter classifies as ERROR_TYPE_INSUFFICIENT_CREDITS.

        This is split out from ERROR_TYPE_LLM_PERMANENT so the frontend can
        render a dedicated 'Add credits on OpenRouter' CTA instead of a
        generic permanent-error banner. Both types are equally non-retryable
        but the frontend UX differs.
        """
        exc = APIStatusError(
            message="insufficient credits",
            response=_make_response(402),
            body=None,
        )
        error_type = classify_error(exc)
        assert error_type == ERROR_TYPE_INSUFFICIENT_CREDITS, (
            f"402 should classify as 'insufficient_credits', got {error_type!r}"
        )
        # And must still be non-retryable — the original fail-fast behavior
        # from last session's fix must be preserved.
        assert is_retryable(error_type) is False

    def test_api_status_error_401_unauthorized_is_llm_permanent(self):
        """401 (bad/missing API key) is permanent, classified as llm_permanent."""
        exc = APIStatusError(
            message="unauthorized",
            response=_make_response(401),
            body=None,
        )
        assert classify_error(exc) == ERROR_TYPE_LLM_PERMANENT
        assert is_retryable(classify_error(exc)) is False

    def test_api_status_error_403_forbidden_is_llm_permanent(self):
        """403 (forbidden / no model access) is permanent, classified as llm_permanent."""
        exc = APIStatusError(
            message="forbidden",
            response=_make_response(403),
            body=None,
        )
        assert classify_error(exc) == ERROR_TYPE_LLM_PERMANENT
        assert is_retryable(classify_error(exc)) is False

    def test_api_status_error_400_bad_request_is_llm_permanent(self):
        """400 (malformed payload) is permanent, classified as llm_permanent."""
        exc = APIStatusError(
            message="bad request",
            response=_make_response(400),
            body=None,
        )
        assert classify_error(exc) == ERROR_TYPE_LLM_PERMANENT
        assert is_retryable(classify_error(exc)) is False

    def test_api_status_error_422_unprocessable_is_llm_permanent(self):
        """422 (validation against schema) is permanent, classified as llm_permanent."""
        exc = APIStatusError(
            message="unprocessable entity",
            response=_make_response(422),
            body=None,
        )
        assert classify_error(exc) == ERROR_TYPE_LLM_PERMANENT
        assert is_retryable(classify_error(exc)) is False

    def test_api_status_error_500_server_error_is_retryable(self):
        """5xx is transient — server-side issue that may resolve."""
        exc = APIStatusError(
            message="internal server error",
            response=_make_response(500),
            body=None,
        )
        assert is_retryable(classify_error(exc)) is True

    def test_api_status_error_503_service_unavailable_is_retryable(self):
        """503 is transient."""
        exc = APIStatusError(
            message="service unavailable",
            response=_make_response(503),
            body=None,
        )
        assert is_retryable(classify_error(exc)) is True

    def test_timeout_error(self):
        assert classify_error(TimeoutError("timed out")) == ERROR_TYPE_TIMEOUT

    def test_generic_exception(self):
        assert classify_error(Exception("oops")) == ERROR_TYPE_UNKNOWN

    def test_runtime_error(self):
        assert classify_error(RuntimeError("something")) == ERROR_TYPE_UNKNOWN

    def test_message_based_timeout_detection(self):
        """Exceptions with 'timeout' in their message should classify as timeout."""
        assert classify_error(Exception("connection timed out")) == ERROR_TYPE_TIMEOUT
        assert classify_error(Exception("Request timeout reached")) == ERROR_TYPE_TIMEOUT

    def test_empty_message(self):
        assert classify_error(Exception("")) == ERROR_TYPE_UNKNOWN

    def test_very_long_message(self):
        msg = "x" * 10_000
        assert classify_error(Exception(msg)) == ERROR_TYPE_UNKNOWN


class TestIsRetryable:
    """is_retryable returns True for transient error types, False otherwise."""

    def test_rate_limit_is_retryable(self):
        assert is_retryable(ERROR_TYPE_RATE_LIMIT) is True

    def test_network_is_retryable(self):
        assert is_retryable(ERROR_TYPE_NETWORK) is True

    def test_llm_is_retryable(self):
        assert is_retryable(ERROR_TYPE_LLM) is True

    def test_timeout_is_retryable(self):
        assert is_retryable(ERROR_TYPE_TIMEOUT) is True

    def test_validation_not_retryable(self):
        assert is_retryable(ERROR_TYPE_VALIDATION) is False

    def test_llm_permanent_not_retryable(self):
        assert is_retryable(ERROR_TYPE_LLM_PERMANENT) is False

    def test_insufficient_credits_not_retryable(self):
        """402 must never autoretry — the account either has credits or it doesn't."""
        assert is_retryable(ERROR_TYPE_INSUFFICIENT_CREDITS) is False

    def test_unknown_not_retryable(self):
        assert is_retryable(ERROR_TYPE_UNKNOWN) is False

    def test_arbitrary_string_not_retryable(self):
        assert is_retryable("bogus") is False


class TestBuildStructuredError:
    """build_structured_error returns a dict with all required fields."""

    def test_basic_structure(self):
        err = build_structured_error("chunk", ValueError("bad"))
        assert err["step"] == "chunk"
        assert err["error_type"] == ERROR_TYPE_VALIDATION
        assert err["retryable"] is False
        assert "bad" in err["message"]
        assert "ValueError" in err["details"]

    def test_custom_message(self):
        err = build_structured_error("infer", Exception("x"), message="custom msg")
        assert err["message"] == "custom msg"

    def test_custom_details(self):
        err = build_structured_error("relate", Exception("x"), details="extra detail")
        assert err["details"] == "extra detail"

    def test_none_message_falls_back_to_str_exc(self):
        err = build_structured_error("explain", Exception("fallback"))
        assert err["message"] == "fallback"

    def test_empty_exception_message(self):
        err = build_structured_error("activate", Exception(""))
        assert err["message"] == ""
        assert err["details"] == "Exception: "

    def test_special_characters_in_message(self):
        err = build_structured_error("chunk", Exception('key="val" & <tag>'))
        assert 'key="val"' in err["message"]

    def test_retryable_flag_for_rate_limit(self):
        exc = RateLimitError(
            message="rate limited",
            response=_make_response(429),
            body=None,
        )
        err = build_structured_error("chunk", exc)
        assert err["retryable"] is True
