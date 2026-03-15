"""Add duration_seconds column to sandbox_sessions

Revision ID: 007_sandbox_duration
Revises: 006_sandbox_description
Create Date: 2026-03-15 00:00:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '007_sandbox_duration'
down_revision: Union[str, None] = '006_sandbox_description'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('sandbox_sessions', sa.Column('duration_seconds', sa.Float(), nullable=True))


def downgrade() -> None:
    op.drop_column('sandbox_sessions', 'duration_seconds')
