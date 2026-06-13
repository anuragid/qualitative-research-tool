"""Reconcile video_analyses.step_status type: JSON -> JSONB.

Revision ID: a7b3c9d1e2f4
Revises: f5a6b7c8d9e0
Create Date: 2026-06-12

Migration ``32f29ff0b70c`` created ``video_analyses.step_status`` as ``JSON``,
but ``app.models.database_models.VideoAnalysis.step_status`` declares ``JSONB``.
JSONB is the intended type (binary, deduplicated keys, indexable). This is a
lossless cast.

TRANSACTIONAL: this migration runs inside alembic's default transaction (see
``alembic/env.py`` -> ``run_migrations_online`` wraps ``run_migrations`` in
``context.begin_transaction()``). The ``ALTER COLUMN ... TYPE`` rewrites the
table, so it must NOT be mixed with the ``CREATE INDEX CONCURRENTLY`` work —
that is split into the following revision ``b8c4d2e3f5a6`` which runs in an
``autocommit_block``.

Production lock / size note: ``video_analyses`` holds at most one row per
analysed video (one-to-one with ``videos`` via a unique ``video_id`` usage in
the app layer). The table is tiny, so the ``ACCESS EXCLUSIVE`` lock taken by
``ALTER COLUMN ... TYPE`` is held for a negligible duration. No concurrent
writers are expected during a deploy migration window.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "a7b3c9d1e2f4"
down_revision: Union[str, None] = "f5a6b7c8d9e0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # JSON -> JSONB. ``USING step_status::jsonb`` is an explicit, lossless cast.
    op.alter_column(
        "video_analyses",
        "step_status",
        existing_type=postgresql.JSON(astext_type=sa.Text()),
        type_=postgresql.JSONB(astext_type=sa.Text()),
        existing_nullable=True,
        existing_server_default=sa.text("'{}'::json"),
        postgresql_using="step_status::jsonb",
    )


def downgrade() -> None:
    # JSONB -> JSON. ``USING step_status::json`` is the reverse lossless cast.
    op.alter_column(
        "video_analyses",
        "step_status",
        existing_type=postgresql.JSONB(astext_type=sa.Text()),
        type_=postgresql.JSON(astext_type=sa.Text()),
        existing_nullable=True,
        existing_server_default=sa.text("'{}'::json"),
        postgresql_using="step_status::json",
    )
