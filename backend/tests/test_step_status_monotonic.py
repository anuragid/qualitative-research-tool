"""Tests for monotonic ``step_status`` updates in the per-video analysis chain.

THE BUG (diagnosed from a production end-to-end run):
A ``VideoAnalysis.step_status`` JSONB map could end up internally
inconsistent — e.g. ``relate: "processing"`` while the downstream
``explain``/``activate`` were already ``"completed"`` — which is impossible
given the fixed chain order chunk -> infer -> relate -> explain -> activate.

ROOT CAUSE:
With Celery ``acks_late`` + a ``visibility_timeout`` under ``--pool=threads``
(which cannot enforce ``task_time_limit``), a slow first step
(``analyze_chunk_step``) gets RE-DELIVERED while the original is still running.
The re-delivered chunk task HARD-RESET the whole step_status map to
``{chunk:"processing", infer:"pending", ...}``, clobbering later steps that
had already completed. The step tasks take no row lock, so it was
last-writer-wins, and the corrupt map was *persisted* (the watchdog only fixes
``status='processing'`` rows, but this row was already ``status='completed'``).
The frontend progress UI then showed a completed video with a step stuck
"processing" forever.

THE FIX:
Make every step_status write MONOTONIC. A re-delivered earlier step can never
downgrade a later step that already advanced. Ranks:
``pending(0) < processing(1) < completed(2) == error(2)``. An update only
applies to a key if its rank is >= the existing key's rank. The deliberate
RETRY-from-error reset in the route (under a row lock) is NOT a re-delivery and
remains a TRUE reset — it does not go through the monotonic merge.

The deeper duplicate-delivery problem (Celery lifecycle / locking) is tracked
SEPARATELY. This file asserts only that the symptom — a corrupted, downgraded
step_status map — can no longer be persisted.
"""

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


from app.database import Base  # noqa: E402
from app.models.database_models import (  # noqa: E402
    Project,
    Transcript,
    User,
    Video,
    VideoAnalysis,
)
from app.tasks import analysis_steps  # noqa: E402
from app.tasks.analysis_steps import _merge_step_status  # noqa: E402

ALL_PENDING = {
    "chunk": "pending",
    "infer": "pending",
    "relate": "pending",
    "explain": "pending",
    "activate": "pending",
}
ALL_COMPLETED = {k: "completed" for k in ALL_PENDING}

# The exact reset map the re-delivered chunk task applies.
CHUNK_RESET = {
    "chunk": "processing",
    "infer": "pending",
    "relate": "pending",
    "explain": "pending",
    "activate": "pending",
}


@pytest.fixture
def db_session(tmp_path):
    db_path = tmp_path / "step_status_monotonic_test.db"
    engine = create_engine(f"sqlite:///{db_path}")
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()


def _seed_project_video_transcript(db, user_id: str = "dev_user_local"):
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
# Unit tests for the merge helper itself
# ---------------------------------------------------------------------------


