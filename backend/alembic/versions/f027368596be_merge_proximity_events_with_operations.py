"""Merge proximity events with operations

Revision ID: f027368596be
Revises: 002, 3acc7f0c9c84
Create Date: 2026-02-13 15:41:07.570358

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f027368596be'
down_revision: Union[str, None] = ('002', '3acc7f0c9c84')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass

