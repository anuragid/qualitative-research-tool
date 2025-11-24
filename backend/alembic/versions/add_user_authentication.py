"""Add user authentication support

Revision ID: add_user_auth_001
Revises: 32f29ff0b70c
Create Date: 2024-11-24

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'add_user_auth_001'
down_revision: Union[str, None] = '32f29ff0b70c'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create users table
    op.create_table('users',
        sa.Column('id', sa.String(length=255), nullable=False),
        sa.Column('email', sa.String(length=255), nullable=False),
        sa.Column('first_name', sa.String(length=255), nullable=True),
        sa.Column('last_name', sa.String(length=255), nullable=True),
        sa.Column('username', sa.String(length=255), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('last_seen', sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('email'),
        sa.UniqueConstraint('username')
    )

    # Add user_id column to projects table (nullable initially for existing data)
    op.add_column('projects', sa.Column('user_id', sa.String(length=255), nullable=True))

    # Create a default user for existing data migration
    # This is a placeholder - in production, you'd map existing projects to actual users
    op.execute("""
        INSERT INTO users (id, email, first_name, last_name, created_at, updated_at)
        VALUES ('migration_default_user', 'migration@example.com', 'Migration', 'User', NOW(), NOW())
        ON CONFLICT (id) DO NOTHING
    """)

    # Update existing projects to have the default user_id
    op.execute("""
        UPDATE projects
        SET user_id = 'migration_default_user'
        WHERE user_id IS NULL
    """)

    # Now make user_id non-nullable
    op.alter_column('projects', 'user_id',
                    existing_type=sa.String(length=255),
                    nullable=False)

    # Create foreign key constraint
    op.create_foreign_key(
        'fk_projects_user_id',
        'projects', 'users',
        ['user_id'], ['id'],
        ondelete='CASCADE'
    )

    # Create index for better query performance
    op.create_index('ix_projects_user_id', 'projects', ['user_id'])
    op.create_index('ix_users_email', 'users', ['email'])


def downgrade() -> None:
    # Drop the foreign key constraint
    op.drop_constraint('fk_projects_user_id', 'projects', type_='foreignkey')

    # Drop the indexes
    op.drop_index('ix_projects_user_id', 'projects')
    op.drop_index('ix_users_email', 'users')

    # Remove user_id column from projects
    op.drop_column('projects', 'user_id')

    # Drop users table
    op.drop_table('users')