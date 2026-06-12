"""Create 7 missing indexes (model declares index=True; never migrated).

Revision ID: b8c4d2e3f5a6
Revises: a7b3c9d1e2f4
Create Date: 2026-06-12

The following columns declare ``index=True`` in
``app.models.database_models`` but no migration ever created the index, so
production is missing all 7. This migration creates them
``CONCURRENTLY`` so the build does NOT take a long write lock on live tables
holding irreplaceable student research data.

    ix_videos_project_id            videos(project_id)
    ix_videos_status                videos(status)
    ix_transcripts_video_id         transcripts(video_id)
    ix_video_analyses_video_id      video_analyses(video_id)
    ix_project_analyses_project_id  project_analyses(project_id)
    ix_projects_status              projects(status)
    ix_speaker_labels_transcript_id speaker_labels(transcript_id)

WHY AUTOCOMMIT
--------------
``CREATE INDEX CONCURRENTLY`` (and ``DROP INDEX CONCURRENTLY``) cannot run
inside a transaction block. alembic's ``env.py`` wraps every migration in
``context.begin_transaction()``, so we use the documented
``context.autocommit_block()`` helper: it COMMITs the surrounding transaction,
puts the bound connection into autocommit (``isolation_level="AUTOCOMMIT"``)
for the duration of the ``with`` block, then re-opens a transaction afterwards.
Each ``CREATE INDEX CONCURRENTLY`` therefore runs in its own implicit
transaction, as Postgres requires. (Setting ``isolation_level`` directly on the
already-begun connection raises ``InvalidRequestError`` — autocommit_block is
the supported escape hatch.)

IDEMPOTENCY / RECOVERY FROM PARTIAL FAILURE
-------------------------------------------
Every statement uses ``IF NOT EXISTS`` / ``IF EXISTS`` so the migration can be
re-run safely. If ``CREATE INDEX CONCURRENTLY`` is interrupted (deploy killed,
statement timeout), Postgres leaves an ``INVALID`` index behind. ``IF NOT
EXISTS`` will then SKIP recreation (the name exists), so the recovery is:

    -- one-time, per stuck index, run manually then re-run the migration:
    DROP INDEX CONCURRENTLY IF EXISTS <index_name>;

To make recovery turnkey we DROP CONCURRENTLY IF EXISTS *before* each CREATE.
This is cheap when the index is absent or valid-and-being-replaced is not our
case; the DROP simply no-ops on a missing index and removes a leftover INVALID
one so the subsequent CREATE rebuilds it cleanly. Re-running the whole
migration is therefore always safe and self-healing.
"""
from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "b8c4d2e3f5a6"
down_revision: Union[str, None] = "a7b3c9d1e2f4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# (index_name, table_name, column_name)
_INDEXES: tuple[tuple[str, str, str], ...] = (
    ("ix_videos_project_id", "videos", "project_id"),
    ("ix_videos_status", "videos", "status"),
    ("ix_transcripts_video_id", "transcripts", "video_id"),
    ("ix_video_analyses_video_id", "video_analyses", "video_id"),
    ("ix_project_analyses_project_id", "project_analyses", "project_id"),
    ("ix_projects_status", "projects", "status"),
    ("ix_speaker_labels_transcript_id", "speaker_labels", "transcript_id"),
)


def upgrade() -> None:
    # Break out of alembic's surrounding transaction: CONCURRENTLY forbids one.
    # ``autocommit_block`` lives on the MigrationContext, reached via
    # ``op.get_context()`` (NOT the ``alembic.context`` proxy module).
    with op.get_context().autocommit_block():
        for index_name, table, column in _INDEXES:
            # Self-heal any leftover INVALID index from a prior interrupted run,
            # then (re)build concurrently. Both statements are idempotent.
            op.execute(f"DROP INDEX CONCURRENTLY IF EXISTS {index_name}")
            op.execute(
                f"CREATE INDEX CONCURRENTLY IF NOT EXISTS {index_name} "
                f"ON {table} ({column})"
            )


def downgrade() -> None:
    with op.get_context().autocommit_block():
        for index_name, _table, _column in _INDEXES:
            op.execute(f"DROP INDEX CONCURRENTLY IF EXISTS {index_name}")
