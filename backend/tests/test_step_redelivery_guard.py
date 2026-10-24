"""Tests for the redelivery guard on analysis step tasks (app/tasks/step_guard.py).

THE BUG (production, 2026-10-24, video 054097a6):
``analyze_chunk_step[ea826ea5]`` was received at 18:54:28Z and its first LLM
call ran for ~11 minutes. ``--pool=threads`` never enforced
``task_time_limit``, so the step was still running when Redis's 600 s
``visibility_timeout`` expired, and at 19:04:56Z the same task id was
delivered to a second worker thread. Both runs called the LLM, and the second
reset ``started_at`` and was about to write a second set of chunks and set off
a second chain.

THE FIX: every step delivery takes a Redis lease on (entity, step) and checks
that its task id hasn't completed. A duplicate raises ``celery.exceptions.Ignore``:
it is acked, makes no LLM call and does not continue the chain.

These tests drive the guard through Celery's real tracer (``build_tracer``),
so "the chain does not continue" is checked against the same code path the
worker uses. The ``step_store`` fixture (conftest.py) stands in for Redis.
"""

from unittest.mock import MagicMock, patch

import pytest
import redis
from celery.app.trace import build_tracer
from celery.exceptions import Ignore, Retry

from app.constants import STEP_DEADLINE_SECONDS, STEP_LEASE_TTL_SECONDS
from app.services.llm_budget import current_step_budget
from app.tasks.celery_app import celery_app
from app.tasks.step_guard import (
    _activity_key,
    _done_key,
    _lease_key,
    entity_recently_active,
    guarded_step,
)

VIDEO_ID = "054097a6-69fc-42ae-8ce3-f30e75d7859b"
TASK_ID = "ea826ea5-1974-44c5-8ec1-2974a7f7e410"

body_calls: list[dict] = []
budget_seen: list[float] = []


@pytest.fixture(autouse=True)
def _reset_calls():
    body_calls.clear()
    budget_seen.clear()
    _BODY_BEHAVIOUR.clear()


# How the dummy step's body behaves on its next call(s): "ok" or "fail".
_BODY_BEHAVIOUR: list[str] = []


@celery_app.task(
    bind=True,
    name="tests.guarded_dummy_step",
    autoretry_for=(Exception,),
    max_retries=3,
)
@guarded_step("video", "chunk")
def guarded_dummy_step(self, video_id: str, user_id: str | None = None):
    budget = current_step_budget()
    budget_seen.append(budget.remaining() if budget else -1.0)
    body_calls.append({"video_id": video_id, "task_id": self.request.id})
    if _BODY_BEHAVIOUR and _BODY_BEHAVIOUR.pop(0) == "fail":
        raise RuntimeError("transient LLM failure")
    return {"video_id": video_id, "status": "success"}


NEXT_LINK = celery_app.signature("analyze_infer_step", args=(VIDEO_ID, None), immutable=True)


def _deliver(task_id: str = TASK_ID):
    """Run one delivery of the dummy step the way a worker does, with the
    chain's next link attached. Returns (trace result, next-link dispatches)."""
    tracer = build_tracer(
        guarded_dummy_step.name, guarded_dummy_step, eager=True,
        propagate=False, app=celery_app,
    )
    with patch("celery.canvas.Signature.apply_async") as next_link:
        result = tracer(
            task_id, (VIDEO_ID, None), {},
            request={"id": task_id, "chain": [dict(NEXT_LINK)]},
        )
    return result, next_link


class TestDuplicateDeliveryIsDropped:
    def test_redelivery_while_first_run_holds_lease_is_ignored(self, step_store):
        """The 2026-10-24 case: the original run is still waiting on the LLM."""
        step_store.acquire(_lease_key("video", VIDEO_ID, "chunk"), "original-run", 600)

        result, next_link = _deliver()

        assert result.info is not None and result.info.state == "IGNORED"
        assert body_calls == [], "the duplicate must not reach the LLM node"
        next_link.assert_not_called()

    def test_redelivery_after_first_run_finished_is_ignored(self, step_store):
        first, first_next = _deliver()
        assert first.info is None  # success
        assert first_next.call_count == 1, "the original run continues the chain"

        second, second_next = _deliver()  # same task id: a redelivery

        assert second.info.state == "IGNORED"
        assert len(body_calls) == 1
        second_next.assert_not_called()

    def test_new_dispatch_of_a_completed_step_still_runs(self, step_store):
        """The per-step re-run routes dispatch a NEW task id for a step that
        already completed; that is not a duplicate."""
        _deliver(task_id="first-dispatch")
        result, next_link = _deliver(task_id="user-rerun")

        assert result.info is None
        assert [c["task_id"] for c in body_calls] == ["first-dispatch", "user-rerun"]
        assert next_link.call_count == 1

    def test_lease_of_a_dead_run_expires_and_redelivery_runs(self, step_store):
        """A worker killed mid-step leaves its lease behind; it expires
        (STEP_LEASE_TTL < visibility_timeout) before the message comes back."""
        key = _lease_key("video", VIDEO_ID, "chunk")
        step_store.acquire(key, "dead-run", STEP_LEASE_TTL_SECONDS)
        step_store.expire(key)

        result, next_link = _deliver()

        assert result.info is None
        assert len(body_calls) == 1
        assert next_link.call_count == 1

    def test_other_steps_and_videos_are_not_blocked(self, step_store):
        step_store.acquire(_lease_key("video", VIDEO_ID, "infer"), "x", 600)
        step_store.acquire(_lease_key("video", "another-video", "chunk"), "y", 600)

        result, _ = _deliver()

        assert result.info is None
        assert len(body_calls) == 1


