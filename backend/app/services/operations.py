"""Operations services for multi-domain coordination and movement planning."""
from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any, Tuple
import math
from uuid import uuid4

from sqlalchemy import select, and_, func, or_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db.models.ontology import Satellite, Orbit
from app.db.models.operations import (
    RoutePlan, Waypoint, Maneuver, Formation, FormationMember,
    Operation, Task, CollisionAlert, PositionReport, CommunicationWindow
)
from app.db.models.operations import (
    OperationType, OperationStatus, FormationType, ManeuverType,
    ManeuverStatus, TaskStatus, EntityType
)
from app.schemas.operations import CollisionRiskLevel
from app.schemas.operations import (
    RoutePlanCreate, RoutePlanUpdate, RoutePlanResponse,
    WaypointCreate, ManeuverCreate,
    FormationCreate, FormationUpdate, FormationResponse,
    OperationCreate, OperationUpdate, OperationResponse,
    TaskCreate, TaskUpdate, TaskResponse,
    CollisionAlertCreate, CollisionAlertUpdate, CollisionAlertResponse,
    PositionReportCreate, PositionReportResponse,
    TrajectoryPoint, TrajectoryResponse, AvoidanceManeuverRequest, AvoidanceManeuverResponse,
    OperationDispatchRequest, OperationDispatchResponse
)
from app.services.audit import AuditService
from app.core.logging import get_logger

logger = get_logger(__name__)

EARTH_RADIUS_KM = 6371.0
EARTH_MU = 398600.4418


