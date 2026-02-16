"""Operations models for multi-domain coordination and movement planning."""
from datetime import datetime
from typing import Optional

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    JSON,
    ARRAY,
)
from sqlalchemy.orm import relationship
import enum

from app.db.base import Base, AuditMixin, generate_uuid


class OperationType(str, enum.Enum):
    """Types of operations."""
    TRANSIT = "transit"
    PATROL = "patrol"
    INTERCEPT = "intercept"
    STRIKE = "strike"
    RECONNAISSANCE = "reconnaissance"
    SUPPORT = "support"
    DEBRIS_AVOIDANCE = "debris_avoidance"
    STATION_KEEPING = "station_keeping"
    FORMATION = "formation"
    COORDINATED_MANEUVER = "coordinated_maneuver"


class OperationStatus(str, enum.Enum):
    """Operation status."""
    PLANNED = "planned"
    SCHEDULED = "scheduled"
    ACTIVE = "active"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    CANCELLED = "cancelled"
    FAILED = "failed"


class FormationType(str, enum.Enum):
    """Formation patterns."""
    V_SHAPE = "v_shape"
    LINE = "line"
    DIAMOND = "diamond"
    ECHELON = "echelon"
    CIRCLE = "circle"
    CUSTOM = "custom"


class ManeuverType(str, enum.Enum):
    """Types of maneuvers."""
    ORBIT_INSERTION = "orbit_insertion"
    ORBIT_CHANGE = "orbit_change"
    STATION_KEEPING = "station_keeping"
    DEBRIS_AVOIDANCE = "debris_avoidance"
    COLLISION_AVOIDANCE = "collision_avoidance"
    FORMATION_JOIN = "formation_join"
    FORMATION_LEAVE = "formation_leave"
    COORDINATED_BURN = "coordinated_burn"
    RENDEZVOUS = "rendezvous"
    DISPERSAL = "dispersal"


class ManeuverStatus(str, enum.Enum):
    """Maneuver execution status."""
    PLANNED = "planned"
    SCHEDULED = "scheduled"
    EXECUTING = "executing"
    COMPLETED = "completed"
    CANCELLED = "cancelled"
    FAILED = "failed"


class EntityType(str, enum.Enum):
    """Types of entities in operations."""
    SATELLITE = "satellite"
    AIRCRAFT = "aircraft"
    SHIP = "ship"
    GROUND_VEHICLE = "ground_vehicle"
    GROUND_STATION = "ground_station"
    BALLISTIC_MISSILE = "ballistic_missile"
    DEBRIS = "debris"
    SIMULATED = "simulated"


class TaskStatus(str, enum.Enum):
    """Task execution status."""
    PENDING = "pending"
    QUEUED = "queued"
    ASSIGNED = "assigned"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class Waypoint(Base, AuditMixin):
    """Waypoint for planned trajectory."""
    __tablename__ = "waypoints"

    id = Column(String(50), primary_key=True, default=generate_uuid)
    route_plan_id = Column(
        String(50), ForeignKey("route_plans.id", ondelete="CASCADE"), nullable=False, index=True
    )

    sequence_order = Column(Integer, nullable=False)
    name = Column(String(100), nullable=True)

    position_lat = Column(Float, nullable=False)
    position_lon = Column(Float, nullable=False)
    position_alt_km = Column(Float, nullable=True)

    arrival_time = Column(DateTime, nullable=True)
    departure_time = Column(DateTime, nullable=True)
    earliest_arrival = Column(DateTime, nullable=True)
    latest_arrival = Column(DateTime, nullable=True)

    hold_duration_sec = Column(Float, nullable=True)
    dwell_time_sec = Column(Float, nullable=True)

    maneuver_type = Column(String(50), nullable=True)
    maneuver_params = Column(JSON, default=dict)

    velocity_x = Column(Float, nullable=True)
    velocity_y = Column(Float, nullable=True)
    velocity_z = Column(Float, nullable=True)

    constraints = Column(JSON, default=list)
    notes = Column(Text, nullable=True)

    route_plan = relationship("RoutePlan", back_populates="waypoints")

    __table_args__ = (
        Index("ix_waypoints_route_sequence", "route_plan_id", "sequence_order"),
    )


