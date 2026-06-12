"""Real-PostgreSQL concurrency tests that PROVE ``FOR UPDATE`` blocking.

The SQLite-based logic tests (test_row_locking_cas.py) prove the GUARD
LOGIC but cannot prove real lock contention — SQLite silently ignores
``FOR UPDATE``. These tests use TWO real Postgres connections (two threads)
to prove:

  1. A second ``SELECT ... FOR UPDATE`` on a row another transaction holds
     BLOCKS until that transaction commits (this is what serializes the
     route guards and stops duplicate-chain dispatch).
  2. ``SELECT ... FOR UPDATE SKIP LOCKED`` does NOT block — it returns no
     row immediately (this is what stops the watchdog sweep from waiting
     behind a live task).

GATING / CI
-----------
Skipped unless a PostgreSQL ``DATABASE_URL`` (or ``TEST_DATABASE_URL``) is
present. The default Backend-CI pytest job runs on SQLite, so these are
SKIPPED there. They DO run locally against the docker-compose Postgres, and
the PR body documents the manual run + its output. The CI ``alembic-drift``
job has a Postgres service but does not invoke pytest, so wiring these into
that job was deemed too invasive for this PR (documented, not done).
"""

from __future__ import annotations

import os
import threading
import time
import uuid

import pytest

_PG_URL = os.environ.get("TEST_DATABASE_URL") or os.environ.get("DATABASE_URL", "")
_HAS_PG = _PG_URL.startswith("postgresql")

pytestmark = pytest.mark.skipif(
    not _HAS_PG,
    reason="real-Postgres lock test: set DATABASE_URL/TEST_DATABASE_URL to a "
    "postgresql:// URL to run (SQLite cannot prove FOR UPDATE blocking)",
)

if _HAS_PG:
    from sqlalchemy import create_engine, text
    from sqlalchemy.orm import sessionmaker

    from app.utils.row_locking import lock_rows


@pytest.fixture
def pg_engine():
    eng = create_engine(_PG_URL, pool_size=5, max_overflow=5)
    # Minimal scratch table — avoid depending on the full ORM schema/migrations.
    with eng.begin() as conn:
        conn.execute(text("DROP TABLE IF EXISTS _lock_probe"))
        conn.execute(text(
            "CREATE TABLE _lock_probe (id varchar(36) PRIMARY KEY, status varchar(50))"
        ))
    yield eng
    with eng.begin() as conn:
        conn.execute(text("DROP TABLE IF EXISTS _lock_probe"))
    eng.dispose()


def test_for_update_blocks_second_selector(pg_engine):
    """Thread B's FOR UPDATE on a row A holds must block until A commits."""
    Session = sessionmaker(bind=pg_engine)
    row_id = uuid.uuid4().hex

    with pg_engine.begin() as conn:
        conn.execute(
            text("INSERT INTO _lock_probe (id, status) VALUES (:id, 'processing')"),
            {"id": row_id},
        )

    events: list[tuple[str, float]] = []
    a_commit_done = threading.Event()
    b_acquired = threading.Event()

    def actor_a():
        sa = Session()
        try:
            sa.execute(
                text("SELECT id FROM _lock_probe WHERE id = :id FOR UPDATE"),
                {"id": row_id},
            ).first()
            events.append(("A_locked", time.monotonic()))
            # Hold the lock briefly so B is forced to wait on it.
            time.sleep(0.5)
            sa.execute(
                text("UPDATE _lock_probe SET status = 'done' WHERE id = :id"),
                {"id": row_id},
            )
            sa.commit()
            events.append(("A_committed", time.monotonic()))
            a_commit_done.set()
        finally:
            sa.close()

    def actor_b():
        # Ensure A grabs the lock first.
        time.sleep(0.1)
        sb = Session()
        try:
            sb.execute(
                text("SELECT id FROM _lock_probe WHERE id = :id FOR UPDATE"),
                {"id": row_id},
            ).first()
            events.append(("B_acquired", time.monotonic()))
            b_acquired.set()
            sb.commit()
        finally:
            sb.close()

    ta = threading.Thread(target=actor_a)
    tb = threading.Thread(target=actor_b)
    ta.start()
    tb.start()
    ta.join(timeout=10)
    tb.join(timeout=10)

    times = dict(events)
    assert "A_committed" in times, "actor A did not commit"
    assert "B_acquired" in times, "actor B never acquired the lock (deadlock?)"
    # The proof: B could not acquire the lock until AFTER A committed.
    assert times["B_acquired"] >= times["A_committed"], (
        "FOR UPDATE did not block: B acquired the lock before A committed"
    )


