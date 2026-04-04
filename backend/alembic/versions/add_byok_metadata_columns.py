"""Add BYOK metadata columns (key_hint, key_validated_at)

Revision ID: 27125efcfd8f
Revises: ddba140526fc
Create Date: 2026-03-15

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '27125efcfd8f'
down_revision: str = 'ddba140526fc'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('users', sa.Column('key_hint', sa.String(8), nullable=True))
    op.add_column('users', sa.Column('key_validated_at', sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column('users', 'key_validated_at')
    op.drop_column('users', 'key_hint')
