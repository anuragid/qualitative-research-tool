"""Tests for the Celery chain-based project analysis pipeline."""

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

import json  # noqa: E402
from unittest.mock import MagicMock  # noqa: E402

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
# hook that JSON-encodes any remaining list parameters that reach the
# cursor. By the time parameters arrive here, JSON columns have already
# been bind-processed into strings, so the only lists left will be
# ARRAY-column values.
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
    ProjectAnalysis,
    User,
    Video,
    VideoAnalysis,
)


@pytest.fixture
def db_session(tmp_path):
    """Create a SQLite DB with all ORM tables and yield a session."""
    db_path = tmp_path / "project_chain_test.db"
    engine = create_engine(f"sqlite:///{db_path}")
    _install_array_json_adapter(engine)
    Base.metadata.create_all(bind=engine)

    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()


def _seed_project_with_completed_videos(db, user_id="dev_user_local", n=2):
    if not db.query(User).filter(User.id == user_id).first():
        db.add(User(id=user_id, email=f"{user_id}@test.com", role="user"))
        db.commit()

    project = Project(name="test", user_id=user_id, description="Research goal")
    db.add(project)
    db.flush()
    for i in range(n):
        video = Video(
            project_id=project.id,
            filename=f"v{i}.mp4",
            s3_key=f"videos/{project.id}/{uuid4()}/v{i}.mp4",
            s3_url=f"https://example/v{i}.mp4",
            file_size_bytes=100,
            status="analyzed",
        )
        db.add(video)
        db.flush()
        analysis = VideoAnalysis(
            video_id=video.id,
            status="completed",
            patterns=[{"id": f"P{i}", "text": "pattern"}],
            insights=[{"id": f"I{i}", "text": "insight"}],
            design_principles=[{"id": f"DP{i}", "text": "principle"}],
        )
        db.add(analysis)
    db.commit()
    return project


class TestCrossRelateStep:
    def test_aggregates_patterns_and_runs_node(self, db_session, monkeypatch):
        """cross_relate step should read completed video analyses and run cross_relate_node."""
        from app.tasks import project_analysis_steps

        project = _seed_project_with_completed_videos(db_session)

        captured_state = {}

        def fake_cross_relate(state):
            captured_state.update(state)
            return {"cross_video_patterns": [{"id": "CP1", "text": "cross pattern"}]}

        monkeypatch.setattr(project_analysis_steps, "cross_relate_node", fake_cross_relate)
        # After BYOK PR #6, project step tasks call
        # _resolve_byok_or_raise_credits_error (re-exported from
        # analysis_steps), which returns a 2-tuple (api_key, model).
        monkeypatch.setattr(
            project_analysis_steps,
            "_resolve_byok_or_raise_credits_error",
            lambda db, user_id, step, *, force_refresh=False: (None, None),
        )

        mock_self = MagicMock()
        mock_self.db = db_session

        unbound = project_analysis_steps.analyze_cross_relate_step._orig_run.__func__
        result = unbound(mock_self, str(project.id), "dev_user_local")

        assert result["status"] == "success"
        assert len(captured_state["video_patterns"]) == 2

        pa = db_session.query(ProjectAnalysis).filter_by(project_id=project.id).first()
        assert pa is not None
        assert pa.cross_video_patterns == [{"id": "CP1", "text": "cross pattern"}]
        assert pa.status == "processing"


