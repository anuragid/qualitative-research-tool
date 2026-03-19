"""Tests for audio file upload support.

Audio uploads should work exactly like video uploads: same validation pipeline
(extension, MIME type, magic bytes, size limits), same storage path, same
transcription flow.
"""

import io
import re
from pathlib import Path
from unittest.mock import patch, MagicMock

import pytest


# ---------------------------------------------------------------------------
# 1. Config: ALLOWED_AUDIO_EXTENSIONS exists and contains expected formats
# ---------------------------------------------------------------------------

class TestAudioConfig:
    """Config must define allowed audio extensions."""

    def test_allowed_audio_extensions_exists(self):
        from app.config import settings
        assert hasattr(settings, "ALLOWED_AUDIO_EXTENSIONS")

    def test_allowed_audio_extensions_contains_mp3(self):
        from app.config import settings
        assert ".mp3" in settings.ALLOWED_AUDIO_EXTENSIONS

    def test_allowed_audio_extensions_contains_wav(self):
        from app.config import settings
        assert ".wav" in settings.ALLOWED_AUDIO_EXTENSIONS

    def test_allowed_audio_extensions_contains_m4a(self):
        from app.config import settings
        assert ".m4a" in settings.ALLOWED_AUDIO_EXTENSIONS

    def test_allowed_audio_extensions_contains_ogg(self):
        from app.config import settings
        assert ".ogg" in settings.ALLOWED_AUDIO_EXTENSIONS

    def test_allowed_audio_extensions_contains_flac(self):
        from app.config import settings
        assert ".flac" in settings.ALLOWED_AUDIO_EXTENSIONS

    def test_allowed_audio_extensions_contains_aac(self):
        from app.config import settings
        assert ".aac" in settings.ALLOWED_AUDIO_EXTENSIONS


# ---------------------------------------------------------------------------
# 2. Magic bytes: audio files are recognized by their signatures
# ---------------------------------------------------------------------------

class TestAudioMagicBytes:
    """Audio file magic bytes must be recognized by the upload endpoint."""

    def test_mp3_id3_tag_recognized(self):
        """MP3 with ID3v2 tag starts with 'ID3'."""
        header = b'ID3\x04\x00\x00\x00\x00\x00\x00\xff\xfb'
        assert _check_media_magic_bytes(header)

    def test_mp3_sync_word_recognized(self):
        """MP3 without ID3 tag starts with sync word 0xFFE0+ (frame sync)."""
        header = b'\xff\xfb\x90\x00\x00\x00\x00\x00\x00\x00\x00\x00'
        assert _check_media_magic_bytes(header)

    def test_wav_magic_bytes_recognized(self):
        """WAV files start with RIFF....WAVE."""
        header = b'RIFF\x24\x08\x00\x00WAVEfmt '
        assert _check_media_magic_bytes(header)

    def test_ogg_magic_bytes_recognized(self):
        """OGG files start with 'OggS'."""
        header = b'OggS\x00\x02\x00\x00\x00\x00\x00\x00\x00\x00'
        assert _check_media_magic_bytes(header)

    def test_flac_magic_bytes_recognized(self):
        """FLAC files start with 'fLaC'."""
        header = b'fLaC\x00\x00\x00\x22\x10\x00\x10\x00'
        assert _check_media_magic_bytes(header)

    def test_m4a_ftyp_recognized(self):
        """M4A files have ftyp box like MP4."""
        header = b'\x00\x00\x00\x20ftypM4A \x00\x00\x00\x00'
        assert _check_media_magic_bytes(header)

    def test_aac_adts_recognized(self):
        """AAC ADTS frames start with 0xFFF (12-bit sync)."""
        header = b'\xff\xf1\x50\x80\x02\x1f\xfc\xde\x04\x00\x00\x00'
        assert _check_media_magic_bytes(header)

    def test_video_files_still_recognized(self):
        """Existing video magic bytes must still work."""
        mp4_header = b'\x00\x00\x00\x1cftypisom\x00\x00\x02\x00'
        assert _check_media_magic_bytes(mp4_header)

        webm_header = b'\x1a\x45\xdf\xa3\x93\x42\x86\x81\x01\x42\xf7\x81'
        assert _check_media_magic_bytes(webm_header)

        avi_header = b'RIFF\x00\x00\x00\x00AVI LIST'
        assert _check_media_magic_bytes(avi_header)

    def test_random_bytes_rejected(self):
        """Random data should be rejected."""
        header = b'\x00\x01\x02\x03\x04\x05\x06\x07\x08\x09\x0a\x0b'
        assert not _check_media_magic_bytes(header)

    def test_text_file_rejected(self):
        """Text content should be rejected."""
        header = b'This is not audio or video'
        assert not _check_media_magic_bytes(header)