class TestMergeStepStatusUnit:
    def test_completed_cannot_be_downgraded_to_processing(self):
        result = _merge_step_status({"infer": "completed"}, {"infer": "processing"})
        assert result["infer"] == "completed"

    def test_completed_cannot_be_downgraded_to_pending(self):
        result = _merge_step_status({"infer": "completed"}, {"infer": "pending"})
        assert result["infer"] == "completed"

    def test_processing_can_advance_to_completed(self):
        result = _merge_step_status({"infer": "processing"}, {"infer": "completed"})
        assert result["infer"] == "completed"

    def test_pending_can_advance_to_processing(self):
        result = _merge_step_status({"infer": "pending"}, {"infer": "processing"})
        assert result["infer"] == "processing"

    def test_pending_can_advance_to_completed(self):
        result = _merge_step_status({"infer": "pending"}, {"infer": "completed"})
        assert result["infer"] == "completed"

    def test_processing_cannot_be_downgraded_to_pending(self):
        result = _merge_step_status({"infer": "processing"}, {"infer": "pending"})
        assert result["infer"] == "processing"

    def test_missing_key_is_seeded(self):
        result = _merge_step_status({}, {"chunk": "processing"})
        assert result["chunk"] == "processing"

    def test_seeds_pending_into_empty_map(self):
        result = _merge_step_status({}, ALL_PENDING)
        assert result == ALL_PENDING

    def test_does_not_mutate_inputs(self):
        current = {"infer": "completed"}
        updates = {"infer": "processing"}
        _merge_step_status(current, updates)
        assert current == {"infer": "completed"}
        assert updates == {"infer": "processing"}

    def test_handles_none_current(self):
        result = _merge_step_status(None, {"chunk": "processing"})
        assert result["chunk"] == "processing"

    def test_unrelated_keys_preserved(self):
        result = _merge_step_status(
            {"chunk": "completed", "infer": "completed"},
            {"relate": "processing"},
        )
        assert result["chunk"] == "completed"
        assert result["infer"] == "completed"
        assert result["relate"] == "processing"

    def test_completed_to_completed_idempotent(self):
        result = _merge_step_status({"infer": "completed"}, {"infer": "completed"})
        assert result["infer"] == "completed"

    # 'error' ranks at the same level as 'completed' (both terminal=2). A
    # terminal step must not be silently bounced back to processing/pending by
    # a stale earlier-step write, and an errored step is allowed to be written
    # as error/completed (same rank) but never downgraded.
    def test_error_cannot_be_downgraded_to_processing(self):
        result = _merge_step_status({"relate": "error"}, {"relate": "processing"})
        assert result["relate"] == "error"

    def test_error_cannot_be_downgraded_to_pending(self):
        result = _merge_step_status({"relate": "error"}, {"relate": "pending"})
        assert result["relate"] == "error"

    def test_processing_can_become_error(self):
        # An in-flight step that fails must be allowed to record its error.
        result = _merge_step_status({"relate": "processing"}, {"relate": "error"})
        assert result["relate"] == "error"

    def test_pending_can_become_error(self):
        result = _merge_step_status({"relate": "pending"}, {"relate": "error"})
        assert result["relate"] == "error"


# ---------------------------------------------------------------------------
# The exact bug scenario: a re-delivered chunk reset must not downgrade.
# ---------------------------------------------------------------------------


class TestRedeliveredChunkResetIsMonotonic:
    def test_chunk_reset_does_not_downgrade_completed_steps(self):
        """All five steps completed; a re-delivered chunk applies its
        whole-map reset. NO step may be downgraded."""
        merged = _merge_step_status(ALL_COMPLETED, CHUNK_RESET)
        assert merged == ALL_COMPLETED, (
            "Re-delivered chunk reset downgraded already-completed steps — "
            "this is the production bug."
        )

    def test_chunk_reset_does_not_downgrade_partial_progress(self):
        current = {
            "chunk": "completed",
            "infer": "completed",
            "relate": "completed",
            "explain": "processing",
            "activate": "pending",
        }
        merged = _merge_step_status(current, CHUNK_RESET)
        # Nothing pulled back: explain stays processing, the completed ones
        # stay completed, only genuinely-pending activate stays pending.
        assert merged["chunk"] == "completed"
        assert merged["infer"] == "completed"
        assert merged["relate"] == "completed"
        assert merged["explain"] == "processing"
        assert merged["activate"] == "pending"

    def test_chunk_reset_seeds_keys_on_a_fresh_row(self):
        """On a genuinely fresh row (no prior progress), the chunk reset must
        still seed the full pending map and mark chunk processing."""
        merged = _merge_step_status({}, CHUNK_RESET)
        assert merged == CHUNK_RESET


# ---------------------------------------------------------------------------
# Integration: the re-delivered chunk TASK can no longer corrupt the row.
# ---------------------------------------------------------------------------


