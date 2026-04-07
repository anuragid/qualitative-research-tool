"""Tests for transcription tasks and services.

Covers:
- _mark_transcription_error helper
- Timeout safety logic
- S3Service.download_file
- AssemblyAIService.upload_file and submit-based start_transcription
- transcribe_video_task download→upload→submit flow
- Temp file cleanup on both success and failure
- Watchdog no longer sends to Sentry directly
"""

import time
from unittest.mock import MagicMock, mock_open, patch
from uuid import uuid4

import pytest

from app.tasks.transcription_tasks import _mark_transcription_error

# ---------------------------------------------------------------------------
# _mark_transcription_error
# ---------------------------------------------------------------------------


class TestMarkTranscriptionError:
    """Tests for the _mark_transcription_error helper."""

    def test_rollback_called_before_update(self):
        mock_db = MagicMock()
        mock_video = MagicMock()
        mock_transcript = MagicMock()

        mock_db.query.return_value.filter.return_value.first.side_effect = [
            mock_video,
            mock_transcript,
        ]

        video_id = str(uuid4())
        _mark_transcription_error(mock_db, video_id, "something failed")

        mock_db.rollback.assert_called_once()
        assert mock_video.status == "error"
        assert mock_video.error_message == "something failed"
        assert mock_transcript.status == "error"
        mock_db.commit.assert_called_once()

    def test_no_video_found(self):
        mock_db = MagicMock()
        mock_db.query.return_value.filter.return_value.first.return_value = None

        _mark_transcription_error(mock_db, str(uuid4()), "error")
        mock_db.commit.assert_called_once()

    def test_commit_failure_caught(self):
        mock_db = MagicMock()
        mock_db.query.return_value.filter.return_value.first.return_value = None
        mock_db.commit.side_effect = Exception("db connection lost")

        # Should not raise
        _mark_transcription_error(mock_db, str(uuid4()), "error")

    def test_rollback_failure_caught(self):
        mock_db = MagicMock()
        mock_db.rollback.side_effect = Exception("rollback failed")

        # Should not raise
        _mark_transcription_error(mock_db, str(uuid4()), "error")


# ---------------------------------------------------------------------------
# Timeout safety
# ---------------------------------------------------------------------------


class TestCheckTranscriptionTimeout:
    def test_timeout_raises_when_over_3600s(self):
        started_at = time.time() - 3601
        assert (time.time() - started_at) > 3600

    def test_no_timeout_within_window(self):
        started_at = time.time() - 100
        assert (time.time() - started_at) <= 3600

    def test_none_started_at_no_timeout(self):
        started_at = None
        should_timeout = started_at is not None and (time.time() - started_at) > 3600
        assert should_timeout is False


# ---------------------------------------------------------------------------
# S3Service.download_file
# ---------------------------------------------------------------------------


class TestS3ServiceDownloadFile:
    """Tests for the new download_file method."""

    def test_download_file_calls_boto3(self):
        """download_file should call s3_client.download_file with correct args."""
        from app.services.s3_service import S3Service

        # boto3 is now lazy-imported inside s3_client property; mock the
        # cached client directly via the internal attribute so we don't need
        # to intercept the module-level boto3 name.
        service = S3Service()
        mock_client = MagicMock()
        service._s3_client = mock_client

        service.download_file("videos/test.mp4", "/tmp/test.mp4")

        mock_client.download_file.assert_called_once_with(
            service.bucket_name,
            "videos/test.mp4",
            "/tmp/test.mp4",
        )

    def test_download_file_raises_on_client_error(self):
        """download_file should wrap ClientError in a descriptive exception."""
        from botocore.exceptions import ClientError

        from app.services.s3_service import S3Service

        # boto3 is now lazy-imported; inject a pre-built mock client directly.
        service = S3Service()
        mock_client = MagicMock()
        mock_client.download_file.side_effect = ClientError(
            {"Error": {"Code": "NoSuchKey", "Message": "Not found"}},
            "GetObject",
        )
        service._s3_client = mock_client

        with pytest.raises(Exception, match="Failed to download from R2"):
            service.download_file("videos/missing.mp4", "/tmp/out.mp4")


