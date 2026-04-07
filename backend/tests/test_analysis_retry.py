"""Tests for pipeline-error helpers shared across the analysis chain tasks.

After the WS3 chain refactor the monolithic ``_run_node_with_retry``
helper no longer exists — Celery's ``autoretry_for`` decorator on each
per-step task handles retry + backoff directly, and
``test_analysis_step_non_retryable.py`` covers the
``NonRetryableAnalysisError`` short-circuit path.

What remains here is coverage of the structured-error + sanitization
helpers that moved from the deleted ``analysis_tasks.py`` into the
shared ``app.tasks._pipeline_utils`` module.
"""

import json

from app.tasks._pipeline_utils import (
    PipelineError,
    build_pipeline_error_json,
    sanitize_error,
)


class TestBuildPipelineErrorJson:
    """Tests for build_pipeline_error_json."""

    def test_basic_output_format(self):
        result = json.loads(build_pipeline_error_json("chunk", "something broke"))
        assert result["step"] == "chunk"
        assert result["error_type"] == "unknown"
        assert result["retryable"] is False
        assert "chunk" in result["message"]
        assert result["details"] == "something broke"

    def test_with_error_type(self):
        result = json.loads(
            build_pipeline_error_json("infer", "rate limited", "rate_limit")
        )
        assert result["error_type"] == "rate_limit"
        assert result["retryable"] is True

    def test_none_error_type_defaults_to_unknown(self):
        result = json.loads(
            build_pipeline_error_json("relate", "error msg", None)
        )
        assert result["error_type"] == "unknown"
        assert result["retryable"] is False

    def test_valid_json(self):
        """Output should always be valid JSON."""
        raw = build_pipeline_error_json("explain", "error with \"quotes\" and \\slashes")
        parsed = json.loads(raw)
        assert isinstance(parsed, dict)


class TestSanitizeError:
    """Tests for sanitize_error API key redaction."""

    def test_openrouter_key_redacted(self):
        msg = "Error with key sk-or-v1-abcdefghijklmnopqrstuvwxyz1234567890"
        result = sanitize_error(msg)
        assert "sk-or-v1-abcd***REDACTED***" in result
        assert "1234567890" not in result

    def test_openai_key_redacted(self):
        msg = "Auth failed: sk-abcdefghijklmnopqrstuvwxyz12345678"
        result = sanitize_error(msg)
        assert "sk-abcd***REDACTED***" in result

    def test_bearer_token_redacted(self):
        msg = "Header: Bearer eyJhbGciOiJSUzI1NiIsInR5cCIabcdefghijklmno"
        result = sanitize_error(msg)
        assert "Bearer ***REDACTED***" in result

    def test_no_key_unchanged(self):
        msg = "Normal error message with no keys"
        result = sanitize_error(msg)
        assert result == msg

    def test_empty_message(self):
        assert sanitize_error("") == ""

    def test_multiple_keys_all_redacted(self):
        msg = "Keys: sk-or-v1-aaaaaabbbbbbccccccddddddeeeeeeffffffff and sk-1111222233334444555566667777"
        result = sanitize_error(msg)
        assert "aaaaaabbbbbb" not in result
        assert "1111222233334444" not in result


class TestPipelineErrorException:
    """Integration-style tests verifying the PipelineError exception class."""

    def test_pipeline_error_class(self):
        """PipelineError carries structured JSON."""
        err = PipelineError("msg", structured_json='{"step":"chunk"}')
        assert str(err) == "msg"
        assert err.structured_json == '{"step":"chunk"}'

    def test_pipeline_error_without_json(self):
        err = PipelineError("just a message")
        assert err.structured_json is None
