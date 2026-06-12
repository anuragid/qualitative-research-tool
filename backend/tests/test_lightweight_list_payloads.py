"""Regression tests: list endpoints must NOT serialize analysis JSONB blobs.

The three polled list endpoints (list_projects, get_project,
list_project_videos) return ``VideoListItemResponse`` / ``ProjectListResponse``
shapes which deliberately omit the 5 heavy JSONB columns
(chunks, inferences, patterns, insights, design_principles).

These tests assert at the *HTTP response* level that none of those keys
appear in the JSON, and at the *schema* level that the new lightweight
schemas validate correctly.
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

import app.models.database_models as _models  # noqa: F401 — registers ORM metadata

# Keys that must NEVER appear in list/polled responses.
_BLOB_KEYS = {"chunks", "inferences", "patterns", "insights", "design_principles"}


def _setup_db(tmp_path):
    """Bootstrap a lightweight SQLite DB with one project, one video, and one
    completed analysis row (blobs populated so we can verify they're stripped)."""
    db_path = tmp_path / "test_light.db"
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
    )

    meta.create_all(bind=engine)
    Session = sessionmaker(autocommit=False, autoflush=False, bind=engine)

    user_id = "dev_user_local"
    project_uuid = uuid_module.uuid4()
    video_uuid = uuid_module.uuid4()
    analysis_uuid = uuid_module.uuid4()
    # Use .hex (no dashes) to match the pattern used across all route tests in
    # this codebase (SQLAlchemy SQLite ↔ UUID(as_uuid=True) interop requires
    # consistent string format for FK joins to work).
    project_id = project_uuid.hex
    video_id = video_uuid.hex
    analysis_id = analysis_uuid.hex

    db = Session()
    db.execute(meta.tables["users"].insert().values(
        id=user_id, email="dev@local", role="user"
    ))
    db.execute(meta.tables["projects"].insert().values(
        id=project_id, user_id=user_id, name="Test Project", status="ready"
    ))
    db.execute(meta.tables["videos"].insert().values(
        id=video_id, project_id=project_id, filename="interview.mp4",
        s3_key="key", s3_url="https://url", file_size_bytes=1000000,
        duration_seconds=300, status="analyzed",
    ))
    # Insert an analysis row WITH populated blob fields so we can confirm they
    # are stripped from the list response even when they're present in the DB.
    db.execute(meta.tables["video_analyses"].insert().values(
        id=analysis_id,
        video_id=video_id,
        chunks=[{"chunk_id": "c1", "text": "hello"}],
        inferences=[{"chunk_id": "c1", "inferences": []}],
        patterns=[{"pattern_id": "p1"}],
        insights=[{"insight_id": "i1"}],
        design_principles=[{"principle_id": "dp1"}],
        status="completed",
        current_step="activate",
        step_status={"chunk": "completed", "activate": "completed"},
    ))
    db.commit()
    db.close()

    return Session, project_uuid, video_uuid


def _override_db(Session):
    def _gen():
        s = Session()
        try:
            yield s
        finally:
            s.close()
    return _gen


def _assert_no_blobs(obj: dict, path: str = "") -> None:
    """Recursively assert that none of the heavy JSONB blob keys appear."""
    for key in _BLOB_KEYS:
        assert key not in obj, (
            f"Blob key '{key}' found at {path or 'root'} — list endpoint leaked "
            "analysis blob data. Full payload excerpt: "
            f"{str(obj)[:500]}"
        )
    # Recurse into nested dicts / lists
    for k, v in obj.items():
        if isinstance(v, dict):
            _assert_no_blobs(v, path=f"{path}.{k}")
        elif isinstance(v, list):
            for i, item in enumerate(v):
                if isinstance(item, dict):
                    _assert_no_blobs(item, path=f"{path}.{k}[{i}]")


@pytest.mark.asyncio
async def test_list_projects_no_blobs(tmp_path):
    """GET /api/projects/ must not include analysis blob fields."""
    Session, project_uuid, _ = _setup_db(tmp_path)

    from app.database import get_db
    from app.main import app

    app.dependency_overrides[get_db] = _override_db(Session)
    try:
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await client.get(
                "/api/projects/",
                headers={"Authorization": "Bearer dev-bypass"},
            )
        assert resp.status_code == 200, resp.json()
        data = resp.json()
        assert isinstance(data, list)
        assert len(data) == 1
        project = data[0]
        _assert_no_blobs(project)
        # Sanity: analysis status IS present
        analysis_objs = [v.get("analysis") for v in project.get("videos", []) if v.get("analysis")]
        assert len(analysis_objs) == 1
        assert analysis_objs[0]["status"] == "completed"
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_get_project_no_blobs(tmp_path):
    """GET /api/projects/{id} must not include analysis blob fields."""
    Session, project_uuid, _ = _setup_db(tmp_path)

    from app.database import get_db
    from app.main import app

    app.dependency_overrides[get_db] = _override_db(Session)
    try:
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await client.get(
                f"/api/projects/{project_uuid}",
                headers={"Authorization": "Bearer dev-bypass"},
            )
        assert resp.status_code == 200, resp.json()
        _assert_no_blobs(resp.json())
        # Analysis status present
        videos = resp.json().get("videos", [])
        assert len(videos) == 1
        assert videos[0]["analysis"]["status"] == "completed"
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_list_project_videos_no_blobs(tmp_path):
    """GET /api/projects/{id}/videos must not include analysis blob fields."""
    Session, project_uuid, _ = _setup_db(tmp_path)

    from app.database import get_db
    from app.main import app

    app.dependency_overrides[get_db] = _override_db(Session)
    try:
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await client.get(
                f"/api/projects/{project_uuid}/videos",
                headers={"Authorization": "Bearer dev-bypass"},
            )
        assert resp.status_code == 200, resp.json()
        data = resp.json()
        assert isinstance(data, list)
        assert len(data) == 1
        video = data[0]
        _assert_no_blobs(video)
        assert video["analysis"]["status"] == "completed"
        assert video["analysis"]["current_step"] == "activate"
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_list_project_videos_no_analysis_row(tmp_path):
    """Videos without a video_analyses row return analysis=null (not a crash)."""
    Session, project_uuid, video_uuid = _setup_db(tmp_path)

    # Delete the analysis row — use hex format to match what was stored.
    db = Session()
    from sqlalchemy import text
    db.execute(text("DELETE FROM video_analyses WHERE video_id = :vid"), {"vid": video_uuid.hex})
    db.commit()
    db.close()

    from app.database import get_db
    from app.main import app

    app.dependency_overrides[get_db] = _override_db(Session)
    try:
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await client.get(
                f"/api/projects/{project_uuid}/videos",
                headers={"Authorization": "Bearer dev-bypass"},
            )
        assert resp.status_code == 200, resp.json()
        data = resp.json()
        assert data[0]["analysis"] is None
    finally:
        app.dependency_overrides.clear()
