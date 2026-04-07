# PR #19.5 — Retry-swallow fix

**Branch:** `fix/retry-reset-analysis`
**Worktree:** `/Users/idstuart/Projects/ai-prototyping/5d-worktrees/pr19-5-retry-reset`
**Base:** `origin/main` (includes Fix A/B/C from earlier today)
**Estimated effort:** 30-60 min

## Problem statement

Clicking "Retry Analysis" on an errored video currently does nothing, even though the retry click successfully hits the API, the API dispatches the chain, and all 5 chain steps are received by Celery within 150 ms. Every step immediately short-circuits with `"Skipping <step> for <video_id> — already in error state"` because the chain's defensive skip-if-errored check looks at `VideoAnalysis.status` which is still `"error"`.

The `POST /videos/{video_id}/analyze` route handler (`backend/app/routes/videos.py` around line 622) resets `video.status = "analyzing"` and clears `video.error_message`, but it does NOT reset the `VideoAnalysis` row's `status` field from `"error"` back to `"pending"`. So:

1. User clicks Retry → route sets `video.status = "analyzing"`, `error_message = None`, commits
2. Route dispatches `chain(analyze_chunk_step, ..., analyze_activate_step)` via `apply_async()`
3. `analyze_chunk_step` runs, reads `VideoAnalysis.status == "error"`, logs `"Skipping chunk ... — already in error state"`, returns `status=skipped`
4. Subsequent steps do the same
5. Chain completes as a no-op
6. Video is now in `analyzing` status with no active work; 3 min later the watchdog's `orphaned_analyzing` branch flips it back to `error`

This was proven in prod on 2026-04-07 at 20:00:24 UTC with Kathleen video `4b1f4b25-c94f-4bf8-9a6a-0958ddfc4e41`. Worker logs:

```
20:00:24.883 Task analyze_chunk_step[803b383c...] succeeded in 0.078s: {'status': 'skipped'}
20:00:24.917 Task analyze_infer_step[d7c8026a...] succeeded in 0.033s: {'status': 'skipped'}
20:00:24.932 Task analyze_relate_step[05b5d989...] succeeded in 0.022s: {'status': 'skipped'}
20:00:24.969 Task analyze_explain_step[6fa46fcf...] succeeded in 0.032s: {'status': 'skipped'}
20:00:24.994 Task analyze_activate_step[884b10b1...] succeeded in 0.032s: {'status': 'skipped'}
20:03:58.150 Watchdog fixed orphaned Video 4b1f4b25... analyzing -> error (analysis was error)
```

The defensive skip is correct for preventing double-execution during normal chain flow. It is wrong for the retry path. We must reset the analysis row *before* dispatching on retry.

## The fix

In the `POST /videos/{video_id}/analyze` route handler, after setting `video.status = "analyzing"` and clearing `video.error_message`, also reset the `VideoAnalysis` row if one exists and its status is `"error"`. Do this inside the same DB transaction so either both updates happen or neither does.

### Exact code change

`backend/app/routes/videos.py`, inside the analyze POST handler (find the block at around lines 616-625 that sets `video.status = "analyzing"`):

**Before:**

```python
# Set video status to "analyzing" inside the request transaction to close
# the concurrent-double-click race. Two requests hitting this endpoint
# back-to-back will both reach this point, but only one will win the
# commit — the other will see status == "analyzing" on its next read
# and reject via the status check above. The chunk step's matching
# reassignment later is idempotent and harmless.
video.status = "analyzing"
video.error_message = None
db.commit()
```

**After:**