class RoutePlanningService:
    """Service for planning and managing routes."""

    def __init__(self, db: AsyncSession, audit: AuditService):
        self.db = db
        self.audit = audit

    async def create_route(self, tenant_id: str, user_id: str, route_data: RoutePlanCreate) -> RoutePlan:
        """Create a new route plan."""
        route = RoutePlan(
            id=str(uuid4()),
            tenant_id=tenant_id,
            entity_id=route_data.entity_id,
            entity_type=route_data.entity_type,
            name=route_data.name,
            description=route_data.description,
            mission_type=route_data.mission_type,
            start_time=route_data.start_time,
            end_time=route_data.end_time,
            origin_lat=route_data.origin_lat,
            origin_lon=route_data.origin_lon,
            origin_alt_km=route_data.origin_alt_km,
            destination_lat=route_data.destination_lat,
            destination_lon=route_data.destination_lon,
            destination_alt_km=route_data.destination_alt_km,
            priority=route_data.priority,
            is_recurring=route_data.is_recurring,
            recurrence_pattern=route_data.recurrence_pattern,
            trajectory_data=route_data.trajectory_data,
            constraints=route_data.constraints,
            objectives=route_data.objectives,
            planned_by=user_id,
            created_by=user_id,
            updated_by=user_id,
        )
        self.db.add(route)
        await self.db.flush()

        if route_data.waypoints:
            for i, wp_data in enumerate(route_data.waypoints):
                waypoint = Waypoint(
                    id=str(uuid4()),
                    tenant_id=tenant_id,
                    route_plan_id=route.id,
                    sequence_order=wp_data.sequence_order or i,
                    name=wp_data.name,
                    position_lat=wp_data.position_lat,
                    position_lon=wp_data.position_lon,
                    position_alt_km=wp_data.position_alt_km,
                    arrival_time=wp_data.arrival_time,
                    departure_time=wp_data.departure_time,
                    earliest_arrival=wp_data.earliest_arrival,
                    latest_arrival=wp_data.latest_arrival,
                    hold_duration_sec=wp_data.hold_duration_sec,
                    dwell_time_sec=wp_data.dwell_time_sec,
                    maneuver_type=wp_data.maneuver_type,
                    maneuver_params=wp_data.maneuver_params,
                    velocity_x=wp_data.velocity_x,
                    velocity_y=wp_data.velocity_y,
                    velocity_z=wp_data.velocity_z,
                    constraints=wp_data.constraints,
                    notes=wp_data.notes,
                    created_by=user_id,
                    updated_by=user_id,
                )
                self.db.add(waypoint)

        if route_data.maneuvers:
            for mnv_data in route_data.maneuvers:
                maneuver = Maneuver(
                    id=str(uuid4()),
                    tenant_id=tenant_id,
                    route_plan_id=route.id,
                    waypoint_id=mnv_data.waypoint_id,
                    entity_id=mnv_data.entity_id,
                    maneuver_type=mnv_data.maneuver_type,
                    burn_time=mnv_data.burn_time,
                    burn_duration_sec=mnv_data.burn_duration_sec,
                    delta_v_x=mnv_data.delta_v_x,
                    delta_v_y=mnv_data.delta_v_y,
                    delta_v_z=mnv_data.delta_v_z,
                    total_delta_v_ms=mnv_data.total_delta_v_ms,
                    fuel_consumed_kg=mnv_data.fuel_consumed_kg,
                    mass_before_kg=mnv_data.mass_before_kg,
                    mass_after_kg=mnv_data.mass_after_kg,
                    status=ManeuverStatus.PLANNED,
                    reference_frame=mnv_data.reference_frame,
                    thrust_n=mnv_data.thrust_n,
                    isp_s=mnv_data.isp_s,
                    created_by=user_id,
                    updated_by=user_id,
                )
                self.db.add(maneuver)

        await self.db.commit()
        await self.db.refresh(route)

        await self.audit.log(
            tenant_id=tenant_id,
            entity_id=route.id,
            entity_type="RoutePlan",
            action="CREATE",
            user_id=user_id,
            details={"name": route.name, "entity_id": route.entity_id}
        )

        return route

    async def get_route(self, tenant_id: str, route_id: str) -> Optional[RoutePlan]:
        """Get a route by ID with all related data."""
        result = await self.db.execute(
            select(RoutePlan)
            .options(
                selectinload(RoutePlan.waypoints),
                selectinload(RoutePlan.maneuvers),
                selectinload(RoutePlan.tasks)
            )
            .where(
                RoutePlan.tenant_id == tenant_id,
                RoutePlan.id == route_id
            )
        )
        return result.scalar_one_or_none()

    async def list_routes(
        self, tenant_id: str, entity_id: Optional[str] = None,
        status: Optional[str] = None, page: int = 1, page_size: int = 50
    ) -> Tuple[List[RoutePlan], int]:
        """List route plans with filtering."""
        query = (
            select(RoutePlan)
            .where(RoutePlan.tenant_id == tenant_id)
            .options(selectinload(RoutePlan.waypoints), selectinload(RoutePlan.maneuvers))
        )

        if entity_id:
            query = query.where(RoutePlan.entity_id == entity_id)
        if status:
            query = query.where(RoutePlan.status == status)

        count_result = await self.db.execute(
            select(func.count()).select_from(query.subquery())
        )
        total = count_result.scalar_one()

        query = query.order_by(RoutePlan.created_at.desc())
        query = query.offset((page - 1) * page_size).limit(page_size)

        result = await self.db.execute(query)
        routes = result.scalars().all()

        return list(routes), total

    async def update_route(
        self, tenant_id: str, route_id: str, user_id: str, update_data: RoutePlanUpdate
    ) -> Optional[RoutePlan]:
        """Update a route plan."""
        route = await self.get_route(tenant_id, route_id)
        if not route:
            return None

        update_fields = update_data.model_dump(exclude_unset=True)
        for field, value in update_fields.items():
            if hasattr(route, field):
                setattr(route, field, value)

        route.updated_by = user_id
        route.updated_at = datetime.utcnow()

        await self.db.commit()
        await self.db.refresh(route)

        await self.audit.log(
            tenant_id=tenant_id,
            entity_id=route.id,
            entity_type="RoutePlan",
            action="UPDATE",
            user_id=user_id,
            details={"fields": list(update_fields.keys())}
        )

        return route

    async def delete_route(self, tenant_id: str, route_id: str, user_id: str) -> bool:
        """Delete a route plan."""
        route = await self.get_route(tenant_id, route_id)
        if not route:
            return False

        await self.db.delete(route)
        await self.db.commit()

        await self.audit.log(
            tenant_id=tenant_id,
            entity_id=route_id,
            entity_type="RoutePlan",
            action="DELETE",
            user_id=user_id,
            details={"name": route.name}
        )

        return True

    async def generate_trajectory(
        self, tenant_id: str, route_id: str
    ) -> Optional[TrajectoryResponse]:
        """Generate a trajectory from a route plan."""
        route = await self.get_route(tenant_id, route_id)
        if not route:
            return None

        trajectory = []
        waypoints = sorted(route.waypoints, key=lambda w: w.sequence_order)

        for wp in waypoints:
            point = TrajectoryPoint(
                time=wp.arrival_time or route.start_time,
                latitude=wp.position_lat,
                longitude=wp.position_lon,
                altitude_km=wp.position_alt_km or 0,
                velocity_x=wp.velocity_x,
                velocity_y=wp.velocity_y,
                velocity_z=wp.velocity_z
            )
            trajectory.append(point)

        return TrajectoryResponse(
            entity_id=route.entity_id,
            entity_type=route.entity_type,
            trajectory=trajectory,
            start_time=route.start_time,
            end_time=route.end_time or route.start_time
        )


