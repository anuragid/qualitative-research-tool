# PR #22 — Status enums + centralized state machine (STRETCH goal)

**Branch:** `fix/state-machine`
**Worktree:** `/Users/idstuart/Projects/ai-prototyping/5d-worktrees/pr22-state-machine`
**Base:** `origin/main` AFTER Wave A (PR #19, #19.5, #20, #21) has all merged
**Estimated effort:** 3-5 hours
**Priority:** Stretch goal — only pick up if Wave A is done early

## Problem statement

Methodex has ~20 scattered call sites that directly write `video.status = "X"`, `project.status = "Y"`, etc. The allowed values are defined only in comments (`"uploaded, transcribing, transcribed, analyzing, analyzed, error"` in `database_models.py:86`). There is no enum, no transition table, no centralized state machine. Typos become silent bugs. Illegal transitions don't raise — they just write a broken state that the watchdog eventually cleans up.

Today's Bug B (the `ready` gate trap in `project_state_service.py:39`) is the canonical example: two people wrote two halves of the state machine and forgot to reconcile the valid predecessors. The bug existed for weeks.

The cure is a centralized state module with explicit transition tables.

## Architectural approach

Create `backend/app/state/` as a new package. Inside it:

- `statuses.py` — Python `enum.Enum` classes with the exact string values currently in the DB
- `video_state.py` — `VideoStateMachine` with explicit `transition()` method, transition table, allowed-from enforcement
- `project_state.py` — same for projects
- `analysis_state.py` — same for `VideoAnalysis`
- `transcript_state.py` — same for transcripts
- `events.py` — `Event` enum with every event that can cause a transition (e.g., `UPLOAD_COMPLETE`, `TRANSCRIBE_STARTED`, `CHAIN_DISPATCHED`, `CHUNK_FAILED`, etc.)
- `exceptions.py` — `InvalidTransitionError`
- `__init__.py` — re-exports the public API

Then switch the database models from `Column(String(50))` to `Column(Enum(VideoStatus))` so SQLAlchemy enforces the value set at the ORM layer.

Then rewrite every direct write site to call the state machine:

```python
# Before
video.status = "analyzing"
video.error_message = None

# After
VideoStateMachine.transition(video, Event.ANALYZE_DISPATCHED, db=db)
```

The transition method handles the `error_message` clear as part of the transition side-effects, so callers don't have to remember.

## Why not a full native Postgres ENUM type?

SQLAlchemy's `Column(Enum(...))` with `native_enum=False` stores the values as `VARCHAR` but enforces the value set at the Python layer on write. Switching to a native Postgres ENUM type (`CREATE TYPE video_status AS ENUM (...)`) would require a more disruptive migration because adding new values to a Postgres enum is awkward (can't be done in a transaction in older versions). The SQLAlchemy-layer enforcement is sufficient for our correctness goal and avoids the migration headache. Native Postgres ENUMs can be a follow-up.

## Files

### New files

`backend/app/state/statuses.py`:

```python
from __future__ import annotations
from enum import Enum


class VideoStatus(str, Enum):
    """Video lifecycle states. See docs/production-readiness/prs/pr22-state-machine-enums.md."""
    UPLOADING = "uploading"  # presigned URL issued, waiting for client to PUT
    UPLOADED = "uploaded"    # client confirmed upload via /confirm-upload
    TRANSCRIBING = "transcribing"  # AssemblyAI job submitted, polling
    TRANSCRIBED = "transcribed"    # transcription complete, no analysis yet
    ANALYZING = "analyzing"  # analyze chain in flight
    ANALYZED = "analyzed"    # all 5 chain steps complete
    ERROR = "error"          # something broke — see video.error_message

    def __str__(self) -> str:
        return self.value


class VideoAnalysisStatus(str, Enum):
    PENDING = "pending"         # VideoAnalysis row exists but chain hasn't started
    PROCESSING = "processing"   # chain is in flight
    COMPLETED = "completed"     # chain ran to success
    ERROR = "error"             # chain failed and pipeline_error handler stamped it
    NOT_STARTED = "not_started"  # sentinel for API responses when no row exists (Fix C)

    def __str__(self) -> str:
        return self.value


class ProjectStatus(str, Enum):
    PLANNING = "planning"   # freshly created, nothing uploaded
    READY = "ready"         # at least one transcript done; user can browse the project
    PROCESSING = "processing"  # (legacy? check usage — may be unused)
    COMPLETED = "completed"  # all videos analyzed
    ERROR = "error"

    def __str__(self) -> str:
        return self.value


class TranscriptStatus(str, Enum):
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    ERROR = "error"

    def __str__(self) -> str:
        return self.value
```

`backend/app/state/events.py`:

