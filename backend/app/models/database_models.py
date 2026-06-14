"""SQLAlchemy database models."""

import uuid

from sqlalchemy import (
    ARRAY,
    Boolean,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy import Enum as SQLEnum
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func, text

from app.database import Base

# Import directly from the leaf module (``app.state.statuses``) instead of
# ``app.state`` — the package ``__init__.py`` imports the state machines,
# which in turn import from this very module, creating a cycle at
# application import time.
from app.state.statuses import (
    ProjectStatus,
    TranscriptStatus,
    VideoAnalysisStatus,
    VideoStatus,
)


def _enum_values(enum_cls):
    """``values_callable`` for ``SQLEnum`` — returns the list of string values
    to use in the underlying VARCHAR column (with ``native_enum=False``).

    This keeps the on-disk representation identical to the pre-enum code
    (plain strings) while getting Python-side validation on every write.
    """
    return [m.value for m in enum_cls]


class User(Base):
    """User account linked to Clerk authentication with RBAC."""

    __tablename__ = "users"

    # The DB (migration ``add_user_auth_001``) has THREE distinct objects on
    # these columns, declared via ``__table_args__`` below so autogenerate
    # matches them exactly (named constraints, non-unique index):
    #   - ``users_email_key``    UNIQUE constraint on email
    #   - ``users_username_key`` UNIQUE constraint on username
    #   - ``ix_users_email``     plain (non-unique) btree index on email
    # NOTE: do NOT put ``unique=True`` on the columns — that emits an *unnamed*
    # unique constraint AND turns ``ix_users_email`` into a UNIQUE index, both
    # of which diverge from the live schema.
    __table_args__ = (
        UniqueConstraint("email", name="users_email_key"),
        UniqueConstraint("username", name="users_username_key"),
    )

    id = Column(String(255), primary_key=True)  # Clerk user ID (user_xxx format)
    # NOT NULL enforced in the DB by ``add_user_auth_001``; ``index=True`` maps
    # to the non-unique ``ix_users_email`` index.
    email = Column(String(255), nullable=False, index=True)  # Indexed for lookup
    first_name = Column(String(255))
    last_name = Column(String(255))
    username = Column(String(255))  # uniqueness via users_username_key (above)
    role = Column(String(50), nullable=False, default="user")  # admin, user, viewer
    preferred_model = Column(String(255))  # OpenRouter model ID for BYOK
    model_tier = Column(String(10), nullable=False, server_default="included")  # "included" or "byok"
    encrypted_api_key = Column(Text)  # Fernet-encrypted OpenRouter API key
    key_hint = Column(String(8))  # Last 4 chars of plaintext key
    key_validated_at = Column(DateTime(timezone=True))  # Last successful validation

    # BYOK balance snapshot — refreshed on key save, on /refresh-balance, and on
    # cache miss (TTL `BALANCE_CACHE_TTL_SECONDS`). All nullable so existing rows
    # without a refreshed balance keep working — see migration
    # `add_byok_balance_columns`.
    key_total_credits = Column(Float)  # /credits.data.total_credits
    key_total_usage = Column(Float)  # /credits.data.total_usage
    key_limit = Column(Float)  # /auth/key.data.limit (nullable upstream too)
    key_limit_remaining = Column(Float)  # /auth/key.data.limit_remaining (nullable upstream too)
    key_is_free_tier = Column(Boolean)  # /auth/key.data.is_free_tier
    key_balance_checked_at = Column(DateTime(timezone=True))  # Last successful refresh
    key_balance_error = Column(String(255))  # Last refresh error, NULL when healthy

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
    user_id = Column(String(255), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(255), nullable=False)
    description = Column(Text)
    # Status enforced at the SQLAlchemy layer by ProjectStatus.  ``native_enum=False``
    # keeps the on-disk type as VARCHAR so existing rows and the Alembic chain
    # stay compatible — see docs/production-readiness/prs/pr22-state-machine-enums.md.
    # NOT NULL + server_default enforced in the DB by migrations
    # ``d484f4320746`` / ``208ec29c043f``. The model must declare nullable=False
    # so autogenerate does not try to DROP the NOT NULL constraint.
    status = Column(
        SQLEnum(
            ProjectStatus,
            native_enum=False,
            values_callable=_enum_values,
            length=50,
        ),
        nullable=False,
        server_default=ProjectStatus.PLANNING.value,
        default=ProjectStatus.PLANNING.value,
        index=True,
    )
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
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    filename = Column(String(255), nullable=False)
    s3_key = Column(Text, nullable=False)
    s3_url = Column(Text, nullable=False)
    file_size_bytes = Column(Integer)
    duration_seconds = Column(Integer)
    uploaded_at = Column(DateTime(timezone=True), server_default=func.now())
    status = Column(
        SQLEnum(
            VideoStatus,
            native_enum=False,
            values_callable=_enum_values,
            length=50,
        ),
        default=VideoStatus.UPLOADED.value,
        index=True,
    )
    error_message = Column(Text)

    # Relationships
    project = relationship("Project", back_populates="videos")
    transcript = relationship("Transcript", back_populates="video", uselist=False, cascade="all, delete-orphan")
    video_analysis = relationship("VideoAnalysis", back_populates="video", uselist=False, cascade="all, delete-orphan")


class Transcript(Base):
    """Transcription from AssemblyAI."""

    __tablename__ = "transcripts"

    # Watchdog hot path (reset_stuck_transcripts): the 5-minute sweep filters
    # ``status = 'processing' AND created_at < cutoff``. A PARTIAL index on
    # created_at restricted to the 'processing' subset is the tightest fit —
    # the watchdog ALWAYS filters status='processing', and the index stays
    # tiny because nearly all rows are terminal (completed/error). Created
    # CONCURRENTLY by migration d2e3f4a5b6c7. Declared here (not via plain
    # ``index=True``) so the autogenerate drift gate sees model == DB —
    # see check_migration_drift.py. NOTE: ``postgresql_where`` is rendered
    # ``status = 'processing'`` but Postgres reflects it back with explicit
    # casts ``(status)::text = 'processing'::text``; SQLAlchemy 2.0
    # autogenerate treats the two as equivalent, so the gate stays green.
    __table_args__ = (
        Index(
            "ix_transcripts_status_created",
            "created_at",
            postgresql_where=text("status = 'processing'"),
        ),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    video_id = Column(UUID(as_uuid=True), ForeignKey("videos.id", ondelete="CASCADE"), nullable=False, index=True)
    assemblyai_id = Column(String(255), unique=True)
    raw_transcript = Column(JSONB)  # Full response from AssemblyAI
    processed_transcript = Column(JSONB)  # Cleaned/formatted transcript
    status = Column(
        SQLEnum(
            TranscriptStatus,
            native_enum=False,
            values_callable=_enum_values,
            length=50,
        ),
        default=TranscriptStatus.PENDING.value,
    )
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    video = relationship("Video", back_populates="transcript")
    speaker_labels = relationship("SpeakerLabel", back_populates="transcript", cascade="all, delete-orphan")


class SpeakerLabel(Base):
    """User-assigned speaker names and roles."""

    __tablename__ = "speaker_labels"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    transcript_id = Column(UUID(as_uuid=True), ForeignKey("transcripts.id", ondelete="CASCADE"), nullable=False, index=True)
    speaker_label = Column(String(50), nullable=False)  # "Speaker A", "Speaker B", etc.
    assigned_name = Column(String(255))  # User-assigned name
    role = Column(String(100))  # User-assigned role (e.g., "Interviewer", "Participant")

    # Relationships
    transcript = relationship("Transcript", back_populates="speaker_labels")


class VideoAnalysis(Base):
    """Analysis results for a single video (5-step process)."""

    __tablename__ = "video_analyses"

    # Watchdog hot path (reset_stuck_video_analyses): the 5-minute sweep
    # filters ``status = 'processing' AND started_at < cutoff``. PARTIAL index
    # on started_at restricted to the 'processing' subset — see the matching
    # note on Transcript above. Created CONCURRENTLY by migration
    # d2e3f4a5b6c7; declared here so the autogenerate drift gate sees
    # model == DB.
    __table_args__ = (
        Index(
            "ix_video_analyses_status_started",
            "started_at",
            postgresql_where=text("status = 'processing'"),
        ),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    video_id = Column(UUID(as_uuid=True), ForeignKey("videos.id", ondelete="CASCADE"), nullable=False, index=True)
    chunks = Column(JSONB)  # Step 1: List of chunks
    inferences = Column(JSONB)  # Step 2: List of inferences per chunk
    patterns = Column(JSONB)  # Step 3: List of patterns
    insights = Column(JSONB)  # Step 4: List of insights
    design_principles = Column(JSONB)  # Step 5: List of design principles
    status = Column(
        SQLEnum(
            VideoAnalysisStatus,
            native_enum=False,
            values_callable=_enum_values,
            length=50,
        ),
        default=VideoAnalysisStatus.PENDING.value,
    )
    started_at = Column(DateTime(timezone=True))
    completed_at = Column(DateTime(timezone=True))

    # Step-by-step tracking fields
    current_step = Column(String(50), default="chunk")  # chunk, infer, relate, explain, activate
    step_status = Column(JSONB, default=dict)  # {"chunk": "completed", "infer": "processing", ...}

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

    # Watchdog hot path (reset_stuck_project_analyses): the 5-minute sweep
    # filters ``status = 'processing' AND started_at < cutoff``. PARTIAL index
    # on started_at restricted to the 'processing' subset — see the matching
    # note on Transcript above. Created CONCURRENTLY by migration
    # d2e3f4a5b6c7; declared here so the autogenerate drift gate sees
    # model == DB.
    __table_args__ = (
        Index(
            "ix_project_analyses_status_started",
            "started_at",
            postgresql_where=text("status = 'processing'"),
        ),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    video_ids = Column(ARRAY(UUID(as_uuid=True)), nullable=False)  # List of video UUIDs included
    cross_video_patterns = Column(JSONB)  # Meta-patterns across videos
    cross_video_insights = Column(JSONB)  # Cross-video insights
    cross_video_principles = Column(JSONB)  # System-level design principles
    # Shares VideoAnalysisStatus with VideoAnalysis — same four live states.
    status = Column(
        SQLEnum(
            VideoAnalysisStatus,
            native_enum=False,
            values_callable=_enum_values,
            length=50,
        ),
        default=VideoAnalysisStatus.PENDING.value,
    )
    started_at = Column(DateTime(timezone=True))
    completed_at = Column(DateTime(timezone=True))
    error_message = Column(Text(), nullable=True)

    # Relationships
    project = relationship("Project", back_populates="project_analyses")
