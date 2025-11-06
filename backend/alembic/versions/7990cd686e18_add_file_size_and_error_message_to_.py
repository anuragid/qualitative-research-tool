"""add_file_size_and_error_message_to_videos

Revision ID: 7990cd686e18
Revises: 2997b9babe36
Create Date: 2025-11-06 01:07:53.751018

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '7990cd686e18'
down_revision: Union[str, None] = '2997b9babe36'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add missing columns to videos table
    op.add_column('videos', sa.Column('file_size_bytes', sa.Integer(), nullable=True))
    op.add_column('videos', sa.Column('error_message', sa.Text(), nullable=True))


def downgrade() -> None:
    # Remove columns from videos table
    op.drop_column('videos', 'error_message')
    op.drop_column('videos', 'file_size_bytes')
