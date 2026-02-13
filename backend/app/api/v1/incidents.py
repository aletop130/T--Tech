"""Incidents API endpoints."""
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, Query, Path

from app.api.deps import get_current_user, get_incident_service
from app.core.security import TokenData
from app.core.exceptions import NotFoundError
from app.services.incidents import IncidentService
from app.schemas.common import PaginatedResponse
from app.schemas.incidents import (
    IncidentCreate,
    IncidentUpdate,
    IncidentResponse,
    IncidentDetail,
    IncidentStatusUpdate,
    IncidentAssignment,
    CommentCreate,
    CommentResponse,
    IncidentStats,
)

router = APIRouter()


@router.get("", response_model=PaginatedResponse[IncidentResponse])
async def list_incidents(
    user: Annotated[TokenData, Depends(get_current_user)],
    service: Annotated[IncidentService, Depends(get_incident_service)],
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    status: Optional[str] = Query(None),
    severity: Optional[str] = Query(None),
    incident_type: Optional[str] = Query(None),
    assigned_to: Optional[str] = Query(None),
):
    """List incidents with filters."""
    incidents, total = await service.list_incidents(
        tenant_id=user.tenant_id,
        status=status,
        severity=severity,
        incident_type=incident_type,
        assigned_to=assigned_to,
        page=page,
        page_size=page_size,
    )
    
    return PaginatedResponse(
        items=incidents,
        total=total,
        page=page,
        page_size=page_size,
        pages=(total + page_size - 1) // page_size,
    )


@router.post("", response_model=IncidentResponse, status_code=201)
async def create_incident(
    data: IncidentCreate,
    user: Annotated[TokenData, Depends(get_current_user)],
    service: Annotated[IncidentService, Depends(get_incident_service)],
):
    """Create a new incident."""
    return await service.create_incident(
        data=data,
        tenant_id=user.tenant_id,
        user_id=user.sub,
    )


@router.get("/stats", response_model=IncidentStats)
async def get_incident_stats(
    user: Annotated[TokenData, Depends(get_current_user)],
    service: Annotated[IncidentService, Depends(get_incident_service)],
):
    """Get incident statistics."""
    return await service.get_stats(user.tenant_id)


@router.get("/cyber", response_model=PaginatedResponse[IncidentResponse])
async def list_cyber_incidents(
    user: Annotated[TokenData, Depends(get_current_user)],
    service: Annotated[IncidentService, Depends(get_incident_service)],
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    severity: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
):
    """List cyber attack incidents."""
    incidents, total = await service.list_incidents(
        tenant_id=user.tenant_id,
        incident_type="cyber",
        severity=severity,
        status=status,
        page=page,
        page_size=page_size,
    )
    
    return PaginatedResponse(
        items=incidents,
        total=total,
        page=page,
        page_size=page_size,
        pages=(total + page_size - 1) // page_size,
    )


@router.get("/maneuvers", response_model=PaginatedResponse[IncidentResponse])
async def list_maneuver_incidents(
    user: Annotated[TokenData, Depends(get_current_user)],
    service: Annotated[IncidentService, Depends(get_incident_service)],
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    severity: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
):
    """List maneuver detection incidents (proximity-related)."""
    incidents, total = await service.list_incidents(
        tenant_id=user.tenant_id,
        incident_type="proximity",
        severity=severity,
        status=status,
        page=page,
        page_size=page_size,
    )
    
    return PaginatedResponse(
        items=incidents,
        total=total,
        page=page,
        page_size=page_size,
        pages=(total + page_size - 1) // page_size,
    )


@router.get("/{incident_id}", response_model=IncidentDetail)
async def get_incident(
    incident_id: Annotated[str, Path()],
    user: Annotated[TokenData, Depends(get_current_user)],
    service: Annotated[IncidentService, Depends(get_incident_service)],
):
    """Get incident by ID with comments."""
    incident = await service.get_incident(incident_id, user.tenant_id)
    if not incident:
        raise NotFoundError("Incident", incident_id)
    return incident


@router.patch("/{incident_id}", response_model=IncidentResponse)
async def update_incident(
    incident_id: Annotated[str, Path()],
    data: IncidentUpdate,
    user: Annotated[TokenData, Depends(get_current_user)],
    service: Annotated[IncidentService, Depends(get_incident_service)],
):
    """Update an incident."""
    return await service.update_incident(
        incident_id=incident_id,
        data=data,
        tenant_id=user.tenant_id,
        user_id=user.sub,
    )


@router.post("/{incident_id}/status", response_model=IncidentResponse)
async def update_incident_status(
    incident_id: Annotated[str, Path()],
    data: IncidentStatusUpdate,
    user: Annotated[TokenData, Depends(get_current_user)],
    service: Annotated[IncidentService, Depends(get_incident_service)],
):
    """Update incident status."""
    return await service.update_status(
        incident_id=incident_id,
        data=data,
        tenant_id=user.tenant_id,
        user_id=user.sub,
    )


@router.post("/{incident_id}/assign", response_model=IncidentResponse)
async def assign_incident(
    incident_id: Annotated[str, Path()],
    data: IncidentAssignment,
    user: Annotated[TokenData, Depends(get_current_user)],
    service: Annotated[IncidentService, Depends(get_incident_service)],
):
    """Assign incident to user/team."""
    return await service.assign_incident(
        incident_id=incident_id,
        data=data,
        tenant_id=user.tenant_id,
        user_id=user.sub,
    )


@router.post(
    "/{incident_id}/comments",
    response_model=CommentResponse,
    status_code=201
)
async def add_comment(
    incident_id: Annotated[str, Path()],
    data: CommentCreate,
    user: Annotated[TokenData, Depends(get_current_user)],
    service: Annotated[IncidentService, Depends(get_incident_service)],
):
    """Add a comment to an incident."""
    return await service.add_comment(
        incident_id=incident_id,
        data=data,
        tenant_id=user.tenant_id,
        user_id=user.sub,
    )
