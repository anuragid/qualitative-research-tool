"""CROSS_ACTIVATE node - Create system-level design principles."""

import logging
import json
from typing import Dict, Any

from app.agents.states import ProjectAnalysisState
from app.agents.prompts import CROSS_ACTIVATE_SYSTEM_PROMPT
from app.services.claude_service import claude_service

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
        insights_json = json.dumps(cross_insights, indent=2)

        user_message = f"""Please turn the following cross-video insights into system-level design principles.

SYSTEM PRINCIPLE RULES:
1. Apply broadly across contexts
2. Strategic direction (not tactical)
3. Context-aware - explain how to adapt to different situations
4. Include "How might we?" questions for strategic innovation

CROSS-VIDEO INSIGHTS:
{insights_json}

Create design principles that provide strategic direction for the entire system."""

        # Call Claude with retry logic
        system_principles = claude_service.call_with_json_response(
            system_prompt=CROSS_ACTIVATE_SYSTEM_PROMPT,
            user_message=user_message,
            max_tokens=8192,
        )

        # Validate response
        if not isinstance(system_principles, list):
            raise ValueError("Expected list of system principles from Claude")

        logger.info(f"[CROSS_ACTIVATE] Generated {len(system_principles)} system-level design principles")
        logger.info(f"[CROSS_ACTIVATE] Project {state['project_id']} cross-video analysis complete!")

        return {
            **state,
            "cross_video_principles": system_principles,
            "current_step": "completed",
            "error": None,
        }

    except Exception as e:
        logger.error(f"[CROSS_ACTIVATE] Error in cross_activate_node: {e}")
        return {
            **state,
            "cross_video_principles": None,
            "current_step": "cross_activate",
            "error": str(e),
        }
