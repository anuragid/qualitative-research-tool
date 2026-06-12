"""Compare-and-swap (CAS) logic-level tests for status-transition guards.

Audit R-H2: status transitions were check-then-act without row locks, so
concurrent actors raced. PR fix/select-for-update-cas serializes them with
``SELECT ... FOR UPDATE`` (see app/utils/row_locking.py).

WHAT THESE TESTS PROVE (and what they DON'T)
--------------------------------------------
SQLite — the unit-test backend — silently ignores ``FOR UPDATE``. So these
tests CANNOT prove real lock blocking. What they DO prove is the *guard
logic*: that each contended site (a) re-reads the status-bearing row inside
the request transaction, and (b) re-evaluates its guard against the value
that is actually committed at decision time — so when the lock makes the
second actor read *after* the first commits (which is what Postgres
guarantees), it correctly sees the new state and 409s / no-ops / skips.

We simulate the Postgres serialization manually: actor A commits first,
then actor B runs against the post-A-commit state, and we assert B makes
the correct decision. The real blocking is proven by
``test_row_locking_postgres.py`` (Postgres-only, skipped in SQLite CI).
"""

from __future__ import annotations

import os
import uuid
from datetime import datetime, timedelta, timezone

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
from sqlalchemy import ARRAY, create_engine, text  # noqa: E402
from sqlalchemy.dialects.postgresql import JSONB, UUID  # noqa: E402
from sqlalchemy.ext.compiler import compiles  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402


@compiles(UUID, "sqlite")
def _compile_uuid_sqlite(type_, compiler, **kw):
    return "CHAR(36)"


@compiles(JSONB, "sqlite")
def _compile_jsonb_sqlite(type_, compiler, **kw):
    return "JSON"


@compiles(ARRAY, "sqlite")
def _compile_array_sqlite(type_, compiler, **kw):
    return "JSON"


from app.database import Base  # noqa: E402
from app.models.database_models import (  # noqa: E402, I001
    Project,
    ProjectAnalysis,
    Transcript,
    User,
    Video,
    VideoAnalysis,
)


@pytest.fixture
def engine(tmp_path):
    eng = create_engine(f"sqlite:///{tmp_path / 'cas_test.db'}")
    Base.metadata.create_all(bind=eng)
    return eng


@pytest.fixture
def Session(engine):
    return sessionmaker(bind=engine)


# ---------------------------------------------------------------------------
# Seed helpers
# ---------------------------------------------------------------------------


def _seed(Session, *, video_status="error", va_status="error", started_at=None):
    """Seed a user/project/video/transcript/analysis and return their ids."""
    db = Session()
    uid = "dev_user_local"
    if not db.query(User).filter(User.id == uid).first():
        db.add(User(id=uid, email="dev@local", role="user"))
    pid = uuid.uuid4()
    vid = uuid.uuid4()
    db.add(Project(id=pid, user_id=uid, name="P", status="planning"))
    db.add(Video(
        id=vid, project_id=pid, filename="t.mp4",
        s3_key="k", s3_url="u", status=video_status,
    ))
    db.add(Transcript(id=uuid.uuid4(), video_id=vid, status="completed",
                      processed_transcript={"utterances": []}))
    aid = uuid.uuid4()
    db.add(VideoAnalysis(
        id=aid, video_id=vid, status=va_status, started_at=started_at,
    ))
    db.commit()
    db.close()
    return {"project_id": pid, "video_id": vid, "analysis_id": aid, "user_id": uid}


def _seed_project_analysis(Session, *, pa_status="error", started_at=None):
    db = Session()
    uid = "dev_user_local"
    if not db.query(User).filter(User.id == uid).first():
        db.add(User(id=uid, email="dev@local", role="user"))
    pid = uuid.uuid4()
    vid = uuid.uuid4()
    db.add(Project(id=pid, user_id=uid, name="P", status="planning"))
    db.add(Video(id=vid, project_id=pid, filename="t.mp4",
                 s3_key="k", s3_url="u", status="analyzed"))
    db.add(VideoAnalysis(id=uuid.uuid4(), video_id=vid, status="completed"))
    db.commit()
    paid = uuid.uuid4()
    # Insert ProjectAnalysis via raw SQL: its video_ids is an ARRAY(UUID)
    # column the ORM can't bind on SQLite (the ORM-vs-SQLite ARRAY problem
    # documented in test_project_analysis_retry.py). The watchdog/route read
    # it back fine because @compiles maps ARRAY -> JSON for SQLite DDL.
    db.execute(
        text(
            "INSERT INTO project_analyses (id, project_id, video_ids, status, started_at) "
            "VALUES (:id, :pid, :vids, :status, :started)"
        ),
        {
            "id": paid.hex,
            "pid": pid.hex,
            "vids": f'["{vid}"]',
            "status": pa_status,
            "started": started_at,
        },
    )
    db.commit()
    db.close()
    return {"project_id": pid, "video_id": vid, "analysis_id": paid, "user_id": uid}


