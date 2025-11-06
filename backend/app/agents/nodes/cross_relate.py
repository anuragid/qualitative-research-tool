"""CROSS_RELATE node - Find meta-patterns across multiple videos."""

import logging
import json
from typing import Dict, Any

from app.agents.states import ProjectAnalysisState
from app.agents.prompts import CROSS_RELATE_SYSTEM_PROMPT
from app.services.claude_service import claude_service

logger = logging.getLogger(__name__)


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
        patterns_json = json.dumps(video_patterns, indent=2)

        user_message = f"""Please analyze patterns from multiple videos and identify meta-patterns.

CROSS-VIDEO RULES:
1. Look for patterns appearing in 2+ videos
2. Identify higher-order themes
3. Note variations by context
4. Explain the significance of each meta-pattern

VIDEO PATTERNS:
{patterns_json}

Find patterns that transcend individual videos and reveal system-level themes."""

        # Call Claude with retry logic
        cross_patterns = claude_service.call_with_json_response(
            system_prompt=CROSS_RELATE_SYSTEM_PROMPT,
            user_message=user_message,
            max_tokens=8192,
        )

        # Validate response
        if not isinstance(cross_patterns, list):
            raise ValueError("Expected list of meta-patterns from Claude")

        logger.info(f"[CROSS_RELATE] Identified {len(cross_patterns)} meta-patterns across videos")

        return {
            **state,
            "cross_video_patterns": cross_patterns,
            "current_step": "cross_explain",
            "error": None,
        }

    except Exception as e:
        logger.error(f"[CROSS_RELATE] Error in cross_relate_node: {e}")
        return {
            **state,
            "cross_video_patterns": None,
            "current_step": "cross_relate",
            "error": str(e),
        }
