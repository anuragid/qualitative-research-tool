"""Tests for bare-string-to-dict coercion across all analysis nodes."""

import os

os.environ.setdefault("APP_ENV", "development")
os.environ.setdefault("DEBUG", "false")
os.environ.setdefault("DATABASE_URL", "sqlite:///test.db")
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/0")
os.environ.setdefault("CLERK_SECRET_KEY", "sk_test_fake")
os.environ.setdefault("CLERK_PUBLISHABLE_KEY", "pk_test_dGVzdC5jbGVyay5hY2NvdW50cy5kZXYk")
os.environ.setdefault("R2_ACCESS_KEY_ID", "test_access_key")
os.environ.setdefault("R2_SECRET_ACCESS_KEY", "test_secret_key")
os.environ.setdefault("R2_ENDPOINT_URL", "https://fake.r2.cloudflarestorage.com")
os.environ.setdefault("R2_BUCKET_NAME", "test-bucket")
os.environ.setdefault("OPENROUTER_API_KEY", "test-openrouter-key")
os.environ.setdefault("ASSEMBLYAI_API_KEY", "test-assemblyai-key")
os.environ.setdefault("ENCRYPTION_KEY", "9px3YGa-Z2bljdtUKpLhqzl9IaGdf2RgrCI-zOTrUug=")

from unittest.mock import patch

import pytest

from app.agents.nodes import (
    activate as activate_module,
)
from app.agents.nodes import (
    chunk as chunk_module,
)
from app.agents.nodes import (
    cross_activate as cross_activate_module,
)
from app.agents.nodes import (
    cross_explain as cross_explain_module,
)
from app.agents.nodes import (
    cross_relate as cross_relate_module,
)
from app.agents.nodes import (
    infer as infer_module,
)
from app.agents.nodes import (
    relate as relate_module,
)
from app.agents.nodes.activate import _coerce_principle_items, activate_node
from app.agents.nodes.chunk import _coerce_chunk_items, chunk_node
from app.agents.nodes.cross_activate import (
    _coerce_system_principle_items,
    cross_activate_node,
)
from app.agents.nodes.cross_explain import (
    _coerce_cross_insight_items,
    cross_explain_node,
)
from app.agents.nodes.cross_relate import (
    _coerce_meta_pattern_items,
    cross_relate_node,
)
from app.agents.nodes.infer import _coerce_inference_items, infer_node
from app.agents.nodes.relate import _coerce_pattern_items, relate_node
from app.utils.output_validator import (
    OutputValidationError,
    validate_chunks,
    validate_cross_insights,
    validate_design_principles,
    validate_inferences,
    validate_meta_patterns,
    validate_patterns,
    validate_system_principles,
)

# ---------------------------------------------------------------------------
# Well-formed sample factories
# ---------------------------------------------------------------------------


def _well_formed_chunk(idx=1):
    return {
        "chunk_id": f"C{idx:03d}",
        "text": f"Participant statement number {idx} with enough words.",
        "type": "quote",
        "speaker": "Alice",
    }


def _well_formed_inference(idx=1):
    return {
        "chunk_id": f"C{idx:03d}",
        "inferences": [f"This means thing {idx}", f"Also reveals {idx}"],
    }


def _well_formed_pattern(idx=1):
    return {
        "pattern_id": f"P{idx:03d}",
        "pattern_name": f"Pattern {idx}",
        "description": f"Description of pattern {idx}",
        "supporting_inferences": ["I001"],
        "relationship_type": "convergent",
    }


def _well_formed_principle(idx=1):
    return {
        "principle_id": f"DP{idx:03d}",
        "principle": f"The system should do thing {idx}",
        "source_insight": f"IN{idx:03d}",
        "how_might_we": f"How might we {idx}?",
    }


def _well_formed_meta_pattern(idx=1):
    return {
        "meta_pattern_id": f"MP{idx:03d}",
        "pattern_name": f"Meta-pattern {idx}",
        "description": f"Description of meta-pattern {idx}",
        "source_videos": ["v1", "v2"],
    }


