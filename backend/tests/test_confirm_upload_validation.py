"""Server-side enforcement tests for the presigned-PUT upload path.

Security findings H1/H2/H3: the presigned-PUT direct-upload flow had no
server-side enforcement of size or content. The presigned URL only pins
Bucket/Key/ContentType, so R2 will accept an object of any size and any
bytes at the agreed key. ``confirm-upload`` is the single server-controlled
checkpoint after the client PUT, so all enforcement lives there:

  1. ``head_object`` ContentLength must be within the absolute
     MAX_FILE_SIZE_MB ceiling.
  2. ``head_object`` ContentLength must be within a tolerance envelope of
     the size the client claimed when it requested the presigned URL.
  3. A ranged GET of the first bytes must pass the SAME magic-byte
     validator the legacy multipart ``/upload`` path uses.

On any rejection the row is driven to ``error`` via the state machine and
the offending R2 object is deleted (cleanup), so a rejected upload can be
retried and never leaves a stuck row or an orphaned oversized object.

These tests follow the mock pattern in ``test_external_service_failures.py``
(patch ``app.routes.videos.s3_service``; stub ``head_object`` / ``get_object``).
"""

import pytest

pytestmark = pytest.mark.anyio


# A minimal but valid MP4 header (ftyp box at offset 4) — passes the magic
# byte validator used by the legacy /upload path.
VALID_MP4_HEADER = b"\x00\x00\x00\x1cftypisom\x00\x00\x02\x00mp41"
# A minimal valid WebM/MKV header (EBML).
VALID_WEBM_HEADER = b"\x1a\x45\xdf\xa3\x93\x42\x86\x81\x01\x42\xf7\x81"
# A QuickTime/MOV header (ftyp box, qt brand).
VALID_MOV_HEADER = b"\x00\x00\x00\x14ftypqt  \x00\x00\x00\x00moov"
# Bytes that are NOT any allowed media format.
HTML_BYTES = b"<!DOCTYPE html><html><head><title>not a video</title>"

CLAIMED_SIZE = 10 * 1024 * 1024  # 10 MB — what the client told us at upload-url time
MAX_BYTES = 500 * 1024 * 1024    # MAX_FILE_SIZE_MB (500) in bytes


async def _make_uploading_video(client, mock_s3, file_size=CLAIMED_SIZE):
    """Create a project + video and leave it in the 'uploading' state.

    Returns the video_id. Does NOT call confirm-upload, so the row is still
    'uploading' and ready for the validation tests to drive.
    """
    r = await client.post("/api/projects/", json={"name": "Test Project"})
    assert r.status_code == 201
    project_id = r.json()["id"]

    mock_s3.generate_upload_url.return_value = "https://fake-upload-url"
    upload = await client.post(
        f"/api/videos/{project_id}/upload-url",
        json={"filename": "test.mp4", "file_size": file_size, "content_type": "video/mp4"},
    )
    assert upload.status_code == 200
    return upload.json()["video_id"]


def _range_body(header: bytes):
    """Build a get_object-style return where Body.read() yields ``header``."""
    from unittest.mock import MagicMock

    body = MagicMock()
    body.read.return_value = header
    return {"Body": body, "ContentLength": len(header)}


# ---------------------------------------------------------------------------
# H1: ContentLength exceeds the absolute MAX_FILE_SIZE_MB ceiling
# ---------------------------------------------------------------------------


async def test_confirm_rejects_object_over_max_file_size(client, mock_s3):
    """An R2 object larger than MAX_FILE_SIZE_MB is rejected at confirm,
    even though the client claimed a small size when it got the URL."""
    video_id = await _make_uploading_video(client, mock_s3)

    # R2 actually holds an object far above the 500 MB ceiling.
    mock_s3.head_object.return_value = {"ContentLength": MAX_BYTES + 1}
    # Magic bytes would pass — prove the size gate fires first / independently.
    mock_s3.get_object_range.return_value = VALID_MP4_HEADER

    response = await client.post(f"/api/videos/{video_id}/confirm-upload")

    assert response.status_code == 413
    detail = response.json()["detail"].lower()
    assert "too large" in detail or "maximum" in detail

    # Row driven to error (not left stuck in 'uploading').
    got = await client.get(f"/api/videos/{video_id}")
    assert got.json()["status"] == "error"

    # Offending object cleaned up from R2.
    mock_s3.delete_video.assert_called_once()


