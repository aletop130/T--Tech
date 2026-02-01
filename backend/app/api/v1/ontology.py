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