```python
from __future__ import annotations
from enum import Enum


class VideoEvent(str, Enum):
    UPLOAD_URL_REQUESTED = "upload_url_requested"
    UPLOAD_CONFIRMED = "upload_confirmed"
    TRANSCRIBE_REQUESTED = "transcribe_requested"
    TRANSCRIBE_STARTED = "transcribe_started"
    TRANSCRIBE_SUCCEEDED = "transcribe_succeeded"
    TRANSCRIBE_FAILED = "transcribe_failed"
    ANALYZE_DISPATCHED = "analyze_dispatched"
    CHAIN_STEP_SUCCEEDED = "chain_step_succeeded"
    CHAIN_SUCCEEDED = "chain_succeeded"
    CHAIN_FAILED = "chain_failed"
    WATCHDOG_TIMEOUT = "watchdog_timeout"
    WATCHDOG_CLEANUP = "watchdog_cleanup"


class ProjectEvent(str, Enum):
    CREATED = "created"
    FIRST_TRANSCRIPT_COMPLETE = "first_transcript_complete"
    ALL_VIDEOS_COMPLETE = "all_videos_complete"
    ANY_VIDEO_FAILED = "any_video_failed"
```

`backend/app/state/exceptions.py`:

```python
class InvalidTransitionError(Exception):
    def __init__(self, entity_type: str, entity_id: str, from_state, event, allowed_from: list):
        self.entity_type = entity_type
        self.entity_id = entity_id
        self.from_state = from_state
        self.event = event
        self.allowed_from = allowed_from
        super().__init__(
            f"{entity_type}({entity_id}): event {event!r} not allowed from state {from_state!r}. "
            f"Allowed from states: {allowed_from}"
        )
```

`backend/app/state/video_state.py`:

```python
from __future__ import annotations
from typing import Optional
from sqlalchemy.orm import Session

from app.models.database_models import Video
from app.state.statuses import VideoStatus
from app.state.events import VideoEvent
from app.state.exceptions import InvalidTransitionError


# (from_state, event) -> to_state
# None as from_state means "any state"
TRANSITIONS: dict[tuple[Optional[VideoStatus], VideoEvent], VideoStatus] = {
    # Upload flow
    (None, VideoEvent.UPLOAD_URL_REQUESTED): VideoStatus.UPLOADING,
    (VideoStatus.UPLOADING, VideoEvent.UPLOAD_CONFIRMED): VideoStatus.UPLOADED,

    # Transcription flow
    (VideoStatus.UPLOADED, VideoEvent.TRANSCRIBE_REQUESTED): VideoStatus.TRANSCRIBING,
    (VideoStatus.ERROR, VideoEvent.TRANSCRIBE_REQUESTED): VideoStatus.TRANSCRIBING,  # retry from error
    (VideoStatus.TRANSCRIBING, VideoEvent.TRANSCRIBE_SUCCEEDED): VideoStatus.TRANSCRIBED,
    (VideoStatus.TRANSCRIBING, VideoEvent.TRANSCRIBE_FAILED): VideoStatus.ERROR,

    # Analysis flow
    (VideoStatus.TRANSCRIBED, VideoEvent.ANALYZE_DISPATCHED): VideoStatus.ANALYZING,
    (VideoStatus.ERROR, VideoEvent.ANALYZE_DISPATCHED): VideoStatus.ANALYZING,  # retry from error
    (VideoStatus.ANALYZED, VideoEvent.ANALYZE_DISPATCHED): VideoStatus.ANALYZING,  # re-run
    (VideoStatus.ANALYZING, VideoEvent.CHAIN_SUCCEEDED): VideoStatus.ANALYZED,
    (VideoStatus.ANALYZING, VideoEvent.CHAIN_FAILED): VideoStatus.ERROR,

    # Watchdog cleanup paths
    (VideoStatus.ANALYZING, VideoEvent.WATCHDOG_TIMEOUT): VideoStatus.ERROR,
    (VideoStatus.ANALYZING, VideoEvent.WATCHDOG_CLEANUP): VideoStatus.ANALYZED,  # orphan fix when analysis actually completed
    (VideoStatus.TRANSCRIBING, VideoEvent.WATCHDOG_TIMEOUT): VideoStatus.ERROR,
}


class VideoStateMachine:
    @staticmethod
    def transition(
        video: Video,
        event: VideoEvent,
        *,
        db: Session,
        error_message: Optional[str] = None,
    ) -> VideoStatus:
        """Atomically transition the video to the next state given the current state
        and event. Raises InvalidTransitionError if the transition is illegal."""
        from_state = VideoStatus(video.status) if video.status else None

        # Try specific (from, event) first, then wildcard (None, event)
        key_specific = (from_state, event)
        key_wildcard = (None, event)
        if key_specific in TRANSITIONS:
            to_state = TRANSITIONS[key_specific]
        elif key_wildcard in TRANSITIONS:
            to_state = TRANSITIONS[key_wildcard]
        else:
            allowed_from = [k[0] for k in TRANSITIONS if k[1] == event and k[0] is not None]
            raise InvalidTransitionError(
                entity_type="Video",
                entity_id=str(video.id),
                from_state=from_state,
                event=event,
                allowed_from=allowed_from,
            )

        video.status = to_state.value

        # Side effects per event
        if event in (VideoEvent.ANALYZE_DISPATCHED, VideoEvent.TRANSCRIBE_REQUESTED):
            video.error_message = None  # clear prior error on retry
        if event in (VideoEvent.CHAIN_FAILED, VideoEvent.TRANSCRIBE_FAILED, VideoEvent.WATCHDOG_TIMEOUT):
            if error_message is not None:
                video.error_message = error_message

        return to_state
```

