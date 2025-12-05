"""Add role column to users table

Revision ID: add_role_001
Revises: add_user_auth_001
Create Date: 2024-11-25

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

# revision identifiers, used by Alembic.
revision: str = 'add_role_001'
down_revision: Union[str, None] = 'add_user_auth_001'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Check if role column already exists (idempotent migration)
    connection = op.get_bind()
    inspector = inspect(connection)
    existing_columns = [col['name'] for col in inspector.get_columns('users')]

    if 'role' not in existing_columns:
        # Add role column to users table
        op.add_column('users', sa.Column('role', sa.String(length=50), nullable=True))

    # Set default value for existing users
    op.execute("UPDATE users SET role = 'user' WHERE role IS NULL")

    # Make the column non-nullable with a default
    op.alter_column('users', 'role',
                    existing_type=sa.String(length=50),
                    nullable=False,
                    server_default='user')


def downgrade() -> None:
    op.drop_column('users', 'role')