def test_skip_locked_does_not_block(pg_engine):
    """FOR UPDATE SKIP LOCKED returns immediately (no row) instead of waiting
    — this is what keeps the watchdog sweep from blocking on a live task."""
    Session = sessionmaker(bind=pg_engine)
    row_id = uuid.uuid4().hex

    with pg_engine.begin() as conn:
        conn.execute(
            text("INSERT INTO _lock_probe (id, status) VALUES (:id, 'processing')"),
            {"id": row_id},
        )

    sa = Session()
    sb = Session()
    try:
        # A holds the row lock.
        sa.execute(
            text("SELECT id FROM _lock_probe WHERE id = :id FOR UPDATE"),
            {"id": row_id},
        ).first()

        # B with SKIP LOCKED must return NO row immediately rather than block.
        t0 = time.monotonic()
        row = sb.execute(
            text("SELECT id FROM _lock_probe WHERE id = :id FOR UPDATE SKIP LOCKED"),
            {"id": row_id},
        ).first()
        elapsed = time.monotonic() - t0

        assert row is None, "SKIP LOCKED should skip the locked row (got a row)"
        assert elapsed < 1.0, f"SKIP LOCKED blocked for {elapsed:.2f}s (should not block)"
        sb.commit()
        sa.commit()
    finally:
        sa.close()
        sb.close()


# ---------------------------------------------------------------------------
# Global lock-order regression tests (PR #48 review finding)
# ---------------------------------------------------------------------------
#
# The review reproduced a real deadlock: /analyze locked Video -> VideoAnalysis
# while the step routes / auto-dispatch locked VideoAnalysis first and then
# implicitly locked Video via the UPDATE at commit — opposite orders, plain
# FOR UPDATE on both sides, textbook cycle. The fix establishes a GLOBAL
# order (Video first, then the child status row) for every blocking acquirer.
#
# These tests encode the two lock-acquisition sequences on a parent/child
# scratch-table pair and prove, against real Postgres:
#   - the canonical V->child order run concurrently from both sides
#     serializes cleanly (no deadlock), and
#   - the inverted order (child first, then UPDATE parent — the pre-fix step
#     route / auto-dispatch shape) deterministically deadlocks, so this
#     harness genuinely detects ordering inversions (not theater).
#
# HONEST LIMIT: these mirror the routes' lock sequences; they do not execute
# the route handlers themselves (driving two real HTTP requests against a
# Postgres-backed app with forced mid-transaction overlap is not supported by
# the current test infra). The code-side guarantee is the explicit
# for_update=True Video lock at the TOP of every route/task that later
# mutates video.status — grep `GLOBAL LOCK ORDER` in app/.


@pytest.fixture
def pg_parent_child(pg_engine):
    """Parent/child scratch tables + one row each, mirroring videos /
    video_analyses."""
    parent_id = uuid.uuid4().hex
    child_id = uuid.uuid4().hex
    with pg_engine.begin() as conn:
        conn.execute(text("DROP TABLE IF EXISTS _lock_child"))
        conn.execute(text("DROP TABLE IF EXISTS _lock_parent"))
        conn.execute(text(
            "CREATE TABLE _lock_parent (id varchar(36) PRIMARY KEY, status varchar(50))"
        ))
        conn.execute(text(
            "CREATE TABLE _lock_child (id varchar(36) PRIMARY KEY, "
            "parent_id varchar(36) REFERENCES _lock_parent(id), status varchar(50))"
        ))
        conn.execute(
            text("INSERT INTO _lock_parent (id, status) VALUES (:id, 'transcribed')"),
            {"id": parent_id},
        )
        conn.execute(
            text("INSERT INTO _lock_child (id, parent_id, status) "
                 "VALUES (:id, :pid, 'error')"),
            {"id": child_id, "pid": parent_id},
        )
    yield {"engine": pg_engine, "parent_id": parent_id, "child_id": child_id}
    with pg_engine.begin() as conn:
        conn.execute(text("DROP TABLE IF EXISTS _lock_child"))
        conn.execute(text("DROP TABLE IF EXISTS _lock_parent"))


