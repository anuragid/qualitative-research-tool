"""CHUNK node - Break transcript into discrete pieces."""

import logging
from typing import Any, Dict

from app.agents.prompts import CHUNK_SYSTEM_PROMPT
from app.agents.states import VideoAnalysisState
from app.services.llm_service import llm_service
from app.utils.input_sanitizer import sanitize_for_prompt
from app.utils.output_validator import OutputValidationError, validate_chunks

logger = logging.getLogger(__name__)


def chunk_node(state: VideoAnalysisState) -> Dict[str, Any]:
    """
    Step 1: Break transcript into chunks.

    Takes the processed transcript and breaks it down into discrete,
    single-idea pieces for analysis.

    Args:
        state: Current video analysis state

    Returns:
        Updated state with chunks
    """
    logger.info(f"[CHUNK] Starting chunk analysis for video {state['video_id']}")

    try:
        # Build user message with transcript data
        transcript = state["transcript"]
        speaker_labels = state.get("speaker_labels", {})
        speaker_roles = state.get("speaker_roles", {})

        # Separate participant and interviewer utterances
        participant_segments = []
        all_segments = []  # Full transcript for context

        for utterance in transcript.get("utterances", []):
            speaker_id = utterance["speaker"]
            speaker_name = speaker_labels.get(speaker_id, speaker_id)
            speaker_role = speaker_roles.get(speaker_id, "unknown")
            timestamp = utterance["start"]
            text = utterance["text"]

            formatted_segment = f"[{timestamp}] {speaker_name}: {text}"
            all_segments.append(formatted_segment)

            # Only add to participant segments if speaker is a participant
            if speaker_role == "participant":
                participant_segments.append(formatted_segment)

        # Full transcript for context
        full_transcript_text = "\n\n".join(all_segments)
        # Participant-only transcript for chunking
        participant_transcript_text = "\n\n".join(participant_segments)

        # Debug logging
        logger.info(f"[CHUNK] Total utterances: {len(transcript.get('utterances', []))}")
        logger.info(f"[CHUNK] Participant segments: {len(participant_segments)}")
        logger.info(f"[CHUNK] Speaker roles: {speaker_roles}")

        # Include speaker mapping with roles in the message
        speaker_mapping_text = "SPEAKER MAPPING WITH ROLES:\n"
        for speaker_id, speaker_name in speaker_labels.items():
            safe_name = sanitize_for_prompt(speaker_name, max_length=100)
            role = speaker_roles.get(speaker_id, "unknown")
            safe_role = sanitize_for_prompt(role, max_length=100)
            speaker_mapping_text += f"- {speaker_id} = <speaker_label>{safe_name}</speaker_label> (Role: <speaker_label>{safe_role}</speaker_label>)\n"

        # Build research context if available
        research_context = ""
        if state.get("project_description"):
            safe_description = sanitize_for_prompt(state["project_description"], max_length=5000)
            research_context = f"""
RESEARCH CONTEXT:
<research_context>{safe_description}</research_context>
Focus on extracting chunks that are relevant to this research context. Ignore small talk and conversation that is not related to the research topic.
"""

        user_message = f"""Please analyze the following interview transcript and break it down into chunks.

IMPORTANT: You should ONLY create chunks from PARTICIPANT responses. Interviewer questions should be used for context but NOT chunked.

{speaker_mapping_text}
{research_context}
FULL TRANSCRIPT (for context):
<transcript>{full_transcript_text}</transcript>

PARTICIPANT RESPONSES TO CHUNK:
<transcript>{participant_transcript_text}</transcript>

Remember:
- ONLY chunk the participant responses shown above
- Each chunk should be a single, discrete piece of information from a participant that cannot be broken down further without losing meaning
- Use interviewer questions from the full transcript to understand context, but do NOT create chunks from interviewer speech
- Include relevant context in each chunk to maintain meaning (e.g., what question the participant is responding to)
- Use the actual speaker names (not A, B, C) as shown in the transcript"""

        # Call LLM with retry logic (pass BYOK overrides if present)
        llm_kwargs = dict(
            system_prompt=CHUNK_SYSTEM_PROMPT,
            user_message=user_message,
            max_tokens=16384,  # Increased for long transcripts
            api_key=state.get("api_key"),
            model=state.get("model"),
        )
        chunks = llm_service.call_with_json_list_response(**llm_kwargs)

        # Validate response structure (retry once on failure)
        try:
            validate_chunks(chunks)
        except OutputValidationError as ve:
            logger.warning(f"[CHUNK] Output validation failed, retrying: {ve}")
            chunks = llm_service.call_with_json_list_response(**llm_kwargs)
            try:
                validate_chunks(chunks)
            except OutputValidationError as ve2:
                logger.error(f"[CHUNK] Output validation failed after retry: {ve2}")
                return {
                    **state,
                    "chunks": None,
                    "current_step": "chunk",
                    "error": f"Output validation failed: {ve2}",
                }

        # Debug: Log chunk types
        chunk_types = {}
        for chunk in chunks:
            chunk_type = chunk.get("type", "unknown")
            chunk_types[chunk_type] = chunk_types.get(chunk_type, 0) + 1
        logger.info(f"[CHUNK] Chunk type distribution: {chunk_types}")

        # Post-process chunks to ensure speaker names are used (not IDs)
        # This is a safety net in case Claude returns speaker IDs instead of names
        for chunk in chunks:
            # Ensure chunk has a valid type
            if "type" not in chunk or chunk["type"] not in ["quote", "observation", "context", "fact"]:
                # Fallback: analyze the text to determine type
                text_lower = chunk.get("text", "").lower()
                if "i noticed" in text_lower or "i observed" in text_lower or "looking at" in text_lower:
                    chunk["type"] = "observation"
                elif "context" in text_lower or "background" in text_lower or "setting" in text_lower:
                    chunk["type"] = "context"
                elif any(word in text_lower for word in ["data", "number", "percent", "statistic", "fact"]):
                    chunk["type"] = "fact"
                else:
                    # Default to quote for direct speech
                    chunk["type"] = "quote"
                logger.debug(f"[CHUNK] Auto-assigned type '{chunk['type']}' to chunk {chunk.get('chunk_id')}")

            if "speaker" in chunk:
                # If the speaker field contains a speaker ID (A, B, C, etc.), map it to the name
                speaker_value = chunk["speaker"]
                if speaker_value in speaker_labels:
                    chunk["speaker"] = speaker_labels[speaker_value]
                # Also check for common variations like "Speaker A" or "SPEAKER_A"
                elif speaker_value.replace("Speaker ", "").replace("SPEAKER_", "").strip() in speaker_labels:
                    clean_id = speaker_value.replace("Speaker ", "").replace("SPEAKER_", "").strip()
                    chunk["speaker"] = speaker_labels[clean_id]

        # Quality filter: remove low-substance chunks
        FILLER_PHRASES = {
            "yeah", "yes", "no", "okay", "ok", "sure", "right", "mhm",
            "mm-hmm", "uh-huh", "um", "uh", "ah", "oh", "hmm",
            "i see", "i agree", "thank you", "thanks", "hello", "hi",
            "bye", "goodbye", "nice to meet you", "good to see you",
            "that's a good question", "let me think", "interesting",
        }

        original_count = len(chunks)
        filtered_chunks = []
        for chunk in chunks:
            text = chunk.get("text", "").strip()
            # Drop chunks under 5 words
            if len(text.split()) < 5:
                continue
            # Drop exact filler matches (case-insensitive, strip punctuation)
            cleaned = text.lower().rstrip(".!?,;:")
            if cleaned in FILLER_PHRASES:
                continue
            filtered_chunks.append(chunk)

        dropped = original_count - len(filtered_chunks)
        if dropped > 0:
            logger.info(f"[CHUNK] Quality filter: dropped {dropped}/{original_count} low-substance chunks")

        chunks = filtered_chunks

        logger.info(f"[CHUNK] Generated {len(chunks)} chunks for video {state['video_id']}")

        return {
            **state,
            "chunks": chunks,
            "current_step": "infer",
            "error": None,
        }

    except Exception as e:
        logger.error(f"[CHUNK] Error in chunk_node for video {state['video_id']}: {type(e).__name__}: {e}", exc_info=True)
        return {
            **state,
            "chunks": None,
            "current_step": "chunk",
            "error": f"{type(e).__name__}: {e}",
        }
