"""Regression tests for the standalone step-dispatch error link.

Background (follow-up flagged in PR #44 review):
    Since PR #44, a *retryable* step failure intentionally leaves the
    VideoAnalysis row in 'processing' so Celery's autoretry can re-run the
    task. The full-chain dispatches (/analyze route + auto-dispatch in
    transcription_tasks) attach ``.on_error(handle_pipeline_error.s(...))``
    so that when retries EXHAUST, the errback stamps the error state.

    The 5 standalone per-step dispatch routes
    (/analyze/{chunk,infer,relate,explain,activate}) used bare
    ``task.delay(...)`` with NO error link — when autoretries exhausted on a
    standalone dispatch, nothing stamped the error and the row sat
    'processing' until the ~17-min watchdog.

    The fix: dispatch via
    ``task.apply_async(args=[...], link_error=handle_pipeline_error.s(video_id=...))``.

These tests lock that contract in:

    * Each of the 5 step routes dispatches with a ``link_error`` signature
      bound to ``handle_pipeline_error`` with the correct ``video_id``.
    * ``video_id`` must be bound as a KWARG, not a positional arg — the
      worker invokes a single-task errback with ``(request, exc, traceback)``
      prepended as positionals, so a positionally-bound video_id would land
      in the ``request`` slot and corrupt the call.
    * Invoking the exact signature the route builds, using the worker's
      errback calling convention for a single (non-chain) task, stamps both
      the Video and VideoAnalysis rows as 'error'.
"""

import os

# --- Env vars must be set before any app.* import ---
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

import json  # noqa: E402
from unittest.mock import MagicMock, patch  # noqa: E402

import pytest  # noqa: E402
from celery.canvas import Signature  # noqa: E402
from httpx import ASGITransport, AsyncClient  # noqa: E402
from sqlalchemy import ARRAY, create_engine, event  # noqa: E402
from sqlalchemy.dialects.postgresql import JSONB  # noqa: E402
from sqlalchemy.dialects.postgresql import UUID as PGUUID  # noqa: E402
from sqlalchemy.ext.compiler import compiles  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402


@compiles(PGUUID, "sqlite")
def _compile_uuid_sqlite(type_, compiler, **kw):
    return "CHAR(36)"


@compiles(JSONB, "sqlite")
def _compile_jsonb_sqlite(type_, compiler, **kw):
    return "JSON"


@compiles(ARRAY, "sqlite")
def _compile_array_sqlite(type_, compiler, **kw):
    return "JSON"


# SQLite can't bind raw Python lists through the ARRAY column type — install
# a before_cursor_execute hook that JSON-encodes any remaining list
# parameters (same workaround as test_pipeline_errors.py).
def _install_array_json_adapter(engine):
    @event.listens_for(engine, "before_cursor_execute", retval=True)
    def _jsonify_lists(conn, cursor, statement, parameters, context, executemany):
        import uuid as _uuid

        def _default(o):
            if isinstance(o, _uuid.UUID):
                return str(o)
            raise TypeError(f"not serializable: {type(o).__name__}")

        def _conv(v):
            return json.dumps(v, default=_default) if isinstance(v, list) else v

        if parameters is None:
            return statement, parameters
        if executemany:
            new_params = []
            for row in parameters:
                if isinstance(row, (list, tuple)):
                    new_params.append(type(row)(_conv(p) for p in row))
                elif isinstance(row, dict):
                    new_params.append({k: _conv(v) for k, v in row.items()})
                else:
                    new_params.append(row)
            return statement, new_params
        if isinstance(parameters, (list, tuple)):
            return statement, type(parameters)(_conv(p) for p in parameters)
        if isinstance(parameters, dict):
            return statement, {k: _conv(v) for k, v in parameters.items()}
        return statement, parameters


from app.database import Base  # noqa: E402
from app.models.database_models import (  # noqa: E402
    Project,
    Transcript,
    User,
    Video,
    VideoAnalysis,
)


@pytest.fixture
def db_setup(tmp_path):
    """SQLite DB with all ORM tables and a session factory."""
    db_path = tmp_path / "step_link_error_test.db"
    engine = create_engine(f"sqlite:///{db_path}")
    _install_array_json_adapter(engine)
    Base.metadata.create_all(bind=engine)
    TestSession = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    yield TestSession
    engine.dispose()


def _seed_video(
    TestSession,
    *,
    video_status="transcribed",
    with_analysis=False,
    analysis_status="pending",
    user_id="dev_user_local",
):
    """Seed user/project/video (+ completed transcript) and optionally a
    VideoAnalysis row with every step's payload populated so any of the 5
    step routes passes its precondition check."""
    db = TestSession()
    try:
        if not db.query(User).filter(User.id == user_id).first():
            db.add(User(id=user_id, email=f"{user_id}@test.com", role="user"))
            db.commit()

        project = Project(name="test", user_id=user_id, description="goal")
        db.add(project)
        db.flush()

        video = Video(
            project_id=project.id,
            filename="v.mp4",
            s3_key=f"videos/{project.id}/v.mp4",
            s3_url="https://example/v.mp4",
            file_size_bytes=100,
            status=video_status,
        )
        db.add(video)
        db.flush()

        transcript = Transcript(
            video_id=video.id,
            status="completed",
            processed_transcript={"utterances": []},
        )
        db.add(transcript)

        if with_analysis:
            analysis = VideoAnalysis(
                video_id=video.id,
                status=analysis_status,
                step_status={
                    "chunk": "completed",
                    "infer": "completed",
                    "relate": "completed",
                    "explain": "completed",
                },
                chunks=[{"chunk_id": "c1", "text": "x" * 30}],
                inferences=[{"chunk_id": "c1", "inferences": []}],
                patterns=[{"id": "P1", "text": "pattern"}],
                insights=[{"id": "I1", "text": "insight"}],
            )
            db.add(analysis)

        db.commit()
        video_id = video.id
    finally:
        db.close()
    return video_id


