"""Periodic watchdog task to detect and reset stuck analyses.

Celery Beat runs this every 5 minutes.  It scans for VideoAnalysis,
Video, ProjectAnalysis, and Transcript records that have been in a
"processing" / "analyzing" state longer than the configured timeout and
marks them as errored so users can retry instead of staring at an
infinite spinner.
"""

import json
import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy.exc import OperationalError

from app.models.database_models import (
    ProjectAnalysis,
    Transcript,
    Video,
    VideoAnalysis,
)
from app.state import (
    InvalidTransitionError,
    ProjectAnalysisEvent,
    ProjectAnalysisStateMachine,
    TranscriptEvent,
    TranscriptStateMachine,
    VideoAnalysisEvent,
    VideoAnalysisStateMachine,
    VideoEvent,
    VideoStateMachine,
)
from app.tasks.base import DatabaseTask
from app.tasks.celery_app import celery_app

logger = logging.getLogger(__name__)

# How long a record can sit in "processing" before the watchdog resets it.
# Must exceed Celery task_time_limit (6 min) + broker visibility_timeout (10 min)
# so Celery gets a chance to kill AND re-deliver orphaned tasks before the
# watchdog stamps them errored. 17 min = 6 + 10 + 1 min slack; locked by
# tests/test_celery_lifecycle.py. See PR #19 (post-mortem on Kathleen video
# 4b1f4b25 — stuck `unacked` for 61 min because the default 3600s visibility
# timeout exceeded the old 35-min watchdog threshold).
_ANALYSIS_TIMEOUT = timedelta(minutes=17)
_TRANSCRIPT_TIMEOUT = timedelta(minutes=60)


def _watchdog_error_json(details: str) -> str:
    """Build a structured error payload consistent with the pipeline pattern."""
    return json.dumps({
        "step": "watchdog",
        "error_type": "timeout",
        "retryable": True,
        "message": "Analysis timed out and was automatically reset. You can retry.",
        "details": details,
    })