# ===========================================================================
# 1. Watchdog vs live task — CAS re-check inside the locked transaction
# ===========================================================================


class TestWatchdogReCheckVsLiveTask:
    """The watchdog selects 'stuck processing' candidates, then re-reads each
    candidate UNDER LOCK and re-checks staleness before stamping error. If a
    live task completed the row between the candidate SELECT and the locked
    re-check, the watchdog must NOT clobber the completed row.

    We simulate the interleave: the row is processing+stale when seeded (so
    it would be a candidate), but a 'live task' flips it to completed before
    the watchdog runs. Post-fix the watchdog re-reads current state and skips.
    """

    def test_watchdog_does_not_clobber_row_completed_after_candidate_select(self, Session):
        from app.tasks.watchdog_tasks import reset_stuck_analyses

        stale = datetime.now(timezone.utc) - timedelta(minutes=40)
        ids = _seed(Session, video_status="analyzing", va_status="processing",
                    started_at=stale)

        # --- Live task wins the race: it completes the analysis + video. ---
        live = Session()
        va = live.query(VideoAnalysis).filter_by(id=ids["analysis_id"]).first()
        va.status = "completed"
        va.completed_at = datetime.now(timezone.utc)
        v = live.query(Video).filter_by(id=ids["video_id"]).first()
        v.status = "analyzed"
        live.commit()
        live.close()

        # --- Watchdog runs against the post-commit state. ---
        wd = Session()
        reset_stuck_analyses._thread_local.db = wd
        try:
            reset_stuck_analyses.run()
        finally:
            reset_stuck_analyses._thread_local.db = None

        check = Session()
        try:
            va2 = check.query(VideoAnalysis).filter_by(id=ids["analysis_id"]).first()
            v2 = check.query(Video).filter_by(id=ids["video_id"]).first()
            # Watchdog must NOT have stamped error over the completed row.
            assert va2.status == "completed", (
                "Watchdog clobbered a row a live task already completed"
            )
            assert v2.status == "analyzed"
        finally:
            check.close()

    def test_watchdog_recheck_is_load_bearing_in_the_race_window(self, Session, monkeypatch):
        """THE anti-theater test. The row is processing+stale at the candidate
        SELECT (so it IS a candidate), but a live task completes it in the
        window between the candidate SELECT and the stamp. We inject that
        concurrent completion via the lock helper. The watchdog's
        under-lock re-check must catch it and NOT stamp error.

        If the re-check predicate is deleted, this test fails — proving the
        re-check is load-bearing, not decorative. (SQLite can't block, so we
        manufacture the exact interleave the Postgres lock would expose.)
        """
        import app.tasks.watchdog_tasks as wd_mod

        stale = datetime.now(timezone.utc) - timedelta(minutes=40)
        ids = _seed(Session, video_status="analyzing", va_status="processing",
                    started_at=stale)

        real_lock_row = wd_mod._lock_row
        fired = {"done": False}

        def _racing_lock_row(db, model, row_id):
            # Simulate: between the candidate SELECT and the watchdog locking
            # the VideoAnalysis row, a live task commits its completion.
            if model is VideoAnalysis and not fired["done"]:
                fired["done"] = True
                live = Session()
                va = live.query(VideoAnalysis).filter_by(id=row_id).first()
                va.status = "completed"
                va.completed_at = datetime.now(timezone.utc)
                v = live.query(Video).filter_by(id=va.video_id).first()
                v.status = "analyzed"
                live.commit()
                live.close()
                # The watchdog's own session must now read the committed state.
                db.expire_all()
            return real_lock_row(db, model, row_id)

        monkeypatch.setattr(wd_mod, "_lock_row", _racing_lock_row)

        wd = Session()
        wd_mod.reset_stuck_analyses._thread_local.db = wd
        try:
            wd_mod.reset_stuck_analyses.run()
        finally:
            wd_mod.reset_stuck_analyses._thread_local.db = None

        check = Session()
        try:
            va2 = check.query(VideoAnalysis).filter_by(id=ids["analysis_id"]).first()
            v2 = check.query(Video).filter_by(id=ids["video_id"]).first()
            assert va2.status == "completed", (
                "Re-check failed: watchdog stamped error over a row a live task "
                "completed in the candidate->stamp window"
            )
            assert v2.status == "analyzed"
        finally:
            check.close()

    def test_watchdog_still_resets_a_genuinely_stuck_row(self, Session):
        """Control: a row that is *still* processing+stale at re-check time
        must still be reset to error — the CAS must not break the happy path."""
        from app.tasks.watchdog_tasks import reset_stuck_analyses

        stale = datetime.now(timezone.utc) - timedelta(minutes=40)
        ids = _seed(Session, video_status="analyzing", va_status="processing",
                    started_at=stale)

        wd = Session()
        reset_stuck_analyses._thread_local.db = wd
        try:
            reset_stuck_analyses.run()
        finally:
            reset_stuck_analyses._thread_local.db = None

        check = Session()
        try:
            va2 = check.query(VideoAnalysis).filter_by(id=ids["analysis_id"]).first()
            v2 = check.query(Video).filter_by(id=ids["video_id"]).first()
            assert va2.status == "error"
            assert v2.status == "error"
        finally:
            check.close()

    def test_watchdog_skips_project_analysis_completed_after_candidate(self, Session):
        """Same CAS protection on the ProjectAnalysis sweep path."""
        from app.tasks.watchdog_tasks import reset_stuck_analyses

        stale = datetime.now(timezone.utc) - timedelta(minutes=40)
        ids = _seed_project_analysis(Session, pa_status="processing", started_at=stale)

        live = Session()
        pa = live.query(ProjectAnalysis).filter_by(id=ids["analysis_id"]).first()
        pa.status = "completed"
        pa.completed_at = datetime.now(timezone.utc)
        live.commit()
        live.close()

        wd = Session()
        reset_stuck_analyses._thread_local.db = wd
        try:
            reset_stuck_analyses.run()
        finally:
            reset_stuck_analyses._thread_local.db = None

        check = Session()
        try:
            pa2 = check.query(ProjectAnalysis).filter_by(id=ids["analysis_id"]).first()
            assert pa2.status == "completed", (
                "Watchdog clobbered a ProjectAnalysis a live task completed"
            )
        finally:
            check.close()


