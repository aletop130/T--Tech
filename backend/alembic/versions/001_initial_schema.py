"""Initial schema

Revision ID: 001
Revises: 
Create Date: 2024-01-01 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '001'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Tenants
    op.create_table(
        'tenants',
        sa.Column('id', sa.String(50), primary_key=True),
        sa.Column('name', sa.String(100), nullable=False, unique=True),
        sa.Column('display_name', sa.String(200)),
        sa.Column('is_active', sa.Boolean(), default=True),
        sa.Column('settings', postgresql.JSON(), default={}),
        sa.Column('max_users', sa.String(10), default='unlimited'),
        sa.Column('max_satellites_tracked', sa.String(10), default='unlimited'),
        sa.Column('admin_email', sa.String(200)),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
    )
    
    # Users
    op.create_table(
        'users',
        sa.Column('id', sa.String(50), primary_key=True),
        sa.Column('tenant_id', sa.String(50), sa.ForeignKey('tenants.id'), nullable=False),
        sa.Column('email', sa.String(200), nullable=False, unique=True),
        sa.Column('username', sa.String(100), unique=True),
        sa.Column('full_name', sa.String(200)),
        sa.Column('hashed_password', sa.String(200)),
        sa.Column('external_id', sa.String(200)),
        sa.Column('is_active', sa.Boolean(), default=True),
        sa.Column('is_verified', sa.Boolean(), default=False),
        sa.Column('roles', postgresql.JSON(), default=['viewer']),
        sa.Column('preferences', postgresql.JSON(), default={}),
        sa.Column('last_login', sa.DateTime()),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
    )
    op.create_index('ix_users_tenant_id', 'users', ['tenant_id'])
    op.create_index('ix_users_email', 'users', ['email'])
    
    # Satellites
    op.create_table(
        'satellites',
        sa.Column('id', sa.String(50), primary_key=True),
        sa.Column('tenant_id', sa.String(50), nullable=False),
        sa.Column('norad_id', sa.Integer(), nullable=False, unique=True),
        sa.Column('name', sa.String(100), nullable=False),
        sa.Column('international_designator', sa.String(20)),
        sa.Column('object_type', sa.String(20), default='satellite'),
        sa.Column('country', sa.String(50)),
        sa.Column('operator', sa.String(100)),
        sa.Column('is_active', sa.Boolean(), default=True),
        sa.Column('launch_date', sa.DateTime()),
        sa.Column('decay_date', sa.DateTime()),
        sa.Column('mass_kg', sa.Float()),
        sa.Column('rcs_m2', sa.Float()),
        sa.Column('classification', sa.String(50), default='unclassified'),
        sa.Column('tags', postgresql.JSON(), default=[]),
        sa.Column('description', sa.Text()),
        sa.Column('description_embedding', postgresql.ARRAY(sa.Float()), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.Column('created_by', sa.String(50)),
        sa.Column('updated_by', sa.String(50)),
    )
    op.create_index('ix_satellites_tenant_id', 'satellites', ['tenant_id'])
    op.create_index('ix_satellites_norad_id', 'satellites', ['norad_id'])
    op.create_index('ix_satellites_name', 'satellites', ['name'])
    
    # Orbits
    op.create_table(
        'orbits',
        sa.Column('id', sa.String(50), primary_key=True),
        sa.Column('tenant_id', sa.String(50), nullable=False),
        sa.Column('satellite_id', sa.String(50), sa.ForeignKey('satellites.id'), nullable=False),
        sa.Column('epoch', sa.DateTime(), nullable=False),
        sa.Column('semi_major_axis_km', sa.Float()),
        sa.Column('eccentricity', sa.Float()),
        sa.Column('inclination_deg', sa.Float()),
        sa.Column('raan_deg', sa.Float()),
        sa.Column('arg_perigee_deg', sa.Float()),
        sa.Column('mean_anomaly_deg', sa.Float()),
        sa.Column('mean_motion_rev_day', sa.Float()),
        sa.Column('tle_line1', sa.String(80)),
        sa.Column('tle_line2', sa.String(80)),
        sa.Column('bstar', sa.Float()),
        sa.Column('orbit_type', sa.String(20)),
        sa.Column('period_minutes', sa.Float()),
        sa.Column('apogee_km', sa.Float()),
        sa.Column('perigee_km', sa.Float()),
        sa.Column('source', sa.String(50), default='tle'),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.Column('created_by', sa.String(50)),
        sa.Column('updated_by', sa.String(50)),
    )
    op.create_index('ix_orbits_satellite_id', 'orbits', ['satellite_id'])
    op.create_index('ix_orbits_epoch', 'orbits', ['epoch'])
    
    # Ground Stations
    op.create_table(
        'ground_stations',
        sa.Column('id', sa.String(50), primary_key=True),
        sa.Column('tenant_id', sa.String(50), nullable=False),
        sa.Column('name', sa.String(100), nullable=False),
        sa.Column('code', sa.String(10), unique=True),
        sa.Column('latitude', sa.Float(), nullable=False),
        sa.Column('longitude', sa.Float(), nullable=False),
        sa.Column('altitude_m', sa.Float(), default=0),
        sa.Column('antenna_count', sa.Integer(), default=1),
        sa.Column('frequency_bands', postgresql.JSON(), default=[]),
        sa.Column('is_operational', sa.Boolean(), default=True),
        sa.Column('status_message', sa.String(200)),
        sa.Column('organization', sa.String(100)),
        sa.Column('country', sa.String(50)),
        sa.Column('description', sa.Text()),
        sa.Column('description_embedding', postgresql.ARRAY(sa.Float()), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.Column('created_by', sa.String(50)),
        sa.Column('updated_by', sa.String(50)),
    )
    op.create_index('ix_ground_stations_tenant_id', 'ground_stations', ['tenant_id'])
    
    # Sensors
    op.create_table(
        'sensors',
        sa.Column('id', sa.String(50), primary_key=True),
        sa.Column('tenant_id', sa.String(50), nullable=False),
        sa.Column('name', sa.String(100), nullable=False),
        sa.Column('sensor_type', sa.String(20), nullable=False),
        sa.Column('latitude', sa.Float()),
        sa.Column('longitude', sa.Float()),
        sa.Column('altitude_m', sa.Float()),
        sa.Column('min_elevation_deg', sa.Float(), default=10.0),
        sa.Column('max_range_km', sa.Float()),
        sa.Column('accuracy_m', sa.Float()),
        sa.Column('fov_deg', sa.Float()),
        sa.Column('is_operational', sa.Boolean(), default=True),
        sa.Column('organization', sa.String(100)),
        sa.Column('country', sa.String(50)),
        sa.Column('ground_station_id', sa.String(50), sa.ForeignKey('ground_stations.id')),
        sa.Column('description', sa.Text()),
        sa.Column('description_embedding', postgresql.ARRAY(sa.Float()), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.Column('created_by', sa.String(50)),
        sa.Column('updated_by', sa.String(50)),
    )
    op.create_index('ix_sensors_tenant_id', 'sensors', ['tenant_id'])
    
    # RF Links
    op.create_table(
        'rf_links',
        sa.Column('id', sa.String(50), primary_key=True),
        sa.Column('tenant_id', sa.String(50), nullable=False),
        sa.Column('name', sa.String(100), nullable=False),
        sa.Column('ground_station_id', sa.String(50), sa.ForeignKey('ground_stations.id'), nullable=False),
        sa.Column('satellite_id', sa.String(50), sa.ForeignKey('satellites.id')),
        sa.Column('frequency_mhz', sa.Float()),
        sa.Column('bandwidth_khz', sa.Float()),
        sa.Column('polarization', sa.String(20)),
        sa.Column('status', sa.String(20), default='active'),
        sa.Column('signal_strength_dbm', sa.Float()),
        sa.Column('bit_error_rate', sa.Float()),
        sa.Column('next_pass_start', sa.DateTime()),
        sa.Column('next_pass_end', sa.DateTime()),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.Column('created_by', sa.String(50)),
        sa.Column('updated_by', sa.String(50)),
    )
    
    # Space Weather Events
    op.create_table(
        'space_weather_events',
        sa.Column('id', sa.String(50), primary_key=True),
        sa.Column('tenant_id', sa.String(50), nullable=False),
        sa.Column('event_type', sa.String(50), nullable=False),
        sa.Column('start_time', sa.DateTime(), nullable=False),
        sa.Column('peak_time', sa.DateTime()),
        sa.Column('end_time', sa.DateTime()),
        sa.Column('severity', sa.String(20), nullable=False),
        sa.Column('kp_index', sa.Float()),
        sa.Column('dst_index', sa.Float()),
        sa.Column('solar_wind_speed', sa.Float()),
        sa.Column('proton_flux', sa.Float()),
        sa.Column('gnss_impact_score', sa.Float(), default=0),
        sa.Column('rf_impact_score', sa.Float(), default=0),
        sa.Column('drag_impact_score', sa.Float(), default=0),
        sa.Column('radiation_impact_score', sa.Float(), default=0),
        sa.Column('source', sa.String(100)),
        sa.Column('source_event_id', sa.String(50)),
        sa.Column('description', sa.Text()),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.Column('created_by', sa.String(50)),
        sa.Column('updated_by', sa.String(50)),
    )
    op.create_index('ix_space_weather_tenant_id', 'space_weather_events', ['tenant_id'])
    op.create_index('ix_space_weather_start_time', 'space_weather_events', ['start_time'])
    
    # Conjunction Events
    op.create_table(
        'conjunction_events',
        sa.Column('id', sa.String(50), primary_key=True),
        sa.Column('tenant_id', sa.String(50), nullable=False),
        sa.Column('primary_object_id', sa.String(50), sa.ForeignKey('satellites.id'), nullable=False),
        sa.Column('secondary_object_id', sa.String(50), sa.ForeignKey('satellites.id'), nullable=False),
        sa.Column('tca', sa.DateTime(), nullable=False),
        sa.Column('miss_distance_km', sa.Float(), nullable=False),
        sa.Column('miss_distance_radial_km', sa.Float()),
        sa.Column('miss_distance_intrack_km', sa.Float()),
        sa.Column('miss_distance_crosstrack_km', sa.Float()),
        sa.Column('collision_probability', sa.Float()),
        sa.Column('risk_level', sa.String(20), nullable=False),
        sa.Column('risk_score', sa.Float()),
        sa.Column('analysis_run_id', sa.String(50)),
        sa.Column('screening_volume_km', sa.Float(), default=10.0),
        sa.Column('is_actionable', sa.Boolean(), default=False),
        sa.Column('maneuver_planned', sa.Boolean(), default=False),
        sa.Column('ai_analysis', postgresql.JSON()),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.Column('created_by', sa.String(50)),
        sa.Column('updated_by', sa.String(50)),
    )
    op.create_index('ix_conjunction_tenant_id', 'conjunction_events', ['tenant_id'])
    op.create_index('ix_conjunction_tca', 'conjunction_events', ['tca'])
    
    # Object Relations
    op.create_table(
        'object_relations',
        sa.Column('id', sa.String(50), primary_key=True),
        sa.Column('tenant_id', sa.String(50), nullable=False),
        sa.Column('source_type', sa.String(50), nullable=False),
        sa.Column('source_id', sa.String(50), nullable=False),
        sa.Column('relation_type', sa.String(50), nullable=False),
        sa.Column('target_type', sa.String(50), nullable=False),
        sa.Column('target_id', sa.String(50), nullable=False),
        sa.Column('properties', postgresql.JSON(), default={}),
        sa.Column('valid_from', sa.DateTime()),
        sa.Column('valid_to', sa.DateTime()),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.Column('created_by', sa.String(50)),
        sa.Column('updated_by', sa.String(50)),
    )
    op.create_index('ix_relations_source', 'object_relations', ['source_type', 'source_id'])
    op.create_index('ix_relations_target', 'object_relations', ['target_type', 'target_id'])
    
    # Incidents
    op.create_table(
        'incidents',
        sa.Column('id', sa.String(50), primary_key=True),
        sa.Column('tenant_id', sa.String(50), nullable=False),
        sa.Column('title', sa.String(200), nullable=False),
        sa.Column('description', sa.Text()),
        sa.Column('incident_type', postgresql.ENUM('CONJUNCTION', 'SPACE_WEATHER', 'RF_INTERFERENCE', 'ANOMALY', 'CYBER', 'PHYSICAL', 'PROXIMITY', 'HOSTILE_APPROACH', 'OTHER', name='incidenttype'), nullable=False),
        sa.Column('severity', postgresql.ENUM('INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL', name='incidentseverity'), default='MEDIUM'),
        sa.Column('status', postgresql.ENUM('OPEN', 'INVESTIGATING', 'MITIGATING', 'RESOLVED', 'CLOSED', name='incidentstatus'), default='OPEN'),
        sa.Column('detected_at', sa.DateTime()),
        sa.Column('acknowledged_at', sa.DateTime()),
        sa.Column('resolved_at', sa.DateTime()),
        sa.Column('assigned_to', sa.String(50)),
        sa.Column('assigned_team', sa.String(100)),
        sa.Column('affected_assets', postgresql.JSON(), default=[]),
        sa.Column('source_event_type', sa.String(50)),
        sa.Column('source_event_id', sa.String(50)),
        sa.Column('root_cause', sa.Text()),
        sa.Column('impact_assessment', sa.Text()),
        sa.Column('mitigation_actions', postgresql.JSON(), default=[]),
        sa.Column('lessons_learned', sa.Text()),
        sa.Column('ai_analysis', postgresql.JSON()),
        sa.Column('ai_recommended_actions', postgresql.JSON()),
        sa.Column('priority', sa.Integer(), default=50),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.Column('created_by', sa.String(50)),
        sa.Column('updated_by', sa.String(50)),
    )
    op.create_index('ix_incidents_tenant_id', 'incidents', ['tenant_id'])
    op.create_index('ix_incidents_status', 'incidents', ['status'])
    
    # Incident Comments
    op.create_table(
        'incident_comments',
        sa.Column('id', sa.String(50), primary_key=True),
        sa.Column('tenant_id', sa.String(50), nullable=False),
        sa.Column('incident_id', sa.String(50), sa.ForeignKey('incidents.id'), nullable=False),
        sa.Column('content', sa.Text(), nullable=False),
        sa.Column('comment_type', sa.String(50), default='note'),
        sa.Column('action_type', sa.String(50)),
        sa.Column('action_data', postgresql.JSON()),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.Column('created_by', sa.String(50)),
        sa.Column('updated_by', sa.String(50)),
    )
    op.create_index('ix_incident_comments_incident_id', 'incident_comments', ['incident_id'])
    
    # Ingestion Runs
    op.create_table(
        'ingestion_runs',
        sa.Column('id', sa.String(50), primary_key=True),
        sa.Column('tenant_id', sa.String(50), nullable=False),
        sa.Column('source_type', sa.String(50), nullable=False),
        sa.Column('source_name', sa.String(200), nullable=False),
        sa.Column('source_path', sa.String(500)),
        sa.Column('status', sa.String(20), default='pending'),
        sa.Column('error_message', sa.Text()),
        sa.Column('started_at', sa.DateTime()),
        sa.Column('completed_at', sa.DateTime()),
        sa.Column('records_total', sa.Integer(), default=0),
        sa.Column('records_processed', sa.Integer(), default=0),
        sa.Column('records_failed', sa.Integer(), default=0),
        sa.Column('records_skipped', sa.Integer(), default=0),
        sa.Column('parent_run_id', sa.String(50)),
        sa.Column('pipeline_name', sa.String(100)),
        sa.Column('pipeline_version', sa.String(20)),
        sa.Column('processing_config', postgresql.JSON(), default={}),
        sa.Column('output_tables', postgresql.JSON(), default=[]),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.Column('created_by', sa.String(50)),
        sa.Column('updated_by', sa.String(50)),
    )
    op.create_index('ix_ingestion_runs_tenant_id', 'ingestion_runs', ['tenant_id'])
    
    # Data Quality Checks
    op.create_table(
        'data_quality_checks',
        sa.Column('id', sa.String(50), primary_key=True),
        sa.Column('tenant_id', sa.String(50), nullable=False),
        sa.Column('ingestion_run_id', sa.String(50), sa.ForeignKey('ingestion_runs.id'), nullable=False),
        sa.Column('check_type', sa.String(50), nullable=False),
        sa.Column('check_name', sa.String(100), nullable=False),
        sa.Column('check_description', sa.String(500)),
        sa.Column('target_table', sa.String(100)),
        sa.Column('target_column', sa.String(100)),
        sa.Column('status', sa.String(20), nullable=False),
        sa.Column('records_checked', sa.Integer(), default=0),
        sa.Column('records_passed', sa.Integer(), default=0),
        sa.Column('records_failed', sa.Integer(), default=0),
        sa.Column('pass_rate', sa.Float(), default=0.0),
        sa.Column('failure_samples', postgresql.JSON(), default=[]),
        sa.Column('check_parameters', postgresql.JSON(), default={}),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.Column('created_by', sa.String(50)),
        sa.Column('updated_by', sa.String(50)),
    )
    
    # Audit Events
    op.create_table(
        'audit_events',
        sa.Column('id', sa.String(50), primary_key=True),
        sa.Column('timestamp', sa.DateTime(), nullable=False),
        sa.Column('user_id', sa.String(50)),
        sa.Column('tenant_id', sa.String(50), nullable=False),
        sa.Column('action', sa.String(50), nullable=False),
        sa.Column('entity_type', sa.String(100), nullable=False),
        sa.Column('entity_id', sa.String(50), nullable=False),
        sa.Column('before', postgresql.JSON()),
        sa.Column('after', postgresql.JSON()),
        sa.Column('changed_fields', postgresql.JSON()),
        sa.Column('ip_address', sa.String(50)),
        sa.Column('user_agent', sa.String(500)),
        sa.Column('request_id', sa.String(50)),
        sa.Column('extra_data', postgresql.JSON(), default={}),
    )
    op.create_index('ix_audit_events_timestamp', 'audit_events', ['timestamp'])
    op.create_index('ix_audit_events_tenant_id', 'audit_events', ['tenant_id'])
    op.create_index('ix_audit_events_entity', 'audit_events', ['entity_type', 'entity_id'])
    
    # Insert default tenant
    op.execute("""
        INSERT INTO tenants (id, name, display_name, is_active, settings, created_at, updated_at)
        VALUES ('default', 'default', 'Default Tenant', true, '{}', NOW(), NOW())
    """)


def downgrade() -> None:
    op.drop_table('audit_events')
    op.drop_table('data_quality_checks')
    op.drop_table('ingestion_runs')
    op.drop_table('incident_comments')
    op.drop_table('incidents')
    op.drop_table('object_relations')
    op.drop_table('conjunction_events')
    op.drop_table('space_weather_events')
    op.drop_table('rf_links')
    
    # Drop enum types
    postgresql.ENUM(name='incidentstatus').drop(op.get_bind())
    postgresql.ENUM(name='incidentseverity').drop(op.get_bind())
    postgresql.ENUM(name='incidenttype').drop(op.get_bind())
    op.drop_table('sensors')
    op.drop_table('ground_stations')
    op.drop_table('orbits')
    op.drop_table('satellites')
    op.drop_table('users')
    op.drop_table('tenants')