@celery_app.task(
    base=DatabaseTask,
    bind=True,
    name="reset_stuck_analyses",
    autoretry_for=(OperationalError,),
    retry_backoff=True,
    retry_backoff_max=30,
    retry_jitter=True,
    max_retries=3,
)
def reset_stuck_analyses(self):
    """Find and reset any analyses stuck in a processing state."""

    db = self.db
    now = datetime.now(timezone.utc)
    analysis_cutoff = now - _ANALYSIS_TIMEOUT
    transcript_cutoff = now - _TRANSCRIPT_TIMEOUT

    videos_reset = 0
    projects_reset = 0
    transcripts_reset = 0

    try:
        # --- VideoAnalysis stuck in "processing" ---
        stuck_video_analyses = (
            db.query(VideoAnalysis)
            .filter(
                VideoAnalysis.status == "processing",
                VideoAnalysis.started_at < analysis_cutoff,
            )
            .all()
        )

        for va in stuck_video_analyses:
            error_msg = _watchdog_error_json(
                f"Stuck in processing state for over {int(_ANALYSIS_TIMEOUT.total_seconds() // 60)} minutes"
            )
            VideoAnalysisStateMachine.transition(
                va, VideoAnalysisEvent.WATCHDOG_TIMEOUT, db=db
            )
            va.completed_at = now

            # Also mark the parent Video as errored.
            video = db.query(Video).filter(Video.id == va.video_id).first()
            if video and video.status not in ("analyzed", "error"):
                try:
                    VideoStateMachine.transition(
                        video,
                        VideoEvent.WATCHDOG_TIMEOUT,
                        db=db,
                        error_message=error_msg,
                    )
                except InvalidTransitionError as exc:
                    # Defensive: if the video was somehow not in a state
                    # from which WATCHDOG_TIMEOUT is legal, log and skip.
                    logger.warning(
                        "Watchdog could not transition Video %s via WATCHDOG_TIMEOUT: %s",
                        video.id, exc,
                    )

            videos_reset += 1
            logger.warning(
                "Watchdog reset stuck VideoAnalysis %s (video %s) — started_at %s",
                va.id,
                va.video_id,
                va.started_at,
            )

        # --- Video records stuck in "analyzing" without a matching VideoAnalysis reset above ---
        stuck_videos = (
            db.query(Video)
            .filter(Video.status == "analyzing")
            .join(VideoAnalysis, VideoAnalysis.video_id == Video.id)
            .filter(
                VideoAnalysis.status == "processing",
                VideoAnalysis.started_at < analysis_cutoff,
            )
            .all()
        )

        for video in stuck_videos:
            # May already have been handled in the VideoAnalysis loop, skip duplicates.
            if video.status != "analyzing":
                continue
            error_msg = _watchdog_error_json(
                f"Stuck in analyzing state for over {int(_ANALYSIS_TIMEOUT.total_seconds() // 60)} minutes"
            )
            VideoStateMachine.transition(
                video,
                VideoEvent.WATCHDOG_TIMEOUT,
                db=db,
                error_message=error_msg,
            )
            videos_reset += 1
            logger.warning(
                "Watchdog reset stuck Video %s — linked VideoAnalysis exceeded timeout",
                video.id,
            )

        # --- Videos stuck in "analyzing" with terminal or missing analysis ---
        # Catches the case where watchdog or task set VideoAnalysis to error/completed
        # but the Video.status was never updated (race condition).
        orphaned_analyzing = (
            db.query(Video)
            .filter(Video.status == "analyzing")
            .outerjoin(VideoAnalysis, VideoAnalysis.video_id == Video.id)
            .filter(
                (VideoAnalysis.id.is_(None))
                | (VideoAnalysis.status.in_(["error", "completed"]))
            )
            .all()
        )

        for video in orphaned_analyzing:
            va = db.query(VideoAnalysis).filter(
                VideoAnalysis.video_id == video.id
            ).first()
            if va and va.status == "completed":
                # Analysis actually completed but video status wasn't synced.
                # WATCHDOG_CLEANUP: analyzing -> analyzed (and clears
                # error_message as a side effect).
                VideoStateMachine.transition(
                    video, VideoEvent.WATCHDOG_CLEANUP, db=db
                )
                logger.warning(
                    "Watchdog fixed orphaned Video %s: analyzing -> analyzed "
                    "(analysis was completed)",
                    video.id,
                )
            else:
                error_msg = _watchdog_error_json(
                    "Video stuck in 'analyzing' with no active analysis"
                )
                VideoStateMachine.transition(
                    video,
                    VideoEvent.WATCHDOG_TIMEOUT,
                    db=db,
                    error_message=error_msg,
                )
                logger.warning(
                    "Watchdog fixed orphaned Video %s: analyzing -> error "
                    "(analysis was %s)",
                    video.id,
                    va.status if va else "missing",
                )
            videos_reset += 1

        # --- ProjectAnalysis stuck in "processing" ---
        stuck_project_analyses = (
            db.query(ProjectAnalysis)
            .filter(
                ProjectAnalysis.status == "processing",
                ProjectAnalysis.started_at < analysis_cutoff,
            )
            .all()
        )

        for pa in stuck_project_analyses:
            timeout_mins = int(_ANALYSIS_TIMEOUT.total_seconds() // 60)
            error_msg = _watchdog_error_json(
                f"Stuck in processing state for over {timeout_mins} minutes"
            )
            ProjectAnalysisStateMachine.transition(
                pa, ProjectAnalysisEvent.WATCHDOG_TIMEOUT, db=db
            )
            pa.completed_at = now
            pa.error_message = error_msg
            projects_reset += 1
            logger.warning(
                "Watchdog reset stuck ProjectAnalysis %s (project %s) — started_at %s",
                pa.id,
                pa.project_id,
                pa.started_at,
            )

        # --- Transcript stuck in "processing" ---
        stuck_transcripts = (
            db.query(Transcript)
            .filter(
                Transcript.status == "processing",
                Transcript.created_at < transcript_cutoff,
            )
            .all()
        )

        for t in stuck_transcripts:
            error_msg = _watchdog_error_json(
                f"Stuck in processing state for over {int(_TRANSCRIPT_TIMEOUT.total_seconds() // 60)} minutes"
            )
            TranscriptStateMachine.transition(
                t, TranscriptEvent.WATCHDOG_TIMEOUT, db=db
            )

            # Also mark the parent Video as errored.
            video = db.query(Video).filter(Video.id == t.video_id).first()
            if video and video.status in ("transcribing",):
                VideoStateMachine.transition(
                    video,
                    VideoEvent.WATCHDOG_TIMEOUT,
                    db=db,
                    error_message=error_msg,
                )

            transcripts_reset += 1
            logger.warning(
                "Watchdog reset stuck Transcript %s (video %s) — created_at %s",
                t.id,
                t.video_id,
                t.created_at,
            )

        db.commit()

        total = videos_reset + projects_reset + transcripts_reset
        if total > 0:
            logger.warning(
                "Watchdog reset %d stuck record(s): videos=%d, projects=%d, transcripts=%d",
                total, videos_reset, projects_reset, transcripts_reset,
            )

    except OperationalError:
        db.rollback()
        retries = getattr(self.request, "retries", 0)
        logger.warning(
            "Watchdog task hit transient DB error (attempt %d/%d), will retry",
            retries + 1,
            (self.max_retries or 0) + 1,
        )
        raise
    except Exception:
        db.rollback()
        logger.exception("Watchdog task failed")
        raise

    return {
        "videos_reset": videos_reset,
        "projects_reset": projects_reset,
        "transcripts_reset": transcripts_reset,
    }