# ===========================================================================
# 2. Route guard CAS — second actor sees post-commit state (video retry)
# ===========================================================================


class TestVideoRetryGuardCAS:
    """Two simultaneous /analyze retry clicks. Under the lock the second
    request reads the contended Video/VideoAnalysis row AFTER the first
    commits, sees status='analyzing'/'processing', and 409s instead of
    dispatching a duplicate chain. We simulate the serialized ordering.
    """

    @pytest.mark.asyncio
    async def test_second_retry_click_409s_after_first_commits(self, Session, monkeypatch):
        from unittest.mock import MagicMock

        ids = _seed(Session, video_status="error", va_status="error")

        # Intercept chain dispatch so nothing hits Redis; count dispatches.
        dispatch_calls = []
        fake_task = MagicMock()
        fake_task.id = "fake-task-id"

        def _fake_apply_async(self, *a, **k):  # noqa: ANN001
            dispatch_calls.append(1)
            return fake_task

        monkeypatch.setattr("celery.canvas._chain.apply_async", _fake_apply_async)

        from httpx import ASGITransport, AsyncClient

        from app.database import get_db
        from app.main import app

        def _override():
            db = Session()
            try:
                yield db
            finally:
                db.close()

        app.dependency_overrides[get_db] = _override
        try:
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as c:
                # Actor A: first retry click wins, flips video -> analyzing.
                r1 = await c.post(
                    f"/api/videos/{ids['video_id']}/analyze",
                    headers={"Authorization": "Bearer dev-bypass"},
                )
                assert r1.status_code in (200, 202), r1.text[:300]

                # Actor B: second click now reads the committed 'analyzing'
                # state (this is what the FOR UPDATE serialization guarantees
                # on Postgres) and must 409.
                r2 = await c.post(
                    f"/api/videos/{ids['video_id']}/analyze",
                    headers={"Authorization": "Bearer dev-bypass"},
                )
                assert r2.status_code == 409, (
                    f"Second concurrent retry must 409, got {r2.status_code}: {r2.text[:300]}"
                )
        finally:
            app.dependency_overrides.clear()

        # The chain was dispatched exactly once — no duplicate chain.
        assert sum(dispatch_calls) == 1, (
            f"Duplicate dispatch! chain dispatched {sum(dispatch_calls)} times"
        )


