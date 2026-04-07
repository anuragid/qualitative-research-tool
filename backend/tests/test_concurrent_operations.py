"""Tests for concurrent operation guards."""
from unittest.mock import MagicMock, patch

import pytest

pytestmark = pytest.mark.anyio


async def test_cannot_delete_video_while_transcribing(client, mock_s3):
    """Cannot delete a video that is currently being transcribed."""
    # Create project and video
    r = await client.post("/api/projects/", json={"name": "Test Project"})
    project_id = r.json()["id"]

    mock_s3.generate_upload_url.return_value = "https://fake-upload-url"
    upload = await client.post(
        f"/api/videos/{project_id}/upload-url",
        json={"filename": "test.mp4", "file_size": 1000, "content_type": "video/mp4"},
    )
    video_id = upload.json()["video_id"]

    # Confirm upload
    mock_s3.head_object.return_value = {"ContentLength": 1000}
    await client.post(f"/api/videos/{video_id}/confirm-upload")

    # Start transcription (mock the Celery task)
    with patch("app.tasks.transcription_tasks.transcribe_video_task") as mock_task:
        mock_task.delay.return_value = MagicMock(id="fake-task-id")
        transcribe_resp = await client.post(f"/api/videos/{video_id}/transcribe")
        assert transcribe_resp.status_code == 202

    # Try to delete — should fail with 409
    response = await client.delete(f"/api/videos/{video_id}")
    assert response.status_code == 409
    assert "being processed" in response.json()["detail"]


async def test_cannot_delete_project_while_video_processing(client, mock_s3):
    """Cannot delete a project that has a video being processed."""
    # Create project and video
    r = await client.post("/api/projects/", json={"name": "Test Project"})
    project_id = r.json()["id"]

    mock_s3.generate_upload_url.return_value = "https://fake-upload-url"
    upload = await client.post(
        f"/api/videos/{project_id}/upload-url",
        json={"filename": "test.mp4", "file_size": 1000, "content_type": "video/mp4"},
    )
    video_id = upload.json()["video_id"]

    mock_s3.head_object.return_value = {"ContentLength": 1000}
    await client.post(f"/api/videos/{video_id}/confirm-upload")

    # Start transcription
    with patch("app.tasks.transcription_tasks.transcribe_video_task") as mock_task:
        mock_task.delay.return_value = MagicMock(id="fake-task-id")
        await client.post(f"/api/videos/{video_id}/transcribe")

    # Try to delete project — should fail
    response = await client.delete(f"/api/projects/{project_id}")
    assert response.status_code == 409


async def test_double_transcription_rejected(client, mock_s3):
    """Starting transcription twice on the same video should be rejected."""
    # Create project and video
    r = await client.post("/api/projects/", json={"name": "Test Project"})
    project_id = r.json()["id"]

    mock_s3.generate_upload_url.return_value = "https://fake-upload-url"
    upload = await client.post(
        f"/api/videos/{project_id}/upload-url",
        json={"filename": "test.mp4", "file_size": 1000, "content_type": "video/mp4"},
    )
    video_id = upload.json()["video_id"]

    mock_s3.head_object.return_value = {"ContentLength": 1000}
    await client.post(f"/api/videos/{video_id}/confirm-upload")

    # Start first transcription
    with patch("app.tasks.transcription_tasks.transcribe_video_task") as mock_task:
        mock_task.delay.return_value = MagicMock(id="fake-task-id")
        r1 = await client.post(f"/api/videos/{video_id}/transcribe")
        assert r1.status_code == 202

    # Try to start second transcription — should fail
    r2 = await client.post(f"/api/videos/{video_id}/transcribe")
    assert r2.status_code == 409


async def test_upload_confirmation_is_idempotent(client, mock_s3):
    """Confirming upload on an already-uploaded video should succeed (idempotent).

    The frontend uses confirm-upload as a recovery probe after XHR/network failures
    during direct-to-R2 uploads, so repeated calls must be safe. If the bytes are
    still in R2, the endpoint should return 200 with the video record regardless of
    whether the video was already marked uploaded.
    """
    r = await client.post("/api/projects/", json={"name": "Test Project"})
    project_id = r.json()["id"]

    mock_s3.generate_upload_url.return_value = "https://fake-upload-url"
    upload = await client.post(
        f"/api/videos/{project_id}/upload-url",
        json={"filename": "test.mp4", "file_size": 1000, "content_type": "video/mp4"},
    )
    video_id = upload.json()["video_id"]

    # Confirm once
    mock_s3.head_object.return_value = {"ContentLength": 1000}
    r1 = await client.post(f"/api/videos/{video_id}/confirm-upload")
    assert r1.status_code == 200
    assert r1.json()["status"] == "uploaded"

    # Confirm again — should succeed idempotently
    r2 = await client.post(f"/api/videos/{video_id}/confirm-upload")
    assert r2.status_code == 200
    assert r2.json()["status"] == "uploaded"
    assert r2.json()["id"] == r1.json()["id"]