class TestRedeliveredChunkTaskCannotCorruptCompletedRow:
    def test_redelivered_chunk_step_leaves_completed_steps_intact(
        self, db_session, monkeypatch
    ):
        """Simulate the production race window: the long-running original
        ``analyze_chunk_step`` is still in flight (so the row is still
        ``status='processing'`` and ``CHAIN_STARTED`` is legal), but the
        downstream steps already raced ahead and wrote ``completed`` into the
        shared step_status map (last-writer-wins, no row lock). Now the
        RE-DELIVERED chunk task runs and applies its whole-map reset. After the
        fix that reset must NOT downgrade any already-'completed' later step —
        otherwise the corrupt, impossible map (a later step pulled back to
        pending/processing) gets persisted and the frontend renders a perpetual
        spinner on a finished step."""
        _, video = _seed_project_video_transcript(db_session)
        video.status = "analyzing"
        analysis = VideoAnalysis(
            video_id=video.id,
            status="processing",  # original chunk still in flight
            current_step="activate",
            step_status=dict(ALL_COMPLETED),  # downstream raced ahead
            chunks=[{"id": "C1"}],
            inferences=[{"id": "I1"}],
            patterns=[{"id": "P1"}],
            insights=[{"id": "S1"}],
            design_principles=[{"id": "D1"}],
        )
        db_session.add(analysis)
        db_session.commit()

        # Stub the chunk node + BYOK so the re-delivered chunk runs to its
        # finalize commit without hitting the LLM.
        monkeypatch.setattr(
            analysis_steps,
            "chunk_node",
            lambda state: {"chunks": [{"id": "C1", "text": "re"}]},
        )
        monkeypatch.setattr(
            analysis_steps,
            "resolve_byok_with_preflight",
            lambda db, user_id, force_refresh=False: (None, None, None),
        )

        mock_self = MagicMock()
        mock_self.db = db_session
        unbound = analysis_steps.analyze_chunk_step._orig_run.__func__
        unbound(mock_self, str(video.id), "dev_user_local")

        db_session.expire_all()
        row = db_session.query(VideoAnalysis).filter_by(video_id=video.id).first()
        # NO downstream step may have been downgraded by the re-delivery.
        assert row.step_status["infer"] == "completed"
        assert row.step_status["relate"] == "completed"
        assert row.step_status["explain"] == "completed"
        assert row.step_status["activate"] == "completed"
        # And no step is left "processing" on a completed row.
        assert "processing" not in row.step_status.values(), (
            "A completed row has a step stuck 'processing' — the production "
            "symptom the frontend renders as a perpetual spinner."
        )


# ---------------------------------------------------------------------------
# Normal forward progression still works end-to-end through the helper.
# ---------------------------------------------------------------------------


class TestForwardProgressionStillWorks:
    def test_full_chain_progresses_each_step_to_completed(
        self, db_session, monkeypatch
    ):
        """Run all five steps in order on one row; each must advance correctly
        and the final map must be all-completed."""
        _, video = _seed_project_video_transcript(db_session)

        monkeypatch.setattr(
            analysis_steps,
            "resolve_byok_with_preflight",
            lambda db, user_id, force_refresh=False: (None, None, None),
        )
        monkeypatch.setattr(
            analysis_steps, "chunk_node",
            lambda state: {"chunks": [{"id": "C1"}]},
        )
        monkeypatch.setattr(
            analysis_steps, "infer_node",
            lambda state: {"inferences": [{"id": "I1"}]},
        )
        monkeypatch.setattr(
            analysis_steps, "relate_node",
            lambda state: {"patterns": [{"id": "P1"}]},
        )
        monkeypatch.setattr(
            analysis_steps, "explain_node",
            lambda state: {"insights": [{"id": "S1"}]},
        )
        monkeypatch.setattr(
            analysis_steps, "activate_node",
            lambda state: {"design_principles": [{"id": "D1"}]},
        )

        mock_self = MagicMock()
        mock_self.db = db_session

        for attr in (
            "analyze_chunk_step",
            "analyze_infer_step",
            "analyze_relate_step",
            "analyze_explain_step",
            "analyze_activate_step",
        ):
            unbound = getattr(analysis_steps, attr)._orig_run.__func__
            result = unbound(mock_self, str(video.id), "dev_user_local")
            assert result["status"] == "success", f"{attr} did not succeed"

        db_session.expire_all()
        row = db_session.query(VideoAnalysis).filter_by(video_id=video.id).first()
        assert row.step_status == ALL_COMPLETED
        assert row.status == "completed"


