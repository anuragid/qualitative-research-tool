"""RELATE node - Find patterns across inferences."""

import json
import logging
from typing import Any, Dict

from app.agents.prompts import RELATE_SYSTEM_PROMPT
from app.agents.states import VideoAnalysisState
from app.services.llm_service import llm_service

logger = logging.getLogger(__name__)


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
        inferences_json = json.dumps(inferences, indent=2)

        user_message = f"""Please analyze the following inferences and identify patterns.

Look for:
- Inferences that point in the same direction
- Repeated themes or meanings
- Relationships between different inferences

INFERENCES:
{inferences_json}

Group related inferences into patterns and explain what each pattern represents."""

        # Call LLM with retry logic (pass BYOK overrides if present)
        patterns = llm_service.call_with_json_list_response(
            system_prompt=RELATE_SYSTEM_PROMPT,
            user_message=user_message,
            max_tokens=16384,  # Increased for many inferences
            api_key=state.get("api_key"),
            model=state.get("model"),
        )

        # Validate response

        logger.info(f"[RELATE] Identified {len(patterns)} patterns")

        return {
            **state,
            "patterns": patterns,
            "current_step": "explain",
            "error": None,
        }

    except Exception as e:
        logger.error(f"[RELATE] Error in relate_node: {type(e).__name__}: {e}", exc_info=True)
        return {
            **state,
            "patterns": None,
            "current_step": "relate",
            "error": f"{type(e).__name__}: {e}",
        }
