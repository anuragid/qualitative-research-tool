# PR #20 — Auto-dispatch analyze chain after transcription

**Branch:** `fix/auto-dispatch-analyze`
**Worktree:** `/Users/idstuart/Projects/ai-prototyping/5d-worktrees/pr20-auto-dispatch`
**Base:** `origin/main`
**Estimated effort:** 1-2 hours

## Problem statement

Today's investigation showed that after transcription completes, the video sits at `video.status = "transcribed"` with no `video_analyses` row until the user manually clicks "Analyze" on each video. During that window:

1. Frontend polls `/api/videos/{id}/analysis/status` → backend used to return 404 → frontend crashed inside `Array.map` over undefined (Sentry JAVASCRIPT-REACT-6). Fix C patched this defensively by returning 200 with `status="not_started"`, but the underlying manual-click gap is the real bug.

2. The user has to remember to click "Analyze" on every video individually. For a batch of 6 videos (like the HAIC project), that's 6 clicks at different times. Some inevitably get forgotten. The HAIC Kelly/Kathleen/Ewan videos all sat in this limbo for 15-45 min because clicks were missed or racing with deploys.

The cure is: when transcription completes, automatically dispatch the analyze chain. The user clicks "Transcribe" once and walks away.

## The fix

In `backend/app/tasks/transcription_tasks.py`, find the success branch of `check_transcription_task` where `video.status` is set to `"transcribed"` (around line 220 based on earlier investigation; grep for `"transcribed"` to locate). After that commit, dispatch the analyze chain using the exact same chain signature as `routes/videos.py:639-645`.

### Exact change

**File:** `backend/app/tasks/transcription_tasks.py`

Read the full `check_transcription_task` function first (around lines 135-273). Find the success branch. It currently ends with something like:

```python
video.status = "transcribed"
db.commit()
logger.info(f"Transcription completed for video {video_id}")
return {
    "video_id": video_id,
    "transcript_id": str(transcript.id),
    ...
}
```

**Replace with:**

```python
video.status = "transcribed"
video.error_message = None  # clear any previous transcription error
db.commit()
logger.info(f"Transcription completed for video {video_id}")

# PR #20: Auto-dispatch the analyze chain so the user doesn't have to click
# "Analyze" manually. Eliminates the `transcribed-but-no-analysis-row` window
# that caused frontend crashes (Sentry JAVASCRIPT-REACT-6) and made videos
# look "stuck" to users.
#
# Idempotency guard: if another chain is already in flight or has completed
# for this video (e.g., because the user clicked Analyze before transcription
# polling finished, or because this task got re-delivered), do nothing.
_maybe_auto_dispatch_analyze_chain(db, video)

return {
    "video_id": video_id,
    "transcript_id": str(transcript.id),
    ...
}
```

Then add a new helper function in the same file, above `check_transcription_task`:

```python
def _maybe_auto_dispatch_analyze_chain(db: Session, video: Video) -> None:
    """Dispatch the analyze chain for a newly-transcribed video if no chain is
    already running or completed.

    Called from check_transcription_task after transcription completes. The
    user would otherwise have to click "Analyze" manually, which is the gap
    where frontend 404 crashes and stuck-video symptoms live. See
    docs/production-readiness/prs/pr20-auto-dispatch.md.

    Idempotency rules:
    - Skip if video.status is not "transcribed" (something else is in progress
      or failed).
    - Skip if a VideoAnalysis row exists with status in
      ("processing", "completed") — chain is running or already done.
    - OK to dispatch if no VideoAnalysis row exists (fresh case) or if one
      exists with status in ("pending", "error", None) — the chunk step is
      idempotent and will take over.
    """
    from app.models.database_models import VideoAnalysis

    if video.status != "transcribed":
        logger.info(
            f"[auto-dispatch] Skipping analyze for video {video.id}: "
            f"video.status={video.status!r} (expected 'transcribed')"
        )
        return

    existing = (
        db.query(VideoAnalysis)
        .filter(VideoAnalysis.video_id == video.id)
        .first()
    )
    if existing and existing.status in ("processing", "completed"):
        logger.info(
            f"[auto-dispatch] Skipping analyze for video {video.id}: "
            f"VideoAnalysis.status={existing.status!r} (chain in flight or done)"
        )
        return

    # Resolve the user_id. Transcription tasks don't receive user_id directly;
    # it comes from video.project.user_id. Load the project lazily if not already.
    from app.models.database_models import Project
    project = db.query(Project).filter(Project.id == video.project_id).first()
    if not project:
        logger.error(
            f"[auto-dispatch] Cannot dispatch analyze for video {video.id}: "
            f"project {video.project_id} not found"
        )
        return
    current_user_id = project.user_id

    # Flip video.status to "analyzing" in the same transaction so the
    # concurrent-double-click race is closed (same as routes/videos.py:622).
    video.status = "analyzing"
    video.error_message = None
    db.commit()

    # Dispatch the chain. Same signature as routes/videos.py:639-645.
    from celery import chain
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
```

