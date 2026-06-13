"""Tests for project delete R2 orphan protection (audit R-M4).

Bug: delete_project caught per-video R2 delete failures with logger.warning
and continued to db.delete(project), cascading away the video row that held
the only s3_key reference — permanently orphaning the R2 object.

Fix: mirror delete_video (videos.py) — fail the request on first R2 error so
the DB row (and its s3_key) survives; the user retries, and the retry is
idempotent because S3/R2 DeleteObject on a nonexistent key returns 204 (no
error), so any videos already deleted on the partial attempt can be re-deleted
without consequence.
"""

from unittest.mock import patch

import pytest

pytestmark = pytest.mark.anyio

# The conftest mock_s3 fixture patches `app.routes.videos.s3_service` and
# `app.services.s3_service.s3_service`.  The projects route holds its own
# import reference (`from app.services.s3_service import s3_service`), so we
# need to patch it independently.
_PROJECTS_S3_PATCH = "app.routes.projects.s3_service"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

async def _create_project(client, name: str = "Delete Test") -> str:
    r = await client.post("/api/projects/", json={"name": name})
    assert r.status_code == 201, r.text
    return r.json()["id"]


async def _add_video(client, mock_s3, project_id: str, filename: str = "test.mp4") -> str:
    """Presign + confirm-upload a video, returning its video_id."""
    mock_s3.generate_upload_url.return_value = "https://fake-upload-url"
    upload = await client.post(
        f"/api/videos/{project_id}/upload-url",
        json={"filename": filename, "file_size": 1000, "content_type": "video/mp4"},
    )
    assert upload.status_code == 200, upload.text
    video_id = upload.json()["video_id"]

    mock_s3.head_object.return_value = {"ContentLength": 1000}
    confirm = await client.post(f"/api/videos/{video_id}/confirm-upload")
    assert confirm.status_code == 200, confirm.text
    return video_id


async def _video_ids(client, project_id: str) -> set:
    """Return the set of video ids that currently have a DB row in this project.

    Reads the row state directly via GET /projects/{id}/videos so a test can
    assert an individual video row survived, independent of whether the parent
    project row still exists / whether the cascade fired.
    """
    r = await client.get(f"/api/projects/{project_id}/videos")
    assert r.status_code == 200, r.text
    return {v["id"] for v in r.json()}


# ---------------------------------------------------------------------------
# Failing test 1: R2 error on first video → request fails (no DB deletion)
# ---------------------------------------------------------------------------

async def test_project_delete_r2_failure_returns_error(client, mock_s3):
    """DELETE /projects/{id} must return 500 (not 204) when R2 delete fails for any video.

    Before the fix: delete_project swallowed the R2 exception (logger.warning),
    continued to db.delete(project), and returned 204 — orphaning the R2 object.
    After the fix: the first R2 failure must propagate as an HTTP 5xx error.
    """
    project_id = await _create_project(client)
    await _add_video(client, mock_s3, project_id)

    with patch(_PROJECTS_S3_PATCH) as proj_s3:
        proj_s3.delete_video.side_effect = Exception("R2 connection refused")
        response = await client.delete(f"/api/projects/{project_id}")

    assert response.status_code == 500, (
        f"Expected 500 on R2 failure but got {response.status_code}. "
        f"The project delete route is still silently swallowing R2 errors and orphaning objects."
    )


async def test_project_delete_r2_failure_preserves_db_rows(client, mock_s3):
    """When R2 delete fails, both the project row AND video row must still exist in DB.

    This is the core invariant: as long as the DB row survives we can re-attempt
    the delete and recover the s3_key reference. Losing the row = permanent orphan.
    """
    project_id = await _create_project(client)
    await _add_video(client, mock_s3, project_id)

    with patch(_PROJECTS_S3_PATCH) as proj_s3:
        proj_s3.delete_video.side_effect = Exception("R2 timeout")
        response = await client.delete(f"/api/projects/{project_id}")

    assert response.status_code == 500

    # Project row must still exist — GET returns the project
    get_resp = await client.get(f"/api/projects/{project_id}")
    assert get_resp.status_code == 200, (
        f"Project row was deleted despite R2 failure — s3_key reference is now orphaned forever. "
        f"GET returned {get_resp.status_code}."
    )


