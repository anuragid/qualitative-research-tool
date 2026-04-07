"""Regression tests for FIX C: analysis-not-started shape.

Background:
    The three analysis GET routes used to return 404 when the parent
    video/project existed but the ``video_analyses`` / ``project_analyses``
    row had not been created yet (e.g. a video that was transcribed but
    analysis had not been triggered).  The frontend could not distinguish
    "video doesn't exist" from "analysis hasn't started yet" and rendered
    a broken UI, including Sentry JAVASCRIPT-REACT-6 (TypeError:
    Cannot read properties of undefined (reading 'length') inside
    PrinciplesList.map).

    These tests lock in the new contract:

    * GET /api/videos/{id}/analysis/status -> 200 {"status": "not_started", ...}
      when the video exists but no analysis row exists.
    * GET /api/videos/{id}/analysis -> 200 {"status": "not_started", chunks: [], ...}
      same condition.
    * Both routes STILL return 404 when the video does not exist or is not
      owned by the caller -- that path is driven by
      ``_get_video_with_ownership`` and must be preserved.
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
    """Create a fresh SQLite DB with a project + video but NO analysis row.

    Returns (TestSession, meta, video_uuid, project_uuid, other_user_project_uuid,
             other_user_video_uuid).
    """
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

    user_id = "dev_user_local"
    other_user_id = "some_other_user"
    project_uuid = uuid_module.uuid4()
    video_uuid = uuid_module.uuid4()
    other_project_uuid = uuid_module.uuid4()
    other_video_uuid = uuid_module.uuid4()

    db = TestSession()
    db.execute(
        meta.tables["users"].insert().values(
            id=user_id, email="dev@local", role="user"
        )
    )
    db.execute(
        meta.tables["users"].insert().values(
            id=other_user_id, email="other@local", role="user"
        )
    )
    db.execute(
        meta.tables["projects"].insert().values(
            id=project_uuid.hex, user_id=user_id, name="Test Project", status="ready"
        )
    )
    db.execute(
        meta.tables["videos"].insert().values(
            id=video_uuid.hex, project_id=project_uuid.hex, filename="test.mp4",
            s3_key="videos/test.mp4", s3_url="https://s3/test.mp4",
            status="transcribed",
        )
    )
    # A second project owned by a different user -- for the "not owner" path.
    db.execute(
        meta.tables["projects"].insert().values(
            id=other_project_uuid.hex, user_id=other_user_id,
            name="Other Project", status="ready",
        )
    )
    db.execute(
        meta.tables["videos"].insert().values(
            id=other_video_uuid.hex, project_id=other_project_uuid.hex,
            filename="other.mp4", s3_key="videos/other.mp4",
            s3_url="https://s3/other.mp4", status="transcribed",
        )
    )
    # Intentionally do NOT create any video_analyses or project_analyses rows.
    db.commit()
    db.close()

    return (
        TestSession,
        meta,
        video_uuid,
        project_uuid,
        other_video_uuid,
        other_project_uuid,
    )


def _override_db(TestSession):
    def _gen():
        session = TestSession()
        try:
            yield session
        finally:
            session.close()
    return _gen


# ---------------------------------------------------------------------------
# Video /analysis/status route
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_video_analysis_status_returns_not_started_when_no_row(tmp_path):
    """GET /api/videos/{id}/analysis/status returns 200 + not_started
    when the video exists but no video_analyses row has been created."""
    TestSession, _meta, video_uuid, _project, _, _ = _setup_test_db(tmp_path)

    from app.database import get_db
    from app.main import app

    app.dependency_overrides[get_db] = _override_db(TestSession)
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get(
                f"/api/videos/{video_uuid}/analysis/status",
                headers={"Authorization": "Bearer dev-bypass"},
            )
        assert response.status_code == 200, (
            f"Expected 200 not_started shape, got "
            f"{response.status_code}: {response.json()}"
        )
        body = response.json()
        assert body["status"] == "not_started"
        assert body["current_step"] is None
        assert body["step_status"] is None
        assert body["started_at"] is None
        assert body["completed_at"] is None
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_video_analysis_status_returns_404_when_video_does_not_exist(tmp_path):
    TestSession, *_ = _setup_test_db(tmp_path)
    missing_video = uuid_module.uuid4()

    from app.database import get_db
    from app.main import app

    app.dependency_overrides[get_db] = _override_db(TestSession)
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get(
                f"/api/videos/{missing_video}/analysis/status",
                headers={"Authorization": "Bearer dev-bypass"},
            )
        assert response.status_code == 404
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_video_analysis_status_returns_404_when_not_owner(tmp_path):
    TestSession, _meta, _video_uuid, _project, other_video_uuid, _ = _setup_test_db(tmp_path)

    from app.database import get_db
    from app.main import app

    app.dependency_overrides[get_db] = _override_db(TestSession)
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get(
                f"/api/videos/{other_video_uuid}/analysis/status",
                headers={"Authorization": "Bearer dev-bypass"},
            )
        assert response.status_code == 404, (
            f"Not-owner path must still return 404, got {response.status_code}"
        )
    finally:
        app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# Video /analysis (full payload) route
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_video_analysis_returns_not_started_when_no_row(tmp_path):
    """GET /api/videos/{id}/analysis returns 200 with status='not_started'
    and empty arrays for the jsonb fields when no analysis row exists.

    Empty arrays (not null) are important so the frontend can safely
    call .map() / .length on the fields without extra guards. See
    Sentry JAVASCRIPT-REACT-6 for the crash this prevents.
    """
    TestSession, _meta, video_uuid, _project, _, _ = _setup_test_db(tmp_path)

    from app.database import get_db
    from app.main import app

    app.dependency_overrides[get_db] = _override_db(TestSession)
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get(
                f"/api/videos/{video_uuid}/analysis",
                headers={"Authorization": "Bearer dev-bypass"},
            )
        assert response.status_code == 200, (
            f"Expected 200 not_started, got {response.status_code}: {response.json()}"
        )
        body = response.json()
        assert body["status"] == "not_started"
        # Empty arrays, not null -- the frontend must be able to .map() safely.
        assert body["chunks"] == []
        assert body["inferences"] == []
        assert body["patterns"] == []
        assert body["insights"] == []
        assert body["design_principles"] == []
        assert body["video_id"] == str(video_uuid)
        # Timestamps/steps all null because the analysis hasn't run.
        assert body["started_at"] is None
        assert body["completed_at"] is None
        assert body["current_step"] is None
        assert body["step_status"] is None
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_video_analysis_returns_404_when_video_does_not_exist(tmp_path):
    TestSession, *_ = _setup_test_db(tmp_path)
    missing_video = uuid_module.uuid4()

    from app.database import get_db
    from app.main import app

    app.dependency_overrides[get_db] = _override_db(TestSession)
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get(
                f"/api/videos/{missing_video}/analysis",
                headers={"Authorization": "Bearer dev-bypass"},
            )
        assert response.status_code == 404
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_video_analysis_returns_404_when_not_owner(tmp_path):
    TestSession, _meta, _video_uuid, _project, other_video_uuid, _ = _setup_test_db(tmp_path)

    from app.database import get_db
    from app.main import app

    app.dependency_overrides[get_db] = _override_db(TestSession)
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get(
                f"/api/videos/{other_video_uuid}/analysis",
                headers={"Authorization": "Bearer dev-bypass"},
            )
        assert response.status_code == 404
    finally:
        app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# Completed analysis contract preservation.
# We must not break the existing 200 shape for completed analyses.
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_video_analysis_returns_completed_data_when_row_exists(tmp_path):
    """Regression: the existing 200 contract for a populated analysis row must
    stay intact -- chunks/inferences etc are returned as the real data, not
    overwritten with empty arrays."""
    TestSession, meta, video_uuid, _project, _, _ = _setup_test_db(tmp_path)

    db = TestSession()
    analysis_id = uuid_module.uuid4().hex
    db.execute(
        meta.tables["video_analyses"].insert().values(
            id=analysis_id,
            video_id=video_uuid.hex,
            status="completed",
            current_step="activate",
            step_status={"chunk": "completed", "infer": "completed",
                          "relate": "completed", "explain": "completed",
                          "activate": "completed"},
            chunks=[{"chunk_id": "c1", "text": "x" * 30, "type": "quote"}],
            inferences=[{"chunk_id": "c1", "inferences": []}],
            patterns=[{"pattern_id": "p1"}],
            insights=[{"insight_id": "i1"}],
            design_principles=[{"principle_id": "dp1", "how_might_we": ["HMW?"]}],
        )
    )
    db.commit()
    db.close()

    from app.database import get_db
    from app.main import app

    app.dependency_overrides[get_db] = _override_db(TestSession)
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get(
                f"/api/videos/{video_uuid}/analysis",
                headers={"Authorization": "Bearer dev-bypass"},
            )
        assert response.status_code == 200
        body = response.json()
        assert body["status"] == "completed"
        assert len(body["chunks"]) == 1
        assert len(body["design_principles"]) == 1
        assert body["design_principles"][0]["principle_id"] == "dp1"
    finally:
        app.dependency_overrides.clear()