class FormationService:
    """Service for managing formations."""

    def __init__(self, db: AsyncSession, audit: AuditService):
        self.db = db
        self.audit = audit

    async def create_formation(
        self, tenant_id: str, user_id: str, formation_data: FormationCreate
    ) -> Formation:
        """Create a new formation."""
        formation = Formation(
            id=str(uuid4()),
            tenant_id=tenant_id,
            name=formation_data.name,
            formation_type=formation_data.formation_type,
            description=formation_data.description,
            leader_entity_id=formation_data.leader_entity_id,
            spacing_meters=formation_data.spacing_meters,
            altitude_separation_m=formation_data.altitude_separation_m,
            time_offset_sec=formation_data.time_offset_sec,
            formation_data=formation_data.formation_data,
            slot_assignments=formation_data.slot_assignments,
            created_by=user_id,
            updated_by=user_id,
        )
        self.db.add(formation)
        await self.db.flush()

        if formation_data.members:
            for i, member_data in enumerate(formation_data.members):
                member = FormationMember(
                    id=str(uuid4()),
                    tenant_id=tenant_id,
                    formation_id=formation.id,
                    entity_id=member_data.entity_id,
                    entity_type=member_data.entity_type,
                    slot_position=member_data.slot_position or i,
                    slot_name=member_data.slot_name,
                    relative_x_m=member_data.relative_x_m,
                    relative_y_m=member_data.relative_y_m,
                    relative_z_m=member_data.relative_z_m,
                    relative_vx_ms=member_data.relative_vx_ms,
                    relative_vy_ms=member_data.relative_vy_ms,
                    relative_vz_ms=member_data.relative_vz_ms,
                    time_offset_sec=member_data.time_offset_sec,
                    is_optional=member_data.is_optional,
                    created_by=user_id,
                    updated_by=user_id,
                )
                self.db.add(member)

        await self.db.commit()
        await self.db.refresh(formation)
        return formation

    async def get_formation(self, tenant_id: str, formation_id: str) -> Optional[Formation]:
        """Get a formation by ID."""
        result = await self.db.execute(
            select(Formation)
            .options(selectinload(Formation.members))
            .where(
                Formation.tenant_id == tenant_id,
                Formation.id == formation_id
            )
        )
        return result.scalar_one_or_none()

    async def list_formations(
        self, tenant_id: str, is_active: Optional[bool] = None,
        page: int = 1, page_size: int = 50
    ) -> Tuple[List[Formation], int]:
        """List formations."""
        query = (
            select(Formation)
            .where(Formation.tenant_id == tenant_id)
            .options(selectinload(Formation.members))
        )

        if is_active is not None:
            query = query.where(Formation.is_active == is_active)

        count_result = await self.db.execute(
            select(func.count()).select_from(query.subquery())
        )
        total = count_result.scalar_one()

        query = query.order_by(Formation.created_at.desc())
        query = query.offset((page - 1) * page_size).limit(page_size)

        result = await self.db.execute(query)
        formations = result.scalars().all()

        return list(formations), total

    async def activate_formation(
        self, tenant_id: str, formation_id: str, user_id: str
    ) -> Optional[Formation]:
        """Activate a formation."""
        formation = await self.get_formation(tenant_id, formation_id)
        if not formation:
            return None

        formation.is_active = True
        formation.activation_time = datetime.utcnow()
        formation.updated_by = user_id

        await self.db.commit()
        await self.db.refresh(formation)

        await self.audit.log(
            tenant_id=tenant_id,
            entity_id=formation.id,
            entity_type="Formation",
            action="ACTIVATE",
            user_id=user_id
        )

        return formation

    async def get_formation_position(
        self, formation: Formation, leader_pos: Dict, leader_time: datetime
    ) -> Dict[str, Dict]:
        """Calculate formation member positions relative to leader."""
        positions = {}

        for member in formation.members:
            offset = {
                "x": member.relative_x_m,
                "y": member.relative_y_m,
                "z": member.relative_z_m
            }

            time_offset = member.time_offset_sec
            adjusted_time = leader_time + timedelta(seconds=time_offset)

            positions[member.entity_id] = {
                "position": {
                    "lat": leader_pos["lat"] + (offset.get("y", 0) / EARTH_RADIUS_KM) * (180 / math.pi),
                    "lon": leader_pos["lon"] + (offset.get("x", 0) / (EARTH_RADIUS_KM * math.cos(math.radians(leader_pos["lat"])))) * (180 / math.pi),
                    "alt_km": leader_pos.get("alt_km", 0) + (offset.get("z", 0) / 1000)
                },
                "velocity": {
                    "vx": leader_pos.get("vx", 0) + member.relative_vx_ms,
                    "vy": leader_pos.get("vy", 0) + member.relative_vy_ms,
                    "vz": leader_pos.get("vz", 0) + member.relative_vz_ms
                },
                "time": adjusted_time.isoformat()
            }

        return positions


