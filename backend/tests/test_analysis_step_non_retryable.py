"""Tests that step-by-step analysis tasks fail fast on permanent errors.

The bug being fixed: ``analyze_chunk_step`` (and the other 4 step tasks)
declare ``autoretry_for=(Exception,)`` with ``max_retries=3``.  When the
underlying ``chunk_node`` call returns a non-retryable error (e.g.
``error_type="llm_permanent"`` because OpenRouter returned a 402), the
task wraps the error in a generic ``Exception`` and re-raises it.  Celery
then autoretries 3 more times with up-to-10-minute backoffs, generating
hundreds of Sentry events for a single failing video and making the
pipeline appear "stuck".

The fix:
1. Define a ``NonRetryableAnalysisError`` exception class.
2. The task body inspects the node result's ``error_type`` and raises
   ``NonRetryableAnalysisError`` instead of a plain ``Exception`` when
   the error is classified as permanent.
3. The task decorator declares ``dont_autoretry_for`` so Celery skips
   autoretry for that exception class.
"""

from unittest.mock import MagicMock, patch
from uuid import uuid4

import pytest

from app.tasks import analysis_steps
from app.tasks.analysis_steps import (
    NonRetryableAnalysisError,
    analyze_activate_step,
    analyze_chunk_step,
    analyze_explain_step,
    analyze_infer_step,
    analyze_relate_step,
)

# ---------- Configuration tests (introspection) ----------------------------


_STEP_TASKS = [
    analyze_chunk_step,
    analyze_infer_step,
    analyze_relate_step,
    analyze_explain_step,
    analyze_activate_step,
]


@pytest.mark.parametrize("task", _STEP_TASKS, ids=lambda t: t.name)
def test_step_task_excludes_non_retryable_from_autoretry(task):
    """Each step task must declare NonRetryableAnalysisError as non-autoretry.

    Without this, celery's ``autoretry_for=(Exception,)`` would still
    catch and retry our non-retryable exception.
    """
    dont_autoretry = getattr(task, "dont_autoretry_for", None)
    assert dont_autoretry is not None, (
        f"Task {task.name} is missing dont_autoretry_for — celery would "
        f"autoretry NonRetryableAnalysisError just like any other Exception."
    )
    assert NonRetryableAnalysisError in dont_autoretry, (
        f"Task {task.name} dont_autoretry_for={dont_autoretry} does not "
        f"include NonRetryableAnalysisError."
    )


# ---------- Behavior tests --------------------------------------------------


def _make_video_state(video_id: str):
    """Minimal state get_video_analysis_state would return."""
    analysis = MagicMock()
    analysis.step_status = {}
    return {
        "video_id": video_id,
        "transcript": {"utterances": [{"speaker": "A", "start": 0, "text": "hi"}]},
        "speaker_labels": {"A": "Alice"},
        "speaker_roles": {"A": "participant"},
        "analysis": analysis,
    }


def _run_chunk_step_with_node_result(node_result: dict, video_id: str | None = None):
    """Invoke the chunk step task body with chunk_node mocked.

    Bypasses Celery's autoretry wrapper by calling ``_orig_run`` directly,
    so the test sees whatever exception the function body raises rather
    than celery's wrapped Retry.  The wrapper-vs-exception interaction is
    covered separately by the introspection tests above (which verify
    ``dont_autoretry_for`` is wired correctly — celery itself handles the
    rest, see celery/app/autoretry.py).
    """
    video_id = video_id or str(uuid4())
    mock_self = MagicMock()
    mock_self.db = MagicMock()

    state = _make_video_state(video_id)

    with patch.object(analysis_steps, "get_video_analysis_state", return_value=state), \
         patch.object(analysis_steps, "_resolve_byok", return_value=(None, None)), \
         patch.object(analysis_steps, "chunk_node", return_value=node_result), \
         patch.object(analysis_steps, "_update_analysis_error"):
        # ``_orig_run`` is a bound method on the task instance.  Use
        # ``__func__`` to get the unbound underlying function so we can
        # inject our mock as ``self`` instead of the real task instance.
        unbound = analyze_chunk_step._orig_run.__func__
        return unbound(mock_self, video_id, None)


def test_chunk_step_raises_non_retryable_on_permanent_error():
    """When chunk_node returns error_type='llm_permanent', task raises
    NonRetryableAnalysisError so celery autoretry skips it."""
    node_result = {
        "chunks": None,
        "error": (
            "APIStatusError: Error code: 402 - {'error': {'message': "
            "'Insufficient credits...', 'code': 402}}"
        ),
        "error_type": "llm_permanent",
    }
    with pytest.raises(NonRetryableAnalysisError):
        _run_chunk_step_with_node_result(node_result)


def test_chunk_step_raises_generic_exception_on_retryable_error():
    """When chunk_node returns a retryable error_type, task raises a
    plain Exception so celery autoretry kicks in normally."""
    node_result = {
        "chunks": None,
        "error": "RateLimitError: too many requests",
        "error_type": "rate_limit",
    }
    with pytest.raises(Exception) as exc_info:
        _run_chunk_step_with_node_result(node_result)
    assert not isinstance(exc_info.value, NonRetryableAnalysisError), (
        "Retryable errors should NOT be wrapped in NonRetryableAnalysisError"
    )


def test_chunk_step_validation_error_is_non_retryable():
    """validation_error is non-retryable per is_retryable() — should raise
    NonRetryableAnalysisError so we don't waste 3 celery attempts on bad
    input that won't get better."""
    node_result = {
        "chunks": None,
        "error": "Transcript contains no utterances",
        "error_type": "validation_error",
    }
    with pytest.raises(NonRetryableAnalysisError):
        _run_chunk_step_with_node_result(node_result)