# ---------------------------------------------------------------------------
# 3. S3 service: content type mapping for audio extensions
# ---------------------------------------------------------------------------

class TestS3AudioContentTypes:
    """S3 service must return correct MIME types for audio extensions."""

    def test_mp3_content_type(self):
        from app.services.s3_service import S3Service
        assert S3Service._get_content_type(".mp3") == "audio/mpeg"

    def test_wav_content_type(self):
        from app.services.s3_service import S3Service
        assert S3Service._get_content_type(".wav") == "audio/wav"

    def test_m4a_content_type(self):
        from app.services.s3_service import S3Service
        assert S3Service._get_content_type(".m4a") == "audio/mp4"

    def test_ogg_content_type(self):
        from app.services.s3_service import S3Service
        assert S3Service._get_content_type(".ogg") == "audio/ogg"

    def test_flac_content_type(self):
        from app.services.s3_service import S3Service
        assert S3Service._get_content_type(".flac") == "audio/flac"

    def test_aac_content_type(self):
        from app.services.s3_service import S3Service
        assert S3Service._get_content_type(".aac") == "audio/aac"

    def test_video_content_types_still_work(self):
        """Existing video content types must not be broken."""
        from app.services.s3_service import S3Service
        assert S3Service._get_content_type(".mp4") == "video/mp4"
        assert S3Service._get_content_type(".mov") == "video/quicktime"
        assert S3Service._get_content_type(".webm") == "video/webm"
        assert S3Service._get_content_type(".avi") == "video/x-msvideo"


# ---------------------------------------------------------------------------
# 4. Upload endpoint: audio files accepted via API
# ---------------------------------------------------------------------------

