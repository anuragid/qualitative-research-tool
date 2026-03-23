"""Tests for error_type classification in analysis nodes.

Verifies that each node (chunk, infer, relate, explain, activate,
cross_relate, cross_explain, cross_activate) sets error_type in the
returned state when an exception occurs, and that the type matches
the exception kind.
"""

from unittest.mock import patch

import httpx
import pytest
from openai import APIConnectionError, APIError, RateLimitError

from app.utils.error_classification import (
    ERROR_TYPE_LLM,
    ERROR_TYPE_NETWORK,
    ERROR_TYPE_RATE_LIMIT,
    ERROR_TYPE_TIMEOUT,
    ERROR_TYPE_VALIDATION,
)


def _make_response(status_code: int = 500) -> httpx.Response:
    return httpx.Response(
        status_code=status_code,
        request=httpx.Request("POST", "https://api.openrouter.ai/v1/chat/completions"),
        content=b"{}",
    )


# ---------- per-video nodes ----------


def _video_state(**overrides):
    """Minimal valid VideoAnalysisState."""
    base = {
        "video_id": "test-video",
        "transcript": {"utterances": [{"speaker": "A", "start": 0, "text": "Hello"}]},
        "speaker_labels": {"A": "Alice"},
        "speaker_roles": {"A": "participant"},
        "project_description": None,
        "chunks": [{"chunk_id": "c1", "text": "something meaningful to analyze", "speaker": "Alice", "type": "quote"}],
        "inferences": [{"inference_id": "i1", "text": "insight", "chunk_ids": ["c1"]}],
        "patterns": [{"pattern_id": "p1", "text": "pattern", "inference_ids": ["i1"]}],
        "insights": [{"insight_id": "in1", "text": "insight text", "pattern_ids": ["p1"]}],
        "design_principles": None,
        "api_key": None,
        "model": None,
        "current_step": "chunk",
        "error": None,
    }
    base.update(overrides)
    return base


def _project_state(**overrides):
    """Minimal valid ProjectAnalysisState."""
    base = {
        "project_id": "test-project",
        "video_ids": ["v1"],
        "video_patterns": [{"pattern_id": "p1", "text": "pattern"}],
        "video_insights": [{"insight_id": "i1", "text": "insight"}],
        "video_principles": [{"principle_id": "dp1", "text": "principle"}],
        "cross_video_patterns": [{"meta_pattern_id": "mp1", "text": "meta"}],
        "cross_video_insights": [{"cross_insight_id": "ci1", "text": "cross insight"}],
        "cross_video_principles": None,
        "api_key": None,
        "model": None,
        "current_step": "cross_relate",
        "error": None,
    }
    base.update(overrides)
    return base


# Map of (node module path, node function name, state factory, exception, expected_type)
_VIDEO_NODES = [
    ("app.agents.nodes.chunk", "chunk_node", _video_state),
    ("app.agents.nodes.infer", "infer_node", _video_state),
    ("app.agents.nodes.relate", "relate_node", _video_state),
    ("app.agents.nodes.explain", "explain_node", _video_state),
    ("app.agents.nodes.activate", "activate_node", _video_state),
]

_PROJECT_NODES = [
    ("app.agents.nodes.cross_relate", "cross_relate_node", _project_state),
    ("app.agents.nodes.cross_explain", "cross_explain_node", _project_state),
    ("app.agents.nodes.cross_activate", "cross_activate_node", _project_state),
]

_ALL_NODES = _VIDEO_NODES + _PROJECT_NODES

_ERROR_SCENARIOS = [
    (
        "rate_limit",
        RateLimitError(message="rate limited", response=_make_response(429), body=None),
        ERROR_TYPE_RATE_LIMIT,
    ),
    (
        "api_connection",
        APIConnectionError(request=httpx.Request("POST", "https://x.com")),
        ERROR_TYPE_NETWORK,
    ),
    (
        "api_error",
        APIError(message="server error", request=httpx.Request("POST", "https://x.com"), body=None),
        ERROR_TYPE_LLM,
    ),
    (
        "timeout",
        TimeoutError("timed out"),
        ERROR_TYPE_TIMEOUT,
    ),
    (
        "value_error",
        ValueError("bad input"),
        ERROR_TYPE_VALIDATION,
    ),
]


def _run_node_with_error(module_path, func_name, state_factory, exception):
    """Import a node function, mock llm_service to raise, and return the state."""
    import importlib

    mod = importlib.import_module(module_path)
    node_fn = getattr(mod, func_name)

    with patch.object(
        mod, "llm_service", create=True
    ) as mock_llm:
        mock_llm.call_with_json_list_response.side_effect = exception
        mock_llm.call_with_json_response.side_effect = exception
        state = state_factory()
        result = node_fn(state)
    return result


@pytest.mark.parametrize(
    "module_path,func_name,state_factory",
    [(m, f, s) for m, f, s in _ALL_NODES],
    ids=[f.replace("_node", "") for _, f, _ in _ALL_NODES],
)
@pytest.mark.parametrize(
    "scenario_name,exception,expected_type",
    _ERROR_SCENARIOS,
    ids=[s[0] for s in _ERROR_SCENARIOS],
)
def test_node_error_type_classification(
    module_path, func_name, state_factory, scenario_name, exception, expected_type
):
    """Each node should set error_type matching the exception kind."""
    result = _run_node_with_error(module_path, func_name, state_factory, exception)
    assert result.get("error") is not None, f"{func_name} should set error on exception"
    assert result.get("error_type") == expected_type, (
        f"{func_name} with {scenario_name}: expected error_type={expected_type}, "
        f"got {result.get('error_type')}"
    )
