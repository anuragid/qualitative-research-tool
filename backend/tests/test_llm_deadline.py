"""Tests for the wall-clock caps on LLM calls (app/services/llm_budget.py).

THE BUG (production, 2026-10-24): the OpenAI client was given
``timeout=300``, which httpx applies per socket read. OpenRouter's response
had sent its 200 OK headers within 6 s and then kept the connection alive
while the model generated, so the read timeout never fired. One call ran ~11
minutes, the step outlived the broker's 600 s visibility_timeout, and the task
was redelivered to a second worker thread. On top of that the OpenAI SDK
retried a timed-out request twice by itself, and tenacity retried it twice
more, for every model in the fallback chain.

THE FIX: a per-call total cap (LLM_CALL_TIMEOUT_SECONDS) enforced on every
received chunk, and a per-step budget (STEP_DEADLINE_SECONDS) shared by the
whole fallback chain. The SDK's own retries are off.

These tests run the real OpenAI SDK over ``httpx.MockTransport`` with a fake
clock, so "trickle keepalive bytes for 11 minutes" takes milliseconds.
"""

import importlib
import json
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import httpx
import pytest

from app.constants import LLM_CALL_TIMEOUT_SECONDS, STEP_DEADLINE_SECONDS
from app.services.llm_budget import (
    DeadlineTransport,
    LLMCallTimeoutError,
    LLMDeadlineExceededError,
    call_deadline,
    step_budget,
)
from app.services.llm_service import LLMService, _stop_at_step_deadline
from app.utils.error_classification import classify_error, is_retryable

# The package re-exports the service *instance* as ``llm_service``.
llm_budget = importlib.import_module("app.services.llm_budget")
llm_service = importlib.import_module("app.services.llm_service")

V32 = "deepseek/deepseek-v3.2"
V3 = "deepseek/deepseek-chat-v3-0324"
SCOUT = "meta-llama/llama-4-scout"
KEEPALIVE_INTERVAL = 30.0  # fake seconds between keepalive bytes


class FakeClock:
    def __init__(self):
        self.now = 1000.0

    def monotonic(self):
        return self.now

    def advance(self, seconds):
        self.now += seconds


@pytest.fixture
def clock(monkeypatch):
    clock = FakeClock()
    fake_time = SimpleNamespace(monotonic=clock.monotonic)
    monkeypatch.setattr(llm_budget, "time", fake_time)
    monkeypatch.setattr(llm_service, "time", fake_time)
    return clock


@pytest.fixture(autouse=True)
def _no_real_sleep():
    with patch("tenacity.nap.time.sleep"):
        yield


def _completion(model: str, content: str = '[{"ok": true}]') -> bytes:
    return json.dumps({
        "id": "gen-1",
        "object": "chat.completion",
        "created": 0,
        "model": model,
        "choices": [{
            "index": 0,
            "message": {"role": "assistant", "content": content},
            "finish_reason": "stop",
        }],
    }).encode()


class _Trickle(httpx.SyncByteStream):
    """A body that sends a keepalive newline every KEEPALIVE_INTERVAL fake
    seconds and never finishes, like OpenRouter while a slow model thinks."""

    def __init__(self, clock: FakeClock):
        self._clock = clock
        self.chunks_sent = 0

    def __iter__(self):
        while True:
            self._clock.advance(KEEPALIVE_INTERVAL)
            self.chunks_sent += 1
            yield b"\n"


def _service_over(monkeypatch, handler) -> LLMService:
    """An LLMService whose real OpenAI client talks to ``handler``."""
    monkeypatch.setattr(
        llm_service, "DeadlineTransport",
        lambda: DeadlineTransport(inner=httpx.MockTransport(handler)),
    )
    return LLMService()


def _router(clock, slow_models, requested):
    """MockTransport handler: slow models trickle forever, others answer."""

    def handler(request: httpx.Request) -> httpx.Response:
        model = json.loads(request.content)["model"]
        requested.append(model)
        headers = {"content-type": "application/json"}
        if model in slow_models:
            return httpx.Response(200, headers=headers, stream=_Trickle(clock))
        return httpx.Response(200, headers=headers, content=_completion(model))

    return handler