# ---------------------------------------------------------------------------
# H2: ContentLength wildly exceeds the size the client claimed
# ---------------------------------------------------------------------------


async def test_confirm_rejects_object_far_over_claimed_size(client, mock_s3):
    """Client claimed 10 MB but actually PUT ~50 MB. Even though that is under
    the absolute ceiling, it blows the claimed-size tolerance envelope and is
    rejected — this is the lever an attacker uses to bypass the upload-url
    size check (which only saw the claimed size)."""
    video_id = await _make_uploading_video(client, mock_s3, file_size=CLAIMED_SIZE)

    # 5x the claimed size — well over any reasonable slack, well under 500 MB.
    mock_s3.head_object.return_value = {"ContentLength": CLAIMED_SIZE * 5}
    mock_s3.get_object_range.return_value = VALID_MP4_HEADER

    response = await client.post(f"/api/videos/{video_id}/confirm-upload")

    assert response.status_code in (400, 413)
    detail = response.json()["detail"].lower()
    assert "size" in detail or "large" in detail or "exceed" in detail

    got = await client.get(f"/api/videos/{video_id}")
    assert got.json()["status"] == "error"
    mock_s3.delete_video.assert_called_once()


async def test_confirm_allows_size_within_envelope_slack(client, mock_s3):
    """A small overage (within tolerance, e.g. container/metadata overhead) is
    allowed — the envelope must not reject legitimate uploads that land a few
    percent over the JS-reported File.size."""
    video_id = await _make_uploading_video(client, mock_s3, file_size=CLAIMED_SIZE)

    # 5% over claimed — inside the slack window, must pass.
    mock_s3.head_object.return_value = {"ContentLength": int(CLAIMED_SIZE * 1.05)}
    mock_s3.get_object_range.return_value = VALID_MP4_HEADER

    response = await client.post(f"/api/videos/{video_id}/confirm-upload")

    assert response.status_code == 200
    assert response.json()["status"] == "uploaded"
    mock_s3.delete_video.assert_not_called()


# ---------------------------------------------------------------------------
# H3: first bytes fail magic-byte validation
# ---------------------------------------------------------------------------


async def test_confirm_rejects_non_media_magic_bytes(client, mock_s3):
    """The object is the right size but its first bytes are HTML, not a media
    container. Reject + clean up — this blocks XSS/malware smuggling under a
    video content-type."""
    video_id = await _make_uploading_video(client, mock_s3)

    mock_s3.head_object.return_value = {"ContentLength": CLAIMED_SIZE}
    mock_s3.get_object_range.return_value = HTML_BYTES

    response = await client.post(f"/api/videos/{video_id}/confirm-upload")

    assert response.status_code == 400
    detail = response.json()["detail"].lower()
    assert "valid media" in detail or "content" in detail

    got = await client.get(f"/api/videos/{video_id}")
    assert got.json()["status"] == "error"
    mock_s3.delete_video.assert_called_once()


# ---------------------------------------------------------------------------
# Magic-byte allowlist: legitimate formats must NOT be false-negatives
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "header",
    [VALID_MP4_HEADER, VALID_WEBM_HEADER, VALID_MOV_HEADER],
    ids=["mp4", "webm", "mov"],
)
async def test_confirm_accepts_legitimate_media_formats(client, mock_s3, header):
    """webm/mov/mp4 variants in the allowlist must pass the confirm-time
    magic-byte validator (guards against false negatives breaking real users)."""
    video_id = await _make_uploading_video(client, mock_s3)

    mock_s3.head_object.return_value = {"ContentLength": CLAIMED_SIZE}
    mock_s3.get_object_range.return_value = header

    response = await client.post(f"/api/videos/{video_id}/confirm-upload")

    assert response.status_code == 200
    assert response.json()["status"] == "uploaded"
    mock_s3.delete_video.assert_not_called()


