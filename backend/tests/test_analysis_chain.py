"""Tests for the Celery chain-based analysis pipeline."""

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


class TestCancellationPrecheckTransientDB:
    """A transient DB outage inside the cancellation precheck must RAISE,
    not silently return False ("not cancelled"). Returning False would let
    the step proceed and burn an LLM call (and BYOK credits) on work that
    may already be cancelled. Raising lets Celery's autoretry decorator
    (autoretry_for=(Exception,), max_retries=3) retry the precheck."""

    def test_check_cancellation_reraises_on_operational_error(self, db_session):
        """Mock the query to raise OperationalError → precheck must re-raise,
        not return False."""
        from unittest.mock import MagicMock

        from sqlalchemy.exc import OperationalError

        from app.tasks import analysis_steps

        _, video = _seed_project_video_transcript(db_session)

        # Wrap the real session so .query() raises a transient DB error but
        # .rollback()/.expire_all() stay functional (mirrors a mid-request
        # connection drop).
        broken_db = MagicMock(wraps=db_session)
        broken_db.query.side_effect = OperationalError(
            "SELECT ...", {}, Exception("server closed the connection unexpectedly")
        )

        with pytest.raises(OperationalError):
            analysis_steps._check_cancellation(broken_db, str(video.id))

    def test_step_task_raises_for_autoretry_when_precheck_db_fails(self, db_session):
        """The full step body must surface the OperationalError (Celery
        autoretry path) instead of proceeding to the BYOK/LLM call.

        We assert the step never reaches resolve_byok_with_preflight — i.e.
        no LLM credits are burned when the cancellation state is unknown."""
        from unittest.mock import MagicMock

        from sqlalchemy.exc import OperationalError

        from app.tasks import analysis_steps

        _, video = _seed_project_video_transcript(db_session)
        analysis = VideoAnalysis(
            video_id=video.id,
            status="processing",
            inferences=[{"id": "i1"}],  # so relate would otherwise proceed
            step_status={"chunk": "completed", "infer": "completed"},
        )
        db_session.add(analysis)
        db_session.commit()

        # First .query() call (the precheck) raises; sentinel proves the
        # step body never advanced to BYOK resolution.
        broken_db = MagicMock(wraps=db_session)
        broken_db.query.side_effect = OperationalError(
            "SELECT ...", {}, Exception("connection refused")
        )

        byok_calls: list = []

        def _spy_byok(*args, **kwargs):
            byok_calls.append(args)
            return (None, None, None)

        import app.tasks.analysis_steps as _mod
        orig_byok = _mod.resolve_byok_with_preflight
        _mod.resolve_byok_with_preflight = _spy_byok
        try:
            mock_self = MagicMock()
            mock_self.db = broken_db
            unbound = analysis_steps.analyze_relate_step._orig_run.__func__
            with pytest.raises(OperationalError):
                unbound(mock_self, str(video.id), None)
        finally:
            _mod.resolve_byok_with_preflight = orig_byok

        assert byok_calls == [], (
            "Step proceeded to BYOK/LLM resolution despite an unknown "
            "cancellation state — credits could be burned on cancelled work."
        )


