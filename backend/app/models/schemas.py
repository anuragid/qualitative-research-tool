"""Pydantic schemas for request/response validation."""

from pydantic import BaseModel, ConfigDict, Field, field_validator
from typing import Optional, List, Dict, Any
from datetime import datetime
from uuid import UUID


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
    api_key: Optional[str] = Field(default=None, max_length=500)  # Raw key, will be encrypted before storage


class UserSettingsResponse(BaseModel):
    """Schema for user settings response."""
    preferred_model: Optional[str] = None
    has_api_key: bool = False
    available_models: List[Dict[str, str]] = []


# ========== Project Schemas ==========

_VALID_PROJECT_STATUSES = {"planning", "ready", "processing", "completed", "archived", "error"}


class ProjectBase(BaseModel):
    """Base project schema."""
    name: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = Field(default=None, max_length=2000)
    status: Optional[str] = "planning"

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
    description: Optional[str] = Field(default=None, max_length=2000)
    status: Optional[str] = None

    @field_validator("status")
    @classmethod
    def validate_status(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v not in _VALID_PROJECT_STATUSES:
            raise ValueError(f"Invalid status. Must be one of: {', '.join(sorted(_VALID_PROJECT_STATUSES))}")
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


class VideoUploadResponse(BaseModel):
    """Schema for video upload response."""
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    project_id: UUID
    filename: str
    s3_key: str
    s3_url: str
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
    s3_key: str
    s3_url: str
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
    assigned_name: Optional[str] = Field(default=None, max_length=255)
    role: Optional[str] = Field(default=None, max_length=100)


class SpeakerLabelUpdate(BaseModel):
    """Schema for updating speaker label."""
    assigned_name: Optional[str] = Field(default=None, max_length=255)
    role: Optional[str] = Field(default=None, max_length=100)


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
    step_status: Optional[Dict[str, str]] = {}
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
