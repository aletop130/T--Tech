"""add faction to satellites and ground_stations

Revision ID: add_faction_fields
Revises: 8f8ee6ebf4ef
Create Date: 2025-01-20 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'add_faction_fields'
down_revision: Union[str, None] = '8f8ee6ebf4ef'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add faction column to satellites table
    op.add_column('satellites', sa.Column('faction', sa.String(20), nullable=True))
    
    # Add faction column to ground_stations table
    op.add_column('ground_stations', sa.Column('faction', sa.String(20), nullable=True))


def downgrade() -> None:
    # Remove faction column from ground_stations table
    op.drop_column('ground_stations', 'faction')
    
    # Remove faction column from satellites table
    op.drop_column('satellites', 'faction')
