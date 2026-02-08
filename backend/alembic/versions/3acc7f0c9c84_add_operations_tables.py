"""Add operations tables

Revision ID: 3acc7f0c9c84
Revises: 001
Create Date: 2026-02-08 11:12:52.680072

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '3acc7f0c9c84'
down_revision: Union[str, None] = '001'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create formations table first (no FK dependencies)
    op.create_table(
        'formations',
        sa.Column('id', sa.VARCHAR(length=50), nullable=False),
        sa.Column('tenant_id', sa.VARCHAR(length=50), nullable=False),
        sa.Column('name', sa.VARCHAR(length=100), nullable=False),
        sa.Column('formation_type', sa.VARCHAR(length=30), nullable=False),
        sa.Column('description', sa.TEXT(), nullable=True),
        sa.Column('leader_entity_id', sa.VARCHAR(length=50), nullable=True),
        sa.Column('spacing_meters', sa.DOUBLE_PRECISION(precision=53), nullable=True),
        sa.Column('altitude_separation_m', sa.DOUBLE_PRECISION(precision=53), nullable=True),
        sa.Column('time_offset_sec', sa.DOUBLE_PRECISION(precision=53), nullable=True),
        sa.Column('is_active', sa.BOOLEAN(), nullable=True),
        sa.Column('activation_time', postgresql.TIMESTAMP(), nullable=True),
        sa.Column('deactivation_time', postgresql.TIMESTAMP(), nullable=True),
        sa.Column('formation_data', postgresql.JSON(astext_type=sa.Text()), nullable=True),
        sa.Column('slot_assignments', postgresql.JSON(astext_type=sa.Text()), nullable=True),
        sa.Column('created_at', postgresql.TIMESTAMP(), nullable=False),
        sa.Column('updated_at', postgresql.TIMESTAMP(), nullable=False),
        sa.Column('created_by', sa.VARCHAR(length=50), nullable=True),
        sa.Column('updated_by', sa.VARCHAR(length=50), nullable=True),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_formations_active', 'formations', ['is_active'])

    # Create route_plans table (no FK dependencies)
    op.create_table(
        'route_plans',
        sa.Column('id', sa.VARCHAR(length=50), nullable=False),
        sa.Column('tenant_id', sa.VARCHAR(length=50), nullable=False),
        sa.Column('entity_id', sa.VARCHAR(length=50), nullable=False),
        sa.Column('entity_type', sa.VARCHAR(length=30), nullable=False),
        sa.Column('name', sa.VARCHAR(length=100), nullable=False),
        sa.Column('description', sa.TEXT(), nullable=True),
        sa.Column('mission_type', sa.VARCHAR(length=50), nullable=False),
        sa.Column('start_time', postgresql.TIMESTAMP(), nullable=False),
        sa.Column('end_time', postgresql.TIMESTAMP(), nullable=True),
        sa.Column('actual_start_time', postgresql.TIMESTAMP(), nullable=True),
        sa.Column('actual_end_time', postgresql.TIMESTAMP(), nullable=True),
        sa.Column('status', sa.VARCHAR(length=20), nullable=True),
        sa.Column('planned_by', sa.VARCHAR(length=100), nullable=True),
        sa.Column('approval_status', sa.VARCHAR(length=20), nullable=True),
        sa.Column('approved_by', sa.VARCHAR(length=100), nullable=True),
        sa.Column('approved_at', postgresql.TIMESTAMP(), nullable=True),
        sa.Column('origin_lat', sa.DOUBLE_PRECISION(precision=53), nullable=True),
        sa.Column('origin_lon', sa.DOUBLE_PRECISION(precision=53), nullable=True),
        sa.Column('origin_alt_km', sa.DOUBLE_PRECISION(precision=53), nullable=True),
        sa.Column('destination_lat', sa.DOUBLE_PRECISION(precision=53), nullable=True),
        sa.Column('destination_lon', sa.DOUBLE_PRECISION(precision=53), nullable=True),
        sa.Column('destination_alt_km', sa.DOUBLE_PRECISION(precision=53), nullable=True),
        sa.Column('priority', sa.INTEGER(), nullable=True),
        sa.Column('is_recurring', sa.BOOLEAN(), nullable=True),
        sa.Column('recurrence_pattern', postgresql.JSON(astext_type=sa.Text()), nullable=True),
        sa.Column('trajectory_data', postgresql.JSON(astext_type=sa.Text()), nullable=True),
        sa.Column('constraints', postgresql.JSON(astext_type=sa.Text()), nullable=True),
        sa.Column('objectives', postgresql.JSON(astext_type=sa.Text()), nullable=True),
        sa.Column('operation_id', sa.VARCHAR(length=50), nullable=True),
        sa.Column('created_at', postgresql.TIMESTAMP(), nullable=False),
        sa.Column('updated_at', postgresql.TIMESTAMP(), nullable=False),
        sa.Column('created_by', sa.VARCHAR(length=50), nullable=True),
        sa.Column('updated_by', sa.VARCHAR(length=50), nullable=True),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_routes_entity_time', 'route_plans', ['entity_id', 'start_time'])
    op.create_index('ix_routes_status_time', 'route_plans', ['status', 'start_time'])

    # Create operations table (FK to formations)
    op.create_table(
        'operations',
        sa.Column('id', sa.VARCHAR(length=50), nullable=False),
        sa.Column('tenant_id', sa.VARCHAR(length=50), nullable=False),
        sa.Column('name', sa.VARCHAR(length=100), nullable=False),
        sa.Column('operation_type', sa.VARCHAR(length=50), nullable=False),
        sa.Column('description', sa.TEXT(), nullable=True),
        sa.Column('start_time', postgresql.TIMESTAMP(), nullable=False),
        sa.Column('end_time', postgresql.TIMESTAMP(), nullable=True),
        sa.Column('actual_start_time', postgresql.TIMESTAMP(), nullable=True),
        sa.Column('actual_end_time', postgresql.TIMESTAMP(), nullable=True),
        sa.Column('status', sa.VARCHAR(length=20), nullable=True),
        sa.Column('participating_entities', postgresql.JSON(astext_type=sa.Text()), nullable=True),
        sa.Column('entity_count', sa.INTEGER(), nullable=True),
        sa.Column('formation_id', sa.VARCHAR(length=50), nullable=True),
        sa.Column('coordination_rules', postgresql.JSON(astext_type=sa.Text()), nullable=True),
        sa.Column('command_chain', postgresql.JSON(astext_type=sa.Text()), nullable=True),
        sa.Column('communication_plan', postgresql.JSON(astext_type=sa.Text()), nullable=True),
        sa.Column('priority', sa.INTEGER(), nullable=True),
        sa.Column('classification', sa.VARCHAR(length=50), nullable=True),
        sa.Column('objectives', postgresql.JSON(astext_type=sa.Text()), nullable=True),
        sa.Column('success_criteria', postgresql.JSON(astext_type=sa.Text()), nullable=True),
        sa.Column('risk_assessment', postgresql.JSON(astext_type=sa.Text()), nullable=True),
        sa.Column('timeline_data', postgresql.JSON(astext_type=sa.Text()), nullable=True),
        sa.Column('status_reports', postgresql.JSON(astext_type=sa.Text()), nullable=True),
        sa.Column('created_at', postgresql.TIMESTAMP(), nullable=False),
        sa.Column('updated_at', postgresql.TIMESTAMP(), nullable=False),
        sa.Column('created_by', sa.VARCHAR(length=50), nullable=True),
        sa.Column('updated_by', sa.VARCHAR(length=50), nullable=True),
        sa.ForeignKeyConstraint(['formation_id'], ['formations.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_operations_status_time', 'operations', ['status', 'start_time'])
    op.create_index('ix_operations_type', 'operations', ['operation_type'])

    # Create waypoints table (FK to route_plans)
    op.create_table(
        'waypoints',
        sa.Column('id', sa.VARCHAR(length=50), nullable=False),
        sa.Column('tenant_id', sa.VARCHAR(length=50), nullable=False),
        sa.Column('route_plan_id', sa.VARCHAR(length=50), nullable=False),
        sa.Column('sequence_order', sa.INTEGER(), nullable=False),
        sa.Column('name', sa.VARCHAR(length=100), nullable=True),
        sa.Column('position_lat', sa.DOUBLE_PRECISION(precision=53), nullable=False),
        sa.Column('position_lon', sa.DOUBLE_PRECISION(precision=53), nullable=False),
        sa.Column('position_alt_km', sa.DOUBLE_PRECISION(precision=53), nullable=True),
        sa.Column('arrival_time', postgresql.TIMESTAMP(), nullable=True),
        sa.Column('departure_time', postgresql.TIMESTAMP(), nullable=True),
        sa.Column('earliest_arrival', postgresql.TIMESTAMP(), nullable=True),
        sa.Column('latest_arrival', postgresql.TIMESTAMP(), nullable=True),
        sa.Column('hold_duration_sec', sa.DOUBLE_PRECISION(precision=53), nullable=True),
        sa.Column('dwell_time_sec', sa.DOUBLE_PRECISION(precision=53), nullable=True),
        sa.Column('maneuver_type', sa.VARCHAR(length=50), nullable=True),
        sa.Column('maneuver_params', postgresql.JSON(astext_type=sa.Text()), nullable=True),
        sa.Column('velocity_x', sa.DOUBLE_PRECISION(precision=53), nullable=True),
        sa.Column('velocity_y', sa.DOUBLE_PRECISION(precision=53), nullable=True),
        sa.Column('velocity_z', sa.DOUBLE_PRECISION(precision=53), nullable=True),
        sa.Column('constraints', postgresql.JSON(astext_type=sa.Text()), nullable=True),
        sa.Column('notes', sa.TEXT(), nullable=True),
        sa.Column('created_at', postgresql.TIMESTAMP(), nullable=False),
        sa.Column('updated_at', postgresql.TIMESTAMP(), nullable=False),
        sa.Column('created_by', sa.VARCHAR(length=50), nullable=True),
        sa.Column('updated_by', sa.VARCHAR(length=50), nullable=True),
        sa.ForeignKeyConstraint(['route_plan_id'], ['route_plans.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_waypoints_route_sequence', 'waypoints', ['route_plan_id', 'sequence_order'])

    # Create maneuvers table (FK to route_plans and waypoints)
    op.create_table(
        'maneuvers',
        sa.Column('id', sa.VARCHAR(length=50), nullable=False),
        sa.Column('tenant_id', sa.VARCHAR(length=50), nullable=False),
        sa.Column('route_plan_id', sa.VARCHAR(length=50), nullable=False),
        sa.Column('waypoint_id', sa.VARCHAR(length=50), nullable=True),
        sa.Column('entity_id', sa.VARCHAR(length=50), nullable=False),
        sa.Column('maneuver_type', sa.VARCHAR(length=50), nullable=False),
        sa.Column('burn_time', postgresql.TIMESTAMP(), nullable=False),
        sa.Column('burn_duration_sec', sa.DOUBLE_PRECISION(precision=53), nullable=True),
        sa.Column('delta_v_x', sa.DOUBLE_PRECISION(precision=53), nullable=True),
        sa.Column('delta_v_y', sa.DOUBLE_PRECISION(precision=53), nullable=True),
        sa.Column('delta_v_z', sa.DOUBLE_PRECISION(precision=53), nullable=True),
        sa.Column('total_delta_v_ms', sa.DOUBLE_PRECISION(precision=53), nullable=True),
        sa.Column('fuel_consumed_kg', sa.DOUBLE_PRECISION(precision=53), nullable=True),
        sa.Column('mass_before_kg', sa.DOUBLE_PRECISION(precision=53), nullable=True),
        sa.Column('mass_after_kg', sa.DOUBLE_PRECISION(precision=53), nullable=True),
        sa.Column('status', sa.VARCHAR(length=20), nullable=True),
        sa.Column('execution_result', postgresql.JSON(astext_type=sa.Text()), nullable=True),
        sa.Column('reference_frame', sa.VARCHAR(length=20), nullable=True),
        sa.Column('thrust_n', sa.DOUBLE_PRECISION(precision=53), nullable=True),
        sa.Column('isp_s', sa.DOUBLE_PRECISION(precision=53), nullable=True),
        sa.Column('created_at', postgresql.TIMESTAMP(), nullable=False),
        sa.Column('updated_at', postgresql.TIMESTAMP(), nullable=False),
        sa.Column('created_by', sa.VARCHAR(length=50), nullable=True),
        sa.Column('updated_by', sa.VARCHAR(length=50), nullable=True),
        sa.ForeignKeyConstraint(['route_plan_id'], ['route_plans.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['waypoint_id'], ['waypoints.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_maneuvers_entity_time', 'maneuvers', ['entity_id', 'burn_time'])
    op.create_index('ix_maneuvers_status', 'maneuvers', ['status'])

    # Create formation_members table (FK to formations)
    op.create_table(
        'formation_members',
        sa.Column('id', sa.VARCHAR(length=50), nullable=False),
        sa.Column('tenant_id', sa.VARCHAR(length=50), nullable=False),
        sa.Column('formation_id', sa.VARCHAR(length=50), nullable=False),
        sa.Column('entity_id', sa.VARCHAR(length=50), nullable=False),
        sa.Column('entity_type', sa.VARCHAR(length=30), nullable=False),
        sa.Column('slot_position', sa.INTEGER(), nullable=False),
        sa.Column('slot_name', sa.VARCHAR(length=50), nullable=True),
        sa.Column('relative_x_m', sa.DOUBLE_PRECISION(precision=53), nullable=True),
        sa.Column('relative_y_m', sa.DOUBLE_PRECISION(precision=53), nullable=True),
        sa.Column('relative_z_m', sa.DOUBLE_PRECISION(precision=53), nullable=True),
        sa.Column('relative_vx_ms', sa.DOUBLE_PRECISION(precision=53), nullable=True),
        sa.Column('relative_vy_ms', sa.DOUBLE_PRECISION(precision=53), nullable=True),
        sa.Column('relative_vz_ms', sa.DOUBLE_PRECISION(precision=53), nullable=True),
        sa.Column('time_offset_sec', sa.DOUBLE_PRECISION(precision=53), nullable=True),
        sa.Column('is_optional', sa.BOOLEAN(), nullable=True),
        sa.Column('created_at', postgresql.TIMESTAMP(), nullable=False),
        sa.Column('updated_at', postgresql.TIMESTAMP(), nullable=False),
        sa.Column('created_by', sa.VARCHAR(length=50), nullable=True),
        sa.Column('updated_by', sa.VARCHAR(length=50), nullable=True),
        sa.ForeignKeyConstraint(['formation_id'], ['formations.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_formation_members_formation_slot', 'formation_members', ['formation_id', 'slot_position'])
    op.create_index('ix_formation_members_entity', 'formation_members', ['entity_id'])

    # Create tasks table (FK to operations and route_plans)
    op.create_table(
        'tasks',
        sa.Column('id', sa.VARCHAR(length=50), nullable=False),
        sa.Column('tenant_id', sa.VARCHAR(length=50), nullable=False),
        sa.Column('operation_id', sa.VARCHAR(length=50), nullable=False),
        sa.Column('route_plan_id', sa.VARCHAR(length=50), nullable=True),
        sa.Column('task_type', sa.VARCHAR(length=50), nullable=False),
        sa.Column('name', sa.VARCHAR(length=100), nullable=False),
        sa.Column('description', sa.TEXT(), nullable=True),
        sa.Column('assigned_entity_id', sa.VARCHAR(length=50), nullable=True),
        sa.Column('assigned_team', sa.VARCHAR(length=100), nullable=True),
        sa.Column('scheduled_start', postgresql.TIMESTAMP(), nullable=True),
        sa.Column('scheduled_end', postgresql.TIMESTAMP(), nullable=True),
        sa.Column('actual_start', postgresql.TIMESTAMP(), nullable=True),
        sa.Column('actual_end', postgresql.TIMESTAMP(), nullable=True),
        sa.Column('status', sa.VARCHAR(length=20), nullable=True),
        sa.Column('priority', sa.INTEGER(), nullable=True),
        sa.Column('dependencies', postgresql.JSON(astext_type=sa.Text()), nullable=True),
        sa.Column('prerequisites', postgresql.JSON(astext_type=sa.Text()), nullable=True),
        sa.Column('task_parameters', postgresql.JSON(astext_type=sa.Text()), nullable=True),
        sa.Column('execution_result', postgresql.JSON(astext_type=sa.Text()), nullable=True),
        sa.Column('status_updates', postgresql.JSON(astext_type=sa.Text()), nullable=True),
        sa.Column('notes', sa.TEXT(), nullable=True),
        sa.Column('created_at', postgresql.TIMESTAMP(), nullable=False),
        sa.Column('updated_at', postgresql.TIMESTAMP(), nullable=False),
        sa.Column('created_by', sa.VARCHAR(length=50), nullable=True),
        sa.Column('updated_by', sa.VARCHAR(length=50), nullable=True),
        sa.ForeignKeyConstraint(['operation_id'], ['operations.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['route_plan_id'], ['route_plans.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_tasks_operation_status', 'tasks', ['operation_id', 'status'])
    op.create_index('ix_tasks_entity', 'tasks', ['assigned_entity_id'])

    # Create collision_alerts table (no FK)
    op.create_table(
        'collision_alerts',
        sa.Column('id', sa.VARCHAR(length=50), nullable=False),
        sa.Column('tenant_id', sa.VARCHAR(length=50), nullable=False),
        sa.Column('entity_a_id', sa.VARCHAR(length=50), nullable=False),
        sa.Column('entity_a_type', sa.VARCHAR(length=30), nullable=False),
        sa.Column('entity_b_id', sa.VARCHAR(length=50), nullable=False),
        sa.Column('entity_b_type', sa.VARCHAR(length=30), nullable=False),
        sa.Column('detection_time', postgresql.TIMESTAMP(), nullable=False),
        sa.Column('predicted_collision_time', postgresql.TIMESTAMP(), nullable=False),
        sa.Column('miss_distance_km', sa.DOUBLE_PRECISION(precision=53), nullable=False),
        sa.Column('miss_distance_radial_km', sa.DOUBLE_PRECISION(precision=53), nullable=True),
        sa.Column('miss_distance_intrack_km', sa.DOUBLE_PRECISION(precision=53), nullable=True),
        sa.Column('miss_distance_crosstrack_km', sa.DOUBLE_PRECISION(precision=53), nullable=True),
        sa.Column('probability', sa.DOUBLE_PRECISION(precision=53), nullable=True),
        sa.Column('risk_level', sa.VARCHAR(length=20), nullable=False),
        sa.Column('entity_a_radius_m', sa.DOUBLE_PRECISION(precision=53), nullable=True),
        sa.Column('entity_b_radius_m', sa.DOUBLE_PRECISION(precision=53), nullable=True),
        sa.Column('combined_radius_m', sa.DOUBLE_PRECISION(precision=53), nullable=True),
        sa.Column('avoidance_maneuver_proposed', sa.BOOLEAN(), nullable=True),
        sa.Column('avoidance_route_id', sa.VARCHAR(length=50), nullable=True),
        sa.Column('status', sa.VARCHAR(length=20), nullable=True),
        sa.Column('resolved_time', postgresql.TIMESTAMP(), nullable=True),
        sa.Column('resolution_type', sa.VARCHAR(length=50), nullable=True),
        sa.Column('alert_data', postgresql.JSON(astext_type=sa.Text()), nullable=True),
        sa.Column('created_at', postgresql.TIMESTAMP(), nullable=False),
        sa.Column('updated_at', postgresql.TIMESTAMP(), nullable=False),
        sa.Column('created_by', sa.VARCHAR(length=50), nullable=True),
        sa.Column('updated_by', sa.VARCHAR(length=50), nullable=True),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_collision_alerts_active', 'collision_alerts', ['status'])
    op.create_index('ix_collision_alerts_entity_pair', 'collision_alerts', ['entity_a_id', 'entity_b_id'])
    op.create_index('ix_collision_alerts_detection_time', 'collision_alerts', ['detection_time'])

    # Create position_reports table (no FK)
    op.create_table(
        'position_reports',
        sa.Column('id', sa.VARCHAR(length=50), nullable=False),
        sa.Column('tenant_id', sa.VARCHAR(length=50), nullable=False),
        sa.Column('entity_id', sa.VARCHAR(length=50), nullable=False),
        sa.Column('entity_type', sa.VARCHAR(length=30), nullable=False),
        sa.Column('report_time', postgresql.TIMESTAMP(), nullable=False),
        sa.Column('latitude', sa.DOUBLE_PRECISION(precision=53), nullable=False),
        sa.Column('longitude', sa.DOUBLE_PRECISION(precision=53), nullable=False),
        sa.Column('altitude_m', sa.DOUBLE_PRECISION(precision=53), nullable=True),
        sa.Column('velocity_x', sa.DOUBLE_PRECISION(precision=53), nullable=True),
        sa.Column('velocity_y', sa.DOUBLE_PRECISION(precision=53), nullable=True),
        sa.Column('velocity_z', sa.DOUBLE_PRECISION(precision=53), nullable=True),
        sa.Column('velocity_magnitude_ms', sa.DOUBLE_PRECISION(precision=53), nullable=True),
        sa.Column('heading_deg', sa.DOUBLE_PRECISION(precision=53), nullable=True),
        sa.Column('pitch_deg', sa.DOUBLE_PRECISION(precision=53), nullable=True),
        sa.Column('roll_deg', sa.DOUBLE_PRECISION(precision=53), nullable=True),
        sa.Column('accuracy_m', sa.DOUBLE_PRECISION(precision=53), nullable=True),
        sa.Column('data_source', sa.VARCHAR(length=50), nullable=True),
        sa.Column('sensor_id', sa.VARCHAR(length=50), nullable=True),
        sa.Column('is_simulated', sa.BOOLEAN(), nullable=True),
        sa.Column('raw_data', postgresql.JSON(astext_type=sa.Text()), nullable=True),
        sa.Column('created_at', postgresql.TIMESTAMP(), nullable=False),
        sa.Column('updated_at', postgresql.TIMESTAMP(), nullable=False),
        sa.Column('created_by', sa.VARCHAR(length=50), nullable=True),
        sa.Column('updated_by', sa.VARCHAR(length=50), nullable=True),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_position_reports_entity_time', 'position_reports', ['entity_id', 'report_time'])

    # Create communication_windows table (no FK)
    op.create_table(
        'communication_windows',
        sa.Column('id', sa.VARCHAR(length=50), nullable=False),
        sa.Column('tenant_id', sa.VARCHAR(length=50), nullable=False),
        sa.Column('source_entity_id', sa.VARCHAR(length=50), nullable=False),
        sa.Column('source_entity_type', sa.VARCHAR(length=30), nullable=False),
        sa.Column('target_entity_id', sa.VARCHAR(length=50), nullable=False),
        sa.Column('target_entity_type', sa.VARCHAR(length=30), nullable=False),
        sa.Column('window_start', postgresql.TIMESTAMP(), nullable=False),
        sa.Column('window_end', postgresql.TIMESTAMP(), nullable=False),
        sa.Column('link_type', sa.VARCHAR(length=50), nullable=True),
        sa.Column('frequency_mhz', sa.DOUBLE_PRECISION(precision=53), nullable=True),
        sa.Column('bandwidth_khz', sa.DOUBLE_PRECISION(precision=53), nullable=True),
        sa.Column('max_data_rate_kbps', sa.DOUBLE_PRECISION(precision=53), nullable=True),
        sa.Column('signal_quality', sa.DOUBLE_PRECISION(precision=53), nullable=True),
        sa.Column('elevation_angle_deg', sa.DOUBLE_PRECISION(precision=53), nullable=True),
        sa.Column('range_km', sa.DOUBLE_PRECISION(precision=53), nullable=True),
        sa.Column('is_available', sa.BOOLEAN(), nullable=True),
        sa.Column('is_scheduled', sa.BOOLEAN(), nullable=True),
        sa.Column('window_data', postgresql.JSON(astext_type=sa.Text()), nullable=True),
        sa.Column('created_at', postgresql.TIMESTAMP(), nullable=False),
        sa.Column('updated_at', postgresql.TIMESTAMP(), nullable=False),
        sa.Column('created_by', sa.VARCHAR(length=50), nullable=True),
        sa.Column('updated_by', sa.VARCHAR(length=50), nullable=True),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_comm_windows_entities', 'communication_windows', ['source_entity_id', 'target_entity_id'])
    op.create_index('ix_comm_windows_time', 'communication_windows', ['window_start', 'window_end'])


def downgrade() -> None:
    op.drop_index('ix_comm_windows_time', table_name='communication_windows')
    op.drop_index('ix_comm_windows_entities', table_name='communication_windows')
    op.drop_table('communication_windows')
    op.drop_index('ix_position_reports_entity_time', table_name='position_reports')
    op.drop_table('position_reports')
    op.drop_index('ix_collision_alerts_detection_time', table_name='collision_alerts')
    op.drop_index('ix_collision_alerts_entity_pair', table_name='collision_alerts')
    op.drop_index('ix_collision_alerts_active', table_name='collision_alerts')
    op.drop_table('collision_alerts')
    op.drop_index('ix_tasks_entity', table_name='tasks')
    op.drop_index('ix_tasks_operation_status', table_name='tasks')
    op.drop_table('tasks')
    op.drop_index('ix_formation_members_entity', table_name='formation_members')
    op.drop_index('ix_formation_members_formation_slot', table_name='formation_members')
    op.drop_table('formation_members')
    op.drop_index('ix_maneuvers_status', table_name='maneuvers')
    op.drop_index('ix_maneuvers_entity_time', table_name='maneuvers')
    op.drop_table('maneuvers')
    op.drop_index('ix_waypoints_route_sequence', table_name='waypoints')
    op.drop_table('waypoints')
    op.drop_index('ix_operations_type', table_name='operations')
    op.drop_index('ix_operations_status_time', table_name='operations')
    op.drop_table('operations')
    op.drop_index('ix_routes_status_time', table_name='route_plans')
    op.drop_index('ix_routes_entity_time', table_name='route_plans')
    op.drop_table('route_plans')
    op.drop_index('ix_formations_active', table_name='formations')
    op.drop_table('formations')
