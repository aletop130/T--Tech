"""add is_tle_valid to orbits

Revision ID: add_is_tle_valid
Revises: 8f8ee6ebf4ef
Create Date: 2026-02-18 14:45:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'add_is_tle_valid'
down_revision: Union[str, None] = '8f8ee6ebf4ef'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('orbits', sa.Column('is_tle_valid', sa.Boolean(), nullable=True))


def downgrade() -> None:
    op.drop_column('orbits', 'is_tle_valid')
