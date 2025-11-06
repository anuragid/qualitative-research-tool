"""Pydantic schemas for request/response validation."""

from pydantic import BaseModel, ConfigDict
from typing import Optional, List, Dict, Any
from datetime import datetime
from uuid import UUID


# ========== Project Schemas ==========

class ProjectBase(BaseModel):
    """Base project schema."""
    name: str
    description: Optional[str] = None


class ProjectCreate(ProjectBase):
    """Schema for creating a project."""
    pass


class ProjectUpdate(BaseModel):
    """Schema for updating a project."""
    name: Optional[str] = None
    description: Optional[str] = None


class ProjectResponse(ProjectBase):
    """Schema for project response."""
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    created_at: datetime
    updated_at: datetime


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
    speaker_label: str
    assigned_name: Optional[str] = None
    role: Optional[str] = None


class SpeakerLabelUpdate(BaseModel):
    """Schema for updating speaker label."""
    assigned_name: Optional[str] = None
    role: Optional[str] = None


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


# ========== Project Analysis Schemas ==========

class ProjectAnalysisCreate(BaseModel):
    """Schema for creating project analysis."""
    video_ids: List[UUID]


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


# ========== Task Status Schemas ==========

class TaskStatus(BaseModel):
    """Schema for task status."""
    task_id: str
    status: str  # pending, processing, completed, error
    progress: Optional[int] = None  # 0-100
    message: Optional[str] = None
    result: Optional[Dict[str, Any]] = None


# ========== Error Response Schema ==========

class ErrorResponse(BaseModel):
    """Schema for error responses."""
    error: str
    detail: Optional[str] = None
    status_code: int