Similar for `project_state.py`, `analysis_state.py`, `transcript_state.py`. Each has its own transition table derived from the actual current write sites.

### Models change

`backend/app/models/database_models.py`: switch the 4 status columns:

```python
# Before
status = Column(String(50), default="uploaded", index=True)

# After
from sqlalchemy import Enum as SQLEnum
from app.state.statuses import VideoStatus

status = Column(
    SQLEnum(VideoStatus, native_enum=False, values_callable=lambda e: [m.value for m in e]),
    default=VideoStatus.UPLOADED.value,
    index=True,
)
```

Similar for `VideoAnalysis.status`, `Project.status`, `Transcript.status`.

### Alembic migration

Because `native_enum=False`, the underlying column stays `VARCHAR(50)`. No DDL change is required, only a Python-level enforcement. Add an empty or trivial migration:

```python
"""Add SQLAlchemy enum enforcement on status columns (no DDL change)

Revision ID: <new>
Revises: <previous>
Create Date: 2026-04-07
"""
# No op — status columns are already VARCHAR. This migration exists only to
# record the schema version bump so teammates know the enum enforcement
# landed at this point.
def upgrade():
    pass

def downgrade():
    pass
```

### Call-site rewrites

These 20+ sites must route through the state machine. Do them systematically, file by file, with a test run after each file.

- `backend/app/routes/videos.py` — `/upload-url`, `/confirm-upload`, `/transcribe`, `/analyze`, per-step retry routes
- `backend/app/routes/projects.py` — `/projects/{id}/analyze` (cross-video dispatch)
- `backend/app/tasks/analysis_steps.py` — all 5 step tasks + `_update_analysis_error`
- `backend/app/tasks/project_analysis_steps.py` — cross-video step tasks
- `backend/app/tasks/transcription_tasks.py` — `transcribe_video_task`, `check_transcription_task`, plus PR #20's `_maybe_auto_dispatch_analyze_chain` helper if it has landed
- `backend/app/tasks/pipeline_errors.py` — `handle_pipeline_error`, `handle_project_pipeline_error`
- `backend/app/tasks/watchdog_tasks.py` — 4 branches
- `backend/app/services/project_state_service.py` — THIS becomes a thin wrapper around `ProjectStateMachine`

### Tests

For each of the 4 state machines:

```python
# backend/tests/test_video_state_machine.py
from app.state.video_state import VideoStateMachine, TRANSITIONS
from app.state.statuses import VideoStatus
from app.state.events import VideoEvent
from app.state.exceptions import InvalidTransitionError
import pytest


class TestVideoStateMachine:
    def test_happy_path_upload_to_analyzed(self, db_session, make_video):
        video = make_video(status="uploading")
        VideoStateMachine.transition(video, VideoEvent.UPLOAD_CONFIRMED, db=db_session)
        assert video.status == VideoStatus.UPLOADED.value
        VideoStateMachine.transition(video, VideoEvent.TRANSCRIBE_REQUESTED, db=db_session)
        assert video.status == VideoStatus.TRANSCRIBING.value
        VideoStateMachine.transition(video, VideoEvent.TRANSCRIBE_SUCCEEDED, db=db_session)
        assert video.status == VideoStatus.TRANSCRIBED.value
        VideoStateMachine.transition(video, VideoEvent.ANALYZE_DISPATCHED, db=db_session)
        assert video.status == VideoStatus.ANALYZING.value
        VideoStateMachine.transition(video, VideoEvent.CHAIN_SUCCEEDED, db=db_session)
        assert video.status == VideoStatus.ANALYZED.value

    def test_illegal_transition_raises(self, db_session, make_video):
        """You can't go from UPLOADED to ANALYZING without transcribing first."""
        video = make_video(status="uploaded")
        with pytest.raises(InvalidTransitionError) as exc:
            VideoStateMachine.transition(video, VideoEvent.ANALYZE_DISPATCHED, db=db_session)
        assert "uploaded" in str(exc.value).lower()

    def test_retry_from_error_allowed(self, db_session, make_video):
        """Both TRANSCRIBE_REQUESTED and ANALYZE_DISPATCHED are allowed from ERROR."""
        video = make_video(status="error")
        VideoStateMachine.transition(video, VideoEvent.ANALYZE_DISPATCHED, db=db_session)
        assert video.status == VideoStatus.ANALYZING.value
        assert video.error_message is None  # cleared as side effect

    # One test per (from_state, event) pair in TRANSITIONS — makes the transition table
    # the single source of truth and any future edit requires an updated test.
    @pytest.mark.parametrize("from_state,event,to_state", [
        (from_state, event, to_state)
        for (from_state, event), to_state in TRANSITIONS.items()
        if from_state is not None  # skip wildcards
    ])
    def test_every_allowed_transition(self, db_session, make_video, from_state, event, to_state):
        video = make_video(status=from_state.value)
        VideoStateMachine.transition(video, event, db=db_session)
        assert video.status == to_state.value
```

