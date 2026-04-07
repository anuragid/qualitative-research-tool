"""Shared helpers for the analysis pipeline tasks.

Extracted from the pre-refactor analysis_tasks.py so that step tasks
and the chain error handler can share the same sanitization and
structured-error logic.
"""

import json
import re
from typing import Optional

from app.utils.error_classification import build_structured_error, is_retryable

# Pattern matches common API key formats (OpenRouter sk-or-*, generic long tokens)
_API_KEY_PATTERN = re.compile(
    r"(sk-or-v1-[A-Za-z0-9]{4})[A-Za-z0-9]{20,}"  # OpenRouter keys
    r"|"
    r"(sk-[A-Za-z0-9]{4})[A-Za-z0-9]{20,}"  # OpenAI-style keys
    r"|"
    r"(Bearer\s+)[A-Za-z0-9_\-]{20,}"  # Bearer tokens in error messages
    r"|"
    r"([a-f0-9]{4})[a-f0-9]{28,}"  # AssemblyAI and other hex keys
)


def sanitize_error(message: str) -> str:
    """Strip potential API key material from error messages before storage."""
    return _API_KEY_PATTERN.sub(
        lambda m: (m.group(1) or m.group(2) or m.group(3) or m.group(4) or "") + "***REDACTED***",
        message,
    )


def build_error_json(step: str, exc: Exception, message: str) -> str:
    """Build a structured error JSON string from pipeline state info."""
    return json.dumps(build_structured_error(
        step=step,
        exc=exc,
        message=sanitize_error(message),
    ))


def build_pipeline_error_json(failed_step: str, error_str: str, error_type: Optional[str] = None) -> str:
    """Build a structured error JSON string for a pipeline node failure."""
    etype = error_type or "unknown"
    return json.dumps({
        "step": failed_step,
        "error_type": etype,
        "retryable": is_retryable(etype),
        "message": f"Analysis failed at step '{failed_step}': {error_str}",
        "details": error_str,
    })


class PipelineError(Exception):
    """Internal exception carrying structured error JSON from the pipeline."""

    def __init__(self, message: str, structured_json: Optional[str] = None):
        super().__init__(message)
        self.structured_json = structured_json
