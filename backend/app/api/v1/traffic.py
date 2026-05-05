"""Traffic API endpoints for aircraft and vessel tracking."""
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, Query
import redis.asyncio as aioredis

from app.api.deps import get_current_user
try:
    from app.core.security import TokenData
except ImportError:
    class TokenData:
        sub: str = ''
        tenant_id: str = ''
        roles: list[str] = []
from app.core.config import settings
from app.schemas.traffic import AircraftPosition, VesselPosition, TrafficAreaPreset
from app.services.aircraft import AircraftService, AREA_PRESETS as AIRCRAFT_PRESETS
from app.services.vessel import VesselService

router = APIRouter()

# Shared Redis connection and persistent VesselService singleton
_redis: aioredis.Redis | None = None
_vessel_svc: VesselService | None = None


async def _get_redis() -> aioredis.Redis:
    global _redis
    if _redis is None:
        _redis = aioredis.from_url(settings.REDIS_URL, decode_responses=False)
    return _redis


async def get_aircraft_service() -> AircraftService:
    r = await _get_redis()
    return AircraftService(r)


async def get_vessel_service() -> VesselService:
    """Return a singleton VesselService so the WebSocket task persists."""
    global _vessel_svc
    if _vessel_svc is None:
        r = await _get_redis()
        _vessel_svc = VesselService(r)
    return _vessel_svc


@router.get("/presets", response_model=list[TrafficAreaPreset])
async def get_presets(
    user: Annotated[TokenData, Depends(get_current_user)],
):
    """Get available area presets for traffic queries."""
    return [
        TrafficAreaPreset(key=k, label=v["label"], bbox=v["bbox"])
        for k, v in AIRCRAFT_PRESETS.items()
    ]


@router.get("/aircraft", response_model=list[AircraftPosition])
async def get_aircraft(
    user: Annotated[TokenData, Depends(get_current_user)],
    service: Annotated[AircraftService, Depends(get_aircraft_service)],
    preset: Optional[str] = Query(None, description="Area preset key"),
    lat_min: Optional[float] = Query(None),
    lat_max: Optional[float] = Query(None),
    lon_min: Optional[float] = Query(None),
    lon_max: Optional[float] = Query(None),
):
    """Get aircraft positions, from cache or live fetch."""
    if preset:
        bbox = service.resolve_bbox(preset)
    elif lat_min is not None and lat_max is not None and lon_min is not None and lon_max is not None:
        bbox = {"lat_min": lat_min, "lat_max": lat_max, "lon_min": lon_min, "lon_max": lon_max}
    else:
        bbox = None

    positions = await service.get_positions(bbox)
    return positions


@router.get("/vessels", response_model=list[VesselPosition])
async def get_vessels(
    user: Annotated[TokenData, Depends(get_current_user)],
    service: Annotated[VesselService, Depends(get_vessel_service)],
    preset: Optional[str] = Query(None, description="Area preset key"),
    lat_min: Optional[float] = Query(None),
    lat_max: Optional[float] = Query(None),
    lon_min: Optional[float] = Query(None),
    lon_max: Optional[float] = Query(None),
):
    """Get vessel positions from Redis cache."""
    if preset:
        bbox = service.resolve_bbox(preset)
    elif lat_min is not None and lat_max is not None and lon_min is not None and lon_max is not None:
        bbox = {"lat_min": lat_min, "lat_max": lat_max, "lon_min": lon_min, "lon_max": lon_max}
    else:
        bbox = None

    positions = await service.get_positions(bbox)
    return positions


@router.post("/aircraft/fetch")
async def fetch_aircraft(
    user: Annotated[TokenData, Depends(get_current_user)],
    service: Annotated[AircraftService, Depends(get_aircraft_service)],
    preset: Optional[str] = Query(None),
):
    """Trigger a live fetch from OpenSky for a specific area."""
    bbox = service.resolve_bbox(preset)
    positions = await service.fetch_positions(bbox)
    return {"count": len(positions), "preset": preset}


@router.post("/vessels/subscribe")
async def subscribe_vessels(
    user: Annotated[TokenData, Depends(get_current_user)],
    service: Annotated[VesselService, Depends(get_vessel_service)],
    preset: Optional[str] = Query(None),
):
    """Update AIS stream bounding box subscription."""
    bbox = service.resolve_bbox(preset)
    bbox_list = [bbox] if bbox else []
    await service.update_subscription(bbox_list)
    return {"ok": True, "preset": preset}
