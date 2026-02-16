"""Add detour tables

Revision ID: b0c1d2e3f4a5
Revises: f027368596be
Create Date: 2026-02-16 00:00:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'b0c1d2e3f4a5'
# The previous revision in the chain
down_revision: Union[str, None] = 'f027368596be'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Detour Satellite State
    op.create_table(
        'detour_satellite_state',
        sa.Column('id', sa.String(50), primary_key=True),
        sa.Column('tenant_id', sa.String(50), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.Column('created_by', sa.String(50), nullable=True),
        sa.Column('updated_by', sa.String(50), nullable=True),
        sa.Column('satellite_id', sa.String(50), sa.ForeignKey('satellites.id'), nullable=False),
        sa.Column('fuel_remaining_kg', sa.Float(), nullable=True),
        sa.Column('delta_v_budget_m_s', sa.Float(), nullable=True),
    )
    op.create_index('ix_detour_sat_state_tenant', 'detour_satellite_state', ['tenant_id'])
    op.create_index('ix_detour_sat_state_satellite', 'detour_satellite_state', ['satellite_id'])

    # Detour Conjunction Analysis
    op.create_table(
        'detour_conjunction_analysis',
        sa.Column('id', sa.String(50), primary_key=True),
        sa.Column('tenant_id', sa.String(50), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.Column('created_by', sa.String(50), nullable=True),
        sa.Column('updated_by', sa.String(50), nullable=True),
        sa.Column('conjunction_event_id', sa.String(50), sa.ForeignKey('conjunction_events.id'), nullable=False),
        sa.Column('collision_probability', sa.Float(), nullable=True),
        sa.Column('risk_level', sa.String(20), nullable=False),
        sa.Column('miss_distance_km', sa.Float(), nullable=False),
        sa.Column('tca', sa.DateTime(), nullable=True),
        sa.Column('analysis_status', sa.String(20), nullable=False, server_default='pending'),
        sa.Column('ai_analysis', postgresql.JSON(), nullable=True),
    )
    op.create_index('ix_detour_conj_analysis_conj', 'detour_conjunction_analysis', ['conjunction_event_id'])
    op.create_index('ix_detour_conj_analysis_risk', 'detour_conjunction_analysis', ['risk_level'])
    op.create_index('ix_detour_conj_analysis_tenant', 'detour_conjunction_analysis', ['tenant_id'])

    # Detour Maneuver Plans
    op.create_table(
        'detour_maneuver_plans',
        sa.Column('id', sa.String(50), primary_key=True),
        sa.Column('tenant_id', sa.String(50), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.Column('created_by', sa.String(50), nullable=True),
        sa.Column('updated_by', sa.String(50), nullable=True),
        sa.Column('conjunction_analysis_id', sa.String(50), sa.ForeignKey('detour_conjunction_analysis.id'), nullable=False),
        sa.Column('maneuver_type', sa.String(50), nullable=False),
        sa.Column('delta_v_m_s', sa.Float(), nullable=True),
        sa.Column('fuel_cost_kg', sa.Float(), nullable=True),
        sa.Column('execution_window', postgresql.JSON(), nullable=True),
        sa.Column('expected_miss_distance_km', sa.Float(), nullable=True),
        sa.Column('risk_reduction_percent', sa.Float(), nullable=True),
        sa.Column('status', sa.String(20), nullable=False, server_default='proposed'),
        sa.Column('ai_recommendation', postgresql.JSON(), nullable=True),
        sa.Column('approved_by', sa.String(50), nullable=True),
        sa.Column('executed_at', sa.DateTime(), nullable=True),
    )
    op.create_index('ix_detour_maneuver_analysis', 'detour_maneuver_plans', ['conjunction_analysis_id'])
    op.create_index('ix_detour_maneuver_status', 'detour_maneuver_plans', ['status'])
    op.create_index('ix_detour_maneuver_tenant', 'detour_maneuver_plans', ['tenant_id'])

    # Detour Agent Sessions
    op.create_table(
        'detour_agent_sessions',
        sa.Column('id', sa.String(50), primary_key=True),
        sa.Column('tenant_id', sa.String(50), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.Column('created_by', sa.String(50), nullable=True),
        sa.Column('updated_by', sa.String(50), nullable=True),
        sa.Column('session_type', sa.String(50), nullable=False),
        sa.Column('status', sa.String(20), nullable=False, server_default='active'),
        sa.Column('input_data', postgresql.JSON(), nullable=True),
        sa.Column('output_data', postgresql.JSON(), nullable=True),
        sa.Column('events', postgresql.JSON(), nullable=True),
        sa.Column('started_at', sa.DateTime(), nullable=True),
        sa.Column('completed_at', sa.DateTime(), nullable=True),
    )
    op.create_index('ix_detour_session_tenant', 'detour_agent_sessions', ['tenant_id'])
    op.create_index('ix_detour_session_type', 'detour_agent_sessions', ['session_type'])
    op.create_index('ix_detour_session_status', 'detour_agent_sessions', ['status'])


def downgrade() -> None:
    op.drop_table('detour_agent_sessions')
    op.drop_table('detour_maneuver_plans')
    op.drop_table('detour_conjunction_analysis')
    op.drop_table('detour_satellite_state')
