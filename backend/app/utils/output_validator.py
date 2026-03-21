"""Output validation for LLM responses in analysis nodes.

Each analysis node produces a JSON list with a specific structure.
This module defines lightweight validators that check the top-level
shape of each response (is it a list? do items have expected keys?
are values the right types?) without over-engineering deep validation.

If validation fails, the caller can retry once before storing an error.
"""

import logging
from typing import Any, Dict, List, Set

logger = logging.getLogger(__name__)


class OutputValidationError(Exception):
    """Raised when LLM output does not match the expected schema."""
    pass


def _check_list(data: Any, node_name: str) -> List[Dict[str, Any]]:
    """Ensure data is a non-empty list of dicts."""
    if not isinstance(data, list):
        raise OutputValidationError(
            f"[{node_name}] Expected a list, got {type(data).__name__}"
        )
    if len(data) == 0:
        raise OutputValidationError(
            f"[{node_name}] Expected a non-empty list, got empty list"
        )
    for i, item in enumerate(data):
        if not isinstance(item, dict):
            raise OutputValidationError(
                f"[{node_name}] Item {i} is {type(item).__name__}, expected dict"
            )
    return data


def _check_keys(
    item: Dict[str, Any],
    required_keys: Set[str],
    node_name: str,
    item_label: str = "item",
) -> None:
    """Check that a dict has all required keys."""
    missing = required_keys - set(item.keys())
    if missing:
        raise OutputValidationError(
            f"[{node_name}] {item_label} missing required keys: {missing}"
        )


def validate_chunks(data: Any) -> List[Dict[str, Any]]:
    """Validate chunk node output."""
    items = _check_list(data, "CHUNK")
    required = {"chunk_id", "text", "type"}
    for i, item in enumerate(items):
        _check_keys(item, required, "CHUNK", f"Chunk {i}")
        if not isinstance(item.get("text"), str) or not item["text"].strip():
            raise OutputValidationError(
                f"[CHUNK] Chunk {i} has empty or non-string 'text'"
            )
    return items


def validate_inferences(data: Any) -> List[Dict[str, Any]]:
    """Validate infer node output."""
    items = _check_list(data, "INFER")
    required = {"chunk_id", "inferences"}
    for i, item in enumerate(items):
        _check_keys(item, required, "INFER", f"Inference group {i}")
        infs = item.get("inferences")
        if not isinstance(infs, list):
            raise OutputValidationError(
                f"[INFER] Inference group {i} 'inferences' is not a list"
            )
    return items


def validate_patterns(data: Any) -> List[Dict[str, Any]]:
    """Validate relate node output."""
    items = _check_list(data, "RELATE")
    required = {"pattern_id", "pattern_name", "description"}
    for i, item in enumerate(items):
        _check_keys(item, required, "RELATE", f"Pattern {i}")
    return items


def validate_insights(data: Any) -> List[Dict[str, Any]]:
    """Validate explain node output."""
    items = _check_list(data, "EXPLAIN")
    required = {"insight_id", "headline", "explanation"}
    for i, item in enumerate(items):
        _check_keys(item, required, "EXPLAIN", f"Insight {i}")
    return items


def validate_design_principles(data: Any) -> List[Dict[str, Any]]:
    """Validate activate node output."""
    items = _check_list(data, "ACTIVATE")
    required = {"principle_id", "principle"}
    for i, item in enumerate(items):
        _check_keys(item, required, "ACTIVATE", f"Principle {i}")
    return items


def validate_meta_patterns(data: Any) -> List[Dict[str, Any]]:
    """Validate cross_relate node output."""
    items = _check_list(data, "CROSS_RELATE")
    required = {"meta_pattern_id", "pattern_name", "description"}
    for i, item in enumerate(items):
        _check_keys(item, required, "CROSS_RELATE", f"Meta-pattern {i}")
    return items


def validate_cross_insights(data: Any) -> List[Dict[str, Any]]:
    """Validate cross_explain node output."""
    items = _check_list(data, "CROSS_EXPLAIN")
    required = {"cross_insight_id", "headline", "explanation"}
    for i, item in enumerate(items):
        _check_keys(item, required, "CROSS_EXPLAIN", f"Cross-insight {i}")
    return items


def validate_system_principles(data: Any) -> List[Dict[str, Any]]:
    """Validate cross_activate node output."""
    items = _check_list(data, "CROSS_ACTIVATE")
    required = {"system_principle_id", "principle"}
    for i, item in enumerate(items):
        _check_keys(item, required, "CROSS_ACTIVATE", f"System principle {i}")
    return items