async def test_project_delete_r2_failure_one_of_several_videos(client, mock_s3):
    """Partial R2 failure (second of three videos fails) → 5xx, all DB rows intact.

    The key regression: with three videos and the second failing, the bug would:
      1. delete video-1 from R2 (succeeds)
      2. swallow failure on video-2 (orphan created here)
      3. delete video-3 from R2 (succeeds)
      4. db.delete(project) → all rows including video-2 row cascade-deleted
      5. return 204, caller thinks success — video-2's R2 object is now unreachable forever

    With the fix, step 2 raises and the request fails with 5xx. Video-1's R2 object
    is already deleted but its DB row still exists (idempotent re-delete is safe
    because R2 DeleteObject on a missing key is a no-op 204).
    """
    project_id = await _create_project(client)
    v1 = await _add_video(client, mock_s3, project_id, "video1.mp4")
    v2 = await _add_video(client, mock_s3, project_id, "video2.mp4")
    v3 = await _add_video(client, mock_s3, project_id, "video3.mp4")

    call_count = 0

    def _fail_second(*args, **kwargs):
        nonlocal call_count
        call_count += 1
        if call_count == 2:
            raise Exception("R2 intermittent error on video 2")
        return None

    with patch(_PROJECTS_S3_PATCH) as proj_s3:
        proj_s3.delete_video.side_effect = _fail_second
        response = await client.delete(f"/api/projects/{project_id}")

    assert response.status_code == 500, (
        f"Expected 500 when second-of-three R2 deletes fails, got {response.status_code}. "
        f"The partial-orphan bug is still present."
    )

    # Project (and hence all video rows) must still be in DB
    get_resp = await client.get(f"/api/projects/{project_id}")
    assert get_resp.status_code == 200, (
        "Project was deleted from DB despite partial R2 failure — video-2's s3_key is now a permanent orphan."
    )

    # Assert EVERY video row survived directly (not just via the project GET).
    # In particular video-1, whose R2 object was already deleted before the
    # failure: a future impl that deletes video rows outside the project
    # cascade (e.g. db.delete(video) inside the loop) would lose video-1's
    # s3_key reference here and this assertion would catch it.
    surviving = await _video_ids(client, project_id)
    assert surviving == {v1, v2, v3}, (
        f"Expected all 3 video rows to survive the failed delete, got {surviving}. "
        f"A video row was deleted despite the request failing — its s3_key is now orphaned."
    )


# ---------------------------------------------------------------------------
# Retry test — the whole value proposition: a delete that fails on R2 can be
# safely re-attempted once R2 recovers, because the DB rows (and their s3_keys)
# were preserved and re-deleting an already-gone R2 object is a no-op.
# ---------------------------------------------------------------------------