# ---------------------------------------------------------------------------
# Regression guard for #40: the deliberate retry-from-error reset must STILL
# fully reset step_status to empty (it is a user action under a row lock, not a
# re-delivery). The monotonic merge must NOT leak into this deliberate reset —
# otherwise a stale all-"completed" map would be preserved and the re-run would
# immediately skip every step ("already completed"), recreating the very
# retry-swallow bug PR #40 fixed.
#
# This exercises the real /analyze HTTP route (the same pattern as
# tests/test_analyze_retry.py) so the row lock + the route's reset block are
# covered exactly as production runs them.
# ---------------------------------------------------------------------------


class TestRetryResetStillFullyResets:
    @pytest.mark.asyncio
    async def test_retry_from_error_clears_stale_completed_step_status(self, tmp_path):
        from unittest.mock import patch

        from httpx import ASGITransport, AsyncClient

        from tests.test_analyze_retry import (
            _override_get_db,
            _set_video_status,
            _setup_test_db,
        )

        TestSession, meta, video_uuid, _project = _setup_test_db(tmp_path)

        # Seed an errored analysis row whose step_status is a STALE, fully
        # "completed" map (the worst case for the monotonic merge: if the merge
        # leaked into the reset, every key would survive and the re-run would
        # skip all steps).
        import uuid as uuid_module
        from datetime import datetime, timezone

        now = datetime.now(timezone.utc)
        db = TestSession()
        db.execute(
            meta.tables["video_analyses"].insert().values(
                id=uuid_module.uuid4().hex,
                video_id=video_uuid.hex,
                status="error",
                current_step="activate",
                step_status=dict(ALL_COMPLETED),
                started_at=now,
                completed_at=now,
                chunk_completed_at=now,
                infer_completed_at=now,
                chunks=[{"chunk_id": "c1"}],
                inferences=[{"chunk_id": "c1"}],
            )
        )
        db.commit()
        db.close()
        _set_video_status(TestSession, meta, video_uuid, "error")

        from app.database import get_db
        from app.main import app

        fake_task = MagicMock()
        fake_task.id = "fake-task-id"
        app.dependency_overrides[get_db] = _override_get_db(TestSession)
        try:
            with patch(
                "celery.canvas._chain.apply_async", return_value=fake_task
            ):
                transport = ASGITransport(app=app)
                async with AsyncClient(
                    transport=transport, base_url="http://test"
                ) as http:
                    resp = await http.post(
                        f"/api/videos/{video_uuid}/analyze",
                        headers={"Authorization": "Bearer dev-bypass"},
                    )
            assert resp.status_code in (200, 202), resp.text[:300]

            db = TestSession()
            try:
                row = db.execute(
                    meta.tables["video_analyses"].select().where(
                        meta.tables["video_analyses"].c.video_id == video_uuid.hex
                    )
                ).fetchone()
            finally:
                db.close()
            row_dict = dict(row._mapping)
            # The retry reset is a TRUE reset: the stale completed map is fully
            # cleared (NOT preserved by a leaked monotonic merge).
            assert row_dict["step_status"] in ({}, None), (
                "Retry-from-error reset failed to fully clear a stale completed "
                "step_status — the monotonic merge must not be applied to the "
                "deliberate row-locked reset (regression of #40)."
            )
            assert row_dict["status"] == "pending"
            assert row_dict["chunks"] is None
        finally:
            app.dependency_overrides.clear()