class CollisionDetectionService:
    """Service for collision detection and avoidance."""

    def __init__(self, db: AsyncSession, audit: AuditService):
        self.db = db
        self.audit = audit
        self.proximity_threshold_km = 0.05
        self.collision_threshold_km = 0.005
        self.prediction_window_minutes = 60

    async def detect_collisions(
        self, tenant_id: str, entity_ids: List[str]
    ) -> List[CollisionAlert]:
        """Detect potential collisions between entities."""
        alerts = []

        for i, entity_a in enumerate(entity_ids):
            for entity_b in entity_ids[i + 1:]:
                alert = await self._check_pair(tenant_id, entity_a, entity_b)
                if alert:
                    alerts.append(alert)

        return alerts

    async def _check_pair(
        self, tenant_id: str, entity_a_id: str, entity_b_id: str
    ) -> Optional[CollisionAlert]:
        """Check a pair of entities for potential collision."""
        pos_a = await self._get_latest_position(entity_a_id)
        pos_b = await self._get_latest_position(entity_b_id)

        if not pos_a or not pos_b:
            return None

        distance = self._calculate_distance(pos_a, pos_b)
        risk_level = self._assess_risk(distance)

        if risk_level in [CollisionRiskLevel.HIGH, CollisionRiskLevel.CRITICAL]:
            alert = CollisionAlert(
                id=str(uuid4()),
                tenant_id=tenant_id,
                entity_a_id=entity_a_id,
                entity_a_type=pos_a.get("type", "satellite"),
                entity_b_id=entity_b_id,
                entity_b_type=pos_b.get("type", "satellite"),
                detection_time=datetime.utcnow(),
                predicted_collision_time=datetime.utcnow() + timedelta(
                    minutes=self.prediction_window_minutes
                ),
                miss_distance_km=distance,
                risk_level=risk_level,
                status="active",
                created_by="system",
                updated_by="system",
            )
            self.db.add(alert)

            return alert

        return None

    async def _get_latest_position(self, entity_id: str) -> Optional[Dict]:
        """Get the latest position report for an entity."""
        result = await self.db.execute(
            select(PositionReport)
            .where(PositionReport.entity_id == entity_id)
            .order_by(PositionReport.report_time.desc())
            .limit(1)
        )
        report = result.scalar_one_or_none()

        if report:
            return {
                "lat": report.latitude,
                "lon": report.longitude,
                "alt_km": (report.altitude_m or 0) / 1000,
                "vx": report.velocity_x,
                "vy": report.velocity_y,
                "vz": report.velocity_z,
                "type": report.entity_type,
                "time": report.report_time
            }

        orbit = await self._get_latest_orbit(entity_id)
        if orbit:
            return {
                "lat": 0,
                "lon": 0,
                "alt_km": orbit.get("alt_km", 400),
                "vx": 0,
                "vy": 0,
                "vz": 0,
                "type": "satellite",
                "time": datetime.utcnow()
            }

        return None

    async def _get_latest_orbit(self, satellite_id: str) -> Optional[Dict]:
        """Get the latest orbit for a satellite."""
        result = await self.db.execute(
            select(Orbit)
            .where(Orbit.satellite_id == satellite_id)
            .order_by(Orbit.epoch.desc())
            .limit(1)
        )
        orbit = result.scalar_one_or_none()

        if orbit:
            return {
                "semi_major_axis_km": orbit.semi_major_axis_km,
                "eccentricity": orbit.eccentricity,
                "inclination_deg": orbit.inclination_deg,
                "alt_km": (orbit.apogee_km + orbit.perigee_km) / 2 if orbit.apogee_km else 400
            }

        return None

    def _calculate_distance(
        self, pos_a: Dict, pos_b: Dict
    ) -> float:
        """Calculate distance between two positions in km."""
        lat1, lon1 = math.radians(pos_a["lat"]), math.radians(pos_a["lon"])
        lat2, lon2 = math.radians(pos_b["lat"]), math.radians(pos_b["lon"])

        dlat = lat2 - lat1
        dlon = lon2 - lon1

        a = math.sin(dlat / 2)**2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2)**2
        c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))

        distance_km = EARTH_RADIUS_KM * c

        alt_diff = abs(pos_a.get("alt_km", 0) - pos_b.get("alt_km", 0))
        distance_km = math.sqrt(distance_km**2 + alt_diff**2)

        return distance_km

    def _assess_risk(self, distance_km: float) -> CollisionRiskLevel:
        """Assess collision risk level based on distance."""
        if distance_km < 0.001:
            return CollisionRiskLevel.CRITICAL
        elif distance_km < 0.01:
            return CollisionRiskLevel.HIGH
        elif distance_km < 0.1:
            return CollisionRiskLevel.MEDIUM
        else:
            return CollisionRiskLevel.LOW

    async def generate_avoidance_maneuver(
        self, tenant_id: str, request: AvoidanceManeuverRequest
    ) -> Optional[AvoidanceManeuverResponse]:
        """Generate an avoidance maneuver for a potential collision."""
        route_service = RoutePlanningService(self.db, self.audit)

        route = await route_service.create_route(
            tenant_id=tenant_id,
            user_id="system",
            route_data=RoutePlanCreate(
                entity_id=request.entity_id,
                entity_type="satellite",
                name=f"Avoidance Route - {request.target_collision_id}",
                mission_type="debris_avoidance",
                start_time=datetime.utcnow(),
                end_time=datetime.utcnow() + timedelta(hours=1),
                origin_lat=0,
                origin_lon=0,
                origin_alt_km=400,
                destination_lat=0.1,
                destination_lon=0.1,
                destination_alt_km=410 if request.prefer_altitude_change else 400
            )
        )

        if request.prefer_altitude_change:
            maneuver = Maneuver(
                id=str(uuid4()),
                tenant_id=tenant_id,
                route_plan_id=route.id,
                entity_id=request.entity_id,
                maneuver_type=ManeuverType.DEBRIS_AVOIDANCE,
                burn_time=datetime.utcnow() + timedelta(minutes=30),
                burn_duration_sec=60,
                delta_v_z=10,
                total_delta_v_ms=10,
                fuel_consumed_kg=1.0,
                status=ManeuverStatus.PLANNED,
                created_by="system",
                updated_by="system",
            )
            self.db.add(maneuver)

        trajectory = TrajectoryResponse(
            entity_id=request.entity_id,
            entity_type="satellite",
            trajectory=[
                TrajectoryPoint(
                    time=datetime.utcnow(),
                    latitude=0,
                    longitude=0,
                    altitude_km=400
                ),
                TrajectoryPoint(
                    time=datetime.utcnow() + timedelta(minutes=30),
                    latitude=0.05,
                    longitude=0.05,
                    altitude_km=410 if request.prefer_altitude_change else 400
                ),
                TrajectoryPoint(
                    time=datetime.utcnow() + timedelta(hours=1),
                    latitude=0.1,
                    longitude=0.1,
                    altitude_km=410 if request.prefer_altitude_change else 400
                )
            ],
            start_time=datetime.utcnow(),
            end_time=datetime.utcnow() + timedelta(hours=1)
        )

        return AvoidanceManeuverResponse(
            maneuver_id=str(uuid4()),
            route_plan_id=route.id,
            estimated_delta_v_ms=10,
            estimated_fuel_kg=1.0,
            new_trajectory=trajectory.trajectory,
            maneuver_sequence=[]
        )