def _well_formed_cross_insight(idx=1):
    return {
        "cross_insight_id": f"CI{idx:03d}",
        "headline": f"Cross headline {idx}",
        "explanation": f"Cross explanation {idx}",
        "consistency": "high",
    }


def _well_formed_system_principle(idx=1):
    return {
        "system_principle_id": f"SP{idx:03d}",
        "principle": f"The system should strategically do {idx}",
        "context_adaptations": "varies",
    }


# ---------------------------------------------------------------------------
# Test matrix: one row per node
# ---------------------------------------------------------------------------

NODE_CASES = [
    pytest.param(
        _coerce_chunk_items,
        validate_chunks,
        _well_formed_chunk,
        "text",
        id="chunk",
    ),
    pytest.param(
        _coerce_inference_items,
        validate_inferences,
        _well_formed_inference,
        None,  # inference uses sub-list, no single text key
        id="infer",
    ),
    pytest.param(
        _coerce_pattern_items,
        validate_patterns,
        _well_formed_pattern,
        "pattern_name",
        id="relate",
    ),
    pytest.param(
        _coerce_principle_items,
        validate_design_principles,
        _well_formed_principle,
        "principle",
        id="activate",
    ),
    pytest.param(
        _coerce_meta_pattern_items,
        validate_meta_patterns,
        _well_formed_meta_pattern,
        "pattern_name",
        id="cross_relate",
    ),
    pytest.param(
        _coerce_cross_insight_items,
        validate_cross_insights,
        _well_formed_cross_insight,
        "headline",
        id="cross_explain",
    ),
    pytest.param(
        _coerce_system_principle_items,
        validate_system_principles,
        _well_formed_system_principle,
        "principle",
        id="cross_activate",
    ),
]


# ---------------------------------------------------------------------------
# Parameterized unit tests for each node's coercion helper
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("coerce,validator,factory,text_key", NODE_CASES)
def test_well_formed_dicts_pass_through(coerce, validator, factory, text_key):
    items = [factory(1), factory(2)]
    result = coerce(items)
    assert result == items
    validator(result)


@pytest.mark.parametrize("coerce,validator,factory,text_key", NODE_CASES)
def test_bare_strings_are_coerced(coerce, validator, factory, text_key):
    bare = ["First bare item", "Second bare item"]
    result = coerce(bare)
    assert isinstance(result, list)
    assert len(result) == 2
    for item in result:
        assert isinstance(item, dict)
    validator(result)


@pytest.mark.parametrize("coerce,validator,factory,text_key", NODE_CASES)
def test_bare_strings_preserve_text(coerce, validator, factory, text_key):
    bare = ["A meaningful headline string"]
    result = coerce(bare)
    assert len(result) == 1
    item = result[0]
    flattened = " ".join(
        v if isinstance(v, str) else " ".join(v) if isinstance(v, list) else ""
        for v in item.values()
    )
    assert "A meaningful headline string" in flattened


@pytest.mark.parametrize("coerce,validator,factory,text_key", NODE_CASES)
def test_mixed_strings_and_dicts_are_coerced(coerce, validator, factory, text_key):
    mixed = [
        "A bare string",
        factory(2),
        "Another bare string",
    ]
    result = coerce(mixed)
    assert len(result) == 3
    assert isinstance(result[0], dict)
    assert result[1] == factory(2)
    assert isinstance(result[2], dict)
    validator(result)


@pytest.mark.parametrize("coerce,validator,factory,text_key", NODE_CASES)
def test_empty_strings_are_dropped(coerce, validator, factory, text_key):
    items = ["Real item", "", "   ", "\t\n"]
    result = coerce(items)
    assert len(result) == 1
    assert isinstance(result[0], dict)
    validator(result)