### Why not in the transcribe_video_task itself?

Because `transcribe_video_task` kicks off AssemblyAI and then `check_transcription_task` polls for completion. The auto-dispatch only makes sense at the completion point, not the submission point.

### What about BYOK credit preflight?

The existing analyze route (`routes/videos.py`) uses `Depends(require_byok_credits)` to reject dispatches when the user has no credits. Our auto-dispatch path bypasses that check because Celery tasks don't go through FastAPI dependency injection. The chain steps themselves call `resolve_byok_with_preflight` at every step (per `byok_balance_feature.md` memory), so if the user has no credits the chain will fail at chunk with a clear `insufficient_credits` error that surfaces correctly in the UI.

**Decision:** do not add a pre-dispatch BYOK check in the auto-dispatch helper. The chain's own preflight is sufficient and consistent with the existing pattern.

### What about the stale-video_analyses-row case?

If the user's previous retry left a `VideoAnalysis` row in `status="error"` (Kathleen's state before PR #19.5 landed), the idempotency guard will allow dispatch because `"error"` is not in `("processing", "completed")`. The chain's chunk step is idempotent and will proceed normally, regenerating `chunks`, etc.

However, the defensive skip-if-errored check in `analysis_steps.py` will STILL short-circuit the retry because `VideoAnalysis.status == "error"`. This is exactly the bug PR #19.5 fixes.

**Dependency:** PR #20 only works end-to-end after PR #19.5 lands. Both can be developed in parallel, but merge PR #19.5 first. If PR #19.5 is not ready, PR #20 can still land — auto-dispatch will work for fresh videos (no analysis row yet), just not for retry-after-error.

## Tests

Create `backend/tests/test_auto_dispatch_analyze.py`:

```python
"""Tests for the auto-dispatch of the analyze chain after transcription completes.
Regresses PR #20 — the transcribe→analyze manual-click gap."""
from __future__ import annotations

import pytest
from unittest.mock import patch, MagicMock
from app.tasks.transcription_tasks import _maybe_auto_dispatch_analyze_chain
from app.models.database_models import Video, VideoAnalysis, Project


def test_auto_dispatch_fires_for_freshly_transcribed_video(db_session, test_project, make_video):
    """A video with status='transcribed' and no VideoAnalysis row must trigger
    the analyze chain dispatch and flip status to 'analyzing'."""
    video = make_video(project_id=test_project.id, status="transcribed")
    with patch("app.tasks.transcription_tasks.chain") as mock_chain:
        mock_chain.return_value.apply_async.return_value = MagicMock(id="fake-task-id")
        _maybe_auto_dispatch_analyze_chain(db_session, video)
    assert mock_chain.called, "Chain must be dispatched for transcribed video with no analysis row"
    db_session.refresh(video)
    assert video.status == "analyzing"


def test_auto_dispatch_skips_if_chain_already_running(db_session, test_project, make_video):
    """If another chain is already in flight for this video (VideoAnalysis.status=processing),
    do NOT dispatch a second one."""
    video = make_video(project_id=test_project.id, status="transcribed")
    analysis = VideoAnalysis(video_id=video.id, status="processing", step_status={})
    db_session.add(analysis)
    db_session.commit()
    with patch("app.tasks.transcription_tasks.chain") as mock_chain:
        _maybe_auto_dispatch_analyze_chain(db_session, video)
    assert not mock_chain.called, "Must not dispatch when chain is already processing"
    db_session.refresh(video)
    assert video.status == "transcribed"  # unchanged


def test_auto_dispatch_skips_if_already_completed(db_session, test_project, make_video):
    """If VideoAnalysis.status='completed', do NOT re-dispatch."""
    video = make_video(project_id=test_project.id, status="transcribed")
    analysis = VideoAnalysis(video_id=video.id, status="completed", step_status={
        "chunk": "completed", "infer": "completed", "relate": "completed",
        "explain": "completed", "activate": "completed",
    })
    db_session.add(analysis)
    db_session.commit()
    with patch("app.tasks.transcription_tasks.chain") as mock_chain:
        _maybe_auto_dispatch_analyze_chain(db_session, video)
    assert not mock_chain.called


def test_auto_dispatch_dispatches_for_errored_prior_analysis(db_session, test_project, make_video):
    """If a prior VideoAnalysis is in 'error' state, auto-dispatch must still fire —
    the chunk step is idempotent. (PR #19.5 ensures the chain's defensive skip
    doesn't silently eat this.)"""
    video = make_video(project_id=test_project.id, status="transcribed")
    analysis = VideoAnalysis(video_id=video.id, status="error", step_status={})
    db_session.add(analysis)
    db_session.commit()
    with patch("app.tasks.transcription_tasks.chain") as mock_chain:
        mock_chain.return_value.apply_async.return_value = MagicMock(id="fake-task-id")
        _maybe_auto_dispatch_analyze_chain(db_session, video)
    assert mock_chain.called


def test_auto_dispatch_skips_if_video_not_transcribed(db_session, test_project, make_video):
    """If video.status != 'transcribed', do NOT dispatch. This guards against
    race conditions and future refactors."""
    video = make_video(project_id=test_project.id, status="analyzing")
    with patch("app.tasks.transcription_tasks.chain") as mock_chain:
        _maybe_auto_dispatch_analyze_chain(db_session, video)
    assert not mock_chain.called


def test_check_transcription_task_calls_auto_dispatch_on_success(db_session):
    """End-to-end: check_transcription_task with a completed AssemblyAI transcript
    must call the auto-dispatch helper. Patch the helper to assert call."""
    # Build fixture: a video in 'transcribing' status with a submitted transcript row
    # and a mocked AssemblyAI response returning 'completed'.
    # Then call check_transcription_task and assert auto-dispatch was called once.
    pytest.skip("TODO: integration test — fixture scaffolding")  # acceptable to skip if complex
```

