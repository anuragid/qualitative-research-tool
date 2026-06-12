"""Tests that post-retry validation failures in all 8 analysis nodes are
classified as retryable (error_type='llm_error'), not non-retryable.

Bug fixed: when validate_* raised OutputValidationError on BOTH the initial
call AND the in-node retry attempt, every node returned a result dict
WITHOUT an 'error_type' key. _raise_for_node_error in analysis_steps.py
defaults missing error_type to "unknown", and is_retryable("unknown") is
False, so Celery's autoretry was short-circuited via NonRetryableAnalysisError.
A transient truncated-JSON response from the LLM became a TERMINAL failure.

The fix stamps error_type='llm_error' on every post-retry validation failure
return. 'llm_error' is_retryable() -> True, so Celery will autoretry up to
max_retries=3 times with exponential backoff before giving up. Permanently
bad LLM output that never improves is thus bounded: worst case is
3 Celery retries × (each with 2 internal attempts) = 6 LLM calls, then
terminal failure via the Celery exhaustion path. This is intentional.

Tests in this file verify two properties for each of the 8 nodes:

1. The node's post-retry validation failure return contains 'error_type'.
2. The returned error_type is classified as RETRYABLE by is_retryable().

Tests use parametrize so a missed node or wrong error_type is immediately
visible in the failure message.
"""

from unittest.mock import patch

import pytest

from app.utils.error_classification import ERROR_TYPE_LLM, is_retryable
from app.utils.output_validator import OutputValidationError

# ---------------------------------------------------------------------------
# Minimal state factories
# ---------------------------------------------------------------------------


def _video_state(**overrides):
    """Minimal valid VideoAnalysisState for per-video nodes."""
    base = {
        "video_id": "test-video",
        "transcript": {
            "utterances": [{"speaker": "A", "start": 0, "text": "Hello world"}]
        },
        "speaker_labels": {"A": "Alice"},
        "speaker_roles": {"A": "participant"},
        "project_description": None,
        "chunks": [
            {
                "chunk_id": "C001",
                "text": "Something meaningful to analyze here",
                "speaker": "Alice",
                "type": "quote",
                "timestamp": "0",
                "context": "",
            }
        ],
        "inferences": [
            {"chunk_id": "C001", "inferences": ["This reveals a pattern"]}
        ],
        "patterns": [
            {
                "pattern_id": "P001",
                "pattern_name": "Test pattern",
                "description": "A recurring theme",
                "supporting_inferences": ["This reveals a pattern"],
                "relationship_type": "convergent",
            }
        ],
        "insights": [
            {
                "insight_id": "IN001",
                "title": "Test insight",
                "description": "An insight",
                "pattern_ids": ["P001"],
                "evidence": [],
            }
        ],
        "design_principles": None,
        "api_key": None,
        "model": None,
        "current_step": "chunk",
        "error": None,
    }
    base.update(overrides)
    return base


def _project_state(**overrides):
    """Minimal valid ProjectAnalysisState for cross-video nodes."""
    base = {
        "project_id": "test-project",
        "video_ids": ["v1"],
        "video_patterns": [
            {
                "pattern_id": "P001",
                "pattern_name": "Test",
                "description": "desc",
                "supporting_inferences": [],
                "relationship_type": "convergent",
            }
        ],
        "video_insights": [
            {
                "insight_id": "IN001",
                "title": "Title",
                "description": "desc",
                "pattern_ids": ["P001"],
                "evidence": [],
            }
        ],
        "video_principles": [
            {
                "principle_id": "DP001",
                "title": "Principle",
                "description": "desc",
                "how_to_apply": "apply",
                "insight_ids": ["IN001"],
            }
        ],
        "cross_video_patterns": [
            {
                "meta_pattern_id": "MP001",
                "pattern_name": "Meta",
                "description": "desc",
                "supporting_patterns": [],
                "relationship_type": "convergent",
            }
        ],
        "cross_video_insights": [
            {
                "cross_insight_id": "CI001",
                "title": "Cross insight",
                "description": "desc",
                "meta_pattern_ids": ["MP001"],
                "evidence": [],
            }
        ],
        "cross_video_principles": None,
        "api_key": None,
        "model": None,
        "current_step": "cross_relate",
        "error": None,
    }
    base.update(overrides)
    return base


# ---------------------------------------------------------------------------
# Parametrize table: (node_module, node_fn, validate_fn_name, state_factory)
# ---------------------------------------------------------------------------