def _override_get_db(TestSession):
    def _gen():
        session = TestSession()
        try:
            yield session
        finally:
            session.close()
    return _gen


# ---------------------------------------------------------------------------
# Dispatch-wiring tests: each standalone step route must attach link_error
# ---------------------------------------------------------------------------


STEPS = ["chunk", "infer", "relate", "explain", "activate"]


@pytest.mark.asyncio
@pytest.mark.parametrize("step", STEPS)
async def test_standalone_step_dispatch_attaches_error_link(db_setup, step):
    """POST /api/videos/{id}/analyze/{step} must dispatch the step task with
    link_error=handle_pipeline_error.s(video_id=<str>) so that exhausted
    autoretries stamp the error instead of leaving the row 'processing'
    until the watchdog."""
    TestSession = db_setup
    # chunk needs no analysis row; the others need prior-step payloads.
    video_id = _seed_video(TestSession, with_analysis=(step != "chunk"))

    from app.database import get_db
    from app.main import app

    fake_task = MagicMock()
    fake_task.id = "fake-task-id"

    app.dependency_overrides[get_db] = _override_get_db(TestSession)
    try:
        with patch(
            "celery.app.task.Task.apply_async", return_value=fake_task
        ) as mock_apply:
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                response = await client.post(
                    f"/api/videos/{video_id}/analyze/{step}",
                    headers={"Authorization": "Bearer dev-bypass"},
                )

        assert response.status_code == 202, (
            f"{step} dispatch must succeed, got {response.status_code}: "
            f"{response.text[:300]}"
        )
        assert response.json()["step"] == step

        assert mock_apply.call_count == 1, (
            f"Expected exactly one task dispatch for {step}, "
            f"got {mock_apply.call_count}"
        )
        kwargs = mock_apply.call_args.kwargs

        # Task args: (video_id_str, current_user_id)
        assert kwargs.get("args") == [str(video_id), "dev_user_local"]

        # The load-bearing assertion: an error link must be attached.
        link_error = kwargs.get("link_error")
        assert link_error is not None, (
            f"{step} standalone dispatch has NO link_error — exhausted "
            f"autoretries would leave the row 'processing' until the "
            f"watchdog (PR #44 review follow-up)."
        )
        assert isinstance(link_error, Signature)
        assert link_error.task == "handle_pipeline_error"

        # video_id must be kwarg-bound: the worker prepends
        # (request, exc, traceback) as POSITIONAL args when invoking a
        # single-task errback, so a positionally-bound video_id would land
        # in the wrong parameter slot.
        assert link_error.args == (), (
            "link_error signature must not bind positional args — they "
            "would collide with the (request, exc, traceback) positionals "
            "the worker prepends for errbacks."
        )
        assert link_error.kwargs == {"video_id": str(video_id)}
    finally:
        app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# Errback-protocol test: the signature the route builds must work when
# invoked as a single task's link_error (not just a chain's on_error).
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_error_link_signature_stamps_error_when_invoked_as_errback(db_setup):
    """Simulate the worker invoking the route-built link_error signature
    after a standalone step task fails terminally: the errback receives
    (request, exc, traceback) as positionals plus the signature's own
    kwargs, and must stamp both Video and VideoAnalysis to 'error'."""
    TestSession = db_setup
    video_id = _seed_video(
        TestSession,
        video_status="analyzing",
        with_analysis=True,
        analysis_status="processing",
    )

    from app.tasks.pipeline_errors import handle_pipeline_error

    # Build the exact signature shape the step routes build.
    sig = handle_pipeline_error.s(video_id=str(video_id))

    # Worker errback protocol for a single failed task: positional
    # (request, exc, traceback) prepended before the signature's own
    # args/kwargs. request is the failed task's context (a Context object,
    # NOT a chain) — handle_pipeline_error reads request.task off it.
    failed_request = MagicMock()
    failed_request.task = "analyze_infer_step"
    exc = RuntimeError("LLM timeout — autoretries exhausted")

    session = TestSession()
    try:
        mock_self = MagicMock()
        mock_self.db = session

        unbound = handle_pipeline_error.run.__func__
        unbound(mock_self, failed_request, exc, "traceback", *sig.args, **sig.kwargs)

        video = session.query(Video).filter(Video.id == video_id).first()
        analysis = (
            session.query(VideoAnalysis)
            .filter(VideoAnalysis.video_id == video_id)
            .first()
        )
        session.refresh(video)
        session.refresh(analysis)

        assert video.status == "error", (
            "Errback must stamp video.status='error' after a terminal "
            "standalone-step failure"
        )
        assert video.error_message
        assert '"step": "infer"' in video.error_message
        assert analysis.status == "error"
        assert analysis.completed_at is not None
    finally:
        session.close()