The first 5 tests are table-stakes. The 6th is aspirational and can be `pytest.skip` if the fixtures don't exist.

## Workflow

1. Create the worktree:
   ```bash
   cd /Users/idstuart/Projects/ai-prototyping/5d-analysis/qualitative-research-tool
   git fetch origin
   git worktree add -b fix/auto-dispatch-analyze ../5d-worktrees/pr20-auto-dispatch origin/main
   cd ../5d-worktrees/pr20-auto-dispatch
   ```

2. Read `backend/app/tasks/transcription_tasks.py` in full (135-273). Confirm the success branch location.

3. Read `backend/app/routes/videos.py` lines 622-650 to confirm the chain dispatch pattern you're mirroring.

4. Check `backend/tests/conftest.py` for existing fixtures. Figure out what `test_project`, `make_video`, `db_session` look like; copy the patterns.

5. Write the tests first. Confirm they fail on unpatched code (the helper doesn't exist yet, so `ImportError` is a valid failure mode — that's OK for TDD red).

6. Add the helper function + call site. Re-run tests. They should pass.

7. Adjacent suite check:
   ```bash
   pytest tests/test_auto_dispatch_analyze.py tests/test_transcription_tasks.py tests/test_analysis_chain.py -v
   ```

8. Ruff: `ruff check backend/app/tasks/transcription_tasks.py backend/tests/test_auto_dispatch_analyze.py`

9. Pre-push hook runs lint + typecheck.

10. Commit:
    ```
    feat(tasks): auto-dispatch analyze chain after transcription completes (PR #20)

    Eliminates the transcribed-but-no-analysis-row window that caused frontend
    crashes (Sentry JAVASCRIPT-REACT-6) and made videos look stuck to users.
    After transcription completes, the analyze chain now dispatches
    automatically with idempotency guards against double-dispatch.

    - Adds _maybe_auto_dispatch_analyze_chain() helper in transcription_tasks.py
    - Called from check_transcription_task's success branch
    - Idempotent: skips if chain already running (status=processing) or done
      (status=completed); dispatches for fresh videos and errored-retry videos
    - Uses the same chain signature as routes/videos.py:639-645
    - BYOK credit preflight happens inside chain steps (consistent with
      existing chain pattern)

    Tests: 5 unit tests in test_auto_dispatch_analyze.py cover the fresh,
    processing, completed, errored, and not-transcribed cases.

    Co-authored-by: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
    ```

11. Push and open PR.

## Scope guardrails

- **Touch only** `backend/app/tasks/transcription_tasks.py` and `backend/tests/test_auto_dispatch_analyze.py`
- **Do not** remove or modify the manual POST `/videos/{id}/analyze` route — it stays as a retry affordance (PR #19.5 makes it work for the error path)
- **Do not** touch the frontend "Analyze" button — it stays visible as a retry affordance
- **Do not** add a new idempotency lock or distributed mutex — the DB status check is enough
- **Single-purpose PR**

## Deliverable

Merged-ready PR + 200-word report with test results, ruff result, PR URL, and any notes about how the fixture scaffolding went.
