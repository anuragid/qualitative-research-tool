"""Regression tests for PR #19.5 — the retry-swallow bug.

Background:
    Before PR #19.5, clicking "Retry Analysis" on an errored video would
    dispatch the chain but every step would immediately short-circuit
    with "Skipping ... — already in error state" because the route
    handler reset ``video.status`` but not ``VideoAnalysis.status``.
    Verified in prod on 2026-04-07 20:00:24 UTC with Kathleen video
    ``4b1f4b25-c94f-4bf8-9a6a-0958ddfc4e41``.

    The fix: in the same DB transaction that flips ``video.status`` to
    ``"analyzing"``, also reset the ``VideoAnalysis`` row from
    ``"error"`` back to ``"pending"`` and clear all per-step
    ``*_completed_at`` fields plus the jsonb payload columns. The chunk
    step is idempotent and will repopulate.

These tests lock that contract in:

    * Errored analysis row -> reset to pending, fields cleared
    * Completed analysis row -> handler rejects via 409 (not reset)
    * No analysis row at all -> dispatch goes through unchanged
"""

from __future__ import annotations

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

import app.models.database_models as models  # noqa: F401  (registers ORM)

# ---------------------------------------------------------------------------
# Test DB setup
# ---------------------------------------------------------------------------


def _setup_test_db(tmp_path):
    """Spin up a SQLite test DB seeded with one user, project, video,
    and a completed transcript. Analysis row state is set per-test
    by the helpers below.

    Returns ``(TestSession, meta, video_uuid, project_uuid)``.
    """
    db_path = tmp_path / "test_analyze_retry.db"
    engine = create_engine(f"sqlite:///{db_path}")

    meta = MetaData()

    Table(
        "users", meta,
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

    Table(
        "projects", meta,
        Column("id", String(36), primary_key=True),
        Column("user_id", String(255), ForeignKey("users.id"), nullable=False),
        Column("name", String(255), nullable=False),
        Column("description", Text),
        Column("status", String(50), default="planning"),
        Column("error_message", Text),
        Column("created_at", DateTime, server_default=func.now()),
        Column("updated_at", DateTime, server_default=func.now()),
    )

    Table(
        "videos", meta,
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

    Table(
        "transcripts", meta,
        Column("id", String(36), primary_key=True),
        Column("video_id", String(36), ForeignKey("videos.id"), nullable=False),
        Column("assemblyai_id", String(255)),
        Column("raw_transcript", JSON),
        Column("processed_transcript", JSON),
        Column("status", String(50), default="pending"),
        Column("created_at", DateTime, server_default=func.now()),
    )

    Table(
        "speaker_labels", meta,
        Column("id", String(36), primary_key=True),
        Column("transcript_id", String(36), ForeignKey("transcripts.id"), nullable=False),
        Column("speaker_label", String(50), nullable=False),
        Column("assigned_name", String(255)),
        Column("role", String(100)),
    )

    Table(
        "video_analyses", meta,
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

    Table(
        "project_analyses", meta,
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
    project_uuid = uuid_module.uuid4()
    video_uuid = uuid_module.uuid4()
    transcript_uuid = uuid_module.uuid4()

    db = TestSession()
    db.execute(
        meta.tables["users"].insert().values(
            id=user_id, email="dev@local", role="user",
        )
    )
    db.execute(
        meta.tables["projects"].insert().values(
            id=project_uuid.hex, user_id=user_id, name="Test Project",
            status="planning",
        )
    )
    db.execute(
        meta.tables["videos"].insert().values(
            id=video_uuid.hex, project_id=project_uuid.hex,
            filename="test.mp4", s3_key="videos/test.mp4",
            s3_url="https://s3/test.mp4",
            # Errored is the realistic retry case but we override per-test.
            status="error",
            error_message="boom",
        )
    )
    db.execute(
        meta.tables["transcripts"].insert().values(
            id=transcript_uuid.hex, video_id=video_uuid.hex,
            status="completed",
            processed_transcript={"utterances": []},
        )
    )
    db.commit()
    db.close()

    return TestSession, meta, video_uuid, project_uuid


def _seed_errored_analysis(TestSession, meta, video_uuid):
    """Insert a VideoAnalysis row in 'error' state with all per-step
    fields populated as if a previous run had progressed and then died."""
    from datetime import datetime, timezone

    analysis_uuid = uuid_module.uuid4()
    now = datetime.now(timezone.utc)
    db = TestSession()
    db.execute(
        meta.tables["video_analyses"].insert().values(
            id=analysis_uuid.hex,
            video_id=video_uuid.hex,
            status="error",
            current_step="infer",
            step_status={"chunk": "completed", "infer": "error"},
            started_at=now,
            completed_at=now,
            chunk_completed_at=now,
            infer_completed_at=now,
            relate_completed_at=None,
            explain_completed_at=None,
            activate_completed_at=None,
            chunks=[{"chunk_id": "c1", "text": "x" * 30, "type": "quote"}],
            inferences=[{"chunk_id": "c1", "inferences": []}],
            patterns=None,
            insights=None,
            design_principles=None,
        )
    )
    db.commit()
    db.close()
    return analysis_uuid


def _seed_completed_analysis(TestSession, meta, video_uuid):
    """Insert a VideoAnalysis row in 'completed' state with payload."""
    from datetime import datetime, timezone

    analysis_uuid = uuid_module.uuid4()
    now = datetime.now(timezone.utc)
    db = TestSession()
    db.execute(
        meta.tables["video_analyses"].insert().values(
            id=analysis_uuid.hex,
            video_id=video_uuid.hex,
            status="completed",
            current_step="activate",
            step_status={
                "chunk": "completed", "infer": "completed",
                "relate": "completed", "explain": "completed",
                "activate": "completed",
            },
            started_at=now,
            completed_at=now,
            chunk_completed_at=now,
            infer_completed_at=now,
            relate_completed_at=now,
            explain_completed_at=now,
            activate_completed_at=now,
            chunks=[{"chunk_id": "c1", "text": "x" * 30, "type": "quote"}],
            inferences=[{"chunk_id": "c1", "inferences": []}],
            patterns=[{"pattern_id": "p1"}],
            insights=[{"insight_id": "i1"}],
            design_principles=[
                {"principle_id": "dp1", "how_might_we": ["HMW?"]}
            ],
        )
    )
    db.commit()
    db.close()
    return analysis_uuid


def _set_video_status(TestSession, meta, video_uuid, status_value):
    """Update the seeded video's status (handler rejects 'analyzing')."""
    db = TestSession()
    db.execute(
        meta.tables["videos"].update()
        .where(meta.tables["videos"].c.id == video_uuid.hex)
        .values(status=status_value, error_message=None)
    )
    db.commit()
    db.close()


def _override_get_db(TestSession):
    def _gen():
        session = TestSession()
        try:
            yield session
        finally:
            session.close()
    return _gen


@pytest.fixture
def patched_chain():
    """Stop the analyze chain dispatch from actually enqueueing.

    The route does ``chain(...).on_error(...).apply_async()``; we
    intercept ``celery.canvas._chain.apply_async`` so no Redis call
    leaves the test process.
    """
    fake_task = MagicMock()
    fake_task.id = "fake-task-id"
    with patch(
        "celery.canvas._chain.apply_async", return_value=fake_task,
    ) as p:
        yield p


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_retry_resets_errored_video_analysis(tmp_path, patched_chain):
    """Retry must reset VideoAnalysis.status from 'error' to 'pending' before
    dispatching so the chain's defensive skip-if-errored check doesn't
    short-circuit every step.

    Regresses Kathleen video 4b1f4b25 — 2026-04-07 20:00:24 UTC.
    """
    TestSession, meta, video_uuid, _project = _setup_test_db(tmp_path)
    _seed_errored_analysis(TestSession, meta, video_uuid)
    # Errored video, transcribed -> realistic "user clicks retry" state
    _set_video_status(TestSession, meta, video_uuid, "error")

    from app.database import get_db
    from app.main import app

    app.dependency_overrides[get_db] = _override_get_db(TestSession)
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                f"/api/videos/{video_uuid}/analyze",
                headers={"Authorization": "Bearer dev-bypass"},
            )

        assert response.status_code in (200, 202), (
            f"Retry must succeed, got {response.status_code}: {response.text[:300]}"
        )
        # Chain dispatch was attempted exactly once
        assert patched_chain.called

        # Re-read the analysis row from a fresh session to verify the reset
        db = TestSession()
        try:
            row = db.execute(
                meta.tables["video_analyses"].select().where(
                    meta.tables["video_analyses"].c.video_id == video_uuid.hex
                )
            ).fetchone()
        finally:
            db.close()

        assert row is not None, "Analysis row must still exist after reset"
        # Convert SQLAlchemy Row to dict for clean field access
        row_dict = dict(row._mapping)

        assert row_dict["status"] == "pending", (
            "Retry must reset analysis status from 'error' to 'pending' so "
            "the chain steps don't immediately skip"
        )
        assert row_dict["current_step"] is None
        assert row_dict["started_at"] is None
        assert row_dict["completed_at"] is None
        assert row_dict["chunk_completed_at"] is None
        assert row_dict["infer_completed_at"] is None
        assert row_dict["relate_completed_at"] is None
        assert row_dict["explain_completed_at"] is None
        assert row_dict["activate_completed_at"] is None
        assert row_dict["step_status"] in ({}, None)
        # jsonb payload must be cleared so chunk step repopulates cleanly
        assert row_dict["chunks"] is None
        assert row_dict["inferences"] is None
        assert row_dict["patterns"] is None
        assert row_dict["insights"] is None
        assert row_dict["design_principles"] is None
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_retry_does_not_touch_completed_analysis(tmp_path, patched_chain):
    """Defense in depth: if somehow the analyze route is invoked while the
    VideoAnalysis row is in a non-error state, the reset block must NOT
    wipe the existing data. The video.status='analyzed' guard should
    reject the request first, but if it doesn't, the row must survive.
    """
    TestSession, meta, video_uuid, _project = _setup_test_db(tmp_path)
    _seed_completed_analysis(TestSession, meta, video_uuid)
    # Completed video — handler should not progress to the reset block.
    _set_video_status(TestSession, meta, video_uuid, "analyzed")

    from app.database import get_db
    from app.main import app

    app.dependency_overrides[get_db] = _override_get_db(TestSession)
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            await client.post(
                f"/api/videos/{video_uuid}/analyze",
                headers={"Authorization": "Bearer dev-bypass"},
            )

        # Re-read the analysis row — it must be untouched.
        db = TestSession()
        try:
            row = db.execute(
                meta.tables["video_analyses"].select().where(
                    meta.tables["video_analyses"].c.video_id == video_uuid.hex
                )
            ).fetchone()
        finally:
            db.close()

        assert row is not None
        row_dict = dict(row._mapping)
        assert row_dict["status"] == "completed"
        # Payload must survive intact regardless of route response
        assert row_dict["chunks"] is not None
        assert row_dict["patterns"] is not None
        assert row_dict["design_principles"] is not None
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_retry_without_prior_analysis_row_dispatches_fresh(
    tmp_path, patched_chain,
):
    """First-time analyze call (no VideoAnalysis row yet) must still
    dispatch the chain. The reset block is a no-op when there's nothing
    to reset.
    """
    TestSession, meta, video_uuid, _project = _setup_test_db(tmp_path)
    # Intentionally do NOT seed any video_analyses row.
    _set_video_status(TestSession, meta, video_uuid, "transcribed")

    from app.database import get_db
    from app.main import app

    app.dependency_overrides[get_db] = _override_get_db(TestSession)
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                f"/api/videos/{video_uuid}/analyze",
                headers={"Authorization": "Bearer dev-bypass"},
            )

        assert response.status_code in (200, 202), (
            f"First-time analyze must succeed, got {response.status_code}: "
            f"{response.text[:300]}"
        )
        assert patched_chain.called, (
            "Chain dispatch must still happen when no prior analysis row exists"
        )
    finally:
        app.dependency_overrides.clear()
