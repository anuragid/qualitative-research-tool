"""EXPLAIN node - Generate insights from patterns."""

import json
import logging
import re
from typing import Any, Dict

from app.agents.prompts import EXPLAIN_SYSTEM_PROMPT
from app.agents.states import VideoAnalysisState
from app.services.llm_service import llm_service
from app.utils.input_sanitizer import sanitize_for_prompt
from app.utils.output_validator import OutputValidationError, validate_insights

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

        # Format patterns for Claude
        patterns_json = json.dumps(patterns)

        # Build research context if available
        research_context = ""
        if state.get("project_description"):
            safe_description = sanitize_for_prompt(state["project_description"], max_length=5000)
            research_context = f"""
RESEARCH CONTEXT:
<research_context>{safe_description}</research_context>
Generate insights that are relevant to this research context.
"""

        user_message = f"""Please analyze the following patterns and generate insights.
{research_context}
Ask "WHY?" for each pattern:
- Why is this happening?
- Why does it matter?
- What deeper truth does this reveal?

PATTERNS:
{patterns_json}

Generate non-consensus insights that challenge assumptions and reveal fundamental truths. Write each insight as a short, punchy headline."""

        # Call LLM with retry logic (pass BYOK overrides if present)
        llm_kwargs = dict(
            system_prompt=EXPLAIN_SYSTEM_PROMPT,
            user_message=user_message,
            max_tokens=16384,  # Increased for many patterns
            api_key=state.get("api_key"),
            model=state.get("model"),
        )
        insights = llm_service.call_with_json_list_response(**llm_kwargs)

        # Validate response structure (retry once on failure)
        try:
            validate_insights(insights)
        except OutputValidationError as ve:
            logger.warning(f"[EXPLAIN] Output validation failed, retrying: {ve}")
            insights = llm_service.call_with_json_list_response(**llm_kwargs)
            try:
                validate_insights(insights)
            except OutputValidationError as ve2:
                logger.error(f"[EXPLAIN] Output validation failed after retry: {ve2}")
                return {
                    **state,
                    "insights": None,
                    "current_step": "explain",
                    "error": f"Output validation failed: {ve2}",
                }

        logger.info(f"[EXPLAIN] Generated {len(insights)} insights")

        # Build chunk lookup for evidence resolution
        chunk_lookup = {}
        if chunks:
            for c in chunks:
                cid = c.get("chunk_id", "")
                if cid:
                    chunk_lookup[cid.upper()] = c.get("text", cid)

        # Post-process insights
        VALID_INSIGHT_TYPES = {"non-consensus", "first-principles", "surprising", "revealing"}
        chunk_id_pattern = re.compile(r"^C\d{1,4}$", re.IGNORECASE)

        for insight in insights:
            # Evidence resolution: replace chunk IDs with actual quote text
            if "evidence" in insight and isinstance(insight["evidence"], list):
                resolved = []
                for item in insight["evidence"]:
                    item_stripped = item.strip()
                    if chunk_id_pattern.match(item_stripped):
                        resolved_text = chunk_lookup.get(item_stripped.upper(), item)
                        resolved.append(resolved_text)
                        if resolved_text != item:
                            logger.debug(
                                f"[EXPLAIN] Resolved evidence ref '{item}' to quote text"
                            )
                    else:
                        resolved.append(item)
                insight["evidence"] = resolved

            # Type fallback: ensure valid insight type
            it = insight.get("type", "")
            if it not in VALID_INSIGHT_TYPES:
                insight["type"] = "non-consensus"
                logger.warning(
                    f"[EXPLAIN] Insight {insight.get('insight_id', '?')} missing/invalid "
                    f"type '{it}', defaulting to 'non-consensus'"
                )

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
