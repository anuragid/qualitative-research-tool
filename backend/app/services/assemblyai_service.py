"""AssemblyAI service for transcription with speaker diarization."""

import assemblyai as aai
from typing import Dict, Any, Optional
import logging
import time

from app.config import settings

logger = logging.getLogger(__name__)

# Configure AssemblyAI
aai.settings.api_key = settings.ASSEMBLYAI_API_KEY


class AssemblyAIService:
    """Service for transcribing videos with speaker diarization."""

    def __init__(self):
        """Initialize AssemblyAI service."""
        self.transcriber = aai.Transcriber()

    def start_transcription(self, audio_url: str) -> str:
        """
        Start transcription job with speaker diarization and identification.

        Args:
            audio_url: URL of audio/video file (can be S3 presigned URL)

        Returns:
            Transcript ID from AssemblyAI

        Raises:
            Exception: If transcription start fails
        """
        try:
            config = aai.TranscriptionConfig(
                speaker_labels=True,  # Enable speaker diarization
                speakers_expected=None,  # Let AI detect number of speakers
                speech_model=aai.SpeechModel.best,  # Use best model for accuracy
            )

            # Enable speaker identification to auto-detect speaker names from context
            # AI will infer names from conversation (e.g., introductions, people addressing each other)
            # Falls back to generic labels (A, B, C) if names can't be inferred
            config.speech_understanding = aai.SpeechUnderstandingConfig(
                speaker_identification=aai.SpeakerIdentificationConfig(
                    speaker_type="name",  # Infer actual names from context
                    # known_values is omitted - AI infers names automatically
                )
            )

            transcript = self.transcriber.transcribe(
                audio_url,
                config=config
            )

            logger.info(f"Started transcription with speaker identification: {transcript.id}")
            return transcript.id

        except Exception as e:
            logger.error(f"Error starting transcription: {e}")
            raise Exception(f"Failed to start transcription: {str(e)}")

    def get_transcript_status(self, transcript_id: str) -> str:
        """
        Get the status of a transcription job.

        Args:
            transcript_id: AssemblyAI transcript ID

        Returns:
            Status string: "queued", "processing", "completed", "error"

        Raises:
            Exception: If status check fails
        """
        try:
            transcript = aai.Transcript.get_by_id(transcript_id)
            return transcript.status.value

        except Exception as e:
            logger.error(f"Error checking transcript status: {e}")
            raise Exception(f"Failed to get transcript status: {str(e)}")

    def get_transcript(self, transcript_id: str) -> Dict[str, Any]:
        """
        Get completed transcript with speaker labels.

        Args:
            transcript_id: AssemblyAI transcript ID

        Returns:
            Dictionary containing transcript data

        Raises:
            Exception: If transcript retrieval fails
        """
        try:
            transcript = aai.Transcript.get_by_id(transcript_id)

            if transcript.status != aai.TranscriptStatus.completed:
                raise Exception(f"Transcript not ready. Status: {transcript.status}")

            # Process utterances (speaker-labeled segments)
            utterances = []
            if transcript.utterances:
                for utterance in transcript.utterances:
                    utterances.append({
                        "speaker": utterance.speaker,
                        "text": utterance.text,
                        "start": utterance.start,
                        "end": utterance.end,
                        "confidence": utterance.confidence,
                    })

            # Build result
            result = {
                "id": transcript.id,
                "text": transcript.text,
                "utterances": utterances,
                "audio_duration": transcript.audio_duration,
                "confidence": transcript.confidence,
                "words": self._process_words(transcript.words) if transcript.words else [],
            }

            logger.info(f"Retrieved transcript: {transcript_id}")
            return result

        except Exception as e:
            logger.error(f"Error retrieving transcript: {e}")
            raise Exception(f"Failed to retrieve transcript: {str(e)}")

    def poll_until_complete(
        self,
        transcript_id: str,
        max_wait_seconds: int = 3600,
        poll_interval: int = 5
    ) -> Dict[str, Any]:
        """
        Poll transcript until completed or timeout.

        Args:
            transcript_id: AssemblyAI transcript ID
            max_wait_seconds: Maximum wait time in seconds
            poll_interval: Seconds between status checks

        Returns:
            Completed transcript data

        Raises:
            Exception: If transcription fails or times out
        """
        start_time = time.time()

        while True:
            elapsed = time.time() - start_time
            if elapsed > max_wait_seconds:
                raise Exception(f"Transcription timed out after {max_wait_seconds}s")

            status = self.get_transcript_status(transcript_id)
            logger.info(f"Transcript {transcript_id} status: {status}")

            if status == "completed":
                return self.get_transcript(transcript_id)
            elif status == "error":
                raise Exception("Transcription failed with error")

            time.sleep(poll_interval)

    def delete_transcript(self, transcript_id: str) -> bool:
        """
        Delete transcript from AssemblyAI (optional cleanup).

        Args:
            transcript_id: AssemblyAI transcript ID

        Returns:
            True if successful

        Raises:
            Exception: If deletion fails
        """
        try:
            transcript = aai.Transcript.get_by_id(transcript_id)
            transcript.delete()
            logger.info(f"Deleted transcript: {transcript_id}")
            return True

        except Exception as e:
            logger.error(f"Error deleting transcript: {e}")
            raise Exception(f"Failed to delete transcript: {str(e)}")

    @staticmethod
    def _process_words(words) -> list:
        """Process word-level timestamps."""
        return [
            {
                "text": word.text,
                "start": word.start,
                "end": word.end,
                "confidence": word.confidence,
                "speaker": getattr(word, "speaker", None),
            }
            for word in words
        ]

    def process_transcript_for_analysis(self, raw_transcript: Dict[str, Any]) -> Dict[str, Any]:
        """
        Process raw transcript into format suitable for LangGraph agents.

        Args:
            raw_transcript: Raw transcript from AssemblyAI

        Returns:
            Processed transcript with speaker-labeled segments
        """
        raw_utterances = raw_transcript.get("utterances", [])

        processed = {
            "text": raw_transcript.get("text", ""),
            "duration_seconds": raw_transcript.get("audio_duration", 0) / 1000,  # Convert ms to seconds
            "utterances": [
                {
                    "speaker": utterance["speaker"],
                    "text": utterance["text"],
                    "start": utterance["start"],
                    "end": utterance["end"],
                    "confidence": utterance.get("confidence", 1.0),
                }
                for utterance in raw_utterances
            ]
        }

        return processed

    @staticmethod
    def _format_timestamp(milliseconds: int) -> str:
        """Format milliseconds as HH:MM:SS."""
        seconds = milliseconds / 1000
        hours = int(seconds // 3600)
        minutes = int((seconds % 3600) // 60)
        secs = int(seconds % 60)
        return f"{hours:02d}:{minutes:02d}:{secs:02d}"


# Global service instance
assemblyai_service = AssemblyAIService()