class TestCrossExplainStep:
    def test_uses_cross_video_patterns_and_writes_insights(self, db_session, monkeypatch):
        from app.tasks import project_analysis_steps

        project = _seed_project_with_completed_videos(db_session)
        pa = ProjectAnalysis(
            project_id=project.id,
            status="processing",
            video_ids=[],
            cross_video_patterns=[{"id": "CP1"}],
        )
        db_session.add(pa)
        db_session.commit()

        def fake_cross_explain(state):
            assert state["cross_video_patterns"] == [{"id": "CP1"}]
            return {"cross_video_insights": [{"id": "CI1", "text": "cross insight"}]}

        monkeypatch.setattr(project_analysis_steps, "cross_explain_node", fake_cross_explain)
        # After BYOK PR #6, project step tasks call
        # _resolve_byok_or_raise_credits_error (re-exported from
        # analysis_steps), which returns a 2-tuple (api_key, model).
        monkeypatch.setattr(
            project_analysis_steps,
            "_resolve_byok_or_raise_credits_error",
            lambda db, user_id, step, *, force_refresh=False: (None, None),
        )

        mock_self = MagicMock()
        mock_self.db = db_session

        unbound = project_analysis_steps.analyze_cross_explain_step._orig_run.__func__
        result = unbound(mock_self, str(project.id), "dev_user_local")

        assert result["status"] == "success"
        db_session.refresh(pa)
        assert pa.cross_video_insights == [{"id": "CI1", "text": "cross insight"}]


class TestCrossActivateStep:
    def test_marks_project_analysis_completed(self, db_session, monkeypatch):
        """cross_activate (terminal step) should mark status completed with completed_at."""
        from app.tasks import project_analysis_steps

        project = _seed_project_with_completed_videos(db_session)
        pa = ProjectAnalysis(
            project_id=project.id,
            status="processing",
            video_ids=[],
            cross_video_patterns=[{"id": "CP1"}],
            cross_video_insights=[{"id": "CI1"}],
        )
        db_session.add(pa)
        db_session.commit()

        def fake_cross_activate(state):
            return {"cross_video_principles": [{"id": "CDP1", "text": "principle"}]}

        monkeypatch.setattr(
            project_analysis_steps, "cross_activate_node", fake_cross_activate
        )
        # After BYOK PR #6, project step tasks call
        # _resolve_byok_or_raise_credits_error (re-exported from
        # analysis_steps), which returns a 2-tuple (api_key, model).
        monkeypatch.setattr(
            project_analysis_steps,
            "_resolve_byok_or_raise_credits_error",
            lambda db, user_id, step, *, force_refresh=False: (None, None),
        )

        mock_self = MagicMock()
        mock_self.db = db_session

        unbound = project_analysis_steps.analyze_cross_activate_step._orig_run.__func__
        result = unbound(mock_self, str(project.id), "dev_user_local")

        assert result["status"] == "success"
        db_session.refresh(pa)
        assert pa.status == "completed"
        assert pa.completed_at is not None
        assert pa.cross_video_principles == [{"id": "CDP1", "text": "principle"}]


class TestCrossProjectCancellationPrecheck:
    def test_cross_relate_skips_when_pa_in_error(self, db_session, monkeypatch):
        from app.tasks import project_analysis_steps

        project = _seed_project_with_completed_videos(db_session)
        pa = ProjectAnalysis(
            project_id=project.id, status="error", video_ids=[]
        )
        db_session.add(pa)
        db_session.commit()

        called = {"hit": False}

        def fake_cross_relate(state):
            called["hit"] = True
            return {"cross_video_patterns": [{"id": "CP1"}]}

        monkeypatch.setattr(project_analysis_steps, "cross_relate_node", fake_cross_relate)
        # After BYOK PR #6, project step tasks call
        # _resolve_byok_or_raise_credits_error (re-exported from
        # analysis_steps), which returns a 2-tuple (api_key, model).
        monkeypatch.setattr(
            project_analysis_steps,
            "_resolve_byok_or_raise_credits_error",
            lambda db, user_id, step, *, force_refresh=False: (None, None),
        )

        mock_self = MagicMock()
        mock_self.db = db_session
        unbound = project_analysis_steps.analyze_cross_relate_step._orig_run.__func__
        result = unbound(mock_self, str(project.id), "dev_user_local")

        assert result == {"project_id": str(project.id), "status": "skipped"}
        assert called["hit"] is False


