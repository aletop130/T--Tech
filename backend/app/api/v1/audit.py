"""Audit API endpoints."""
from typing import Annotated, Optional
from datetime import datetime

from fastapi import APIRouter, Depends, Query, Path

from app.api.deps import get_current_user, get_audit_service
from app.core.security import TokenData
from app.services.audit import AuditService
from app.schemas.common import PaginatedResponse
from app.schemas.audit import AuditEventResponse, AuditQuery

router = APIRouter()


@router.get("", response_model=PaginatedResponse[AuditEventResponse])
async def query_audit_events(
    user: Annotated[TokenData, Depends(get_current_user)],
    service: Annotated[AuditService, Depends(get_audit_service)],
    entity_type: Optional[str] = Query(None),
    entity_id: Optional[str] = Query(None),
    user_id: Optional[str] = Query(None),
    action: Optional[str] = Query(None),
    start_time: Optional[datetime] = Query(None),
    end_time: Optional[datetime] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
):
    """Query audit events with filters."""
    query = AuditQuery(
        entity_type=entity_type,
        entity_id=entity_id,
        user_id=user_id,
        action=action,
        start_time=start_time,
        end_time=end_time,
        page=page,
        page_size=page_size,
    )
    
    events, total = await service.query(
        tenant_id=user.tenant_id,
        query=query,
    )
    
    return PaginatedResponse(
        items=events,
        total=total,
        page=page,
        page_size=page_size,
        pages=(total + page_size - 1) // page_size,
    )


@router.get(
    "/entity/{entity_type}/{entity_id}",
    response_model=list[AuditEventResponse]
)
async def get_entity_audit_history(
    entity_type: Annotated[str, Path()],
    entity_id: Annotated[str, Path()],
    user: Annotated[TokenData, Depends(get_current_user)],
    service: Annotated[AuditService, Depends(get_audit_service)],
    limit: int = Query(100, ge=1, le=500),
):
    """Get audit history for a specific entity."""
    return await service.get_entity_history(
        tenant_id=user.tenant_id,
        entity_type=entity_type,
        entity_id=entity_id,
        limit=limit,
    )

