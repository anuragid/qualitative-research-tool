"""Tests for the Celery chain-based analysis pipeline."""

import os
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
    Transcript,
    User,
    Video,
    VideoAnalysis,
)
from app.tasks.analysis_steps import _check_cancellation  # noqa: E402

# ---------------------------------------------------------------------------
# Fixture: ORM-backed SQLite session (same pattern as test_watchdog_race.py)
# ---------------------------------------------------------------------------


@pytest.fixture
def db_session(tmp_path):
    """Create a SQLite DB with all ORM tables and yield a session."""
    db_path = tmp_path / "analysis_chain_test.db"
    engine = create_engine(f"sqlite:///{db_path}")
    Base.metadata.create_all(bind=engine)

    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()


def _seed_project_video_transcript(db, user_id: str = "dev_user_local"):
    """Insert a User, Project, Video, and completed Transcript — returns (project, video)."""
    if not db.query(User).filter(User.id == user_id).first():
        db.add(User(id=user_id, email=f"{user_id}@test.com", role="user"))
        db.commit()

    project = Project(name="test", user_id=user_id, description="Research goal")
    db.add(project)
    db.flush()

    video = Video(
        project_id=project.id,
        filename="v.mp4",
        s3_key=f"videos/{project.id}/{uuid4()}/v.mp4",
        s3_url="https://example/v.mp4",
        file_size_bytes=100,
        status="transcribed",
    )
    db.add(video)
    db.flush()

    transcript = Transcript(
        video_id=video.id,
        status="completed",
        processed_transcript={"duration_seconds": 60, "utterances": []},
        raw_transcript={"utterances": []},
    )
    db.add(transcript)
    db.commit()
    return project, video


# ---------------------------------------------------------------------------
# Task 3.3 tests — cancellation precheck behavior
# ---------------------------------------------------------------------------


class TestCancellationPrecheck:
    def test_returns_true_when_analysis_already_in_error(self, db_session):
        """If watchdog marked analysis as error, step task should skip."""
        _, video = _seed_project_video_transcript(db_session)
        analysis = VideoAnalysis(
            video_id=video.id,
            status="error",
            step_status={"chunk": "error"},
        )
        db_session.add(analysis)
        db_session.commit()

        assert _check_cancellation(db_session, str(video.id)) is True

    def test_returns_false_when_analysis_is_processing(self, db_session):
        """If analysis is actively processing, step task should continue."""
        _, video = _seed_project_video_transcript(db_session)
        analysis = VideoAnalysis(
            video_id=video.id,
            status="processing",
            step_status={"chunk": "processing"},
        )
        db_session.add(analysis)
        db_session.commit()

        assert _check_cancellation(db_session, str(video.id)) is False

    def test_returns_true_when_analysis_row_missing(self, db_session):
        """If the VideoAnalysis row is gone (e.g. deleted by cleanup), skip."""
        _, video = _seed_project_video_transcript(db_session)
        # No VideoAnalysis row inserted
        assert _check_cancellation(db_session, str(video.id)) is True


class TestStepTasksShortCircuitWhenCancelled:
    """Every step task body must exit early and return {status: skipped}
    when the cancellation precheck fires. This lets subsequent chain
    links no-op naturally instead of doing redundant DB reads."""

    @pytest.mark.parametrize("step_name,task_attr", [
        ("chunk", "analyze_chunk_step"),
        ("infer", "analyze_infer_step"),
        ("relate", "analyze_relate_step"),
        ("explain", "analyze_explain_step"),
        ("activate", "analyze_activate_step"),
    ])
    def test_step_returns_skipped_when_analysis_in_error(
        self, db_session, step_name, task_attr
    ):
        from unittest.mock import MagicMock

        from app.tasks import analysis_steps

        _, video = _seed_project_video_transcript(db_session)
        analysis = VideoAnalysis(
            video_id=video.id,
            status="error",  # watchdog already halted it
            step_status={step_name: "error"},
        )
        db_session.add(analysis)
        db_session.commit()

        task = getattr(analysis_steps, task_attr)
        mock_self = MagicMock()
        mock_self.db = db_session

        unbound = task._orig_run.__func__
        result = unbound(mock_self, str(video.id), None)

        assert result == {"video_id": str(video.id), "status": "skipped"}


class TestChunkStepInitialStateSetup:
    """Task 3.4: analyze_chunk_step takes over the chain-start state
    transitions that used to live in the route handler."""

    def test_chunk_step_initializes_step_status_and_sets_processing(
        self, db_session, monkeypatch
    ):
        """First chain link should init step_status, mark processing, clear error_message."""
        from unittest.mock import MagicMock

        from app.tasks import analysis_steps

        _, video = _seed_project_video_transcript(db_session)
        # Ensure video has a stale error message from a previous failed run
        video.error_message = "old error"
        video.status = "error"
        db_session.commit()

        # Pre-create an analysis row with an older step_status so we can
        # verify the reset on re-run.
        analysis = VideoAnalysis(
            video_id=video.id,
            status="pending",
            step_status={"chunk": "error"},
        )
        db_session.add(analysis)
        db_session.commit()

        # Stub chunk_node so we don't hit the LLM
        def fake_chunk_node(state):
            return {"chunks": [{"id": "C001", "text": "hello"}], "current_step": "chunk"}

        monkeypatch.setattr(analysis_steps, "chunk_node", fake_chunk_node)
        monkeypatch.setattr(
            analysis_steps, "_resolve_byok", lambda db, user_id: (None, None)
        )

        mock_self = MagicMock()
        mock_self.db = db_session
        unbound = analysis_steps.analyze_chunk_step._orig_run.__func__
        result = unbound(mock_self, str(video.id), "dev_user_local")

        assert result["status"] == "success"
        assert result["chunks_count"] == 1

        db_session.refresh(analysis)
        db_session.refresh(video)

        # chunk finished, others should be pending
        assert analysis.status == "processing"
        assert analysis.step_status["chunk"] == "completed"
        assert analysis.step_status["infer"] == "pending"
        assert analysis.step_status["relate"] == "pending"
        assert analysis.step_status["explain"] == "pending"
        assert analysis.step_status["activate"] == "pending"
        assert analysis.started_at is not None
        assert analysis.chunks == [{"id": "C001", "text": "hello"}]

        # Video should be flipped to "analyzing" and old error cleared
        assert video.status == "analyzing"
        assert video.error_message is None

    def test_chunk_step_creates_analysis_row_if_missing(
        self, db_session, monkeypatch
    ):
        """If no VideoAnalysis row exists yet, chunk step should create one."""
        from unittest.mock import MagicMock

        from app.tasks import analysis_steps

        _, video = _seed_project_video_transcript(db_session)
        # Intentionally NOT creating a VideoAnalysis row — route no longer
        # does this, so the first chain link must handle it.

        def fake_chunk_node(state):
            return {"chunks": [{"id": "C001", "text": "hello"}], "current_step": "chunk"}

        monkeypatch.setattr(analysis_steps, "chunk_node", fake_chunk_node)
        monkeypatch.setattr(
            analysis_steps, "_resolve_byok", lambda db, user_id: (None, None)
        )

        mock_self = MagicMock()
        mock_self.db = db_session
        unbound = analysis_steps.analyze_chunk_step._orig_run.__func__
        unbound(mock_self, str(video.id), "dev_user_local")

        analysis = db_session.query(VideoAnalysis).filter_by(video_id=video.id).first()
        assert analysis is not None
        assert analysis.status == "processing"
        assert analysis.step_status["chunk"] == "completed"
        assert analysis.step_status["infer"] == "pending"
