"""Tests for EXPLAIN node string-to-dict coercion of LLM output."""

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

from app.agents.nodes import explain as explain_module
from app.agents.nodes.explain import _coerce_insight_items, explain_node
from app.utils.output_validator import OutputValidationError, validate_insights


def _well_formed_insight(idx: int = 1) -> dict:
    return {
        "insight_id": f"IN{idx:03d}",
        "headline": f"Headline {idx}",
        "explanation": f"Explanation {idx}",
        "supporting_patterns": ["P001"],
        "evidence": ["A full quote from a participant"],
        "type": "non-consensus",
        "implications": f"Implications {idx}",
        "confidence": "high",
    }


def _video_state(**overrides):
    base = {
        "video_id": "test-video",
        "transcript": {"utterances": []},
        "speaker_labels": {},
        "speaker_roles": {},
        "project_description": None,
        "chunks": [
            {"chunk_id": "C001", "text": "A real participant quote", "speaker": "Alice", "type": "quote"}
        ],
        "inferences": [],
        "patterns": [{"pattern_id": "P001", "pattern_name": "x", "description": "y"}],
        "insights": None,
        "design_principles": None,
        "api_key": None,
        "model": None,
        "current_step": "explain",
        "error": None,
    }
    base.update(overrides)
    return base


class TestCoerceInsightItems:
    """Unit tests for the _coerce_insight_items helper."""

    def test_well_formed_dicts_pass_through(self):
        items = [_well_formed_insight(1), _well_formed_insight(2)]
        result = _coerce_insight_items(items)
        assert result == items
        validate_insights(result)

    def test_bare_strings_are_coerced(self):
        items = ["Users distrust automation", "Speed beats accuracy"]
        result = _coerce_insight_items(items)
        assert len(result) == 2
        for i, insight in enumerate(result):
            assert isinstance(insight, dict)
            assert insight["insight_id"] == f"IN{i + 1:03d}"
            assert insight["headline"] == items[i]
            assert insight["explanation"] == items[i]
            assert insight["type"] == "non-consensus"
            assert insight["confidence"] == "medium"
            assert insight["supporting_patterns"] == []
            assert insight["evidence"] == []
        validate_insights(result)

    def test_mixed_strings_and_dicts_are_coerced(self):
        items = [
            "A bare string headline",
            _well_formed_insight(2),
            "Another bare string",
        ]
        result = _coerce_insight_items(items)
        assert len(result) == 3
        assert isinstance(result[0], dict) and result[0]["headline"] == "A bare string headline"
        assert result[1] == _well_formed_insight(2)
        assert isinstance(result[2], dict) and result[2]["headline"] == "Another bare string"
        validate_insights(result)

    def test_empty_strings_are_dropped(self):
        items = ["Real headline", "", "   "]
        result = _coerce_insight_items(items)
        assert len(result) == 1
        assert result[0]["headline"] == "Real headline"

    def test_empty_list_still_rejected_by_validator(self):
        result = _coerce_insight_items([])
        assert result == []
        with pytest.raises(OutputValidationError):
            validate_insights(result)

    def test_non_list_passes_through(self):
        result = _coerce_insight_items({"insights": "oops"})
        assert result == {"insights": "oops"}
        with pytest.raises(OutputValidationError):
            validate_insights(result)


class TestExplainNodeWithCoercion:
    """Integration tests: explain_node should succeed when LLM returns bare strings."""

    def test_explain_node_succeeds_on_bare_string_response(self):
        bare_strings = [
            "Users distrust automation when stakes are high",
            "Speed beats accuracy for low-stakes tasks",
        ]
        with patch.object(explain_module, "llm_service", create=True) as mock_llm:
            mock_llm.call_with_json_list_response.return_value = bare_strings
            result = explain_node(_video_state())

        assert result.get("error") is None
        assert result.get("current_step") == "activate"
        insights = result.get("insights")
        assert insights is not None and len(insights) == 2
        for insight in insights:
            assert isinstance(insight, dict)
            assert insight["headline"] in bare_strings
            assert insight["type"] == "non-consensus"

    def test_explain_node_succeeds_on_well_formed_response(self):
        with patch.object(explain_module, "llm_service", create=True) as mock_llm:
            mock_llm.call_with_json_list_response.return_value = [
                _well_formed_insight(1),
                _well_formed_insight(2),
            ]
            result = explain_node(_video_state())

        assert result.get("error") is None
        assert result.get("current_step") == "activate"
        assert len(result["insights"]) == 2

    def test_explain_node_succeeds_on_mixed_response(self):
        mixed = [
            "A bare string insight",
            _well_formed_insight(2),
        ]
        with patch.object(explain_module, "llm_service", create=True) as mock_llm:
            mock_llm.call_with_json_list_response.return_value = mixed
            result = explain_node(_video_state())

        assert result.get("error") is None
        assert len(result["insights"]) == 2
        headlines = {i["headline"] for i in result["insights"]}
        assert "A bare string insight" in headlines
        assert "Headline 2" in headlines