class TestCrossRedeliveryOnCompletedRowIsNoOp:
    """Sentry PYTHON-FASTAPI-13/-14 (Cluster A): a Celery-redelivered cross-video
    step runs against a ProjectAnalysis the original delivery already drove to
    ``completed``. The redelivered step must be a clean no-op — it must NOT
    re-run the (billable) LLM node, and it must NOT fire a state-machine
    transition from ``completed`` (which raised InvalidTransitionError:
    CHAIN_STEP_PROGRESS / CHAIN_SUCCEEDED not allowed from completed).

    A *legitimate* re-run is a different path: the /analyze route fires
    RERUN_REQUESTED to reset the row to ``processing`` BEFORE dispatch (see
    test_project_analysis_retry.test_rerun_resets_completed_row_and_dispatches),
    so a genuine re-run never reaches these steps with status=='completed'.
    """

    def _patch_resolver(self, monkeypatch):
        from app.tasks import project_analysis_steps

        monkeypatch.setattr(
            project_analysis_steps,
            "_resolve_byok_or_raise_credits_error",
            lambda db, user_id, step, *, force_refresh=False: (None, None),
        )

    def test_cross_relate_skips_when_pa_completed(self, db_session, monkeypatch):
        from app.tasks import project_analysis_steps

        project = _seed_project_with_completed_videos(db_session)
        pa = ProjectAnalysis(
            project_id=project.id, status="completed", video_ids=[],
            cross_video_patterns=[{"id": "CP1"}],
            cross_video_insights=[{"id": "CI1"}],
            cross_video_principles=[{"id": "CDP1"}],
        )
        db_session.add(pa)
        db_session.commit()

        called = {"hit": False}

        def fake_node(state):
            called["hit"] = True
            return {"cross_video_patterns": [{"id": "CP2"}]}

        monkeypatch.setattr(project_analysis_steps, "cross_relate_node", fake_node)
        self._patch_resolver(monkeypatch)

        mock_self = MagicMock()
        mock_self.db = db_session
        unbound = project_analysis_steps.analyze_cross_relate_step._orig_run.__func__
        result = unbound(mock_self, str(project.id), "dev_user_local")

        assert result == {"project_id": str(project.id), "status": "skipped"}
        assert called["hit"] is False, "redelivered cross_relate re-ran the LLM node (duplicate spend)"
        db_session.refresh(pa)
        assert pa.status == "completed"

    def test_cross_explain_skips_when_pa_completed(self, db_session, monkeypatch):
        from app.tasks import project_analysis_steps

        project = _seed_project_with_completed_videos(db_session)
        pa = ProjectAnalysis(
            project_id=project.id, status="completed", video_ids=[],
            cross_video_patterns=[{"id": "CP1"}],
            cross_video_insights=[{"id": "CI1"}],
        )
        db_session.add(pa)
        db_session.commit()

        called = {"hit": False}

        def fake_node(state):
            called["hit"] = True
            return {"cross_video_insights": [{"id": "CI2"}]}

        monkeypatch.setattr(project_analysis_steps, "cross_explain_node", fake_node)
        self._patch_resolver(monkeypatch)

        mock_self = MagicMock()
        mock_self.db = db_session
        unbound = project_analysis_steps.analyze_cross_explain_step._orig_run.__func__
        result = unbound(mock_self, str(project.id), "dev_user_local")

        assert result == {"project_id": str(project.id), "status": "skipped"}
        assert called["hit"] is False

    def test_cross_activate_skips_when_pa_completed(self, db_session, monkeypatch):
        from app.tasks import project_analysis_steps

        project = _seed_project_with_completed_videos(db_session)
        pa = ProjectAnalysis(
            project_id=project.id, status="completed", video_ids=[],
            cross_video_patterns=[{"id": "CP1"}],
            cross_video_insights=[{"id": "CI1"}],
            cross_video_principles=[{"id": "CDP1"}],
        )
        db_session.add(pa)
        db_session.commit()

        called = {"hit": False}

        def fake_node(state):
            called["hit"] = True
            return {"cross_video_principles": [{"id": "CDP2"}]}

        monkeypatch.setattr(project_analysis_steps, "cross_activate_node", fake_node)
        self._patch_resolver(monkeypatch)

        mock_self = MagicMock()
        mock_self.db = db_session
        unbound = project_analysis_steps.analyze_cross_activate_step._orig_run.__func__
        result = unbound(mock_self, str(project.id), "dev_user_local")

        assert result == {"project_id": str(project.id), "status": "skipped"}
        assert called["hit"] is False, "redelivered cross_activate re-ran the LLM node (duplicate spend)"