class TestPerCallCap:
    def test_trickling_call_is_cut_at_the_cap_and_chain_falls_back(self, clock, monkeypatch):
        """Keepalive bytes reset httpx's read timeout but not the call cap."""
        requested: list[str] = []
        svc = _service_over(monkeypatch, _router(clock, {V32}, requested))
        start = clock.now

        result = svc.call_llm("sys", "user", max_tokens=16384)

        assert result == '[{"ok": true}]'
        # One request to the slow model (no SDK retry, no tenacity retry),
        # then straight to the next model.
        assert requested == [V32, V3]
        elapsed = clock.now - start
        assert LLM_CALL_TIMEOUT_SECONDS <= elapsed <= LLM_CALL_TIMEOUT_SECONDS + KEEPALIVE_INTERVAL

    def test_ordinary_read_timeout_is_still_retried(self, clock, monkeypatch):
        """A plain per-read timeout well inside the cap keeps its old
        behaviour: tenacity retries the model, then the chain falls back."""
        requested: list[str] = []

        def handler(request):
            model = json.loads(request.content)["model"]
            requested.append(model)
            if model == V32:
                raise httpx.ReadTimeout("read timed out", request=request)
            return httpx.Response(200, content=_completion(model))

        svc = _service_over(monkeypatch, handler)
        assert svc.call_llm("sys", "user", max_tokens=16384) == '[{"ok": true}]'
        assert requested == [V32, V32, V32, V3]

    def test_sdk_retries_are_disabled(self):
        svc = LLMService()
        assert svc.client.max_retries == 0
        byok = svc._get_client("sk-or-v1-user-key")
        assert byok is not svc.client
        assert byok.max_retries == 0


class TestStepBudget:
    def test_budget_covers_the_whole_fallback_chain(self, clock, monkeypatch):
        """Every model is slow: the step stops at its deadline instead of
        walking the chain for 4 x 10 minutes."""
        requested: list[str] = []
        svc = _service_over(monkeypatch, _router(clock, {V32, V3, SCOUT}, requested))
        start = clock.now

        with step_budget(STEP_DEADLINE_SECONDS):
            with pytest.raises(LLMDeadlineExceededError):
                svc.call_llm("sys", "user", max_tokens=16384)

        assert requested == [V32, V3]
        assert clock.now - start <= STEP_DEADLINE_SECONDS + KEEPALIVE_INTERVAL

    def test_spent_budget_makes_no_request(self, clock, monkeypatch):
        requested: list[str] = []
        svc = _service_over(monkeypatch, _router(clock, set(), requested))

        with step_budget(10):
            with pytest.raises(LLMDeadlineExceededError):
                svc.call_llm("sys", "user", max_tokens=16384)

        assert requested == []

    def test_nested_budget_cannot_extend_the_outer_one(self, clock):
        with step_budget(100) as outer:
            with step_budget(1000) as inner:
                assert inner.deadline == outer.deadline

    def test_tenacity_does_not_sleep_into_the_deadline(self, clock):
        retry_state = MagicMock(upcoming_sleep=10.0)
        assert _stop_at_step_deadline(retry_state) is False  # no step budget
        with step_budget(35):
            assert _stop_at_step_deadline(retry_state) is True
        with step_budget(100):
            assert _stop_at_step_deadline(retry_state) is False

    def test_timeouts_are_retryable_step_errors(self):
        for exc in (LLMDeadlineExceededError("x"), LLMCallTimeoutError("x")):
            assert classify_error(exc) == "timeout"
            assert is_retryable(classify_error(exc))


class TestDeadlineTransport:
    def _capture(self):
        seen = {}

        def handler(request):
            seen["timeout"] = dict(request.extensions.get("timeout", {}))
            return httpx.Response(200, content=b"{}")

        return seen, httpx.Client(transport=DeadlineTransport(inner=httpx.MockTransport(handler)), timeout=300)

    def test_socket_timeouts_are_clamped_to_the_time_left(self, clock):
        seen, client = self._capture()
        with call_deadline(5):
            client.get("https://openrouter.ai/x")
        assert seen["timeout"]["read"] == 5
        assert seen["timeout"]["connect"] == 5

    def test_no_deadline_leaves_the_request_alone(self, clock):
        seen, client = self._capture()
        client.get("https://openrouter.ai/x")
        assert seen["timeout"]["read"] == 300

    def test_refuses_to_send_after_the_deadline(self, clock):
        seen, client = self._capture()
        with call_deadline(5):
            clock.advance(6)
            with pytest.raises(httpx.TimeoutException):
                client.get("https://openrouter.ai/x")
        assert seen == {}
