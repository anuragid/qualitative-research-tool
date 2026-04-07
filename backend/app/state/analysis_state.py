"""State machines for ``VideoAnalysis`` and ``ProjectAnalysis`` rows.

Both row types have the same four live states (pending / processing /
completed / error) so they share the :class:`VideoAnalysisStatus` enum,
but the transitions are slightly different:

- ``VideoAnalysis`` is created in PENDING (lazy, by ``get_video_analysis_state``)
  and later promoted to PROCESSING by ``analyze_chunk_step``.
- ``ProjectAnalysis`` is created directly in PROCESSING by
  ``_get_or_create_project_analysis`` — there is no separate PENDING
  state for it.

Each machine has its own transition table so the distinction is
explicit and any future edit has to touch both.
"""

from __future__ import annotations

import logging
from typing import Optional

from app.models.database_models import ProjectAnalysis, VideoAnalysis
from app.state.events import ProjectAnalysisEvent, VideoAnalysisEvent
from app.state.exceptions import InvalidTransitionError
from app.state.statuses import VideoAnalysisStatus

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# VideoAnalysis
# ---------------------------------------------------------------------------


VIDEO_ANALYSIS_TRANSITIONS: dict[
    tuple[Optional[VideoAnalysisStatus], VideoAnalysisEvent], VideoAnalysisStatus
] = {
    # Creation: get_video_analysis_state inserts a fresh pending row.
    (None, VideoAnalysisEvent.ROW_CREATED): VideoAnalysisStatus.PENDING,

    # Retry reset: /analyze handler flips an ERROR row back to PENDING before
    # redispatching the chain (PR #21). Idempotent self-loop for PENDING.
    (VideoAnalysisStatus.ERROR, VideoAnalysisEvent.RETRY_RESET): VideoAnalysisStatus.PENDING,
    (VideoAnalysisStatus.PENDING, VideoAnalysisEvent.RETRY_RESET): VideoAnalysisStatus.PENDING,

    # Chain starts: analyze_chunk_step promotes pending (or an already-processing
    # row on retry, because the chunk step is idempotent) to processing.
    (VideoAnalysisStatus.PENDING, VideoAnalysisEvent.CHAIN_STARTED): VideoAnalysisStatus.PROCESSING,
    (VideoAnalysisStatus.PROCESSING, VideoAnalysisEvent.CHAIN_STARTED): VideoAnalysisStatus.PROCESSING,

    # Chain finishes successfully (analyze_activate_step).
    (VideoAnalysisStatus.PROCESSING, VideoAnalysisEvent.CHAIN_SUCCEEDED): VideoAnalysisStatus.COMPLETED,

    # Chain fails (per-step except, pipeline_errors.handle_pipeline_error).
    (VideoAnalysisStatus.PROCESSING, VideoAnalysisEvent.CHAIN_FAILED): VideoAnalysisStatus.ERROR,
    # Idempotent re-error — the chain's .on_error callback may run after a
    # per-step except block already stamped the row.
    (VideoAnalysisStatus.ERROR, VideoAnalysisEvent.CHAIN_FAILED): VideoAnalysisStatus.ERROR,
    # The pending -> error path is used by the error handler when the first
    # step fails before flipping to processing (rare, but possible).
    (VideoAnalysisStatus.PENDING, VideoAnalysisEvent.CHAIN_FAILED): VideoAnalysisStatus.ERROR,

    # Watchdog timeout — reset_stuck_analyses.
    (VideoAnalysisStatus.PROCESSING, VideoAnalysisEvent.WATCHDOG_TIMEOUT): VideoAnalysisStatus.ERROR,
}


