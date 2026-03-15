"""INFER node - Interpret meaning from each chunk."""

import json
import logging
from typing import Any, Dict

from app.agents.prompts import INFER_SYSTEM_PROMPT
from app.agents.states import VideoAnalysisState
from app.services.llm_service import llm_service

logger = logging.getLogger(__name__)


def infer_node(state: VideoAnalysisState) -> Dict[str, Any]:
    """
    Step 2: Infer meaning from each chunk.

    Takes chunks and generates inferences about what each chunk means,
    why it's important, and what it reveals.

    Args:
        state: Current video analysis state

    Returns:
        Updated state with inferences
    """
    logger.info(f"[INFER] Starting inference analysis for video {state['video_id']}")

    try:
        chunks = state.get("chunks")
        if not chunks:
            raise ValueError("No chunks available for inference")

        # Format chunks for Claude
        chunks_json = json.dumps(chunks, indent=2)

        user_message = f"""Please analyze the following chunks and infer meaning from each one.

For each chunk, ask:
- What does this mean?
- Why is this important?
- What is this telling us?

CHUNKS:
{chunks_json}

Generate multiple inferences per chunk if appropriate."""

        # Call LLM with retry logic
        inferences = llm_service.call_with_json_list_response(
            system_prompt=INFER_SYSTEM_PROMPT,
            user_message=user_message,
            max_tokens=32768,  # Increased for many chunks
        )

        # Validate response

        logger.info(f"[INFER] Generated inferences for {len(inferences)} chunks")

        return {
            **state,
            "inferences": inferences,
            "current_step": "relate",
            "error": None,
        }

    except Exception as e:
        logger.error(f"[INFER] Error in infer_node: {type(e).__name__}: {e}", exc_info=True)
        return {
            **state,
            "inferences": None,
            "current_step": "infer",
            "error": f"{type(e).__name__}: {e}",
        }
