"""Ground Track & Footprint API endpoints."""

from typing import Annotated

from fastapi import APIRouter, Depends, Query, Path

from app.api.deps import get_current_user, get_ontology_service
from app.core.security import TokenData
from app.core.exceptions import NotFoundError
from app.services.ontology import OntologyService
from app.services.ground_track import compute_ground_track, compute_sensor_footprint, compute_pass_predictions
from app.schemas.ground_track import GroundTrack, SensorFootprint, PassPredictions

router = APIRouter()


@router.get("/{norad_id}", response_model=GroundTrack)
async def get_ground_track(
    user: Annotated[TokenData, Depends(get_current_user)],
    service: Annotated[OntologyService, Depends(get_ontology_service)],
    norad_id: int = Path(..., description="NORAD catalog number"),
    duration_minutes: int = Query(90, ge=1, le=360, description="Track duration in minutes"),
    interval_seconds: int = Query(60, ge=10, le=600, description="Interval between points in seconds"),
):
    """Compute ground track (sub-satellite points) for a satellite."""
    sat = await service.get_satellite_by_norad(norad_id, user.tenant_id)
    if not sat:
        raise NotFoundError("Satellite", f"NORAD {norad_id}")

    latest_orbit = await service.get_latest_orbit(sat.id, user.tenant_id)
    if not latest_orbit or not latest_orbit.tle_line1 or not latest_orbit.tle_line2:
        raise NotFoundError("Orbit/TLE", f"NORAD {norad_id}")

    return compute_ground_track(
        norad_id=norad_id,
        satellite_name=sat.name,
        tle_line1=latest_orbit.tle_line1,
        tle_line2=latest_orbit.tle_line2,
        duration_minutes=duration_minutes,
        interval_seconds=interval_seconds,
    )


@router.get("/{norad_id}/footprint", response_model=SensorFootprint)
async def get_sensor_footprint(
    user: Annotated[TokenData, Depends(get_current_user)],
    service: Annotated[OntologyService, Depends(get_ontology_service)],
    norad_id: int = Path(..., description="NORAD catalog number"),
    fov_deg: float = Query(30.0, gt=0, le=180, description="Field of view angle in degrees"),
):
    """Get sensor footprint circle for the satellite's current position."""
    sat = await service.get_satellite_by_norad(norad_id, user.tenant_id)
    if not sat:
        raise NotFoundError("Satellite", f"NORAD {norad_id}")

    latest_orbit = await service.get_latest_orbit(sat.id, user.tenant_id)
    if not latest_orbit or not latest_orbit.tle_line1 or not latest_orbit.tle_line2:
        raise NotFoundError("Orbit/TLE", f"NORAD {norad_id}")

    return compute_sensor_footprint(
        norad_id=norad_id,
        tle_line1=latest_orbit.tle_line1,
        tle_line2=latest_orbit.tle_line2,
        fov_deg=fov_deg,
    )


@router.get("/{norad_id}/passes", response_model=PassPredictions)
async def get_pass_predictions(
    user: Annotated[TokenData, Depends(get_current_user)],
    service: Annotated[OntologyService, Depends(get_ontology_service)],
    norad_id: int = Path(..., description="NORAD catalog number"),
    lat: float = Query(..., ge=-90, le=90, description="Observer latitude"),
    lon: float = Query(..., ge=-180, le=180, description="Observer longitude"),
    hours: int = Query(24, ge=1, le=72, description="Prediction window in hours"),
):
    """Predict satellite passes over a ground location."""
    sat = await service.get_satellite_by_norad(norad_id, user.tenant_id)
    if not sat:
        raise NotFoundError("Satellite", f"NORAD {norad_id}")

    latest_orbit = await service.get_latest_orbit(sat.id, user.tenant_id)
    if not latest_orbit or not latest_orbit.tle_line1 or not latest_orbit.tle_line2:
        raise NotFoundError("Orbit/TLE", f"NORAD {norad_id}")

    return compute_pass_predictions(
        norad_id=norad_id,
        satellite_name=sat.name,
        tle_line1=latest_orbit.tle_line1,
        tle_line2=latest_orbit.tle_line2,
        observer_lat=lat,
        observer_lon=lon,
        hours=hours,
    )