def _run_sequence(Session, steps, errors, hold_seconds=0.5):
    """Run a list of SQL steps in one transaction, sleeping after the first
    statement so the two actors genuinely overlap mid-transaction."""
    s = Session()
    try:
        first = True
        for stmt, params in steps:
            s.execute(text(stmt), params)
            if first:
                time.sleep(hold_seconds)
                first = False
        s.commit()
    except Exception as exc:  # noqa: BLE001 - collected for assertions
        errors.append(exc)
        s.rollback()
    finally:
        s.close()


def test_global_lock_order_video_first_does_not_deadlock(pg_parent_child):
    """Both actors use the canonical order (parent FOR UPDATE, then child
    FOR UPDATE, then UPDATE both) — mirroring /analyze AND the fixed step
    routes / auto-dispatch. Run concurrently with forced overlap, they must
    serialize cleanly: zero errors."""
    eng = pg_parent_child["engine"]
    pid, cid = pg_parent_child["parent_id"], pg_parent_child["child_id"]
    Session = sessionmaker(bind=eng)

    canonical = [
        ("SELECT id FROM _lock_parent WHERE id = :pid FOR UPDATE", {"pid": pid}),
        ("SELECT id FROM _lock_child WHERE id = :cid FOR UPDATE", {"cid": cid}),
        ("UPDATE _lock_parent SET status = 'analyzing' WHERE id = :pid", {"pid": pid}),
        ("UPDATE _lock_child SET status = 'pending' WHERE id = :cid", {"cid": cid}),
    ]

    errors: list[Exception] = []
    threads = [
        threading.Thread(target=_run_sequence, args=(Session, canonical, errors))
        for _ in range(2)
    ]
    for t in threads:
        t.start()
    for t in threads:
        t.join(timeout=15)

    assert not errors, (
        f"canonical V->child order must not deadlock, got: {errors!r}"
    )


def test_inverted_lock_order_deadlocks_proving_detection(pg_parent_child):
    """The PRE-FIX shape: actor A = /analyze (parent FOR UPDATE, then child
    FOR UPDATE); actor B = old step route / auto-dispatch (child FOR UPDATE
    first, then UPDATE parent at flush). With forced overlap Postgres's
    deadlock detector must abort one of them — proving this harness would
    catch a regression that reintroduces the inversion."""
    eng = pg_parent_child["engine"]
    pid, cid = pg_parent_child["parent_id"], pg_parent_child["child_id"]
    Session = sessionmaker(bind=eng)

    analyze_route = [  # V -> child (correct, unchanged)
        ("SELECT id FROM _lock_parent WHERE id = :pid FOR UPDATE", {"pid": pid}),
        ("SELECT id FROM _lock_child WHERE id = :cid FOR UPDATE", {"cid": cid}),
    ]
    old_step_route = [  # child -> V (the pre-fix inversion)
        ("SELECT id FROM _lock_child WHERE id = :cid FOR UPDATE", {"cid": cid}),
        ("UPDATE _lock_parent SET status = 'analyzing' WHERE id = :pid", {"pid": pid}),
    ]

    errors: list[Exception] = []
    ta = threading.Thread(target=_run_sequence, args=(Session, analyze_route, errors))
    tb = threading.Thread(target=_run_sequence, args=(Session, old_step_route, errors))
    ta.start()
    tb.start()
    ta.join(timeout=15)
    tb.join(timeout=15)

    assert len(errors) == 1, (
        f"inverted lock order should deadlock exactly one actor, got {errors!r}"
    )
    assert "deadlock detected" in str(errors[0]).lower(), (
        f"expected a Postgres deadlock abort, got: {errors[0]!r}"
    )


def test_lock_rows_helper_compiles_for_update_on_pg(pg_engine):
    """End-to-end: the actual ``lock_rows`` helper emits a real FOR UPDATE
    against live Postgres (not just a compiled-string check)."""
    from sqlalchemy import Column, MetaData, String, Table

    Session = sessionmaker(bind=pg_engine)
    meta = MetaData()
    probe = Table("_lock_probe", meta,
                  Column("id", String(36), primary_key=True),
                  Column("status", String(50)))

    row_id = uuid.uuid4().hex
    with pg_engine.begin() as conn:
        conn.execute(probe.insert().values(id=row_id, status="processing"))

    s = Session()
    try:
        q = s.query(probe.c.id).filter(probe.c.id == row_id)
        locked = lock_rows(q)
        compiled = str(locked.statement.compile(pg_engine)).upper()
        assert "FOR UPDATE" in compiled
        # And it actually executes without error inside a transaction.
        assert locked.first() is not None
        s.commit()
    finally:
        s.close()
