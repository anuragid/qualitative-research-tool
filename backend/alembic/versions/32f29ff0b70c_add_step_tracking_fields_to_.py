"""Add step tracking fields to VideoAnalysis

Revision ID: 32f29ff0b70c
Revises: 208ec29c043f
Create Date: 2025-11-20 10:55:28.675201

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '32f29ff0b70c'
down_revision: Union[str, None] = '208ec29c043f'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add current_step field to track which step we're on
    op.add_column('video_analyses',
        sa.Column('current_step', sa.String(50), nullable=True, server_default='chunk')
    )

    # Add step_status field to track individual step states
    op.add_column('video_analyses',
        sa.Column('step_status', sa.JSON, nullable=True, server_default='{}')
    )

    # Add timestamps for each step
    op.add_column('video_analyses',
        sa.Column('chunk_completed_at', sa.DateTime(timezone=True), nullable=True)
    )
    op.add_column('video_analyses',
        sa.Column('infer_completed_at', sa.DateTime(timezone=True), nullable=True)
    )
    op.add_column('video_analyses',
        sa.Column('relate_completed_at', sa.DateTime(timezone=True), nullable=True)
    )
    op.add_column('video_analyses',
        sa.Column('explain_completed_at', sa.DateTime(timezone=True), nullable=True)
    )
    op.add_column('video_analyses',
        sa.Column('activate_completed_at', sa.DateTime(timezone=True), nullable=True)
    )


def downgrade() -> None:
    op.drop_column('video_analyses', 'activate_completed_at')
    op.drop_column('video_analyses', 'explain_completed_at')
    op.drop_column('video_analyses', 'relate_completed_at')
    op.drop_column('video_analyses', 'infer_completed_at')
    op.drop_column('video_analyses', 'chunk_completed_at')
    op.drop_column('video_analyses', 'step_status')
    op.drop_column('video_analyses', 'current_step')
