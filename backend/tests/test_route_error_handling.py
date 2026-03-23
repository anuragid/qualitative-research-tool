"""Tests for route-level error handling.

Covers: 409 when already analyzing/transcribing, 429 concurrent task limit,
        400 for missing transcript.
"""

import uuid as uuid_module

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import JSON, Column, DateTime, ForeignKey, Integer, MetaData, String, Table, Text, create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.sql import func

import app.models.database_models as models  # noqa: F401


def _setup_test_db(tmp_path):
    """Create a test SQLite DB using ORM models and seed it.

    Returns (TestSession, video_id, project_id).
    """
    db_path = tmp_path / "test_routes.db"
    engine = create_engine(f"sqlite:///{db_path}")

    # Create tables via raw metadata to work around PostgreSQL-only types
    meta = MetaData()

    Table("users", meta,
        Column("id", String(255), primary_key=True),
        Column("email", String(255)),
        Column("first_name", String(255)),
        Column("last_name", String(255)),
        Column("username", String(255)),
        Column("role", String(50), nullable=False, default="user"),
        Column("preferred_model", String(255)),
        Column("encrypted_api_key", Text),
        Column("key_hint", String(8)),
        Column("key_validated_at", DateTime),
        Column("created_at", DateTime, server_default=func.now()),
        Column("updated_at", DateTime, server_default=func.now()),
        Column("last_seen", DateTime),
    )

    Table("projects", meta,
        Column("id", String(36), primary_key=True),
        Column("user_id", String(255), ForeignKey("users.id"), nullable=False),
        Column("name", String(255), nullable=False),
        Column("description", Text),
        Column("status", String(50), default="planning"),
        Column("error_message", Text),
        Column("created_at", DateTime, server_default=func.now()),
        Column("updated_at", DateTime, server_default=func.now()),
    )

    Table("videos", meta,
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

    Table("transcripts", meta,
        Column("id", String(36), primary_key=True),
        Column("video_id", String(36), ForeignKey("videos.id"), nullable=False),
        Column("assemblyai_id", String(255)),
        Column("raw_transcript", JSON),
        Column("processed_transcript", JSON),
        Column("status", String(50), default="pending"),
        Column("created_at", DateTime, server_default=func.now()),
    )

    Table("speaker_labels", meta,
        Column("id", String(36), primary_key=True),
        Column("transcript_id", String(36), ForeignKey("transcripts.id"), nullable=False),
        Column("speaker_label", String(50), nullable=False),
        Column("assigned_name", String(255)),
        Column("role", String(100)),
    )

    Table("video_analyses", meta,
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

    Table("project_analyses", meta,
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

    meta.create_all(bind=engine)
    TestSession = sessionmaker(autocommit=False, autoflush=False, bind=engine)

    # Seed data — use hex (no dashes) format for UUIDs to match
    # how SQLAlchemy's UUID type stores them in SQLite
    user_id = "dev_user_local"
    project_uuid = uuid_module.uuid4()
    video_uuid = uuid_module.uuid4()
    transcript_uuid = uuid_module.uuid4()

    # PostgreSQL UUID on SQLite stores as 32-char hex (no dashes)
    project_id = project_uuid.hex
    video_id = video_uuid.hex
    transcript_id = transcript_uuid.hex

    db = TestSession()
    db.execute(
        meta.tables["users"].insert().values(
            id=user_id, email="dev@local", role="user"
        )
    )
    db.execute(
        meta.tables["projects"].insert().values(
            id=project_id, user_id=user_id, name="Test Project", status="planning"
        )
    )
    db.execute(
        meta.tables["videos"].insert().values(
            id=video_id, project_id=project_id, filename="test.mp4",
            s3_key="videos/test.mp4", s3_url="https://s3/test.mp4",
            status="transcribed",
        )
    )
    db.execute(
        meta.tables["transcripts"].insert().values(
            id=transcript_id, video_id=video_id, status="completed",
            processed_transcript='{"utterances": []}',
        )
    )
    db.commit()
    db.close()

    return TestSession, meta, video_uuid, project_uuid


@pytest.mark.asyncio
async def test_analyze_returns_409_when_already_analyzing(tmp_path):
    """POST /analyze should return 409 if video status is 'analyzing'."""
    TestSession, meta, video_uuid, project_uuid = _setup_test_db(tmp_path)

    # Set video to analyzing status
    db = TestSession()
    db.execute(
        meta.tables["videos"].update()
        .where(meta.tables["videos"].c.id == video_uuid.hex)
        .values(status="analyzing")
    )
    db.commit()
    db.close()

    def override_get_db():
        session = TestSession()
        try:
            yield session
        finally:
            session.close()

    from app.database import get_db
    from app.main import app

    app.dependency_overrides[get_db] = override_get_db
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                f"/api/videos/{video_uuid}/analyze",
                headers={"Authorization": "Bearer dev-bypass"},
            )
        assert response.status_code == 409, f"Expected 409, got {response.status_code}: {response.json()}"
        assert "already in progress" in response.json()["detail"]
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_transcribe_returns_409_when_already_transcribing(tmp_path):
    """POST /transcribe should return 409 if video status is 'transcribing'."""
    TestSession, meta, video_uuid, project_uuid = _setup_test_db(tmp_path)

    db = TestSession()
    db.execute(
        meta.tables["videos"].update()
        .where(meta.tables["videos"].c.id == video_uuid.hex)
        .values(status="transcribing")
    )
    db.commit()
    db.close()

    def override_get_db():
        session = TestSession()
        try:
            yield session
        finally:
            session.close()

    from app.database import get_db
    from app.main import app

    app.dependency_overrides[get_db] = override_get_db
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                f"/api/videos/{video_uuid}/transcribe",
                headers={"Authorization": "Bearer dev-bypass"},
            )
        assert response.status_code == 409, f"Expected 409, got {response.status_code}: {response.json()}"
        assert "already in progress" in response.json()["detail"]
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_concurrent_task_limit_analyze(tmp_path):
    """POST /analyze should return 429 when 3+ tasks are already active."""
    TestSession, meta, video_uuid, project_uuid = _setup_test_db(tmp_path)

    db = TestSession()

    # Create 3 other videos in active states
    for i in range(3):
        vid = uuid_module.uuid4().hex
        db.execute(
            meta.tables["videos"].insert().values(
                id=vid, project_id=project_uuid.hex, filename=f"v{i}.mp4",
                s3_key=f"videos/v{i}.mp4", s3_url=f"https://s3/v{i}.mp4",
                status="analyzing" if i < 2 else "transcribing",
            )
        )
    db.commit()
    db.close()

    def override_get_db():
        session = TestSession()
        try:
            yield session
        finally:
            session.close()

    from app.database import get_db
    from app.main import app

    app.dependency_overrides[get_db] = override_get_db
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                f"/api/videos/{video_uuid}/analyze",
                headers={"Authorization": "Bearer dev-bypass"},
            )
        assert response.status_code == 429, f"Expected 429, got {response.status_code}: {response.json()}"
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_concurrent_task_limit_transcribe(tmp_path):
    """POST /transcribe should return 429 when 3+ tasks are already active."""
    TestSession, meta, video_uuid, project_uuid = _setup_test_db(tmp_path)

    db = TestSession()

    # Reset video to uploaded (eligible for transcription)
    db.execute(
        meta.tables["videos"].update()
        .where(meta.tables["videos"].c.id == video_uuid.hex)
        .values(status="uploaded")
    )

    # Remove existing completed transcript
    db.execute(
        meta.tables["transcripts"].delete()
        .where(meta.tables["transcripts"].c.video_id == video_uuid.hex)
    )

    # Create 3 other videos in active states
    for i in range(3):
        vid = uuid_module.uuid4().hex
        db.execute(
            meta.tables["videos"].insert().values(
                id=vid, project_id=project_uuid.hex, filename=f"v{i}.mp4",
                s3_key=f"videos/v{i}.mp4", s3_url=f"https://s3/v{i}.mp4",
                status="transcribing",
            )
        )
    db.commit()
    db.close()

    def override_get_db():
        session = TestSession()
        try:
            yield session
        finally:
            session.close()

    from app.database import get_db
    from app.main import app

    app.dependency_overrides[get_db] = override_get_db
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                f"/api/videos/{video_uuid}/transcribe",
                headers={"Authorization": "Bearer dev-bypass"},
            )
        assert response.status_code == 429, f"Expected 429, got {response.status_code}: {response.json()}"
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_analyze_requires_completed_transcript(tmp_path):
    """POST /analyze should return 400 if transcript is not completed."""
    TestSession, meta, video_uuid, project_uuid = _setup_test_db(tmp_path)

    db = TestSession()
    db.execute(
        meta.tables["transcripts"].update()
        .where(meta.tables["transcripts"].c.video_id == video_uuid.hex)
        .values(status="pending")
    )
    db.commit()
    db.close()

    def override_get_db():
        session = TestSession()
        try:
            yield session
        finally:
            session.close()

    from app.database import get_db
    from app.main import app

    app.dependency_overrides[get_db] = override_get_db
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                f"/api/videos/{video_uuid}/analyze",
                headers={"Authorization": "Bearer dev-bypass"},
            )
        assert response.status_code == 400, f"Expected 400, got {response.status_code}: {response.json()}"
        assert "transcript" in response.json()["detail"].lower()
    finally:
        app.dependency_overrides.clear()
