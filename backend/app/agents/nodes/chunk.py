"""CHUNK node - Break transcript into discrete pieces."""

import logging
from typing import Dict, Any

from app.agents.states import VideoAnalysisState
from app.agents.prompts import CHUNK_SYSTEM_PROMPT
from app.services.claude_service import claude_service

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

        # Format transcript segments for Claude
        formatted_segments = []
        for utterance in transcript.get("utterances", []):
            speaker_id = utterance["speaker"]
            speaker_name = speaker_labels.get(speaker_id, speaker_id)
            timestamp = utterance["start"]
            text = utterance["text"]

            formatted_segments.append(
                f"[{timestamp}] {speaker_name}: {text}"
            )

        transcript_text = "\n\n".join(formatted_segments)

        # Include speaker mapping in the message
        speaker_mapping_text = "SPEAKER MAPPING:\n"
        for speaker_id, speaker_name in speaker_labels.items():
            speaker_mapping_text += f"- {speaker_id} = {speaker_name}\n"

        user_message = f"""Please analyze the following interview transcript and break it down into chunks.

{speaker_mapping_text}

TRANSCRIPT:
{transcript_text}

Remember:
- Each chunk should be a single, discrete piece of information that cannot be broken down further without losing meaning.
- Use the actual speaker names (not A, B, C) as shown in the transcript."""

        # Call Claude with retry logic
        chunks = claude_service.call_with_json_response(
            system_prompt=CHUNK_SYSTEM_PROMPT,
            user_message=user_message,
            max_tokens=16384,  # Increased for long transcripts
        )

        # Validate response
        if not isinstance(chunks, list):
            raise ValueError("Expected list of chunks from Claude")

        # Post-process chunks to ensure speaker names are used (not IDs)
        # This is a safety net in case Claude returns speaker IDs instead of names
        for chunk in chunks:
            if "speaker" in chunk:
                # If the speaker field contains a speaker ID (A, B, C, etc.), map it to the name
                speaker_value = chunk["speaker"]
                if speaker_value in speaker_labels:
                    chunk["speaker"] = speaker_labels[speaker_value]
                # Also check for common variations like "Speaker A" or "SPEAKER_A"
                elif speaker_value.replace("Speaker ", "").replace("SPEAKER_", "").strip() in speaker_labels:
                    clean_id = speaker_value.replace("Speaker ", "").replace("SPEAKER_", "").strip()
                    chunk["speaker"] = speaker_labels[clean_id]

        logger.info(f"[CHUNK] Generated {len(chunks)} chunks for video {state['video_id']}")

        return {
            **state,
            "chunks": chunks,
            "current_step": "infer",
            "error": None,
        }

    except Exception as e:
        logger.error(f"[CHUNK] Error in chunk_node: {e}")
        return {
            **state,
            "chunks": None,
            "current_step": "chunk",
            "error": str(e),
        }
