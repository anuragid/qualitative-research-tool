"""Pydantic schemas for request/response validation."""

import re
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

# Matches Unicode control characters except tab (\x09), newline (\x0a), carriage return (\x0d)
_CONTROL_CHAR_RE = re.compile(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]')

# Matches HTML/script tags that could enable XSS if rendered in a browser
_HTML_TAG_RE = re.compile(r'<[^>]+>')


def _strip_control_chars(v: str) -> str:
    """Remove Unicode control characters and HTML tags for XSS prevention."""
    v = _CONTROL_CHAR_RE.sub('', v)
    v = _HTML_TAG_RE.sub('', v)
    return v

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


class BalanceInfoResponse(BaseModel):
    """Pydantic mirror of BalanceInfo.as_dict() — shape locked by
    docs/byok-balance-contract.md. Frontend imports the matching TS
    interface from frontend/src/types/api.ts."""
    total_credits: float
    total_usage: float
    balance_remaining: float
    is_free_tier: bool
    key_label: str
    key_limit: Optional[float] = None
    key_limit_remaining: Optional[float] = None
    has_credits: bool
    checked_at: datetime
    stale: bool


class UserSettingsResponse(BaseModel):
    """Schema for user settings response."""
    preferred_model: Optional[str] = None
    model_tier: str = "included"
    has_api_key: bool = False
    key_hint: Optional[str] = None
    key_validated_at: Optional[datetime] = None
    available_models: List[Dict[str, str]] = []
    # BYOK balance snapshot. None when the user has no key or we have
    # never successfully fetched their balance. Stale=True when the
    # last refresh failed but we still have a cached value to show.
    balance: Optional[BalanceInfoResponse] = None


