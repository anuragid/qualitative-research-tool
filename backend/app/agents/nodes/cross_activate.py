"""CROSS_ACTIVATE node - Create system-level design principles."""

import json
import logging
from typing import Any, Dict

from app.agents.prompts import CROSS_ACTIVATE_SYSTEM_PROMPT
from app.agents.states import ProjectAnalysisState
from app.services.llm_service import llm_service
from app.utils.output_validator import OutputValidationError, validate_system_principles

logger = logging.getLogger(__name__)


def cross_activate_node(state: ProjectAnalysisState) -> Dict[str, Any]:
    """
    Step 8: Create system-level design principles from cross-video insights.

    Takes cross-video insights and transforms them into strategic,
    system-level design principles that apply broadly across contexts.

    Args:
        state: Current project analysis state

    Returns:
        Updated state with cross_video_principles and completed status
    """
    logger.info(f"[CROSS_ACTIVATE] Starting system-level principle generation for project {state['project_id']}")

    try:
        cross_insights = state.get("cross_video_insights")
        if not cross_insights:
            raise ValueError("No cross-video insights available for principle generation")

        # Format insights for Claude
        insights_json = json.dumps(cross_insights)

        user_message = f"""Please turn the following cross-video insights into system-level design principles.

SYSTEM PRINCIPLE RULES:
1. Apply broadly across contexts
2. Strategic direction (not tactical)
3. Context-aware - explain how to adapt to different situations
4. Include "How might we?" questions for strategic innovation

CROSS-VIDEO INSIGHTS:
{insights_json}

Create design principles that provide strategic direction for the entire system."""

        # Call LLM with retry logic (pass BYOK overrides if present)
        llm_kwargs = dict(
            system_prompt=CROSS_ACTIVATE_SYSTEM_PROMPT,
            user_message=user_message,
            max_tokens=8192,
            api_key=state.get("api_key"),
            model=state.get("model"),
        )
        system_principles = llm_service.call_with_json_list_response(**llm_kwargs)

        # Validate response structure (retry once on failure)
        try:
            validate_system_principles(system_principles)
        except OutputValidationError as ve:
            logger.warning(f"[CROSS_ACTIVATE] Output validation failed, retrying: {ve}")
            system_principles = llm_service.call_with_json_list_response(**llm_kwargs)
            try:
                validate_system_principles(system_principles)
            except OutputValidationError as ve2:
                logger.error(f"[CROSS_ACTIVATE] Output validation failed after retry: {ve2}")
                return {
                    **state,
                    "cross_video_principles": None,
                    "current_step": "cross_activate",
                    "error": f"Output validation failed: {ve2}",
                }

        logger.info(f"[CROSS_ACTIVATE] Generated {len(system_principles)} system-level design principles")
        logger.info(f"[CROSS_ACTIVATE] Project {state['project_id']} cross-video analysis complete!")

        return {
            **state,
            "cross_video_principles": system_principles,
            "current_step": "completed",
            "error": None,
        }

    except Exception as e:
        logger.error(f"[CROSS_ACTIVATE] Error in cross_activate_node: {type(e).__name__}: {e}", exc_info=True)
        return {
            **state,
            "cross_video_principles": None,
            "current_step": "cross_activate",
            "error": f"{type(e).__name__}: {e}",
        }
