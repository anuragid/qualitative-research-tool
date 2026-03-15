"""ACTIVATE node - Turn insights into design principles."""

import json
import logging
from typing import Any, Dict

from app.agents.prompts import ACTIVATE_SYSTEM_PROMPT
from app.agents.states import VideoAnalysisState
from app.services.llm_service import llm_service

logger = logging.getLogger(__name__)


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
        insights_json = json.dumps(insights, indent=2)

        user_message = f"""Please turn the following insights into actionable design principles.

DESIGN PRINCIPLE RULES:
1. Clear, actionable, directional
2. Start with: "The system should..." or "The experience must..."
3. Include "How might we...?" questions that spark innovation

INSIGHTS:
{insights_json}

For each insight, create one or more design principles that provide strategic direction."""

        # Call LLM with retry logic (pass BYOK overrides if present)
        design_principles = llm_service.call_with_json_list_response(
            system_prompt=ACTIVATE_SYSTEM_PROMPT,
            user_message=user_message,
            max_tokens=8192,
            api_key=state.get("api_key"),
            model=state.get("model"),
        )

        # Validate response

        logger.info(f"[ACTIVATE] Generated {len(design_principles)} design principles")
        logger.info(f"[ACTIVATE] Video {state['video_id']} analysis complete!")

        return {
            **state,
            "design_principles": design_principles,
            "current_step": "completed",
            "error": None,
        }

    except Exception as e:
        logger.error(f"[ACTIVATE] Error in activate_node: {type(e).__name__}: {e}", exc_info=True)
        return {
            **state,
            "design_principles": None,
            "current_step": "activate",
            "error": f"{type(e).__name__}: {e}",
        }
