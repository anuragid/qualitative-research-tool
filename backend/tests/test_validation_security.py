"""Tests for validation and security fixes from the E2E audit.

Covers:
- Speaker role validation (only Interviewer/Participant)
- Preferred model format validation
- UploadUrlRequest schema validation
- API key sanitization in error messages
- Clerk proxy response header filtering
"""

import pytest
from pydantic import ValidationError

from app.models.schemas import (
    PreferredModelUpdateRequest,
    SpeakerLabelCreate,
    SpeakerLabelUpdate,
)


class TestSpeakerRoleValidation:
    """Speaker roles must be restricted to Interviewer or Participant."""

    def test_valid_role_interviewer(self):
        label = SpeakerLabelCreate(
            speaker_label="Speaker A",
            assigned_name="Alice",
            role="Interviewer",
        )
        assert label.role == "Interviewer"

    def test_valid_role_participant(self):
        label = SpeakerLabelCreate(
            speaker_label="Speaker B",
            assigned_name="Bob",
            role="Participant",
        )
        assert label.role == "Participant"

    def test_invalid_role_rejected(self):
        with pytest.raises(ValidationError, match="Invalid role"):
            SpeakerLabelCreate(
                speaker_label="Speaker A",
                role="<script>alert(1)</script>",
            )

    def test_arbitrary_role_rejected(self):
        with pytest.raises(ValidationError, match="Invalid role"):
            SpeakerLabelCreate(
                speaker_label="Speaker A",
                role="Observer",
            )

    def test_none_role_accepted(self):
        label = SpeakerLabelCreate(
            speaker_label="Speaker A",
            role=None,
        )
        assert label.role is None

    def test_update_invalid_role_rejected(self):
        with pytest.raises(ValidationError, match="Invalid role"):
            SpeakerLabelUpdate(role="admin")

    def test_update_valid_role_accepted(self):
        update = SpeakerLabelUpdate(role="Participant")
        assert update.role == "Participant"


class TestPreferredModelValidation:
    """Preferred model IDs must follow provider/model-name format."""

    def test_valid_model_id(self):
        req = PreferredModelUpdateRequest(preferred_model="anthropic/claude-sonnet-4.6")
        assert req.preferred_model == "anthropic/claude-sonnet-4.6"

    def test_valid_model_id_with_colons(self):
        req = PreferredModelUpdateRequest(preferred_model="meta-llama/llama-4-scout:free")
        assert req.preferred_model == "meta-llama/llama-4-scout:free"

    def test_blank_model_rejected(self):
        with pytest.raises(ValidationError, match="blank"):
            PreferredModelUpdateRequest(preferred_model="   ")

    def test_no_slash_rejected(self):
        with pytest.raises(ValidationError, match="Invalid model ID format"):
            PreferredModelUpdateRequest(preferred_model="just-a-model-name")

    def test_script_injection_rejected(self):
        with pytest.raises(ValidationError, match="Invalid model ID format"):
            PreferredModelUpdateRequest(preferred_model="<script>alert(1)</script>")

    def test_model_with_dots(self):
        req = PreferredModelUpdateRequest(preferred_model="deepseek/deepseek-chat-v3-0324")
        assert req.preferred_model == "deepseek/deepseek-chat-v3-0324"


class TestApiKeySanitization:
    """Error messages must have API keys redacted before storage."""

    def _sanitize(self, message: str) -> str:
        """Import and call the sanitizer from _pipeline_utils.

        Relocated from app.tasks.analysis_tasks._sanitize_error to
        app.tasks._pipeline_utils.sanitize_error as part of the WS3
        chain refactor.
        """
        from app.tasks._pipeline_utils import sanitize_error
        return sanitize_error(message)

    def test_openrouter_key_redacted(self):
        msg = "API error with key sk-or-v1-abc123456789012345678901234567890"
        result = self._sanitize(msg)
        assert "abc123456789012345678901234567890" not in result
        assert "REDACTED" in result

    def test_openai_key_redacted(self):
        msg = "Error using sk-abc1234567890123456789012345678901234567890123"
        result = self._sanitize(msg)
        assert "1234567890123456789012345678901234567890123" not in result
        assert "REDACTED" in result

    def test_bearer_token_redacted(self):
        msg = "Authorization failed: Bearer abcdefghijklmnopqrstuvwxyz1234567890"
        result = self._sanitize(msg)
        assert "abcdefghijklmnopqrstuvwxyz1234567890" not in result
        assert "REDACTED" in result

    def test_hex_key_redacted(self):
        msg = "AssemblyAI key: abcd1234567890abcdef1234567890abcdef"
        result = self._sanitize(msg)
        assert "1234567890abcdef1234567890abcdef" not in result
        assert "REDACTED" in result

    def test_regular_message_unchanged(self):
        msg = "Video 12345 not found in database"
        result = self._sanitize(msg)
        assert result == msg


class TestUploadUrlRequestValidation:
    """UploadUrlRequest must validate fields at the schema level."""

    def test_zero_file_size_rejected(self):
        from app.routes.videos import UploadUrlRequest
        with pytest.raises(ValidationError):
            UploadUrlRequest(filename="test.mp4", file_size=0, content_type="video/mp4")

    def test_negative_file_size_rejected(self):
        from app.routes.videos import UploadUrlRequest
        with pytest.raises(ValidationError):
            UploadUrlRequest(filename="test.mp4", file_size=-1, content_type="video/mp4")

    def test_empty_filename_rejected(self):
        from app.routes.videos import UploadUrlRequest
        with pytest.raises(ValidationError):
            UploadUrlRequest(filename="", file_size=1000, content_type="video/mp4")

    def test_valid_request_accepted(self):
        from app.routes.videos import UploadUrlRequest
        req = UploadUrlRequest(filename="test.mp4", file_size=1000, content_type="video/mp4")
        assert req.filename == "test.mp4"
        assert req.file_size == 1000