class Maneuver(Base, AuditMixin):
    """Maneuver (delta-v burn or course change)."""
    __tablename__ = "maneuvers"

    id = Column(String(50), primary_key=True, default=generate_uuid)
    route_plan_id = Column(
        String(50), ForeignKey("route_plans.id", ondelete="CASCADE"), nullable=False, index=True
    )
    waypoint_id = Column(
        String(50), ForeignKey("waypoints.id", ondelete="SET NULL"), nullable=True
    )
    entity_id = Column(String(50), nullable=False, index=True)

    maneuver_type = Column(String(50), nullable=False)
    burn_time = Column(DateTime, nullable=False)
    burn_duration_sec = Column(Float, default=0)

    delta_v_x = Column(Float, nullable=True)
    delta_v_y = Column(Float, nullable=True)
    delta_v_z = Column(Float, nullable=True)
    total_delta_v_ms = Column(Float, nullable=True)

    fuel_consumed_kg = Column(Float, nullable=True)
    mass_before_kg = Column(Float, nullable=True)
    mass_after_kg = Column(Float, nullable=True)

    status = Column(String(20), default="planned")
    execution_result = Column(JSON, nullable=True)

    reference_frame = Column(String(20), default="inertial")
    thrust_n = Column(Float, nullable=True)
    isp_s = Column(Float, nullable=True)

    waypoint = relationship("Waypoint")
    route_plan = relationship("RoutePlan", back_populates="maneuvers")

    __table_args__ = (
        Index("ix_maneuvers_entity_time", "entity_id", "burn_time"),
        Index("ix_maneuvers_status", "status"),
    )


class RoutePlan(Base, AuditMixin):
    """Complete movement plan for an entity."""
    __tablename__ = "route_plans"

    id = Column(String(50), primary_key=True, default=generate_uuid)
    entity_id = Column(String(50), nullable=False, index=True)
    entity_type = Column(String(30), nullable=False)
    operation_id = Column(
        String(50), ForeignKey("operations.id", ondelete="CASCADE"), nullable=True, index=True
    )

    name = Column(String(100), nullable=False)
    description = Column(Text, nullable=True)
    mission_type = Column(String(50), nullable=False)

    start_time = Column(DateTime, nullable=False)
    end_time = Column(DateTime, nullable=True)
    actual_start_time = Column(DateTime, nullable=True)
    actual_end_time = Column(DateTime, nullable=True)

    status = Column(String(20), default="planned")

    planned_by = Column(String(100), nullable=True)
    approval_status = Column(String(20), default="pending")
    approved_by = Column(String(100), nullable=True)
    approved_at = Column(DateTime, nullable=True)

    origin_lat = Column(Float, nullable=True)
    origin_lon = Column(Float, nullable=True)
    origin_alt_km = Column(Float, nullable=True)
    destination_lat = Column(Float, nullable=True)
    destination_lon = Column(Float, nullable=True)
    destination_alt_km = Column(Float, nullable=True)

    priority = Column(Integer, default=5)
    is_recurring = Column(Boolean, default=False)
    recurrence_pattern = Column(JSON, nullable=True)

    trajectory_data = Column(JSON, nullable=True)
    constraints = Column(JSON, default=list)
    objectives = Column(JSON, default=list)

    waypoints = relationship(
        "Waypoint", back_populates="route_plan", cascade="all, delete-orphan", order_by="Waypoint.sequence_order"
    )
    maneuvers = relationship(
        "Maneuver", back_populates="route_plan", cascade="all, delete-orphan"
    )
    tasks = relationship("Task", back_populates="route_plan", cascade="all, delete-orphan")
    operation = relationship("Operation", back_populates="route_plans")

    __table_args__ = (
        Index("ix_routes_entity_time", "entity_id", "start_time"),
        Index("ix_routes_status_time", "status", "start_time"),
    )


class Formation(Base, AuditMixin):
    """Formation definition for coordinated movement."""
    __tablename__ = "formations"

    id = Column(String(50), primary_key=True, default=generate_uuid)
    name = Column(String(100), nullable=False)
    formation_type = Column(String(30), nullable=False)
    description = Column(Text, nullable=True)

    leader_entity_id = Column(String(50), nullable=True)
    spacing_meters = Column(Float, default=100)

    altitude_separation_m = Column(Float, nullable=True)
    time_offset_sec = Column(Float, default=0)

    is_active = Column(Boolean, default=False)
    activation_time = Column(DateTime, nullable=True)
    deactivation_time = Column(DateTime, nullable=True)

    formation_data = Column(JSON, nullable=True)
    slot_assignments = Column(JSON, default=dict)

    members = relationship("FormationMember", back_populates="formation", cascade="all, delete-orphan")
    operations = relationship("Operation", back_populates="formation")

    __table_args__ = (
        Index("ix_formations_active", "is_active"),
    )


