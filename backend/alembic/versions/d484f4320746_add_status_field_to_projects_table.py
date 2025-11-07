"""Add status field to projects table

Revision ID: d484f4320746
Revises: 7990cd686e18
Create Date: 2025-11-06 19:26:54.223707

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd484f4320746'
down_revision: Union[str, None] = '7990cd686e18'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add status column to projects table
    op.add_column('projects', sa.Column('status', sa.String(length=50), nullable=True))

    # Set default value for existing records
    op.execute("UPDATE projects SET status = 'active' WHERE status IS NULL")

    # Make the column non-nullable with a default
    op.alter_column('projects', 'status',
                    nullable=False,
                    server_default='active')


def downgrade() -> None:
    # Remove status column from projects table
    op.drop_column('projects', 'status')