class TestCrossProjectCancellationTransientDB:
    """A transient DB outage inside the project cancellation precheck must
    RAISE (Celery autoretry path), not silently proceed to a cross-video
    LLM call on possibly-cancelled work."""

    def test_check_project_cancellation_reraises_on_operational_error(self, db_session):
        from sqlalchemy.exc import OperationalError

        from app.tasks import project_analysis_steps

        project = _seed_project_with_completed_videos(db_session)

        broken_db = MagicMock(wraps=db_session)
        broken_db.query.side_effect = OperationalError(
            "SELECT ...", {}, Exception("connection reset by peer")
        )

        with pytest.raises(OperationalError):
            project_analysis_steps._check_project_cancellation(
                broken_db, str(project.id)
            )

    def test_cross_explain_raises_for_autoretry_when_precheck_db_fails(
        self, db_session, monkeypatch
    ):
        """cross_explain must surface the OperationalError instead of
        proceeding to the BYOK/LLM resolution."""
        from sqlalchemy.exc import OperationalError

        from app.tasks import project_analysis_steps

        project = _seed_project_with_completed_videos(db_session)
        pa = ProjectAnalysis(
            project_id=project.id,
            status="processing",
            video_ids=[],
            cross_video_patterns=[{"id": "CP1"}],
        )
        db_session.add(pa)
        db_session.commit()

        byok_calls: list = []

        def _spy_byok(db, user_id, step, *, force_refresh=False):
            byok_calls.append(step)
            return (None, None)

        monkeypatch.setattr(
            project_analysis_steps,
            "_resolve_byok_or_raise_credits_error",
            _spy_byok,
        )

        broken_db = MagicMock(wraps=db_session)
        broken_db.query.side_effect = OperationalError(
            "SELECT ...", {}, Exception("server closed connection")
        )

        mock_self = MagicMock()
        mock_self.db = broken_db
        unbound = project_analysis_steps.analyze_cross_explain_step._orig_run.__func__
        with pytest.raises(OperationalError):
            unbound(mock_self, str(project.id), "dev_user_local")

        assert byok_calls == [], (
            "cross_explain proceeded to BYOK/LLM resolution despite unknown "
            "cancellation state."
        )


class TestProjectErrorWriterSurfacesCommitFailure:
    """_update_project_analysis_error must re-raise if writing the error
    state itself fails, surfacing exactly once without recursing."""

    def test_update_project_analysis_error_reraises_when_commit_fails(self, db_session):
        from sqlalchemy.exc import OperationalError

        from app.tasks import project_analysis_steps

        project = _seed_project_with_completed_videos(db_session)
        pa = ProjectAnalysis(
            project_id=project.id, status="processing", video_ids=[]
        )
        db_session.add(pa)
        db_session.commit()

        broken_db = MagicMock(wraps=db_session)
        broken_db.commit.side_effect = OperationalError(
            "COMMIT", {}, Exception("WAL write failed")
        )

        call_count = {"n": 0}
        orig = project_analysis_steps._update_project_analysis_error

        def _counting(*args, **kwargs):
            call_count["n"] += 1
            return orig(*args, **kwargs)

        project_analysis_steps._update_project_analysis_error = _counting
        try:
            with pytest.raises(OperationalError):
                project_analysis_steps._update_project_analysis_error(
                    broken_db, str(project.id), "cross_explain"
                )
        finally:
            project_analysis_steps._update_project_analysis_error = orig

        assert call_count["n"] == 1  # surfaced once, no recursion


# ---------------------------------------------------------------------------
# Crash-injection: result+status atomicity for the cross-video chain
# ---------------------------------------------------------------------------


