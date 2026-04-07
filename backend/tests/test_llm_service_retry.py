"""Tests for LLMService retry classification.

These cover the *getting stuck* failure mode reported in production:
when OpenRouter returns a permanent 4xx (e.g. 402 insufficient credits),
the pipeline used to retry tenacity-style and walk the entire model
fallback chain before giving up — generating ~36 LLM calls per video and
spreading them over many minutes via Celery autoretry.

The desired behavior:
1. ``_call_llm_single`` does NOT retry on permanent 4xx — fails fast.
2. ``call_llm`` does NOT walk the model fallback chain on permanent 4xx —
   the same key would 4xx with every fallback model anyway.
3. Transient errors (5xx, rate limit, connection) DO still retry/fallback.
"""

from unittest.mock import MagicMock, patch

import httpx
import pytest
from openai import APIConnectionError, APIStatusError

from app.constants import STANDARD_MODEL_FALLBACKS
from app.services.llm_service import LLMService


@pytest.fixture(autouse=True)
def _no_real_sleep():
    """Mock all sleeps tenacity uses for retry backoff so tests run instantly."""
    with patch("tenacity.nap.time.sleep"):
        yield


def _make_response(status_code: int) -> httpx.Response:
    return httpx.Response(
        status_code=status_code,
        request=httpx.Request("POST", "https://openrouter.ai/api/v1/chat/completions"),
        content=b"{}",
    )


def _make_402() -> APIStatusError:
    return APIStatusError(
        message=(
            "Error code: 402 - {'error': {'message': 'Insufficient credits. "
            "This account never purchased credits.', 'code': 402}}"
        ),
        response=_make_response(402),
        body=None,
    )


def _make_500() -> APIStatusError:
    return APIStatusError(
        message="internal server error",
        response=_make_response(500),
        body=None,
    )


@pytest.fixture
def service():
    """Fresh LLMService whose default model is a Methodex-allowed model.

    The local .env may set DEFAULT_MODEL to a premium model that the
    server-side enforcement re-adds to the fallback chain, which would
    inflate the expected call counts in fallback tests.  Force a known
    standard model so the fallback chain is exactly STANDARD_MODEL_FALLBACKS.
    """
    s = LLMService()
    s.default_model = STANDARD_MODEL_FALLBACKS[0]
    return s


@pytest.fixture
def mock_client_402():
    """Sync client whose chat.completions.create raises 402 every time."""
    client = MagicMock()
    client.chat.completions.create.side_effect = _make_402()
    return client


@pytest.fixture
def mock_client_500_then_ok():
    """Sync client that returns 500 once, then a valid response."""
    client = MagicMock()
    ok_response = MagicMock()
    ok_response.choices = [MagicMock(message=MagicMock(content="ok"), finish_reason="stop")]
    client.chat.completions.create.side_effect = [_make_500(), ok_response]
    return client


class TestCallLLMSinglePermanentFailFast:
    """``_call_llm_single`` must NOT retry permanent 4xx errors."""

    def test_402_fails_fast_no_retries(self, service, mock_client_402):
        """A 402 should bubble out after exactly one API call."""
        with pytest.raises(APIStatusError) as exc_info:
            service._call_llm_single(
                system_prompt="sys",
                user_message="msg",
                max_tokens=100,
                temperature=0.0,
                model="meta-llama/llama-4-scout",
                client=mock_client_402,
            )
        assert exc_info.value.status_code == 402
        assert mock_client_402.chat.completions.create.call_count == 1, (
            f"Expected exactly 1 LLM call (no retries on permanent error), "
            f"got {mock_client_402.chat.completions.create.call_count}"
        )

    def test_500_still_retries(self, service, mock_client_500_then_ok):
        """A 5xx should still trigger tenacity retries (transient)."""
        result = service._call_llm_single(
            system_prompt="sys",
            user_message="msg",
            max_tokens=100,
            temperature=0.0,
            model="meta-llama/llama-4-scout",
            client=mock_client_500_then_ok,
        )
        assert result == "ok"
        assert mock_client_500_then_ok.chat.completions.create.call_count == 2


class TestCallLLMNoFallbackOnPermanentError:
    """``call_llm`` must NOT walk the fallback chain on permanent 4xx."""

    def test_402_does_not_try_fallback_models(self, service, monkeypatch):
        """One 402 from the primary model should fail immediately, not
        retry across all standard fallback models."""
        # client is now a @property backed by _client; inject the mock directly.
        mock_client = MagicMock()
        mock_client.chat.completions.create.side_effect = _make_402()
        service._client = mock_client

        with pytest.raises(APIStatusError) as exc_info:
            service.call_llm(
                system_prompt="sys",
                user_message="msg",
                # No api_key → uses Methodex shared key path → fallback chain enabled
            )
        assert exc_info.value.status_code == 402

        # The fallback chain has 3 models. With the bug, we'd see >=3 calls
        # (one per fallback model) plus tenacity retries. With the fix,
        # exactly 1 call.
        assert mock_client.chat.completions.create.call_count == 1, (
            f"Expected exactly 1 LLM call on permanent 402 (no model "
            f"fallback), got {mock_client.chat.completions.create.call_count}"
        )

    def test_connection_error_still_walks_fallback(self, service, monkeypatch):
        """Transient APIConnectionError should still try the fallback chain."""
        from app.constants import STANDARD_MODEL_FALLBACKS

        # client is now a @property backed by _client; inject the mock directly.
        mock_client = MagicMock()
        mock_client.chat.completions.create.side_effect = APIConnectionError(
            request=httpx.Request("POST", "https://openrouter.ai/api/v1/chat/completions")
        )
        service._client = mock_client

        with pytest.raises(APIConnectionError):
            service.call_llm(system_prompt="sys", user_message="msg")

        # Each model gets 3 tenacity retries; with N fallback models we
        # expect 3 * N calls total.
        expected_min_calls = 3 * len(STANDARD_MODEL_FALLBACKS)
        assert mock_client.chat.completions.create.call_count == expected_min_calls, (
            f"Expected {expected_min_calls} calls (3 retries × "
            f"{len(STANDARD_MODEL_FALLBACKS)} fallback models), "
            f"got {mock_client.chat.completions.create.call_count}"
        )