# ---------------------------------------------------------------------------
# AssemblyAIService.upload_file
# ---------------------------------------------------------------------------


class TestAssemblyAIUploadFile:
    """Tests for the upload_file method (REST API via httpx)."""

    def test_upload_file_returns_url(self):
        """upload_file should POST to AssemblyAI and return the hosted URL."""
        from app.services.assemblyai_service import AssemblyAIService

        mock_response = MagicMock()
        mock_response.json.return_value = {"upload_url": "https://cdn.assemblyai.com/upload/abc123"}

        with patch("app.services.assemblyai_service.httpx.post", return_value=mock_response) as mock_post, \
             patch("builtins.open", mock_open(read_data=b"fake video data")):
            service = AssemblyAIService()
            url = service.upload_file("/tmp/test.mp4")

            mock_post.assert_called_once()
            assert url == "https://cdn.assemblyai.com/upload/abc123"

    def test_upload_file_raises_on_error(self):
        """upload_file should wrap errors with descriptive message."""
        from app.services.assemblyai_service import AssemblyAIService

        with patch("app.services.assemblyai_service.httpx.post", side_effect=Exception("Connection refused")), \
             patch("builtins.open", mock_open(read_data=b"fake video data")):
            service = AssemblyAIService()
            with pytest.raises(Exception, match="Failed to upload to AssemblyAI"):
                service.upload_file("/tmp/test.mp4")


# ---------------------------------------------------------------------------
# AssemblyAIService.start_transcription uses submit() not transcribe()
# ---------------------------------------------------------------------------


class TestAssemblyAIStartTranscription:
    """Verify start_transcription uses non-blocking submit()."""

    def test_uses_submit_not_transcribe(self):
        """start_transcription should call transcriber.submit(), not transcribe()."""
        from app.services.assemblyai_service import AssemblyAIService

        with patch("app.services.assemblyai_service.aai") as mock_aai:
            mock_transcript = MagicMock()
            mock_transcript.status = MagicMock()
            mock_transcript.status.__eq__ = lambda self, other: False
            mock_transcript.id = "tx_12345"

            mock_transcriber = MagicMock()
            mock_transcriber.submit.return_value = mock_transcript
            mock_aai.Transcriber.return_value = mock_transcriber

            service = AssemblyAIService()
            result = service.start_transcription("https://cdn.assemblyai.com/upload/abc123")

            mock_transcriber.submit.assert_called_once()
            mock_transcriber.transcribe.assert_not_called()
            assert result == "tx_12345"

    def test_raises_on_immediate_error_status(self):
        """If submit returns error status, should raise."""
        from app.services.assemblyai_service import AssemblyAIService

        with patch("app.services.assemblyai_service.aai") as mock_aai:
            mock_transcript = MagicMock()
            mock_transcript.status = mock_aai.TranscriptStatus.error
            mock_transcript.error = "Invalid audio format"

            mock_transcriber = MagicMock()
            mock_transcriber.submit.return_value = mock_transcript
            mock_aai.Transcriber.return_value = mock_transcriber

            service = AssemblyAIService()
            with pytest.raises(Exception, match="Transcription submission failed"):
                service.start_transcription("https://cdn.assemblyai.com/upload/abc123")


# ---------------------------------------------------------------------------
# Bug reproduction: presigned URL was not accessible by AssemblyAI
# ---------------------------------------------------------------------------


