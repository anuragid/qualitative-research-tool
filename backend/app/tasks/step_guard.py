"""Keep a redelivered analysis step from running its LLM work a second time.

The step tasks run with ``task_acks_late=True`` on a Redis broker, which hands
an unacked message to another worker thread once ``visibility_timeout`` has
passed. ``--pool=threads`` can't kill a slow task, so on 2026-10-24
``analyze_chunk_step[ea826ea5]`` was redelivered after ~10 minutes while the
first run was still waiting on the LLM, and both runs called the LLM, wrote
the chunks and set off the rest of the chain.

A step can also come back through a deploy: a worker that is stopped hard
(SIGKILL after Railway's drain window, or a cold shutdown) leaves its message
unacked, or kombu re-queues it the moment the worker's channel closes, while
the old thread may still be running or about to die.

``guarded_step`` wraps a step task so that every delivery first:

1. checks that its Celery task id hasn't already completed. A redelivered or
   re-queued message keeps its task id, while a new dispatch (the per-step
   "re-run" routes, or a fresh chain) gets a new one. A completed task id is
   dropped: it raises ``celery.exceptions.Ignore``, so the worker acks the
   message, stores no result and does NOT continue the chain, which the
   original run already did.
2. takes a lease on (entity, step) in Redis. If another run of the same step
   holds it, that run is alive (the lease outlives the longest possible run,
   ``STEP_MAX_RUNTIME_SECONDS``), but it may yet be killed. So this delivery
   is neither run nor dropped: it re-publishes itself (same task id, chain
   and retry count) to look again just after the live run's lease would
   expire, and acks itself with ``Ignore``. By then the live run has either
   finished (the copy is dropped by check 1) or died (the lease has expired
   and the copy runs the step).

The lease is released when the run ends (before Celery's autoretry schedules
a retry), and it expires before the broker would redeliver an orphaned
message, so a run whose worker died is picked up again.

The wrapped run also gets the step's LLM budget (``STEP_DEADLINE_SECONDS``)
and records activity the watchdog reads (``entity_recently_active``).

If Redis is unreachable the guard logs a warning and lets the step run
unguarded, the same as before this module existed.
"""

import functools
import logging
import uuid
from dataclasses import dataclass
from typing import Any, Callable, Optional

import redis
from celery.exceptions import Ignore

from app.config import settings
from app.constants import (
    ANALYSIS_STALL_TIMEOUT_SECONDS,
    STEP_DEADLINE_SECONDS,
    STEP_LEASE_TTL_SECONDS,
)
from app.services.llm_budget import step_budget

logger = logging.getLogger(__name__)

_KEY_PREFIX = "methodex:step"
# A completed task id is remembered well past any redelivery of its message.
_DONE_TTL_SECONDS = 24 * 3600
# A deferred copy looks again this long after the live run's lease would
# expire. Lease TTL + margin stays below the broker's visibility_timeout, so
# the deferred (ETA) message isn't itself redelivered while it waits.
_RECHECK_MARGIN_SECONDS = 30


class RedisStepStore:
    """The few Redis operations the guard needs."""

    # Delete the lease only if this run still owns it.
    _RELEASE_SCRIPT = (
        "if redis.call('get', KEYS[1]) == ARGV[1] then "
        "return redis.call('del', KEYS[1]) else return 0 end"
    )

    def __init__(self, url: str):
        self._url = url
        self._client: Optional[redis.Redis] = None

    @property
    def client(self) -> redis.Redis:
        if self._client is None:
            self._client = redis.Redis.from_url(
                self._url, socket_timeout=5, socket_connect_timeout=5
            )
        return self._client

    def acquire(self, key: str, token: str, ttl: int) -> bool:
        return bool(self.client.set(key, token, nx=True, ex=ttl))

    def release(self, key: str, token: str) -> None:
        self.client.eval(self._RELEASE_SCRIPT, 1, key, token)

    def put(self, key: str, ttl: int) -> None:
        self.client.set(key, "1", ex=ttl)

    def exists(self, *keys: str) -> bool:
        return self.client.exists(*keys) > 0

    def ttl(self, key: str) -> int:
        """Seconds until ``key`` expires; negative if it is gone or has no TTL."""
        return int(self.client.ttl(key))


_store = RedisStepStore(settings.REDIS_URL)


def _lease_key(kind: str, entity_id: str, step: str) -> str:
    return f"{_KEY_PREFIX}:lease:{kind}:{entity_id}:{step}"


def _done_key(task_id: str) -> str:
    return f"{_KEY_PREFIX}:done:{task_id}"


def _activity_key(kind: str, entity_id: str) -> str:
    return f"{_KEY_PREFIX}:activity:{kind}:{entity_id}"


