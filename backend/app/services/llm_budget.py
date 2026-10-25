"""Wall-clock budgets for LLM calls.

httpx (and so the OpenAI SDK) only has per-operation timeouts: the read
timeout restarts whenever a byte arrives. OpenRouter keeps a non-streaming
request alive while the model generates, so one call can run far past its
nominal timeout. In production on 2026-10-24 a Nemotron call ran ~11 minutes
under a 300 s read timeout, the step outlived the broker's visibility timeout,
and Redis redelivered it to a second worker thread.

This module adds the two totals httpx lacks:

- :func:`step_budget` opens one budget per Celery step attempt. Every LLM call
  the step makes (fallback models, tenacity retries, a node's validation
  retry) draws from it, and ``LLMService`` stops starting new work once it is
  spent.
- :func:`call_deadline` caps a single HTTP call. :class:`DeadlineTransport`
  enforces it on every received chunk, so a call that keeps receiving
  keepalive bytes still stops on time.
"""

import time
from contextlib import contextmanager
from contextvars import ContextVar
from dataclasses import dataclass, field
from typing import Iterator, Optional

import httpx

from app.constants import LLM_CALL_TIMEOUT_SECONDS


class LLMTimeoutError(TimeoutError):
    """An LLM call or a step's LLM budget ran out of wall-clock time.

    Subclasses :class:`TimeoutError` so ``classify_error`` reports it as the
    retryable ``timeout`` type: the step fails this attempt and Celery's
    autoretry starts a fresh attempt with a fresh budget.
    """


class LLMCallTimeoutError(LLMTimeoutError):
    """One HTTP call to one model ran past its total-time cap.

    ``call_llm`` moves on to the next model instead of retrying the same one.
    """


class LLMDeadlineExceededError(LLMTimeoutError):
    """The step's LLM budget is spent; no further model or retry is tried."""


@dataclass
class StepBudget:
    """The wall-clock budget shared by every LLM call of one step attempt."""

    deadline: float  # time.monotonic() value
    # Model id -> smallest max_tokens at which that model returned
    # finish_reason=length with no content during this step. Later calls in the
    # same step skip the model for requests at least that large.
    exhausted_at: dict[str, int] = field(default_factory=dict)

    def remaining(self) -> float:
        return self.deadline - time.monotonic()


_step_budget: ContextVar[Optional[StepBudget]] = ContextVar("llm_step_budget", default=None)
_call_deadline: ContextVar[Optional[float]] = ContextVar("llm_call_deadline", default=None)


@contextmanager
def step_budget(seconds: float) -> Iterator[StepBudget]:
    """Give every LLM call made inside the block one shared budget.

    A nested budget can only shorten the enclosing one, never extend it.
    """
    deadline = time.monotonic() + seconds
    outer = _step_budget.get()
    if outer is not None:
        deadline = min(deadline, outer.deadline)
    budget = StepBudget(deadline=deadline)
    token = _step_budget.set(budget)
    try:
        yield budget
    finally:
        _step_budget.reset(token)


def current_step_budget() -> Optional[StepBudget]:
    """The budget of the step running in this thread, if any."""
    return _step_budget.get()


@contextmanager
def call_deadline(seconds: float = LLM_CALL_TIMEOUT_SECONDS) -> Iterator[float]:
    """Cap the HTTP call made inside the block at ``seconds`` of wall time.

    The cap is shortened to the step budget's deadline when that comes first.
    Yields the absolute ``time.monotonic()`` deadline.
    """
    deadline = time.monotonic() + seconds
    budget = _step_budget.get()
    if budget is not None:
        deadline = min(deadline, budget.deadline)
    token = _call_deadline.set(deadline)
    try:
        yield deadline
    finally:
        _call_deadline.reset(token)


class _TotalTimeout(httpx.ReadTimeout):
    """The call deadline passed while the response was still arriving."""


class _DeadlineByteStream(httpx.SyncByteStream):
    """Response body stream that gives up once the call deadline passes."""

    def __init__(self, inner: httpx.SyncByteStream, deadline: float, request: httpx.Request):
        self._inner = inner
        self._deadline = deadline
        self._request = request

    def __iter__(self) -> Iterator[bytes]:
        for chunk in self._inner:
            if time.monotonic() >= self._deadline:
                raise _TotalTimeout(
                    "LLM call ran past its total time budget", request=self._request
                )
            yield chunk

    def close(self) -> None:
        self._inner.close()


class DeadlineTransport(httpx.BaseTransport):
    """httpx transport that enforces the deadline set by :func:`call_deadline`.

    Outside a ``call_deadline`` block it behaves exactly like the wrapped
    transport. Inside one it (1) refuses to send once the deadline has passed,
    (2) shortens every socket timeout to the time left, and (3) checks the
    deadline on each chunk of the response body. Step (3) is what catches a
    response that trickles keepalive bytes. The only way past the deadline is
    a read that stalls right after a chunk arrived, bounded by the request's
    read timeout (``LLM_READ_TIMEOUT_SECONDS``).
    """

    def __init__(self, inner: Optional[httpx.BaseTransport] = None):
        self._inner = inner if inner is not None else httpx.HTTPTransport()

    def handle_request(self, request: httpx.Request) -> httpx.Response:
        deadline = _call_deadline.get()
        if deadline is None:
            return self._inner.handle_request(request)

        remaining = deadline - time.monotonic()
        if remaining <= 0:
            raise _TotalTimeout(
                "LLM call deadline passed before the request was sent", request=request
            )
        timeouts = dict(request.extensions.get("timeout") or {})
        for key in ("connect", "read", "write", "pool"):
            current = timeouts.get(key)
            timeouts[key] = remaining if current is None else min(current, remaining)
        request.extensions["timeout"] = timeouts

        response = self._inner.handle_request(request)
        response.stream = _DeadlineByteStream(response.stream, deadline, request)
        return response

    def close(self) -> None:
        self._inner.close()