_NODES = [
    pytest.param(
        "app.agents.nodes.chunk",
        "chunk_node",
        "validate_chunks",
        _video_state,
        id="chunk",
    ),
    pytest.param(
        "app.agents.nodes.infer",
        "infer_node",
        "validate_inferences",
        _video_state,
        id="infer",
    ),
    pytest.param(
        "app.agents.nodes.relate",
        "relate_node",
        "validate_patterns",
        _video_state,
        id="relate",
    ),
    pytest.param(
        "app.agents.nodes.explain",
        "explain_node",
        "validate_insights",
        _video_state,
        id="explain",
    ),
    pytest.param(
        "app.agents.nodes.activate",
        "activate_node",
        "validate_design_principles",
        _video_state,
        id="activate",
    ),
    pytest.param(
        "app.agents.nodes.cross_relate",
        "cross_relate_node",
        "validate_meta_patterns",
        _project_state,
        id="cross_relate",
    ),
    pytest.param(
        "app.agents.nodes.cross_explain",
        "cross_explain_node",
        "validate_cross_insights",
        _project_state,
        id="cross_explain",
    ),
    pytest.param(
        "app.agents.nodes.cross_activate",
        "cross_activate_node",
        "validate_system_principles",
        _project_state,
        id="cross_activate",
    ),
]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _simulate_post_retry_validation_failure(module_path, func_name, validate_fn_name, state_factory):
    """Run a node where the LLM returns something and both validation calls
    raise OutputValidationError (simulating truncated/malformed JSON that
    passes the LLM call but fails schema validation both times).

    The LLM call itself succeeds (returns a list), but validate_* always
    raises. This triggers the in-node retry path and then the post-retry
    failure return.
    """
    import importlib

    mod = importlib.import_module(module_path)
    node_fn = getattr(mod, func_name)

    # Return a minimal list from LLM (passes the call, fails validation)
    stub_llm_return = [{}]

    with (
        patch.object(mod, "llm_service", create=True) as mock_llm,
        patch.object(
            mod,
            validate_fn_name,
            side_effect=OutputValidationError("stub: missing required fields"),
        ),
    ):
        mock_llm.call_with_json_list_response.return_value = stub_llm_return
        mock_llm.call_with_json_response.return_value = stub_llm_return
        state = state_factory()
        result = node_fn(state)

    return result


# ---------------------------------------------------------------------------
# Test 1: error_type key is present in the post-retry failure return
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "module_path,func_name,validate_fn_name,state_factory",
    _NODES,
)
def test_post_retry_validation_failure_sets_error_type(
    module_path, func_name, validate_fn_name, state_factory
):
    """After both in-node validation attempts fail, the node must include
    'error_type' in its return dict.

    Without this key, _raise_for_node_error defaults to 'unknown', which
    is_retryable() -> False, turning a transient LLM generation failure
    into a terminal (non-retryable) pipeline error.
    """
    result = _simulate_post_retry_validation_failure(
        module_path, func_name, validate_fn_name, state_factory
    )

    assert "error_type" in result, (
        f"{func_name} post-retry failure return is missing 'error_type'. "
        f"Result keys: {list(result.keys())}. "
        f"Without error_type, _raise_for_node_error defaults to 'unknown' "
        f"(non-retryable), turning a transient truncated-JSON failure into "
        f"a terminal pipeline error that requires manual user retry."
    )


# ---------------------------------------------------------------------------
# Test 2: the error_type is retryable
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "module_path,func_name,validate_fn_name,state_factory",
    _NODES,
)
def test_post_retry_validation_failure_error_type_is_retryable(
    module_path, func_name, validate_fn_name, state_factory
):
    """The error_type on post-retry validation failure must be retryable.

    Expected value: ERROR_TYPE_LLM ('llm_error') — the LLM produced output
    that passed calling but failed schema validation twice. A fresh LLM call
    on the next Celery retry may produce valid output. The retry is bounded:
    Celery max_retries=3 on each step task, so at most 3 Celery retries
    (each with 2 internal validation attempts) before terminal failure.
    """
    result = _simulate_post_retry_validation_failure(
        module_path, func_name, validate_fn_name, state_factory
    )

    error_type = result.get("error_type")
    assert is_retryable(error_type), (
        f"{func_name} post-retry failure has error_type={error_type!r} "
        f"which is NOT retryable. Expected a retryable type like "
        f"'llm_error' so Celery autoretry can attempt a fresh LLM call. "
        f"Current behavior terminates the pipeline permanently on transient "
        f"JSON generation failures."
    )


# ---------------------------------------------------------------------------
# Test 3: specifically llm_error (not just any retryable type)
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "module_path,func_name,validate_fn_name,state_factory",
    _NODES,
)
def test_post_retry_validation_failure_error_type_is_llm_error(
    module_path, func_name, validate_fn_name, state_factory
):
    """Specifically: the error_type should be 'llm_error'.

    This is the canonical type for a successful LLM call that returned
    unusable output. 'rate_limit' would be wrong (no rate limiting occurred),
    'network_error' would be wrong (connectivity was fine), 'timeout' would
    be wrong. 'llm_error' accurately describes what happened and maps to
    the correct Celery retry path.
    """
    result = _simulate_post_retry_validation_failure(
        module_path, func_name, validate_fn_name, state_factory
    )

    error_type = result.get("error_type")
    assert error_type == ERROR_TYPE_LLM, (
        f"{func_name} post-retry failure has error_type={error_type!r}, "
        f"expected {ERROR_TYPE_LLM!r} ('llm_error'). "
        f"Choose 'llm_error' because the LLM call succeeded but its output "
        f"was structurally invalid — a fresh retry may produce valid JSON."
    )