class _SimulatedWorkerKill(BaseException):
    """BaseException so it escapes the step's ``except Exception`` block —
    simulates a SIGKILL/OOM where the process dies mid-function and no
    error-writer runs."""


class _CountingKillSession:
    """Proxies a real Session but raises ``_SimulatedWorkerKill`` on the Nth
    ``commit()``, rolling back first so the killed transaction's lock is
    released and its pending writes are discarded (the net effect of a
    dropped connection)."""

    def __init__(self, real_session, kill_on_commit: int):
        self._real = real_session
        self._kill_on = kill_on_commit
        self.commit_count = 0

    def commit(self):
        self.commit_count += 1
        if self.commit_count == self._kill_on:
            try:
                self._real.rollback()
            except Exception:
                pass
            raise _SimulatedWorkerKill(
                f"worker killed at commit #{self.commit_count}"
            )
        return self._real.commit()

    def __getattr__(self, name):
        return getattr(self._real, name)


class TestCrossStepCommitAtomicity:
    """Each cross-video step persists its result and its state transition in
    a SINGLE commit. A kill before that commit lands must leave the PA row in
    its pre-step state (no torn partial), and re-delivery must complete it."""

    def test_cross_explain_crash_then_redelivery_is_atomic(
        self, db_session, monkeypatch
    ):
        from app.tasks import project_analysis_steps

        project = _seed_project_with_completed_videos(db_session)
        pa = ProjectAnalysis(
            project_id=project.id,
            status="processing",
            video_ids=[],
            cross_video_patterns=[{"id": "CP1"}],
        )
        db_session.add(pa)
        db_session.commit()

        calls = {"node": 0}

        def _node(state):
            calls["node"] += 1
            return {"cross_video_insights": [{"id": "CI1", "text": "ins"}]}

        monkeypatch.setattr(project_analysis_steps, "cross_explain_node", _node)
        monkeypatch.setattr(
            project_analysis_steps,
            "_resolve_byok_or_raise_credits_error",
            lambda db, user_id, step, *, force_refresh=False: (None, None),
        )

        unbound = project_analysis_steps.analyze_cross_explain_step._orig_run.__func__

        # cross_explain makes exactly ONE commit (results). Kill it.
        kill = _CountingKillSession(db_session, kill_on_commit=1)
        s1 = MagicMock()
        s1.db = kill
        with pytest.raises(_SimulatedWorkerKill):
            unbound(s1, str(project.id), "dev_user_local")

        # Durable state: insights never persisted (atomic single commit),
        # status still 'processing' (recoverable).
        db_session.expire_all()
        row = db_session.query(ProjectAnalysis).filter_by(project_id=project.id).first()
        assert row.cross_video_insights is None
        assert row.status == "processing"

        # Re-delivery completes it.
        s2 = MagicMock()
        s2.db = db_session
        result = unbound(s2, str(project.id), "dev_user_local")
        assert result["status"] == "success"
        db_session.expire_all()
        row = db_session.query(ProjectAnalysis).filter_by(project_id=project.id).first()
        assert row.cross_video_insights == [{"id": "CI1", "text": "ins"}]
        assert calls["node"] == 2  # re-ran once per delivery

    def test_cross_activate_crash_leaves_no_partial_completion(
        self, db_session, monkeypatch
    ):
        """The terminal step writes results + CHAIN_SUCCEEDED in one commit.
        A kill before it must NOT leave status=completed without principles,
        nor principles without completed status."""
        from app.tasks import project_analysis_steps

        project = _seed_project_with_completed_videos(db_session)
        pa = ProjectAnalysis(
            project_id=project.id,
            status="processing",
            video_ids=[],
            cross_video_patterns=[{"id": "CP1"}],
            cross_video_insights=[{"id": "CI1"}],
        )
        db_session.add(pa)
        db_session.commit()

        def _node(state):
            return {"cross_video_principles": [{"id": "CDP1"}]}

        monkeypatch.setattr(project_analysis_steps, "cross_activate_node", _node)
        monkeypatch.setattr(
            project_analysis_steps,
            "_resolve_byok_or_raise_credits_error",
            lambda db, user_id, step, *, force_refresh=False: (None, None),
        )

        unbound = project_analysis_steps.analyze_cross_activate_step._orig_run.__func__
        kill = _CountingKillSession(db_session, kill_on_commit=1)
        s1 = MagicMock()
        s1.db = kill
        with pytest.raises(_SimulatedWorkerKill):
            unbound(s1, str(project.id), "dev_user_local")

        db_session.expire_all()
        row = db_session.query(ProjectAnalysis).filter_by(project_id=project.id).first()
        principles = row.cross_video_principles
        is_completed = row.status == "completed"
        assert not (is_completed and principles is None), (
            "cross_activate: status=completed WITHOUT principles — torn write."
        )
        assert not (principles is not None and not is_completed), (
            "cross_activate: principles WITHOUT completed status — torn write."
        )
        # Surviving state is the recoverable pre-completion one.
        assert principles is None
        assert row.status == "processing"

        # Re-delivery finishes it atomically.
        s2 = MagicMock()
        s2.db = db_session
        unbound(s2, str(project.id), "dev_user_local")
        db_session.expire_all()
        row = db_session.query(ProjectAnalysis).filter_by(project_id=project.id).first()
        assert row.status == "completed"
        assert row.cross_video_principles == [{"id": "CDP1"}]
        assert row.completed_at is not None


