"""Tests for analysis task retry logic and error handling.

Covers: _run_node_with_retry, _build_pipeline_error_json, _sanitize_error,
        and structured error storage in analysis_tasks.py.
"""

import json
from unittest.mock import MagicMock, patch

from app.tasks.analysis_tasks import (
    _build_pipeline_error_json,
    _run_node_with_retry,
    _sanitize_error,
)


class TestRunNodeWithRetry:
    """Tests for _run_node_with_retry helper."""

    def test_success_first_attempt(self):
        """Node succeeds on first call — no retry needed."""
        node_fn = MagicMock(return_value={"error": None, "data": "ok"})
        result = _run_node_with_retry("chunk", node_fn, {"input": 1}, max_retries=2)

        assert result["data"] == "ok"
        assert result.get("error") is None
        assert node_fn.call_count == 1

    @patch("app.tasks.analysis_tasks.time.sleep")
    def test_success_after_retry(self, mock_sleep):
        """Node fails with retryable error, then succeeds on retry."""
        fail_state = {"error": "rate limit", "error_type": "rate_limit"}
        ok_state = {"error": None, "data": "recovered"}
        node_fn = MagicMock(side_effect=[fail_state, ok_state])

        result = _run_node_with_retry("infer", node_fn, {}, max_retries=2)
        assert result["data"] == "recovered"
        assert result.get("error") is None
        assert node_fn.call_count == 2
        # Verify exponential backoff was used
        mock_sleep.assert_called_once()

    @patch("app.tasks.analysis_tasks.time.sleep")
    def test_failure_after_max_retries(self, mock_sleep):
        """Node fails every attempt — gives up after max_retries."""
        fail_state = {"error": "timeout", "error_type": "timeout"}
        node_fn = MagicMock(return_value=fail_state)

        result = _run_node_with_retry("relate", node_fn, {}, max_retries=2)
        assert result["error"] == "timeout"
        # 1 initial + 2 retries = 3 total calls
        assert node_fn.call_count == 3
        assert mock_sleep.call_count == 2

    def test_non_retryable_error_no_retry(self):
        """Non-retryable error (validation) should not be retried."""
        fail_state = {"error": "bad input", "error_type": "validation_error"}
        node_fn = MagicMock(return_value=fail_state)

        result = _run_node_with_retry("chunk", node_fn, {}, max_retries=2)
        assert result["error"] == "bad input"
        assert node_fn.call_count == 1  # No retries

    def test_unknown_error_type_not_retried(self):
        """Unknown error type defaults to non-retryable."""
        fail_state = {"error": "something weird", "error_type": "unknown"}
        node_fn = MagicMock(return_value=fail_state)

        result = _run_node_with_retry("explain", node_fn, {}, max_retries=2)
        assert result["error"] == "something weird"
        assert node_fn.call_count == 1

    def test_missing_error_type_defaults_to_unknown(self):
        """If error_type is not in state, it defaults to 'unknown' (non-retryable)."""
        fail_state = {"error": "oops"}  # no error_type key
        node_fn = MagicMock(return_value=fail_state)

        result = _run_node_with_retry("activate", node_fn, {}, max_retries=2)
        assert result["error"] == "oops"
        assert node_fn.call_count == 1

    @patch("app.tasks.analysis_tasks.time.sleep")
    def test_error_state_cleared_before_retry(self, mock_sleep):
        """On retry, the error and error_type should be cleared from state."""
        call_count = 0

        def node_fn(state):
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                return {"error": "network fail", "error_type": "network_error", "data": state}
            # Second call: verify error was cleared
            assert state.get("error") is None
            assert state.get("error_type") is None
            return {"error": None, "data": "ok"}

        result = _run_node_with_retry("chunk", node_fn, {"input": 1}, max_retries=1)
        assert result["data"] == "ok"

    @patch("app.tasks.analysis_tasks.time.sleep")
    def test_exponential_backoff_delays(self, mock_sleep):
        """Verify exponential backoff: delay = base * 2^attempt."""
        fail_state = {"error": "rate_limit", "error_type": "rate_limit"}
        node_fn = MagicMock(return_value=fail_state)

        _run_node_with_retry("chunk", node_fn, {}, max_retries=3)

        # Calls: attempt 0 fail, sleep(2*1=2), attempt 1 fail, sleep(2*2=4),
        #        attempt 2 fail, sleep(2*4=8), attempt 3 fail => gives up
        delays = [call.args[0] for call in mock_sleep.call_args_list]
        assert delays == [2.0, 4.0, 8.0]

    def test_zero_max_retries(self):
        """With max_retries=0, node runs once and fails without retry."""
        fail_state = {"error": "fail", "error_type": "rate_limit"}
        node_fn = MagicMock(return_value=fail_state)

        result = _run_node_with_retry("chunk", node_fn, {}, max_retries=0)
        assert result["error"] == "fail"
        assert node_fn.call_count == 1


