"""Tests for the BYOK pre-flight gate (Worktree B).

Covers the four moving pieces:

1. The :func:`require_byok_credits` FastAPI dependency itself — unit
   tests that exercise each branch (non-BYOK pass-through, healthy BYOK,
   zero-balance 402, degraded ``OpenRouterBalanceError`` pass-through).

2. The :func:`resolve_byok_with_preflight` service function — same
   branches at the service level so the gate dependency and the task
   pre-flight share semantics.

3. Route integration tests — every analyze-triggering endpoint must
   honour the gate. We patch ``get_cached_balance`` so no network call
   leaves the test process.

4. Task pre-flight unit tests — confirms that the chunk step body
   raises :class:`InsufficientCreditsNonRetryable` when the pre-flight
   resolver reports zero balance, and that the structured
   ``video.error_message`` payload is stamped with
   ``error_type=insufficient_credits``.

The OpenRouter balance service itself is **stubbed** in this worktree
(see ``app/services/openrouter_balance.py``); the real implementation
ships with Worktree A. All tests therefore use ``MagicMock`` /
``patch.object`` to inject return values — they do not depend on
Worktree A landing first.
"""

from __future__ import annotations

import json
import uuid as uuid_module
from datetime import datetime, timezone
from typing import Any
from unittest.mock import MagicMock, patch

import pytest
from fastapi import HTTPException
from httpx import ASGITransport, AsyncClient
from sqlalchemy import (
    JSON,
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
    create_engine,
)
from sqlalchemy.orm import sessionmaker
from sqlalchemy.sql import func

import app.models.database_models as models  # noqa: F401  (registers ORM)
from app.dependencies.byok_gate import require_byok_credits
from app.services.byok_service import (
    InsufficientCreditsError,
    resolve_byok_with_preflight,
)
from app.services.openrouter_balance import BalanceInfo, OpenRouterBalanceError

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_balance(*, has_credits: bool, balance_remaining: float = 0.0) -> BalanceInfo:
    """Build a deterministic BalanceInfo for tests.

    Mirrors the contract shape in ``docs/byok-balance-contract.md``
    exactly so when Worktree A swaps in the real BalanceInfo, these
    fixtures keep working.
    """
    return BalanceInfo(
        total_credits=10.0 if has_credits else 5.0,
        total_usage=10.0 - balance_remaining if has_credits else 5.0,
        balance_remaining=balance_remaining,
        is_free_tier=False,
        key_label="sk-or-v1-test...key",
        key_limit=None,
        key_limit_remaining=None,
        has_credits=has_credits,
        checked_at=datetime(2026, 4, 6, 22, 0, 0, tzinfo=timezone.utc),
        stale=False,
    )