Same structure for `test_project_state_machine.py`, `test_analysis_state_machine.py`, `test_transcript_state_machine.py`.

## Workflow

**Critical:** This PR must rebase on top of all merged Wave A PRs (#19, #19.5, #20, #21). Do NOT start until they're all merged.

1. After Wave A merges:
   ```bash
   cd /Users/idstuart/Projects/ai-prototyping/5d-analysis/qualitative-research-tool
   git fetch origin
   git worktree add -b fix/state-machine ../5d-worktrees/pr22-state-machine origin/main
   cd ../5d-worktrees/pr22-state-machine
   ```

2. Read `backend/app/models/database_models.py`, `backend/app/services/project_state_service.py`, `backend/app/tasks/watchdog_tasks.py` in full to understand the current state write patterns.

3. Create the `app/state/` package with the 5 files above.

4. Write the test files FIRST (TDD). Many tests will fail because the state machine doesn't exist yet.

5. Implement the state machines. Run tests. Iterate until green.

6. Update `database_models.py` to use `SQLEnum`.

7. Rewrite call sites, file by file. Run the full backend test suite after each file to catch regressions early. File order:
   - `services/project_state_service.py` (smallest, most contained)
   - `tasks/watchdog_tasks.py` (4 branches, well-defined)
   - `tasks/pipeline_errors.py` (2 functions)
   - `tasks/analysis_steps.py` (5 steps + _update_analysis_error)
   - `tasks/project_analysis_steps.py` (3 steps)
   - `tasks/transcription_tasks.py` (2 tasks)
   - `routes/videos.py` (biggest — multiple routes)
   - `routes/projects.py` (cross-video)

8. Add the empty Alembic migration.

9. Full suite:
   ```bash
   cd backend
   pytest tests/ -v
   ```
   Must be green. Any test that hardcoded a string status value will fail and need updating.

10. Ruff: `ruff check backend/app/state backend/app/routes backend/app/tasks backend/app/services backend/tests`

11. Commit structure: one commit per logical unit, not one giant commit.
    - `feat(state): add VideoStatus/ProjectStatus/... enums and state machines`
    - `refactor(state): route watchdog_tasks through VideoStateMachine`
    - `refactor(state): route analysis_steps through VideoAnalysisStateMachine`
    - ... etc.
    - Final commit: `feat(models): switch status columns to SQLEnum enforcement`

12. Push, open PR.

## Scope guardrails

- **Do not** switch to native Postgres ENUM types (use `native_enum=False`)
- **Do not** change any API response shapes — enum values serialize to the same strings
- **Do not** add new states or events — the transition table must match current behavior exactly (except that it now enforces what was previously hope)
- **Do not** fix other unrelated bugs you notice while editing these files — file a follow-up task
- **Do** rebase on the latest `origin/main` before opening the PR

## Deliverable

Merged-ready PR + 500-word report with:
- Number of call sites converted
- Test count (old + new)
- Full backend suite pass
- Any states or events you added that weren't explicitly in the spec (with reason)
- Any behaviors you discovered while auditing the write sites that surprised you
- PR URL

## Out of scope but worth documenting

Each of these is a follow-up idea, not part of PR #22:

- Emit a Sentry breadcrumb on every state transition (Phase 2 observability)
- Native Postgres ENUM type migration (when we have a maintenance window)
- Replacing the `_update_analysis_error` free function with a `VideoAnalysisStateMachine.fail(...)` method (cleaner but more churn)
- Making transition events async-friendly (they're synchronous right now; that's fine for SQLAlchemy sync sessions)
