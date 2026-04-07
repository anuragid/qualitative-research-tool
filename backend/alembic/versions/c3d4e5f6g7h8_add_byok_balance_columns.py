"""Add BYOK balance columns

Adds 7 nullable columns to `users` so we can persist the balance
snapshot returned by OpenRouter's /auth/key + /credits endpoints.

All additive, all nullable -- safe to deploy without backfill. Existing
rows simply have NULL balance until their owner next opens the app
(GET /users/settings forces a refresh) or saves their key (PUT
/users/settings runs balance fetch before encrypting).

Revision ID: c3d4e5f6g7h8
Revises: b2c3d4e5f6g7
Create Date: 2026-04-06

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'c3d4e5f6g7h8'
down_revision: str = 'b2c3d4e5f6g7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('users', sa.Column('key_total_credits', sa.Float(), nullable=True))
    op.add_column('users', sa.Column('key_total_usage', sa.Float(), nullable=True))
    op.add_column('users', sa.Column('key_limit', sa.Float(), nullable=True))
    op.add_column('users', sa.Column('key_limit_remaining', sa.Float(), nullable=True))
    op.add_column('users', sa.Column('key_is_free_tier', sa.Boolean(), nullable=True))
    op.add_column('users', sa.Column('key_balance_checked_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('users', sa.Column('key_balance_error', sa.String(length=255), nullable=True))


def downgrade() -> None:
    op.drop_column('users', 'key_balance_error')
    op.drop_column('users', 'key_balance_checked_at')
    op.drop_column('users', 'key_is_free_tier')
    op.drop_column('users', 'key_limit_remaining')
    op.drop_column('users', 'key_limit')
    op.drop_column('users', 'key_total_usage')
    op.drop_column('users', 'key_total_credits')
