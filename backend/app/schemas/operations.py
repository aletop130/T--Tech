"""Pydantic schemas for operations and movement planning."""
from datetime import datetime
from typing import Optional, List, Any
from enum import Enum

from pydantic import BaseModel, ConfigDict, Field


class OperationType(str, Enum):
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


class OperationStatus(str, Enum):
    PLANNED = "planned"
    SCHEDULED = "scheduled"
    ACTIVE = "active"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    CANCELLED = "cancelled"
    FAILED = "failed"


class FormationType(str, Enum):
    V_SHAPE = "v_shape"
    LINE = "line"
    DIAMOND = "diamond"
    ECHELON = "echelon"
    CIRCLE = "circle"
    CUSTOM = "custom"


class ManeuverType(str, Enum):
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


class ManeuverStatus(str, Enum):
    PLANNED = "planned"
    SCHEDULED = "scheduled"
    EXECUTING = "executing"
    COMPLETED = "completed"
    CANCELLED = "cancelled"
    FAILED = "failed"


class EntityType(str, Enum):
    SATELLITE = "satellite"
    AIRCRAFT = "aircraft"
    SHIP = "ship"
    GROUND_VEHICLE = "ground_vehicle"
    GROUND_STATION = "ground_station"
    BALLISTIC_MISSILE = "ballistic_missile"
    DEBRIS = "debris"
    SIMULATED = "simulated"


