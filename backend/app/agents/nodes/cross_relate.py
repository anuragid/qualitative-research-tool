"""CROSS_RELATE node - Find meta-patterns across multiple videos."""

import json
import logging
from typing import Any, Dict

from app.agents.prompts import CROSS_RELATE_SYSTEM_PROMPT
from app.agents.states import ProjectAnalysisState
from app.services.llm_service import llm_service
from app.utils.error_classification import classify_error
from app.utils.output_validator import OutputValidationError, validate_meta_patterns

logger = logging.getLogger(__name__)


def _coerce_meta_pattern_items(items: Any) -> Any:
    """Coerce bare-string meta-pattern items into the expected dict shape.

    Llama-class models occasionally return a list of meta-pattern name
    strings instead of a list of meta-pattern objects. Wrap any such strings
    in a minimal valid dict so downstream validation can proceed. Non-list
    inputs are returned unchanged so the validator can produce its normal
    error.
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
                "meta_pattern_id": f"MP{i + 1:03d}",
                "pattern_name": text,
                "description": text,
                "source_videos": [],
                "source_patterns": [],
                "variations": "",
                "significance": "",
            })
            coerced_count += 1
        else:
            coerced.append(item)

    if coerced_count > 0:
        logger.warning(
            f"[CROSS_RELATE] Coerced {coerced_count} bare-string item(s) into dict shape"
        )

    return coerced


def cross_relate_node(state: ProjectAnalysisState) -> Dict[str, Any]:
    """
    Step 6: Find meta-patterns across multiple videos.

    Takes patterns from all videos and identifies higher-order themes
    that appear across multiple contexts.

    Args:
        state: Current project analysis state

    Returns:
        Updated state with cross_video_patterns
    """
    logger.info(f"[CROSS_RELATE] Starting cross-video pattern analysis for project {state['project_id']}")

    try:
        video_patterns = state.get("video_patterns")
        if not video_patterns:
            raise ValueError("No video patterns available for cross-video analysis")

        # Format patterns from all videos for Claude
        patterns_json = json.dumps(video_patterns)

        user_message = f"""Please analyze patterns from multiple videos and identify meta-patterns.

CROSS-VIDEO RULES:
1. Look for patterns appearing in 2+ videos
2. Identify higher-order themes
3. Note variations by context
4. Explain the significance of each meta-pattern

VIDEO PATTERNS:
{patterns_json}

Find patterns that transcend individual videos and reveal system-level themes."""

        # Call LLM with retry logic (pass BYOK overrides if present)
        llm_kwargs = dict(
            system_prompt=CROSS_RELATE_SYSTEM_PROMPT,
            user_message=user_message,
            max_tokens=16384,  # Cross-video synthesis aggregates patterns across all videos; 8192 truncated the response (finish_reason=length) -> JSON parse fail. Matches per-video relate.
            api_key=state.get("api_key"),
            model=state.get("model"),
        )
        cross_patterns = llm_service.call_with_json_list_response(**llm_kwargs)
        cross_patterns = _coerce_meta_pattern_items(cross_patterns)

        # Validate response structure (retry once on failure)
        try:
            validate_meta_patterns(cross_patterns)
        except OutputValidationError as ve:
            logger.warning(f"[CROSS_RELATE] Output validation failed, retrying: {ve}")
            cross_patterns = llm_service.call_with_json_list_response(**llm_kwargs)
            cross_patterns = _coerce_meta_pattern_items(cross_patterns)
            try:
                validate_meta_patterns(cross_patterns)
            except OutputValidationError as ve2:
                logger.error(f"[CROSS_RELATE] Output validation failed after retry: {ve2}")
                return {
                    **state,
                    "cross_video_patterns": None,
                    "current_step": "cross_relate",
                    "error": f"Output validation failed: {ve2}",
                    "error_type": "llm_error",
                }

        logger.info(f"[CROSS_RELATE] Identified {len(cross_patterns)} meta-patterns across videos")

        return {
            **state,
            "cross_video_patterns": cross_patterns,
            "current_step": "cross_explain",
            "error": None,
        }

    except Exception as e:
        error_type = classify_error(e)
        logger.error(f"[CROSS_RELATE] Error in cross_relate_node: {type(e).__name__}: {e}", exc_info=True)
        return {
            **state,
            "cross_video_patterns": None,
            "current_step": "cross_relate",
            "error": f"{type(e).__name__}: {e}",
            "error_type": error_type,
        }