```python
# Set video status to "analyzing" inside the request transaction to close
# the concurrent-double-click race. Two requests hitting this endpoint
# back-to-back will both reach this point, but only one will win the
# commit — the other will see status == "analyzing" on its next read
# and reject via the status check above. The chunk step's matching
# reassignment later is idempotent and harmless.
video.status = "analyzing"
video.error_message = None

# Retry path: if a VideoAnalysis row exists in "error" state, reset it
# before dispatching the chain. Otherwise the chain's defensive
# skip-if-errored check (in each step task) silently short-circuits every
# step and the retry is a no-op. See docs/production-readiness/prs/pr19-5-retry-swallow.md
# and PR #19.5 for the full root-cause story (Kathleen video 4b1f4b25, 2026-04-07).
analysis = db.query(VideoAnalysis).filter(
    VideoAnalysis.video_id == video_id
).first()
if analysis and analysis.status == "error":
    analysis.status = "pending"
    analysis.current_step = None
    analysis.started_at = None
    analysis.completed_at = None
    analysis.chunk_completed_at = None
    analysis.infer_completed_at = None
    analysis.relate_completed_at = None
    analysis.explain_completed_at = None
    analysis.activate_completed_at = None
    analysis.step_status = {}
    # Clear jsonb payload — chunk step is idempotent and will repopulate.
    analysis.chunks = None
    analysis.inferences = None
    analysis.patterns = None
    analysis.insights = None
    analysis.design_principles = None

db.commit()
```

### What about the project_analyses retry path?

Check `backend/app/routes/projects.py` — the `POST /projects/{project_id}/analyze` route dispatches a separate cross-video chain. Same pattern may apply to `ProjectAnalysis` rows. If the route has an equivalent pre-dispatch block, apply the same reset to `ProjectAnalysis` where `status == "error"`. If it does not, add a comment noting that ProjectAnalysis retry isn't covered by this PR and link to a follow-up task.

**Scope decision:** If touching projects.py is a one-line mirror of videos.py, do it. If it requires structural changes, scope it out and leave a TODO comment referencing this PR.

## Tests

Create or extend `backend/tests/test_analyze_retry.py`:

```python
"""Tests for the retry-analysis path. Regresses PR #19.5 — the retry-swallow bug.

Background: before PR #19.5, clicking "Retry Analysis" on an errored video would
dispatch the chain but every step would immediately short-circuit with
"Skipping ... — already in error state" because the route handler reset
video.status but not VideoAnalysis.status. Verified in prod on 2026-04-07 with
Kathleen video 4b1f4b25.
"""
from __future__ import annotations

import pytest
from unittest.mock import patch, MagicMock

# Use whatever fixtures already exist in conftest for: client, db_session, test_user, test_project, test_video, test_transcript


def test_retry_resets_errored_video_analysis(client, db_session, test_video_with_errored_analysis):
    """Retry must reset VideoAnalysis.status from 'error' to 'pending' before dispatching
    so that the chain's defensive skip-if-errored check doesn't short-circuit every step."""
    video, analysis = test_video_with_errored_analysis
    assert analysis.status == "error"
    # Mock the chain dispatch so we don't actually run it.
    with patch("app.routes.videos.chain") as mock_chain:
        mock_chain.return_value.apply_async.return_value = MagicMock(id="fake-task-id")
        response = client.post(
            f"/api/videos/{video.id}/analyze",
            headers={"Authorization": "Bearer test-token"},
        )
    assert response.status_code == 200
    db_session.refresh(analysis)
    assert analysis.status == "pending", \
        "Retry must reset analysis status from 'error' to 'pending' so chain steps don't skip"
    assert analysis.chunk_completed_at is None
    assert analysis.infer_completed_at is None
    assert analysis.relate_completed_at is None
    assert analysis.explain_completed_at is None
    assert analysis.activate_completed_at is None
    assert analysis.step_status == {}
    # jsonb payload must be cleared so chunk step repopulates cleanly
    assert analysis.chunks is None
    assert analysis.inferences is None
    assert analysis.patterns is None
    assert analysis.insights is None
    assert analysis.design_principles is None


def test_retry_does_not_touch_non_errored_analysis(client, db_session, test_video_with_completed_analysis):
    """If somehow the analyze route is called when VideoAnalysis is already in a
    non-error state, we must NOT destroy the existing data. The route's status check
    earlier in the handler should reject this case, but if it doesn't, we still
    shouldn't wipe the row."""
    video, analysis = test_video_with_completed_analysis
    original_chunks = analysis.chunks
    assert analysis.status == "completed"
    # This should actually 4xx because video.status is "analyzed", but if it
    # somehow reaches the reset block, jsonb must not be wiped.
    with patch("app.routes.videos.chain") as mock_chain:
        mock_chain.return_value.apply_async.return_value = MagicMock(id="fake-task-id")
        client.post(
            f"/api/videos/{video.id}/analyze",
            headers={"Authorization": "Bearer test-token"},
        )
    db_session.refresh(analysis)
    assert analysis.status == "completed"
    assert analysis.chunks == original_chunks


def test_retry_without_prior_analysis_row_dispatches_fresh(client, db_session, test_video_transcribed_no_analysis):
    """First-time analyze call (no VideoAnalysis row yet) must still dispatch the chain.
    The reset block is a no-op in this case because there's no row to reset."""
    video = test_video_transcribed_no_analysis
    with patch("app.routes.videos.chain") as mock_chain:
        mock_chain.return_value.apply_async.return_value = MagicMock(id="fake-task-id")
        response = client.post(
            f"/api/videos/{video.id}/analyze",
            headers={"Authorization": "Bearer test-token"},
        )
    assert response.status_code == 200
    assert mock_chain.called
```

