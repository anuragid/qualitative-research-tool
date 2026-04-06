"""RELATE node - Find patterns across inferences."""

import json
import logging
from typing import Any, Dict

from app.agents.prompts import RELATE_SYSTEM_PROMPT
from app.agents.states import VideoAnalysisState
from app.services.llm_service import llm_service
from app.utils.error_classification import classify_error
from app.utils.input_sanitizer import sanitize_for_prompt
from app.utils.output_validator import OutputValidationError, validate_patterns

logger = logging.getLogger(__name__)


def _coerce_pattern_items(items: Any) -> Any:
    """Coerce bare-string pattern items into the expected dict shape.

    Llama-class models occasionally return a list of pattern name strings
    instead of a list of pattern objects. Wrap any such strings in a minimal
    valid dict so downstream validation and post-processing can proceed.
    Non-list inputs are returned unchanged so the validator can produce its
    normal error.
    """
    if not isinstance(items, list):
        return items

    coerced = []
    coerced_count = 0
    for i, item in enumerate(items):
        if isinstance(item, str):
            text = item.strip()
            if not text:
                continue
            coerced.append({
                "pattern_id": f"P{i + 1:03d}",
                "pattern_name": text,
                "description": text,
                "supporting_inferences": [],
                "relationship_type": "convergent",
            })
            coerced_count += 1
        else:
            coerced.append(item)

    if coerced_count > 0:
        logger.warning(
            f"[RELATE] Coerced {coerced_count} bare-string item(s) into dict shape"
        )

    return coerced


def relate_node(state: VideoAnalysisState) -> Dict[str, Any]:
    """
    Step 3: Find patterns across inferences.

    Takes inferences and identifies patterns, grouping inferences
    that point in the same direction or share meanings.

    Args:
        state: Current video analysis state

    Returns:
        Updated state with patterns
    """
    logger.info(f"[RELATE] Starting pattern analysis for video {state['video_id']}")

    try:
        inferences = state.get("inferences")
        if not inferences:
            raise ValueError("No inferences available for pattern analysis")

        # Format inferences for Claude
        inferences_json = json.dumps(inferences)

        # Build research context if available
        research_context = ""
        if state.get("project_description"):
            safe_description = sanitize_for_prompt(state["project_description"], max_length=5000)
            research_context = f"""
RESEARCH CONTEXT:
<research_context>{safe_description}</research_context>
Focus on patterns that are relevant to this research context.
"""

        user_message = f"""Please analyze the following inferences and identify patterns.
{research_context}
Look for:
- Inferences that point in the same direction
- Repeated themes or meanings
- Relationships between different inferences

INFERENCES:
{inferences_json}

Group related inferences into patterns and explain what each pattern represents."""

        # Call LLM with retry logic (pass BYOK overrides if present)
        llm_kwargs = dict(
            system_prompt=RELATE_SYSTEM_PROMPT,
            user_message=user_message,
            max_tokens=16384,  # Increased for many inferences
            api_key=state.get("api_key"),
            model=state.get("model"),
        )
        patterns = llm_service.call_with_json_list_response(**llm_kwargs)
        patterns = _coerce_pattern_items(patterns)

        # Validate response structure (retry once on failure)
        try:
            validate_patterns(patterns)
        except OutputValidationError as ve:
            logger.warning(f"[RELATE] Output validation failed, retrying: {ve}")
            patterns = llm_service.call_with_json_list_response(**llm_kwargs)
            patterns = _coerce_pattern_items(patterns)
            try:
                validate_patterns(patterns)
            except OutputValidationError as ve2:
                logger.error(f"[RELATE] Output validation failed after retry: {ve2}")
                return {
                    **state,
                    "patterns": None,
                    "current_step": "relate",
                    "error": f"Output validation failed: {ve2}",
                }

        logger.info(f"[RELATE] Identified {len(patterns)} patterns")

        # Ensure relationship_type is present on all patterns
        VALID_RELATIONSHIP_TYPES = {"convergent", "divergent", "tension", "causal"}
        for pattern in patterns:
            rt = pattern.get("relationship_type", "")
            if rt not in VALID_RELATIONSHIP_TYPES:
                pattern["relationship_type"] = "convergent"
                logger.warning(
                    f"[RELATE] Pattern {pattern.get('pattern_id', '?')} missing/invalid "
                    f"relationship_type '{rt}', defaulting to 'convergent'"
                )

        return {
            **state,
            "patterns": patterns,
            "current_step": "explain",
            "error": None,
        }

    except Exception as e:
        error_type = classify_error(e)
        logger.error(f"[RELATE] Error in relate_node: {type(e).__name__}: {e}", exc_info=True)
        return {
            **state,
            "patterns": None,
            "current_step": "relate",
            "error": f"{type(e).__name__}: {e}",
            "error_type": error_type,
        }
