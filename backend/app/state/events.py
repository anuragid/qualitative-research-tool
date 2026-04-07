"""Events that drive state transitions.

Each state machine consumes events from its matching enum. The transition
tables in ``video_state.py`` / ``project_state.py`` / ``analysis_state.py``
/ ``transcript_state.py`` map ``(from_state, event) -> to_state``.

Naming convention: past-tense verbs for things that *happened*
(UPLOAD_CONFIRMED, TRANSCRIBE_SUCCEEDED), imperative for things the system
is *requesting* (TRANSCRIBE_REQUESTED, ANALYZE_DISPATCHED).
"""

from __future__ import annotations

from enum import Enum


class VideoEvent(str, Enum):
    """Events that transition a Video row."""

    UPLOAD_URL_REQUESTED = "upload_url_requested"
    UPLOAD_CONFIRMED = "upload_confirmed"

    TRANSCRIBE_REQUESTED = "transcribe_requested"
    TRANSCRIBE_SUCCEEDED = "transcribe_succeeded"
    TRANSCRIBE_FAILED = "transcribe_failed"

    ANALYZE_DISPATCHED = "analyze_dispatched"
    CHAIN_SUCCEEDED = "chain_succeeded"
    CHAIN_FAILED = "chain_failed"

    WATCHDOG_TIMEOUT = "watchdog_timeout"
    WATCHDOG_CLEANUP = "watchdog_cleanup"  # orphan fix: analyzing -> analyzed


class ProjectEvent(str, Enum):
    """Events that transition a Project row."""

    CREATED = "created"
    FIRST_TRANSCRIPT_COMPLETE = "first_transcript_complete"
    ALL_VIDEOS_COMPLETE = "all_videos_complete"


class VideoAnalysisEvent(str, Enum):
    """Events that transition a VideoAnalysis row."""

    ROW_CREATED = "row_created"               # get_video_analysis_state inserts pending row
    RETRY_RESET = "retry_reset"               # route-level retry clears the row back to pending
    CHAIN_STARTED = "chain_started"           # first step begins (pending -> processing)
    CHAIN_SUCCEEDED = "chain_succeeded"       # final step commits (processing -> completed)
    CHAIN_FAILED = "chain_failed"             # any step errors
    WATCHDOG_TIMEOUT = "watchdog_timeout"


class ProjectAnalysisEvent(str, Enum):
    """Events that transition a ProjectAnalysis row."""

    ROW_CREATED = "row_created"               # cross_relate creates the row directly as processing
    CHAIN_STEP_PROGRESS = "chain_step_progress"  # idempotent re-set to processing
    CHAIN_SUCCEEDED = "chain_succeeded"
    CHAIN_FAILED = "chain_failed"
    WATCHDOG_TIMEOUT = "watchdog_timeout"


class TranscriptEvent(str, Enum):
    """Events that transition a Transcript row."""

    ROW_CREATED = "row_created"              # new Transcript row, status=pending
    TRANSCRIBE_STARTED = "transcribe_started"  # worker promotes pending -> processing
    TRANSCRIBE_SUCCEEDED = "transcribe_succeeded"
    TRANSCRIBE_FAILED = "transcribe_failed"
    WATCHDOG_TIMEOUT = "watchdog_timeout"
