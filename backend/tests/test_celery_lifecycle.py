"""Invariant tests for Celery task lifecycle bounds.

These tests lock the chain of inequalities documented in app/constants.py:

    STEP_MAX_RUNTIME  <  STEP_LEASE_TTL  <  broker visibility_timeout
                      <  watchdog _ANALYSIS_TIMEOUT

so that the deploy/interrupt recovery path stays sound:

    1. A step attempt can't outlive its lease, so a redelivered copy always
       finds the lease held and drops itself (app/tasks/step_guard.py).
    2. The lease expires before the broker redelivers, so the copy of a run
       whose worker died is NOT dropped and the step runs again.
    3. A live step always acks before visibility_timeout, so the broker never
       hands a running step to a second worker thread.
    4. An orphaned `unacked` task (e.g. worker SIGTERM mid-LLM call) is
       redelivered before the watchdog gives up on the analysis.

Background:
- 2026-04-07 (PR #19): Kathleen video 4b1f4b25 had task ab793cc0 sit in
  Redis `unacked` for 61 minutes because the default visibility_timeout is
  3600s while the watchdog was 35 min (breaks rule 4).
- 2026-10-24: analyze_chunk_step[ea826ea5] for video 054097a6 ran ~15 min
  under --pool=threads, which never enforced task_time_limit=360, and was
  redelivered at the 600s visibility_timeout while still running (broke
  rule 3). Two runs then called the LLM for the same step.
"""

from app.constants import (
    LLM_CALL_TIMEOUT_SECONDS,
    LLM_READ_TIMEOUT_SECONDS,
    STEP_DEADLINE_SECONDS,
    STEP_LEASE_TTL_SECONDS,
    STEP_MAX_RUNTIME_SECONDS,
)


def _visibility_timeout() -> int:
    from app.tasks.celery_app import celery_app

    transport_opts = celery_app.conf.broker_transport_options or {}
    vt = transport_opts.get("visibility_timeout")
    assert vt is not None, "visibility_timeout must be explicitly configured"
    return vt


def test_task_time_limits_unchanged_for_prefork():
    """task_time_limit is inert under --pool=threads but still budgets the
    R2 timeouts (config.py, test_transcription_tasks.py). Keep it pinned."""
    from app.tasks.celery_app import celery_app

    assert celery_app.conf.task_time_limit == 360
    assert celery_app.conf.task_soft_time_limit == 330
    assert celery_app.conf.task_soft_time_limit < celery_app.conf.task_time_limit


def test_worst_case_step_run_is_deadline_plus_one_read():
    """A step stops starting LLM work at its deadline; the slowest way past it
    is one stalled socket read."""
    assert STEP_MAX_RUNTIME_SECONDS == STEP_DEADLINE_SECONDS + LLM_READ_TIMEOUT_SECONDS
    # A single call can't be given more time than the whole step has.
    assert LLM_CALL_TIMEOUT_SECONDS < STEP_DEADLINE_SECONDS


def test_step_lease_outlives_the_longest_step_run():
    """Rule 1: a redelivered copy must always see a live run's lease."""
    assert STEP_LEASE_TTL_SECONDS > STEP_MAX_RUNTIME_SECONDS


def test_step_lease_expires_before_the_broker_redelivers():
    """Rule 2: a dead run's lease must be gone when its message comes back."""
    assert STEP_LEASE_TTL_SECONDS < _visibility_timeout()


def test_deferred_copy_is_not_redelivered_while_it_waits():
    """A copy that finds a live run's lease re-publishes itself with a
    countdown of up to the lease TTL plus a margin. The worker holds such an
    ETA message unacked, so the countdown must stay under visibility_timeout
    or the broker hands out yet another copy."""
    from app.tasks.step_guard import _RECHECK_MARGIN_SECONDS

    assert STEP_LEASE_TTL_SECONDS + _RECHECK_MARGIN_SECONDS < _visibility_timeout()


def test_live_step_acks_before_visibility_timeout():
    """Rule 3: the broker must never redeliver a step that is still running."""
    vt = _visibility_timeout()
    assert STEP_MAX_RUNTIME_SECONDS < vt, (
        f"A step can run {STEP_MAX_RUNTIME_SECONDS}s but visibility_timeout is "
        f"{vt}s, so a live step would be handed to a second worker thread."
    )


def test_broker_visibility_timeout_under_watchdog():
    """Rule 4: visibility_timeout must be < the watchdog threshold.

    If visibility_timeout >= watchdog _ANALYSIS_TIMEOUT, a stuck `unacked`
    message can sit in Redis longer than the watchdog will wait, so the
    watchdog stamps the analysis errored before Celery gets a chance to
    re-deliver the orphaned task. That is exactly the bug PR #19 fixes.
    """
    from app.tasks.watchdog_tasks import _ANALYSIS_TIMEOUT

    vt = _visibility_timeout()
    assert vt < _ANALYSIS_TIMEOUT.total_seconds(), (
        f"visibility_timeout ({vt}s) must be < watchdog threshold "
        f"({_ANALYSIS_TIMEOUT.total_seconds()}s) so orphaned tasks get "
        f"re-delivered before the watchdog stamps them errored."
    )


def test_watchdog_leaves_slack_after_redelivery():
    """The watchdog measures from the last step activity. An orphaned step's
    last activity is when it started, and its message comes back
    visibility_timeout after it was reserved; allow at least 5 minutes on top
    for the broker's restore sweep and the queue."""
    from app.tasks.watchdog_tasks import _ANALYSIS_TIMEOUT

    assert _ANALYSIS_TIMEOUT.total_seconds() >= _visibility_timeout() + 300
