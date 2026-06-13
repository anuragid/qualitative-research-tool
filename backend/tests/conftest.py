"""Shared test fixtures — sets required env vars before any app import."""

import os

# Set all required env vars BEFORE importing anything from app.*
# pydantic-settings reads these at import time.
# Use APP_ENV=development so the dev auth bypass is active for integration tests.
os.environ.setdefault("APP_ENV", "development")
os.environ.setdefault("DEBUG", "false")
os.environ.setdefault("DATABASE_URL", "sqlite:///test.db")
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/0")
os.environ.setdefault("CLERK_SECRET_KEY", "sk_test_fake")
os.environ.setdefault("CLERK_PUBLISHABLE_KEY", "pk_test_dGVzdC5jbGVyay5hY2NvdW50cy5kZXYk")
os.environ.setdefault("R2_ACCESS_KEY_ID", "test_access_key")
os.environ.setdefault("R2_SECRET_ACCESS_KEY", "test_secret_key")
os.environ.setdefault("R2_ENDPOINT_URL", "https://fake.r2.cloudflarestorage.com")
os.environ.setdefault("R2_BUCKET_NAME", "test-bucket")
os.environ.setdefault("OPENROUTER_API_KEY", "test-openrouter-key")
os.environ.setdefault("ASSEMBLYAI_API_KEY", "test-assemblyai-key")
os.environ.setdefault("ENCRYPTION_KEY", "9px3YGa-Z2bljdtUKpLhqzl9IaGdf2RgrCI-zOTrUug=")

from unittest.mock import patch  # noqa: E402

import pytest  # noqa: E402
from httpx import ASGITransport, AsyncClient  # noqa: E402


@pytest.fixture
def anyio_backend():
    return "asyncio"


