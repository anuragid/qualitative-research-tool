"""Celery tasks for video transcription using AssemblyAI.

Split into two tasks for non-blocking operation:
- transcribe_video_task: downloads from R2, uploads to AssemblyAI, submits (~seconds)
- check_transcription_task: polls status via Celery retry, freeing the thread between checks
"""

import logging
import os
import tempfile
import time
from pathlib import Path
from uuid import UUID

from celery import chain
from sqlalchemy.orm import Session

from app.models.database_models import (
    Project,
    SpeakerLabel,
    Transcript,
    Video,
    VideoAnalysis,
)
from app.services.assemblyai_service import assemblyai_service
from app.services.s3_service import s3_service
from app.state import (
    InvalidTransitionError,
    TranscriptEvent,
    TranscriptStateMachine,
    VideoEvent,
    VideoStateMachine,
)
from app.tasks.base import DatabaseTask
from app.tasks.celery_app import celery_app
from app.utils.row_locking import lock_rows

logger = logging.getLogger(__name__)


def _maybe_auto_dispatch_analyze_chain(db: Session, video: Video) -> None:
    """Dispatch the analyze chain for a newly-transcribed video if no chain
    is already running or completed.

    Called from check_transcription_task after transcription completes. The
    user would otherwise have to click "Analyze" manually, which is the gap
    where frontend 404 crashes (Sentry JAVASCRIPT-REACT-6) and stuck-video
    symptoms live. See docs/production-readiness/prs/pr20-auto-dispatch.md.

    Idempotency rules:
    - Skip if video.status is not "transcribed" (something else is in progress
      or failed).
    - Skip if a VideoAnalysis row exists with status in
      ("processing", "completed") — chain is running or already done.
    - OK to dispatch if no VideoAnalysis row exists (fresh case) or if one
      exists with status in ("pending", "error", None) — the chunk step is
      idempotent and will take over (after fix/retry-reset-analysis lands).

    BYOK note: this path bypasses the FastAPI dependency injection used by
    routes/videos.py for `require_byok_credits`. The chain steps themselves
    call `_resolve_byok_or_raise_credits_error` at every step, so a user
    without credits will see a clear `insufficient_credits` failure surfaced
    in the analysis row. No additional preflight here is needed; this matches
    the existing chain pattern intentionally.
    """
    if video.status != "transcribed":
        logger.info(
            f"[auto-dispatch] Skipping analyze for video {video.id}: "
            f"video.status={video.status!r} (expected 'transcribed')"
        )
        return

    # Lock the VideoAnalysis row so this check-then-dispatch guard serializes
    # against a concurrent manual /analyze retry click on the same video
    # (audit R-H2). Without the lock both paths could read status not-in
    # (processing, completed), both pass the guard, and both dispatch a chain.
    # The lock makes the second actor read the post-commit state and bail.
    existing = lock_rows(
        db.query(VideoAnalysis).filter(VideoAnalysis.video_id == video.id)
    ).first()
    if existing and existing.status in ("processing", "completed"):
        logger.info(
            f"[auto-dispatch] Skipping analyze for video {video.id}: "
            f"VideoAnalysis.status={existing.status!r} (chain in flight or done)"
        )
        return

    # Resolve the user_id. Transcription tasks don't receive user_id directly;
    # it comes from video.project.user_id. Load the project explicitly to avoid
    # relying on lazy-loaded relationships from a possibly-detached video.
    project = db.query(Project).filter(Project.id == video.project_id).first()
    if not project:
        logger.error(
            f"[auto-dispatch] Cannot dispatch analyze for video {video.id}: "
            f"project {video.project_id} not found"
        )
        return
    current_user_id = project.user_id

    # Flip video.status to "analyzing" in the same transaction so the
    # concurrent-double-click race is closed (mirrors the /analyze route).
    # ANALYZE_DISPATCHED: transcribed -> analyzing (and clears error_message).
    VideoStateMachine.transition(video, VideoEvent.ANALYZE_DISPATCHED, db=db)
    db.commit()

    # Dispatch the chain. Imports are local to avoid circulars between
    # transcription_tasks and analysis_steps at module-load time.
    from app.tasks.analysis_steps import (
        analyze_activate_step,
        analyze_chunk_step,
        analyze_explain_step,
        analyze_infer_step,
        analyze_relate_step,
    )
    from app.tasks.pipeline_errors import handle_pipeline_error

    video_id_str = str(video.id)
    pipeline = chain(
        analyze_chunk_step.si(video_id_str, current_user_id),
        analyze_infer_step.si(video_id_str, current_user_id),
        analyze_relate_step.si(video_id_str, current_user_id),
        analyze_explain_step.si(video_id_str, current_user_id),
        analyze_activate_step.si(video_id_str, current_user_id),
    ).on_error(handle_pipeline_error.s(video_id=video_id_str))

    task = pipeline.apply_async()
    logger.info(
        f"[auto-dispatch] Dispatched analyze chain for video {video.id}, "
        f"task_id: {task.id}"
    )


