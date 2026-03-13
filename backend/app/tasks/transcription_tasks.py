"""Celery tasks for video transcription using AssemblyAI."""

import logging
from uuid import UUID

from app.models.database_models import SpeakerLabel, Transcript, Video
from app.services.assemblyai_service import assemblyai_service
from app.services.s3_service import s3_service
from app.tasks.base import DatabaseTask
from app.tasks.celery_app import celery_app

logger = logging.getLogger(__name__)


@celery_app.task(
    base=DatabaseTask,
    bind=True,
    name="transcribe_video",
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_backoff_max=600,
    retry_jitter=True,
    max_retries=2,
)
def transcribe_video_task(self, video_id: str):
    """
    Transcribe a video using AssemblyAI with speaker diarization.

    This task:
    1. Generates a presigned S3 URL for the video
    2. Submits video to AssemblyAI for transcription
    3. Polls until transcription completes
    4. Saves raw transcript and creates speaker label records
    5. Updates video and transcript status

    Args:
        video_id: UUID of the video to transcribe

    Returns:
        Dictionary with transcription results

    Raises:
        Exception: If transcription fails
    """
    try:
        logger.info(f"Starting transcription task for video {video_id}")

        # Get video from database
        video = self.db.query(Video).filter(Video.id == UUID(video_id)).first()
        if not video:
            raise Exception(f"Video {video_id} not found")

        # Get or create transcript record
        transcript = self.db.query(Transcript).filter(Transcript.video_id == video.id).first()
        if not transcript:
            transcript = Transcript(
                video_id=video.id,
                status="processing"
            )
            self.db.add(transcript)
        else:
            transcript.status = "processing"

        video.status = "transcribing"
        self.db.commit()

        # Generate presigned URL for AssemblyAI to access the video
        logger.info(f"Generating presigned URL for S3 key: {video.s3_key}")
        presigned_url = s3_service.get_presigned_url(
            s3_key=video.s3_key,
            expiration=7200  # 2 hours
        )

        # Start transcription
        logger.info(f"Starting AssemblyAI transcription for video {video_id}")
        assemblyai_id = assemblyai_service.start_transcription(presigned_url)

        transcript.assemblyai_id = assemblyai_id
        self.db.commit()

        # Poll until complete (this will block, but that's fine for Celery)
        logger.info(f"Polling for transcript {assemblyai_id}")
        raw_transcript = assemblyai_service.poll_until_complete(
            transcript_id=assemblyai_id,
            max_wait_seconds=3600,  # 1 hour max
            poll_interval=5
        )

        # Process transcript for analysis
        processed_transcript = assemblyai_service.process_transcript_for_analysis(raw_transcript)

        # Save transcripts to database
        transcript.raw_transcript = raw_transcript
        transcript.processed_transcript = processed_transcript
        transcript.status = "completed"

        # Extract unique speakers and create speaker label records
        speakers = set()
        for utterance in raw_transcript.get("utterances", []):
            speakers.add(utterance["speaker"])

        for speaker in speakers:
            # Check if speaker label already exists
            existing = self.db.query(SpeakerLabel).filter(
                SpeakerLabel.transcript_id == transcript.id,
                SpeakerLabel.speaker_label == speaker
            ).first()

            if not existing:
                speaker_label = SpeakerLabel(
                    transcript_id=transcript.id,
                    speaker_label=speaker,
                    assigned_name=None,  # Will be filled by user later
                    role=None
                )
                self.db.add(speaker_label)

        video.status = "transcribed"
        self.db.commit()

        logger.info(f"Transcription completed for video {video_id}")

        return {
            "video_id": video_id,
            "transcript_id": str(transcript.id),
            "assemblyai_id": assemblyai_id,
            "status": "completed",
            "speakers_detected": len(speakers),
            "duration_seconds": processed_transcript.get("duration_seconds", 0)
        }

    except Exception as e:
        logger.error(f"Transcription failed for video {video_id}: {e}")

        # Update status to error
        try:
            video = self.db.query(Video).filter(Video.id == UUID(video_id)).first()
            transcript = self.db.query(Transcript).filter(Transcript.video_id == UUID(video_id)).first()

            if video:
                video.status = "error"
                video.error_message = str(e)
            if transcript:
                transcript.status = "error"

            self.db.commit()
        except Exception as cleanup_error:
            logger.error(f"Failed to update error status for video {video_id}: {cleanup_error}")

        raise