class TaskStatus(str, Enum):
    PENDING = "pending"
    QUEUED = "queued"
    ASSIGNED = "assigned"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class CollisionRiskLevel(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class BaseSchema(BaseModel):
    model_config = ConfigDict(
        from_attributes=True,
        populate_by_name=True,
        str_strip_whitespace=True,
    )


class WaypointBase(BaseSchema):
    sequence_order: int
    name: Optional[str] = None
    position_lat: float
    position_lon: float
    position_alt_km: Optional[float] = None
    arrival_time: Optional[datetime] = None
    departure_time: Optional[datetime] = None
    earliest_arrival: Optional[datetime] = None
    latest_arrival: Optional[datetime] = None
    hold_duration_sec: Optional[float] = None
    dwell_time_sec: Optional[float] = None
    maneuver_type: Optional[str] = None
    maneuver_params: dict = Field(default_factory=dict)
    velocity_x: Optional[float] = None
    velocity_y: Optional[float] = None
    velocity_z: Optional[float] = None
    constraints: List[dict] = Field(default_factory=list)
    notes: Optional[str] = None


class WaypointCreate(WaypointBase):
    pass


class WaypointUpdate(BaseSchema):
    sequence_order: Optional[int] = None
    name: Optional[str] = None
    position_lat: Optional[float] = None
    position_lon: Optional[float] = None
    position_alt_km: Optional[float] = None
    arrival_time: Optional[datetime] = None
    departure_time: Optional[datetime] = None
    earliest_arrival: Optional[datetime] = None
    latest_arrival: Optional[datetime] = None
    hold_duration_sec: Optional[float] = None
    dwell_time_sec: Optional[float] = None
    maneuver_type: Optional[str] = None
    maneuver_params: Optional[dict] = None
    velocity_x: Optional[float] = None
    velocity_y: Optional[float] = None
    velocity_z: Optional[float] = None
    constraints: Optional[List[dict]] = None
    notes: Optional[str] = None


class WaypointResponse(WaypointBase):
    id: str
    route_plan_id: str
    created_at: datetime
    updated_at: datetime


class ManeuverBase(BaseSchema):
    maneuver_type: str
    burn_time: datetime
    burn_duration_sec: Optional[float] = None
    delta_v_x: Optional[float] = None
    delta_v_y: Optional[float] = None
    delta_v_z: Optional[float] = None
    total_delta_v_ms: Optional[float] = None
    fuel_consumed_kg: Optional[float] = None
    mass_before_kg: Optional[float] = None
    mass_after_kg: Optional[float] = None
    status: ManeuverStatus = ManeuverStatus.PLANNED
    reference_frame: str = "inertial"
    thrust_n: Optional[float] = None
    isp_s: Optional[float] = None


class ManeuverCreate(ManeuverBase):
    entity_id: str
    route_plan_id: Optional[str] = None
    waypoint_id: Optional[str] = None


class ManeuverUpdate(BaseSchema):
    maneuver_type: Optional[str] = None
    burn_time: Optional[datetime] = None
    burn_duration_sec: Optional[float] = None
    delta_v_x: Optional[float] = None
    delta_v_y: Optional[float] = None
    delta_v_z: Optional[float] = None
    total_delta_v_ms: Optional[float] = None
    fuel_consumed_kg: Optional[float] = None
    mass_before_kg: Optional[float] = None
    mass_after_kg: Optional[float] = None
    status: Optional[ManeuverStatus] = None
    reference_frame: Optional[str] = None
    thrust_n: Optional[float] = None
    isp_s: Optional[float] = None
    execution_result: Optional[dict] = None


class ManeuverResponse(ManeuverBase):
    id: str
    route_plan_id: str
    entity_id: str
    waypoint_id: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class RoutePlanBase(BaseSchema):
    entity_id: str
    entity_type: str
    name: str
    description: Optional[str] = None
    mission_type: str
    start_time: datetime
    end_time: Optional[datetime] = None
    origin_lat: Optional[float] = None
    origin_lon: Optional[float] = None
    origin_alt_km: Optional[float] = None
    destination_lat: Optional[float] = None
    destination_lon: Optional[float] = None
    destination_alt_km: Optional[float] = None
    priority: int = 5
    is_recurring: bool = False
    recurrence_pattern: Optional[dict] = None
    trajectory_data: Optional[dict] = None
    constraints: List[dict] = Field(default_factory=list)
    objectives: List[str] = Field(default_factory=list)


class RoutePlanCreate(RoutePlanBase):
    waypoints: Optional[List[WaypointCreate]] = None
    maneuvers: Optional[List[ManeuverCreate]] = None


class RoutePlanUpdate(BaseSchema):
    name: Optional[str] = None
    description: Optional[str] = None
    mission_type: Optional[str] = None
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    origin_lat: Optional[float] = None
    origin_lon: Optional[float] = None
    origin_alt_km: Optional[float] = None
    destination_lat: Optional[float] = None
    destination_lon: Optional[float] = None
    destination_alt_km: Optional[float] = None
    priority: Optional[int] = None
    is_recurring: Optional[bool] = None
    recurrence_pattern: Optional[dict] = None
    trajectory_data: Optional[dict] = None
    constraints: Optional[List[dict]] = None
    objectives: Optional[List[str]] = None
    status: Optional[str] = None


class RoutePlanResponse(RoutePlanBase):
    id: str
    status: str
    planned_by: Optional[str] = None
    approval_status: str = "pending"
    approved_by: Optional[str] = None
    approved_at: Optional[datetime] = None
    actual_start_time: Optional[datetime] = None
    actual_end_time: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime
    waypoints: List[WaypointResponse] = Field(default_factory=list)
    maneuvers: List[ManeuverResponse] = Field(default_factory=list)


class RoutePlanDetailResponse(RoutePlanResponse):
    tasks: List["TaskResponse"] = Field(default_factory=list)


class FormationMemberBase(BaseSchema):
    entity_id: str
    entity_type: str
    slot_position: int
    slot_name: Optional[str] = None
    relative_x_m: float = 0
    relative_y_m: float = 0
    relative_z_m: float = 0
    relative_vx_ms: float = 0
    relative_vy_ms: float = 0
    relative_vz_ms: float = 0
    time_offset_sec: float = 0
    is_optional: bool = False


class FormationMemberCreate(FormationMemberBase):
    pass


class FormationMemberUpdate(BaseSchema):
    slot_position: Optional[int] = None
    slot_name: Optional[str] = None
    relative_x_m: Optional[float] = None
    relative_y_m: Optional[float] = None
    relative_z_m: Optional[float] = None
    relative_vx_ms: Optional[float] = None
    relative_vy_ms: Optional[float] = None
    relative_vz_ms: Optional[float] = None
    time_offset_sec: Optional[float] = None
    is_optional: Optional[bool] = None


class FormationMemberResponse(FormationMemberBase):
    id: str
    formation_id: str
    created_at: datetime
    updated_at: datetime


class FormationBase(BaseSchema):
    name: str
    formation_type: str
    description: Optional[str] = None
    leader_entity_id: Optional[str] = None
    spacing_meters: float = 100
    altitude_separation_m: Optional[float] = None
    time_offset_sec: float = 0
    formation_data: Optional[dict] = None
    slot_assignments: dict = Field(default_factory=dict)


class FormationCreate(FormationBase):
    members: Optional[List[FormationMemberCreate]] = None


class FormationUpdate(BaseSchema):
    name: Optional[str] = None
    formation_type: Optional[str] = None
    description: Optional[str] = None
    leader_entity_id: Optional[str] = None
    spacing_meters: Optional[float] = None
    altitude_separation_m: Optional[float] = None
    time_offset_sec: Optional[float] = None
    is_active: Optional[bool] = None
    formation_data: Optional[dict] = None
    slot_assignments: Optional[dict] = None


class FormationResponse(FormationBase):
    id: str
    is_active: bool = False
    activation_time: Optional[datetime] = None
    deactivation_time: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime
    members: List[FormationMemberResponse] = Field(default_factory=list)


class TaskBase(BaseSchema):
    task_type: str
    name: str
    description: Optional[str] = None
    assigned_entity_id: Optional[str] = None
    assigned_team: Optional[str] = None
    scheduled_start: Optional[datetime] = None
    scheduled_end: Optional[datetime] = None
    priority: int = 5
    dependencies: List[str] = Field(default_factory=list)
    prerequisites: List[str] = Field(default_factory=list)
    task_parameters: dict = Field(default_factory=dict)


class TaskCreate(TaskBase):
    operation_id: Optional[str] = None
    route_plan_id: Optional[str] = None


class TaskUpdate(BaseSchema):
    task_type: Optional[str] = None
    name: Optional[str] = None
    description: Optional[str] = None
    assigned_entity_id: Optional[str] = None
    assigned_team: Optional[str] = None
    scheduled_start: Optional[datetime] = None
    scheduled_end: Optional[datetime] = None
    priority: Optional[int] = None
    dependencies: Optional[List[str]] = None
    prerequisites: Optional[List[str]] = None
    task_parameters: Optional[dict] = None
    status: Optional[TaskStatus] = None
    actual_start: Optional[datetime] = None
    actual_end: Optional[datetime] = None
    execution_result: Optional[dict] = None
    notes: Optional[str] = None


class TaskResponse(TaskBase):
    id: str
    operation_id: str
    route_plan_id: Optional[str] = None
    status: TaskStatus = TaskStatus.PENDING
    actual_start: Optional[datetime] = None
    actual_end: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime
    status_updates: List[dict] = Field(default_factory=list)


class OperationBase(BaseSchema):
    name: str
    operation_type: str
    description: Optional[str] = None
    start_time: datetime
    end_time: Optional[datetime] = None
    participating_entities: List[str] = Field(default_factory=list)
    formation_id: Optional[str] = None
    coordination_rules: dict = Field(default_factory=dict)
    command_chain: List[str] = Field(default_factory=list)
    communication_plan: Optional[dict] = None
    priority: int = 5
    classification: str = "unclassified"
    objectives: List[str] = Field(default_factory=list)
    success_criteria: List[str] = Field(default_factory=list)


class OperationCreate(OperationBase):
    route_plans: Optional[List[RoutePlanCreate]] = None
    tasks: Optional[List[TaskCreate]] = None


class OperationUpdate(BaseSchema):
    name: Optional[str] = None
    operation_type: Optional[str] = None
    description: Optional[str] = None
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    participating_entities: Optional[List[str]] = None
    formation_id: Optional[str] = None
    coordination_rules: Optional[dict] = None
    command_chain: Optional[List[str]] = None
    communication_plan: Optional[dict] = None
    priority: Optional[int] = None
    classification: Optional[str] = None
    objectives: Optional[List[str]] = None
    success_criteria: Optional[List[str]] = None
    status: Optional[OperationStatus] = None


class OperationResponse(OperationBase):
    id: str
    status: OperationStatus = OperationStatus.PLANNED
    entity_count: int = 0
    actual_start_time: Optional[datetime] = None
    actual_end_time: Optional[datetime] = None
    risk_assessment: Optional[dict] = None
    timeline_data: Optional[dict] = None
    status_reports: List[dict] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime
    route_plans: List[RoutePlanResponse] = Field(default_factory=list)
    tasks: List[TaskResponse] = Field(default_factory=list)


class OperationDetailResponse(OperationResponse):
    formation: Optional[FormationResponse] = None


class CollisionAlertBase(BaseSchema):
    entity_a_id: str
    entity_a_type: str
    entity_b_id: str
    entity_b_type: str
    detection_time: datetime
    predicted_collision_time: datetime
    miss_distance_km: float
    miss_distance_radial_km: Optional[float] = None
    miss_distance_intrack_km: Optional[float] = None
    miss_distance_crosstrack_km: Optional[float] = None
    probability: Optional[float] = None
    risk_level: CollisionRiskLevel
    entity_a_radius_m: Optional[float] = None
    entity_b_radius_m: Optional[float] = None
    combined_radius_m: Optional[float] = None


class CollisionAlertCreate(CollisionAlertBase):
    pass


class CollisionAlertUpdate(BaseSchema):
    status: Optional[str] = None
    resolved_time: Optional[datetime] = None
    resolution_type: Optional[str] = None
    avoidance_route_id: Optional[str] = None
    alert_data: Optional[dict] = None


class CollisionAlertResponse(CollisionAlertBase):
    id: str
    avoidance_maneuver_proposed: bool = False
    avoidance_route_id: Optional[str] = None
    status: str = "active"
    created_at: datetime
    updated_at: datetime


class PositionReportBase(BaseSchema):
    entity_id: str
    entity_type: str
    report_time: datetime
    latitude: float
    longitude: float
    altitude_m: Optional[float] = None
    velocity_x: Optional[float] = None
    velocity_y: Optional[float] = None
    velocity_z: Optional[float] = None
    velocity_magnitude_ms: Optional[float] = None
    heading_deg: Optional[float] = None
    pitch_deg: Optional[float] = None
    roll_deg: Optional[float] = None
    accuracy_m: Optional[float] = None
    data_source: Optional[str] = None
    sensor_id: Optional[str] = None
    is_simulated: bool = False


class PositionReportCreate(PositionReportBase):
    pass


class PositionReportResponse(PositionReportBase):
    id: str
    created_at: datetime


class PositionReportListResponse(BaseSchema):
    items: List[PositionReportResponse]
    total: int


class CommunicationWindowBase(BaseSchema):
    source_entity_id: str
    source_entity_type: str
    target_entity_id: str
    target_entity_type: str
    window_start: datetime
    window_end: datetime
    link_type: str = "rf"
    frequency_mhz: Optional[float] = None
    bandwidth_khz: Optional[float] = None
    max_data_rate_kbps: Optional[float] = None
    signal_quality: Optional[float] = None
    elevation_angle_deg: Optional[float] = None
    range_km: Optional[float] = None
    is_available: bool = True
    is_scheduled: bool = False


class CommunicationWindowCreate(CommunicationWindowBase):
    pass


class CommunicationWindowUpdate(BaseSchema):
    link_type: Optional[str] = None
    frequency_mhz: Optional[float] = None
    bandwidth_khz: Optional[float] = None
    max_data_rate_kbps: Optional[float] = None
    signal_quality: Optional[float] = None
    is_available: Optional[bool] = None
    is_scheduled: Optional[bool] = None
    window_data: Optional[dict] = None


class CommunicationWindowResponse(CommunicationWindowBase):
    id: str
    created_at: datetime
    updated_at: datetime


class RoutePlanListResponse(BaseSchema):
    items: List[RoutePlanResponse]
    total: int
    page: int
    page_size: int


class OperationListResponse(BaseSchema):
    items: List[OperationResponse]
    total: int
    page: int
    page_size: int


class FormationListResponse(BaseSchema):
    items: List[FormationResponse]
    total: int
    page: int
    page_size: int


class CollisionAlertListResponse(BaseSchema):
    items: List[CollisionAlertResponse]
    total: int
    active_count: int


class CoordinateResponse(BaseSchema):
    latitude: float
    longitude: float
    altitude_km: float
    velocity_x: Optional[float] = None
    velocity_y: Optional[float] = None
    velocity_z: Optional[float] = None
    heading_deg: Optional[float] = None
    timestamp: datetime


class TrajectoryPoint(BaseSchema):
    time: datetime
    latitude: float
    longitude: float
    altitude_km: float
    velocity_x: Optional[float] = None
    velocity_y: Optional[float] = None
    velocity_z: Optional[float] = None


class TrajectoryResponse(BaseSchema):
    entity_id: str
    entity_type: str
    trajectory: List[TrajectoryPoint]
    start_time: datetime
    end_time: datetime


class AvoidanceManeuverRequest(BaseSchema):
    entity_id: str
    target_collision_id: str
    avoidance_type: str = "horizontal"
    prefer_altitude_change: bool = True
    min_altitude_km: Optional[float] = None
    max_delta_v_ms: Optional[float] = None


class AvoidanceManeuverResponse(BaseSchema):
    maneuver_id: str
    route_plan_id: str
    estimated_delta_v_ms: float
    estimated_fuel_kg: float
    new_trajectory: List[TrajectoryPoint]
    maneuver_sequence: List[ManeuverResponse]


class FormationAssignmentRequest(BaseSchema):
    formation_id: str
    assignments: List[dict]


class OperationDispatchRequest(BaseSchema):
    operation_id: str
    dispatch_time: Optional[datetime] = None


class OperationDispatchResponse(BaseSchema):
    operation_id: str
    status: str
    dispatched_at: datetime
    participating_entities: List[str]
    timeline_events: List[dict]


RoutePlanDetailResponse.model_rebuild()