@celery_app.task(
    base=DatabaseTask,
    bind=True,
    name="transcribe_video",
    max_retries=2,
)
def transcribe_video_task(self, video_id: str):
    """
    Download video from R2 and submit to AssemblyAI for transcription.

    This task:
    1. Downloads the video from R2 to a temp file
    2. Uploads directly to AssemblyAI's servers
    3. Submits for transcription (non-blocking)
    4. Schedules check_transcription_task to poll for completion
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
            transcript = Transcript(video_id=video.id)
            # ROW_CREATED: None -> PENDING, then TRANSCRIBE_STARTED:
            # PENDING -> PROCESSING. Two events to match the existing
            # two-step "new row in processing" semantic.
            TranscriptStateMachine.transition(
                transcript, TranscriptEvent.ROW_CREATED, db=self.db
            )
            TranscriptStateMachine.transition(
                transcript, TranscriptEvent.TRANSCRIBE_STARTED, db=self.db
            )
            self.db.add(transcript)
        else:
            # Existing row — promote to processing (handles both
            # pending -> processing on first run and the idempotent
            # processing -> processing self-loop on retry).
            TranscriptStateMachine.transition(
                transcript, TranscriptEvent.TRANSCRIBE_STARTED, db=self.db
            )

        # Worker re-asserts the Video row is in TRANSCRIBING. The route
        # normally already flipped it; the self-loop in the transition
        # table makes this idempotent.
        VideoStateMachine.transition(
            video, VideoEvent.TRANSCRIBE_REQUESTED, db=self.db
        )
        self.db.commit()

        # Download from R2 and upload directly to AssemblyAI.
        # R2's S3 API endpoint is not reachable by AssemblyAI's servers,
        # so we stream through the worker instead of passing a presigned URL.
        suffix = Path(video.s3_key).suffix or ".mp4"
        tmp_fd, tmp_path = tempfile.mkstemp(suffix=suffix)
        try:
            os.close(tmp_fd)
            logger.info(f"Downloading from R2: {video.s3_key}")
            s3_service.download_file(video.s3_key, tmp_path)

            logger.info(f"Uploading to AssemblyAI for video {video_id}")
            assemblyai_url = assemblyai_service.upload_file(tmp_path)
        finally:
            if os.path.exists(tmp_path):
                os.unlink(tmp_path)

        # Submit transcription (non-blocking — check_transcription_task polls)
        logger.info(f"Submitting AssemblyAI transcription for video {video_id}")
        assemblyai_id = assemblyai_service.start_transcription(assemblyai_url)

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
                try:
                    VideoStateMachine.transition(
                        video,
                        VideoEvent.TRANSCRIBE_FAILED,
                        db=self.db,
                        error_message=str(e),
                    )
                except InvalidTransitionError as trans_err:
                    logger.warning(
                        f"transcribe_video_task: invalid Video transition "
                        f"for {video_id}: {trans_err}"
                    )
            if transcript:
                try:
                    TranscriptStateMachine.transition(
                        transcript, TranscriptEvent.TRANSCRIBE_FAILED, db=self.db
                    )
                except InvalidTransitionError as trans_err:
                    logger.warning(
                        f"transcribe_video_task: invalid Transcript "
                        f"transition for {video_id}: {trans_err}"
                    )

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
        # Expire cached objects to get fresh data on each check
        self.db.expire_all()

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
            # TRANSCRIBE_SUCCEEDED: processing -> completed.
            TranscriptStateMachine.transition(
                transcript, TranscriptEvent.TRANSCRIBE_SUCCEEDED, db=self.db
            )

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

            # Update video status and persist duration. TRANSCRIBE_SUCCEEDED
            # clears error_message as a state-machine side effect so the UI
            # doesn't keep showing a stale banner after a successful retry.
            video = self.db.query(Video).filter(Video.id == UUID(video_id)).first()
            if video:
                VideoStateMachine.transition(
                    video, VideoEvent.TRANSCRIBE_SUCCEEDED, db=self.db
                )
                duration = processed_transcript.get("duration_seconds")
                if duration:
                    video.duration_seconds = int(round(duration))
            self.db.commit()

            logger.info(f"Transcription completed for video {video_id}")

            # PR #20: Auto-dispatch the analyze chain so the user doesn't have
            # to click "Analyze" manually. Eliminates the
            # transcribed-but-no-analysis-row window that caused frontend
            # crashes (Sentry JAVASCRIPT-REACT-6) and made videos look stuck.
            # The helper guards against double-dispatch via DB status checks.
            if video:
                try:
                    _maybe_auto_dispatch_analyze_chain(self.db, video)
                except Exception as dispatch_err:
                    # Auto-dispatch is best-effort: a failure here must NOT
                    # mark the transcription itself as errored — the manual
                    # "Analyze" button remains as a retry affordance. Log
                    # loudly so we notice in Sentry / logs.
                    logger.exception(
                        f"[auto-dispatch] Failed to dispatch analyze chain "
                        f"for video {video_id}: {dispatch_err}"
                    )

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
            try:
                VideoStateMachine.transition(
                    video,
                    VideoEvent.TRANSCRIBE_FAILED,
                    db=db,
                    error_message=error_message,
                )
            except InvalidTransitionError as trans_err:
                logger.warning(
                    f"_mark_transcription_error: invalid Video transition "
                    f"for {video_id}: {trans_err}"
                )
        if transcript:
            try:
                TranscriptStateMachine.transition(
                    transcript, TranscriptEvent.TRANSCRIBE_FAILED, db=db
                )
            except InvalidTransitionError as trans_err:
                logger.warning(
                    f"_mark_transcription_error: invalid Transcript "
                    f"transition for {video_id}: {trans_err}"
                )

        db.commit()
    except Exception as cleanup_error:
        logger.error(
            f"Failed to update error status for video {video_id}: {cleanup_error}"
        )
