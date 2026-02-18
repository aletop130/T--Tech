"""Ontology API endpoints."""
from datetime import datetime, timedelta
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, Query, Path, HTTPException

from app.api.deps import (
    get_current_user,
    get_ontology_service,
    get_debris_service,
    require_role,
)
from app.core.security import TokenData
from app.core.exceptions import NotFoundError
from app.services.ontology import OntologyService
from app.services.debris import DebrisService
from app.services.celestrack import CelesTrackService, get_celestrack_service, FAMOUS_SATELLITES, ALLIED_SATELLITES, ENEMY_SATELLITES
from app.services.debris_import import fetch_debris_tle, import_debris
from app.physics.propagator import propagate_tle
from app.schemas.common import PaginatedResponse
from app.schemas.ontology import (
    SatelliteCreate,
    SatelliteUpdate,
    SatelliteResponse,
    SatelliteDetail,
    OrbitCreate,
    OrbitResponse,
    GroundStationCreate,
    GroundStationUpdate,
    GroundStationResponse,
    SensorCreate,
    SensorResponse,
    SpaceWeatherEventCreate,
    SpaceWeatherEventResponse,
    ConjunctionEventResponse,
    ConjunctionEventDetail,
    RelationCreate,
    RelationResponse,
    CelestrackFetchRequest,
    CelestrackFetchResponse,
    CelestrackRefreshResponse,
    DebrisResponse,
    DebrisObject,
    DebrisOrbitInfo,
    OrbitPropagationResponse,
    GenerateDebrisRequest,
    GenerateDebrisResponse,
)

router = APIRouter()


# ============== Satellites ==============

@router.get("/satellites", response_model=PaginatedResponse[SatelliteResponse])
async def list_satellites(
    user: Annotated[TokenData, Depends(get_current_user)],
    service: Annotated[OntologyService, Depends(get_ontology_service)],
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    search: Optional[str] = Query(None),
    is_active: Optional[bool] = Query(None),
    object_type: Optional[str] = Query(None),
):
    """List satellites with filters."""
    satellites, total = await service.list_satellites(
        tenant_id=user.tenant_id,
        page=page,
        page_size=page_size,
        search=search,
        is_active=is_active,
        object_type=object_type,
    )
    
    return PaginatedResponse(
        items=satellites,
        total=total,
        page=page,
        page_size=page_size,
        pages=(total + page_size - 1) // page_size,
    )


@router.get("/satellites/with-orbits", response_model=list[SatelliteDetail])
async def list_satellites_with_orbits(
    user: Annotated[TokenData, Depends(get_current_user)],
    service: Annotated[OntologyService, Depends(get_ontology_service)],
):
    """List all satellites with their latest orbits including TLE data.
    
    Returns satellites with full orbit details for visualization.
    """
    satellites, _ = await service.list_satellites(
        tenant_id=user.tenant_id,
        page=1,
        page_size=1000,
        is_active=True,
    )
    
    result = []
    for sat in satellites:
        latest_orbit = await service.get_latest_orbit(sat.id, user.tenant_id)
        relations = await service.get_relations(
            tenant_id=user.tenant_id,
            source_type="satellite",
            source_id=sat.id,
        )
        
        result.append(SatelliteDetail(
            **SatelliteResponse.model_validate(sat).model_dump(),
            latest_orbit=(
                OrbitResponse.model_validate(latest_orbit)
                if latest_orbit else None
            ),
            relations=[
                RelationResponse.model_validate(r) for r in relations
            ],
        ))
    
    return result

# Phase 4 – FastAPI endpoint to import Celestrak debris
@router.post("/debris/fetch-celestrak", status_code=200)
async def fetch_debris_celestrak(
    user: Annotated[TokenData, Depends(require_role('admin'))],
):
    """Fetch and import Celestrak debris TLE data (admin‑only)."""
    tle_text = await fetch_debris_tle()
    imported = await import_debris(tle_text, tenant_id=user.tenant_id, user_id=user.sub)
    return {"status": "ok", "imported": imported}

# Debris endpoints


