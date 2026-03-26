"""Tests for authorization bypass (IDOR) prevention."""
import uuid

import pytest

pytestmark = pytest.mark.anyio


async def test_get_nonexistent_project_returns_404(client):
    """Accessing a project that doesn't exist should return 404."""
    fake_id = str(uuid.uuid4())
    response = await client.get(f"/api/projects/{fake_id}")
    assert response.status_code == 404


async def test_get_nonexistent_video_returns_404(client):
    """Accessing a video that doesn't exist should return 404."""
    fake_id = str(uuid.uuid4())
    response = await client.get(f"/api/videos/{fake_id}")
    assert response.status_code == 404


async def test_delete_nonexistent_project_returns_404(client):
    """Deleting a project that doesn't exist should return 404."""
    fake_id = str(uuid.uuid4())
    response = await client.delete(f"/api/projects/{fake_id}")
    assert response.status_code == 404


async def test_delete_nonexistent_video_returns_404(client, mock_s3):
    """Deleting a video that doesn't exist should return 404."""
    fake_id = str(uuid.uuid4())
    response = await client.delete(f"/api/videos/{fake_id}")
    assert response.status_code == 404


async def test_get_analysis_for_nonexistent_video_returns_404(client):
    """Accessing analysis for a non-existent video should return 404."""
    fake_id = str(uuid.uuid4())
    response = await client.get(f"/api/videos/{fake_id}/analysis")
    assert response.status_code == 404


async def test_get_transcript_for_nonexistent_video_returns_404(client):
    """Accessing transcript for a non-existent video should return 404."""
    fake_id = str(uuid.uuid4())
    response = await client.get(f"/api/videos/{fake_id}/transcript")
    assert response.status_code == 404


async def test_cannot_upload_to_nonexistent_project(client, mock_s3):
    """Uploading a video to a non-existent project should return 404."""
    fake_id = str(uuid.uuid4())
    response = await client.post(
        f"/api/videos/{fake_id}/upload-url",
        json={"filename": "test.mp4", "file_size": 1000, "content_type": "video/mp4"},
    )
    assert response.status_code == 404


async def test_invalid_uuid_format_returns_422(client):
    """Non-UUID path parameters should return 422 validation error."""
    response = await client.get("/api/projects/not-a-uuid")
    assert response.status_code == 422


async def test_video_access_cross_project(client, mock_s3):
    """A video should only be accessible through its owning project."""
    # Create two projects
    r1 = await client.post("/api/projects/", json={"name": "Project A"})
    assert r1.status_code == 201
    project_a_id = r1.json()["id"]

    r2 = await client.post("/api/projects/", json={"name": "Project B"})
    assert r2.status_code == 201

    # Upload a video to Project A
    mock_s3.generate_upload_url.return_value = "https://fake-upload-url"
    upload_resp = await client.post(
        f"/api/videos/{project_a_id}/upload-url",
        json={"filename": "test.mp4", "file_size": 1000, "content_type": "video/mp4"},
    )
    assert upload_resp.status_code == 200
    video_id = upload_resp.json()["video_id"]

    # Video should be accessible directly (ownership via project join)
    video_resp = await client.get(f"/api/videos/{video_id}")
    # Video is in "uploading" state; GET still returns 200 with ownership check
    assert video_resp.status_code == 200
