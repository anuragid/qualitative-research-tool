"""EXPLAIN node - Generate insights from patterns."""

import json
import logging
from typing import Any, Dict

from app.agents.prompts import EXPLAIN_SYSTEM_PROMPT
from app.agents.states import VideoAnalysisState
from app.services.llm_service import llm_service

logger = logging.getLogger(__name__)


def explain_node(state: VideoAnalysisState) -> Dict[str, Any]:
    """
    Step 4: Generate insights from patterns.

    Takes patterns and asks "WHY?" to generate non-consensus,
    first-principles insights written as bold headlines.

    Args:
        state: Current video analysis state

    Returns:
        Updated state with insights
    """
    logger.info(f"[EXPLAIN] Starting insight generation for video {state['video_id']}")

    try:
        patterns = state.get("patterns")
        chunks = state.get("chunks")

        if not patterns:
            raise ValueError("No patterns available for insight generation")

        # Format patterns and chunks for Claude
        patterns_json = json.dumps(patterns, indent=2)

        # Include original chunks for context and evidence
        chunks_json = json.dumps(chunks, indent=2) if chunks else "[]"

        user_message = f"""Please analyze the following patterns and generate insights.

Ask "WHY?" for each pattern:
- Why is this happening?
- Why does it matter?
- What deeper truth does this reveal?

PATTERNS:
{patterns_json}

ORIGINAL CHUNKS (for evidence):
{chunks_json}

Generate non-consensus insights that challenge assumptions and reveal fundamental truths. Write each insight as a short, punchy headline."""

        # Call LLM with retry logic (pass BYOK overrides if present)
        insights = llm_service.call_with_json_list_response(
            system_prompt=EXPLAIN_SYSTEM_PROMPT,
            user_message=user_message,
            max_tokens=16384,  # Increased for many patterns
            api_key=state.get("api_key"),
            model=state.get("model"),
        )

        # Validate response

        logger.info(f"[EXPLAIN] Generated {len(insights)} insights")

        return {
            **state,
            "insights": insights,
            "current_step": "activate",
            "error": None,
        }

    except Exception as e:
        logger.error(f"[EXPLAIN] Error in explain_node: {type(e).__name__}: {e}", exc_info=True)
        return {
            **state,
            "insights": None,
            "current_step": "explain",
            "error": f"{type(e).__name__}: {e}",
        }