def _is_valid_tle(tle_line1: str, tle_line2: str) -> bool:
    """Validate TLE using sgp4 before computing positions.
    
    Returns False if the TLE has invalid parameters (e.g., decayed orbits).
    """
    from sgp4.api import Satrec
    try:
        sat = Satrec.twoline2rv(tle_line1.strip(), tle_line2.strip())
        return sat.error == 0
    except Exception:
        return False


@router.get("/debris", response_model=DebrisResponse)
async def get_debris(
    user: Annotated[TokenData, Depends(get_current_user)],
    service: Annotated[DebrisService, Depends(get_debris_service)],
    limit: int = Query(2500, ge=1),
    orbitClasses: str = Query("LEO"),
):
    """Retrieve debris objects for visualization."""
    # Fetch debris with orbits (ignoring orbitClasses for now)
    debris_with_orbits = await service.get_debris_with_orbits(user.tenant_id)
    # Limit results
    limited = debris_with_orbits[:limit]
    # Compute current time and skyfield timescale once for efficiency
    from skyfield.api import EarthSatellite, load
    ts = load.timescale()
    now = datetime.utcnow()
    t = ts.utc(now.year, now.month, now.day, now.hour, now.minute, now.second + now.microsecond / 1_000_000)
    objects = []
    for sat, orb in limited:
        lat, lon, alt_km = None, None, None
        
        # Synthetic debris: assign plausible random coordinates (no TLE propagation)
        if orb.source == "api_generated":
            import random
            lat = random.uniform(-90, 90)
            lon = random.uniform(-180, 180)
            alt_km = random.uniform(400, 2000)
        else:
            # Skip debris with invalid TLE (decayed orbits, etc.)
            if not _is_valid_tle(orb.tle_line1, orb.tle_line2):
                continue
            # Compute position from TLE at current time for real debris
            try:
                sat_ephem = EarthSatellite(orb.tle_line1, orb.tle_line2, name=str(sat.norad_id), ts=ts)
                subpoint = sat_ephem.at(t).subpoint()
                lat = subpoint.latitude.degrees
                lon = subpoint.longitude.degrees
                alt_km = subpoint.elevation.km
            except Exception:
                # If computation fails for any reason, skip this debris
                continue
        if lat is None:
            continue
        objects.append(DebrisObject(
            norad_id=sat.norad_id,
            lat=lat,
            lon=lon,
            alt_km=alt_km,
        ))
    return DebrisResponse(
        time_utc=datetime.utcnow(),
        objects=objects,
    )

@router.get("/debris/with-orbits", response_model=list[DebrisOrbitInfo])
async def get_debris_with_orbits(
    user: Annotated[TokenData, Depends(get_current_user)],
    service: Annotated[DebrisService, Depends(get_debris_service)],
    limit: int = Query(2500, ge=1),
    orbitClasses: str = Query("LEO"),
):
    """Retrieve debris objects with TLE data for detailed visualization."""
    debris_with_orbits = await service.get_debris_with_orbits(user.tenant_id)
    limited = debris_with_orbits[:limit]
    result = []
    # Compute current time and skyfield timescale once
    from skyfield.api import EarthSatellite, load
    ts = load.timescale()
    now = datetime.utcnow()
    t = ts.utc(now.year, now.month, now.day, now.hour, now.minute, now.second + now.microsecond / 1_000_000)
    for sat, orb in limited:
        # Skip debris with invalid TLE (decayed orbits, etc.)
        if not _is_valid_tle(orb.tle_line1, orb.tle_line2):
            continue
        # Compute position from TLE at current time
        try:
            sat_ephem = EarthSatellite(orb.tle_line1, orb.tle_line2, name=str(sat.norad_id), ts=ts)
            subpoint = sat_ephem.at(t).subpoint()
            lat = subpoint.latitude.degrees
            lon = subpoint.longitude.degrees
            alt_km = subpoint.elevation.km
        except Exception:
            continue
        result.append(DebrisOrbitInfo(
            norad_id=sat.norad_id,
            lat=lat,
            lon=lon,
            alt_km=alt_km,
            tle_line1=orb.tle_line1,
            tle_line2=orb.tle_line2,
        ))
    return result


