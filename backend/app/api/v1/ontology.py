"""Ontology API endpoints."""
from datetime import datetime
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, Query, Path

from app.api.deps import (
    get_current_user,
    get_ontology_service,
)
from app.core.security import TokenData
from app.core.exceptions import NotFoundError
from app.services.ontology import OntologyService
from app.services.celestrack import CelesTrackService, get_celestrack_service, FAMOUS_SATELLITES
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

