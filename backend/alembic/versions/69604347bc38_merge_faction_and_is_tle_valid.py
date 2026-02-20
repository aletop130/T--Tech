"""merge faction and is_tle_valid

Revision ID: 69604347bc38
Revises: add_faction_fields, add_is_tle_valid
Create Date: 2026-02-20 04:19:47.279859

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '69604347bc38'
down_revision: Union[str, None] = ('add_faction_fields', 'add_is_tle_valid')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass

