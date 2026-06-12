"""Route-level tests for cross-video ("project") analysis retry.

Regression coverage for the silent-no-op retry bug: when a
``ProjectAnalysis`` row is in ``error`` status and the user clicks
retry, ``trigger_project_analysis`` must reset the row to a runnable
state and clear the stale ``cross_video_*`` result blobs BEFORE
dispatching the chain. Otherwise the first chain link
(``analyze_cross_relate_step``) sees ``status == "error"`` in its
precheck and returns ``{"status": "skipped"}`` — the chain "succeeds",
the row stays ``error`` forever, and the user can't recover without a DB
edit.

Mirrors the video retry path (videos.py ~691-712 + PR #19.5) and the
test harness in ``test_projects_routes_analysis_not_started.py`` (explicit
MetaData JSON-column tables so the rows round-trip through SQLite without
the ARRAY(UUID) problem the ORM model has).
"""

import os
import uuid as uuid_module
from unittest.mock import MagicMock, patch

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

os.environ.setdefault("APP_ENV", "development")
os.environ.setdefault("DEBUG", "false")

import app.models.database_models as models  # noqa: F401,E402


def _build_meta() -> MetaData:
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

    return meta


def _setup_test_db(tmp_path, *, pa_status: str):
    """Build a SQLite DB with one project, one completed video analysis,
    and one ``project_analyses`` row in ``pa_status`` carrying stale
    cross-video blobs. Returns (TestSession, ids)."""
    db_path = tmp_path / "project_retry.db"
    engine = create_engine(f"sqlite:///{db_path}")
    meta = _build_meta()
    meta.create_all(bind=engine)
    TestSession = sessionmaker(autocommit=False, autoflush=False, bind=engine)

    user_id = "dev_user_local"
    project_uuid = uuid_module.uuid4()
    video_uuid = uuid_module.uuid4()
    va_uuid = uuid_module.uuid4()
    pa_uuid = uuid_module.uuid4()

    db = TestSession()
    db.execute(meta.tables["users"].insert().values(
        id=user_id, email="dev@local", role="user"
    ))
    db.execute(meta.tables["projects"].insert().values(
        id=project_uuid.hex, user_id=user_id, name="HAIC", status="ready"
    ))
    db.execute(meta.tables["videos"].insert().values(
        id=video_uuid.hex, project_id=project_uuid.hex, filename="v.mp4",
        s3_key="k", s3_url="u", file_size_bytes=1, status="analyzed",
    ))
    db.execute(meta.tables["video_analyses"].insert().values(
        id=va_uuid.hex, video_id=video_uuid.hex, status="completed",
        patterns=[{"id": "P1"}], insights=[{"id": "I1"}],
        design_principles=[{"id": "DP1"}],
    ))
    db.execute(meta.tables["project_analyses"].insert().values(
        id=pa_uuid.hex,
        project_id=project_uuid.hex,
        video_ids=[video_uuid.hex],
        status=pa_status,
        # Stale partial results from the prior failed/old run.
        cross_video_patterns=[{"id": "STALE_CP"}],
        cross_video_insights=[{"id": "STALE_CI"}],
        cross_video_principles=[{"id": "STALE_CDP"}],
    ))
    db.commit()
    db.close()

    return TestSession, meta, {
        "project": project_uuid,
        "pa": pa_uuid,
    }


def _override_db(TestSession):
    def _gen():
        session = TestSession()
        try:
            yield session
        finally:
            session.close()
    return _gen


def _make_mock_chain():
    """A patched ``celery.chain`` that records dispatch without running
    anything. The route does ``chain(...).on_error(...).apply_async()``."""
    mock_chain = MagicMock(name="chain")
    pipeline = MagicMock(name="pipeline")
    mock_chain.return_value = pipeline
    pipeline.on_error.return_value = pipeline
    pipeline.apply_async.return_value = MagicMock(id="fake-task-id")
    return mock_chain, pipeline


@pytest.mark.asyncio
async def test_retry_resets_errored_row_and_dispatches(tmp_path):
    """Seed a ProjectAnalysis in ``error`` with stale blobs, POST the
    trigger route, and assert: (1) the chain WAS dispatched (not
    skipped), (2) the row is reset to a runnable state (processing),
    (3) the stale ``cross_video_*`` blobs are cleared so the new run
    doesn't mix old partial results in."""
    TestSession, meta, ids = _setup_test_db(tmp_path, pa_status="error")

    from app.database import get_db
    from app.dependencies.byok_gate import require_byok_credits
    from app.main import app

    app.dependency_overrides[get_db] = _override_db(TestSession)
    app.dependency_overrides[require_byok_credits] = lambda: None
    mock_chain, pipeline = _make_mock_chain()
    try:
        with patch("celery.chain", mock_chain):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                response = await client.post(
                    f"/api/projects/{ids['project']}/analyze",
                    headers={"Authorization": "Bearer dev-bypass"},
                )

        assert response.status_code == 202, (
            f"Expected 202, got {response.status_code}: {response.text}"
        )

        # The chain MUST have been dispatched — retry is not a no-op.
        assert mock_chain.called, "Chain was not dispatched — retry silently skipped"
        assert pipeline.apply_async.called

        # The row must be reset out of error to a runnable state and the
        # stale partial blobs cleared.
        verify = TestSession()
        try:
            row = verify.execute(
                meta.tables["project_analyses"].select().where(
                    meta.tables["project_analyses"].c.id == ids["pa"].hex
                )
            ).mappings().first()
        finally:
            verify.close()

        assert row is not None
        assert row["status"] == "processing", (
            f"Errored row not reset; still {row['status']!r}"
        )
        assert row["cross_video_patterns"] in (None, []), (
            f"Stale cross_video_patterns not cleared: {row['cross_video_patterns']!r}"
        )
        assert row["cross_video_insights"] in (None, [])
        assert row["cross_video_principles"] in (None, [])
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_retry_while_processing_does_not_double_dispatch(tmp_path):
    """Guard: a ProjectAnalysis already mid-flight (status=processing) +
    a racing retry click must NOT dispatch a second chain. Mirror of the
    video route's 409 guard (videos.py ~647-651). The clean contract is
    either a 409 or a no-dispatch — we assert no second chain is fired
    and (if rejected) a 409 status."""
    TestSession, meta, ids = _setup_test_db(tmp_path, pa_status="processing")

    from app.database import get_db
    from app.dependencies.byok_gate import require_byok_credits
    from app.main import app

    app.dependency_overrides[get_db] = _override_db(TestSession)
    app.dependency_overrides[require_byok_credits] = lambda: None
    mock_chain, pipeline = _make_mock_chain()
    try:
        with patch("celery.chain", mock_chain):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                response = await client.post(
                    f"/api/projects/{ids['project']}/analyze",
                    headers={"Authorization": "Bearer dev-bypass"},
                )

        assert response.status_code == 409, (
            f"Expected 409 conflict while processing, got "
            f"{response.status_code}: {response.text}"
        )
        assert not mock_chain.called, (
            "A second chain was dispatched while one is already in flight"
        )

        # The in-flight row must be untouched (still processing, blobs intact).
        verify = TestSession()
        try:
            row = verify.execute(
                meta.tables["project_analyses"].select().where(
                    meta.tables["project_analyses"].c.id == ids["pa"].hex
                )
            ).mappings().first()
        finally:
            verify.close()
        assert row["status"] == "processing"
    finally:
        app.dependency_overrides.clear()
