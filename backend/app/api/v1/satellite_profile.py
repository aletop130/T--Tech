"""Satellite profile API endpoint — fused OSINT data."""
from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.base import get_db
from app.schemas.satellite_profile import SatelliteProfile
from app.services.satellite_profile import SatelliteProfileService

router = APIRouter()


async def _get_service(
    db: Annotated[AsyncSession, Depends(get_db)],
) -> SatelliteProfileService:
    return SatelliteProfileService(db)


@router.get("/{norad_id}", response_model=SatelliteProfile)
async def get_satellite_profile(
    norad_id: int,
    service: Annotated[SatelliteProfileService, Depends(_get_service)],
):
    """Get a fused satellite profile from multiple OSINT sources."""
    return await service.get_profile(norad_id)