@router.post("/debris/generate", response_model=GenerateDebrisResponse)
async def generate_debris(
    request: GenerateDebrisRequest,
    user: Annotated[TokenData, Depends(get_current_user)],
    service: Annotated[DebrisService, Depends(get_debris_service)],
):
    """Generate synthetic debris objects (not from Celestrak)."""
    try:
        created = await service.generate_synthetic_debris(
            tenant_id=user.tenant_id,
            count=request.count,
            user_id=user.sub,
        )
        return GenerateDebrisResponse(status="ok", created=created)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/orbit", response_model=OrbitPropagationResponse)
async def get_orbit(
    user: Annotated[TokenData, Depends(get_current_user)],
    service: Annotated[OntologyService, Depends(get_ontology_service)],
    norad: int = Query(..., description="NORAD ID"),
    minutes: int = Query(180, ge=1, description="Duration in minutes"),
    stepSec: int = Query(60, gt=0, description="Time step in seconds"),
):
    """Propagate orbit for a given NORAD ID."""
    # Retrieve satellite by NORAD ID
    sat = await service.get_satellite_by_norad(norad, user.tenant_id)
    if not sat:
        raise NotFoundError("Satellite", f"NORAD {norad}")

    # Retrieve latest orbit (TLE) for the satellite
    latest_orbit = await service.get_latest_orbit(sat.id, user.tenant_id)
    if not latest_orbit or not latest_orbit.tle_line1 or not latest_orbit.tle_line2:
        raise NotFoundError("Orbit", f"NORAD {norad}")

    # Prepare propagation using skyfield
    from skyfield.api import EarthSatellite, load

    ts = load.timescale()
    start = datetime.utcnow()
    total_seconds = minutes * 60
    timestamps: list[datetime] = []
    offset = 0
    while offset <= total_seconds:
        timestamps.append(start + timedelta(seconds=offset))
        offset += stepSec

    # Use physics engine to propagate TLE (ensures consistency)
    _ = propagate_tle(latest_orbit.tle_line1, latest_orbit.tle_line2, timestamps)

    sat_ephem = EarthSatellite(
        latest_orbit.tle_line1,
        latest_orbit.tle_line2,
        name=str(norad),
        ts=ts,
    )

    points = []
    for dt in timestamps:
        t = ts.utc(dt.year, dt.month, dt.day, dt.hour, dt.minute, dt.second + dt.microsecond / 1_000_000)
        subpoint = sat_ephem.at(t).subpoint()
        points.append({
            "tUtc": dt.isoformat() + "Z",
            "lat": subpoint.latitude.degrees,
            "lon": subpoint.longitude.degrees,
            "altKm": subpoint.elevation.km,
        })

    return {
        "noradId": norad,
        "timeStartUtc": start.isoformat() + "Z",
        "stepSec": stepSec,
        "points": points,
    }

@router.post("/satellites", response_model=SatelliteResponse, status_code=201)
async def create_satellite(
    data: SatelliteCreate,
    user: Annotated[TokenData, Depends(get_current_user)],
    service: Annotated[OntologyService, Depends(get_ontology_service)],
):
    """Create a new satellite."""
    return await service.create_satellite(
        data=data,
        tenant_id=user.tenant_id,
        user_id=user.sub,
    )


@router.get("/satellites/{satellite_id}", response_model=SatelliteDetail)
async def get_satellite(
    satellite_id: Annotated[str, Path()],
    user: Annotated[TokenData, Depends(get_current_user)],
    service: Annotated[OntologyService, Depends(get_ontology_service)],
):
    """Get satellite by ID with related data."""
    satellite = await service.get_satellite(satellite_id, user.tenant_id)
    if not satellite:
        raise NotFoundError("Satellite", satellite_id)
    
    # Get latest orbit
    latest_orbit = await service.get_latest_orbit(satellite_id, user.tenant_id)
    
    # Get relations
    relations = await service.get_relations(
        tenant_id=user.tenant_id,
        source_type="satellite",
        source_id=satellite_id,
    )
    
    return SatelliteDetail(
        **SatelliteResponse.model_validate(satellite).model_dump(),
        latest_orbit=(
            OrbitResponse.model_validate(latest_orbit)
            if latest_orbit else None
        ),
        relations=[
            RelationResponse.model_validate(r) for r in relations
        ],
    )


