"""Add error_message column to project_analyses table.

Revision ID: c1a2b3d4e5f6
Revises: b8c4d2e3f5a6
Create Date: 2026-06-12

Transactional migration — instant ALTER (nullable column addition,
no rewrite). Downgrade simply drops the column.
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'c1a2b3d4e5f6'
down_revision = 'b8c4d2e3f5a6'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        'project_analyses',
        sa.Column('error_message', sa.Text(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column('project_analyses', 'error_message')