class OperationService:
    """Service for managing operations."""

    def __init__(self, db: AsyncSession, audit: AuditService):
        self.db = db
        self.audit = audit
        self.route_service = RoutePlanningService(db, audit)
        self.formation_service = FormationService(db, audit)
        self.collision_service = CollisionDetectionService(db, audit)

    async def create_operation(
        self, tenant_id: str, user_id: str, operation_data: OperationCreate
    ) -> Operation:
        """Create a new operation."""
        operation = Operation(
            id=str(uuid4()),
            tenant_id=tenant_id,
            name=operation_data.name,
            operation_type=operation_data.operation_type,
            description=operation_data.description,
            start_time=operation_data.start_time,
            end_time=operation_data.end_time,
            participating_entities=operation_data.participating_entities,
            entity_count=len(operation_data.participating_entities),
            formation_id=operation_data.formation_id,
            coordination_rules=operation_data.coordination_rules,
            command_chain=operation_data.command_chain,
            communication_plan=operation_data.communication_plan,
            priority=operation_data.priority,
            classification=operation_data.classification,
            objectives=operation_data.objectives,
            success_criteria=operation_data.success_criteria,
            status=OperationStatus.PLANNED,
            created_by=user_id,
            updated_by=user_id,
        )
        self.db.add(operation)
        await self.db.flush()

        if operation_data.route_plans:
            for route_data in operation_data.route_plans:
                route = await self.route_service.create_route(
                    tenant_id, user_id, route_data
                )

        if operation_data.tasks:
            for task_data in operation_data.tasks:
                task = Task(
                    id=str(uuid4()),
                    tenant_id=tenant_id,
                    operation_id=operation.id,
                    route_plan_id=task_data.route_plan_id,
                    task_type=task_data.task_type,
                    name=task_data.name,
                    description=task_data.description,
                    assigned_entity_id=task_data.assigned_entity_id,
                    assigned_team=task_data.assigned_team,
                    scheduled_start=task_data.scheduled_start,
                    scheduled_end=task_data.scheduled_end,
                    priority=task_data.priority,
                    dependencies=task_data.dependencies,
                    prerequisites=task_data.prerequisites,
                    task_parameters=task_data.task_parameters,
                    status=TaskStatus.PENDING,
                    created_by=user_id,
                    updated_by=user_id,
                )
                self.db.add(task)

        await self.db.commit()
        await self.db.refresh(operation)

        await self.audit.log(
            tenant_id=tenant_id,
            entity_id=operation.id,
            entity_type="Operation",
            action="CREATE",
            user_id=user_id,
            details={"name": operation.name, "type": operation.operation_type}
        )

        return operation

    async def get_operation(
        self, tenant_id: str, operation_id: str
    ) -> Optional[Operation]:
        """Get an operation by ID with all related data."""
        result = await self.db.execute(
            select(Operation)
            .options(
                selectinload(Operation.route_plans).selectinload(RoutePlan.waypoints),
                selectinload(Operation.route_plans).selectinload(RoutePlan.maneuvers),
                selectinload(Operation.tasks),
                selectinload(Operation.formation).selectinload(Formation.members)
            )
            .where(
                Operation.tenant_id == tenant_id,
                Operation.id == operation_id
            )
        )
        return result.scalar_one_or_none()

    async def list_operations(
        self, tenant_id: str, status: Optional[str] = None,
        operation_type: Optional[str] = None, page: int = 1, page_size: int = 50
    ) -> Tuple[List[Operation], int]:
        """List operations with filtering."""
        query = (
            select(Operation)
            .where(Operation.tenant_id == tenant_id)
            .options(selectinload(Operation.route_plans), selectinload(Operation.tasks))
        )

        if status:
            query = query.where(Operation.status == status)
        if operation_type:
            query = query.where(Operation.operation_type == operation_type)

        count_result = await self.db.execute(
            select(func.count()).select_from(query.subquery())
        )
        total = count_result.scalar_one()

        query = query.order_by(Operation.created_at.desc())
        query = query.offset((page - 1) * page_size).limit(page_size)

        result = await self.db.execute(query)
        operations = result.scalars().all()

        return list(operations), total

    async def dispatch_operation(
        self, tenant_id: str, request: OperationDispatchRequest, user_id: str
    ) -> OperationDispatchResponse:
        """Dispatch an operation."""
        operation = await self.get_operation(tenant_id, request.operation_id)
        if not operation:
            raise ValueError("Operation not found")

        operation.status = OperationStatus.ACTIVE
        operation.actual_start_time = request.dispatch_time or datetime.utcnow()
        operation.updated_by = user_id

        for route in operation.route_plans:
            route.status = "active"
            route.actual_start_time = operation.actual_start_time

        for task in operation.tasks:
            task.status = TaskStatus.QUEUED

        await self.db.commit()

        await self.audit.log(
            tenant_id=tenant_id,
            entity_id=operation.id,
            entity_type="Operation",
            action="DISPATCH",
            user_id=user_id
        )

        return OperationDispatchResponse(
            operation_id=operation.id,
            status=operation.status.value,
            dispatched_at=operation.actual_start_time,
            participating_entities=operation.participating_entities,
            timeline_events=[]
        )

    async def update_operation_status(
        self, tenant_id: str, operation_id: str, user_id: str,
        status: OperationStatus, details: Optional[Dict] = None
    ) -> Optional[Operation]:
        """Update operation status."""
        operation = await self.get_operation(tenant_id, operation_id)
        if not operation:
            return None

        old_status = operation.status
        operation.status = status
        operation.updated_by = user_id

        if status == OperationStatus.COMPLETED:
            operation.actual_end_time = datetime.utcnow()
        elif status == OperationStatus.ACTIVE:
            operation.actual_start_time = datetime.utcnow()

        if details:
            operation.status_reports.append({
                "timestamp": datetime.utcnow().isoformat(),
                "old_status": old_status.value,
                "new_status": status.value,
                "details": details
            })

        await self.db.commit()
        await self.db.refresh(operation)

        await self.audit.log(
            tenant_id=tenant_id,
            entity_id=operation.id,
            entity_type="Operation",
            action="STATUS_CHANGE",
            user_id=user_id,
            details={"old_status": old_status.value, "new_status": status.value}
        )

        return operation


