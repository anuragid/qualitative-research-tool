"""AssemblyAI service for transcription with speaker diarization."""

import logging
from typing import Any, Dict

import assemblyai as aai

from app.config import settings

logger = logging.getLogger(__name__)

# Configure AssemblyAI
aai.settings.api_key = settings.ASSEMBLYAI_API_KEY


class AssemblyAIService:
    """Service for transcribing videos with speaker diarization."""

    def __init__(self):
        """Initialize AssemblyAI service."""
        self.transcriber = aai.Transcriber()

    def upload_file(self, file_path: str) -> str:
        """
        Upload a local file to AssemblyAI's servers.

        Args:
            file_path: Path to the local audio/video file

        Returns:
            AssemblyAI-hosted URL for the uploaded file

        Raises:
            Exception: If upload fails
        """
        try:
            upload_url = aai.upload(file_path)
            logger.info(f"Uploaded file to AssemblyAI: {file_path}")
            return upload_url
        except Exception as e:
            logger.error(f"Error uploading to AssemblyAI: {e}")
            raise Exception(f"Failed to upload to AssemblyAI: {str(e)}")

    def start_transcription(self, audio_url: str) -> str:
        """
        Submit a transcription job with speaker diarization (non-blocking).

        Uses submit() to return immediately after submission. The caller
        is responsible for polling via get_transcript_status().

        Args:
            audio_url: URL of audio/video file hosted on AssemblyAI

        Returns:
            Transcript ID from AssemblyAI

        Raises:
            Exception: If transcription submission fails
        """
        try:
            config = aai.TranscriptionConfig(
                speaker_labels=True,
            )

            try:
                config.speech_model = aai.SpeechModel.best
            except AttributeError:
                logger.info("SpeechModel not available in this AssemblyAI version, using default")

            transcript = self.transcriber.submit(
                audio_url,
                config=config,
            )

            if transcript.status == aai.TranscriptStatus.error:
                error_msg = transcript.error or "Unknown transcription error"
                raise Exception(f"Transcription submission failed: {error_msg}")

            logger.info(f"Submitted transcription: {transcript.id}")
            return transcript.id

        except Exception as e:
            logger.error(f"Error starting transcription: {e}")
            raise Exception(f"Failed to start transcription: {str(e)}")

    def get_transcript_status(self, transcript_id: str) -> Dict[str, str]:
        """
        Get the status of a transcription job.

        Args:
            transcript_id: AssemblyAI transcript ID

        Returns:
            Dict with "status" key and optional "error" key

        Raises:
            Exception: If status check fails
        """
        try:
            transcript = aai.Transcript.get_by_id(transcript_id)
            result = {"status": transcript.status.value}
            if transcript.status.value == "error":
                result["error"] = transcript.error or "Unknown error"
            return result

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



# Global service instance
assemblyai_service = AssemblyAIService()