class TestBuildPipelineErrorJson:
    """Tests for _build_pipeline_error_json."""

    def test_basic_output_format(self):
        result = json.loads(_build_pipeline_error_json("chunk", "something broke"))
        assert result["step"] == "chunk"
        assert result["error_type"] == "unknown"
        assert result["retryable"] is False
        assert "chunk" in result["message"]
        assert result["details"] == "something broke"

    def test_with_error_type(self):
        result = json.loads(
            _build_pipeline_error_json("infer", "rate limited", "rate_limit")
        )
        assert result["error_type"] == "rate_limit"
        assert result["retryable"] is True

    def test_none_error_type_defaults_to_unknown(self):
        result = json.loads(
            _build_pipeline_error_json("relate", "error msg", None)
        )
        assert result["error_type"] == "unknown"
        assert result["retryable"] is False

    def test_valid_json(self):
        """Output should always be valid JSON."""
        raw = _build_pipeline_error_json("explain", "error with \"quotes\" and \\slashes")
        parsed = json.loads(raw)
        assert isinstance(parsed, dict)


class TestSanitizeError:
    """Tests for _sanitize_error API key redaction."""

    def test_openrouter_key_redacted(self):
        msg = "Error with key sk-or-v1-abcdefghijklmnopqrstuvwxyz1234567890"
        result = _sanitize_error(msg)
        assert "sk-or-v1-abcd***REDACTED***" in result
        assert "1234567890" not in result

    def test_openai_key_redacted(self):
        msg = "Auth failed: sk-abcdefghijklmnopqrstuvwxyz12345678"
        result = _sanitize_error(msg)
        assert "sk-abcd***REDACTED***" in result

    def test_bearer_token_redacted(self):
        msg = "Header: Bearer eyJhbGciOiJSUzI1NiIsInR5cCIabcdefghijklmno"
        result = _sanitize_error(msg)
        assert "Bearer ***REDACTED***" in result

    def test_no_key_unchanged(self):
        msg = "Normal error message with no keys"
        result = _sanitize_error(msg)
        assert result == msg

    def test_empty_message(self):
        assert _sanitize_error("") == ""

    def test_multiple_keys_all_redacted(self):
        msg = "Keys: sk-or-v1-aaaaaabbbbbbccccccddddddeeeeeeffffffff and sk-1111222233334444555566667777"
        result = _sanitize_error(msg)
        assert "aaaaaabbbbbb" not in result
        assert "1111222233334444" not in result


class TestPipelineErrorIntegration:
    """Integration-style tests verifying structured error flow."""

    def test_pipeline_error_class(self):
        """_PipelineError carries structured JSON."""
        from app.tasks.analysis_tasks import _PipelineError

        err = _PipelineError("msg", structured_json='{"step":"chunk"}')
        assert str(err) == "msg"
        assert err.structured_json == '{"step":"chunk"}'

    def test_pipeline_error_without_json(self):
        from app.tasks.analysis_tasks import _PipelineError

        err = _PipelineError("just a message")
        assert err.structured_json is None
