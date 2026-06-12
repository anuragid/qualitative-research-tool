"""Tests for the chain error handler."""

import os
from unittest.mock import MagicMock
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

import json  # noqa: E402

import pytest  # noqa: E402
from sqlalchemy import ARRAY, create_engine, event  # noqa: E402
from sqlalchemy.dialects.postgresql import JSONB  # noqa: E402
from sqlalchemy.dialects.postgresql import UUID as PGUUID
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


# SQLite can't bind raw Python lists through the ARRAY column type — JSON
# columns are fine because SQLAlchemy's JSON type has a bind processor that
# serializes to string, but ARRAY is Postgres-only and has no SQLite bind
# processor. As a test-only workaround, install a before_cursor_execute
# hook that JSON-encodes any remaining list parameters that reach the cursor.
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
from app.models.database_models import Project, ProjectAnalysis, User, Video, VideoAnalysis  # noqa: E402


@pytest.fixture
def db_session(tmp_path):
    """Create a SQLite DB with all ORM tables and yield a session."""
    db_path = tmp_path / "pipeline_errors_test.db"
    engine = create_engine(f"sqlite:///{db_path}")
    _install_array_json_adapter(engine)
    Base.metadata.create_all(bind=engine)

    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()


def _seed_video_in_processing(db, user_id="dev_user_local"):
    """Create a user/project/video/analysis in a 'processing' state."""
    if not db.query(User).filter(User.id == user_id).first():
        db.add(User(id=user_id, email=f"{user_id}@test.com", role="user"))
        db.commit()

    project = Project(name="test", user_id=user_id)
    db.add(project)
    db.flush()

    video = Video(
        project_id=project.id,
        filename="v.mp4",
        s3_key=f"videos/{project.id}/{uuid4()}/v.mp4",
        s3_url="https://example/v.mp4",
        file_size_bytes=100,
        status="analyzing",
    )
    db.add(video)
    db.flush()

    analysis = VideoAnalysis(
        video_id=video.id,
        status="processing",
        step_status={"chunk": "completed", "infer": "processing"},
    )
    db.add(analysis)
    db.commit()
    return video, analysis


class TestHandlePipelineError:
    def test_marks_video_and_analysis_error(self, db_session):
        """When a chain link fails, the error handler should mark both records."""
        from app.tasks.pipeline_errors import handle_pipeline_error

        video, analysis = _seed_video_in_processing(db_session)
        fake_exc = RuntimeError("LLM timeout")
        fake_request = MagicMock()
        fake_request.task = "analyze_infer_step"

        mock_self = MagicMock()
        mock_self.db = db_session

        unbound = handle_pipeline_error.run.__func__
        unbound(mock_self, fake_request, fake_exc, "fake_traceback", str(video.id))

        db_session.refresh(video)
        db_session.refresh(analysis)
        assert video.status == "error"
        assert video.error_message  # JSON string
        assert analysis.status == "error"
        assert analysis.completed_at is not None

    def test_is_idempotent(self, db_session):
        """Running the error handler twice should not change state after the first."""
        from app.tasks.pipeline_errors import handle_pipeline_error

        video, analysis = _seed_video_in_processing(db_session)
        fake_exc = RuntimeError("boom")
        fake_request = MagicMock()
        fake_request.task = "analyze_infer_step"
        mock_self = MagicMock()
        mock_self.db = db_session
        unbound = handle_pipeline_error.run.__func__

        unbound(mock_self, fake_request, fake_exc, "tb", str(video.id))
        db_session.refresh(video)
        first_error_msg = video.error_message
        first_status = video.status

        unbound(mock_self, fake_request, fake_exc, "tb", str(video.id))
        db_session.refresh(video)
        # Should be unchanged on the second call
        assert video.error_message == first_error_msg
        assert video.status == first_status
        assert video.status == "error"

    def test_extracts_failed_step_from_request_task(self, db_session):
        """The failed step name should be parsed from request.task."""
        from app.tasks.pipeline_errors import handle_pipeline_error

        video, _ = _seed_video_in_processing(db_session)
        fake_exc = RuntimeError("boom")
        fake_request = MagicMock()
        fake_request.task = "analyze_relate_step"
        mock_self = MagicMock()
        mock_self.db = db_session

        unbound = handle_pipeline_error.run.__func__
        unbound(mock_self, fake_request, fake_exc, "tb", str(video.id))

        db_session.refresh(video)
        assert '"step": "relate"' in video.error_message

    def test_does_not_overwrite_already_analyzed_video(self, db_session):
        """If video was already 'analyzed', don't smash it back to 'error'."""
        from app.tasks.pipeline_errors import handle_pipeline_error

        video, analysis = _seed_video_in_processing(db_session)
        video.status = "analyzed"
        analysis.status = "completed"
        db_session.commit()

        fake_exc = RuntimeError("late error")
        fake_request = MagicMock()
        fake_request.task = "analyze_activate_step"
        mock_self = MagicMock()
        mock_self.db = db_session

        unbound = handle_pipeline_error.run.__func__
        unbound(mock_self, fake_request, fake_exc, "tb", str(video.id))

        db_session.refresh(video)
        db_session.refresh(analysis)
        assert video.status == "analyzed"

    def test_reraises_when_error_handler_itself_fails(self, db_session):
        """If the terminal error handler can't write the error state (e.g.
        the commit raises because the DB is still down), it must NOT swallow.

        Previously a bare ``pass`` meant the row stayed 'processing' with no
        trace beyond a worker log line. The handler now re-raises so Celery's
        Sentry integration sees the failed-error-handler. Loop-safe: this
        task has no autoretry decorator and isn't called recursively, so the
        re-raise surfaces exactly once."""
        from sqlalchemy.exc import OperationalError

        from app.tasks.pipeline_errors import handle_pipeline_error

        video, _ = _seed_video_in_processing(db_session)
        broken_db = MagicMock(wraps=db_session)
        broken_db.commit.side_effect = OperationalError(
            "COMMIT", {}, Exception("connection lost")
        )

        fake_exc = RuntimeError("original step failure")
        fake_request = MagicMock()
        fake_request.task = "analyze_infer_step"
        mock_self = MagicMock()
        mock_self.db = broken_db

        unbound = handle_pipeline_error.run.__func__
        with pytest.raises(OperationalError):
            unbound(mock_self, fake_request, fake_exc, "tb", str(video.id))


