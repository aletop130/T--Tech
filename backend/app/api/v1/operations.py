"""Operations API endpoints for multi-domain coordination and movement planning."""
from datetime import datetime
from typing import Annotated, Optional, List

from fastapi import APIRouter, Depends, Query, Path, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import (
    get_current_user,
    require_role,
    get_route_planning_service,
    get_formation_service,
    get_collision_detection_service,
    get_operation_service,
    get_position_tracking_service,
    get_communication_service,
    get_db,
)
from app.core.security import TokenData
from app.core.exceptions import NotFoundError
from app.services.operations import (
    RoutePlanningService, FormationService,
    CollisionDetectionService, OperationService,
    PositionTrackingService, CommunicationService
)
from app.schemas.operations import (
    RoutePlanCreate, RoutePlanUpdate, RoutePlanResponse, RoutePlanListResponse,
    WaypointCreate, WaypointUpdate, WaypointResponse,
    ManeuverCreate, ManeuverUpdate, ManeuverResponse,
    FormationCreate, FormationUpdate, FormationResponse, FormationListResponse,
    FormationMemberCreate, FormationMemberUpdate,
    OperationCreate, OperationUpdate, OperationResponse, OperationDetailResponse, OperationListResponse,
    TaskCreate, TaskUpdate, TaskResponse,
    CollisionAlertCreate, CollisionAlertUpdate, CollisionAlertResponse, CollisionAlertListResponse,
    PositionReportCreate, PositionReportResponse, PositionReportListResponse,
    TrajectoryResponse, AvoidanceManeuverRequest, AvoidanceManeuverResponse,
    OperationDispatchRequest, OperationDispatchResponse,
    CommunicationWindowCreate, CommunicationWindowUpdate, CommunicationWindowResponse,
)

router = APIRouter()


@router.post("/routes", response_model=RoutePlanResponse, status_code=201)
async def create_route(
    route_data: RoutePlanCreate,
    user: Annotated[TokenData, Depends(get_current_user)],
    service: Annotated[RoutePlanningService, Depends(get_route_planning_service)],
):
    """Create a new route plan."""
    return await service.create_route(user.tenant_id, user.user_id, route_data)


@router.get("/routes", response_model=RoutePlanListResponse)
async def list_routes(
    user: Annotated[TokenData, Depends(get_current_user)],
    service: Annotated[RoutePlanningService, Depends(get_route_planning_service)],
    entity_id: Optional[str] = None,
    status: Optional[str] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
):
    """List route plans."""
    routes, total = await service.list_routes(
        user.tenant_id, entity_id, status, page, page_size
    )
    return RoutePlanListResponse(
        items=routes,
        total=total,
        page=page,
        page_size=page_size
    )


@router.get("/routes/{route_id}", response_model=RoutePlanResponse)
async def get_route(
    route_id: str,
    user: Annotated[TokenData, Depends(get_current_user)],
    service: Annotated[RoutePlanningService, Depends(get_route_planning_service)],
):
    """Get a route plan by ID."""
    route = await service.get_route(user.tenant_id, route_id)
    if not route:
        raise NotFoundError("Route not found")
    return route


@router.put("/routes/{route_id}", response_model=RoutePlanResponse)
async def update_route(
    route_id: str,
    update_data: RoutePlanUpdate,
    user: Annotated[TokenData, Depends(get_current_user)],
    service: Annotated[RoutePlanningService, Depends(get_route_planning_service)],
):
    """Update a route plan."""
    route = await service.update_route(user.tenant_id, route_id, user.user_id, update_data)
    if not route:
        raise NotFoundError("Route not found")
    return route


@router.delete("/routes/{route_id}", status_code=204)
async def delete_route(
    route_id: str,
    user: Annotated[TokenData, Depends(get_current_user)],
    service: Annotated[RoutePlanningService, Depends(get_route_planning_service)],
):
    """Delete a route plan."""
    success = await service.delete_route(user.tenant_id, route_id, user.user_id)
    if not success:
        raise NotFoundError("Route not found")


@router.get("/routes/{route_id}/trajectory", response_model=TrajectoryResponse)
async def get_trajectory(
    route_id: str,
    user: Annotated[TokenData, Depends(get_current_user)],
    service: Annotated[RoutePlanningService, Depends(get_route_planning_service)],
):
    """Get trajectory from a route plan."""
    trajectory = await service.generate_trajectory(user.tenant_id, route_id)
    if not trajectory:
        raise NotFoundError("Route not found")
    return trajectory


