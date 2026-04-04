"""Add BYOK user settings columns

Revision ID: a1b2c3d4e5f6
Revises: add_user_authentication
Create Date: 2026-03-12

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a1b2c3d4e5f6'
down_revision: str = 'add_role_001'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('users', sa.Column('preferred_model', sa.String(255), nullable=True))
    op.add_column('users', sa.Column('encrypted_api_key', sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column('users', 'encrypted_api_key')
    op.drop_column('users', 'preferred_model')