@dataclass(frozen=True)
class _Lease:
    key: str
    token: str


def _claim(
    kind: str, entity_id: str, step: str, task_id: Optional[str]
) -> tuple[Optional[_Lease], Optional[int]]:
    """Decide what this delivery does.

    Returns ``(lease, None)`` to run the step, ``(None, None)`` to run it
    unguarded (Redis unavailable), or ``(None, seconds)`` when another run
    holds the lease and this delivery should look again in ``seconds``.
    Raises Ignore when this task id has already completed.
    """
    lease = _Lease(_lease_key(kind, entity_id, step), uuid.uuid4().hex)
    done = _done_key(task_id) if task_id is not None else None
    try:
        if done is not None and _store.exists(done):
            pass  # dropped below
        elif not _store.acquire(lease.key, lease.token, STEP_LEASE_TTL_SECONDS):
            remaining = _store.ttl(lease.key)
            if remaining < 0:  # expired in between, or has no TTL
                remaining = 0 if remaining == -2 else STEP_LEASE_TTL_SECONDS
            return None, min(remaining, STEP_LEASE_TTL_SECONDS) + _RECHECK_MARGIN_SECONDS
        elif done is not None and _store.exists(done):
            # The live run finished between the two checks.
            _store.release(lease.key, lease.token)
        else:
            _store.put(_activity_key(kind, entity_id), ANALYSIS_STALL_TIMEOUT_SECONDS)
            return lease, None
    except redis.RedisError as exc:
        logger.warning(
            f"Step guard unavailable ({exc}); running {step} for {kind} "
            f"{entity_id} without duplicate-delivery protection"
        )
        return None, None

    logger.warning(
        f"Ignoring duplicate delivery of task {task_id} ({step} step for "
        f"{kind} {entity_id}): this task already completed"
    )
    raise Ignore("this task already completed")


def _defer(task: Any, kind: str, entity_id: str, step: str, seconds: int) -> None:
    """Re-publish this delivery to run again in ``seconds``, then ack it.

    The copy keeps the task id, chain, error callback and retry count (the
    same signature Celery's own ``retry`` builds), so it continues the chain
    exactly as the original delivery would have.
    """
    logger.warning(
        f"Deferring duplicate delivery of task {task.request.id} ({step} step "
        f"for {kind} {entity_id}): another run of this step is still in "
        f"progress; checking again in {seconds}s"
    )
    task.signature_from_request(task.request, countdown=seconds).apply_async()
    raise Ignore("another run of this step is still in progress")


def _finish(kind: str, entity_id: str, lease: Optional[_Lease], done_task_id: Optional[str]) -> None:
    """Mark the task done (on success), record activity and drop the lease."""
    if lease is None:
        return
    try:
        if done_task_id is not None:
            _store.put(_done_key(done_task_id), _DONE_TTL_SECONDS)
        _store.put(_activity_key(kind, entity_id), ANALYSIS_STALL_TIMEOUT_SECONDS)
        _store.release(lease.key, lease.token)
    except redis.RedisError as exc:
        # The lease expires on its own after STEP_LEASE_TTL_SECONDS.
        logger.warning(f"Step guard could not release {lease.key}: {exc}")


def guarded_step(kind: str, step: str) -> Callable:
    """Decorate a bound step task ``fun(self, entity_id, ...)``.

    Apply it under ``@celery_app.task`` so Celery's autoretry wraps it and the
    lease is released before a retry is scheduled.
    """

    def decorate(fun: Callable) -> Callable:
        @functools.wraps(fun)
        def wrapper(self, entity_id: str, *args: Any, **kwargs: Any) -> Any:
            task_id = getattr(self.request, "id", None)
            if not isinstance(task_id, str):
                task_id = None  # called directly, outside a worker
            lease, recheck_in = _claim(kind, entity_id, step, task_id)
            if recheck_in is not None:
                _defer(self, kind, entity_id, step, recheck_in)
            succeeded = False
            try:
                with step_budget(STEP_DEADLINE_SECONDS):
                    result = fun(self, entity_id, *args, **kwargs)
                succeeded = True
                return result
            finally:
                _finish(kind, entity_id, lease, task_id if succeeded else None)

        return wrapper

    return decorate


def entity_recently_active(kind: str, entity_id: str) -> bool:
    """True if a step of this entity started or finished within
    ``ANALYSIS_STALL_TIMEOUT_SECONDS``. A running step always qualifies,
    since no run lasts that long.

    Returns False when Redis is unavailable, leaving the watchdog to its
    database timestamps.
    """
    try:
        return _store.exists(_activity_key(kind, entity_id))
    except redis.RedisError as exc:
        logger.warning(f"Step activity check failed for {kind} {entity_id}: {exc}")
        return False