class ApiKeyAddRequest(BaseModel):
    """Schema for POST /api/users/settings/api-key.

    Sole purpose: add or replace the user's BYOK key. Validation +
    balance check happen server-side; this schema only enforces shape.
    """
    api_key: str = Field(..., min_length=10, max_length=500)

    @field_validator("api_key")
    @classmethod
    def validate_api_key(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("API key cannot be blank or whitespace-only")
        return v


class PreferredModelUpdateRequest(BaseModel):
    """Schema for PUT /api/users/settings/preferred-model.

    Sets the active model and tier. Tier enforcement is in the route
    (included tier → model must be in STANDARD_MODEL_IDS; byok tier →
    user must have an API key with credits).
    """
    preferred_model: str = Field(..., min_length=1, max_length=255)
    model_tier: str = Field(..., min_length=1, max_length=10)

    @field_validator("preferred_model")
    @classmethod
    def validate_preferred_model(cls, v: str) -> str:
        v = _strip_control_chars(v).strip()
        if not v:
            raise ValueError("Model ID cannot be blank")
        # Model IDs follow the format "provider/model-name"
        if not re.match(r'^[a-zA-Z0-9_\-]+/[a-zA-Z0-9._\-:]+$', v):
            raise ValueError(
                "Invalid model ID format. Expected format: provider/model-name"
            )
        return v

    @field_validator("model_tier")
    @classmethod
    def validate_model_tier(cls, v: str) -> str:
        v = v.strip().lower()
        if v not in ("included", "byok"):
            raise ValueError("model_tier must be 'included' or 'byok'")
        return v


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

_VALID_SPEAKER_ROLES = {"Interviewer", "Participant"}


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
            if v not in _VALID_SPEAKER_ROLES:
                raise ValueError(f"Invalid role. Must be one of: {', '.join(sorted(_VALID_SPEAKER_ROLES))}")
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
            if v not in _VALID_SPEAKER_ROLES:
                raise ValueError(f"Invalid role. Must be one of: {', '.join(sorted(_VALID_SPEAKER_ROLES))}")
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

class VideoAnalysisStatusEmbed(BaseModel):
    """Lightweight analysis status for embedding in list responses.

    Contains only the status/step tracking fields — NOT the 5 JSONB blobs
    (chunks, inferences, patterns, insights, design_principles).  Used
    wherever the list endpoints embed analysis info so polled responses stay
    small (~200 bytes per video instead of 50–500 KB).

    Full blob payload is available via ``GET /api/videos/{id}/analysis``.
    See ``VideoAnalysisResponse`` for the full schema.
    """
    model_config = ConfigDict(from_attributes=True)

    # Optional when status == "not_started" -- no row exists yet.
    id: Optional[UUID] = None
    video_id: UUID
    status: str
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None

    # Step-by-step tracking fields
    current_step: Optional[str] = None
    step_status: Optional[Dict[str, str]] = None
    chunk_completed_at: Optional[datetime] = None
    infer_completed_at: Optional[datetime] = None
    relate_completed_at: Optional[datetime] = None
    explain_completed_at: Optional[datetime] = None
    activate_completed_at: Optional[datetime] = None


class VideoListItemResponse(VideoBase):
    """Lightweight video shape for list endpoints (no analysis JSONB blobs).

    Use this instead of ``VideoResponse`` in list/polling endpoints
    (list_projects, get_project, list_project_videos).  Full analysis
    payload is only fetched via ``GET /api/videos/{id}/analysis``.
    """
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    project_id: UUID
    file_size_bytes: Optional[int] = None
    duration_seconds: Optional[int] = None
    uploaded_at: datetime
    status: str
    error_message: Optional[str] = None
    analysis: Optional[VideoAnalysisStatusEmbed] = Field(
        default=None, validation_alias="video_analysis"
    )


class VideoStatusStub(BaseModel):
    """Absolute minimum video shape for the projects *list* endpoint.

    Only the three fields the projects-list UI actually reads:
    * ``id``         — React key + thumbnail slot identity
    * ``status``     — FolderStatusIcon state machine + polling gate
    * ``uploaded_at`` — sort key for "3 most-recent" thumbnail ordering

    No ``analysis`` embed, no file metadata.  This lets ``list_projects``
    skip the JOIN to ``video_analyses`` entirely (zero JSONB reads vs. the
    status-cols-only embed that still required joining that table).

    Deploy-window tolerance: ``.passthrough()`` so an old backend that sends
    extra fields (e.g. ``filename``, ``analysis``) doesn't fail schema
    validation on the frontend during the rollout window.
    """
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    status: str
    uploaded_at: datetime


class ProjectListResponse(ProjectBase):
    """Lightweight project shape for list endpoints.

    ``videos`` is now a ``List[VideoStatusStub]`` — the three columns the
    projects-list UI actually needs (id, status, uploaded_at).  The
    ``list_projects`` route uses a single outerjoin against the ``videos``
    table only; ``video_analyses`` is not touched at all.

    Deploy-window tolerance: ``VideoStatusStub`` uses ``.passthrough()``
    and ``videos`` is optional, so an old backend response carrying full
    ``VideoListItemResponse`` objects continues to validate without error.
    """
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    status: str
    error_message: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    videos: Optional[List["VideoStatusStub"]] = []


class VideoAnalysisResponse(BaseModel):
    """Schema for video analysis response.

    ``id`` and the step tracking fields are Optional so the same schema can
    model the "not_started" sentinel payload emitted when the parent video
    exists but no ``video_analyses`` row has been created yet.  See
    ``app.routes.videos.get_video_analysis`` for the producer side and
    ``backend/tests/test_videos_routes_analysis_not_started.py`` for the
    contract lock.
    """
    model_config = ConfigDict(from_attributes=True)

    # Optional when status == "not_started" -- no row exists yet.
    id: Optional[UUID] = None
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
    current_step: Optional[str] = None
    step_status: Optional[Dict[str, str]] = None
    chunk_completed_at: Optional[datetime] = None
    infer_completed_at: Optional[datetime] = None
    relate_completed_at: Optional[datetime] = None
    explain_completed_at: Optional[datetime] = None
    activate_completed_at: Optional[datetime] = None


# ========== Project Analysis Schemas ==========

class ProjectAnalysisResponse(BaseModel):
    """Schema for project analysis response.

    Same story as ``VideoAnalysisResponse`` — ``id`` is Optional so the
    schema models the "not_started" sentinel.  ``video_ids`` defaults to
    an empty list for the same reason.
    """
    model_config = ConfigDict(from_attributes=True)

    id: Optional[UUID] = None
    project_id: UUID
    video_ids: List[UUID] = []
    cross_video_patterns: Optional[List[Dict[str, Any]]] = None
    cross_video_insights: Optional[List[Dict[str, Any]]] = None
    cross_video_principles: Optional[List[Dict[str, Any]]] = None
    status: str
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None



# Rebuild models to resolve forward references
ProjectResponse.model_rebuild()
ProjectListResponse.model_rebuild()

# VideoStatusStub has no forward references, but keep symmetry
VideoStatusStub.model_rebuild()
