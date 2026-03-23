"""Tests for the error classification utility.

Covers: classify_error, is_retryable, build_structured_error, structured_error_json.
"""

import json

import httpx
from openai import APIConnectionError, APIError, RateLimitError

from app.utils.error_classification import (
    ERROR_TYPE_LLM,
    ERROR_TYPE_NETWORK,
    ERROR_TYPE_RATE_LIMIT,
    ERROR_TYPE_TIMEOUT,
    ERROR_TYPE_UNKNOWN,
    ERROR_TYPE_VALIDATION,
    build_structured_error,
    classify_error,
    is_retryable,
    structured_error_json,
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


class TestStructuredErrorJson:
    """structured_error_json returns a valid JSON string."""

    def test_valid_json(self):
        result = structured_error_json("chunk", ValueError("bad"))
        parsed = json.loads(result)
        assert parsed["step"] == "chunk"
        assert parsed["error_type"] == ERROR_TYPE_VALIDATION

    def test_custom_args(self):
        result = structured_error_json(
            "infer", Exception("x"), message="msg", details="det"
        )
        parsed = json.loads(result)
        assert parsed["message"] == "msg"
        assert parsed["details"] == "det"

    def test_unicode_in_message(self):
        result = structured_error_json("chunk", Exception("unicode: \u00e9\u00e0\u00fc"))
        parsed = json.loads(result)
        assert "\u00e9" in parsed["message"]
