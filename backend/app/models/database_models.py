"""SQLAlchemy database models."""

from sqlalchemy import Column, String, Integer, Text, DateTime, ForeignKey, ARRAY, Boolean, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import uuid

from app.database import Base


class User(Base):
    """User account linked to Clerk authentication with RBAC."""

    __tablename__ = "users"

    id = Column(String(255), primary_key=True)  # Clerk user ID (user_xxx format)
    email = Column(String(255))  # Nullable since Clerk JWT may not include email
    first_name = Column(String(255))
    last_name = Column(String(255))
    username = Column(String(255))
    role = Column(String(50), nullable=False, default="user")  # admin, user, viewer
    preferred_model = Column(String(255))  # OpenRouter model ID for BYOK
    encrypted_api_key = Column(Text)  # Fernet-encrypted OpenRouter API key
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    last_seen = Column(DateTime(timezone=True))

    @property
    def has_api_key(self) -> bool:
        return bool(self.encrypted_api_key)

    # Relationships
    projects = relationship("Project", back_populates="user", cascade="all, delete-orphan")


class Project(Base):
    """Research project containing multiple videos."""

    __tablename__ = "projects"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(String(255), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(255), nullable=False)
    description = Column(Text)
    status = Column(String(50), default="planning")  # planning, ready, processing, completed, archived, error
    error_message = Column(Text)  # For error state details
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relationships
    user = relationship("User", back_populates="projects")
    videos = relationship("Video", back_populates="project", cascade="all, delete-orphan")
    project_analyses = relationship("ProjectAnalysis", back_populates="project", cascade="all, delete-orphan")


class Video(Base):
    """Uploaded video file."""

    __tablename__ = "videos"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    filename = Column(String(255), nullable=False)
    s3_key = Column(Text, nullable=False)
    s3_url = Column(Text, nullable=False)
    file_size_bytes = Column(Integer)
    duration_seconds = Column(Integer)
    uploaded_at = Column(DateTime(timezone=True), server_default=func.now())
    status = Column(String(50), default="uploaded")  # uploaded, transcribing, transcribed, analyzing, analyzed, error
    error_message = Column(Text)

    # Relationships
    project = relationship("Project", back_populates="videos")
    transcript = relationship("Transcript", back_populates="video", uselist=False, cascade="all, delete-orphan")
    video_analysis = relationship("VideoAnalysis", back_populates="video", uselist=False, cascade="all, delete-orphan")


class Transcript(Base):
    """Transcription from AssemblyAI."""

    __tablename__ = "transcripts"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    video_id = Column(UUID(as_uuid=True), ForeignKey("videos.id", ondelete="CASCADE"), nullable=False)
    assemblyai_id = Column(String(255), unique=True)
    raw_transcript = Column(JSONB)  # Full response from AssemblyAI
    processed_transcript = Column(JSONB)  # Cleaned/formatted transcript
    status = Column(String(50), default="pending")  # pending, processing, completed, error
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    video = relationship("Video", back_populates="transcript")
    speaker_labels = relationship("SpeakerLabel", back_populates="transcript", cascade="all, delete-orphan")


class SpeakerLabel(Base):
    """User-assigned speaker names and roles."""

    __tablename__ = "speaker_labels"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    transcript_id = Column(UUID(as_uuid=True), ForeignKey("transcripts.id", ondelete="CASCADE"), nullable=False)
    speaker_label = Column(String(50), nullable=False)  # "Speaker A", "Speaker B", etc.
    assigned_name = Column(String(255))  # User-assigned name
    role = Column(String(100))  # User-assigned role (e.g., "Interviewer", "Participant")

    # Relationships
    transcript = relationship("Transcript", back_populates="speaker_labels")


class VideoAnalysis(Base):
    """Analysis results for a single video (5-step process)."""

    __tablename__ = "video_analyses"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    video_id = Column(UUID(as_uuid=True), ForeignKey("videos.id", ondelete="CASCADE"), nullable=False)
    chunks = Column(JSONB)  # Step 1: List of chunks
    inferences = Column(JSONB)  # Step 2: List of inferences per chunk
    patterns = Column(JSONB)  # Step 3: List of patterns
    insights = Column(JSONB)  # Step 4: List of insights
    design_principles = Column(JSONB)  # Step 5: List of design principles
    status = Column(String(50), default="pending")  # pending, processing, completed, error
    started_at = Column(DateTime(timezone=True))
    completed_at = Column(DateTime(timezone=True))

    # Step-by-step tracking fields
    current_step = Column(String(50), default="chunk")  # chunk, infer, relate, explain, activate
    step_status = Column(JSONB, default={})  # {"chunk": "completed", "infer": "processing", ...}

    # Individual step timestamps
    chunk_completed_at = Column(DateTime(timezone=True))
    infer_completed_at = Column(DateTime(timezone=True))
    relate_completed_at = Column(DateTime(timezone=True))
    explain_completed_at = Column(DateTime(timezone=True))
    activate_completed_at = Column(DateTime(timezone=True))

    # Relationships
    video = relationship("Video", back_populates="video_analysis")


class ProjectAnalysis(Base):
    """Cross-video analysis synthesizing multiple videos."""

    __tablename__ = "project_analyses"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    video_ids = Column(ARRAY(UUID(as_uuid=True)), nullable=False)  # List of video UUIDs included
    cross_video_patterns = Column(JSONB)  # Meta-patterns across videos
    cross_video_insights = Column(JSONB)  # Cross-video insights
    cross_video_principles = Column(JSONB)  # System-level design principles
    status = Column(String(50), default="pending")  # pending, processing, completed, error
    started_at = Column(DateTime(timezone=True))
    completed_at = Column(DateTime(timezone=True))

    # Relationships
    project = relationship("Project", back_populates="project_analyses")