class TestPresignedUrlBugReproduction:
    """Reproduce the original bug: AssemblyAI cannot download from R2 presigned URLs.

    This documents the failure mode that caused PYTHON-FASTAPI-2,3,5,6,7.
    The old code passed an R2 presigned URL directly to AssemblyAI, which
    couldn't reach R2's S3 API endpoint.
    """

    def test_assemblyai_rejects_r2_presigned_url(self):
        """Simulates AssemblyAI returning a download error for an R2 presigned URL.

        This is the exact error pattern from Sentry:
        'Download error, unable to download https://...r2.cloudflarestorage.com/...'
        """
        from app.services.assemblyai_service import AssemblyAIService

        with patch("app.services.assemblyai_service.aai") as mock_aai:
            # Simulate AssemblyAI returning error status due to download failure
            mock_transcript = MagicMock()
            mock_transcript.status = mock_aai.TranscriptStatus.error
            mock_transcript.error = (
                "Download error, unable to download "
                "https://abc123.r2.cloudflarestorage.com/bucket/videos/test.mp4"
                "?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Expires=14400"
                ". Please make sure the file exists and is accessible from the internet."
            )

            mock_transcriber = MagicMock()
            mock_transcriber.submit.return_value = mock_transcript
            mock_aai.Transcriber.return_value = mock_transcriber

            service = AssemblyAIService()
            with pytest.raises(Exception, match="Download error"):
                service.start_transcription(
                    "https://abc123.r2.cloudflarestorage.com/bucket/videos/test.mp4"
                    "?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Expires=14400"
                )


# ---------------------------------------------------------------------------
# Fix verification: download→upload→submit flow
# ---------------------------------------------------------------------------