class TestCrossStepFailurePolicy:
    """Cross-video failure policy mirrors the per-video one: retryable
    failures keep the PA row 'processing' for Celery's autoretry; only
    non-retryable failures stamp 'error' immediately."""

    def test_cross_explain_retryable_node_error_leaves_processing(
        self, db_session, monkeypatch
    ):
        from app.tasks import project_analysis_steps

        project = _seed_project_with_completed_videos(db_session)
        pa = ProjectAnalysis(
            project_id=project.id,
            status="processing",
            video_ids=[],
            cross_video_patterns=[{"id": "CP1"}],
        )
        db_session.add(pa)
        db_session.commit()

        # Retryable node error.
        monkeypatch.setattr(
            project_analysis_steps,
            "cross_explain_node",
            lambda state: {"error": "rate limited", "error_type": "rate_limit"},
        )
        monkeypatch.setattr(
            project_analysis_steps,
            "_resolve_byok_or_raise_credits_error",
            lambda db, user_id, step, *, force_refresh=False: (None, None),
        )

        unbound = project_analysis_steps.analyze_cross_explain_step._orig_run.__func__
        s = MagicMock()
        s.db = db_session
        with pytest.raises(Exception):
            unbound(s, str(project.id), "dev_user_local")

        db_session.expire_all()
        row = db_session.query(ProjectAnalysis).filter_by(project_id=project.id).first()
        assert row.status == "processing"  # runnable for autoretry, not error

    def test_cross_explain_nonretryable_node_error_stamps_error(
        self, db_session, monkeypatch
    ):
        from app.tasks import project_analysis_steps

        project = _seed_project_with_completed_videos(db_session)
        pa = ProjectAnalysis(
            project_id=project.id,
            status="processing",
            video_ids=[],
            cross_video_patterns=[{"id": "CP1"}],
        )
        db_session.add(pa)
        db_session.commit()

        from app.tasks.analysis_steps import NonRetryableAnalysisError

        monkeypatch.setattr(
            project_analysis_steps,
            "cross_explain_node",
            lambda state: {"error": "bad schema", "error_type": "validation_error"},
        )
        monkeypatch.setattr(
            project_analysis_steps,
            "_resolve_byok_or_raise_credits_error",
            lambda db, user_id, step, *, force_refresh=False: (None, None),
        )

        unbound = project_analysis_steps.analyze_cross_explain_step._orig_run.__func__
        s = MagicMock()
        s.db = db_session
        with pytest.raises(NonRetryableAnalysisError):
            unbound(s, str(project.id), "dev_user_local")

        db_session.expire_all()
        row = db_session.query(ProjectAnalysis).filter_by(project_id=project.id).first()
        assert row.status == "error"  # stamped immediately