class PositionTrackingService:
    """Service for tracking entity positions."""

    def __init__(self, db: AsyncSession, audit: AuditService):
        self.db = db
        self.audit = audit

    async def report_position(
        self, tenant_id: str, user_id: str, report: PositionReportCreate
    ) -> PositionReport:
        """Record a position report."""
        raw_data = report.model_dump(exclude={"id", "tenant_id"})
        if "report_time" in raw_data and hasattr(raw_data["report_time"], "isoformat"):
            raw_data["report_time"] = raw_data["report_time"].isoformat()
        
        report_time = report.report_time
        if report_time.tzinfo is not None:
            report_time = report_time.replace(tzinfo=None)
        
        position_report = PositionReport(
            id=str(uuid4()),
            tenant_id=tenant_id,
            entity_id=report.entity_id,
            entity_type=report.entity_type,
            report_time=report_time,
            latitude=report.latitude,
            longitude=report.longitude,
            altitude_m=report.altitude_m,
            velocity_x=report.velocity_x,
            velocity_y=report.velocity_y,
            velocity_z=report.velocity_z,
            velocity_magnitude_ms=report.velocity_magnitude_ms,
            heading_deg=report.heading_deg,
            pitch_deg=report.pitch_deg,
            roll_deg=report.roll_deg,
            accuracy_m=report.accuracy_m,
            data_source=report.data_source,
            sensor_id=report.sensor_id,
            is_simulated=report.is_simulated,
            raw_data=raw_data,
            created_by=user_id,
            updated_by=user_id,
        )
        self.db.add(position_report)
        await self.db.commit()
        await self.db.refresh(position_report)

        return position_report

    async def get_latest_position(
        self, tenant_id: str, entity_id: str
    ) -> Optional[PositionReport]:
        """Get the latest position for an entity."""
        result = await self.db.execute(
            select(PositionReport)
            .where(
                PositionReport.tenant_id == tenant_id,
                PositionReport.entity_id == entity_id
            )
            .order_by(PositionReport.report_time.desc())
            .limit(1)
        )
        return result.scalar_one_or_none()

    async def get_position_history(
        self, tenant_id: str, entity_id: str,
        start_time: datetime, end_time: datetime
    ) -> List[PositionReport]:
        """Get position history for an entity."""
        result = await self.db.execute(
            select(PositionReport)
            .where(
                PositionReport.tenant_id == tenant_id,
                PositionReport.entity_id == entity_id,
                PositionReport.report_time >= start_time,
                PositionReport.report_time <= end_time
            )
            .order_by(PositionReport.report_time.asc())
        )
        return list(result.scalars().all())

    async def get_all_ground_vehicles(self, tenant_id: str) -> List[PositionReport]:
        """Get the latest position for all ground vehicles."""
        from sqlalchemy import func

        subquery = (
            select(
                PositionReport.entity_id,
                func.max(PositionReport.report_time).label("max_report_time")
            )
            .where(
                PositionReport.tenant_id == tenant_id,
                PositionReport.entity_type == "ground_vehicle"
            )
            .group_by(PositionReport.entity_id)
            .subquery()
        )

        result = await self.db.execute(
            select(PositionReport)
            .join(
                subquery,
                and_(
                    PositionReport.entity_id == subquery.c.entity_id,
                    PositionReport.report_time == subquery.c.max_report_time
                )
            )
            .order_by(PositionReport.entity_id)
        )
        return list(result.scalars().all())


