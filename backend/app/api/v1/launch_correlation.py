"""Launch correlation API endpoints."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.base import get_db
from app.api.deps import get_tenant_id
from app.services.launch_correlation import LaunchCorrelationService

router = APIRouter()


async def get_service(
    db: Annotated[AsyncSession, Depends(get_db)],
) -> LaunchCorrelationService:
    return LaunchCorrelationService(db)


@router.get("/recent")
async def get_recent_launches(
    tenant_id: Annotated[str, Depends(get_tenant_id)],
    service: Annotated[LaunchCorrelationService, Depends(get_service)],
):
    """Recent launches with correlated catalog objects."""
    return await service.get_recent_launches_correlated(tenant_id)


@router.get("/uncorrelated")
async def get_uncorrelated_objects(
    tenant_id: Annotated[str, Depends(get_tenant_id)],
    service: Annotated[LaunchCorrelationService, Depends(get_service)],
):
    """Catalog objects without a matched launch."""
    return await service.get_uncorrelated_objects(tenant_id)


@router.get("/launch/{launch_id}")
async def get_launch_detail(
    launch_id: str,
    tenant_id: Annotated[str, Depends(get_tenant_id)],
    service: Annotated[LaunchCorrelationService, Depends(get_service)],
):
    """Details of a specific launch with all associated objects."""
    return await service.get_launch_detail(tenant_id, launch_id)


@router.get("/upcoming")
async def get_upcoming_launches(
    service: Annotated[LaunchCorrelationService, Depends(get_service)],
):
    """Upcoming launches from Space Devs."""
    return await service.get_upcoming_launches()