class TestErrorMessagePersistence:
    """_update_project_analysis_error and handle_project_pipeline_error must
    write a structured error_message to the PA row."""

    def test_update_project_analysis_error_writes_error_message(self, db_session):
        """_update_project_analysis_error should set error_message with step + exc info."""
        from app.tasks import project_analysis_steps

        project = _seed_project_with_completed_videos(db_session)
        pa = ProjectAnalysis(
            project_id=project.id, status="processing", video_ids=[]
        )
        db_session.add(pa)
        db_session.commit()

        exc = ValueError("rate limit exceeded")
        project_analysis_steps._update_project_analysis_error(
            db_session, str(project.id), "cross_relate", exc=exc
        )

        db_session.refresh(pa)
        assert pa.error_message is not None
        parsed = json.loads(pa.error_message)
        assert parsed["step"] == "cross_relate"
        assert "rate limit exceeded" in parsed["message"]

    def test_update_project_analysis_error_writes_fallback_when_no_exc(self, db_session):
        """Without an exc argument, error_message should fall back to a generic string."""
        from app.tasks import project_analysis_steps

        project = _seed_project_with_completed_videos(db_session)
        pa = ProjectAnalysis(
            project_id=project.id, status="processing", video_ids=[]
        )
        db_session.add(pa)
        db_session.commit()

        project_analysis_steps._update_project_analysis_error(
            db_session, str(project.id), "cross_explain"
        )

        db_session.refresh(pa)
        assert pa.error_message is not None
        parsed = json.loads(pa.error_message)
        assert parsed["step"] == "cross_explain"

    def test_handle_project_pipeline_error_writes_error_message(self, db_session):
        """handle_project_pipeline_error should set error_message on the PA row."""
        from app.tasks import pipeline_errors

        project = _seed_project_with_completed_videos(db_session)
        pa = ProjectAnalysis(
            project_id=project.id, status="processing", video_ids=[]
        )
        db_session.add(pa)
        db_session.commit()

        # Inject the test session directly into the task's thread-local store
        pipeline_errors.handle_project_pipeline_error._thread_local.db = db_session

        exc = RuntimeError("OpenRouter credits exhausted")
        fake_request = MagicMock()
        fake_request.task = "analyze_cross_relate_step"

        pipeline_errors.handle_project_pipeline_error.run(
            fake_request, exc, "fake-traceback", str(project.id)
        )

        db_session.refresh(pa)
        assert pa.error_message is not None
        parsed = json.loads(pa.error_message)
        assert parsed["step"] == "cross_relate"
        assert "OpenRouter credits exhausted" in parsed["message"]

    def test_project_analysis_response_schema_includes_error_message(self):
        """ProjectAnalysisResponse.model_validate should include error_message."""
        from uuid import uuid4

        from app.models.database_models import ProjectAnalysis
        from app.models.schemas import ProjectAnalysisResponse

        error_json = '{"step": "cross_relate", "error_type": "ValueError", "retryable": false, "message": "bad input"}'
        pa = ProjectAnalysis(
            id=uuid4(),
            project_id=uuid4(),
            status="error",
            video_ids=[],
            error_message=error_json,
        )

        response = ProjectAnalysisResponse.model_validate(pa)
        assert response.error_message is not None
        assert "cross_relate" in response.error_message

    def test_project_analysis_response_error_message_nullable(self):
        """ProjectAnalysisResponse.error_message should be None when not set."""
        from uuid import uuid4

        from app.models.database_models import ProjectAnalysis
        from app.models.schemas import ProjectAnalysisResponse

        pa = ProjectAnalysis(
            id=uuid4(),
            project_id=uuid4(),
            status="completed",
            video_ids=[],
        )

        response = ProjectAnalysisResponse.model_validate(pa)
        assert response.error_message is None