async def test_project_delete_retry_after_r2_failure_succeeds(client, mock_s3):
    """First DELETE fails on video-2's R2 delete; second DELETE (R2 healthy) succeeds.

    This is the end-to-end proof that the fix is recoverable:

      Call 1 — R2 delete of video-2 raises:
        * returns 500
        * project row + ALL THREE video rows still exist (nothing orphaned)

      Call 2 — R2 healthy (all deletes succeed, including re-deleting video-1
               and video-3 whose objects the first call already removed — safe
               because R2 DeleteObject on a missing key is a no-op 204):
        * returns 204
        * project + all video rows gone from DB

    Without the fix, call 1 would have 204'd and cascade-deleted video-2's row,
    leaving its R2 object orphaned with no DB reference to ever retry against —
    so there would be nothing to test here.
    """
    project_id = await _create_project(client)
    v1 = await _add_video(client, mock_s3, project_id, "video1.mp4")
    v2 = await _add_video(client, mock_s3, project_id, "video2.mp4")
    v3 = await _add_video(client, mock_s3, project_id, "video3.mp4")

    # --- Call 1: R2 fails on the second video ---
    call_count = 0

    def _fail_second(*args, **kwargs):
        nonlocal call_count
        call_count += 1
        if call_count == 2:
            raise Exception("R2 intermittent error on video 2")
        return None

    with patch(_PROJECTS_S3_PATCH) as proj_s3:
        proj_s3.delete_video.side_effect = _fail_second
        first = await client.delete(f"/api/projects/{project_id}")

    assert first.status_code == 500, (
        f"Expected first delete to fail with 500, got {first.status_code}"
    )

    # Project + every video row survived → s3_keys are all still recoverable.
    assert (await client.get(f"/api/projects/{project_id}")).status_code == 200
    surviving = await _video_ids(client, project_id)
    assert surviving == {v1, v2, v3}, (
        f"After the failed first delete, expected all 3 video rows intact, got {surviving}"
    )

    # --- Call 2: R2 has recovered; retry the exact same delete ---
    deleted_keys = []

    def _succeed_all(s3_key, *args, **kwargs):
        # Re-deleting v1/v3 (already removed in call 1) is a no-op in real R2;
        # here the mock simply succeeds, modeling DeleteObject's 204-on-missing.
        deleted_keys.append(s3_key)
        return None

    with patch(_PROJECTS_S3_PATCH) as proj_s3:
        proj_s3.delete_video.side_effect = _succeed_all
        second = await client.delete(f"/api/projects/{project_id}")

    assert second.status_code == 204, (
        f"Expected retry delete to succeed with 204, got {second.status_code}: {second.text}"
    )
    # All three videos' R2 objects were (re-)deleted on the successful retry.
    assert len(deleted_keys) == 3, (
        f"Expected the retry to attempt all 3 R2 deletes, got {len(deleted_keys)}"
    )

    # Project (and all video rows via cascade) is now gone — clean final state.
    assert (await client.get(f"/api/projects/{project_id}")).status_code == 404


# ---------------------------------------------------------------------------
# Happy-path tests: full success → 204, project gone from DB
# ---------------------------------------------------------------------------

async def test_project_delete_happy_path(client, mock_s3):
    """DELETE /projects/{id} returns 204 and removes the project from DB when all R2 deletes succeed."""
    project_id = await _create_project(client)
    await _add_video(client, mock_s3, project_id, "video1.mp4")
    await _add_video(client, mock_s3, project_id, "video2.mp4")

    with patch(_PROJECTS_S3_PATCH) as proj_s3:
        proj_s3.delete_video.return_value = None  # R2 deletes succeed
        response = await client.delete(f"/api/projects/{project_id}")

    assert response.status_code == 204, (
        f"Expected 204 on happy path, got {response.status_code}: {response.text}"
    )

    # Project is gone
    get_resp = await client.get(f"/api/projects/{project_id}")
    assert get_resp.status_code == 404, (
        f"Expected 404 after successful delete, got {get_resp.status_code}"
    )


async def test_project_delete_no_videos_happy_path(client, mock_s3):
    """DELETE /projects/{id} works for a project with no videos (nothing to delete from R2)."""
    project_id = await _create_project(client, "Empty Project")

    # No videos → no R2 calls; projects route s3_service is never invoked.
    with patch(_PROJECTS_S3_PATCH):
        response = await client.delete(f"/api/projects/{project_id}")

    assert response.status_code == 204, (
        f"Expected 204 for empty project delete, got {response.status_code}: {response.text}"
    )

    get_resp = await client.get(f"/api/projects/{project_id}")
    assert get_resp.status_code == 404