@router.patch("/satellites/{satellite_id}", response_model=SatelliteResponse)
async def update_satellite(
    satellite_id: Annotated[str, Path()],
    data: SatelliteUpdate,
    user: Annotated[TokenData, Depends(get_current_user)],
    service: Annotated[OntologyService, Depends(get_ontology_service)],
):
    """Update a satellite."""
    return await service.update_satellite(
        satellite_id=satellite_id,
        data=data,
        tenant_id=user.tenant_id,
        user_id=user.sub,
    )


@router.delete("/satellites/{satellite_id}", status_code=204)
async def delete_satellite(
    satellite_id: Annotated[str, Path()],
    user: Annotated[TokenData, Depends(get_current_user)],
    service: Annotated[OntologyService, Depends(get_ontology_service)],
):
    """Delete a satellite."""
    await service.delete_satellite(
        satellite_id=satellite_id,
        tenant_id=user.tenant_id,
        user_id=user.sub,
    )


# ============== Orbits ==============

@router.post("/orbits", response_model=OrbitResponse, status_code=201)
async def create_orbit(
    data: OrbitCreate,
    user: Annotated[TokenData, Depends(get_current_user)],
    service: Annotated[OntologyService, Depends(get_ontology_service)],
):
    """Create a new orbit record."""
    return await service.create_orbit(
        data=data,
        tenant_id=user.tenant_id,
        user_id=user.sub,
    )


# ============== Ground Stations ==============

@router.get(
    "/ground-stations",
    response_model=PaginatedResponse[GroundStationResponse]
)
async def list_ground_stations(
    user: Annotated[TokenData, Depends(get_current_user)],
    service: Annotated[OntologyService, Depends(get_ontology_service)],
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    is_operational: Optional[bool] = Query(None),
):
    """List ground stations."""
    stations, total = await service.list_ground_stations(
        tenant_id=user.tenant_id,
        page=page,
        page_size=page_size,
        is_operational=is_operational,
    )
    
    return PaginatedResponse(
        items=stations,
        total=total,
        page=page,
        page_size=page_size,
        pages=(total + page_size - 1) // page_size,
    )


@router.post(
    "/ground-stations",
    response_model=GroundStationResponse,
    status_code=201
)
async def create_ground_station(
    data: GroundStationCreate,
    user: Annotated[TokenData, Depends(get_current_user)],
    service: Annotated[OntologyService, Depends(get_ontology_service)],
):
    """Create a new ground station."""
    return await service.create_ground_station(
        data=data,
        tenant_id=user.tenant_id,
        user_id=user.sub,
    )


@router.get(
    "/ground-stations/{station_id}",
    response_model=GroundStationResponse
)
async def get_ground_station(
    station_id: Annotated[str, Path()],
    user: Annotated[TokenData, Depends(get_current_user)],
    service: Annotated[OntologyService, Depends(get_ontology_service)],
):
    """Get ground station by ID."""
    station = await service.get_ground_station(station_id, user.tenant_id)
    if not station:
        raise NotFoundError("GroundStation", station_id)
    return station


# ============== Sensors ==============

@router.get("/sensors", response_model=PaginatedResponse[SensorResponse])
async def list_sensors(
    user: Annotated[TokenData, Depends(get_current_user)],
    service: Annotated[OntologyService, Depends(get_ontology_service)],
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
):
    """List sensors."""
    sensors, total = await service.list_sensors(
        tenant_id=user.tenant_id,
        page=page,
        page_size=page_size,
    )
    
    return PaginatedResponse(
        items=sensors,
        total=total,
        page=page,
        page_size=page_size,
        pages=(total + page_size - 1) // page_size,
    )


@router.post("/sensors", response_model=SensorResponse, status_code=201)
async def create_sensor(
    data: SensorCreate,
    user: Annotated[TokenData, Depends(get_current_user)],
    service: Annotated[OntologyService, Depends(get_ontology_service)],
):
    """Create a new sensor."""
    return await service.create_sensor(
        data=data,
        tenant_id=user.tenant_id,
        user_id=user.sub,
    )


# ============== Space Weather Events ==============