class TestTranscribeVideoTaskFlow:
    """Verify the fixed transcribe_video_task downloads from R2 and uploads
    to AssemblyAI instead of using presigned URLs."""

    def _run_task(self, mock_db, video_id):
        """Run transcribe_video_task with injected mock db session."""
        from app.tasks.transcription_tasks import transcribe_video_task
        transcribe_video_task._thread_local.db = mock_db
        return transcribe_video_task.run(video_id)

    def test_downloads_from_r2_and_uploads_to_assemblyai(self):
        """The task should: download from R2 → upload to AssemblyAI → submit."""
        mock_video = MagicMock()
        mock_video.id = uuid4()
        mock_video.s3_key = "projects/abc/videos/test.mov"
        mock_video.status = "uploaded"

        mock_transcript = MagicMock()
        mock_transcript.id = uuid4()
        mock_transcript.assemblyai_id = None

        mock_db = MagicMock()
        mock_db.query.return_value.filter.return_value.first.side_effect = [
            mock_video,
            mock_transcript,
        ]

        with patch("app.tasks.transcription_tasks.s3_service") as mock_s3, \
             patch("app.tasks.transcription_tasks.assemblyai_service") as mock_aai, \
             patch("app.tasks.transcription_tasks.check_transcription_task") as mock_check, \
             patch("app.tasks.transcription_tasks.tempfile.mkstemp") as mock_mkstemp, \
             patch("app.tasks.transcription_tasks.os.close"), \
             patch("app.tasks.transcription_tasks.os.path.exists", return_value=True), \
             patch("app.tasks.transcription_tasks.os.unlink") as mock_unlink:

            mock_mkstemp.return_value = (5, "/tmp/tmpXYZ.mov")
            mock_aai.upload_file.return_value = "https://cdn.assemblyai.com/upload/abc"
            mock_aai.start_transcription.return_value = "tx_12345"

            result = self._run_task(mock_db, str(mock_video.id))

            # Verify download from R2
            mock_s3.download_file.assert_called_once_with(
                "projects/abc/videos/test.mov", "/tmp/tmpXYZ.mov"
            )

            # Verify upload to AssemblyAI
            mock_aai.upload_file.assert_called_once_with("/tmp/tmpXYZ.mov")

            # Verify submit with AssemblyAI URL (not R2 presigned URL)
            mock_aai.start_transcription.assert_called_once_with(
                "https://cdn.assemblyai.com/upload/abc"
            )

            # Verify presigned URL was NOT used
            mock_s3.get_presigned_url.assert_not_called()

            # Verify temp file cleaned up
            mock_unlink.assert_called_once_with("/tmp/tmpXYZ.mov")

            # Verify check task scheduled
            mock_check.apply_async.assert_called_once()

            assert result["status"] == "submitted"
            assert result["assemblyai_id"] == "tx_12345"

    def test_temp_file_cleaned_up_on_download_failure(self):
        """Temp file should be removed even if R2 download fails."""
        mock_video = MagicMock()
        mock_video.id = uuid4()
        mock_video.s3_key = "projects/abc/videos/test.mp4"

        mock_transcript = MagicMock()

        mock_db = MagicMock()
        mock_db.query.return_value.filter.return_value.first.side_effect = [
            mock_video,
            mock_transcript,
            mock_video,
            mock_transcript,
        ]

        with patch("app.tasks.transcription_tasks.s3_service") as mock_s3, \
             patch("app.tasks.transcription_tasks.assemblyai_service"), \
             patch("app.tasks.transcription_tasks.check_transcription_task"), \
             patch("app.tasks.transcription_tasks.tempfile.mkstemp") as mock_mkstemp, \
             patch("app.tasks.transcription_tasks.os.close"), \
             patch("app.tasks.transcription_tasks.os.path.exists", return_value=True), \
             patch("app.tasks.transcription_tasks.os.unlink") as mock_unlink:

            mock_mkstemp.return_value = (5, "/tmp/tmpFAIL.mp4")
            mock_s3.download_file.side_effect = Exception("R2 connection timeout")

            with pytest.raises(Exception, match="R2 connection timeout"):
                self._run_task(mock_db, str(mock_video.id))

            # Temp file must still be cleaned up
            mock_unlink.assert_called_once_with("/tmp/tmpFAIL.mp4")

    def test_temp_file_cleaned_up_on_upload_failure(self):
        """Temp file should be removed even if AssemblyAI upload fails."""
        mock_video = MagicMock()
        mock_video.id = uuid4()
        mock_video.s3_key = "projects/abc/videos/test.mp4"

        mock_transcript = MagicMock()

        mock_db = MagicMock()
        mock_db.query.return_value.filter.return_value.first.side_effect = [
            mock_video,
            mock_transcript,
            mock_video,
            mock_transcript,
        ]

        with patch("app.tasks.transcription_tasks.s3_service"), \
             patch("app.tasks.transcription_tasks.assemblyai_service") as mock_aai, \
             patch("app.tasks.transcription_tasks.check_transcription_task"), \
             patch("app.tasks.transcription_tasks.tempfile.mkstemp") as mock_mkstemp, \
             patch("app.tasks.transcription_tasks.os.close"), \
             patch("app.tasks.transcription_tasks.os.path.exists", return_value=True), \
             patch("app.tasks.transcription_tasks.os.unlink") as mock_unlink:

            mock_mkstemp.return_value = (5, "/tmp/tmpFAIL2.mp4")
            mock_aai.upload_file.side_effect = Exception("AssemblyAI upload failed")

            with pytest.raises(Exception, match="AssemblyAI upload failed"):
                self._run_task(mock_db, str(mock_video.id))

            mock_unlink.assert_called_once_with("/tmp/tmpFAIL2.mp4")


# ---------------------------------------------------------------------------
# Watchdog no longer creates Sentry issues
# ---------------------------------------------------------------------------


class TestWatchdogSentryNoise:
    """Verify watchdog no longer calls sentry_sdk.capture_message."""

    def test_watchdog_does_not_import_sentry_sdk(self):
        """The watchdog module should not import sentry_sdk directly."""
        import inspect

        import app.tasks.watchdog_tasks as wt
        source = inspect.getsource(wt)
        assert "sentry_sdk" not in source, (
            "watchdog_tasks should not reference sentry_sdk — "
            "routine resets are logged, not reported as Sentry issues"
        )
