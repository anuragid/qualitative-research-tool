"""Tests for Pydantic schema validators.

Covers findings: P2-2, P2-3, P2-6, P2-10, P3-4, P4-4, P4-5
"""

import pytest
from pydantic import ValidationError

from app.models.schemas import (
    ProjectCreate,
    ProjectUpdate,
    UserSettingsUpdate,
    VideoBase,
    VideoResponse,
    VideoUploadResponse,
)


class TestProjectSchemas:
    def test_blank_name_rejected(self):
        """P3-4: Blank project names should be rejected."""
        with pytest.raises(ValidationError):
            ProjectCreate(name="   ", description="test")

    def test_empty_name_rejected(self):
        """P3-4: Empty project names should be rejected."""
        with pytest.raises(ValidationError):
            ProjectCreate(name="", description="test")

    def test_name_strips_whitespace(self):
        """P3-4: Project names should be stripped of leading/trailing whitespace."""
        project = ProjectCreate(name="  My Project  ", description="test")
        assert project.name == "My Project"

    def test_control_chars_stripped_from_name(self):
        """P2-10: Control characters should be stripped from names."""
        project = ProjectCreate(name="Test\x00Project\x07", description="test")
        assert "\x00" not in project.name
        assert "\x07" not in project.name
        assert "TestProject" == project.name

    def test_control_chars_stripped_from_description(self):
        """P2-10: Control characters should be stripped from description."""
        project = ProjectCreate(name="Test", description="Desc\x00ription\x1f")
        assert "\x00" not in project.description
        assert "\x1f" not in project.description
        assert project.description == "Description"

    def test_tabs_and_newlines_preserved(self):
        """P2-10: Tabs and newlines should NOT be stripped (they are legitimate)."""
        project = ProjectCreate(name="Test", description="Line1\nLine2\tTabbed")
        assert "\n" in project.description
        assert "\t" in project.description

    def test_update_has_no_status_field(self):
        """P2-2: ProjectUpdate should not have a status field (prevents client-side status mutation)."""
        assert "status" not in ProjectUpdate.model_fields
        update = ProjectUpdate(name="New Name")
        assert not hasattr(update, "status") or "status" not in update.model_fields

    def test_update_blank_name_rejected(self):
        """P3-4: Blank names in update should be rejected."""
        with pytest.raises(ValidationError):
            ProjectUpdate(name="   ")

    def test_update_none_name_accepted(self):
        """ProjectUpdate with no name (partial update) should be fine."""
        update = ProjectUpdate(description="Updated desc")
        assert update.name is None

    def test_name_max_length(self):
        """Name exceeding max_length should be rejected."""
        with pytest.raises(ValidationError):
            ProjectCreate(name="a" * 256, description="test")

    def test_description_max_length(self):
        """Description exceeding max_length should be rejected."""
        with pytest.raises(ValidationError):
            ProjectCreate(name="Test", description="a" * 2001)


class TestUserSettingsSchemas:
    def test_short_api_key_rejected(self):
        """P2-3: API keys shorter than 10 chars should be rejected."""
        with pytest.raises(ValidationError):
            UserSettingsUpdate(api_key="short")

    def test_whitespace_api_key_rejected(self):
        """P2-3: Whitespace-only API keys should be rejected."""
        with pytest.raises(ValidationError):
            UserSettingsUpdate(api_key="          ")  # 10 spaces

    def test_valid_api_key_accepted(self):
        """Valid API key should pass validation."""
        settings = UserSettingsUpdate(api_key="sk-or-v1-1234567890")
        assert settings.api_key == "sk-or-v1-1234567890"

    def test_none_api_key_accepted(self):
        """None API key (not updating) should be accepted."""
        settings = UserSettingsUpdate(api_key=None)
        assert settings.api_key is None

    def test_api_key_max_length(self):
        """API key exceeding max_length should be rejected."""
        with pytest.raises(ValidationError):
            UserSettingsUpdate(api_key="a" * 501)


class TestVideoSchemas:
    def test_s3_fields_absent_from_response(self):
        """P2-6: VideoResponse should not contain s3_key or s3_url."""
        assert "s3_key" not in VideoResponse.model_fields
        assert "s3_url" not in VideoResponse.model_fields

    def test_s3_fields_absent_from_upload_response(self):
        """P2-6: VideoUploadResponse should not contain s3_key or s3_url."""
        assert "s3_key" not in VideoUploadResponse.model_fields
        assert "s3_url" not in VideoUploadResponse.model_fields

    def test_long_filename_truncated(self):
        """P4-4: Filenames longer than 255 chars should be truncated."""
        long_name = "a" * 300 + ".mp4"
        video = VideoBase(filename=long_name)
        assert len(video.filename) <= 255
        assert video.filename.endswith(".mp4")

    def test_short_filename_unchanged(self):
        """Short filenames should pass through unchanged."""
        video = VideoBase(filename="my_video.mp4")
        assert video.filename == "my_video.mp4"

    def test_null_bytes_stripped_in_name(self):
        """P4-5: Null bytes should be stripped via P2-10 control char removal."""
        project = ProjectCreate(name="Test\x00Name", description="test")
        assert "\x00" not in project.name
        assert project.name == "TestName"

    def test_null_bytes_stripped_in_description(self):
        """P4-5: Null bytes in descriptions should also be stripped."""
        project = ProjectCreate(name="Test", description="Desc\x00ription")
        assert "\x00" not in project.description
