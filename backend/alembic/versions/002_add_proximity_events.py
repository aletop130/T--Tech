"""Add proximity events table

Revision ID: 002
Revises: 001
Create Date: 2024-02-13 16:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '002'
down_revision: Union[str, None] = '001'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Proximity Events
    op.create_table(
        'proximity_events',
        sa.Column('id', sa.String(50), primary_key=True),
        sa.Column('tenant_id', sa.String(50), nullable=False),
        sa.Column('primary_satellite_id', sa.String(50), sa.ForeignKey('satellites.id'), nullable=False),
        sa.Column('secondary_satellite_id', sa.String(50), sa.ForeignKey('satellites.id'), nullable=False),
        sa.Column('start_time', sa.DateTime(), nullable=False),
        sa.Column('end_time', sa.DateTime(), nullable=True),
        sa.Column('last_updated', sa.DateTime(), nullable=True),
        sa.Column('min_distance_km', sa.Float(), nullable=False),
        sa.Column('current_distance_km', sa.Float(), nullable=True),
        sa.Column('approach_velocity_kms', sa.Float(), nullable=True),
        sa.Column('tca', sa.DateTime(), nullable=True),
        sa.Column('predicted_tca', sa.DateTime(), nullable=True),
        sa.Column('alert_level', sa.String(20), default='info'),
        sa.Column('status', sa.String(20), default='active'),
        sa.Column('is_hostile', sa.Boolean(), default=False),
        sa.Column('threat_score', sa.Float(), nullable=True),
        sa.Column('threat_assessment', sa.Text(), nullable=True),
        sa.Column('warning_threshold_km', sa.Float(), default=10.0),
        sa.Column('critical_threshold_km', sa.Float(), default=1.0),
        sa.Column('primary_position', postgresql.JSON(), nullable=True),
        sa.Column('secondary_position', postgresql.JSON(), nullable=True),
        sa.Column('relative_velocity', postgresql.JSON(), nullable=True),
        sa.Column('incident_id', sa.String(50), sa.ForeignKey('incidents.id'), nullable=True),
        sa.Column('scenario_id', sa.String(50), nullable=True),
        sa.Column('is_simulated', sa.Boolean(), default=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.Column('created_by', sa.String(50)),
        sa.Column('updated_by', sa.String(50)),
    )
    op.create_index('ix_proximity_events_tenant_id', 'proximity_events', ['tenant_id'])
    op.create_index('ix_proximity_events_primary_satellite', 'proximity_events', ['primary_satellite_id'])
    op.create_index('ix_proximity_events_secondary_satellite', 'proximity_events', ['secondary_satellite_id'])
    op.create_index('ix_proximity_events_start_time', 'proximity_events', ['start_time'])
    op.create_index('ix_proximity_events_alert_level', 'proximity_events', ['alert_level'])
    op.create_index('ix_proximity_events_status', 'proximity_events', ['status'])
    op.create_index('ix_proximity_events_scenario', 'proximity_events', ['scenario_id'])


def downgrade() -> None:
    op.drop_table('proximity_events')