class CommunicationService:
    """Service for managing communication windows."""

    def __init__(self, db: AsyncSession, audit: AuditService):
        self.db = db
        self.audit = audit

    async def create_window(
        self, tenant_id: str, user_id: str, window_data: Any
    ) -> CommunicationWindow:
        """Create a communication window."""
        window = CommunicationWindow(
            id=str(uuid4()),
            tenant_id=tenant_id,
            source_entity_id=window_data.source_entity_id,
            source_entity_type=window_data.source_entity_type,
            target_entity_id=window_data.target_entity_id,
            target_entity_type=window_data.target_entity_type,
            window_start=window_data.window_start,
            window_end=window_data.window_end,
            link_type=window_data.link_type,
            frequency_mhz=window_data.frequency_mhz,
            bandwidth_khz=window_data.bandwidth_khz,
            max_data_rate_kbps=window_data.max_data_rate_kbps,
            signal_quality=window_data.signal_quality,
            elevation_angle_deg=window_data.elevation_angle_deg,
            range_km=window_data.range_km,
            is_available=window_data.is_available,
            is_scheduled=window_data.is_scheduled,
            window_data=window_data.model_dump() if hasattr(window_data, 'model_dump') else dict(window_data),
            created_by=user_id,
            updated_by=user_id,
        )
        self.db.add(window)
        await self.db.commit()
        await self.db.refresh(window)
        return window

    async def get_available_windows(
        self, tenant_id: str, entity_id: str, start_time: datetime, end_time: datetime
    ) -> List[CommunicationWindow]:
        """Get available communication windows for an entity."""
        result = await self.db.execute(
            select(CommunicationWindow)
            .where(
                CommunicationWindow.tenant_id == tenant_id,
                or_(
                    CommunicationWindow.source_entity_id == entity_id,
                    CommunicationWindow.target_entity_id == entity_id
                ),
                CommunicationWindow.window_start >= start_time,
                CommunicationWindow.window_end <= end_time,
                CommunicationWindow.is_available == True
            )
            .order_by(CommunicationWindow.window_start.asc())
        )
        return list(result.scalars().all())
