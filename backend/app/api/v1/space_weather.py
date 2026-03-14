"""Space weather API endpoints."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.base import get_db
from app.schemas.space_weather import (
    SatelliteWeatherAnalysis,
    SpaceWeatherCurrent,
    SpaceWeatherImpact,
)
from app.services.space_weather import SpaceWeatherService

router = APIRouter()


async def get_service(
    db: Annotated[AsyncSession, Depends(get_db)],
) -> SpaceWeatherService:
    return SpaceWeatherService(db)


@router.get("/current", response_model=SpaceWeatherCurrent)
async def get_current_conditions(
    service: Annotated[SpaceWeatherService, Depends(get_service)],
):
    """Current space weather conditions (Kp, F10.7, storm level)."""
    return await service.get_current_conditions()


@router.get("/impact")
async def get_space_weather_impact(
    service: Annotated[SpaceWeatherService, Depends(get_service)],
):
    """Space weather impact assessment with affected LEO satellites and Kp trend."""
    return await service.get_impact()


@router.get("/satellite/{norad_id}", response_model=SatelliteWeatherAnalysis)
async def get_satellite_weather_analysis(
    norad_id: int,
    service: Annotated[SpaceWeatherService, Depends(get_service)],
):
    """Space weather impact analysis for a specific satellite."""
    try:
        return await service.analyze_satellite(norad_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
