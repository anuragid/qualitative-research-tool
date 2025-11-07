"""SQLAlchemy database models."""

from sqlalchemy import Column, String, Integer, Text, DateTime, ForeignKey, ARRAY
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import uuid

from app.database import Base


class Project(Base):
    """Research project containing multiple videos."""

    __tablename__ = "projects"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(255), nullable=False)
    description = Column(Text)
    status = Column(String(50), default="active")  # active, archived
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relationships
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