class FormationMember(Base, AuditMixin):
    """Member of a formation with relative position."""
    __tablename__ = "formation_members"

    id = Column(String(50), primary_key=True, default=generate_uuid)
    formation_id = Column(
        String(50), ForeignKey("formations.id", ondelete="CASCADE"), nullable=False
    )
    entity_id = Column(String(50), nullable=False, index=True)
    entity_type = Column(String(30), nullable=False)

    slot_position = Column(Integer, nullable=False)
    slot_name = Column(String(50), nullable=True)

    relative_x_m = Column(Float, default=0)
    relative_y_m = Column(Float, default=0)
    relative_z_m = Column(Float, default=0)

    relative_vx_ms = Column(Float, default=0)
    relative_vy_ms = Column(Float, default=0)
    relative_vz_ms = Column(Float, default=0)

    time_offset_sec = Column(Float, default=0)
    is_optional = Column(Boolean, default=False)

    formation = relationship("Formation")

    __table_args__ = (
        Index("ix_formation_members_formation_slot", "formation_id", "slot_position"),
    )


class Operation(Base, AuditMixin):
    """Coordinated multi-entity operation."""
    __tablename__ = "operations"

    id = Column(String(50), primary_key=True, default=generate_uuid)
    name = Column(String(100), nullable=False)
    operation_type = Column(String(50), nullable=False)
    description = Column(Text, nullable=True)

    start_time = Column(DateTime, nullable=False, index=True)
    end_time = Column(DateTime, nullable=True)
    actual_start_time = Column(DateTime, nullable=True)
    actual_end_time = Column(DateTime, nullable=True)

    status = Column(String(20), default="planned")

    participating_entities = Column(JSON, default=list)
    entity_count = Column(Integer, default=0)

    formation_id = Column(
        String(50), ForeignKey("formations.id", ondelete="SET NULL"), nullable=True
    )
    coordination_rules = Column(JSON, default=dict)

    command_chain = Column(JSON, default=list)
    communication_plan = Column(JSON, default=dict)

    priority = Column(Integer, default=5)
    classification = Column(String(50), default="unclassified")

    objectives = Column(JSON, default=list)
    success_criteria = Column(JSON, default=list)
    risk_assessment = Column(JSON, nullable=True)

    timeline_data = Column(JSON, nullable=True)
    status_reports = Column(JSON, default=list)

    formation = relationship("Formation", back_populates="operations")
    route_plans = relationship("RoutePlan", back_populates="operation")
    tasks = relationship("Task", back_populates="operation")

    __table_args__ = (
        Index("ix_operations_status_time", "status", "start_time"),
        Index("ix_operations_type", "operation_type"),
    )