def _setup_test_db(tmp_path):
    """Spin up a SQLite test DB seeded with one user, project, video,
    transcript, and an INFER-ready analysis row.

    Returns ``(TestSession, meta, video_uuid, project_uuid)``.
    """
    db_path = tmp_path / "test_byok_gate.db"
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
        # BYOK balance columns added by Worktree A
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
    analysis_uuid = uuid_module.uuid4()

    project_id = project_uuid.hex
    video_id = video_uuid.hex
    transcript_id = transcript_uuid.hex
    analysis_id = analysis_uuid.hex

    db = TestSession()
    db.execute(
        meta.tables["users"].insert().values(
            id=user_id, email="dev@local", role="user",
        )
    )
    db.execute(
        meta.tables["projects"].insert().values(
            id=project_id, user_id=user_id, name="Test Project", status="planning",
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
    # Pre-seed an analysis row so step routes have something to advance
    db.execute(
        meta.tables["video_analyses"].insert().values(
            id=analysis_id, video_id=video_id, status="pending",
            current_step="chunk", step_status={},
            chunks=[{"id": "c1", "text": "hi"}],
            inferences=[{"id": "i1", "text": "hi"}],
            patterns=[{"id": "p1", "text": "hi"}],
            insights=[{"id": "in1", "text": "hi"}],
        )
    )
    db.commit()
    db.close()

    return TestSession, meta, video_uuid, project_uuid


def _set_byok_user(TestSession, meta, *, with_key: bool = True) -> None:
    """Toggle the seeded ``dev_user_local`` between BYOK and non-BYOK."""
    db = TestSession()
    db.execute(
        meta.tables["users"].update()
        .where(meta.tables["users"].c.id == "dev_user_local")
        .values(
            encrypted_api_key="dummy-encrypted-blob" if with_key else None,
            key_hint="abcd" if with_key else None,
            preferred_model="meta-llama/llama-4-scout" if with_key else None,
            key_validated_at=datetime.now(timezone.utc) if with_key else None,
        )
    )
    db.commit()
    db.close()


# ---------------------------------------------------------------------------
# Unit tests: require_byok_credits dependency
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_require_byok_credits_non_byok_user_returns_none():
    """Non-BYOK users (no encrypted_api_key) skip the gate entirely.

    No call to ``get_cached_balance`` is made — proves the gate is a
    true no-op for the non-BYOK code path.
    """
    user = MagicMock()
    user.encrypted_api_key = None

    db = MagicMock()
    db.query.return_value.filter.return_value.first.return_value = user

    with patch(
        "app.dependencies.byok_gate.get_cached_balance",
    ) as mock_get_balance:
        result = await require_byok_credits(
            request=MagicMock(), db=db, current_user_id="user_xyz",
        )

    assert result is None
    mock_get_balance.assert_not_called()


@pytest.mark.asyncio
async def test_require_byok_credits_unknown_user_returns_none():
    """If the user row doesn't exist (race / orphaned token), gate
    short-circuits to a pass-through. Lets normal auth handle it later.
    """
    db = MagicMock()
    db.query.return_value.filter.return_value.first.return_value = None

    with patch(
        "app.dependencies.byok_gate.get_cached_balance",
    ) as mock_get_balance:
        result = await require_byok_credits(
            request=MagicMock(), db=db, current_user_id="user_ghost",
        )

    assert result is None
    mock_get_balance.assert_not_called()


@pytest.mark.asyncio
async def test_require_byok_credits_healthy_balance_returns_balance():
    """BYOK user with positive balance: dependency returns the
    BalanceInfo so handlers can read it.
    """
    user = MagicMock()
    user.encrypted_api_key = "encrypted-blob"

    db = MagicMock()
    db.query.return_value.filter.return_value.first.return_value = user

    healthy = _make_balance(has_credits=True, balance_remaining=7.25)

    with patch(
        "app.dependencies.byok_gate.get_cached_balance",
        return_value=healthy,
    ) as mock_get_balance:
        result = await require_byok_credits(
            request=MagicMock(), db=db, current_user_id="user_xyz",
        )

    assert result is healthy
    # Always-fresh check at the route layer
    mock_get_balance.assert_called_once()
    _, kwargs = mock_get_balance.call_args
    assert kwargs.get("max_age_seconds") == 0


@pytest.mark.asyncio
async def test_require_byok_credits_zero_balance_raises_402():
    """BYOK user with zero balance: dependency raises HTTP 402 with the
    structured detail body the frontend renders as the "Add credits" alert.
    """
    user = MagicMock()
    user.encrypted_api_key = "encrypted-blob"

    db = MagicMock()
    db.query.return_value.filter.return_value.first.return_value = user

    empty = _make_balance(has_credits=False, balance_remaining=0.0)

    with patch(
        "app.dependencies.byok_gate.get_cached_balance",
        return_value=empty,
    ):
        with pytest.raises(HTTPException) as exc_info:
            await require_byok_credits(
                request=MagicMock(), db=db, current_user_id="user_xyz",
            )

    err = exc_info.value
    assert err.status_code == 402
    detail = err.detail
    assert isinstance(detail, dict)
    assert detail["error_type"] == "insufficient_credits"
    assert "openrouter.ai/settings/credits" in detail["message"]
    assert detail["balance"]["balance_remaining"] == 0.0
    assert detail["balance"]["has_credits"] is False
    # Sanity: as_dict() roundtrip preserves the contract shape
    assert "checked_at" in detail["balance"]


@pytest.mark.asyncio
async def test_require_byok_credits_db_query_failure_passes_through():
    """Defense in depth: a DB-level failure on the user lookup (e.g.
    transient connection blip in prod, missing tables in tests) must
    degrade to a pass-through, not 500 the request.
    """
    db = MagicMock()
    db.query.return_value.filter.return_value.first.side_effect = RuntimeError(
        "OperationalError: no such table: users",
    )

    with patch(
        "app.dependencies.byok_gate.get_cached_balance",
    ) as mock_get_balance:
        result = await require_byok_credits(
            request=MagicMock(), db=db, current_user_id="user_xyz",
        )

    assert result is None
    mock_get_balance.assert_not_called()


@pytest.mark.asyncio
async def test_require_byok_credits_balance_fetch_error_passes_through():
    """If OpenRouter is unreachable, the gate logs and passes through
    so the task layer can surface any mid-process 402.
    """
    user = MagicMock()
    user.encrypted_api_key = "encrypted-blob"

    db = MagicMock()
    db.query.return_value.filter.return_value.first.return_value = user

    with patch(
        "app.dependencies.byok_gate.get_cached_balance",
        side_effect=OpenRouterBalanceError("upstream 503"),
    ):
        result = await require_byok_credits(
            request=MagicMock(), db=db, current_user_id="user_xyz",
        )

    assert result is None  # degraded pass-through


# ---------------------------------------------------------------------------
# Unit tests: resolve_byok_with_preflight service function
# ---------------------------------------------------------------------------


def test_resolve_byok_with_preflight_non_byok_returns_none_triple():
    """Non-BYOK callers (user_id is None or no key configured) get the
    triple of Nones — no balance call attempted.
    """
    db = MagicMock()
    with patch(
        "app.services.byok_service.resolve_byok",
        return_value=(None, None),
    ), patch(
        "app.services.byok_service.get_cached_balance",
    ) as mock_get_balance:
        api_key, model, balance = resolve_byok_with_preflight(db, None)

    assert api_key is None
    assert model is None
    assert balance is None
    mock_get_balance.assert_not_called()


def test_resolve_byok_with_preflight_zero_balance_raises():
    """A BYOK user with a known-zero balance raises
    InsufficientCreditsError carrying the BalanceInfo.
    """
    db = MagicMock()
    db.query.return_value.filter.return_value.first.return_value = MagicMock(spec=models.User)

    empty = _make_balance(has_credits=False, balance_remaining=0.0)

    with patch(
        "app.services.byok_service.resolve_byok",
        return_value=("sk-or-v1-real", "meta-llama/llama-4-scout"),
    ), patch(
        "app.services.byok_service.get_cached_balance",
        return_value=empty,
    ):
        with pytest.raises(InsufficientCreditsError) as exc_info:
            resolve_byok_with_preflight(db, "user_xyz", force_refresh=True)

    assert exc_info.value.balance is empty


def test_resolve_byok_with_preflight_healthy_returns_triple():
    """Healthy BYOK user gets back ``(api_key, model, balance)``."""
    db = MagicMock()
    db.query.return_value.filter.return_value.first.return_value = MagicMock(spec=models.User)

    healthy = _make_balance(has_credits=True, balance_remaining=5.0)

    with patch(
        "app.services.byok_service.resolve_byok",
        return_value=("sk-or-v1-real", "meta-llama/llama-4-scout"),
    ), patch(
        "app.services.byok_service.get_cached_balance",
        return_value=healthy,
    ):
        api_key, model, balance = resolve_byok_with_preflight(
            db, "user_xyz", force_refresh=False,
        )

    assert api_key == "sk-or-v1-real"
    assert model == "meta-llama/llama-4-scout"
    assert balance is healthy


def test_resolve_byok_with_preflight_balance_error_degrades():
    """When balance fetch raises, return ``(api_key, model, None)`` —
    the task will surface any mid-process 402 if the key really is dead.
    """
    db = MagicMock()
    db.query.return_value.filter.return_value.first.return_value = MagicMock(spec=models.User)

    with patch(
        "app.services.byok_service.resolve_byok",
        return_value=("sk-or-v1-real", "meta-llama/llama-4-scout"),
    ), patch(
        "app.services.byok_service.get_cached_balance",
        side_effect=OpenRouterBalanceError("HTTP 503"),
    ):
        api_key, model, balance = resolve_byok_with_preflight(
            db, "user_xyz", force_refresh=True,
        )

    assert api_key == "sk-or-v1-real"
    assert model == "meta-llama/llama-4-scout"
    assert balance is None


def test_resolve_byok_with_preflight_force_refresh_uses_max_age_zero():
    """``force_refresh=True`` translates into ``max_age_seconds=0`` so
    the gate at the route boundary always sees a live number.
    """
    db = MagicMock()
    db.query.return_value.filter.return_value.first.return_value = MagicMock(spec=models.User)

    healthy = _make_balance(has_credits=True, balance_remaining=5.0)

    with patch(
        "app.services.byok_service.resolve_byok",
        return_value=("sk-or-v1-real", "model"),
    ), patch(
        "app.services.byok_service.get_cached_balance",
        return_value=healthy,
    ) as mock_get_balance:
        resolve_byok_with_preflight(db, "user_xyz", force_refresh=True)

    mock_get_balance.assert_called_once()
    _, kwargs = mock_get_balance.call_args
    assert kwargs.get("max_age_seconds") == 0


def test_resolve_byok_with_preflight_no_force_refresh_uses_default_ttl():
    """Without ``force_refresh``, no explicit ``max_age_seconds`` is
    passed so the cache TTL default applies. Steps 2-5 use this path.
    """
    db = MagicMock()
    db.query.return_value.filter.return_value.first.return_value = MagicMock(spec=models.User)

    healthy = _make_balance(has_credits=True, balance_remaining=5.0)

    with patch(
        "app.services.byok_service.resolve_byok",
        return_value=("sk-or-v1-real", "model"),
    ), patch(
        "app.services.byok_service.get_cached_balance",
        return_value=healthy,
    ) as mock_get_balance:
        resolve_byok_with_preflight(db, "user_xyz", force_refresh=False)

    mock_get_balance.assert_called_once()
    _, kwargs = mock_get_balance.call_args
    assert "max_age_seconds" not in kwargs


# ---------------------------------------------------------------------------
# Route integration tests
# ---------------------------------------------------------------------------


# Routes that should be gated. Each tuple is (path_template, requires_project_id_only).
# The video routes use video_uuid; the project route uses project_uuid.
_VIDEO_GATED_ROUTES = [
    "/api/videos/{video_id}/analyze",
    "/api/videos/{video_id}/analyze/chunk",
    "/api/videos/{video_id}/analyze/infer",
    "/api/videos/{video_id}/analyze/relate",
    "/api/videos/{video_id}/analyze/explain",
    "/api/videos/{video_id}/analyze/activate",
]

_PROJECT_GATED_ROUTES = [
    "/api/projects/{project_id}/analyze",
]


def _override_get_db(TestSession):
    def _gen():
        session = TestSession()
        try:
            yield session
        finally:
            session.close()
    return _gen


@pytest.fixture
def patched_celery():
    """Stop ``.delay()`` from actually enqueueing.

    Step routes import their task lazily inside the handler body, so we
    patch each task callable in the source modules.
    """
    fake_task = MagicMock()
    fake_task.id = "fake-task-id"

    patches = [
        patch("app.tasks.analysis_tasks.analyze_video_task.delay", return_value=fake_task),
        patch("app.tasks.analysis_tasks.analyze_project_task.delay", return_value=fake_task),
        patch("app.tasks.analysis_steps.analyze_chunk_step.delay", return_value=fake_task),
        patch("app.tasks.analysis_steps.analyze_infer_step.delay", return_value=fake_task),
        patch("app.tasks.analysis_steps.analyze_relate_step.delay", return_value=fake_task),
        patch("app.tasks.analysis_steps.analyze_explain_step.delay", return_value=fake_task),
        patch("app.tasks.analysis_steps.analyze_activate_step.delay", return_value=fake_task),
    ]
    for p in patches:
        p.start()
    try:
        yield fake_task
    finally:
        for p in patches:
            p.stop()


@pytest.mark.asyncio
@pytest.mark.parametrize("path_template", _VIDEO_GATED_ROUTES)
async def test_video_routes_block_byok_user_with_zero_balance(
    tmp_path, patched_celery, path_template,
):
    """Every video analyze route returns 402 with the structured detail
    when a BYOK user has zero credits.
    """
    TestSession, meta, video_uuid, project_uuid = _setup_test_db(tmp_path)
    _set_byok_user(TestSession, meta, with_key=True)

    empty = _make_balance(has_credits=False, balance_remaining=0.0)

    from app.database import get_db
    from app.main import app

    app.dependency_overrides[get_db] = _override_get_db(TestSession)
    try:
        with patch(
            "app.dependencies.byok_gate.get_cached_balance",
            return_value=empty,
        ):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                url = path_template.format(video_id=str(video_uuid))
                response = await client.post(
                    url, headers={"Authorization": "Bearer dev-bypass"},
                )

        assert response.status_code == 402, (
            f"Expected 402 from {path_template}, got "
            f"{response.status_code}: {response.text[:200]}"
        )
        body = response.json()
        # FastAPI wraps HTTPException(detail=dict) as {"detail": dict}
        detail = body.get("detail", body)
        assert detail["error_type"] == "insufficient_credits"
        assert detail["balance"]["balance_remaining"] == 0.0
        assert detail["balance"]["has_credits"] is False
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_project_route_blocks_byok_user_with_zero_balance(
    tmp_path, patched_celery,
):
    """The project cross-analysis route honours the same gate."""
    TestSession, meta, video_uuid, project_uuid = _setup_test_db(tmp_path)
    _set_byok_user(TestSession, meta, with_key=True)

    # The project route requires at least one completed video analysis
    db = TestSession()
    db.execute(
        meta.tables["video_analyses"].update()
        .where(meta.tables["video_analyses"].c.video_id == video_uuid.hex)
        .values(status="completed")
    )
    db.commit()
    db.close()

    empty = _make_balance(has_credits=False, balance_remaining=0.0)

    from app.database import get_db
    from app.main import app

    app.dependency_overrides[get_db] = _override_get_db(TestSession)
    try:
        with patch(
            "app.dependencies.byok_gate.get_cached_balance",
            return_value=empty,
        ):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                response = await client.post(
                    f"/api/projects/{project_uuid}/analyze",
                    headers={"Authorization": "Bearer dev-bypass"},
                )

        assert response.status_code == 402, (
            f"Expected 402, got {response.status_code}: {response.text[:200]}"
        )
        detail = response.json().get("detail", {})
        assert detail["error_type"] == "insufficient_credits"
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_video_analyze_passes_for_byok_user_with_credits(
    tmp_path, patched_celery,
):
    """Healthy BYOK user: route returns 202 and the task is enqueued."""
    TestSession, meta, video_uuid, project_uuid = _setup_test_db(tmp_path)
    _set_byok_user(TestSession, meta, with_key=True)

    healthy = _make_balance(has_credits=True, balance_remaining=7.25)

    from app.database import get_db
    from app.main import app

    app.dependency_overrides[get_db] = _override_get_db(TestSession)
    try:
        with patch(
            "app.dependencies.byok_gate.get_cached_balance",
            return_value=healthy,
        ):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                response = await client.post(
                    f"/api/videos/{video_uuid}/analyze",
                    headers={"Authorization": "Bearer dev-bypass"},
                )

        assert response.status_code == 202, (
            f"Expected 202, got {response.status_code}: {response.text[:200]}"
        )
        assert patched_celery.id == "fake-task-id"
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_video_analyze_passes_for_non_byok_user_no_balance_call(
    tmp_path, patched_celery,
):
    """Non-BYOK user: route enqueues the task and **no balance call is
    made** — proves the gate is invisible to non-BYOK users.
    """
    TestSession, meta, video_uuid, project_uuid = _setup_test_db(tmp_path)
    _set_byok_user(TestSession, meta, with_key=False)

    from app.database import get_db
    from app.main import app

    app.dependency_overrides[get_db] = _override_get_db(TestSession)
    try:
        with patch(
            "app.dependencies.byok_gate.get_cached_balance",
        ) as mock_get_balance:
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                response = await client.post(
                    f"/api/videos/{video_uuid}/analyze",
                    headers={"Authorization": "Bearer dev-bypass"},
                )

        assert response.status_code == 202, (
            f"Expected 202 for non-BYOK user, got "
            f"{response.status_code}: {response.text[:200]}"
        )
        mock_get_balance.assert_not_called()
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_video_analyze_degraded_balance_fetch_passes_through(
    tmp_path, patched_celery,
):
    """Defense in depth: when balance fetching errors out, the gate
    passes through and lets the task layer worry about mid-process 402.
    """
    TestSession, meta, video_uuid, project_uuid = _setup_test_db(tmp_path)
    _set_byok_user(TestSession, meta, with_key=True)

    from app.database import get_db
    from app.main import app

    app.dependency_overrides[get_db] = _override_get_db(TestSession)
    try:
        with patch(
            "app.dependencies.byok_gate.get_cached_balance",
            side_effect=OpenRouterBalanceError("HTTP 503"),
        ):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                response = await client.post(
                    f"/api/videos/{video_uuid}/analyze",
                    headers={"Authorization": "Bearer dev-bypass"},
                )

        assert response.status_code == 202, (
            f"Expected 202 (degraded pass-through), got "
            f"{response.status_code}: {response.text[:200]}"
        )
    finally:
        app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# Task pre-flight unit tests (chunk step body)
# ---------------------------------------------------------------------------


def _make_video_state(video_id: str) -> dict[str, Any]:
    analysis = MagicMock()
    analysis.step_status = {}
    return {
        "video_id": video_id,
        "transcript": {"utterances": [{"speaker": "A", "start": 0, "text": "hi"}]},
        "speaker_labels": {"A": "Alice"},
        "speaker_roles": {"A": "participant"},
        "analysis": analysis,
    }


def _run_chunk_step(*, preflight_side_effect=None, preflight_return=None):
    """Run the chunk step body with the pre-flight resolver mocked.

    Bypasses Celery's autoretry wrapper by calling ``_orig_run`` directly.
    """
    from app.tasks import analysis_steps

    video_id = str(uuid_module.uuid4())
    mock_self = MagicMock()
    mock_self.db = MagicMock()

    state = _make_video_state(video_id)

    kwargs: dict[str, Any] = {}
    if preflight_side_effect is not None:
        kwargs["side_effect"] = preflight_side_effect
    else:
        kwargs["return_value"] = preflight_return or (None, None, None)

    with patch.object(analysis_steps, "get_video_analysis_state", return_value=state), \
         patch.object(analysis_steps, "resolve_byok_with_preflight", **kwargs), \
         patch.object(analysis_steps, "chunk_node", return_value={"chunks": [{"id": "c1"}]}), \
         patch.object(analysis_steps, "_update_analysis_error") as mock_err_writer:
        unbound = analysis_steps.analyze_chunk_step._orig_run.__func__
        try:
            result = unbound(mock_self, video_id, "user_xyz")
        except Exception as exc:
            return {"raised": exc, "err_writer": mock_err_writer}
    return {"result": result, "err_writer": mock_err_writer}


def test_chunk_step_preflight_zero_balance_raises_non_retryable():
    """Pre-flight zero-balance → InsufficientCreditsNonRetryable."""
    from app.tasks.analysis_steps import InsufficientCreditsNonRetryable

    empty = _make_balance(has_credits=False, balance_remaining=0.0)

    outcome = _run_chunk_step(
        preflight_side_effect=InsufficientCreditsError(empty),
    )

    assert "raised" in outcome
    raised = outcome["raised"]
    assert isinstance(raised, InsufficientCreditsNonRetryable)
    assert raised.balance is empty
    # Error writer was invoked with the exception so it can stamp the
    # structured "insufficient_credits" payload onto video.error_message.
    outcome["err_writer"].assert_called_once()
    args, kwargs = outcome["err_writer"].call_args
    # Accept either positional or kw form of the exc argument
    passed_exc = kwargs.get("exc") if "exc" in kwargs else (args[-1] if args else None)
    assert passed_exc is raised, (
        f"Expected the raised exception to be passed to _update_analysis_error, "
        f"got {passed_exc!r}"
    )


def test_chunk_step_preflight_healthy_proceeds():
    """Healthy BYOK user → chunk step runs to completion."""
    healthy = _make_balance(has_credits=True, balance_remaining=5.0)

    outcome = _run_chunk_step(
        preflight_return=("sk-or-v1-real", "model", healthy),
    )

    assert "result" in outcome
    assert outcome["result"]["status"] == "success"


def test_chunk_step_preflight_non_byok_proceeds():
    """Non-BYOK user (no key configured) → chunk step runs to completion
    using the shared Methodex key fallback.
    """
    outcome = _run_chunk_step(preflight_return=(None, None, None))

    assert "result" in outcome
    assert outcome["result"]["status"] == "success"


# ---------------------------------------------------------------------------
# error_message stamping
# ---------------------------------------------------------------------------


def test_update_analysis_error_writes_insufficient_credits_payload():
    """``_update_analysis_error`` stamps a structured error_message JSON
    when the exception is :class:`InsufficientCreditsNonRetryable`.

    Other exception types leave ``error_message`` untouched (preserves
    historical step-task behaviour where the full pipeline path is
    responsible for the structured payload).
    """
    from app.tasks.analysis_steps import (
        InsufficientCreditsNonRetryable,
        _update_analysis_error,
    )

    empty = _make_balance(has_credits=False, balance_remaining=0.0)
    exc = InsufficientCreditsNonRetryable("preflight failure", balance=empty)

    db = MagicMock()
    fake_video = MagicMock()
    fake_video.status = "analyzing"
    fake_video.error_message = None

    fake_analysis = MagicMock()
    fake_analysis.step_status = {}

    # Two query() calls in _update_analysis_error: VideoAnalysis then Video
    db.query.return_value.filter.return_value.first.side_effect = [
        fake_analysis,
        fake_video,
    ]

    _update_analysis_error(db, str(uuid_module.uuid4()), "chunk", exc=exc)

    assert fake_video.error_message is not None
    payload = json.loads(fake_video.error_message)
    assert payload["error_type"] == "insufficient_credits"
    assert payload["retryable"] is False
    assert payload["step"] == "chunk"
    assert payload["balance"]["balance_remaining"] == 0.0
    assert payload["balance"]["has_credits"] is False


def test_update_analysis_error_other_exceptions_leave_error_message_unchanged():
    """Non-InsufficientCreditsNonRetryable exceptions don't write
    error_message — preserves the existing pre-Phase-B behaviour.
    """
    from app.tasks.analysis_steps import _update_analysis_error

    db = MagicMock()
    fake_video = MagicMock()
    fake_video.status = "analyzing"
    fake_video.error_message = None

    fake_analysis = MagicMock()
    fake_analysis.step_status = {}

    db.query.return_value.filter.return_value.first.side_effect = [
        fake_analysis,
        fake_video,
    ]

    _update_analysis_error(
        db, str(uuid_module.uuid4()), "chunk", exc=RuntimeError("boom"),
    )

    assert fake_video.error_message is None
