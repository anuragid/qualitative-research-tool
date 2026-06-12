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