class TestLeaseLifecycle:
    def test_lease_released_and_task_marked_done_on_success(self, step_store):
        _deliver()

        assert not step_store.exists(_lease_key("video", VIDEO_ID, "chunk"))
        assert step_store.exists(_done_key(TASK_ID))
        assert entity_recently_active("video", VIDEO_ID)

    def test_lease_released_before_autoretry_schedules_the_retry(self, step_store, monkeypatch):
        """Celery's autoretry runs outside the guard, so the lease must already
        be free when the retry is scheduled, or a quick retry would be
        dropped as a duplicate."""
        lease_held_at_retry = []

        def fake_retry(exc=None, **kwargs):
            lease_held_at_retry.append(step_store.exists(_lease_key("video", VIDEO_ID, "chunk")))
            raise Retry(exc=exc)

        monkeypatch.setattr(guarded_dummy_step, "retry", fake_retry)
        _BODY_BEHAVIOUR.append("fail")

        result, next_link = _deliver()

        assert result.info.state == "RETRY"
        assert lease_held_at_retry == [False]
        assert not step_store.exists(_done_key(TASK_ID)), "a failed attempt is not done"
        next_link.assert_not_called()

        # The retry (same task id) then runs normally.
        retried, retried_next = _deliver()
        assert retried.info is None
        assert len(body_calls) == 2
        assert retried_next.call_count == 1

    def test_step_runs_inside_the_step_budget(self):
        _deliver()
        assert len(budget_seen) == 1
        assert STEP_DEADLINE_SECONDS - 5 < budget_seen[0] <= STEP_DEADLINE_SECONDS

    def test_redis_down_runs_the_step_unguarded(self, step_store, caplog):
        step_store.fail = redis.ConnectionError("connection refused")

        result, next_link = _deliver()

        assert result.info is None
        assert len(body_calls) == 1
        assert next_link.call_count == 1
        assert "without duplicate-delivery protection" in caplog.text
        assert entity_recently_active("video", VIDEO_ID) is False


class TestRealStepTasks:
    """The guard is wired onto the real tasks and runs before their bodies."""

    @pytest.mark.parametrize(
        "task_path, kind, step, entity",
        [
            ("app.tasks.analysis_steps.analyze_chunk_step", "video", "chunk", VIDEO_ID),
            ("app.tasks.analysis_steps.analyze_infer_step", "video", "infer", VIDEO_ID),
            ("app.tasks.analysis_steps.analyze_relate_step", "video", "relate", VIDEO_ID),
            ("app.tasks.analysis_steps.analyze_explain_step", "video", "explain", VIDEO_ID),
            ("app.tasks.analysis_steps.analyze_activate_step", "video", "activate", VIDEO_ID),
            ("app.tasks.project_analysis_steps.analyze_cross_relate_step", "project", "cross_relate", "p1"),
            ("app.tasks.project_analysis_steps.analyze_cross_explain_step", "project", "cross_explain", "p1"),
            ("app.tasks.project_analysis_steps.analyze_cross_activate_step", "project", "cross_activate", "p1"),
        ],
    )
    def test_redelivered_step_never_touches_db_or_llm(self, step_store, task_path, kind, step, entity):
        import importlib

        module_path, task_name = task_path.rsplit(".", 1)
        task = getattr(importlib.import_module(module_path), task_name)
        step_store.acquire(_lease_key(kind, entity, step), "original-run", 600)

        mock_self = MagicMock()
        mock_self.request.id = TASK_ID
        with pytest.raises(Ignore):
            task._orig_run.__func__(mock_self, entity, None)

        mock_self.db.query.assert_not_called()

    def test_redelivered_chunk_step_does_not_reset_the_analysis(self, step_store):
        """Specifically: the duplicate chunk run must not re-run chunk_node or
        re-stamp started_at, which is what reset the watchdog clock."""
        from app.tasks import analysis_steps

        step_store.put(_done_key(TASK_ID), 60)
        mock_self = MagicMock()
        mock_self.request.id = TASK_ID
        with patch.object(analysis_steps, "chunk_node") as chunk_node, \
                patch.object(analysis_steps, "get_video_analysis_state") as get_state:
            with pytest.raises(Ignore):
                analysis_steps.analyze_chunk_step._orig_run.__func__(mock_self, VIDEO_ID, None)

        chunk_node.assert_not_called()
        get_state.assert_not_called()


def test_activity_key_is_per_entity():
    assert _activity_key("video", "a") != _activity_key("project", "a")
