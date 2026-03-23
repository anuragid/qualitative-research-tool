"""Utility for classifying exceptions into structured error types.

Used by analysis nodes and tasks to produce structured error information
that the frontend can use to show meaningful error messages.
"""

import json
import logging
from typing import Any, Dict

from openai import APIConnectionError, APIError, RateLimitError

logger = logging.getLogger(__name__)

# Canonical error types
ERROR_TYPE_VALIDATION = "validation_error"
ERROR_TYPE_RATE_LIMIT = "rate_limit"
ERROR_TYPE_NETWORK = "network_error"
ERROR_TYPE_LLM = "llm_error"
ERROR_TYPE_TIMEOUT = "timeout"
ERROR_TYPE_UNKNOWN = "unknown"


def classify_error(exc: Exception) -> str:
    """Classify an exception into a canonical error type string.

    Args:
        exc: The exception to classify.

    Returns:
        One of: "validation_error", "rate_limit", "network_error",
        "llm_error", "timeout", "unknown".
    """
    if isinstance(exc, ValueError):
        return ERROR_TYPE_VALIDATION
    if isinstance(exc, RateLimitError):
        return ERROR_TYPE_RATE_LIMIT
    if isinstance(exc, APIConnectionError):
        return ERROR_TYPE_NETWORK
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


def structured_error_json(
    step: str,
    exc: Exception,
    message: str | None = None,
    details: str | None = None,
) -> str:
    """Build a structured error and serialize to JSON string.

    Suitable for storing in Text columns like video.error_message.
    """
    return json.dumps(build_structured_error(step, exc, message, details))
