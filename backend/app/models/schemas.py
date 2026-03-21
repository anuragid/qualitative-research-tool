"""Pydantic schemas for request/response validation."""

import re
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

# Matches Unicode control characters except tab (\x09), newline (\x0a), carriage return (\x0d)
_CONTROL_CHAR_RE = re.compile(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]')


def _strip_control_chars(v: str) -> str:
    """Remove Unicode control characters (except tab, newline, carriage return)."""
    return _CONTROL_CHAR_RE.sub('', v)

# ========== User Schemas ==========

class UserResponse(BaseModel):
    """Schema for user response."""
    model_config = ConfigDict(from_attributes=True)

    id: str
    email: Optional[str] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    username: Optional[str] = None
    preferred_model: Optional[str] = None
    has_api_key: bool = False  # Computed from User.has_api_key property
    created_at: datetime
    updated_at: datetime
    last_seen: Optional[datetime] = None


class UserSettingsUpdate(BaseModel):
    """Schema for updating user LLM settings."""
    preferred_model: Optional[str] = Field(default=None, max_length=255)
    api_key: Optional[str] = Field(default=None, min_length=10, max_length=500)  # Raw key, will be encrypted before storage

    @field_validator("api_key")
    @classmethod
    def validate_api_key(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and not v.strip():
            raise ValueError("API key cannot be blank or whitespace-only")
        return v

    @field_validator("preferred_model")
    @classmethod
    def validate_preferred_model(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            v = _strip_control_chars(v)
        return v


class UserSettingsResponse(BaseModel):
    """Schema for user settings response."""
    preferred_model: Optional[str] = None
    has_api_key: bool = False
    key_hint: Optional[str] = None
    key_validated_at: Optional[datetime] = None
    available_models: List[Dict[str, str]] = []


# ========== Project Schemas ==========

_VALID_PROJECT_STATUSES = {"planning", "ready", "processing", "completed", "archived", "error"}


class ProjectBase(BaseModel):
    """Base project schema."""
    name: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = Field(default=None, max_length=5000)
    status: Optional[str] = "planning"

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Project name cannot be blank")
        return _strip_control_chars(v)

    @field_validator("description")
    @classmethod
    def validate_description(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            v = _strip_control_chars(v)
        return v

    @field_validator("status")
    @classmethod
    def validate_status(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v not in _VALID_PROJECT_STATUSES:
            raise ValueError(f"Invalid status. Must be one of: {', '.join(sorted(_VALID_PROJECT_STATUSES))}")
        return v


class ProjectCreate(ProjectBase):
    """Schema for creating a project."""
    pass


class ProjectUpdate(BaseModel):
    """Schema for updating a project."""
    name: Optional[str] = Field(default=None, min_length=1, max_length=255)
    description: Optional[str] = Field(default=None, max_length=5000)

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            v = v.strip()
            if not v:
                raise ValueError("Project name cannot be blank")
            v = _strip_control_chars(v)
        return v

    @field_validator("description")
    @classmethod
    def validate_description(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            v = _strip_control_chars(v)
        return v


class ProjectResponse(ProjectBase):
    """Schema for project response."""
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    status: str
    error_message: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    videos: Optional[List["VideoResponse"]] = []


# ========== Video Schemas ==========

class VideoBase(BaseModel):
    """Base video schema."""
    filename: str

    @field_validator("filename")
    @classmethod
    def validate_filename(cls, v: str) -> str:
        if len(v) > 255:
            ext = Path(v).suffix
            v = v[:255 - len(ext)] + ext
        return v


class VideoUploadResponse(BaseModel):
    """Schema for video upload response."""
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    project_id: UUID
    filename: str
    file_size_bytes: Optional[int] = None
    duration_seconds: Optional[int] = None
    uploaded_at: datetime
    status: str
    error_message: Optional[str] = None


class VideoResponse(VideoBase):
    """Schema for video response."""
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    project_id: UUID
    file_size_bytes: Optional[int] = None
    duration_seconds: Optional[int] = None
    uploaded_at: datetime
    status: str
    error_message: Optional[str] = None
    analysis: Optional["VideoAnalysisResponse"] = Field(default=None, validation_alias="video_analysis")


# ========== Transcript Schemas ==========

class TranscriptResponse(BaseModel):
    """Schema for transcript response."""
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    video_id: UUID
    assemblyai_id: Optional[str] = None
    raw_transcript: Optional[Dict[str, Any]] = None
    processed_transcript: Optional[Dict[str, Any]] = None
    status: str
    created_at: datetime


# ========== Speaker Label Schemas ==========

class SpeakerLabelCreate(BaseModel):
    """Schema for creating speaker label."""
    speaker_label: str = Field(..., min_length=1, max_length=50)
    assigned_name: Optional[str] = Field(default=None, max_length=100)
    role: Optional[str] = Field(default=None, max_length=100)

    @field_validator("speaker_label")
    @classmethod
    def validate_speaker_label(cls, v: str) -> str:
        return _strip_control_chars(v)

    @field_validator("assigned_name")
    @classmethod
    def validate_assigned_name(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            v = _strip_control_chars(v)
        return v

    @field_validator("role")
    @classmethod
    def validate_role(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            v = _strip_control_chars(v)
        return v


class SpeakerLabelUpdate(BaseModel):
    """Schema for updating speaker label."""
    assigned_name: Optional[str] = Field(default=None, max_length=100)
    role: Optional[str] = Field(default=None, max_length=100)

    @field_validator("assigned_name")
    @classmethod
    def validate_assigned_name(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            v = _strip_control_chars(v)
        return v

    @field_validator("role")
    @classmethod
    def validate_role(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            v = _strip_control_chars(v)
        return v


class SpeakerLabelResponse(BaseModel):
    """Schema for speaker label response."""
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    transcript_id: UUID
    speaker_label: str
    assigned_name: Optional[str] = None
    role: Optional[str] = None


# ========== Video Analysis Schemas ==========

class VideoAnalysisResponse(BaseModel):
    """Schema for video analysis response."""
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    video_id: UUID
    chunks: Optional[List[Dict[str, Any]]] = None
    inferences: Optional[List[Dict[str, Any]]] = None
    patterns: Optional[List[Dict[str, Any]]] = None
    insights: Optional[List[Dict[str, Any]]] = None
    design_principles: Optional[List[Dict[str, Any]]] = None
    status: str
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None

    # Step-by-step tracking fields
    current_step: Optional[str] = "chunk"
    step_status: Optional[Dict[str, str]] = None
    chunk_completed_at: Optional[datetime] = None
    infer_completed_at: Optional[datetime] = None
    relate_completed_at: Optional[datetime] = None
    explain_completed_at: Optional[datetime] = None
    activate_completed_at: Optional[datetime] = None


# ========== Project Analysis Schemas ==========

class ProjectAnalysisResponse(BaseModel):
    """Schema for project analysis response."""
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    project_id: UUID
    video_ids: List[UUID]
    cross_video_patterns: Optional[List[Dict[str, Any]]] = None
    cross_video_insights: Optional[List[Dict[str, Any]]] = None
    cross_video_principles: Optional[List[Dict[str, Any]]] = None
    status: str
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None



# Rebuild models to resolve forward references
ProjectResponse.model_rebuild()
