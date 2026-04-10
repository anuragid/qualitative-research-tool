"""Add model_tier column to users table.

Revision ID: f5a6b7c8d9e0
Revises: e4f5a6b7c8d9
Create Date: 2026-04-08

Adds a ``model_tier`` column (VARCHAR(10), NOT NULL, DEFAULT 'included')
to the ``users`` table. This switches LLM routing from key-based to
tier-based: users explicitly choose "included" (server key) or "byok"
(their own OpenRouter key).

Data migration:
- Users who have a BYOK key AND whose preferred_model is NOT one of the
  three standard models get ``model_tier = 'byok'``.
- Everyone else keeps the default ``model_tier = 'included'``.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "f5a6b7c8d9e0"
down_revision: Union[str, None] = "e4f5a6b7c8d9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Standard models that are paid by the Methodex shared key
_STANDARD_MODEL_IDS = (
    "meta-llama/llama-4-scout",
    "nvidia/nemotron-3-super-120b-a12b",
    "deepseek/deepseek-chat-v3-0324",
)


def upgrade() -> None:
    # 1. Add the column with the default value
    op.add_column(
        "users",
        sa.Column(
            "model_tier",
            sa.String(10),
            nullable=False,
            server_default="included",
        ),
    )

    # 2. Data migration: set model_tier='byok' for users who have a key
    #    AND a non-standard preferred_model
    users = sa.table(
        "users",
        sa.column("encrypted_api_key", sa.Text),
        sa.column("preferred_model", sa.String),
        sa.column("model_tier", sa.String),
    )
    op.execute(
        users.update()
        .where(users.c.encrypted_api_key.isnot(None))
        .where(users.c.preferred_model.notin_(_STANDARD_MODEL_IDS))
        .values(model_tier="byok")
    )


def downgrade() -> None:
    op.drop_column("users", "model_tier")
