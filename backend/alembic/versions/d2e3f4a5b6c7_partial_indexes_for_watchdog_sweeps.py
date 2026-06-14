"""Partial indexes for the watchdog stuck-row sweeps.

Revision ID: d2e3f4a5b6c7
Revises: c1a2b3d4e5f6
Create Date: 2026-06-13

WHY
---
PR #42 (migration b8c4d2e3f5a6) added 7 single-column FK/status indexes —
correct for the list/detail read paths — but the WATCHDOG
(``reset_stuck_analyses``, Celery beat every 5 min) filters on a *compound*
predicate that none of those indexes can serve, so 3 of its 4 sweeps
seq-scan on every pass:

    reset_stuck_video_analyses    WHERE video_analyses.status='processing'
                                    AND video_analyses.started_at < cutoff
    reset_stuck_project_analyses  WHERE project_analyses.status='processing'
                                    AND project_analyses.started_at < cutoff
    reset_stuck_transcripts       WHERE transcripts.status='processing'
                                    AND transcripts.created_at  < cutoff

(The 4th sweep, ``reset_orphaned_analyzing_videos``, is already covered by
``ix_videos_status`` + ``ix_video_analyses_video_id`` from PR #42.)

PARTIAL, not composite
----------------------
The watchdog ALWAYS filters ``status = 'processing'``. A PARTIAL index on the
timestamp column restricted to that subset is strictly tighter than a
composite ``(status, started_at)`` index:

  * It indexes only the handful of rows actually in flight. Nearly every row
    is terminal (completed / error / pending), so the partial index stays
    tiny and hot in cache, and the planner gets an index-only scan of exactly
    the rows the sweep wants.
  * No redundant ``status`` key column (it is constant within the index),
    so each entry is smaller and writes only touch the index while a row is
    'processing'.
  * The constant predicate is baked in, so the planner needs no selectivity
    estimate on ``status`` to choose it.

These partial indexes are declared in ``app/models/database_models.py`` via
``Index(..., postgresql_where=text("status = 'processing'"))`` so the
autogenerate drift gate (scripts/ci/check_migration_drift.py) sees model == DB
and stays exit-0 with an EMPTY allowlist. (SQLAlchemy 2.0 autogenerate treats
the model predicate ``status = 'processing'`` and the Postgres-reflected
``(status)::text = 'processing'::text`` as equivalent — verified on
postgres:15-alpine.)

CONCURRENTLY / autocommit / idempotency
---------------------------------------
Mirrors b8c4d2e3f5a6 exactly. ``CREATE INDEX CONCURRENTLY`` cannot run inside
a transaction, and alembic wraps every migration in one, so we use the
documented ``op.get_context().autocommit_block()`` escape hatch. Every
statement is ``IF NOT EXISTS`` / ``IF EXISTS``; each CREATE is preceded by a
``DROP INDEX CONCURRENTLY IF EXISTS`` to self-heal any leftover INVALID index
from a prior interrupted CONCURRENTLY build, so re-running the whole migration
is always safe.
"""
from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "d2e3f4a5b6c7"
down_revision: Union[str, None] = "c1a2b3d4e5f6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# (index_name, table_name, timestamp_column) — all partial: WHERE status='processing'.
_PARTIAL_INDEXES: tuple[tuple[str, str, str], ...] = (
    ("ix_video_analyses_status_started", "video_analyses", "started_at"),
    ("ix_project_analyses_status_started", "project_analyses", "started_at"),
    ("ix_transcripts_status_created", "transcripts", "created_at"),
)


def upgrade() -> None:
    # Break out of alembic's surrounding transaction: CONCURRENTLY forbids one.
    with op.get_context().autocommit_block():
        for index_name, table, column in _PARTIAL_INDEXES:
            # Self-heal any leftover INVALID index from a prior interrupted run,
            # then (re)build concurrently. Both statements are idempotent.
            op.execute(f"DROP INDEX CONCURRENTLY IF EXISTS {index_name}")
            op.execute(
                f"CREATE INDEX CONCURRENTLY IF NOT EXISTS {index_name} "
                f"ON {table} ({column}) WHERE status = 'processing'"
            )


def downgrade() -> None:
    with op.get_context().autocommit_block():
        for index_name, _table, _column in _PARTIAL_INDEXES:
            op.execute(f"DROP INDEX CONCURRENTLY IF EXISTS {index_name}")
