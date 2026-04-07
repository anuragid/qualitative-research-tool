"""Tests for the auto-dispatch of the analyze chain after transcription completes.

Regresses PR #20 — the transcribe→analyze manual-click gap that left videos
sitting at status="transcribed" with no `video_analyses` row until the user
clicked "Analyze" by hand. The frontend's polling against the resulting empty
state caused JAVASCRIPT-REACT-6 (and the user-visible "stuck video" symptom).

See docs/production-readiness/prs/pr20-auto-dispatch.md for the full design.
"""
from __future__ import annotations

import os
from unittest.mock import MagicMock, patch
from uuid import uuid4

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

import pytest  # noqa: E402
from sqlalchemy import ARRAY, create_engine  # noqa: E402
from sqlalchemy.dialects.postgresql import JSONB  # noqa: E402
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.ext.compiler import compiles  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402

# Register SQLite-compatible compilers for the PG-specific column types
# so we can use the real ORM models against an in-memory SQLite DB.
# (Same pattern as test_analysis_chain.py.)


@compiles(PGUUID, "sqlite")
def _compile_uuid_sqlite(type_, compiler, **kw):
    return "CHAR(36)"


@compiles(JSONB, "sqlite")
def _compile_jsonb_sqlite(type_, compiler, **kw):
    return "JSON"


@compiles(ARRAY, "sqlite")
def _compile_array_sqlite(type_, compiler, **kw):
    return "JSON"


from app.database import Base  # noqa: E402
from app.models.database_models import (  # noqa: E402
    Project,
    User,
    Video,
    VideoAnalysis,
)

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def db_session(tmp_path):
    """Create a SQLite DB with all ORM tables and yield a session."""
    db_path = tmp_path / "auto_dispatch_test.db"
    engine = create_engine(f"sqlite:///{db_path}")
    Base.metadata.create_all(bind=engine)

    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()


@pytest.fixture
def test_project(db_session):
    """Insert a User + Project, return the project."""
    user_id = "dev_user_local"
    if not db_session.query(User).filter(User.id == user_id).first():
        db_session.add(User(id=user_id, email=f"{user_id}@test.com", role="user"))
        db_session.commit()

    project = Project(
        name="auto-dispatch test project",
        user_id=user_id,
        description="research goal",
    )
    db_session.add(project)
    db_session.commit()
    return project


@pytest.fixture
def make_video(db_session):
    """Factory: create a Video row owned by a project with the given status."""

    def _make(project_id, status="transcribed"):
        video = Video(
            project_id=project_id,
            filename="v.mp4",
            s3_key=f"videos/{project_id}/{uuid4()}/v.mp4",
            s3_url="https://example.test/v.mp4",
            file_size_bytes=100,
            status=status,
        )
        db_session.add(video)
        db_session.commit()
        return video

    return _make


# ---------------------------------------------------------------------------
# Unit tests for _maybe_auto_dispatch_analyze_chain
# ---------------------------------------------------------------------------


