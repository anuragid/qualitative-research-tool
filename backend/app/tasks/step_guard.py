"""Keep a redelivered analysis step from running its LLM work a second time.

The step tasks run with ``task_acks_late=True`` on a Redis broker, which hands
an unacked message to another worker thread once ``visibility_timeout`` has
passed. ``--pool=threads`` can't kill a slow task, so on 2026-10-24
``analyze_chunk_step[ea826ea5]`` was redelivered after ~10 minutes while the
first run was still waiting on the LLM, and both runs called the LLM, wrote
the chunks and set off the rest of the chain.

``guarded_step`` wraps a step task so that every delivery first:

1. takes a lease on (entity, step) in Redis. If another run of the same step
   holds it, that run is still alive (the lease outlives the longest possible
   run, ``STEP_MAX_RUNTIME_SECONDS``), so this delivery is a duplicate;
2. checks that its Celery task id hasn't already completed. A redelivered
   message keeps its task id, while a new dispatch (the per-step "re-run"
   routes, or a fresh chain) gets a new one.

A duplicate raises ``celery.exceptions.Ignore``: the worker acks the message,
stores no result and does NOT continue the chain, which the original run has
done or will do. The lease is released when the run ends (before Celery's
autoretry schedules a retry), and it expires before the broker would
redeliver, so a run whose worker died is picked up again.

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


def _claim(kind: str, entity_id: str, step: str, task_id: Optional[str]) -> Optional[_Lease]:
    """Take the step lease, or raise Ignore if this delivery is a duplicate.

    Returns None (run unguarded) when Redis is unavailable.
    """
    lease = _Lease(_lease_key(kind, entity_id, step), uuid.uuid4().hex)
    try:
        if not _store.acquire(lease.key, lease.token, STEP_LEASE_TTL_SECONDS):
            reason = "another run of this step is still in progress"
        elif task_id is not None and _store.exists(_done_key(task_id)):
            _store.release(lease.key, lease.token)
            reason = "this task already completed"
        else:
            _store.put(_activity_key(kind, entity_id), ANALYSIS_STALL_TIMEOUT_SECONDS)
            return lease
    except redis.RedisError as exc:
        logger.warning(
            f"Step guard unavailable ({exc}); running {step} for {kind} "
            f"{entity_id} without duplicate-delivery protection"
        )
        return None

    logger.warning(
        f"Ignoring duplicate delivery of task {task_id} ({step} step for "
        f"{kind} {entity_id}): {reason}"
    )
    raise Ignore(reason)


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
            lease = _claim(kind, entity_id, step, task_id)
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
