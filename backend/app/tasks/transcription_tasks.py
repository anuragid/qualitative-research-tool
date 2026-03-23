"""Celery tasks for video transcription using AssemblyAI.

Split into two tasks for non-blocking operation:
- transcribe_video_task: submits to AssemblyAI and returns immediately (~2s)
- check_transcription_task: polls status via Celery retry, freeing the thread between checks
"""

import logging
import time
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
    Submit a video to AssemblyAI for transcription (non-blocking).

    This task:
    1. Generates a presigned S3 URL for the video
    2. Submits video to AssemblyAI for transcription
    3. Saves assemblyai_id to transcript record
    4. Schedules check_transcription_task to poll for completion
    5. Returns immediately (thread freed in ~2 seconds)

    Args:
        video_id: UUID of the video to transcribe

    Returns:
        Dictionary with submission results

    Raises:
        Exception: If submission fails (triggers autoretry)
    """
    try:
        logger.info(f"Starting transcription submit task for video {video_id}")

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

        # Start transcription (submit only, does not block for completion)
        logger.info(f"Submitting AssemblyAI transcription for video {video_id}")
        assemblyai_id = assemblyai_service.start_transcription(presigned_url)

        transcript.assemblyai_id = assemblyai_id
        self.db.commit()

        # Schedule the check task with a 10-second countdown
        logger.info(
            f"Transcription submitted ({assemblyai_id}), "
            f"scheduling check task for video {video_id}"
        )
        check_transcription_task.apply_async(
            args=[video_id],
            kwargs={"started_at": time.time()},
            countdown=10,
        )

        return {
            "video_id": video_id,
            "transcript_id": str(transcript.id),
            "assemblyai_id": assemblyai_id,
            "status": "submitted",
        }

    except Exception as e:
        logger.error(f"Transcription submit failed for video {video_id}: {e}")

        # Update status to error — rollback first to clear any dirty session state
        try:
            self.db.rollback()
            video = self.db.query(Video).filter(Video.id == UUID(video_id)).first()
            transcript = self.db.query(Transcript).filter(
                Transcript.video_id == UUID(video_id)
            ).first()

            if video:
                video.status = "error"
                video.error_message = str(e)
            if transcript:
                transcript.status = "error"

            self.db.commit()
        except Exception as cleanup_error:
            logger.error(
                f"Failed to update error status for video {video_id}: {cleanup_error}"
            )

        raise


@celery_app.task(
    base=DatabaseTask,
    bind=True,
    name="check_transcription",
    max_retries=360,  # 360 retries x 10s = 1 hour max
    default_retry_delay=10,
)
def check_transcription_task(self, video_id: str, started_at: float | None = None):
    """
    Check AssemblyAI transcription status and process when complete.

    Uses Celery's retry mechanism to poll every ~10 seconds, freeing the
    worker thread between checks (each check takes ~1 second).

    Args:
        video_id: UUID of the video being transcribed
        started_at: Unix timestamp when the transcription was first submitted
            (used for timeout safety)

    Raises:
        self.retry: If transcription is still processing
        Exception: If transcription fails or times out
    """
    try:
        logger.info(f"Checking transcription status for video {video_id}")

        # Timeout safety: fail if we've been checking for over 1 hour
        if started_at is not None and (time.time() - started_at) > 3600:
            raise Exception(
                f"Transcription timed out after 3600s for video {video_id}"
            )

        # Look up transcript record
        transcript = self.db.query(Transcript).filter(
            Transcript.video_id == UUID(video_id)
        ).first()
        if not transcript:
            raise Exception(f"Transcript record not found for video {video_id}")

        assemblyai_id = transcript.assemblyai_id
        if not assemblyai_id:
            raise Exception(
                f"No assemblyai_id on transcript for video {video_id}"
            )

        # Check status with AssemblyAI
        status_result = assemblyai_service.get_transcript_status(assemblyai_id)
        status = status_result["status"]
        logger.info(f"Transcript {assemblyai_id} status: {status}")

        if status == "completed":
            # Fetch the full transcript
            raw_transcript = assemblyai_service.get_transcript(assemblyai_id)

            # Process transcript for analysis
            processed_transcript = assemblyai_service.process_transcript_for_analysis(
                raw_transcript
            )

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

            # Update video status
            video = self.db.query(Video).filter(Video.id == UUID(video_id)).first()
            if video:
                video.status = "transcribed"
            self.db.commit()

            logger.info(f"Transcription completed for video {video_id}")
            return {
                "video_id": video_id,
                "transcript_id": str(transcript.id),
                "assemblyai_id": assemblyai_id,
                "status": "completed",
                "speakers_detected": len(speakers),
                "duration_seconds": processed_transcript.get("duration_seconds", 0),
            }

        elif status == "error":
            error_detail = status_result.get("error", "Unknown error")
            raise Exception(f"Transcription failed: {error_detail}")

        else:
            # Still processing — retry after countdown (thread is freed)
            logger.info(
                f"Transcript {assemblyai_id} still processing, "
                f"scheduling retry (attempt {self.request.retries + 1}/{self.max_retries})"
            )
            raise self.retry(countdown=10)

    except self.MaxRetriesExceededError:
        logger.error(
            f"Max retries exceeded checking transcription for video {video_id}"
        )
        _mark_transcription_error(
            self.db, video_id, "Transcription check timed out (max retries exceeded)"
        )
        raise

    except Exception as e:
        # Don't catch self.retry — it's a subclass of Exception in some Celery
        # versions, but the retry raise above will propagate before reaching here.
        # This handles genuine errors (API failures, DB issues, timeouts).
        if isinstance(e, self.MaxRetriesExceededError):
            raise

        # Check if this is a Retry exception (self.retry() raises Retry)
        from celery.exceptions import Retry
        if isinstance(e, Retry):
            raise

        logger.error(
            f"Error checking transcription for video {video_id}: {e}"
        )
        _mark_transcription_error(self.db, video_id, str(e))
        raise


def _mark_transcription_error(db, video_id: str, error_message: str):
    """Mark both video and transcript as error state.

    Rolls back any dirty session state before querying, ensuring the
    error status update succeeds even if the previous transaction was
    left in a broken state.
    """
    try:
        db.rollback()
        video = db.query(Video).filter(Video.id == UUID(video_id)).first()
        transcript = db.query(Transcript).filter(
            Transcript.video_id == UUID(video_id)
        ).first()

        if video:
            video.status = "error"
            video.error_message = error_message
        if transcript:
            transcript.status = "error"

        db.commit()
    except Exception as cleanup_error:
        logger.error(
            f"Failed to update error status for video {video_id}: {cleanup_error}"
        )