# ===========================================================================
# 3. Route guard CAS — project retry (the PR #40-confirmed race)
# ===========================================================================


class TestProjectRetryGuardCAS:
    @pytest.mark.asyncio
    async def test_second_project_retry_409s_after_first_commits(self, Session, monkeypatch):
        from unittest.mock import MagicMock

        ids = _seed_project_analysis(Session, pa_status="error")

        dispatch_calls = []
        fake_task = MagicMock()
        fake_task.id = "fake-task-id"

        def _fake_apply_async(self, *a, **k):  # noqa: ANN001
            dispatch_calls.append(1)
            return fake_task

        monkeypatch.setattr("celery.canvas._chain.apply_async", _fake_apply_async)

        from httpx import ASGITransport, AsyncClient

        from app.database import get_db
        from app.main import app

        def _override():
            db = Session()
            try:
                yield db
            finally:
                db.close()

        app.dependency_overrides[get_db] = _override
        try:
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as c:
                r1 = await c.post(
                    f"/api/projects/{ids['project_id']}/analyze",
                    headers={"Authorization": "Bearer dev-bypass"},
                )
                assert r1.status_code in (200, 202), r1.text[:300]

                r2 = await c.post(
                    f"/api/projects/{ids['project_id']}/analyze",
                    headers={"Authorization": "Bearer dev-bypass"},
                )
                assert r2.status_code == 409, (
                    f"Second concurrent project retry must 409, got {r2.status_code}: {r2.text[:300]}"
                )
        finally:
            app.dependency_overrides.clear()

        assert sum(dispatch_calls) == 1, (
            f"Duplicate project dispatch! dispatched {sum(dispatch_calls)} times"
        )


# ===========================================================================
# 4. Route guard CAS — transcribe (check-then-act 409)
# ===========================================================================


class TestTranscribeGuardCAS:
    @pytest.mark.asyncio
    async def test_second_transcribe_409s_after_first_commits(self, Session, monkeypatch):
        from unittest.mock import MagicMock

        # Seed an UPLOADED video with no transcript yet.
        db = Session()
        uid = "dev_user_local"
        db.add(User(id=uid, email="dev@local", role="user"))
        pid = uuid.uuid4()
        vid = uuid.uuid4()
        db.add(Project(id=pid, user_id=uid, name="P", status="planning"))
        db.add(Video(id=vid, project_id=pid, filename="t.mp4",
                     s3_key="k", s3_url="u", status="uploaded"))
        db.commit()
        db.close()

        fake_task = MagicMock()
        fake_task.id = "fake-task-id"
        monkeypatch.setattr(
            "app.tasks.transcription_tasks.transcribe_video_task.delay",
            lambda *a, **k: fake_task,
        )

        from httpx import ASGITransport, AsyncClient

        from app.database import get_db
        from app.main import app

        def _override():
            s = Session()
            try:
                yield s
            finally:
                s.close()

        app.dependency_overrides[get_db] = _override
        try:
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as c:
                r1 = await c.post(
                    f"/api/videos/{vid}/transcribe",
                    headers={"Authorization": "Bearer dev-bypass"},
                )
                assert r1.status_code == 202, r1.text[:300]

                r2 = await c.post(
                    f"/api/videos/{vid}/transcribe",
                    headers={"Authorization": "Bearer dev-bypass"},
                )
                assert r2.status_code == 409, (
                    f"Second concurrent transcribe must 409, got {r2.status_code}: {r2.text[:300]}"
                )
        finally:
            app.dependency_overrides.clear()