class Task(Base, AuditMixin):
    """Atomic task within an operation."""
    __tablename__ = "tasks"

    id = Column(String(50), primary_key=True, default=generate_uuid)
    operation_id = Column(
        String(50), ForeignKey("operations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    route_plan_id = Column(
        String(50), ForeignKey("route_plans.id", ondelete="SET NULL"), nullable=True
    )

    task_type = Column(String(50), nullable=False)
    name = Column(String(100), nullable=False)
    description = Column(Text, nullable=True)

    assigned_entity_id = Column(String(50), nullable=True)
    assigned_team = Column(String(100), nullable=True)

    scheduled_start = Column(DateTime, nullable=True)
    scheduled_end = Column(DateTime, nullable=True)
    actual_start = Column(DateTime, nullable=True)
    actual_end = Column(DateTime, nullable=True)

    status = Column(String(20), default="pending")
    priority = Column(Integer, default=5)

    dependencies = Column(JSON, default=list)
    prerequisites = Column(JSON, default=list)

    task_parameters = Column(JSON, default=dict)
    execution_result = Column(JSON, nullable=True)

    status_updates = Column(JSON, default=list)
    notes = Column(Text, nullable=True)

    operation = relationship("Operation", back_populates="tasks")
    route_plan = relationship("RoutePlan", back_populates="tasks")

    __table_args__ = (
        Index("ix_tasks_operation_status", "operation_id", "status"),
        Index("ix_tasks_entity", "assigned_entity_id"),
    )


class CollisionAlert(Base, AuditMixin):
    """Collision detection alert."""
    __tablename__ = "collision_alerts"

    id = Column(String(50), primary_key=True, default=generate_uuid)
    entity_a_id = Column(String(50), nullable=False, index=True)
    entity_a_type = Column(String(30), nullable=False)
    entity_b_id = Column(String(50), nullable=False, index=True)
    entity_b_type = Column(String(30), nullable=False)

    detection_time = Column(DateTime, nullable=False, index=True)
    predicted_collision_time = Column(DateTime, nullable=False)

    miss_distance_km = Column(Float, nullable=False)
    miss_distance_radial_km = Column(Float, nullable=True)
    miss_distance_intrack_km = Column(Float, nullable=True)
    miss_distance_crosstrack_km = Column(Float, nullable=True)

    probability = Column(Float, nullable=True)
    risk_level = Column(String(20), nullable=False)

    entity_a_radius_m = Column(Float, nullable=True)
    entity_b_radius_m = Column(Float, nullable=True)
    combined_radius_m = Column(Float, nullable=True)

    avoidance_maneuver_proposed = Column(Boolean, default=False)
    avoidance_route_id = Column(String(50), nullable=True)

    status = Column(String(20), default="active")
    resolved_time = Column(DateTime, nullable=True)
    resolution_type = Column(String(50), nullable=True)

    alert_data = Column(JSON, nullable=True)

    __table_args__ = (
        Index("ix_collision_alerts_active", "status"),
        Index("ix_collision_alerts_entity_pair", "entity_a_id", "entity_b_id"),
    )


class PositionReport(Base, AuditMixin):
    """Real-time position report for tracked entities."""
    __tablename__ = "position_reports"

    id = Column(String(50), primary_key=True, default=generate_uuid)
    entity_id = Column(String(50), nullable=False, index=True)
    entity_type = Column(String(30), nullable=False)

    report_time = Column(DateTime, nullable=False, index=True)

    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    altitude_m = Column(Float, nullable=True)

    velocity_x = Column(Float, nullable=True)
    velocity_y = Column(Float, nullable=True)
    velocity_z = Column(Float, nullable=True)
    velocity_magnitude_ms = Column(Float, nullable=True)

    heading_deg = Column(Float, nullable=True)
    pitch_deg = Column(Float, nullable=True)
    roll_deg = Column(Float, nullable=True)

    accuracy_m = Column(Float, nullable=True)
    data_source = Column(String(50), nullable=True)

    sensor_id = Column(String(50), nullable=True)
    is_simulated = Column(Boolean, default=False)

    raw_data = Column(JSON, nullable=True)

    __table_args__ = (
        Index("ix_position_reports_entity_time", "entity_id", "report_time"),
    )


class CommunicationWindow(Base, AuditMixin):
    """Communication window between entities."""
    __tablename__ = "communication_windows"

    id = Column(String(50), primary_key=True, default=generate_uuid)
    source_entity_id = Column(String(50), nullable=False, index=True)
    source_entity_type = Column(String(30), nullable=False)
    target_entity_id = Column(String(50), nullable=False, index=True)
    target_entity_type = Column(String(30), nullable=False)

    window_start = Column(DateTime, nullable=False, index=True)
    window_end = Column(DateTime, nullable=False)

    link_type = Column(String(50), default="rf")
    frequency_mhz = Column(Float, nullable=True)
    bandwidth_khz = Column(Float, nullable=True)

    max_data_rate_kbps = Column(Float, nullable=True)
    signal_quality = Column(Float, nullable=True)

    elevation_angle_deg = Column(Float, nullable=True)
    range_km = Column(Float, nullable=True)

    is_available = Column(Boolean, default=True)
    is_scheduled = Column(Boolean, default=False)

    window_data = Column(JSON, nullable=True)

    __table_args__ = (
        Index("ix_comm_windows_entities", "source_entity_id", "target_entity_id"),
        Index("ix_comm_windows_time", "window_start", "window_end"),
    )