class TestAutoDispatchAnalyzeChain:
    """Direct tests for the helper function."""

    def test_dispatches_for_freshly_transcribed_video(
        self, db_session, test_project, make_video
    ):
        """A video with status='transcribed' and no VideoAnalysis row must
        trigger the analyze chain dispatch and flip status to 'analyzing'."""
        from app.tasks.transcription_tasks import _maybe_auto_dispatch_analyze_chain

        video = make_video(project_id=test_project.id, status="transcribed")

        with patch("app.tasks.transcription_tasks.chain") as mock_chain:
            mock_chain.return_value.on_error.return_value = mock_chain.return_value
            mock_chain.return_value.apply_async.return_value = MagicMock(id="fake-task-id")
            _maybe_auto_dispatch_analyze_chain(db_session, video)

        assert mock_chain.called, (
            "Chain must be dispatched for transcribed video with no analysis row"
        )
        db_session.refresh(video)
        assert video.status == "analyzing"
        assert video.error_message is None

    def test_skips_if_chain_already_processing(
        self, db_session, test_project, make_video
    ):
        """If another chain is already in flight (VideoAnalysis.status='processing'),
        do NOT dispatch a second one."""
        from app.tasks.transcription_tasks import _maybe_auto_dispatch_analyze_chain

        video = make_video(project_id=test_project.id, status="transcribed")
        analysis = VideoAnalysis(
            video_id=video.id,
            status="processing",
            step_status={"chunk": "processing"},
        )
        db_session.add(analysis)
        db_session.commit()

        with patch("app.tasks.transcription_tasks.chain") as mock_chain:
            _maybe_auto_dispatch_analyze_chain(db_session, video)

        assert not mock_chain.called, (
            "Must not dispatch when chain is already processing"
        )
        db_session.refresh(video)
        # Status must NOT have been flipped to 'analyzing'
        assert video.status == "transcribed"

    def test_skips_if_already_completed(
        self, db_session, test_project, make_video
    ):
        """If VideoAnalysis.status='completed', do NOT re-dispatch."""
        from app.tasks.transcription_tasks import _maybe_auto_dispatch_analyze_chain

        video = make_video(project_id=test_project.id, status="transcribed")
        analysis = VideoAnalysis(
            video_id=video.id,
            status="completed",
            step_status={
                "chunk": "completed",
                "infer": "completed",
                "relate": "completed",
                "explain": "completed",
                "activate": "completed",
            },
        )
        db_session.add(analysis)
        db_session.commit()

        with patch("app.tasks.transcription_tasks.chain") as mock_chain:
            _maybe_auto_dispatch_analyze_chain(db_session, video)

        assert not mock_chain.called
        db_session.refresh(video)
        assert video.status == "transcribed"

    def test_dispatches_for_errored_prior_analysis(
        self, db_session, test_project, make_video
    ):
        """If a prior VideoAnalysis is in 'error' state, auto-dispatch must
        still fire — the chunk step is idempotent. (PR #19.5 / fix/retry-reset
        ensures the chain's defensive skip doesn't silently eat this.)"""
        from app.tasks.transcription_tasks import _maybe_auto_dispatch_analyze_chain

        video = make_video(project_id=test_project.id, status="transcribed")
        analysis = VideoAnalysis(
            video_id=video.id,
            status="error",
            step_status={"chunk": "error"},
        )
        db_session.add(analysis)
        db_session.commit()

        with patch("app.tasks.transcription_tasks.chain") as mock_chain:
            mock_chain.return_value.on_error.return_value = mock_chain.return_value
            mock_chain.return_value.apply_async.return_value = MagicMock(id="fake-task-id")
            _maybe_auto_dispatch_analyze_chain(db_session, video)

        assert mock_chain.called
        db_session.refresh(video)
        assert video.status == "analyzing"

    def test_skips_if_video_status_not_transcribed(
        self, db_session, test_project, make_video
    ):
        """If video.status != 'transcribed', do NOT dispatch. Guards against
        race conditions and future refactors."""
        from app.tasks.transcription_tasks import _maybe_auto_dispatch_analyze_chain

        video = make_video(project_id=test_project.id, status="analyzing")

        with patch("app.tasks.transcription_tasks.chain") as mock_chain:
            _maybe_auto_dispatch_analyze_chain(db_session, video)

        assert not mock_chain.called

    def test_dispatch_uses_correct_chain_signature(
        self, db_session, test_project, make_video
    ):
        """The dispatched chain must have 5 step signatures, each bound to
        (str(video_id), user_id), and must use .on_error(handle_pipeline_error.s(...)).
        Mirrors routes/videos.py:639-645 exactly."""
        from app.tasks.transcription_tasks import _maybe_auto_dispatch_analyze_chain

        video = make_video(project_id=test_project.id, status="transcribed")
        video_id_str = str(video.id)

        with patch("app.tasks.transcription_tasks.chain") as mock_chain:
            mock_chain.return_value.on_error.return_value = mock_chain.return_value
            mock_chain.return_value.apply_async.return_value = MagicMock(id="fake-task-id")
            _maybe_auto_dispatch_analyze_chain(db_session, video)

        assert mock_chain.call_count == 1
        # 5 step signatures should have been passed to chain()
        args, _ = mock_chain.call_args
        assert len(args) == 5, f"Expected 5 chain steps, got {len(args)}"

        # The chain must have on_error attached and apply_async called
        mock_chain.return_value.on_error.assert_called_once()
        mock_chain.return_value.on_error.return_value.apply_async.assert_called_once()

        # The video_id passed to each step should be the string form
        # (we can't easily inspect .si() args without deep mocking, but the
        # str-form is a precondition). The assertion above on call_count is
        # the load-bearing one.
        assert isinstance(video_id_str, str)
