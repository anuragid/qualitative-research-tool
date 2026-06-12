"""ACTIVATE node - Turn insights into design principles."""

import json
import logging
from typing import Any, Dict

from app.agents.prompts import ACTIVATE_SYSTEM_PROMPT
from app.agents.states import VideoAnalysisState
from app.services.llm_service import llm_service
from app.utils.error_classification import classify_error
from app.utils.output_validator import OutputValidationError, validate_design_principles

logger = logging.getLogger(__name__)


def _coerce_principle_items(items: Any) -> Any:
    """Coerce bare-string design-principle items into the expected dict shape.

    Llama-class models occasionally return a list of principle text strings
    instead of a list of principle objects. Wrap any such strings in a
    minimal valid dict so downstream validation can proceed. Non-list inputs
    are returned unchanged so the validator can produce its normal error.
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
                "principle_id": f"DP{i + 1:03d}",
                "principle": text,
                "source_insight": "",
                "how_might_we": "",
                "rationale": text,
            })
            coerced_count += 1
        else:
            coerced.append(item)

    if coerced_count > 0:
        logger.warning(
            f"[ACTIVATE] Coerced {coerced_count} bare-string item(s) into dict shape"
        )

    return coerced


def activate_node(state: VideoAnalysisState) -> Dict[str, Any]:
    """
    Step 5: Turn insights into design principles.

    Takes insights and transforms them into clear, actionable design
    principles with "How might we?" questions.

    Args:
        state: Current video analysis state

    Returns:
        Updated state with design_principles and completed status
    """
    logger.info(f"[ACTIVATE] Starting design principle generation for video {state['video_id']}")

    try:
        insights = state.get("insights")
        if not insights:
            raise ValueError("No insights available for design principle generation")

        # Format insights for Claude
        insights_json = json.dumps(insights)

        user_message = f"""Please turn the following insights into actionable design principles.

DESIGN PRINCIPLE RULES:
1. Clear, actionable, directional
2. Start with: "The system should..." or "The experience must..."
3. Include "How might we...?" questions that spark innovation

INSIGHTS:
{insights_json}

For each insight, create one or more design principles that provide strategic direction."""

        # Call LLM with retry logic (pass BYOK overrides if present)
        llm_kwargs = dict(
            system_prompt=ACTIVATE_SYSTEM_PROMPT,
            user_message=user_message,
            max_tokens=8192,
            api_key=state.get("api_key"),
            model=state.get("model"),
        )
        design_principles = llm_service.call_with_json_list_response(**llm_kwargs)
        design_principles = _coerce_principle_items(design_principles)

        # Validate response structure (retry once on failure)
        try:
            validate_design_principles(design_principles)
        except OutputValidationError as ve:
            logger.warning(f"[ACTIVATE] Output validation failed, retrying: {ve}")
            design_principles = llm_service.call_with_json_list_response(**llm_kwargs)
            design_principles = _coerce_principle_items(design_principles)
            try:
                validate_design_principles(design_principles)
            except OutputValidationError as ve2:
                logger.error(f"[ACTIVATE] Output validation failed after retry: {ve2}")
                return {
                    **state,
                    "design_principles": None,
                    "current_step": "activate",
                    "error": f"Output validation failed: {ve2}",
                    "error_type": "llm_error",
                }

        logger.info(f"[ACTIVATE] Generated {len(design_principles)} design principles")
        logger.info(f"[ACTIVATE] Video {state['video_id']} analysis complete!")

        return {
            **state,
            "design_principles": design_principles,
            "current_step": "completed",
            "error": None,
        }

    except Exception as e:
        error_type = classify_error(e)
        logger.error(f"[ACTIVATE] Error in activate_node: {type(e).__name__}: {e}", exc_info=True)
        return {
            **state,
            "design_principles": None,
            "current_step": "activate",
            "error": f"{type(e).__name__}: {e}",
            "error_type": error_type,
        }