@router.post("/formations", response_model=FormationResponse, status_code=201)
async def create_formation(
    formation_data: FormationCreate,
    user: Annotated[TokenData, Depends(get_current_user)],
    service: Annotated[FormationService, Depends(get_formation_service)],
):
    """Create a new formation."""
    return await service.create_formation(user.tenant_id, user.user_id, formation_data)


@router.get("/formations", response_model=FormationListResponse)
async def list_formations(
    user: Annotated[TokenData, Depends(get_current_user)],
    service: Annotated[FormationService, Depends(get_formation_service)],
    is_active: Optional[bool] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
):
    """List formations."""
    formations, total = await service.list_formations(user.tenant_id, is_active, page, page_size)
    return FormationListResponse(
        items=formations,
        total=total,
        page=page,
        page_size=page_size
    )


@router.get("/formations/{formation_id}", response_model=FormationResponse)
async def get_formation(
    formation_id: str,
    user: Annotated[TokenData, Depends(get_current_user)],
    service: Annotated[FormationService, Depends(get_formation_service)],
):
    """Get a formation by ID."""
    formation = await service.get_formation(user.tenant_id, formation_id)
    if not formation:
        raise NotFoundError("Formation not found")
    return formation


@router.post("/formations/{formation_id}/activate", response_model=FormationResponse)
async def activate_formation(
    formation_id: str,
    user: Annotated[TokenData, Depends(get_current_user)],
    service: Annotated[FormationService, Depends(get_formation_service)],
):
    """Activate a formation."""
    formation = await service.activate_formation(user.tenant_id, formation_id, user.user_id)
    if not formation:
        raise NotFoundError("Formation not found")
    return formation


@router.put("/formations/{formation_id}", response_model=FormationResponse)
async def update_formation(
    formation_id: str,
    update_data: FormationUpdate,
    user: Annotated[TokenData, Depends(get_current_user)],
    service: Annotated[FormationService, Depends(get_formation_service)],
):
    """Update a formation."""
    formation = await service.get_formation(user.tenant_id, formation_id)
    if not formation:
        raise NotFoundError("Formation not found")
    
    update_fields = update_data.model_dump(exclude_unset=True)
    for field, value in update_fields.items():
        if hasattr(formation, field):
            setattr(formation, field, value)
    
    return formation


@router.post("/operations", response_model=OperationResponse, status_code=201)
async def create_operation(
    operation_data: OperationCreate,
    user: Annotated[TokenData, Depends(get_current_user)],
    service: Annotated[OperationService, Depends(get_operation_service)],
):
    """Create a new operation."""
    return await service.create_operation(user.tenant_id, user.user_id, operation_data)


@router.get("/operations", response_model=OperationListResponse)
async def list_operations(
    user: Annotated[TokenData, Depends(get_current_user)],
    service: Annotated[OperationService, Depends(get_operation_service)],
    status: Optional[str] = None,
    operation_type: Optional[str] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
):
    """List operations."""
    operations, total = await service.list_operations(
        user.tenant_id, status, operation_type, page, page_size
    )
    return OperationListResponse(
        items=operations,
        total=total,
        page=page,
        page_size=page_size
    )


@router.get("/operations/{operation_id}", response_model=OperationDetailResponse)
async def get_operation(
    operation_id: str,
    user: Annotated[TokenData, Depends(get_current_user)],
    service: Annotated[OperationService, Depends(get_operation_service)],
):
    """Get an operation by ID."""
    operation = await service.get_operation(user.tenant_id, operation_id)
    if not operation:
        raise NotFoundError("Operation not found")
    return operation


@router.post("/operations/{operation_id}/dispatch", response_model=OperationDispatchResponse)
async def dispatch_operation(
    operation_id: str,
    request: OperationDispatchRequest,
    user: Annotated[TokenData, Depends(get_current_user)],
    service: Annotated[OperationService, Depends(get_operation_service)],
):
    """Dispatch an operation."""
    return await service.dispatch_operation(user.tenant_id, request, user.user_id)


@router.put("/operations/{operation_id}/status", response_model=OperationResponse)
async def update_operation_status(
    operation_id: str,
    status: str,
    user: Annotated[TokenData, Depends(get_current_user)],
    service: Annotated[OperationService, Depends(get_operation_service)],
):
    """Update operation status."""
    from app.schemas.operations import OperationStatus
    try:
        status_enum = OperationStatus(status)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid status")
    
    operation = await service.update_operation_status(
        user.tenant_id, operation_id, user.user_id, status_enum
    )
    if not operation:
        raise NotFoundError("Operation not found")
    return operation


