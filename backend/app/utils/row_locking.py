"""Row-level locking helpers for compare-and-swap status transitions.

Audit finding R-H2: status transitions across the codebase were
read-modify-write *without* any row lock, so two concurrent actors
(two retry clicks, or the watchdog vs. a live task) could both read the
same pre-state, both pass a check-then-act guard, and both commit —
last-writer-wins, duplicate chain dispatch, or a watchdog stamping
``error`` over a row a live task just completed.

The fix is to ``SELECT ... FOR UPDATE`` the status-bearing row inside
the transaction that performs the guard, so concurrent transactions
*serialize* on that row: the second one blocks until the first commits,
then re-reads the post-commit state and makes its decision against fresh
data (409 / idempotent no-op / re-check staleness).

Database-portability note
-------------------------
``FOR UPDATE`` is a PostgreSQL feature. SQLAlchemy's SQLite dialect
**silently ignores** ``with_for_update()`` — it simply does not emit the
clause — so these helpers are safe to call against the SQLite test DB.
That also means the logic-level tests prove *the guard logic*, not *the
lock*: SQLite gives us no real row contention. The real blocking
behaviour is proven separately by the Postgres-only concurrency test
(``tests/test_row_locking_postgres.py``), which is skipped unless a
PostgreSQL ``DATABASE_URL`` is present.

Lock-ordering / deadlock policy
-------------------------------
GLOBAL LOCK ORDER for every *blocking* (non-SKIP-LOCKED) acquirer:

    Video  →  child status row (VideoAnalysis / Transcript)

i.e. parent before child. This covers explicit ``FOR UPDATE`` locks AND
the implicit row locks taken by ``UPDATE`` statements at flush/commit —
a transaction that has locked a child and then flushes an ``UPDATE
videos`` is acquiring the Video lock *second*, which inverts the order.
(That exact inversion — step routes / auto-dispatch locking VideoAnalysis
first while ``/analyze`` held Video and waited on VideoAnalysis — was a
reproducible Postgres deadlock caught in the PR #48 review; the fix is
that every route/task that will touch ``video.status`` locks the Video
row explicitly FIRST. Locked in by
``tests/test_row_locking_postgres.py::test_global_lock_order_*``.)

The watchdog is exempt from the ordering rule because it acquires every
lock with ``SKIP LOCKED`` and therefore never *waits* — it can never be
the blocked side of a cycle. It also processes one candidate per
transaction so no lock is held across its sweep.
"""

from __future__ import annotations

from typing import TypeVar

from sqlalchemy.orm import Query

T = TypeVar("T")


def lock_rows(query: Query[T], *, skip_locked: bool = False, of=None) -> Query[T]:
    """Apply ``FOR UPDATE`` to ``query`` when running on PostgreSQL.

    On SQLite this is a no-op (the test DB cannot prove locking — see the
    module docstring). On PostgreSQL the returned query, when executed
    inside an open transaction, acquires a row-level write lock on each
    matched row and holds it until the transaction commits or rolls back.

    Args:
        query: a SQLAlchemy ORM ``Query`` selecting the status-bearing row(s).
        skip_locked: when True (watchdog sweep only), rows already locked by
            another transaction are *skipped* rather than waited on, so the
            sweep never blocks behind a live task. Postgres-only; ignored on
            SQLite.
        of: an ORM entity (or list of entities) to restrict the lock to via
            ``FOR UPDATE OF <table>``. Use this when the query JOINs other
            tables (e.g. ownership joins) so ONLY the status-bearing row is
            locked, not every joined row — that keeps locks to a single row
            and avoids contending on a shared parent (e.g. the Project) across
            unrelated children. Postgres-only; ignored on SQLite.

    Returns:
        The same query with the locking clause applied (or the original
        query unchanged on non-Postgres backends).
    """
    bind = query.session.get_bind() if query.session is not None else None
    if bind is None or bind.dialect.name != "postgresql":
        # SQLite (tests) and any other backend: leave the query untouched.
        # with_for_update would be silently dropped by SQLite anyway, but we
        # avoid emitting skip_locked semantics that a non-Postgres backend
        # might reject.
        return query
    kwargs = {"skip_locked": skip_locked}
    if of is not None:
        kwargs["of"] = of
    return query.with_for_update(**kwargs)
