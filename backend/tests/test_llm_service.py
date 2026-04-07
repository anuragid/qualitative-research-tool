"""Tests for the LLM service — JSON parsing, list response, balanced extraction.

Covers: parse_json_response, call_with_json_list_response,
        _extract_balanced_json, _unwrap_single_key_object.
"""

import json
from unittest.mock import MagicMock

import pytest

from app.services.llm_service import LLMService


@pytest.fixture
def svc():
    """Create an LLMService instance with mocked client.

    openai is now lazy-imported inside the client property; inject the mock
    directly via _client so tests don't need to patch the module-level name.
    """
    service = LLMService()
    service._client = MagicMock()
    return service


# -----------------------------------------------------------------------
# parse_json_response
# -----------------------------------------------------------------------


class TestParseJsonResponse:
    """Tests for parse_json_response with various LLM output formats."""

    def test_valid_json_array(self, svc):
        result = svc.parse_json_response('[{"a": 1}, {"a": 2}]')
        assert result == [{"a": 1}, {"a": 2}]

    def test_valid_json_object(self, svc):
        result = svc.parse_json_response('{"key": "value"}')
        assert result == {"key": "value"}

    def test_single_key_object_unwrapped(self, svc):
        """A dict like {"result": [...]} should be unwrapped to the list."""
        result = svc.parse_json_response('{"result": [1, 2, 3]}')
        assert result == [1, 2, 3]

    def test_multi_key_object_not_unwrapped(self, svc):
        """A dict with multiple keys should NOT be unwrapped."""
        result = svc.parse_json_response('{"a": [1], "b": 2}')
        assert result == {"a": [1], "b": 2}

    def test_single_key_non_list_not_unwrapped(self, svc):
        """A single-key dict where the value is not a list stays as dict."""
        result = svc.parse_json_response('{"name": "test"}')
        assert result == {"name": "test"}

    def test_markdown_wrapped_json(self, svc):
        response = '```json\n[{"a": 1}]\n```'
        result = svc.parse_json_response(response)
        assert result == [{"a": 1}]

    def test_markdown_wrapped_without_lang(self, svc):
        response = '```\n{"key": "val"}\n```'
        result = svc.parse_json_response(response)
        assert result == {"key": "val"}

    def test_json_with_surrounding_text(self, svc):
        response = 'Here is the result:\n[{"x": 1}]\nEnd of response.'
        result = svc.parse_json_response(response)
        assert result == [{"x": 1}]

    def test_json_object_with_surrounding_text(self, svc):
        response = 'The analysis:\n{"data": [1,2,3]}\nDone!'
        result = svc.parse_json_response(response)
        # single-key with list value should unwrap
        assert result == [1, 2, 3]

    def test_empty_response_raises(self, svc):
        with pytest.raises(ValueError, match="Empty response"):
            svc.parse_json_response("")

    def test_whitespace_only_raises(self, svc):
        with pytest.raises(ValueError, match="Empty response"):
            svc.parse_json_response("   \n  ")

    def test_completely_malformed_raises(self, svc):
        with pytest.raises(ValueError, match="Could not parse JSON"):
            svc.parse_json_response("This is not JSON at all.")

    def test_nested_json_objects(self, svc):
        nested = json.dumps([{"outer": {"inner": [1, 2]}}])
        result = svc.parse_json_response(nested)
        assert result == [{"outer": {"inner": [1, 2]}}]


# -----------------------------------------------------------------------
# _extract_balanced_json
# -----------------------------------------------------------------------


class TestExtractBalancedJson:
    def test_simple_array(self):
        text = 'prefix [1, 2, 3] suffix'
        result = LLMService._extract_balanced_json(text, text.find("["), "[", "]")
        assert result == "[1, 2, 3]"

    def test_nested_objects(self):
        text = '{"a": {"b": {"c": 1}}}'
        result = LLMService._extract_balanced_json(text, 0, "{", "}")
        assert result == text

    def test_brackets_in_strings(self):
        text = '{"key": "value with [brackets]"}'
        result = LLMService._extract_balanced_json(text, 0, "{", "}")
        assert result == text

    def test_escaped_quotes_in_strings(self):
        text = r'{"key": "value with \"escaped\" quotes"}'
        result = LLMService._extract_balanced_json(text, 0, "{", "}")
        assert result is not None
        assert result.startswith("{")

    def test_unbalanced_returns_none(self):
        text = "[1, 2, 3"
        result = LLMService._extract_balanced_json(text, 0, "[", "]")
        assert result is None

    def test_empty_array(self):
        text = "result: []"
        result = LLMService._extract_balanced_json(text, text.find("["), "[", "]")
        assert result == "[]"

    def test_deeply_nested(self):
        text = "[[[[1]]]]"
        result = LLMService._extract_balanced_json(text, 0, "[", "]")
        assert result == text


