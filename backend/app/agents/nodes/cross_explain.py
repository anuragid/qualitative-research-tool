"""CROSS_EXPLAIN node - Generate cross-video insights from meta-patterns."""

import json
import logging
from typing import Any, Dict

from app.agents.prompts import CROSS_EXPLAIN_SYSTEM_PROMPT
from app.agents.states import ProjectAnalysisState
from app.services.llm_service import llm_service

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

        # Call LLM with retry logic (pass BYOK overrides if present)
        cross_insights = llm_service.call_with_json_list_response(
            system_prompt=CROSS_EXPLAIN_SYSTEM_PROMPT,
            user_message=user_message,
            max_tokens=8192,
            api_key=state.get("api_key"),
            model=state.get("model"),
        )

        # Validate response

        logger.info(f"[CROSS_EXPLAIN] Generated {len(cross_insights)} cross-video insights")

        return {
            **state,
            "cross_video_insights": cross_insights,
            "current_step": "cross_activate",
            "error": None,
        }

    except Exception as e:
        logger.error(f"[CROSS_EXPLAIN] Error in cross_explain_node: {type(e).__name__}: {e}", exc_info=True)
        return {
            **state,
            "cross_video_insights": None,
            "current_step": "cross_explain",
            "error": f"{type(e).__name__}: {e}",
        }
