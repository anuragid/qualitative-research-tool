"""Utility for classifying exceptions into structured error types.

Used by analysis nodes and tasks to produce structured error information
that the frontend can use to show meaningful error messages.
"""

import logging
from typing import Any, Dict

from openai import APIConnectionError, APIError, APIStatusError, RateLimitError

logger = logging.getLogger(__name__)

# Canonical error types
ERROR_TYPE_VALIDATION = "validation_error"
ERROR_TYPE_RATE_LIMIT = "rate_limit"
ERROR_TYPE_NETWORK = "network_error"
ERROR_TYPE_LLM = "llm_error"
ERROR_TYPE_LLM_PERMANENT = "llm_permanent"  # 4xx that no retry/fallback can fix
ERROR_TYPE_INSUFFICIENT_CREDITS = "insufficient_credits"  # 402 — user needs to top up
ERROR_TYPE_TIMEOUT = "timeout"
ERROR_TYPE_UNKNOWN = "unknown"

# HTTP status codes from APIStatusError that are PERMANENT — retrying or
# falling back to another model with the same key won't help. 404 is *not*
# in this set because model fallback can recover from a removed model.
# 408 (request timeout) and 429 (rate limit) are also excluded — those are
# handled as transient via dedicated paths. 402 is split out separately
# as ERROR_TYPE_INSUFFICIENT_CREDITS so the frontend can show a dedicated
# "add credits" UI instead of a generic permanent-error banner.
_PERMANENT_HTTP_CODES = frozenset({400, 401, 403, 422})


def classify_error(exc: Exception) -> str:
    """Classify an exception into a canonical error type string.

    Args:
        exc: The exception to classify.

    Returns:
        One of: "validation_error", "rate_limit", "network_error",
        "llm_error", "llm_permanent", "insufficient_credits", "timeout",
        "unknown".
    """
    if isinstance(exc, ValueError):
        return ERROR_TYPE_VALIDATION
    if isinstance(exc, RateLimitError):
        return ERROR_TYPE_RATE_LIMIT
    if isinstance(exc, APIConnectionError):
        return ERROR_TYPE_NETWORK
    # APIStatusError carries an HTTP status_code; permanent 4xx (other than
    # 404/408/429) cannot be fixed by retrying — classify as permanent so
    # the retry layer fails fast. 402 is split out as "insufficient_credits"
    # so the UI can offer a dedicated "Add credits" CTA.
    if isinstance(exc, APIStatusError):
        code = getattr(exc, "status_code", None)
        if code == 402:
            return ERROR_TYPE_INSUFFICIENT_CREDITS
        if code in _PERMANENT_HTTP_CODES:
            return ERROR_TYPE_LLM_PERMANENT
        return ERROR_TYPE_LLM
    if isinstance(exc, APIError):
        return ERROR_TYPE_LLM
    if isinstance(exc, TimeoutError):
        return ERROR_TYPE_TIMEOUT
    # Check for common timeout-related exception messages
    exc_str = str(exc).lower()
    if "timeout" in exc_str or "timed out" in exc_str:
        return ERROR_TYPE_TIMEOUT
    return ERROR_TYPE_UNKNOWN


def is_retryable(error_type: str) -> bool:
    """Determine whether an error type is generally retryable.

    Args:
        error_type: One of the canonical error type strings.

    Returns:
        True if the error is typically worth retrying.
    """
    return error_type in {
        ERROR_TYPE_RATE_LIMIT,
        ERROR_TYPE_NETWORK,
        ERROR_TYPE_LLM,
        ERROR_TYPE_TIMEOUT,
    }


def build_structured_error(
    step: str,
    exc: Exception,
    message: str | None = None,
    details: str | None = None,
) -> Dict[str, Any]:
    """Build a structured error dict suitable for JSON serialization.

    Args:
        step: The pipeline step that failed (e.g. "chunk", "infer").
        exc: The exception that occurred.
        message: Optional human-readable message (defaults to str(exc)).
        details: Optional technical detail string.

    Returns:
        Dict with keys: step, error_type, retryable, message, details.
    """
    error_type = classify_error(exc)
    return {
        "step": step,
        "error_type": error_type,
        "retryable": is_retryable(error_type),
        "message": message or str(exc),
        "details": details or f"{type(exc).__name__}: {exc}",
    }