@router.get(
    "/space-weather",
    response_model=PaginatedResponse[SpaceWeatherEventResponse]
)
async def list_space_weather_events(
    user: Annotated[TokenData, Depends(get_current_user)],
    service: Annotated[OntologyService, Depends(get_ontology_service)],
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    start_time: Optional[datetime] = Query(None),
    end_time: Optional[datetime] = Query(None),
    severity: Optional[str] = Query(None),
):
    """List space weather events."""
    events, total = await service.list_space_weather_events(
        tenant_id=user.tenant_id,
        start_time=start_time,
        end_time=end_time,
        severity=severity,
        page=page,
        page_size=page_size,
    )
    
    return PaginatedResponse(
        items=events,
        total=total,
        page=page,
        page_size=page_size,
        pages=(total + page_size - 1) // page_size,
    )


@router.post(
    "/space-weather",
    response_model=SpaceWeatherEventResponse,
    status_code=201
)
async def create_space_weather_event(
    data: SpaceWeatherEventCreate,
    user: Annotated[TokenData, Depends(get_current_user)],
    service: Annotated[OntologyService, Depends(get_ontology_service)],
):
    """Create a space weather event."""
    return await service.create_space_weather_event(
        data=data,
        tenant_id=user.tenant_id,
        user_id=user.sub,
    )


# ============== Conjunction Events ==============

@router.get(
    "/conjunctions",
    response_model=PaginatedResponse[ConjunctionEventResponse]
)
async def list_conjunction_events(
    user: Annotated[TokenData, Depends(get_current_user)],
    service: Annotated[OntologyService, Depends(get_ontology_service)],
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    start_time: Optional[datetime] = Query(None),
    end_time: Optional[datetime] = Query(None),
    risk_level: Optional[str] = Query(None),
    is_actionable: Optional[bool] = Query(None),
):
    """List conjunction events."""
    events, total = await service.list_conjunction_events(
        tenant_id=user.tenant_id,
        start_time=start_time,
        end_time=end_time,
        risk_level=risk_level,
        is_actionable=is_actionable,
        page=page,
        page_size=page_size,
    )
    
    return PaginatedResponse(
        items=events,
        total=total,
        page=page,
        page_size=page_size,
        pages=(total + page_size - 1) // page_size,
    )


@router.get(
    "/conjunctions/{event_id}",
    response_model=ConjunctionEventDetail
)
async def get_conjunction_event(
    event_id: Annotated[str, Path()],
    user: Annotated[TokenData, Depends(get_current_user)],
    service: Annotated[OntologyService, Depends(get_ontology_service)],
):
    """Get conjunction event by ID with related objects."""
    event = await service.get_conjunction_event(event_id, user.tenant_id)
    if not event:
        raise NotFoundError("ConjunctionEvent", event_id)
    return event


# ============== Relations ==============

@router.post("/relations", response_model=RelationResponse, status_code=201)
async def create_relation(
    data: RelationCreate,
    user: Annotated[TokenData, Depends(get_current_user)],
    service: Annotated[OntologyService, Depends(get_ontology_service)],
):
    """Create a relation between objects."""
    return await service.create_relation(
        data=data,
        tenant_id=user.tenant_id,
        user_id=user.sub,
    )


@router.get("/relations", response_model=list[RelationResponse])
async def list_relations(
    user: Annotated[TokenData, Depends(get_current_user)],
    service: Annotated[OntologyService, Depends(get_ontology_service)],
    source_type: Optional[str] = Query(None),
    source_id: Optional[str] = Query(None),
    target_type: Optional[str] = Query(None),
    target_id: Optional[str] = Query(None),
    relation_type: Optional[str] = Query(None),
):
    """List relations with filters."""
    return await service.get_relations(
        tenant_id=user.tenant_id,
        source_type=source_type,
        source_id=source_id,
        target_type=target_type,
        target_id=target_id,
        relation_type=relation_type,
    )


# ============== CelesTrack Integration ==============

