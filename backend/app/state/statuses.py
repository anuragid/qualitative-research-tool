"""Status enums for Video, Project, VideoAnalysis, ProjectAnalysis, Transcript.

Every status value currently persisted to the database is declared here as
an ``str, Enum`` member. Wire format (API responses, DB strings) is the
enum *value* — the string — so switching to these enums is fully
backward-compatible with existing rows and clients.

See ``docs/production-readiness/prs/pr22-state-machine-enums.md`` for the
design rationale and ``backend/app/state/*_state.py`` for the transition
tables that govern legal state changes.
"""

from __future__ import annotations

from enum import Enum


class VideoStatus(str, Enum):
    """Video lifecycle states, in approximate chronological order."""

    UPLOADING = "uploading"        # presigned URL issued, waiting for client PUT
    UPLOADED = "uploaded"          # client confirmed upload via /confirm-upload
    TRANSCRIBING = "transcribing"  # AssemblyAI job submitted, polling
    TRANSCRIBED = "transcribed"    # transcription complete, no analysis yet
    ANALYZING = "analyzing"        # analyze chain in flight
    ANALYZED = "analyzed"          # all 5 chain steps complete
    ERROR = "error"                # something broke — see video.error_message

    def __str__(self) -> str:  # pragma: no cover - trivial
        return self.value


class VideoAnalysisStatus(str, Enum):
    """VideoAnalysis (and ProjectAnalysis) row lifecycle.

    See :data:`VIDEO_ANALYSIS_NOT_STARTED_SENTINEL` for the "no row exists
    yet" API sentinel — it is intentionally NOT a member of this enum
    because it is never persisted, and including it would break the
    SQLAlchemy ``SQLEnum`` column validator for the DB columns.
    """

    PENDING = "pending"            # row exists but chain has not started / reset for retry
    PROCESSING = "processing"      # a step is in flight
    COMPLETED = "completed"        # chain ran to success
    ERROR = "error"                # chain failed or watchdog cleaned up

    def __str__(self) -> str:  # pragma: no cover - trivial
        return self.value


# API-response sentinel used by ``GET /videos/{id}/analysis`` and
# ``GET /projects/{id}/analysis`` when no analysis row exists yet. Returned
# as a plain string in the response body so the frontend can render an
# empty/CTA state without crashing on ``Array.map`` over undefined (see
# Sentry JAVASCRIPT-REACT-6 / PR #18). Never written to the database.
VIDEO_ANALYSIS_NOT_STARTED_SENTINEL: str = "not_started"


class ProjectStatus(str, Enum):
    """Project lifecycle states.

    ``ARCHIVED`` is preserved for historical rows migrated by
    ``208ec29c043f_update_project_status_states``. No current code path
    writes it, but it must remain a valid enum member so existing rows
    load cleanly.
    """

    PLANNING = "planning"        # freshly created, nothing uploaded
    READY = "ready"              # at least one transcript done; project browsable
    PROCESSING = "processing"    # legacy — retained for backward compat
    COMPLETED = "completed"      # all videos analyzed
    ARCHIVED = "archived"        # legacy — pre-migration rows
    ERROR = "error"

    def __str__(self) -> str:  # pragma: no cover - trivial
        return self.value


class TranscriptStatus(str, Enum):
    """Transcript row lifecycle."""

    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    ERROR = "error"

    def __str__(self) -> str:  # pragma: no cover - trivial
        return self.value
