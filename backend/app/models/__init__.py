"""Models package exports."""

from app.models.database_models import (
    Project,
    Video,
    Transcript,
    SpeakerLabel,
    VideoAnalysis,
    ProjectAnalysis,
)

from app.models.schemas import (
    ProjectCreate,
    ProjectUpdate,
    ProjectResponse,
    VideoUploadResponse,
    VideoResponse,
    TranscriptResponse,
    SpeakerLabelCreate,
    SpeakerLabelUpdate,
    SpeakerLabelResponse,
    VideoAnalysisResponse,
    ProjectAnalysisCreate,
    ProjectAnalysisResponse,
    TaskStatus,
    ErrorResponse,
)

__all__ = [
    # Database Models
    "Project",
    "Video",
    "Transcript",
    "SpeakerLabel",
    "VideoAnalysis",
    "ProjectAnalysis",
    # Schemas
    "ProjectCreate",
    "ProjectUpdate",
    "ProjectResponse",
    "VideoUploadResponse",
    "VideoResponse",
    "TranscriptResponse",
    "SpeakerLabelCreate",
    "SpeakerLabelUpdate",
    "SpeakerLabelResponse",
    "VideoAnalysisResponse",
    "ProjectAnalysisCreate",
    "ProjectAnalysisResponse",
    "TaskStatus",
    "ErrorResponse",
]