@pytest.mark.parametrize("coerce,validator,factory,text_key", NODE_CASES)
def test_empty_list_still_rejected_by_validator(coerce, validator, factory, text_key):
    result = coerce([])
    assert result == []
    with pytest.raises(OutputValidationError):
        validator(result)


@pytest.mark.parametrize("coerce,validator,factory,text_key", NODE_CASES)
def test_non_list_passes_through(coerce, validator, factory, text_key):
    payload = {"oops": "wrong shape"}
    result = coerce(payload)
    assert result == payload
    with pytest.raises(OutputValidationError):
        validator(result)


# ---------------------------------------------------------------------------
# Per-video node integration tests with mocked llm_service
# ---------------------------------------------------------------------------


def _video_state(**overrides):
    base = {
        "video_id": "test-video",
        "transcript": {
            "utterances": [
                {"speaker": "A", "start": 0, "text": "I think the system is broken."},
            ]
        },
        "speaker_labels": {"A": "Alice"},
        "speaker_roles": {"A": "participant"},
        "project_description": None,
        "chunks": [_well_formed_chunk(1)],
        "inferences": [_well_formed_inference(1)],
        "patterns": [_well_formed_pattern(1)],
        "insights": [
            {
                "insight_id": "IN001",
                "headline": "Headline 1",
                "explanation": "Explanation 1",
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


def test_chunk_node_succeeds_on_bare_string_response():
    bare = [
        "I think the participant said something meaningful here.",
        "Another full participant sentence with enough words to keep.",
    ]
    with patch.object(chunk_module, "llm_service", create=True) as mock_llm:
        mock_llm.call_with_json_list_response.return_value = bare
        result = chunk_node(_video_state())

    assert result.get("error") is None
    assert result.get("current_step") == "infer"
    chunks = result.get("chunks")
    assert chunks is not None and len(chunks) == 2
    for c in chunks:
        assert isinstance(c, dict)
        assert c["type"] == "quote"


def test_infer_node_succeeds_on_bare_string_response():
    bare = ["This means X", "This means Y"]
    with patch.object(infer_module, "llm_service", create=True) as mock_llm:
        mock_llm.call_with_json_list_response.return_value = bare
        result = infer_node(_video_state())

    assert result.get("error") is None
    assert result.get("current_step") == "relate"
    inferences = result.get("inferences")
    assert inferences is not None and len(inferences) == 2
    for inf in inferences:
        assert isinstance(inf, dict)
        assert isinstance(inf["inferences"], list)


def test_relate_node_succeeds_on_bare_string_response():
    bare = ["Trust pattern", "Speed pattern"]
    with patch.object(relate_module, "llm_service", create=True) as mock_llm:
        mock_llm.call_with_json_list_response.return_value = bare
        result = relate_node(_video_state())

    assert result.get("error") is None
    assert result.get("current_step") == "explain"
    patterns = result.get("patterns")
    assert patterns is not None and len(patterns) == 2
    headlines = {p["pattern_name"] for p in patterns}
    assert "Trust pattern" in headlines
    assert "Speed pattern" in headlines


def test_activate_node_succeeds_on_bare_string_response():
    bare = [
        "The system should respect user autonomy",
        "The experience must reduce friction",
    ]
    with patch.object(activate_module, "llm_service", create=True) as mock_llm:
        mock_llm.call_with_json_list_response.return_value = bare
        result = activate_node(_video_state())

    assert result.get("error") is None
    assert result.get("current_step") == "completed"
    principles = result.get("design_principles")
    assert principles is not None and len(principles) == 2
    assert all(isinstance(p, dict) for p in principles)
    texts = {p["principle"] for p in principles}
    assert "The system should respect user autonomy" in texts


# ---------------------------------------------------------------------------
# Cross-video node integration tests with mocked llm_service
# ---------------------------------------------------------------------------


def _project_state(**overrides):
    base = {
        "project_id": "test-project",
        "video_ids": ["v1", "v2"],
        "video_patterns": [_well_formed_pattern(1)],
        "video_insights": [
            {
                "insight_id": "IN001",
                "headline": "Headline 1",
                "explanation": "Explanation 1",
            }
        ],
        "video_principles": [_well_formed_principle(1)],
        "cross_video_patterns": [_well_formed_meta_pattern(1)],
        "cross_video_insights": [_well_formed_cross_insight(1)],
        "cross_video_principles": None,
        "api_key": None,
        "model": None,
        "current_step": "cross_relate",
        "error": None,
    }
    base.update(overrides)
    return base


def test_cross_relate_node_succeeds_on_bare_string_response():
    bare = ["Meta theme one", "Meta theme two"]
    with patch.object(cross_relate_module, "llm_service", create=True) as mock_llm:
        mock_llm.call_with_json_list_response.return_value = bare
        result = cross_relate_node(_project_state())

    assert result.get("error") is None
    assert result.get("current_step") == "cross_explain"
    cross_patterns = result.get("cross_video_patterns")
    assert cross_patterns is not None and len(cross_patterns) == 2
    names = {p["pattern_name"] for p in cross_patterns}
    assert "Meta theme one" in names


def test_cross_explain_node_succeeds_on_bare_string_response():
    bare = ["Cross-video truth one", "Cross-video truth two"]
    with patch.object(cross_explain_module, "llm_service", create=True) as mock_llm:
        mock_llm.call_with_json_list_response.return_value = bare
        result = cross_explain_node(_project_state())

    assert result.get("error") is None
    assert result.get("current_step") == "cross_activate"
    cross_insights = result.get("cross_video_insights")
    assert cross_insights is not None and len(cross_insights) == 2
    headlines = {i["headline"] for i in cross_insights}
    assert "Cross-video truth one" in headlines


def test_cross_activate_node_succeeds_on_bare_string_response():
    bare = [
        "The system should adapt to context",
        "The experience must scale across users",
    ]
    with patch.object(cross_activate_module, "llm_service", create=True) as mock_llm:
        mock_llm.call_with_json_list_response.return_value = bare
        result = cross_activate_node(_project_state())

    assert result.get("error") is None
    assert result.get("current_step") == "completed"
    sps = result.get("cross_video_principles")
    assert sps is not None and len(sps) == 2
    texts = {p["principle"] for p in sps}
    assert "The system should adapt to context" in texts


# ---------------------------------------------------------------------------
# Regression: cross-video nodes must request enough output tokens
# ---------------------------------------------------------------------------

# Cross-video synthesis aggregates patterns/insights/principles across ALL
# videos, so its output is at least as large as the per-video synthesis nodes
# (relate/explain request 16384). The cross nodes originally requested only
# 8192, which truncated the response (finish_reason=length) -> JSON parse
# failure on every model in the fallback chain -> the cross-video step died in
# a retry loop. Pin a >=16384 floor so a too-small value can't regress.
_CROSS_NODE_MAXTOK_CASES = [
    pytest.param(cross_relate_module, cross_relate_node, id="cross_relate"),
    pytest.param(cross_explain_module, cross_explain_node, id="cross_explain"),
    pytest.param(cross_activate_module, cross_activate_node, id="cross_activate"),
]


@pytest.mark.parametrize("module,node_fn", _CROSS_NODE_MAXTOK_CASES)
def test_cross_node_requests_adequate_max_tokens(module, node_fn):
    bare = ["Meta theme one", "Meta theme two"]
    with patch.object(module, "llm_service", create=True) as mock_llm:
        mock_llm.call_with_json_list_response.return_value = bare
        node_fn(_project_state())

    assert mock_llm.call_with_json_list_response.called, (
        f"{node_fn.__name__} never called the LLM"
    )
    kwargs = mock_llm.call_with_json_list_response.call_args.kwargs
    requested = kwargs.get("max_tokens", 0)
    assert requested >= 16384, (
        f"{node_fn.__name__} requested max_tokens={requested}; too small for "
        f"cross-video output (truncates -> finish_reason=length -> parse fail)"
    )
