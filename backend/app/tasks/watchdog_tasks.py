"""Periodic watchdog task to detect and reset stuck analyses.

Celery Beat runs this every 5 minutes.  It scans for VideoAnalysis,
Video, ProjectAnalysis, and Transcript records that have been in a
"processing" / "analyzing" state longer than the configured timeout and
marks them as errored so users can retry instead of staring at an
infinite spinner.

Concurrency (audit R-H2)
------------------------
A stuck row may complete between the moment the watchdog *selects* it as a
candidate and the moment it *stamps* it errored: a slow-but-alive task can
cross the finish line in that window. Without a lock the watchdog would
clobber the just-completed row (last-writer-wins).

The fix is compare-and-swap via row locks, applied per row in its OWN short
transaction:

  1. Candidate SELECT (unlocked, cheap) finds rows that *look* stuck.
  2. For each candidate, re-SELECT that single row ``FOR UPDATE SKIP LOCKED``
     and re-check the staleness predicate against the now-locked, freshly
     read state. If a live task already moved it on (completed / not stale),
     skip it. Otherwise stamp it errored via the state machine and commit.
  3. ``SKIP LOCKED`` means the sweep never *blocks* behind a live task that
     currently holds the row's lock — it simply skips that row and revisits
     it on the next 5-minute pass.

Lock-ordering / deadlock
------------------------
Most iterations lock a single row, but the VideoAnalysis and Transcript
sweeps lock TWO rows in one transaction (the status row, then its parent
Video) to keep the child + parent transition atomic. The route guards lock
those same rows in the OPPOSITE order (Video first, then the child) —
which would be a classic lock-order cycle EXCEPT that the watchdog acquires
EVERY lock with ``SKIP LOCKED`` and therefore NEVER waits: if a route is
mid-transaction holding the Video row, the watchdog's parent-Video
``_lock_row`` returns ``None`` instead of blocking, and it simply proceeds
without the parent update (or skips the candidate). Because the watchdog can
never be the *waiting* side of a cycle, no deadlock between watchdog and
routes is possible. Each candidate is also committed before the next is
processed, so no lock is held across the whole sweep (bounded transaction
scope). Post-PR #44 the chain steps commit their ``processing`` status
BEFORE the multi-minute LLM call (they do not hold a row lock across it), so
a watchdog lock attempt would never wait on a long-running task even if it
used a plain ``FOR UPDATE`` — ``SKIP LOCKED`` is the belt-and-suspenders
that also breaks the route/watchdog lock-order cycle.
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
from app.utils.row_locking import lock_rows

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


def _is_still_stale(ts, cutoff) -> bool:
    """Return True iff ``ts`` is non-null and strictly older than ``cutoff``.

    Normalizes naive datetimes to UTC before comparing. The
    ``DateTime(timezone=True)`` columns round-trip tz-aware on PostgreSQL but
    come back NAIVE on SQLite (the test backend), so the under-lock Python
    re-check must tolerate both — otherwise it raises "can't compare
    offset-naive and offset-aware datetimes". (The candidate SELECT does this
    comparison in SQL where the dialect handles tz; only the re-check is in
    Python.)
    """
    if ts is None:
        return False
    if ts.tzinfo is None:
        ts = ts.replace(tzinfo=timezone.utc)
    return ts < cutoff


def _watchdog_error_json(details: str) -> str:
    """Build a structured error payload consistent with the pipeline pattern."""
    return json.dumps({
        "step": "watchdog",
        "error_type": "timeout",
        "retryable": True,
        "message": "Analysis timed out and was automatically reset. You can retry.",
        "details": details,
    })


def _lock_row(db, model, row_id):
    """Re-SELECT a single row ``FOR UPDATE SKIP LOCKED`` (Postgres) and return it.

    Returns ``None`` when the row is currently locked by another transaction
    (SKIP LOCKED) or was deleted between the candidate SELECT and now. On
    SQLite (tests) the lock clause is a no-op, so this is a plain re-read —
    which is exactly what lets the logic-level CAS tests exercise the
    re-check predicate.
    """
    return (
        lock_rows(
            db.query(model).filter(model.id == row_id),
            skip_locked=True,
        )
        .first()
    )


def reset_stuck_video_analyses(db, now, analysis_cutoff) -> int:
    """CAS-reset VideoAnalysis rows stuck in 'processing' past the cutoff.

    Each row is locked + re-checked + stamped + committed in its OWN
    transaction so no lock is held across the sweep.
    """
    candidate_ids = [
        va.id
        for va in db.query(VideoAnalysis.id)
        .filter(
            VideoAnalysis.status == "processing",
            VideoAnalysis.started_at < analysis_cutoff,
        )
        .all()
    ]

    reset = 0
    for va_id in candidate_ids:
        va = _lock_row(db, VideoAnalysis, va_id)
        # CAS re-check: a live task may have completed (or already errored)
        # this row, or refreshed started_at, in the window since the candidate
        # SELECT. Only stamp it if it is STILL stuck under the lock.
        if va is None or va.status != "processing" \
                or not _is_still_stale(va.started_at, analysis_cutoff):
            db.rollback()  # release the (no-op on SQLite) lock cleanly
            continue

        error_msg = _watchdog_error_json(
            f"Stuck in processing state for over "
            f"{int(_ANALYSIS_TIMEOUT.total_seconds() // 60)} minutes"
        )
        VideoAnalysisStateMachine.transition(
            va, VideoAnalysisEvent.WATCHDOG_TIMEOUT, db=db
        )
        va.completed_at = now

        # Also mark the parent Video as errored — lock it too so we don't
        # race a concurrent video-status write.
        video = _lock_row(db, Video, va.video_id)
        if video and video.status not in ("analyzed", "error"):
            try:
                VideoStateMachine.transition(
                    video, VideoEvent.WATCHDOG_TIMEOUT, db=db,
                    error_message=error_msg,
                )
            except InvalidTransitionError as exc:
                logger.warning(
                    "Watchdog could not transition Video %s via WATCHDOG_TIMEOUT: %s",
                    video.id, exc,
                )

        db.commit()
        reset += 1
        logger.warning(
            "Watchdog reset stuck VideoAnalysis %s (video %s) — started_at %s",
            va.id, va.video_id, va.started_at,
        )
    return reset


def reset_orphaned_analyzing_videos(db) -> int:
    """Fix Video rows stuck in 'analyzing' whose analysis is terminal/missing.

    Catches the race where the VideoAnalysis row reached error/completed but
    Video.status was never synced. Each row is locked + re-checked + committed
    individually.
    """
    candidate_ids = [
        v.id
        for v in db.query(Video.id)
        .filter(Video.status == "analyzing")
        .outerjoin(VideoAnalysis, VideoAnalysis.video_id == Video.id)
        .filter(
            (VideoAnalysis.id.is_(None))
            | (VideoAnalysis.status.in_(["error", "completed"]))
        )
        .all()
    ]

    reset = 0
    for vid in candidate_ids:
        video = _lock_row(db, Video, vid)
        # CAS re-check: still analyzing under the lock?
        if video is None or video.status != "analyzing":
            db.rollback()
            continue

        va = db.query(VideoAnalysis).filter(VideoAnalysis.video_id == video.id).first()
        if va and va.status == "completed":
            # Analysis actually completed but video status wasn't synced.
            VideoStateMachine.transition(video, VideoEvent.WATCHDOG_CLEANUP, db=db)
            logger.warning(
                "Watchdog fixed orphaned Video %s: analyzing -> analyzed "
                "(analysis was completed)", video.id,
            )
        elif va and va.status == "processing":
            # A live task re-acquired the analysis between the candidate SELECT
            # and the lock — leave it alone, the analysis sweep / next pass
            # will handle it.
            db.rollback()
            continue
        else:
            error_msg = _watchdog_error_json(
                "Video stuck in 'analyzing' with no active analysis"
            )
            VideoStateMachine.transition(
                video, VideoEvent.WATCHDOG_TIMEOUT, db=db, error_message=error_msg,
            )
            logger.warning(
                "Watchdog fixed orphaned Video %s: analyzing -> error "
                "(analysis was %s)", video.id, va.status if va else "missing",
            )

        db.commit()
        reset += 1
    return reset


def reset_stuck_project_analyses(db, now, analysis_cutoff) -> int:
    """CAS-reset ProjectAnalysis rows stuck in 'processing' past the cutoff."""
    candidate_ids = [
        pa.id
        for pa in db.query(ProjectAnalysis.id)
        .filter(
            ProjectAnalysis.status == "processing",
            ProjectAnalysis.started_at < analysis_cutoff,
        )
        .all()
    ]

    reset = 0
    for pa_id in candidate_ids:
        pa = _lock_row(db, ProjectAnalysis, pa_id)
        if pa is None or pa.status != "processing" \
                or not _is_still_stale(pa.started_at, analysis_cutoff):
            db.rollback()
            continue

        # Persist the structured timeout reason onto ProjectAnalysis.error_message
        # (column added in PR #45) so the UI can surface why the cross-video
        # run was reset, mirroring the Video path.
        timeout_mins = int(_ANALYSIS_TIMEOUT.total_seconds() // 60)
        error_msg = _watchdog_error_json(
            f"Stuck in processing state for over {timeout_mins} minutes"
        )
        ProjectAnalysisStateMachine.transition(
            pa, ProjectAnalysisEvent.WATCHDOG_TIMEOUT, db=db
        )
        pa.completed_at = now
        pa.error_message = error_msg
        db.commit()
        reset += 1
        logger.warning(
            "Watchdog reset stuck ProjectAnalysis %s (project %s) — started_at %s",
            pa.id, pa.project_id, pa.started_at,
        )
    return reset


def reset_stuck_transcripts(db, transcript_cutoff) -> int:
    """CAS-reset Transcript rows stuck in 'processing' past the cutoff."""
    candidate_ids = [
        t.id
        for t in db.query(Transcript.id)
        .filter(
            Transcript.status == "processing",
            Transcript.created_at < transcript_cutoff,
        )
        .all()
    ]

    reset = 0
    for t_id in candidate_ids:
        t = _lock_row(db, Transcript, t_id)
        if t is None or t.status != "processing" \
                or not _is_still_stale(t.created_at, transcript_cutoff):
            db.rollback()
            continue

        error_msg = _watchdog_error_json(
            f"Stuck in processing state for over "
            f"{int(_TRANSCRIPT_TIMEOUT.total_seconds() // 60)} minutes"
        )
        TranscriptStateMachine.transition(
            t, TranscriptEvent.WATCHDOG_TIMEOUT, db=db
        )

        # Also mark the parent Video as errored (lock it).
        video = _lock_row(db, Video, t.video_id)
        if video and video.status in ("transcribing",):
            VideoStateMachine.transition(
                video, VideoEvent.WATCHDOG_TIMEOUT, db=db, error_message=error_msg,
            )

        db.commit()
        reset += 1
        logger.warning(
            "Watchdog reset stuck Transcript %s (video %s) — created_at %s",
            t.id, t.video_id, t.created_at,
        )
    return reset


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
    """Find and reset any analyses stuck in a processing state.

    Each helper processes its candidates one row per transaction (lock →
    re-check → stamp → commit) so the watchdog never holds more than a single
    row lock at a time and never blocks behind a live task (SKIP LOCKED).
    """

    db = self.db
    now = datetime.now(timezone.utc)
    analysis_cutoff = now - _ANALYSIS_TIMEOUT
    transcript_cutoff = now - _TRANSCRIPT_TIMEOUT

    videos_reset = 0
    projects_reset = 0
    transcripts_reset = 0

    try:
        videos_reset += reset_stuck_video_analyses(db, now, analysis_cutoff)
        videos_reset += reset_orphaned_analyzing_videos(db)
        projects_reset += reset_stuck_project_analyses(db, now, analysis_cutoff)
        transcripts_reset += reset_stuck_transcripts(db, transcript_cutoff)

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
