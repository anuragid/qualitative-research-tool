"""ACTIVATE node - Turn insights into design principles."""

import logging
import json
from typing import Dict, Any

from app.agents.states import VideoAnalysisState
from app.agents.prompts import ACTIVATE_SYSTEM_PROMPT
from app.services.claude_service import claude_service

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

        # Call Claude with retry logic
        design_principles = claude_service.call_with_json_response(
            system_prompt=ACTIVATE_SYSTEM_PROMPT,
            user_message=user_message,
            max_tokens=8192,
        )

        # Validate response
        if not isinstance(design_principles, list):
            raise ValueError("Expected list of design principles from Claude")

        logger.info(f"[ACTIVATE] Generated {len(design_principles)} design principles")
        logger.info(f"[ACTIVATE] Video {state['video_id']} analysis complete!")

        return {
            **state,
            "design_principles": design_principles,
            "current_step": "completed",
            "error": None,
        }

    except Exception as e:
        logger.error(f"[ACTIVATE] Error in activate_node: {e}")
        return {
            **state,
            "design_principles": None,
            "current_step": "activate",
            "error": str(e),
        }
