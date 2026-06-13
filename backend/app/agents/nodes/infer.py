"""INFER node - Interpret meaning from each chunk."""

import json
import logging
from typing import Any, Dict

from app.agents.prompts import INFER_SYSTEM_PROMPT
from app.agents.states import VideoAnalysisState
from app.services.llm_service import llm_service
from app.utils.error_classification import classify_error
from app.utils.output_validator import OutputValidationError, validate_inferences

logger = logging.getLogger(__name__)


def _coerce_inference_items(items: Any) -> Any:
    """Coerce bare-string inference items into the expected dict shape.

    Llama-class models occasionally return a list of inference text strings
    instead of a list of inference-group objects. Wrap any such strings in a
    minimal valid dict so downstream validation can proceed. Non-list inputs
    are returned unchanged so the validator can produce its normal error.
    """
    if not isinstance(items, list):
        return items

    coerced = []
    coerced_count = 0
    for i, item in enumerate(items):
        if isinstance(item, str):
            text = item.strip()
            if not text:
                continue
            coerced.append({
                "chunk_id": f"C{i + 1:03d}",
                "inferences": [text],
            })
            coerced_count += 1
        else:
            coerced.append(item)

    if coerced_count > 0:
        logger.warning(
            f"[INFER] Coerced {coerced_count} bare-string item(s) into dict shape"
        )

    return coerced


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
        chunks_json = json.dumps(chunks)

        user_message = f"""Please analyze the following chunks and infer meaning from each one.

For each chunk, ask:
- What does this mean?
- Why is this important?
- What is this telling us?

CHUNKS:
{chunks_json}

Generate multiple inferences per chunk if appropriate."""

        # Call LLM with retry logic (pass BYOK overrides if present)
        llm_kwargs = dict(
            system_prompt=INFER_SYSTEM_PROMPT,
            user_message=user_message,
            max_tokens=32768,  # Increased for many chunks
            api_key=state.get("api_key"),
            model=state.get("model"),
        )
        inferences = llm_service.call_with_json_list_response(**llm_kwargs)
        inferences = _coerce_inference_items(inferences)

        # Validate response structure (retry once on failure)
        try:
            validate_inferences(inferences)
        except OutputValidationError as ve:
            logger.warning(f"[INFER] Output validation failed, retrying: {ve}")
            inferences = llm_service.call_with_json_list_response(**llm_kwargs)
            inferences = _coerce_inference_items(inferences)
            try:
                validate_inferences(inferences)
            except OutputValidationError as ve2:
                logger.error(f"[INFER] Output validation failed after retry: {ve2}")
                return {
                    **state,
                    "inferences": None,
                    "current_step": "infer",
                    "error": f"Output validation failed: {ve2}",
                    "error_type": "llm_error",
                }

        logger.info(f"[INFER] Generated inferences for {len(inferences)} chunks")

        return {
            **state,
            "inferences": inferences,
            "current_step": "relate",
            "error": None,
        }

    except Exception as e:
        error_type = classify_error(e)
        logger.error(f"[INFER] Error in infer_node: {type(e).__name__}: {e}", exc_info=True)
        return {
            **state,
            "inferences": None,
            "current_step": "infer",
            "error": f"{type(e).__name__}: {e}",
            "error_type": error_type,
        }