def _seed_project_analysis_in_processing(db_session, user_id="dev_user_local"):
    project = Project(name="test-proj", user_id=user_id)
    db_session.add(project)
    db_session.flush()
    pa = ProjectAnalysis(
        project_id=project.id,
        status="processing",
        video_ids=[],
    )
    db_session.add(pa)
    db_session.commit()
    return project, pa


def test_handle_project_pipeline_error_marks_analysis_error(db_session):
    """When a project chain link fails, the handler marks ProjectAnalysis as error."""
    from unittest.mock import MagicMock

    from app.tasks.pipeline_errors import handle_project_pipeline_error

    project, pa = _seed_project_analysis_in_processing(db_session)
    fake_exc = RuntimeError("cross_relate LLM timeout")
    fake_request = MagicMock()
    fake_request.task = "analyze_cross_relate_step"

    task_self = type("T", (), {"db": db_session})()
    handle_project_pipeline_error.run.__func__(
        task_self, fake_request, fake_exc, "fake_traceback", str(project.id)
    )

    db_session.refresh(pa)
    assert pa.status == "error"
    assert pa.completed_at is not None


def test_handle_project_pipeline_error_is_idempotent(db_session):
    """Running the project handler twice should not change state after the first."""
    from unittest.mock import MagicMock

    from app.tasks.pipeline_errors import handle_project_pipeline_error

    project, pa = _seed_project_analysis_in_processing(db_session)
    fake_exc = RuntimeError("boom")
    fake_request = MagicMock()
    fake_request.task = "analyze_cross_relate_step"
    task_self = type("T", (), {"db": db_session})()

    handle_project_pipeline_error.run.__func__(task_self, fake_request, fake_exc, "tb", str(project.id))
    db_session.refresh(pa)
    first_completed_at = pa.completed_at

    handle_project_pipeline_error.run.__func__(task_self, fake_request, fake_exc, "tb", str(project.id))
    db_session.refresh(pa)
    assert pa.status == "error"
    assert pa.completed_at == first_completed_at  # unchanged on second call


def test_handle_project_pipeline_error_reraises_when_handler_fails(db_session):
    """The project chain's terminal handler must re-raise (not swallow) if
    writing the error state itself fails."""
    from unittest.mock import MagicMock

    from sqlalchemy.exc import OperationalError

    from app.tasks.pipeline_errors import handle_project_pipeline_error

    project, _ = _seed_project_analysis_in_processing(db_session)
    broken_db = MagicMock(wraps=db_session)
    broken_db.commit.side_effect = OperationalError(
        "COMMIT", {}, Exception("DB unreachable")
    )

    fake_exc = RuntimeError("cross_relate failure")
    fake_request = MagicMock()
    fake_request.task = "analyze_cross_relate_step"
    task_self = type("T", (), {"db": broken_db})()

    with pytest.raises(OperationalError):
        handle_project_pipeline_error.run.__func__(
            task_self, fake_request, fake_exc, "tb", str(project.id)
        )