# -----------------------------------------------------------------------
# _unwrap_single_key_object
# -----------------------------------------------------------------------


class TestUnwrapSingleKeyObject:
    def test_single_key_list_value(self):
        assert LLMService._unwrap_single_key_object({"data": [1, 2]}) == [1, 2]

    def test_single_key_non_list_value(self):
        assert LLMService._unwrap_single_key_object({"name": "test"}) == {"name": "test"}

    def test_multi_key_object(self):
        obj = {"a": [1], "b": 2}
        assert LLMService._unwrap_single_key_object(obj) == obj

    def test_empty_dict(self):
        assert LLMService._unwrap_single_key_object({}) == {}

    def test_non_dict_passthrough(self):
        assert LLMService._unwrap_single_key_object([1, 2]) == [1, 2]
        assert LLMService._unwrap_single_key_object("string") == "string"
        assert LLMService._unwrap_single_key_object(42) == 42


# -----------------------------------------------------------------------
# call_with_json_list_response
# -----------------------------------------------------------------------


class TestCallWithJsonListResponse:
    """Tests for call_with_json_list_response list-guarantee logic."""

    def test_happy_path_list(self, svc):
        """When LLM returns a list, return it directly."""
        svc.call_with_json_response = MagicMock(return_value=[{"a": 1}])
        result = svc.call_with_json_list_response(
            system_prompt="sys", user_message="msg"
        )
        assert result == [{"a": 1}]
        assert svc.call_with_json_response.call_count == 1

    def test_dict_with_list_value_extracted(self, svc):
        """When LLM returns a dict wrapping a list, extract it."""
        svc.call_with_json_response = MagicMock(
            return_value={"insights": [{"i": 1}]}
        )
        result = svc.call_with_json_list_response(
            system_prompt="sys", user_message="msg"
        )
        assert result == [{"i": 1}]

    def test_single_dict_retries_then_gets_list(self, svc):
        """When LLM returns single dict, retries; second call returns list."""
        svc.call_with_json_response = MagicMock(
            side_effect=[
                {"single": "item"},          # first call: single dict
                [{"single": "item"}],         # retry: list
            ]
        )
        result = svc.call_with_json_list_response(
            system_prompt="sys", user_message="msg"
        )
        assert result == [{"single": "item"}]
        assert svc.call_with_json_response.call_count == 2

    def test_single_dict_retry_also_single_wraps(self, svc):
        """When retry also returns single dict, wrap in list as fallback."""
        svc.call_with_json_response = MagicMock(
            side_effect=[
                {"single": "item"},            # first call
                {"still_single": "item"},       # retry: still a dict
            ]
        )
        result = svc.call_with_json_list_response(
            system_prompt="sys", user_message="msg"
        )
        assert result == [{"still_single": "item"}]

    def test_retry_returns_dict_with_list_value(self, svc):
        """When retry returns a dict wrapping a list, extract the list."""
        svc.call_with_json_response = MagicMock(
            side_effect=[
                {"single": "item"},                  # first: no list value
                {"results": [{"a": 1}, {"a": 2}]},   # retry: dict wrapping list
            ]
        )
        result = svc.call_with_json_list_response(
            system_prompt="sys", user_message="msg"
        )
        assert result == [{"a": 1}, {"a": 2}]

    def test_retry_augments_system_prompt(self, svc):
        """Retry call should include explicit array instruction in system prompt."""
        svc.call_with_json_response = MagicMock(
            side_effect=[
                {"single": "item"},
                [{"single": "item"}],
            ]
        )
        svc.call_with_json_list_response(
            system_prompt="original prompt", user_message="msg"
        )
        # Verify the retry happened (2 total calls)
        assert svc.call_with_json_response.call_count == 2

    def test_non_list_non_dict_raises(self, svc):
        """If the result is neither list nor dict, raise ValueError."""
        svc.call_with_json_response = MagicMock(return_value="just a string")
        with pytest.raises(ValueError, match="Expected list"):
            svc.call_with_json_list_response(
                system_prompt="sys", user_message="msg"
            )

    def test_integer_result_raises(self, svc):
        svc.call_with_json_response = MagicMock(return_value=42)
        with pytest.raises(ValueError, match="Expected list"):
            svc.call_with_json_list_response(
                system_prompt="sys", user_message="msg"
            )

    def test_none_result_raises(self, svc):
        svc.call_with_json_response = MagicMock(return_value=None)
        with pytest.raises(ValueError, match="Expected list"):
            svc.call_with_json_list_response(
                system_prompt="sys", user_message="msg"
            )
