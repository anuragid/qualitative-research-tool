"""Regression tests: list endpoints must NOT serialize analysis JSONB blobs.

The three polled list endpoints (list_projects, get_project,
list_project_videos) return ``VideoListItemResponse`` / ``ProjectListResponse``
shapes which deliberately omit the 5 heavy JSONB columns
(chunks, inferences, patterns, insights, design_principles).

These tests assert at three levels:

1. *HTTP response* — none of the blob keys appear in the JSON.
2. *Schema* — the new lightweight schemas validate correctly.
3. *SQL* — the ``load_only()`` loader option keeps the blob columns out of
   the SELECT statements actually sent to the database
   (``test_blob_columns_not_selected_from_db``).  Without this, dropping
   ``load_only`` would still pass the JSON tests (Pydantic strips the
   fields at serialization) but silently reintroduce the heavy DB reads
   this PR exists to remove.
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
        # The new VideoStatusStub projection omits the analysis embed entirely
        # (no video_analyses join). The videos array still exists with stubs.
        videos = project.get("videos", [])
        assert len(videos) == 1
        stub = videos[0]
        assert stub["status"] == "analyzed"  # video.status, not analysis.status
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
        # VideoStatusStub omits analysis embed; video.status is present
        videos = resp.json().get("videos", [])
        assert len(videos) == 1
        assert videos[0]["status"] == "analyzed"  # video.status, not analysis.status
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


@pytest.mark.asyncio
async def test_blob_columns_not_selected_from_db(tmp_path):
    """SQL-level regression lock: list_project_videos must NOT SELECT blob columns.

    ``list_projects`` and ``get_project`` no longer touch ``video_analyses``
    at all (tested separately below).  ``list_project_videos`` still joins it
    but only the status-tracking columns, not the 5 JSONB blobs.

    This test verifies that the one remaining ``video_analyses`` consumer
    (list_project_videos) stays clean.
    """
    Session, project_uuid, _ = _setup_db(tmp_path)
    engine = Session.kw["bind"]

    captured: list[str] = []

    from sqlalchemy import event

    def _capture(conn, cursor, statement, parameters, context, executemany):
        captured.append(statement)

    from app.database import get_db
    from app.main import app

    app.dependency_overrides[get_db] = _override_db(Session)
    event.listen(engine, "before_cursor_execute", _capture)
    try:
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            headers = {"Authorization": "Bearer dev-bypass"}
            assert (
                await client.get(f"/api/projects/{project_uuid}/videos", headers=headers)
            ).status_code == 200

        analysis_selects = [
            s for s in captured
            if "video_analyses" in s and s.lstrip().upper().startswith("SELECT")
        ]
        # list_project_videos should still emit a SELECT against video_analyses
        # (via selectinload's second query).
        assert len(analysis_selects) >= 1, (
            f"Expected >=1 SELECTs against video_analyses from list_project_videos, "
            f"got {len(analysis_selects)}. All captured: {captured}"
        )
        # Use the table-qualified column form to avoid false positives.
        for stmt in analysis_selects:
            for col in _BLOB_KEYS:
                assert f"video_analyses.{col}" not in stmt, (
                    f"Blob column 'video_analyses.{col}' was SELECTed — the "
                    f"load_only() optimization has been dropped or broken.\n"
                    f"Statement: {stmt}"
                )
            # Sanity: status IS selected (proves we're looking at the real
            # relationship-load query, not some unrelated statement).
            assert "video_analyses.status" in stmt
    finally:
        event.remove(engine, "before_cursor_execute", _capture)
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_list_projects_no_video_analyses_table_access(tmp_path):
    """SQL-level regression lock: list_projects must NOT touch video_analyses.

    The aggregate rollup (outerjoin on videos only) should resolve
    FolderCard's needs (count, status-per-video, sort) without ever hitting
    the video_analyses table.  If this test fails it means the route has
    regressed to the old two-level selectinload.
    """
    Session, project_uuid, _ = _setup_db(tmp_path)
    engine = Session.kw["bind"]

    captured: list[str] = []

    from sqlalchemy import event

    def _capture(conn, cursor, statement, parameters, context, executemany):
        captured.append(statement)

    from app.database import get_db
    from app.main import app

    app.dependency_overrides[get_db] = _override_db(Session)
    event.listen(engine, "before_cursor_execute", _capture)
    try:
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await client.get(
                "/api/projects/",
                headers={"Authorization": "Bearer dev-bypass"},
            )
        assert resp.status_code == 200

        # Zero SELECTs against video_analyses — the list endpoint no longer
        # touches that table.
        analysis_selects = [
            s for s in captured
            if "video_analyses" in s and s.lstrip().upper().startswith("SELECT")
        ]
        assert len(analysis_selects) == 0, (
            f"list_projects issued {len(analysis_selects)} SELECT(s) against "
            f"video_analyses — the outerjoin optimisation has been reverted.\n"
            f"Offending statements: {analysis_selects}"
        )

        # Total SELECT count: exactly 1 (the projects+videos outerjoin).
        selects = [s for s in captured if s.lstrip().upper().startswith("SELECT")]
        assert len(selects) == 1, (
            f"Expected exactly 1 SELECT for list_projects (projects+videos outerjoin), "
            f"got {len(selects)}.\nAll SELECTs: {selects}"
        )

        # The single query must touch the videos table (proves the outerjoin
        # is there) but must NOT select any of the blob columns.
        assert "videos" in selects[0], (
            "The projects-list SELECT must join videos. Got: " + selects[0]
        )
        for col in _BLOB_KEYS:
            assert col not in selects[0], (
                f"Blob column '{col}' appeared in list_projects SELECT.\n"
                f"Statement: {selects[0]}"
            )
    finally:
        event.remove(engine, "before_cursor_execute", _capture)
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_get_project_no_video_analyses_table_access(tmp_path):
    """SQL-level regression lock: get_project must NOT touch video_analyses.

    Same guarantee as list_projects — both endpoints now use the
    outerjoin-on-videos-only pattern.
    """
    Session, project_uuid, _ = _setup_db(tmp_path)
    engine = Session.kw["bind"]

    captured: list[str] = []

    from sqlalchemy import event

    def _capture(conn, cursor, statement, parameters, context, executemany):
        captured.append(statement)

    from app.database import get_db
    from app.main import app

    app.dependency_overrides[get_db] = _override_db(Session)
    event.listen(engine, "before_cursor_execute", _capture)
    try:
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await client.get(
                f"/api/projects/{project_uuid}",
                headers={"Authorization": "Bearer dev-bypass"},
            )
        assert resp.status_code == 200

        analysis_selects = [
            s for s in captured
            if "video_analyses" in s and s.lstrip().upper().startswith("SELECT")
        ]
        assert len(analysis_selects) == 0, (
            f"get_project issued {len(analysis_selects)} SELECT(s) against "
            f"video_analyses — regression detected.\nOffending statements: {analysis_selects}"
        )

        # The single query must touch videos.
        selects = [s for s in captured if s.lstrip().upper().startswith("SELECT")]
        assert len(selects) == 1, (
            f"Expected exactly 1 SELECT for get_project, got {len(selects)}.\n"
            f"All SELECTs: {selects}"
        )
        assert "videos" in selects[0], (
            "get_project SELECT must join videos. Got: " + selects[0]
        )
    finally:
        event.remove(engine, "before_cursor_execute", _capture)
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_list_projects_video_stub_shape(tmp_path):
    """JSON shape test: list_projects videos array must contain only id/status/uploaded_at.

    Old backends may send extra fields (VideoListItemResponse with filename,
    analysis, etc.) — the passthrough schema absorbs them. New backends send
    only the stub. This test validates the new shape explicitly.
    """
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
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list) and len(data) == 1
        project = data[0]
        videos = project.get("videos", [])
        assert len(videos) == 1, f"Expected 1 video stub, got {len(videos)}"
        stub = videos[0]

        # Required fields present
        assert "id" in stub, "video stub must have id"
        assert "status" in stub, "video stub must have status"
        assert "uploaded_at" in stub, "video stub must have uploaded_at"
        assert stub["status"] == "analyzed"

        # Heavy fields absent — the route no longer sends them
        heavy_fields = {"filename", "file_size_bytes", "duration_seconds", "error_message", "analysis"}
        for field in heavy_fields:
            assert field not in stub, (
                f"list_projects video stub unexpectedly contains '{field}' — "
                "the VideoStatusStub projection has been widened."
            )
    finally:
        app.dependency_overrides.clear()
