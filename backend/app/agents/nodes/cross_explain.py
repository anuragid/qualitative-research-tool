"""CROSS_EXPLAIN node - Generate cross-video insights from meta-patterns."""

import logging
import json
from typing import Dict, Any

from app.agents.states import ProjectAnalysisState
from app.agents.prompts import CROSS_EXPLAIN_SYSTEM_PROMPT
from app.services.claude_service import claude_service

logger = logging.getLogger(__name__)


def cross_explain_node(state: ProjectAnalysisState) -> Dict[str, Any]:
    """
    Step 7: Generate cross-video insights from meta-patterns.

    Takes meta-patterns and generates system-level insights that
    synthesize findings across all contexts.

    Args:
        state: Current project analysis state

    Returns:
        Updated state with cross_video_insights
    """
    logger.info(f"[CROSS_EXPLAIN] Starting cross-video insight generation for project {state['project_id']}")

    try:
        cross_patterns = state.get("cross_video_patterns")
        video_insights = state.get("video_insights", [])

        if not cross_patterns:
            raise ValueError("No cross-video patterns available for insight generation")

        # Format meta-patterns and individual insights for Claude
        patterns_json = json.dumps(cross_patterns, indent=2)
        insights_json = json.dumps(video_insights, indent=2)

        user_message = f"""Please analyze the following meta-patterns from multiple videos and generate cross-video insights.

CROSS-VIDEO INSIGHT RULES:
1. Synthesize findings across contexts
2. Reveal system-level truths
3. Account for variations
4. Assess consistency across videos

META-PATTERNS:
{patterns_json}

INDIVIDUAL VIDEO INSIGHTS (for context):
{insights_json}

Generate insights that reveal truths about the system as a whole, not just individual experiences."""

        # Call Claude with retry logic
        cross_insights = claude_service.call_with_json_response(
            system_prompt=CROSS_EXPLAIN_SYSTEM_PROMPT,
            user_message=user_message,
            max_tokens=8192,
        )

        # Validate response
        if not isinstance(cross_insights, list):
            raise ValueError("Expected list of cross-video insights from Claude")

        logger.info(f"[CROSS_EXPLAIN] Generated {len(cross_insights)} cross-video insights")

        return {
            **state,
            "cross_video_insights": cross_insights,
            "current_step": "cross_activate",
            "error": None,
        }

    except Exception as e:
        logger.error(f"[CROSS_EXPLAIN] Error in cross_explain_node: {e}")
        return {
            **state,
            "cross_video_insights": None,
            "current_step": "cross_explain",
            "error": str(e),
        }