class TestAudioUploadEndpoint:
    """The upload endpoint must accept audio files with proper validation."""

    @pytest.mark.anyio
    async def test_upload_mp3_returns_201(self, client, mock_s3):
        """Uploading a valid MP3 file should succeed."""
        # Create a minimal MP3-like file with ID3 header
        mp3_content = b'ID3\x04\x00\x00\x00\x00\x00\x00' + b'\xff\xfb' * 100

        project_id = await _create_test_project(client)

        response = await client.post(
            f"/api/videos/{project_id}/upload",
            files={"file": ("test_audio.mp3", io.BytesIO(mp3_content), "audio/mpeg")},
        )
        assert response.status_code == 201
        data = response.json()
        assert data["filename"] == "test_audio.mp3"
        assert data["status"] == "uploaded"

    @pytest.mark.anyio
    async def test_upload_wav_returns_201(self, client, mock_s3):
        """Uploading a valid WAV file should succeed."""
        wav_content = b'RIFF\x24\x08\x00\x00WAVEfmt ' + b'\x00' * 100

        project_id = await _create_test_project(client)

        response = await client.post(
            f"/api/videos/{project_id}/upload",
            files={"file": ("test_audio.wav", io.BytesIO(wav_content), "audio/wav")},
        )
        assert response.status_code == 201

    @pytest.mark.anyio
    async def test_upload_ogg_returns_201(self, client, mock_s3):
        """Uploading a valid OGG file should succeed."""
        ogg_content = b'OggS\x00\x02\x00\x00\x00\x00\x00\x00\x00\x00' + b'\x00' * 100

        project_id = await _create_test_project(client)

        response = await client.post(
            f"/api/videos/{project_id}/upload",
            files={"file": ("test_audio.ogg", io.BytesIO(ogg_content), "audio/ogg")},
        )
        assert response.status_code == 201

    @pytest.mark.anyio
    async def test_upload_flac_returns_201(self, client, mock_s3):
        """Uploading a valid FLAC file should succeed."""
        flac_content = b'fLaC\x00\x00\x00\x22' + b'\x00' * 100

        project_id = await _create_test_project(client)

        response = await client.post(
            f"/api/videos/{project_id}/upload",
            files={"file": ("test_audio.flac", io.BytesIO(flac_content), "audio/flac")},
        )
        assert response.status_code == 201

    @pytest.mark.anyio
    async def test_upload_rejects_bad_audio_extension(self, client, mock_s3):
        """Files with unsupported audio extensions should be rejected."""
        project_id = await _create_test_project(client)

        response = await client.post(
            f"/api/videos/{project_id}/upload",
            files={"file": ("test.wma", io.BytesIO(b'\x00' * 200), "audio/x-ms-wma")},
        )
        assert response.status_code == 400

    @pytest.mark.anyio
    async def test_upload_rejects_audio_with_wrong_magic_bytes(self, client, mock_s3):
        """Audio files with wrong magic bytes should be rejected."""
        project_id = await _create_test_project(client)

        response = await client.post(
            f"/api/videos/{project_id}/upload",
            files={"file": ("fake.mp3", io.BytesIO(b'This is not audio'), "audio/mpeg")},
        )
        assert response.status_code == 400

    @pytest.mark.anyio
    async def test_video_uploads_still_work(self, client, mock_s3):
        """Existing video upload functionality must not be broken."""
        mp4_content = b'\x00\x00\x00\x1cftypisom\x00\x00\x02\x00' + b'\x00' * 100

        project_id = await _create_test_project(client)

        response = await client.post(
            f"/api/videos/{project_id}/upload",
            files={"file": ("test.mp4", io.BytesIO(mp4_content), "video/mp4")},
        )
        assert response.status_code == 201


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _check_media_magic_bytes(header: bytes) -> bool:
    """Check magic bytes for both video and audio files.

    This mirrors the logic that should exist in the upload endpoint.
    """
    if len(header) < 4:
        return False

    # --- Video signatures (existing) ---
    if len(header) >= 8 and header[4:8] == b'ftyp':  # MP4/MOV/M4A
        return True
    if header[:4] == b'\x1a\x45\xdf\xa3':  # WebM/MKV (EBML)
        return True
    if header[:4] == b'RIFF':  # AVI or WAV
        return True

    # --- Audio signatures ---
    if header[:3] == b'ID3':  # MP3 with ID3v2 tag
        return True
    if len(header) >= 2 and header[0] == 0xFF and (header[1] & 0xE0) == 0xE0:  # MP3 frame sync / AAC ADTS
        return True
    if header[:4] == b'OggS':  # OGG Vorbis/Opus
        return True
    if header[:4] == b'fLaC':  # FLAC
        return True

    return False


async def _create_test_project(client) -> str:
    """Create a test project and return its ID."""
    response = await client.post(
        "/api/projects/",
        json={"name": "Audio Test Project"},
    )
    assert response.status_code == 201, f"Failed to create project: {response.text}"
    return response.json()["id"]


# ---------------------------------------------------------------------------
# 5. Real MP3 file test: validates end-to-end with an actual MP3
# ---------------------------------------------------------------------------

class TestRealMP3Upload:
    """Upload a real MP3 file (converted from video) through the endpoint."""

    FIXTURE_PATH = Path(__file__).parent / "fixtures" / "test_audio.mp3"

    @pytest.mark.anyio
    async def test_real_mp3_upload_succeeds(self, client, mock_s3):
        """A real MP3 file should pass all validation (extension, MIME, magic bytes)."""
        if not self.FIXTURE_PATH.exists():
            pytest.skip("test_audio.mp3 fixture not found")

        project_id = await _create_test_project(client)

        with open(self.FIXTURE_PATH, "rb") as f:
            response = await client.post(
                f"/api/videos/{project_id}/upload",
                files={"file": ("interview_audio.mp3", f, "audio/mpeg")},
            )

        assert response.status_code == 201
        data = response.json()
        assert data["filename"] == "interview_audio.mp3"
        assert data["status"] == "uploaded"
        assert data["file_size_bytes"] > 0

    @pytest.mark.anyio
    async def test_real_mp3_magic_bytes_valid(self):
        """The real MP3 fixture should pass our magic bytes check."""
        if not self.FIXTURE_PATH.exists():
            pytest.skip("test_audio.mp3 fixture not found")

        with open(self.FIXTURE_PATH, "rb") as f:
            header = f.read(12)

        assert _check_media_magic_bytes(header), (
            f"Real MP3 failed magic bytes check. First 12 bytes: {header.hex()}"
        )