class VideoAnalysisStateMachine:
    """State machine for :class:`VideoAnalysis` rows."""

    @staticmethod
    def transition(
        analysis: VideoAnalysis,
        event: VideoAnalysisEvent,
        *,
        db=None,  # noqa: ANN001
    ) -> VideoAnalysisStatus:
        """Transition ``analysis`` for ``event``. Does not commit."""
        del db

        from_state = (
            VideoAnalysisStatus(analysis.status) if analysis.status else None
        )

        key_specific = (from_state, event)
        key_wildcard = (None, event)
        if key_specific in VIDEO_ANALYSIS_TRANSITIONS:
            to_state = VIDEO_ANALYSIS_TRANSITIONS[key_specific]
        elif key_wildcard in VIDEO_ANALYSIS_TRANSITIONS:
            to_state = VIDEO_ANALYSIS_TRANSITIONS[key_wildcard]
        else:
            allowed_from = [
                k[0]
                for k in VIDEO_ANALYSIS_TRANSITIONS
                if k[1] == event and k[0] is not None
            ]
            raise InvalidTransitionError(
                entity_type="VideoAnalysis",
                entity_id=str(getattr(analysis, "id", "new")),
                from_state=from_state,
                event=event,
                allowed_from=allowed_from,
            )

        analysis.status = to_state.value
        logger.debug(
            "VideoAnalysisStateMachine: VideoAnalysis(%s) %s -> %s via %s",
            getattr(analysis, "id", "new"),
            from_state,
            to_state,
            event,
        )
        return to_state


# ---------------------------------------------------------------------------
# ProjectAnalysis
# ---------------------------------------------------------------------------


PROJECT_ANALYSIS_TRANSITIONS: dict[
    tuple[Optional[VideoAnalysisStatus], ProjectAnalysisEvent], VideoAnalysisStatus
] = {
    # Creation: _get_or_create_project_analysis inserts the row directly as
    # processing — there is no separate pending step.
    (None, ProjectAnalysisEvent.ROW_CREATED): VideoAnalysisStatus.PROCESSING,

    # Idempotent progress writes inside the chain steps.
    (VideoAnalysisStatus.PROCESSING, ProjectAnalysisEvent.CHAIN_STEP_PROGRESS): VideoAnalysisStatus.PROCESSING,

    # Final step success.
    (VideoAnalysisStatus.PROCESSING, ProjectAnalysisEvent.CHAIN_SUCCEEDED): VideoAnalysisStatus.COMPLETED,

    # Failure paths (per-step except + .on_error handler).
    (VideoAnalysisStatus.PROCESSING, ProjectAnalysisEvent.CHAIN_FAILED): VideoAnalysisStatus.ERROR,
    (VideoAnalysisStatus.ERROR, ProjectAnalysisEvent.CHAIN_FAILED): VideoAnalysisStatus.ERROR,

    # Watchdog.
    (VideoAnalysisStatus.PROCESSING, ProjectAnalysisEvent.WATCHDOG_TIMEOUT): VideoAnalysisStatus.ERROR,
}


class ProjectAnalysisStateMachine:
    """State machine for :class:`ProjectAnalysis` rows.

    Shares :class:`VideoAnalysisStatus` with :class:`VideoAnalysisStateMachine`
    because both row types use the same four live strings, but the transition
    tables are independent.
    """

    @staticmethod
    def transition(
        pa: ProjectAnalysis,
        event: ProjectAnalysisEvent,
        *,
        db=None,  # noqa: ANN001
    ) -> VideoAnalysisStatus:
        """Transition ``pa`` for ``event``. Does not commit."""
        del db

        from_state = (
            VideoAnalysisStatus(pa.status) if pa.status else None
        )

        key_specific = (from_state, event)
        key_wildcard = (None, event)
        if key_specific in PROJECT_ANALYSIS_TRANSITIONS:
            to_state = PROJECT_ANALYSIS_TRANSITIONS[key_specific]
        elif key_wildcard in PROJECT_ANALYSIS_TRANSITIONS:
            to_state = PROJECT_ANALYSIS_TRANSITIONS[key_wildcard]
        else:
            allowed_from = [
                k[0]
                for k in PROJECT_ANALYSIS_TRANSITIONS
                if k[1] == event and k[0] is not None
            ]
            raise InvalidTransitionError(
                entity_type="ProjectAnalysis",
                entity_id=str(getattr(pa, "id", "new")),
                from_state=from_state,
                event=event,
                allowed_from=allowed_from,
            )

        pa.status = to_state.value
        logger.debug(
            "ProjectAnalysisStateMachine: ProjectAnalysis(%s) %s -> %s via %s",
            getattr(pa, "id", "new"),
            from_state,
            to_state,
            event,
        )
        return to_state
