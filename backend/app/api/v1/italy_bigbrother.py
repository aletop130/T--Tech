"""Italy Big Brother API — Satellite dependency mapping for Italy."""
from fastapi import APIRouter, HTTPException, Query

from app.services.italy_bigbrother import get_italy_bigbrother_service
from app.schemas.italy_bigbrother import (
    ItalyBigBrotherResponse, SatelliteDependencyDetail
)

router = APIRouter()


@router.get(
    "/satellites-over-italy",
    response_model=ItalyBigBrotherResponse,
    summary="Get all satellites currently over Italy with their Italian service dependencies",
)
async def get_satellites_over_italy(
    include_transmitters: bool = Query(False, description="Include SatNOGS transmitter data (slower)")
):
    """
    Returns real-time list of satellites currently passing over Italy,
    enriched with Italian civil and military service dependencies.

    Uses CelesTrak TLE data + SGP4 propagation + static Italy dependency database.
    """
    service = get_italy_bigbrother_service()
    return await service.get_satellites_over_italy(include_transmitters=include_transmitters)


@router.get(
    "/satellite/{norad_id}/dependencies",
    response_model=SatelliteDependencyDetail,
    summary="Get Italian service dependencies for a specific satellite by NORAD ID",
)
async def get_satellite_dependencies(norad_id: int):
    """
    Returns detailed Italian service dependency information for a specific satellite.
    Includes SatNOGS transmitter data and impact analysis.
    """
    service = get_italy_bigbrother_service()
    result = await service.get_satellite_dependency_detail(norad_id)
    if result is None:
        raise HTTPException(status_code=404, detail=f"No dependency data found for NORAD ID {norad_id}")
    return result


@router.get(
    "/dependency-database",
    summary="Get full Italy satellite service dependency database",
)
async def get_dependency_database():
    """
    Returns the complete static database of Italian satellite service dependencies,
    organized by satellite/constellation and service category.
    """
    service = get_italy_bigbrother_service()
    return await service.get_dependency_database()


@router.get(
    "/stats",
    summary="Get summary statistics for Italy satellite coverage",
)
async def get_italy_stats():
    """Quick stats endpoint — number of satellites, categories, total beneficiaries."""
    service = get_italy_bigbrother_service()
    result = await service.get_satellites_over_italy(include_transmitters=False)
    return result.stats