class TestErrorWriterSurfacesCommitFailure:
    """If writing the ERROR STATE itself fails, _update_analysis_error must
    re-raise (surface to Celery / the chain's on_error) instead of leaving
    the row 'processing' silently. It must surface exactly once and must not
    recurse into itself."""

    def test_update_analysis_error_reraises_when_commit_fails(self, db_session):
        from unittest.mock import MagicMock

        from sqlalchemy.exc import OperationalError

        from app.tasks import analysis_steps

        _, video = _seed_project_video_transcript(db_session)
        analysis = VideoAnalysis(
            video_id=video.id,
            status="processing",
            step_status={"infer": "processing"},
        )
        db_session.add(analysis)
        db_session.commit()

        # Real reads succeed, but commit raises (write path is what's down).
        broken_db = MagicMock(wraps=db_session)
        broken_db.commit.side_effect = OperationalError(
            "COMMIT", {}, Exception("could not write to WAL")
        )

        call_count = {"n": 0}
        orig = analysis_steps._update_analysis_error

        def _counting(*args, **kwargs):
            call_count["n"] += 1
            return orig(*args, **kwargs)

        analysis_steps._update_analysis_error = _counting
        try:
            with pytest.raises(OperationalError):
                analysis_steps._update_analysis_error(
                    broken_db, str(video.id), "infer", exc=RuntimeError("boom")
                )
        finally:
            analysis_steps._update_analysis_error = orig

        # Surfaced exactly once — no recursive re-entry into the writer.
        assert call_count["n"] == 1

    def test_step_except_block_surfaces_writer_failure_once(self, db_session):
        """End-to-end: a step whose body fails AND whose error-write fails
        must propagate one exception out of the task (Celery autoretry),
        not swallow both."""
        from unittest.mock import MagicMock

        from sqlalchemy.exc import OperationalError

        from app.tasks import analysis_steps

        _, video = _seed_project_video_transcript(db_session)
        analysis = VideoAnalysis(
            video_id=video.id,
            status="processing",
            inferences=None,  # forces "No inferences available" raise in relate
            step_status={"chunk": "completed"},
        )
        db_session.add(analysis)
        db_session.commit()

        # Precheck read works; later commit (in the error writer) fails.
        broken_db = MagicMock(wraps=db_session)
        broken_db.commit.side_effect = OperationalError(
            "COMMIT", {}, Exception("disk full")
        )

        mock_self = MagicMock()
        mock_self.db = broken_db
        unbound = analysis_steps.analyze_relate_step._orig_run.__func__
        # Exactly one exception propagates; it is the surfaced failure.
        with pytest.raises(Exception):
            unbound(mock_self, str(video.id), None)


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

    @pytest.mark.parametrize("step_name,task_attr", [
        ("chunk", "analyze_chunk_step"),
        ("infer", "analyze_infer_step"),
        ("relate", "analyze_relate_step"),
        ("explain", "analyze_explain_step"),
        ("activate", "analyze_activate_step"),
    ])
    def test_step_returns_skipped_when_analysis_completed(
        self, db_session, step_name, task_attr, monkeypatch
    ):
        """Sentry Cluster A (per-video sibling): a Celery-redelivered step on an
        already-'completed' VideoAnalysis must be a clean no-op — NOT re-run the
        LLM node and NOT fire a transition illegal from 'completed' (e.g.
        analyze_chunk_step's CHAIN_STARTED). Mirrors the cross-video guard."""
        from unittest.mock import MagicMock

        from app.tasks import analysis_steps

        _, video = _seed_project_video_transcript(db_session)
        analysis = VideoAnalysis(
            video_id=video.id,
            status="completed",  # original delivery already finished the chain
            step_status={step_name: "completed"},
        )
        db_session.add(analysis)
        db_session.commit()

        # Guard the LLM boundary: if the precheck failed to skip, this would be
        # called and the assertion below (status==skipped) would also fail —
        # belt-and-suspenders that no duplicate spend happens.
        node_attr = f"{step_name}_node"
        if hasattr(analysis_steps, node_attr):
            monkeypatch.setattr(
                analysis_steps, node_attr,
                lambda *a, **k: pytest.fail(f"{node_attr} ran on a completed (redelivered) row"),
                raising=False,
            )

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
        # After BYOK PR #6 the chunk step calls resolve_byok_with_preflight,
        # which returns a 3-tuple (api_key, model, balance_info). Stub it
        # as a non-BYOK user (no key configured).
        monkeypatch.setattr(
            analysis_steps,
            "resolve_byok_with_preflight",
            lambda db, user_id, force_refresh=False: (None, None, None),
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
        # After BYOK PR #6 the chunk step calls resolve_byok_with_preflight,
        # which returns a 3-tuple (api_key, model, balance_info). Stub it
        # as a non-BYOK user (no key configured).
        monkeypatch.setattr(
            analysis_steps,
            "resolve_byok_with_preflight",
            lambda db, user_id, force_refresh=False: (None, None, None),
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


# ---------------------------------------------------------------------------
# Crash-injection: result+status atomicity per chain step
# ---------------------------------------------------------------------------


class _SimulatedWorkerKill(BaseException):
    """A BaseException (NOT Exception) so it escapes the step's
    ``except Exception`` block — faithfully simulating a SIGKILL / OOM
    where the process dies mid-function and no cleanup/error-writer runs.
    Any rows already committed survive; everything since the last commit
    is lost exactly as a real kill would lose it."""


class _CountingKillSession:
    """Proxies a real SQLAlchemy Session but raises ``_SimulatedWorkerKill``
    on the Nth ``commit()`` call, leaving prior commits durable and the
    pending (post-node) transaction un-persisted.

    Used to inject a crash at a precise commit boundary so tests can assert
    that the *persisted* row is never in a torn state (results without the
    matching ``step_status==completed``, or vice versa)."""

    def __init__(self, real_session, kill_on_commit: int):
        self._real = real_session
        self._kill_on = kill_on_commit
        self.commit_count = 0

    def commit(self):
        self.commit_count += 1
        if self.commit_count == self._kill_on:
            # Simulate the kernel killing the process right as the final
            # commit was about to flush: the pending changes never land.
            # A real SIGKILL drops the DB connection/socket, which releases
            # any held locks and discards the uncommitted transaction. We
            # reproduce that net effect by rolling back + closing the real
            # session's connection BEFORE raising, so (a) the pending
            # post-node writes are discarded exactly as a kill would discard
            # them, and (b) the on-disk SQLite lock is released so the
            # "fresh worker" session can proceed. (Without this, SQLite's
            # file lock from the dangling transaction would block the re-run
            # — an artifact of the test DB, not the product.)
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


# (step_name, task_attr, node_attr, node_result, result_field)
_PER_VIDEO_STEPS = [
    (
        "infer",
        "analyze_infer_step",
        "infer_node",
        {"inferences": [{"id": "X1", "text": "inf"}]},
        "inferences",
    ),
    (
        "relate",
        "analyze_relate_step",
        "relate_node",
        {"patterns": [{"id": "X1", "text": "pat"}]},
        "patterns",
    ),
    (
        "explain",
        "analyze_explain_step",
        "explain_node",
        {"insights": [{"id": "X1", "text": "ins"}]},
        "insights",
    ),
    (
        "activate",
        "analyze_activate_step",
        "activate_node",
        {"design_principles": [{"id": "X1", "text": "dp"}]},
        "design_principles",
    ),
]


def _seed_processing_analysis(db, video, *, ready_for: str):
    """Insert a VideoAnalysis in 'processing' with whatever upstream results
    the step under test consumes, so the step body runs to its node."""
    base = dict(
        video_id=video.id,
        status="processing",
        started_at=datetime_now(),
        current_step="chunk",
        step_status={
            "chunk": "completed",
            "infer": "pending",
            "relate": "pending",
            "explain": "pending",
            "activate": "pending",
        },
        chunks=[{"id": "C1", "text": "c"}],
    )
    if ready_for in ("relate", "explain", "activate"):
        base["inferences"] = [{"id": "I1"}]
        base["step_status"]["infer"] = "completed"
    if ready_for in ("explain", "activate"):
        base["patterns"] = [{"id": "P1"}]
        base["step_status"]["relate"] = "completed"
    if ready_for in ("activate",):
        base["insights"] = [{"id": "S1"}]
        base["step_status"]["explain"] = "completed"
    analysis = VideoAnalysis(**base)
    db.add(analysis)
    # The terminal (activate) step transitions Video analyzing -> analyzed,
    # so the parent Video must be in 'analyzing' for that step to be legal.
    video.status = "analyzing"
    db.commit()
    return analysis


def datetime_now():
    from datetime import datetime, timezone
    return datetime.now(timezone.utc)


class TestStepCommitAtomicity:
    """A step that runs its node successfully but is then killed before the
    final commit lands must NEVER leave a torn row: the result field and the
    ``step_status[step]=='completed'`` marker move together (one atomic
    commit) or not at all. Broker re-delivery (re-running the task on a fresh
    session) must then complete the step correctly and idempotently."""

    @pytest.mark.parametrize(
        "step_name,task_attr,node_attr,node_result,result_field", _PER_VIDEO_STEPS
    )
    def test_crash_before_final_commit_leaves_no_torn_state(
        self, db_session, monkeypatch, step_name, task_attr, node_attr,
        node_result, result_field,
    ):
        from app.tasks import analysis_steps

        _, video = _seed_project_video_transcript(db_session)
        _seed_processing_analysis(db_session, video, ready_for=step_name)

        monkeypatch.setattr(
            analysis_steps, node_attr, lambda state: dict(node_result)
        )
        monkeypatch.setattr(
            analysis_steps,
            "resolve_byok_with_preflight",
            lambda db, user_id, force_refresh=False: (None, None, None),
        )

        # The step makes a start-marker commit (processing) then a final
        # finalize commit (results + completed). Kill at the *last* commit.
        # Count commits the step will make so we target the final one.
        kill_session = _CountingKillSession(db_session, kill_on_commit=2)
        mock_self = MagicMock()
        mock_self.db = kill_session

        unbound = getattr(analysis_steps, task_attr)._orig_run.__func__
        with pytest.raises(_SimulatedWorkerKill):
            unbound(mock_self, str(video.id), "dev_user_local")

        # Inspect ONLY durable (committed) state: the killed session was
        # rolled back, so expire_all() forces a re-read from the DB file —
        # exactly what a restarted worker would see.
        db_session.expire_all()
        row = db_session.query(VideoAnalysis).filter_by(video_id=video.id).first()
        result_value = getattr(row, result_field)
        is_completed = (row.step_status or {}).get(step_name) == "completed"

        # The torn states the atomicity guarantee forbids:
        assert not (is_completed and result_value is None), (
            f"{step_name}: persisted 'completed' status WITHOUT results — "
            "torn write (status committed before results)."
        )
        assert not (result_value is not None and not is_completed), (
            f"{step_name}: persisted results WITHOUT 'completed' status — "
            "torn write (results committed before status)."
        )
        # And the surviving state is the start-marker (recoverable) state.
        assert row.step_status.get(step_name) == "processing"
        assert result_value is None

    @pytest.mark.parametrize(
        "step_name,task_attr,node_attr,node_result,result_field", _PER_VIDEO_STEPS
    )
    def test_redelivery_after_crash_completes_step(
        self, db_session, monkeypatch, step_name, task_attr, node_attr,
        node_result, result_field,
    ):
        """After the crash leaves the start-marker state, re-running the task
        (broker re-delivery) on a clean session completes the step and writes
        results+completed atomically — no duplication, no corruption."""
        from app.tasks import analysis_steps

        _, video = _seed_project_video_transcript(db_session)
        _seed_processing_analysis(db_session, video, ready_for=step_name)

        calls = {"node": 0}

        def _node(state):
            calls["node"] += 1
            return dict(node_result)

        monkeypatch.setattr(analysis_steps, node_attr, _node)
        monkeypatch.setattr(
            analysis_steps,
            "resolve_byok_with_preflight",
            lambda db, user_id, force_refresh=False: (None, None, None),
        )

        # First delivery: crash at the final commit. The killed session is
        # rolled back inside the kill, releasing its lock.
        kill_session = _CountingKillSession(db_session, kill_on_commit=2)
        s1 = MagicMock()
        s1.db = kill_session
        unbound = getattr(analysis_steps, task_attr)._orig_run.__func__
        with pytest.raises(_SimulatedWorkerKill):
            unbound(s1, str(video.id), "dev_user_local")

        # Second delivery (re-run) on a clean session — a restarted worker
        # picks up the re-delivered task and re-reads the start-marker row.
        db_session.expire_all()
        s2 = MagicMock()
        s2.db = db_session
        result = unbound(s2, str(video.id), "dev_user_local")
        assert result["status"] == "success"

        db_session.expire_all()
        row = db_session.query(VideoAnalysis).filter_by(video_id=video.id).first()
        assert (row.step_status or {}).get(step_name) == "completed"
        assert getattr(row, result_field) == node_result[result_field]
        # Re-running must not duplicate the result (single overwrite, not append).
        assert len(getattr(row, result_field)) == len(node_result[result_field])
        # Node ran once per delivery — re-delivery legitimately re-runs it.
        assert calls["node"] == 2


class TestRetryabluFinalCommitFailureIsRecoverable:
    """If the FINAL (results) commit fails with a RETRYABLE error (transient
    DB hiccup), the step's except block writes status=error and re-raises so
    Celery autoretries. The retried attempt MUST be able to re-run the node
    and finish — it must NOT be swallowed by the cancellation precheck (which
    short-circuits on status=='error'). Otherwise a one-off transient commit
    failure becomes a permanent error that only a manual retry can clear.

    This is the reviewer's exact concern: 'an error in the final combined
    commit now loses the in-memory results — is the retry path clean?'."""

    def test_retryable_commit_failure_then_autoretry_completes(
        self, db_session, monkeypatch
    ):
        from sqlalchemy.exc import OperationalError

        from app.tasks import analysis_steps

        _, video = _seed_project_video_transcript(db_session)
        _seed_processing_analysis(db_session, video, ready_for="infer")

        calls = {"node": 0}

        def _node(state):
            calls["node"] += 1
            return {"inferences": [{"id": "I1", "text": "inf"}]}

        monkeypatch.setattr(analysis_steps, "infer_node", _node)
        monkeypatch.setattr(
            analysis_steps,
            "resolve_byok_with_preflight",
            lambda db, user_id, force_refresh=False: (None, None, None),
        )

        unbound = analysis_steps.analyze_infer_step._orig_run.__func__

        # ---- Attempt 1: the FINAL (results) commit raises a transient error.
        # The except block runs _update_analysis_error (which commits
        # status=error), then re-raises for Celery autoretry.
        class _FailFinalCommit:
            def __init__(self, real):
                self._real = real
                self.n = 0

            def commit(self):
                self.n += 1
                if self.n == 2:  # 2nd commit = the results/finalize commit
                    raise OperationalError("COMMIT", {}, Exception("WAL hiccup"))
                return self._real.commit()

            def __getattr__(self, name):
                return getattr(self._real, name)

        failing = _FailFinalCommit(db_session)
        s1 = MagicMock()
        s1.db = failing
        with pytest.raises(OperationalError):
            unbound(s1, str(video.id), "dev_user_local")

        # ---- Attempt 2: Celery autoretry re-runs the SAME step on a clean
        # session. The retry path MUST recover (not skip on status==error).
        db_session.expire_all()
        s2 = MagicMock()
        s2.db = db_session
        result = unbound(s2, str(video.id), "dev_user_local")

        assert result["status"] == "success", (
            "Retry after a transient final-commit failure was swallowed by "
            "the cancellation precheck — transient error became permanent."
        )
        db_session.expire_all()
        row = db_session.query(VideoAnalysis).filter_by(video_id=video.id).first()
        assert (row.step_status or {}).get("infer") == "completed"
        assert row.inferences == [{"id": "I1", "text": "inf"}]
        assert row.status == "processing"  # back to a runnable state, not error


class TestStepFailurePolicy:
    """The per-step failure policy: retryable failures keep the row
    'processing' (so Celery's autoretry isn't swallowed by the cancellation
    precheck); non-retryable failures stamp 'error' immediately (so the user
    isn't left waiting on the watchdog and there's no retry to collide with)."""

    def test_retryable_node_error_leaves_row_processing(
        self, db_session, monkeypatch
    ):
        from app.tasks import analysis_steps

        _, video = _seed_project_video_transcript(db_session)
        _seed_processing_analysis(db_session, video, ready_for="infer")

        # Node returns a RETRYABLE error_type -> _raise_for_node_error raises
        # a plain Exception (autoretry path).
        monkeypatch.setattr(
            analysis_steps,
            "infer_node",
            lambda state: {"error": "rate limited", "error_type": "rate_limit"},
        )
        monkeypatch.setattr(
            analysis_steps,
            "resolve_byok_with_preflight",
            lambda db, user_id, force_refresh=False: (None, None, None),
        )

        unbound = analysis_steps.analyze_infer_step._orig_run.__func__
        s = MagicMock()
        s.db = db_session
        with pytest.raises(Exception):
            unbound(s, str(video.id), "dev_user_local")

        db_session.expire_all()
        row = db_session.query(VideoAnalysis).filter_by(video_id=video.id).first()
        # NOT stamped error — left runnable for the autoretry.
        assert row.status == "processing"
        assert (row.step_status or {}).get("infer") != "error"

    def test_nonretryable_node_error_stamps_error_immediately(
        self, db_session, monkeypatch
    ):
        from app.tasks import analysis_steps

        _, video = _seed_project_video_transcript(db_session)
        _seed_processing_analysis(db_session, video, ready_for="infer")

        # Node returns a NON-retryable error_type (validation_error) ->
        # _raise_for_node_error raises NonRetryableAnalysisError.
        monkeypatch.setattr(
            analysis_steps,
            "infer_node",
            lambda state: {"error": "bad schema", "error_type": "validation_error"},
        )
        monkeypatch.setattr(
            analysis_steps,
            "resolve_byok_with_preflight",
            lambda db, user_id, force_refresh=False: (None, None, None),
        )

        unbound = analysis_steps.analyze_infer_step._orig_run.__func__
        s = MagicMock()
        s.db = db_session
        with pytest.raises(analysis_steps.NonRetryableAnalysisError):
            unbound(s, str(video.id), "dev_user_local")

        db_session.expire_all()
        row = db_session.query(VideoAnalysis).filter_by(video_id=video.id).first()
        # Stamped error immediately so the user sees it without the watchdog.
        assert row.status == "error"
        assert (row.step_status or {}).get("infer") == "error"

    def test_nonretryable_path_still_surfaces_writer_commit_failure(
        self, db_session, monkeypatch
    ):
        """For a non-retryable failure, the error-writer is invoked; if its
        own commit fails, that must still surface (not be swallowed)."""
        from sqlalchemy.exc import OperationalError

        from app.tasks import analysis_steps

        _, video = _seed_project_video_transcript(db_session)
        _seed_processing_analysis(db_session, video, ready_for="infer")

        monkeypatch.setattr(
            analysis_steps,
            "infer_node",
            lambda state: {"error": "bad schema", "error_type": "validation_error"},
        )
        monkeypatch.setattr(
            analysis_steps,
            "resolve_byok_with_preflight",
            lambda db, user_id, force_refresh=False: (None, None, None),
        )

        # The error-writer's commit fails.
        broken_db = MagicMock(wraps=db_session)
        broken_db.commit.side_effect = OperationalError(
            "COMMIT", {}, Exception("disk full")
        )
        s = MagicMock()
        s.db = broken_db
        unbound = analysis_steps.analyze_infer_step._orig_run.__func__
        with pytest.raises(Exception):
            unbound(s, str(video.id), "dev_user_local")