# ---------------------------------------------------------------------------
# Happy path unchanged + idempotent re-confirm still works
# ---------------------------------------------------------------------------


async def test_confirm_happy_path_then_idempotent_reconfirm(client, mock_s3):
    """A valid upload confirms once, and a second confirm-upload (the
    frontend's false-negative recovery probe) is still a 200 no-op. The new
    validation must not break idempotency."""
    video_id = await _make_uploading_video(client, mock_s3)

    mock_s3.head_object.return_value = {"ContentLength": CLAIMED_SIZE}
    mock_s3.get_object_range.return_value = VALID_MP4_HEADER

    first = await client.post(f"/api/videos/{video_id}/confirm-upload")
    assert first.status_code == 200
    assert first.json()["status"] == "uploaded"

    second = await client.post(f"/api/videos/{video_id}/confirm-upload")
    assert second.status_code == 200
    assert second.json()["status"] == "uploaded"

    mock_s3.delete_video.assert_not_called()


async def test_confirm_empty_object_still_rejected(client, mock_s3):
    """Existing behaviour: a 0-byte object is rejected. Must remain green."""
    video_id = await _make_uploading_video(client, mock_s3)

    mock_s3.head_object.return_value = {"ContentLength": 0}

    response = await client.post(f"/api/videos/{video_id}/confirm-upload")
    assert response.status_code == 400
    assert "empty" in response.json()["detail"].lower()


async def test_confirm_missing_object_still_rejected(client, mock_s3):
    """Existing behaviour: head_object raising (object absent) -> 400."""
    video_id = await _make_uploading_video(client, mock_s3)

    mock_s3.head_object.side_effect = Exception("404 Not Found")

    response = await client.post(f"/api/videos/{video_id}/confirm-upload")
    assert response.status_code == 400
    assert "not found" in response.json()["detail"].lower() or "complete" in response.json()["detail"].lower()


# ---------------------------------------------------------------------------
# Shared magic-byte validator: legacy path and confirm path agree
# ---------------------------------------------------------------------------


def test_shared_magic_byte_validator_extracted_and_consistent():
    """The magic-byte check must live in ONE shared function, used by both
    the legacy /upload path and the confirm-upload path (no duplication)."""
    from app.services.media_validation import is_valid_media_header

    # Allowlisted formats pass.
    assert is_valid_media_header(VALID_MP4_HEADER)
    assert is_valid_media_header(VALID_WEBM_HEADER)
    assert is_valid_media_header(VALID_MOV_HEADER)
    assert is_valid_media_header(b"RIFF\x00\x00\x00\x00AVI LIST")     # AVI
    assert is_valid_media_header(b"RIFF\x00\x00\x00\x00WAVEfmt ")     # WAV
    assert is_valid_media_header(b"ID3\x03\x00\x00\x00\x00\x00\x00")  # MP3 ID3
    assert is_valid_media_header(b"\xff\xfb\x90\x00\x00\x00\x00\x00")  # MP3 frame sync
    assert is_valid_media_header(b"OggS\x00\x02\x00\x00\x00\x00\x00")  # OGG
    assert is_valid_media_header(b"fLaC\x00\x00\x00\x22\x00\x00\x00")  # FLAC

    # Non-media rejected.
    assert not is_valid_media_header(HTML_BYTES)
    assert not is_valid_media_header(b"%PDF-1.7\n%abc")
    assert not is_valid_media_header(b"")           # empty
    assert not is_valid_media_header(b"\x00\x01")    # too short
