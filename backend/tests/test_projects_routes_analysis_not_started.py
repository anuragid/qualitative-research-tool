"""Regression tests for FIX C: project analysis not-started shape.

See ``test_videos_routes_analysis_not_started.py`` for full context.
"""

import uuid as uuid_module

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import (
    JSON,
    Column,
    DateTime,
    ForeignKey,
    Integer,
    MetaData,
    String,
    Table,
    Text,
    create_engine,
)
from sqlalchemy.orm import sessionmaker
from sqlalchemy.sql import func

import app.models.database_models as models  # noqa: F401


def _setup_test_db(tmp_path):
    db_path = tmp_path / "test_routes.db"
    engine = create_engine(f"sqlite:///{db_path}")

    meta = MetaData()

    Table("users", meta,
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
        Column("error_message", Text),
    )

    meta.create_all(bind=engine)
    TestSession = sessionmaker(autocommit=False, autoflush=False, bind=engine)

    user_id = "dev_user_local"
    other_user_id = "some_other_user"
    project_uuid = uuid_module.uuid4()
    other_project_uuid = uuid_module.uuid4()

    db = TestSession()
    db.execute(meta.tables["users"].insert().values(
        id=user_id, email="dev@local", role="user"
    ))
    db.execute(meta.tables["users"].insert().values(
        id=other_user_id, email="other@local", role="user"
    ))
    db.execute(meta.tables["projects"].insert().values(
        id=project_uuid.hex, user_id=user_id, name="HAIC", status="ready"
    ))
    db.execute(meta.tables["projects"].insert().values(
        id=other_project_uuid.hex, user_id=other_user_id,
        name="Other", status="ready",
    ))
    # No project_analyses row on purpose.
    db.commit()
    db.close()

    return TestSession, meta, project_uuid, other_project_uuid


def _override_db(TestSession):
    def _gen():
        session = TestSession()
        try:
            yield session
        finally:
            session.close()
    return _gen


@pytest.mark.asyncio
async def test_project_analysis_returns_not_started_when_no_row(tmp_path):
    """GET /api/projects/{id}/analysis returns 200 with status=not_started
    and empty arrays when the project exists but no project_analyses row.

    Prevents the frontend from crashing with Array.map on undefined
    (Sentry JAVASCRIPT-REACT-6).
    """
    TestSession, _meta, project_uuid, _ = _setup_test_db(tmp_path)

    from app.database import get_db
    from app.main import app

    app.dependency_overrides[get_db] = _override_db(TestSession)
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get(
                f"/api/projects/{project_uuid}/analysis",
                headers={"Authorization": "Bearer dev-bypass"},
            )
        assert response.status_code == 200, (
            f"Expected 200 not_started, got {response.status_code}: {response.json()}"
        )
        body = response.json()
        assert body["status"] == "not_started"
        assert body["project_id"] == str(project_uuid)
        assert body["video_ids"] == []
        assert body["cross_video_patterns"] == []
        assert body["cross_video_insights"] == []
        assert body["cross_video_principles"] == []
        assert body["started_at"] is None
        assert body["completed_at"] is None
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_project_analysis_returns_404_when_project_does_not_exist(tmp_path):
    TestSession, *_ = _setup_test_db(tmp_path)
    missing = uuid_module.uuid4()

    from app.database import get_db
    from app.main import app

    app.dependency_overrides[get_db] = _override_db(TestSession)
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get(
                f"/api/projects/{missing}/analysis",
                headers={"Authorization": "Bearer dev-bypass"},
            )
        assert response.status_code == 404
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_project_analysis_returns_404_when_not_owner(tmp_path):
    TestSession, _meta, _project_uuid, other_project_uuid = _setup_test_db(tmp_path)

    from app.database import get_db
    from app.main import app

    app.dependency_overrides[get_db] = _override_db(TestSession)
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get(
                f"/api/projects/{other_project_uuid}/analysis",
                headers={"Authorization": "Bearer dev-bypass"},
            )
        assert response.status_code == 404
    finally:
        app.dependency_overrides.clear()


# NOTE: A "completed" contract regression test for /api/projects/{id}/analysis
# isn't added here because the ProjectAnalysis ORM model uses PostgreSQL
# ARRAY(UUID) for video_ids -- that column type doesn't round-trip via
# SQLite in the ASGI test harness (the response layer sees it as a raw
# JSON string).  The 200 completed path is covered by the project
# analysis chain tests (test_project_analysis_chain.py) running against
# a real DB session.  This file's job is to lock in the new not-started
# contract + preserve the 404 for missing / unauthorized projects.
