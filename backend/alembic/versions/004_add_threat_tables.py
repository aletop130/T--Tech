"""Add threat detection, fleet risk, adversary, comms tables

Revision ID: 004_threat_tables
Revises: 69604347bc38
Create Date: 2026-02-25 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '004_threat_tables'
down_revision: Union[str, None] = '69604347bc38'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# Helper columns that all AuditMixin tables share
def _audit_columns():
    return [
        sa.Column('tenant_id', sa.String(50), nullable=False, index=True),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column('created_by', sa.String(50), nullable=True),
        sa.Column('updated_by', sa.String(50), nullable=True),
    ]


def upgrade() -> None:
    # 1. threat_events - base polymorphic threat table
    op.create_table(
        'threat_events',
        sa.Column('id', sa.String(50), primary_key=True),
        sa.Column('threat_type', sa.String(30), nullable=False, index=True),
        sa.Column('severity', sa.String(20), nullable=False, server_default='nominal'),
        sa.Column('confidence', sa.Float(), nullable=False, server_default='0'),
        sa.Column('detected_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column('primary_satellite_id', sa.String(50), sa.ForeignKey('satellites.id'), nullable=True),
        sa.Column('secondary_satellite_id', sa.String(50), sa.ForeignKey('satellites.id'), nullable=True),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('position_data', sa.JSON(), nullable=True),
        sa.Column('extra_data', sa.JSON(), nullable=True),
        *_audit_columns(),
    )

    # 2. signal_threats
    op.create_table(
        'signal_threats',
        sa.Column('id', sa.String(50), primary_key=True),
        sa.Column('interceptor_satellite_id', sa.String(50), sa.ForeignKey('satellites.id'), nullable=True),
        sa.Column('target_link_asset_id', sa.String(50), sa.ForeignKey('satellites.id'), nullable=True),
        sa.Column('ground_station_name', sa.String(200), nullable=True),
        sa.Column('severity', sa.String(20), nullable=False, server_default='nominal'),
        sa.Column('interception_probability', sa.Float(), server_default='0'),
        sa.Column('signal_path_angle_deg', sa.Float(), server_default='0'),
        sa.Column('comm_windows_at_risk', sa.Integer(), server_default='0'),
        sa.Column('total_comm_windows', sa.Integer(), server_default='0'),
        sa.Column('confidence', sa.Float(), server_default='0'),
        sa.Column('position_data', sa.JSON(), nullable=True),
        *_audit_columns(),
    )

    # 3. anomaly_threats
    op.create_table(
        'anomaly_threats',
        sa.Column('id', sa.String(50), primary_key=True),
        sa.Column('satellite_id', sa.String(50), sa.ForeignKey('satellites.id'), nullable=True),
        sa.Column('severity', sa.String(20), nullable=False, server_default='nominal'),
        sa.Column('anomaly_type', sa.String(50), nullable=False),
        sa.Column('baseline_deviation', sa.Float(), server_default='0'),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('confidence', sa.Float(), server_default='0'),
        sa.Column('position_data', sa.JSON(), nullable=True),
        *_audit_columns(),
    )

    # 4. orbital_similarity_threats
    op.create_table(
        'orbital_similarity_threats',
        sa.Column('id', sa.String(50), primary_key=True),
        sa.Column('foreign_satellite_id', sa.String(50), sa.ForeignKey('satellites.id'), nullable=True),
        sa.Column('target_satellite_id', sa.String(50), sa.ForeignKey('satellites.id'), nullable=True),
        sa.Column('severity', sa.String(20), nullable=False, server_default='nominal'),
        sa.Column('inclination_diff_deg', sa.Float(), server_default='0'),
        sa.Column('altitude_diff_km', sa.Float(), server_default='0'),
        sa.Column('divergence_score', sa.Float(), server_default='0'),
        sa.Column('pattern', sa.String(30), nullable=True),
        sa.Column('confidence', sa.Float(), server_default='0'),
        sa.Column('position_data', sa.JSON(), nullable=True),
        *_audit_columns(),
    )

    # 5. geo_loiter_threats
    op.create_table(
        'geo_loiter_threats',
        sa.Column('id', sa.String(50), primary_key=True),
        sa.Column('satellite_id', sa.String(50), sa.ForeignKey('satellites.id'), nullable=True),
        sa.Column('severity', sa.String(20), nullable=False, server_default='nominal'),
        sa.Column('orbit_type', sa.String(30), nullable=True),
        sa.Column('subsatellite_lon_deg', sa.Float(), server_default='0'),
        sa.Column('subsatellite_lat_deg', sa.Float(), server_default='0'),
        sa.Column('altitude_km', sa.Float(), server_default='0'),
        sa.Column('dwell_fraction_over_us', sa.Float(), server_default='0'),
        sa.Column('threat_score', sa.Float(), server_default='0'),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('country_code', sa.String(10), nullable=True),
        *_audit_columns(),
    )

    # 6. threat_responses
    op.create_table(
        'threat_responses',
        sa.Column('id', sa.String(50), primary_key=True),
        sa.Column('threat_event_id', sa.String(50), sa.ForeignKey('threat_events.id'), nullable=True),
        sa.Column('satellite_id', sa.String(50), nullable=True),
        sa.Column('satellite_name', sa.String(200), nullable=True),
        sa.Column('threat_satellite_id', sa.String(50), nullable=True),
        sa.Column('threat_satellite_name', sa.String(200), nullable=True),
        sa.Column('threat_summary', sa.Text(), nullable=True),
        sa.Column('threat_score', sa.Float(), server_default='0'),
        sa.Column('risk_level', sa.String(20), nullable=True),
        sa.Column('recommended_action', sa.String(200), nullable=True),
        sa.Column('reasoning', sa.Text(), nullable=True),
        sa.Column('escalation_required', sa.Integer(), server_default='0'),
        sa.Column('time_sensitivity', sa.String(20), nullable=True),
        sa.Column('intelligence_summary', sa.Text(), nullable=True),
        sa.Column('options_data', sa.JSON(), nullable=True),
        *_audit_columns(),
    )

    # 7. fleet_risk_snapshots
    op.create_table(
        'fleet_risk_snapshots',
        sa.Column('id', sa.String(50), primary_key=True),
        sa.Column('satellite_id', sa.String(50), sa.ForeignKey('satellites.id'), nullable=True),
        sa.Column('risk_score', sa.Float(), server_default='0'),
        sa.Column('snapshot_time', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column('risk_components', sa.JSON(), nullable=True),
        *_audit_columns(),
    )

    # 8. threat_config
    op.create_table(
        'threat_config',
        sa.Column('id', sa.String(50), primary_key=True),
        sa.Column('config_key', sa.String(100), nullable=False, unique=True, index=True),
        sa.Column('config_value', sa.Float(), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        *_audit_columns(),
    )

    # 9. comms_transcriptions
    op.create_table(
        'comms_transcriptions',
        sa.Column('id', sa.String(50), primary_key=True),
        sa.Column('human_input', sa.Text(), nullable=False),
        sa.Column('target_satellite_id', sa.String(50), nullable=True),
        sa.Column('target_satellite_name', sa.String(200), nullable=True),
        sa.Column('command_type', sa.String(50), nullable=True),
        sa.Column('status', sa.String(20), server_default='complete'),
        sa.Column('transcription_data', sa.JSON(), nullable=True),
        *_audit_columns(),
    )

    # 10. Add bayesian_posterior to proximity_events
    op.add_column('proximity_events',
        sa.Column('bayesian_posterior', sa.Float(), nullable=True)
    )


def downgrade() -> None:
    op.drop_column('proximity_events', 'bayesian_posterior')
    op.drop_table('comms_transcriptions')
    op.drop_table('threat_config')
    op.drop_table('fleet_risk_snapshots')
    op.drop_table('threat_responses')
    op.drop_table('geo_loiter_threats')
    op.drop_table('orbital_similarity_threats')
    op.drop_table('anomaly_threats')
    op.drop_table('signal_threats')
    op.drop_table('threat_events')