@pytest.fixture
async def client(tmp_path):
    """Async test client for the FastAPI app.

    Uses APP_ENV=development so the dev auth bypass is active —
    requests without an Authorization header authenticate as dev_user_local
    with USER role permissions.
    """
    from sqlalchemy import JSON, create_engine
    from sqlalchemy.orm import sessionmaker

    db_path = tmp_path / "test.db"
    test_engine = create_engine(f"sqlite:///{db_path}")

    # Import models to register them with Base

    # Create tables using raw SQL to work around type issues
    from sqlalchemy import (
        Boolean,
        Column,
        DateTime,
        Float,
        ForeignKey,
        Integer,
        MetaData,
        String,
        Table,
        Text,
    )

    # Render PostgreSQL types as SQLite-compatible types
    from sqlalchemy.sql import func

    import app.models.database_models  # noqa: F401

    meta = MetaData()

    _users = Table("users", meta,
        Column("id", String(255), primary_key=True),
        Column("email", String(255)),
        Column("first_name", String(255)),
        Column("last_name", String(255)),
        Column("username", String(255)),
        Column("role", String(50), nullable=False, default="user"),
        Column("preferred_model", String(255)),
        Column("model_tier", String(10), nullable=False, server_default="included"),
        Column("encrypted_api_key", Text),
        Column("key_hint", String(8)),
        Column("key_validated_at", DateTime),
        # BYOK balance snapshot — mirror of migration `add_byok_balance_columns`.
        # Tests use this to seed/inspect persisted balance state without spinning
        # up Alembic against SQLite.
        Column("key_total_credits", Float),
        Column("key_total_usage", Float),
        Column("key_limit", Float),
        Column("key_limit_remaining", Float),
        Column("key_is_free_tier", Boolean),
        Column("key_balance_checked_at", DateTime),
        Column("key_balance_error", String(255)),
        Column("created_at", DateTime, server_default=func.now()),
        Column("updated_at", DateTime, server_default=func.now()),
        Column("last_seen", DateTime),
    )

    _projects = Table("projects", meta,
        Column("id", String(36), primary_key=True),
        Column("user_id", String(255), ForeignKey("users.id"), nullable=False),
        Column("name", String(255), nullable=False),
        Column("description", Text),
        Column("status", String(50), default="planning"),
        Column("error_message", Text),
        Column("created_at", DateTime, server_default=func.now()),
        Column("updated_at", DateTime, server_default=func.now()),
    )

    _videos = Table("videos", meta,
        Column("id", String(36), primary_key=True),
        Column("project_id", String(36), ForeignKey("projects.id"), nullable=False),
        Column("filename", String(255), nullable=False),
        Column("s3_key", Text, nullable=False),
        Column("s3_url", Text, nullable=False),
        Column("file_size_bytes", Integer),
        Column("duration_seconds", Integer),
        Column("uploaded_at", DateTime, server_default=func.now()),
        Column("status", String(50), default="uploaded"),
        Column("error_message", Text),
    )

    _transcripts = Table("transcripts", meta,
        Column("id", String(36), primary_key=True),
        Column("video_id", String(36), ForeignKey("videos.id"), nullable=False),
        Column("assemblyai_id", String(255)),
        Column("raw_transcript", JSON),
        Column("processed_transcript", JSON),
        Column("status", String(50), default="pending"),
        Column("created_at", DateTime, server_default=func.now()),
    )

    _speaker_labels = Table("speaker_labels", meta,
        Column("id", String(36), primary_key=True),
        Column("transcript_id", String(36), ForeignKey("transcripts.id"), nullable=False),
        Column("speaker_label", String(50), nullable=False),
        Column("assigned_name", String(255)),
        Column("role", String(100)),
    )

    _video_analyses = Table("video_analyses", meta,
        Column("id", String(36), primary_key=True),
        Column("video_id", String(36), ForeignKey("videos.id"), nullable=False),
        Column("chunks", JSON),
        Column("inferences", JSON),
        Column("patterns", JSON),
        Column("insights", JSON),
        Column("design_principles", JSON),
        Column("status", String(50), default="pending"),
        Column("started_at", DateTime),
        Column("completed_at", DateTime),
        Column("current_step", String(50), default="chunk"),
        Column("step_status", JSON),
        Column("chunk_completed_at", DateTime),
        Column("infer_completed_at", DateTime),
        Column("relate_completed_at", DateTime),
        Column("explain_completed_at", DateTime),
        Column("activate_completed_at", DateTime),
    )

    _project_analyses = Table("project_analyses", meta,
        Column("id", String(36), primary_key=True),
        Column("project_id", String(36), ForeignKey("projects.id"), nullable=False),
        Column("video_ids", JSON),
        Column("cross_video_patterns", JSON),
        Column("cross_video_insights", JSON),
        Column("cross_video_principles", JSON),
        Column("status", String(50), default="pending"),
        Column("started_at", DateTime),
        Column("completed_at", DateTime),
    )

    meta.create_all(bind=test_engine)

    # Override the database dependency
    TestSession = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)

    def override_get_db():
        db = TestSession()
        try:
            yield db
        finally:
            db.close()

    from app.database import get_db
    from app.main import app

    app.dependency_overrides[get_db] = override_get_db

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac

    app.dependency_overrides.clear()


@pytest.fixture
def mock_s3():
    """Mock S3 service to avoid real storage calls.

    Patches in both the service module and the routes module (which holds
    a local reference from `from ... import s3_service`).
    """
    # A minimal valid MP4 header (ftyp box at offset 4) so the confirm-upload
    # content sniff passes by default. Tests that exercise the size/content
    # rejection paths override head_object / get_object_range explicitly.
    valid_media_header = b"\x00\x00\x00\x1cftypisom\x00\x00\x02\x00mp41"
    with patch("app.services.s3_service.s3_service") as svc_mock, \
         patch("app.routes.videos.s3_service") as route_mock:
        for mock in (svc_mock, route_mock):
            mock.upload_video.return_value = ("test-key", "https://test-url")
            mock.delete_video.return_value = None
            mock.get_presigned_url.return_value = "https://test-presigned-url"
            # confirm-upload defaults: object exists, is small, and looks like
            # real media so the happy path succeeds without per-test setup.
            mock.head_object.return_value = {"ContentLength": 1000}
            mock.get_object_range.return_value = valid_media_header
        yield route_mock


def make_auth_header(role="user"):
    """Create mock auth header.

    In development mode the dev bypass is active, so sending no header
    (or 'Bearer dev-bypass') authenticates as the dev user with USER role.
    """
    return {"Authorization": "Bearer dev-bypass"}
