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
Every call site here locks exactly **one** row (the contended
status-bearing row) and never holds it while acquiring a second row
lock, so there is no lock-ordering cycle and therefore no deadlock
possible between these sites. The watchdog additionally uses
``SKIP LOCKED`` so its sweep never *blocks* behind a live task's
transaction — it just skips any row another transaction is currently
mutating and revisits it on the next 5-minute pass.
"""

from __future__ import annotations

from typing import TypeVar

from sqlalchemy.orm import Query, Session

T = TypeVar("T")


def _is_postgres(db: Session) -> bool:
    """Return True iff the bound engine speaks PostgreSQL.

    ``FOR UPDATE`` / ``SKIP LOCKED`` only have teeth on Postgres; on
    SQLite SQLAlchemy ignores ``with_for_update()`` entirely. We gate the
    ``skip_locked`` flag on this because, although ``with_for_update`` is a
    no-op on SQLite, passing ``skip_locked=True`` to a dialect that does
    not support it would raise at compile time on some backends — keeping
    the call dialect-aware is the conservative choice.
    """
    bind = db.get_bind()
    return bind.dialect.name == "postgresql"


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