@router.post(
    "/satellites/fetch-celestrack",
    response_model=CelestrackFetchResponse,
    status_code=201
)
async def fetch_from_celestrack(
    data: CelestrackFetchRequest,
    user: Annotated[TokenData, Depends(get_current_user)],
):
    """Fetch satellites from CelesTrack and store in database.
    
    Receives array of NORAD IDs, downloads TLE from CelesTrack,
    creates or updates satellites and orbits in the database.
    """
    celestrack = get_celestrack_service()
    
    try:
        result = await celestrack.fetch_and_store_satellites(
            norad_ids=data.norad_ids,
            tenant_id=user.tenant_id,
            user_id=user.sub,
        )
        
        return CelestrackFetchResponse(
            success=result.get("success", False),
            message=f"Created {result.get('satellites_created', 0)}, updated {result.get('satellites_updated', 0)} satellites",
            satellites_created=result.get("satellites_created", 0),
            satellites_updated=result.get("satellites_updated", 0),
            satellite_ids=result.get("satellite_ids", []),
            errors=result.get("errors", []),
        )
    finally:
        await celestrack.close()


@router.post(
    "/satellites/fetch-famous",
    response_model=CelestrackFetchResponse,
    status_code=201
)
async def fetch_famous_satellites(
    user: Annotated[TokenData, Depends(get_current_user)],
):
    """Fetch the 10 famous satellites from CelesTrack.
    
    Predefined list: ISS, Hubble, Landsat 5, TESS, Tiangong-1, 
    Aeolus, Starlink-1007, NOAA-15, GPS BIIR-2, Cartosat-2F
    """
    celestrack = get_celestrack_service()
    
    try:
        norad_ids = list(FAMOUS_SATELLITES.keys())
        result = await celestrack.fetch_and_store_satellites(
            norad_ids=norad_ids,
            tenant_id=user.tenant_id,
            user_id=user.sub,
        )
        
        return CelestrackFetchResponse(
            success=result.get("success", False),
            message=f"Famous satellites: created {result.get('satellites_created', 0)}, updated {result.get('satellites_updated', 0)}",
            satellites_created=result.get("satellites_created", 0),
            satellites_updated=result.get("satellites_updated", 0),
            satellite_ids=result.get("satellite_ids", []),
            errors=result.get("errors", []),
        )
    finally:
        await celestrack.close()


@router.post(
    "/satellites/fetch-allied",
    response_model=CelestrackFetchResponse,
    status_code=201
)
async def fetch_allied_satellites(
    user: Annotated[TokenData, Depends(get_current_user)],
):
    """Fetch allied (friendly) satellites from CelesTrack.
    
    Allied satellites are displayed as BLUE on the map.
    Mock names: Guardian Station Alpha, DeepWatch One, TerraScan-1, etc.
    """
    celestrack = get_celestrack_service()
    
    try:
        result = await celestrack.fetch_and_store_allied_satellites(
            tenant_id=user.tenant_id,
            user_id=user.sub,
        )
        
        return CelestrackFetchResponse(
            success=result.get("success", False),
            message=f"Allied satellites: created {result.get('satellites_created', 0)}, updated {result.get('satellites_updated', 0)}",
            satellites_created=result.get("satellites_created", 0),
            satellites_updated=result.get("satellites_updated", 0),
            satellite_ids=result.get("satellite_ids", []),
            errors=result.get("errors", []),
        )
    finally:
        await celestrack.close()


@router.post(
    "/satellites/hide-allied",
    response_model=dict,
    status_code=200
)
async def hide_allied_satellites(
    user: Annotated[TokenData, Depends(get_current_user)],
    service: Annotated[OntologyService, Depends(get_ontology_service)],
):
    """Mark all allied satellites as hidden/inactive.
    
    Allied satellites are those with mock names: Guardian Station Alpha, DeepWatch One, etc.
    """
    ally_names = [
        'guardian', 'deepwatch', 'terrascan', 'starfinder', 'celestial',
        'windwatcher', 'commlink', 'weathereye', 'navbeacon', 'eyeinsky'
    ]
    
    satellites, _ = await service.list_satellites(
        tenant_id=user.tenant_id,
        page=1,
        page_size=1000,
    )
    
    hidden_count = 0
    for sat in satellites:
        sat_name_lower = sat.name.lower() if sat.name else ''
        if any(name in sat_name_lower for name in ally_names):
            from app.schemas.ontology import SatelliteUpdate
            sat_update = SatelliteUpdate(is_active=False)
            await service.update_satellite(sat.id, sat_update, user.tenant_id, user.sub)
            hidden_count += 1
    
    return {
        "success": True,
        "message": f"Hid {hidden_count} allied satellites",
        "hidden_count": hidden_count,
    }