@router.post("/collisions/detect", response_model=List[CollisionAlertResponse])
async def detect_collisions(
    entity_ids: List[str],
    user: Annotated[TokenData, Depends(get_current_user)],
    service: Annotated[CollisionDetectionService, Depends(get_collision_detection_service)],
):
    """Detect potential collisions between entities."""
    alerts = await service.detect_collisions(user.tenant_id, entity_ids)
    return alerts


@router.post("/collisions/avoidance", response_model=AvoidanceManeuverResponse)
async def generate_avoidance_maneuver(
    request: AvoidanceManeuverRequest,
    user: Annotated[TokenData, Depends(get_current_user)],
    service: Annotated[CollisionDetectionService, Depends(get_collision_detection_service)],
):
    """Generate an avoidance maneuver for a potential collision."""
    response = await service.generate_avoidance_maneuver(user.tenant_id, request)
    if not response:
        raise HTTPException(status_code=400, detail="Could not generate avoidance maneuver")
    return response


@router.get("/collisions/active", response_model=CollisionAlertListResponse)
async def get_active_collisions(
    user: Annotated[TokenData, Depends(get_current_user)],
    service: Annotated[CollisionDetectionService, Depends(get_collision_detection_service)],
):
    """Get active collision alerts."""
    from app.db.models.operations import CollisionAlert
    from sqlalchemy import select, and_
    
    async with service.db as db:
        result = await db.execute(
            select(CollisionAlert)
            .where(
                and_(
                    CollisionAlert.tenant_id == user.tenant_id,
                    CollisionAlert.status == "active"
                )
            )
            .order_by(CollisionAlert.detection_time.desc())
        )
        alerts = result.scalars().all()
        active_count = sum(1 for a in alerts if a.risk_level in ["high", "critical"])
        
        return CollisionAlertListResponse(
            items=alerts,
            total=len(alerts),
            active_count=active_count
        )


@router.post("/positions", response_model=PositionReportResponse, status_code=201)
async def report_position(
    report: PositionReportCreate,
    user: Annotated[TokenData, Depends(get_current_user)],
    service: Annotated[PositionTrackingService, Depends(get_position_tracking_service)],
):
    """Record a position report."""
    return await service.report_position(user.tenant_id, user.user_id, report)


@router.get("/positions/{entity_id}/latest")
async def get_latest_position(
    entity_id: str,
    user: Annotated[TokenData, Depends(get_current_user)],
    service: Annotated[PositionTrackingService, Depends(get_position_tracking_service)],
):
    """Get the latest position for an entity."""
    report = await service.get_latest_position(user.tenant_id, entity_id)
    if not report:
        raise NotFoundError("No position data found")
    return report


@router.get("/positions/{entity_id}/history")
async def get_position_history(
    entity_id: str,
    start_time: datetime,
    end_time: datetime,
    user: Annotated[TokenData, Depends(get_current_user)],
    service: Annotated[PositionTrackingService, Depends(get_position_tracking_service)],
):
    """Get position history for an entity."""
    reports = await service.get_position_history(user.tenant_id, entity_id, start_time, end_time)
    return {"items": reports, "total": len(reports)}


@router.get("/positions/ground-vehicles", response_model=PositionReportListResponse)
async def get_all_ground_vehicles(
    user: Annotated[TokenData, Depends(get_current_user)],
    service: Annotated[PositionTrackingService, Depends(get_position_tracking_service)],
):
    """Get the latest position for all ground vehicles."""
    vehicles = await service.get_all_ground_vehicles(user.tenant_id)
    return {"items": vehicles, "total": len(vehicles)}


@router.post("/communications", response_model=CommunicationWindowResponse, status_code=201)
async def create_communication_window(
    window_data: CommunicationWindowCreate,
    user: Annotated[TokenData, Depends(get_current_user)],
    service: Annotated[CommunicationService, Depends(get_communication_service)],
):
    """Create a communication window."""
    return await service.create_window(user.tenant_id, user.user_id, window_data)


@router.get("/communications/{entity_id}/available")
async def get_available_communications(
    entity_id: str,
    start_time: datetime,
    end_time: datetime,
    user: Annotated[TokenData, Depends(get_current_user)],
    service: Annotated[CommunicationService, Depends(get_communication_service)],
):
    """Get available communication windows for an entity."""
    windows = await service.get_available_windows(user.tenant_id, entity_id, start_time, end_time)
    return {"items": windows, "total": len(windows)}
