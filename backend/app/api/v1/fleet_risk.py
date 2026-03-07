"""Fleet risk API endpoints."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.base import get_db
from app.api.deps import get_tenant_id
from app.services.fleet_risk import FleetRiskService

router = APIRouter()


async def get_fleet_risk_service(
    db: Annotated[AsyncSession, Depends(get_db)],
) -> FleetRiskService:
    return FleetRiskService(db)


@router.get("/current")
async def get_fleet_risk_current(
    tenant_id: Annotated[str, Depends(get_tenant_id)],
    service: Annotated[FleetRiskService, Depends(get_fleet_risk_service)],
):
    """Current fleet risk snapshot for all satellites."""
    return await service.compute_current_risk(tenant_id)


@router.get("/timeline/{satellite_id}")
async def get_fleet_risk_timeline(
    satellite_id: str,
    tenant_id: Annotated[str, Depends(get_tenant_id)],
    service: Annotated[FleetRiskService, Depends(get_fleet_risk_service)],
):
    """Risk timeline for a specific satellite."""
    return await service.get_satellite_timeline(tenant_id, satellite_id)
