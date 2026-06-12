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

    The video-stub projection (selectinload restricted to id/status/
    uploaded_at) resolves FolderCard's needs (count, status-per-video, sort)
    without ever hitting the video_analyses table.  If this test fails it
    means the route has regressed to the old two-level selectinload.
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
            f"video_analyses — the stub optimisation has been reverted.\n"
            f"Offending statements: {analysis_selects}"
        )

        # Total SELECT count: exactly 2 (projects page + videos IN-list from
        # selectinload).  NOT one-per-project (N+1) and NOT a third SELECT
        # against video_analyses.
        selects = [s for s in captured if s.lstrip().upper().startswith("SELECT")]
        assert len(selects) == 2, (
            f"Expected exactly 2 SELECTs for list_projects (projects + videos "
            f"selectinload), got {len(selects)}.\nAll SELECTs: {selects}"
        )

        # The videos SELECT must be column-restricted: id/status/uploaded_at
        # plus the FK, and nothing heavy.
        videos_select = next(s for s in selects if "FROM videos" in s)
        for col in ("videos.filename", "videos.s3_key", "videos.s3_url",
                    "videos.file_size_bytes", "videos.duration_seconds",
                    "videos.error_message"):
            assert col not in videos_select, (
                f"Column '{col}' appeared in the list_projects videos SELECT — "
                f"the load_only() projection has been widened.\n"
                f"Statement: {videos_select}"
            )
        assert "videos.status" in videos_select
        assert "videos.uploaded_at" in videos_select
    finally:
        event.remove(engine, "before_cursor_execute", _capture)
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_get_project_no_video_analyses_table_access(tmp_path):
    """SQL-level regression lock: get_project must NOT touch video_analyses.

    Same guarantee as list_projects — both endpoints now use the
    column-restricted selectinload (video stub) pattern.
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

        # Exactly 2 SELECTs: project row + videos selectinload.
        selects = [s for s in captured if s.lstrip().upper().startswith("SELECT")]
        assert len(selects) == 2, (
            f"Expected exactly 2 SELECTs for get_project (project + videos "
            f"selectinload), got {len(selects)}.\nAll SELECTs: {selects}"
        )
        assert any("FROM videos" in s for s in selects), (
            f"get_project must load videos. All SELECTs: {selects}"
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


def _seed_extra_projects(Session, n_projects: int, videos_per_project: int) -> list[str]:
    """Insert additional projects (each with N videos) for the dev user.

    Returns the list of project ids (hex format, matching _setup_db).
    """
    from sqlalchemy import text

    db = Session()
    project_ids = []
    try:
        for p in range(n_projects):
            pid = uuid_module.uuid4().hex
            project_ids.append(pid)
            db.execute(
                text(
                    "INSERT INTO projects (id, user_id, name, status) "
                    "VALUES (:id, 'dev_user_local', :name, 'ready')"
                ),
                {"id": pid, "name": f"Seeded Project {p}"},
            )
            for v in range(videos_per_project):
                db.execute(
                    text(
                        "INSERT INTO videos (id, project_id, filename, s3_key, "
                        "s3_url, file_size_bytes, status) VALUES "
                        "(:id, :pid, :fn, 'k', 'https://u', 1000, 'analyzed')"
                    ),
                    {
                        "id": uuid_module.uuid4().hex,
                        "pid": pid,
                        "fn": f"video_{p}_{v}.mp4",
                    },
                )
        db.commit()
    finally:
        db.close()
    return project_ids


@pytest.mark.asyncio
async def test_list_projects_pagination_counts_projects_not_join_rows(tmp_path):
    """Pagination lock: ``limit`` must apply to PROJECTS, not joined video rows.

    Regression guard for the outerjoin + contains_eager + LIMIT anti-pattern:
    SQL LIMIT applies to join ROWS, so 4 projects x 5 videos = 20+ rows would
    be truncated by limit=5 to ~1 project.  With selectinload, limit=5 must
    return min(5, n_projects) full projects each carrying ALL of its videos.
    """
    Session, project_uuid, _ = _setup_db(tmp_path)  # 1 project, 1 video
    _seed_extra_projects(Session, n_projects=4, videos_per_project=5)
    # Total: 5 projects, 21 video rows.

    from app.database import get_db
    from app.main import app

    app.dependency_overrides[get_db] = _override_db(Session)
    try:
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            headers = {"Authorization": "Bearer dev-bypass"}

            # Default limit: all 5 projects come back, every video attached.
            resp = await client.get("/api/projects/", headers=headers)
            assert resp.status_code == 200
            data = resp.json()
            assert len(data) == 5, (
                f"Expected all 5 projects, got {len(data)} — LIMIT is being "
                "applied to join rows instead of projects."
            )
            total_videos = sum(len(p.get("videos", [])) for p in data)
            assert total_videos == 21, (
                f"Expected 21 total video stubs across projects, got {total_videos}"
            )
            # Each seeded project must carry ALL 5 of its videos.
            seeded = [p for p in data if p["name"].startswith("Seeded Project")]
            assert len(seeded) == 4
            for p in seeded:
                assert len(p["videos"]) == 5, (
                    f"Project {p['name']} returned {len(p['videos'])} videos, "
                    "expected 5 — video collection truncated."
                )

            # Explicit limit smaller than the join-row count but >= project
            # count boundary: limit=3 must return exactly 3 PROJECTS (15+
            # join rows would have busted a row-level limit).
            resp = await client.get("/api/projects/?limit=3", headers=headers)
            assert resp.status_code == 200
            page = resp.json()
            assert len(page) == 3, (
                f"limit=3 returned {len(page)} projects — pagination is "
                "counting join rows, not projects."
            )
            for p in page:
                if p["name"].startswith("Seeded Project"):
                    assert len(p["videos"]) == 5, (
                        "Paged project lost videos — collection truncated by "
                        "row-level LIMIT."
                    )

            # skip/limit paging must partition the project set, not rows.
            resp_rest = await client.get("/api/projects/?skip=3&limit=3", headers=headers)
            assert resp_rest.status_code == 200
            rest = resp_rest.json()
            assert len(rest) == 2
            page_ids = {p["id"] for p in page}
            rest_ids = {p["id"] for p in rest}
            assert page_ids.isdisjoint(rest_ids), "skip/limit pages overlap"
            assert len(page_ids | rest_ids) == 5, "skip/limit pages lose projects"
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_get_project_returns_all_videos(tmp_path):
    """get_project must return EVERY video of a multi-video project.

    Regression guard for outerjoin + contains_eager + .first(): .first()
    emits LIMIT 1 which truncates the joined rows to a single video.
    """
    Session, _, _ = _setup_db(tmp_path)
    pid = _seed_extra_projects(Session, n_projects=1, videos_per_project=5)[0]

    from app.database import get_db
    from app.main import app

    app.dependency_overrides[get_db] = _override_db(Session)
    try:
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await client.get(
                f"/api/projects/{uuid_module.UUID(pid)}",
                headers={"Authorization": "Bearer dev-bypass"},
            )
        assert resp.status_code == 200, resp.json()
        videos = resp.json().get("videos", [])
        assert len(videos) == 5, (
            f"get_project returned {len(videos)} of 5 videos — the video "
            "collection was truncated (LIMIT 1 applied to join rows?)."
        )
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_list_projects_zero_video_project(tmp_path):
    """A project with no videos must come back with videos == [] (not missing,
    not null, not crashing)."""
    Session, _, _ = _setup_db(tmp_path)
    pid = _seed_extra_projects(Session, n_projects=1, videos_per_project=0)[0]

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
        assert len(data) == 2  # _setup_db project + the empty one
        empty = next(p for p in data if p["id"] == str(uuid_module.UUID(pid)))
        assert empty["videos"] == [], (
            f"Zero-video project should serialize videos=[], got {empty.get('videos')!r}"
        )
    finally:
        app.dependency_overrides.clear()