@router.post(
    "/satellites/hide-enemy",
    response_model=dict,
    status_code=200
)
async def hide_enemy_satellites(
    user: Annotated[TokenData, Depends(get_current_user)],
    service: Annotated[OntologyService, Depends(get_ontology_service)],
):
    """Mark all enemy satellites as hidden/inactive.
    
    Enemy satellites are those with code names: UNKNOWN-ALPHA, HOSTILE-NAV-1, etc.
    """
    enemy_patterns = [
        'unknown', 'hostile', 'suspect', 'tracked', 'unidentified', 'contact'
    ]
    
    satellites, _ = await service.list_satellites(
        tenant_id=user.tenant_id,
        page=1,
        page_size=1000,
    )
    
    hidden_count = 0
    for sat in satellites:
        sat_name_lower = sat.name.lower() if sat.name else ''
        if any(pattern in sat_name_lower for pattern in enemy_patterns):
            from app.schemas.ontology import SatelliteUpdate
            sat_update = SatelliteUpdate(is_active=False)
            await service.update_satellite(sat.id, sat_update, user.tenant_id, user.sub)
            hidden_count += 1
    
    return {
        "success": True,
        "message": f"Hid {hidden_count} enemy satellites",
        "hidden_count": hidden_count,
    }


@router.post(
    "/satellites/show-allied",
    response_model=dict,
    status_code=200
)
async def show_allied_satellites(
    user: Annotated[TokenData, Depends(get_current_user)],
    service: Annotated[OntologyService, Depends(get_ontology_service)],
):
    """Mark all allied satellites as active/visible."""
    ally_names = [
        'guardian', 'deepwatch', 'terrascan', 'starfinder', 'celestial',
        'windwatcher', 'commlink', 'weathereye', 'navbeacon', 'eyeinsky'
    ]
    
    satellites, _ = await service.list_satellites(
        tenant_id=user.tenant_id,
        page=1,
        page_size=1000,
    )
    
    shown_count = 0
    for sat in satellites:
        sat_name_lower = sat.name.lower() if sat.name else ''
        if any(name in sat_name_lower for name in ally_names):
            from app.schemas.ontology import SatelliteUpdate
            sat_update = SatelliteUpdate(is_active=True)
            await service.update_satellite(sat.id, sat_update, user.tenant_id, user.sub)
            shown_count += 1
    
    return {
        "success": True,
        "message": f"Showing {shown_count} allied satellites",
        "shown_count": shown_count,
    }


@router.post(
    "/satellites/show-enemy",
    response_model=dict,
    status_code=200
)
async def show_enemy_satellites(
    user: Annotated[TokenData, Depends(get_current_user)],
    service: Annotated[OntologyService, Depends(get_ontology_service)],
):
    """Mark all enemy satellites as active/visible."""
    enemy_patterns = [
        'unknown', 'hostile', 'suspect', 'tracked', 'unidentified', 'contact'
    ]
    
    satellites, _ = await service.list_satellites(
        tenant_id=user.tenant_id,
        page=1,
        page_size=1000,
    )
    
    shown_count = 0
    for sat in satellites:
        sat_name_lower = sat.name.lower() if sat.name else ''
        if any(pattern in sat_name_lower for pattern in enemy_patterns):
            from app.schemas.ontology import SatelliteUpdate
            sat_update = SatelliteUpdate(is_active=True)
            await service.update_satellite(sat.id, sat_update, user.tenant_id, user.sub)
            shown_count += 1
    
    return {
        "success": True,
        "message": f"Showing {shown_count} enemy satellites",
        "shown_count": shown_count,
    }


