"""Add description column to sandbox_sessions

Revision ID: 006_sandbox_description
Revises: 005_sandbox_tables
Create Date: 2026-03-11 00:00:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '006_sandbox_description'
down_revision: Union[str, None] = '005_sandbox_tables'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('sandbox_sessions', sa.Column('description', sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column('sandbox_sessions', 'description')