If the fixtures `test_video_with_errored_analysis`, `test_video_with_completed_analysis`, `test_video_transcribed_no_analysis` don't exist in `conftest.py`, create minimal inline fixtures in the test file.

## Workflow

1. **Create the worktree** (not yet created):
   ```bash
   cd /Users/idstuart/Projects/ai-prototyping/5d-analysis/qualitative-research-tool
   git fetch origin
   git worktree add -b fix/retry-reset-analysis ../5d-worktrees/pr19-5-retry-reset origin/main
   cd ../5d-worktrees/pr19-5-retry-reset
   ```

2. **Read** `backend/app/routes/videos.py` around lines 570-670 to understand the handler structure. Confirm the lines I'm pointing at haven't drifted.

3. **Read** `backend/app/tasks/analysis_steps.py` around line 300 to confirm where the skip-if-errored check lives (you don't need to change it, just understand it).

4. **TDD:** Write the failing tests first in `backend/tests/test_analyze_retry.py`. Run them and confirm they fail for the right reason.

5. Apply the route handler change.

6. Run the new tests. Confirm they pass.

7. Run adjacent suites to check for regressions:
   ```bash
   source ../qualitative-research-tool/backend/venv/bin/activate
   cd backend
   pytest tests/test_analyze_retry.py tests/test_analysis_chain.py tests/test_analysis_retry.py tests/test_watchdog_race.py -v
   ```

8. Ruff clean: `ruff check backend/app/routes/videos.py backend/tests/test_analyze_retry.py`

9. Pre-push hook runs lint + typecheck.

10. Commit:
    ```
    fix(routes): reset VideoAnalysis row on retry to prevent chain skip-swallow (PR #19.5)

    The /videos/{id}/analyze route was resetting video.status but not the
    VideoAnalysis row's status. Each chain step's defensive skip-if-errored
    check then short-circuited, turning the retry into a no-op. Proven in
    prod 2026-04-07 20:00:24 UTC on Kathleen video 4b1f4b25.

    Fix: in the same DB transaction that flips video.status to "analyzing",
    also reset VideoAnalysis.status from "error" to "pending" and clear all
    per-step completed_at + jsonb payload fields. The chunk step is
    idempotent and will repopulate.

    Tests: 3 new tests in test_analyze_retry.py cover the errored-retry,
    the completed-guardrail, and the first-time-analyze paths.

    Co-authored-by: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
    ```

11. Push and open PR with title `fix(routes): reset VideoAnalysis row on retry (PR #19.5)`.

## Scope guardrails

- **Touch only** `backend/app/routes/videos.py` and `backend/tests/test_analyze_retry.py` (and maybe `backend/app/routes/projects.py` if the mirror is trivial)
- **Do not** change the per-step skip-if-errored logic in `analysis_steps.py`. That logic is correct for non-retry paths; we're fixing the retry path, not removing the defense
- **Do not** introduce a new "force" parameter or "retry" flag — the fix should work for every call to the analyze route
- **Do not** touch the watchdog or state machine
- **Single-purpose PR**

## Deliverable

Merged-ready PR + 200-word report with:
- Test results (new + adjacent)
- Ruff result
- PR URL
- Confirmation of whether projects.py was or wasn't included (and why)
- Any concerns flagged for follow-up