@router.post(
    "/satellites/fetch-enemy",
    response_model=CelestrackFetchResponse,
    status_code=201
)
async def fetch_enemy_satellites(
    user: Annotated[TokenData, Depends(get_current_user)],
):
    """Fetch enemy (hostile/unknown) satellites from CelesTrack.
    
    Enemy satellites are displayed as RED on the map.
    Data sourced from CelesTrak (celestrak.org) - Real NORAD Catalog IDs.
    Code names: UNKNOWN-ALPHA, HOSTILE-NAV-1, SUSPECT-COM-1, etc.
    """
    celestrack = get_celestrack_service()
    
    try:
        result = await celestrack.fetch_and_store_enemy_satellites(
            tenant_id=user.tenant_id,
            user_id=user.sub,
        )
        
        return CelestrackFetchResponse(
            success=result.get("success", False),
            message=f"Enemy satellites: created {result.get('satellites_created', 0)}, updated {result.get('satellites_updated', 0)}",
            satellites_created=result.get("satellites_created", 0),
            satellites_updated=result.get("satellites_updated", 0),
            satellite_ids=result.get("satellite_ids", []),
            errors=result.get("errors", []),
        )
    finally:
        await celestrack.close()


@router.post(
    "/satellites/{satellite_id}/refresh-tle",
    response_model=CelestrackRefreshResponse
)
async def refresh_satellite_tle(
    satellite_id: Annotated[str, Path()],
    user: Annotated[TokenData, Depends(get_current_user)],
):
    """Refresh TLE for a specific satellite from CelesTrack.
    
    Downloads the latest TLE and creates a new orbit record.
    """
    celestrack = get_celestrack_service()
    
    try:
        result = await celestrack.refresh_satellite_tle(
            satellite_id=satellite_id,
            tenant_id=user.tenant_id,
            user_id=user.sub,
        )
        
        return CelestrackRefreshResponse(
            success=result.get("success", False),
            message=result.get("message", ""),
            satellite_id=result.get("satellite_id"),
            norad_id=result.get("norad_id"),
            orbit_id=result.get("orbit_id"),
            epoch=result.get("epoch"),
        )
    finally:
        await celestrack.close()



# ============== Ground Station and Sensor Endpoints ==============

@router.get("/ground-stations", response_model=PaginatedResponse[GroundStationResponse])
async def list_ground_stations(
    user: Annotated[TokenData, Depends(get_current_user)],
    service: Annotated[OntologyService, Depends(get_ontology_service)],
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    is_operational: Optional[bool] = Query(None),
):
    """List ground stations."""
    stations, total = await service.list_ground_stations(
        tenant_id=user.tenant_id,
        page=page,
        page_size=page_size,
        is_operational=is_operational,
    )
    
    return PaginatedResponse(
        items=stations,
        total=total,
        page=page,
        page_size=page_size,
        pages=(total + page_size - 1) // page_size,
    )


@router.get("/sensors", response_model=PaginatedResponse[SensorResponse])
async def list_sensors(
    user: Annotated[TokenData, Depends(get_current_user)],
    service: Annotated[OntologyService, Depends(get_ontology_service)],
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    sensor_type: Optional[str] = Query(None),
):
    """List sensors."""
    sensors, total = await service.list_sensors(
        tenant_id=user.tenant_id,
        page=page,
        page_size=page_size,
    )
    
    return PaginatedResponse(
        items=sensors,
        total=total,
        page=page,
        page_size=page_size,
        pages=(total + page_size - 1) // page_size,
    )


# ============== Connection Endpoints ==============

class ConnectionDetail(SatelliteDetail):
    """Satellite with connections."""
    connections: list[dict]


@router.get("/satellites/connections", response_model=list[dict])
async def get_satellite_connections(
    user: Annotated[TokenData, Depends(get_current_user)],
    service: Annotated[OntologyService, Depends(get_ontology_service)],
    satellite_id: Optional[str] = Query(None),
):
    """Get satellite connections."""
    return await service.calculate_satellite_connections(
        tenant_id=user.tenant_id,
        satellite_id=satellite_id,
    )


@router.post("/satellites/connections/refresh")
async def refresh_connections(
    user: Annotated[TokenData, Depends(get_current_user)],
    service: Annotated[OntologyService, Depends(get_ontology_service)],
):
    """Refresh satellite connections."""
    connections = await service.calculate_satellite_connections(
        tenant_id=user.tenant_id,
    )
    
    return {
        "success": True,
        "message": f"Calculated {len(connections)} connections",
        "connections_count": len(connections),
    }
