"""Tests for graceful handling of external service failures."""
from unittest.mock import patch

import pytest

pytestmark = pytest.mark.anyio


async def test_s3_failure_on_upload_url_returns_500(client):
    """If S3 presigned URL generation fails, return 500 with safe message."""
    # First create a project
    r = await client.post("/api/projects/", json={"name": "Test Project"})
    assert r.status_code == 201
    project_id = r.json()["id"]

    with patch("app.routes.videos.s3_service") as mock_s3:
        mock_s3.generate_upload_url.side_effect = Exception("S3 connection refused")
        response = await client.post(
            f"/api/videos/{project_id}/upload-url",
            json={"filename": "test.mp4", "file_size": 1000, "content_type": "video/mp4"},
        )
    assert response.status_code == 500
    detail = response.json()["detail"].lower()
    assert "upload url" in detail or "failed" in detail


async def test_s3_failure_on_video_delete_returns_500(client, mock_s3):
    """If S3 deletion fails for a video, return 500."""
    # Create project and video
    r = await client.post("/api/projects/", json={"name": "Test Project"})
    project_id = r.json()["id"]

    mock_s3.generate_upload_url.return_value = "https://fake-upload-url"
    upload = await client.post(
        f"/api/videos/{project_id}/upload-url",
        json={"filename": "test.mp4", "file_size": 1000, "content_type": "video/mp4"},
    )
    video_id = upload.json()["video_id"]

    # Confirm upload (mock HEAD)
    mock_s3.head_object.return_value = {"ContentLength": 1000}
    await client.post(f"/api/videos/{video_id}/confirm-upload")

    # Now make S3 delete fail
    mock_s3.delete_video.side_effect = Exception("S3 delete failed")
    response = await client.delete(f"/api/videos/{video_id}")
    assert response.status_code == 500


async def test_playback_url_s3_failure_returns_500(client, mock_s3):
    """If S3 presigned URL fails during playback, return 500."""
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

    # Now make presigned URL fail
    mock_s3.get_presigned_url.side_effect = Exception("S3 presigned URL failed")
    response = await client.get(f"/api/videos/{video_id}/playback-url")
    assert response.status_code == 500
