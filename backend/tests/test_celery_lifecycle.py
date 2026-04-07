"""Invariant tests for Celery task lifecycle bounds (PR #19).

These tests lock the relationship:

    task_time_limit  <  broker visibility_timeout  <  watchdog _ANALYSIS_TIMEOUT

so that the deploy/interrupt recovery path stays sound:

    1. Chain steps must finish fast or fail fast (task_time_limit=360s).
    2. An orphaned `unacked` task (e.g. worker SIGTERM mid-LLM call) must
       be re-delivered by the broker before the watchdog gives up on it
       (visibility_timeout=600s, watchdog threshold >= 15 min).
    3. Any future tuning that violates this order breaks loudly here.

Background (2026-04-07 production incident): Kathleen video 4b1f4b25
had task ab793cc0 sit in Redis `unacked` for 61 minutes because the
default Celery Redis visibility_timeout is 3600s, while the watchdog
was 35 min. The watchdog stamped the video errored before the broker
re-delivered. See PR #19 commit body for the full post-mortem.
"""


def test_task_time_limit_is_6_minutes():
    """Chain steps must be bounded to 6 minutes hard / 5.5 soft. See PR #19."""
    from app.tasks.celery_app import celery_app

    assert celery_app.conf.task_time_limit == 360
    assert celery_app.conf.task_soft_time_limit == 330
    assert celery_app.conf.task_soft_time_limit < celery_app.conf.task_time_limit


def test_broker_visibility_timeout_under_watchdog():
    """visibility_timeout must be explicitly set and < watchdog threshold.

    If visibility_timeout >= watchdog _ANALYSIS_TIMEOUT, a stuck `unacked`
    message can sit in Redis longer than the watchdog will wait, so the
    watchdog stamps the analysis errored before Celery gets a chance to
    re-deliver the orphaned task. That is exactly the bug PR #19 fixes.
    """
    from app.tasks.celery_app import celery_app
    from app.tasks.watchdog_tasks import _ANALYSIS_TIMEOUT

    transport_opts = celery_app.conf.broker_transport_options or {}
    vt = transport_opts.get("visibility_timeout")
    assert vt is not None, "visibility_timeout must be explicitly configured"
    assert vt == 600
    assert vt < _ANALYSIS_TIMEOUT.total_seconds(), (
        f"visibility_timeout ({vt}s) must be < watchdog threshold "
        f"({_ANALYSIS_TIMEOUT.total_seconds()}s) so orphaned tasks get "
        f"re-delivered before the watchdog stamps them errored."
    )


def test_watchdog_threshold_exceeds_task_time_limit_plus_visibility():
    """Watchdog must wait at least task_time_limit + visibility_timeout.

    Celery needs room to (a) hit task_time_limit and kill the task, and
    (b) let the broker's visibility_timeout fire to re-deliver any
    orphaned unacked message, before the watchdog intervenes. If the
    watchdog beats either of those, we either double-stamp an
    already-errored task or lose a task that would have completed on
    re-delivery.
    """
    from app.tasks.celery_app import celery_app
    from app.tasks.watchdog_tasks import _ANALYSIS_TIMEOUT

    task_limit = celery_app.conf.task_time_limit
    vt = celery_app.conf.broker_transport_options["visibility_timeout"]
    min_required = task_limit + vt
    assert _ANALYSIS_TIMEOUT.total_seconds() >= min_required, (
        f"Watchdog threshold ({_ANALYSIS_TIMEOUT.total_seconds()}s) must be "
        f">= task_time_limit + visibility_timeout ({min_required}s) so Celery "
        f"gets both a kill-signal and a re-deliver chance before the watchdog "
        f"intervenes."
    )
