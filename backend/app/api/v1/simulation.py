"""Simulation API endpoints for interactive entity management."""
from datetime import datetime
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, and_

from app.api.deps import get_current_user, get_ontology_service, get_db
from app.core.security import TokenData
from app.core.exceptions import NotFoundError
from app.core.logging import get_logger
from app.db.base import generate_uuid
from app.db.models.ontology import Satellite, Orbit, GroundStation, ObjectType
from app.db.models.operations import PositionReport
from app.services.ontology import OntologyService
from app.services.audit import AuditService
from app.services.operations import PositionTrackingService
from app.physics.footprint import (
    calculate_satellite_footprint,
    get_footprint_polygon,
    analyze_combined_coverage,
)
from app.schemas.simulation import (
    SimulationSatelliteCreate,
    SimulationGroundStationCreate,
    SimulationVehicleCreate,
    SatelliteCoverageRequest,
    CoverageAnalysisRequest,
    FootprintResponse,
    CoverageAnalysisResponse,
    SimulationEntityResponse,
    SimulationActionResponse,
)
from app.schemas.ontology import SatelliteCreate, OrbitCreate, GroundStationCreate

logger = get_logger(__name__)
router = APIRouter()


@router.post("/satellites", response_model=SimulationActionResponse)
async def add_simulation_satellite(
    data: SimulationSatelliteCreate,
    user: Annotated[TokenData, Depends(get_current_user)],
    ontology: Annotated[OntologyService, Depends(get_ontology_service)],
):
    """Add a satellite to the simulation with orbital parameters.
    
    Creates a satellite entity with an orbit based on provided parameters.
    Returns Cesium action for visualization.
    """
    norad_id = data.norad_id or hash(data.name) % 900000 + 100000
    
    satellite_create = SatelliteCreate(
        norad_id=norad_id,
        name=data.name,
        object_type=ObjectType.SATELLITE,
        country=data.country,
        operator=data.operator,
        is_active=True,
        description=data.description,
    )
    
    satellite = await ontology.create_satellite(
        satellite_create,
        tenant_id=user.tenant_id,
        user_id=user.user_id,
    )
    
    earth_radius_km = 6371.0
    semi_major_axis_km = earth_radius_km + data.altitude_km
    
    import math
    period_minutes = 2 * math.pi * math.sqrt((semi_major_axis_km * 1000) ** 3 / 3.986004418e14) / 60
    
    orbit_create = OrbitCreate(
        satellite_id=satellite.id,
        epoch=datetime.utcnow(),
        semi_major_axis_km=semi_major_axis_km,
        eccentricity=0.001,
        inclination_deg=data.inclination_deg,
        raan_deg=data.raan_deg,
        arg_perigee_deg=0,
        mean_anomaly_deg=data.true_anomaly_deg,
        period_minutes=period_minutes,
        apogee_km=data.altitude_km,
        perigee_km=data.altitude_km,
        source="simulation",
    )
    
    orbit = await ontology.create_orbit(
        orbit_create,
        tenant_id=user.tenant_id,
        user_id=user.user_id,
    )
    
    footprint = calculate_satellite_footprint(data.altitude_km)
    
    return SimulationActionResponse(
        action_type="simulation.addSatellite",
        entity_id=satellite.id,
        payload={
            "id": satellite.id,
            "entityId": f"satellite-{satellite.id}",
            "name": data.name,
            "norad_id": norad_id,
            "altitude_km": data.altitude_km,
            "inclination_deg": data.inclination_deg,
            "faction": data.faction,
            "semi_major_axis_km": semi_major_axis_km,
            "period_minutes": period_minutes,
            "footprint": {
                "radius_km": footprint.radius_km,
                "area_km2": footprint.area_km2,
            },
            "orbit": {
                "id": orbit.id,
                "inclination_deg": data.inclination_deg,
                "raan_deg": data.raan_deg,
            },
        },
        message=f"Satellite '{data.name}' added at {data.altitude_km}km altitude ({data.faction})",
    )


@router.post("/ground-stations", response_model=SimulationActionResponse)
async def add_simulation_ground_station(
    data: SimulationGroundStationCreate,
    user: Annotated[TokenData, Depends(get_current_user)],
    ontology: Annotated[OntologyService, Depends(get_ontology_service)],
):
    """Add a ground station to the simulation.
    
    Creates a ground station entity with coverage visualization.
    """
    station_create = GroundStationCreate(
        name=data.name,
        latitude=data.latitude,
        longitude=data.longitude,
        altitude_m=data.altitude_m,
        is_operational=data.is_operational,
        country=data.country,
        organization=data.organization,
    )
    
    station = await ontology.create_ground_station(
        station_create,
        tenant_id=user.tenant_id,
        user_id=user.user_id,
    )
    
    return SimulationActionResponse(
        action_type="simulation.addGroundStation",
        entity_id=station.id,
        payload={
            "id": station.id,
            "entityId": f"station-{station.id}",
            "name": data.name,
            "latitude": data.latitude,
            "longitude": data.longitude,
            "altitude_m": data.altitude_m,
            "coverage_radius_km": data.coverage_radius_km,
            "faction": data.faction,
            "is_operational": data.is_operational,
        },
        message=f"Ground station '{data.name}' added at ({data.latitude}, {data.longitude}) ({data.faction})",
    )


@router.post("/vehicles", response_model=SimulationActionResponse)
async def add_simulation_vehicle(
    data: SimulationVehicleCreate,
    user: Annotated[TokenData, Depends(get_current_user)],
    db = Depends(get_db),
):
    """Add a vehicle to the simulation.
    
    Creates a position report for the vehicle entity.
    """
    from app.schemas.operations import PositionReportCreate
    
    audit_service = AuditService(db)
    position_service = PositionTrackingService(db, audit_service)
    
    entity_id = f"{data.entity_type}-{generate_uuid()[:8]}"
    
    position_create = PositionReportCreate(
        entity_id=entity_id,
        entity_type=data.entity_type,
        latitude=data.latitude,
        longitude=data.longitude,
        altitude_m=data.altitude_m,
        heading_deg=data.heading_deg,
        velocity_magnitude_ms=data.velocity_ms,
        report_time=datetime.utcnow(),
        is_simulated=True,
    )
    
    report = await position_service.report_position(
        tenant_id=user.tenant_id,
        user_id=user.user_id,
        report=position_create,
    )
    
    return SimulationActionResponse(
        action_type="simulation.addVehicle",
        entity_id=entity_id,
        payload={
            "entity_id": entity_id,
            "name": data.name,
            "entity_type": data.entity_type,
            "latitude": data.latitude,
            "longitude": data.longitude,
            "altitude_m": data.altitude_m,
            "heading_deg": data.heading_deg,
            "velocity_ms": data.velocity_ms,
            "faction": data.faction,
        },
        message=f"Vehicle '{data.name}' ({data.entity_type}) added at ({data.latitude}, {data.longitude}) ({data.faction})",
    )


@router.post("/coverage/show", response_model=FootprintResponse)
async def show_satellite_coverage(
    data: SatelliteCoverageRequest,
    user: Annotated[TokenData, Depends(get_current_user)],
    ontology: Annotated[OntologyService, Depends(get_ontology_service)],
):
    """Calculate and return satellite footprint coverage.
    
    Returns the footprint polygon for visualization.
    """
    satellite = await ontology.get_satellite(data.satellite_id, user.tenant_id)
    
    if not satellite:
        raise HTTPException(status_code=404, detail="Satellite not found")
    
    latest_orbit = await ontology.get_latest_orbit(data.satellite_id, user.tenant_id)
    
    if not latest_orbit:
        raise HTTPException(status_code=404, detail="No orbit found for satellite")
    
    altitude_km = latest_orbit.apogee_km or (latest_orbit.semi_major_axis_km - 6371 if latest_orbit.semi_major_axis_km else 500)
    
    footprint = calculate_satellite_footprint(altitude_km, data.min_elevation_deg)
    
    polygon_points = get_footprint_polygon(0, 0, footprint.radius_km)
    
    return FootprintResponse(
        id=generate_uuid(),
        satellite_id=data.satellite_id,
        satellite_name=satellite.name,
        altitude_km=altitude_km,
        footprint_radius_km=footprint.radius_km,
        footprint_area_km2=footprint.area_km2,
        min_elevation_deg=data.min_elevation_deg,
        polygon=[{"lat": p.latitude, "lon": p.longitude} for p in polygon_points],
    )


@router.post("/coverage/analyze", response_model=CoverageAnalysisResponse)
async def analyze_coverage(
    data: CoverageAnalysisRequest,
    user: Annotated[TokenData, Depends(get_current_user)],
    ontology: Annotated[OntologyService, Depends(get_ontology_service)],
):
    """Analyze combined coverage from satellites.
    
    Calculates coverage gaps and overlaps for a faction or all satellites.
    """
    satellites, _ = await ontology.list_satellites(
        tenant_id=user.tenant_id,
        page_size=1000,
        is_active=True,
    )
    
    filtered_sats = satellites
    if data.faction:
        filtered_sats = [s for s in satellites if getattr(s, 'faction', None) == data.faction]
    
    sat_positions = []
    footprints = []
    
    for sat in filtered_sats:
        orbit = await ontology.get_latest_orbit(sat.id, user.tenant_id)
        if orbit and orbit.apogee_km:
            altitude_km = orbit.apogee_km
            footprint = calculate_satellite_footprint(altitude_km)
            sat_positions.append((0, 0, altitude_km))
            
            footprints.append(FootprintResponse(
                id=generate_uuid(),
                satellite_id=sat.id,
                satellite_name=sat.name,
                altitude_km=altitude_km,
                footprint_radius_km=footprint.radius_km,
                footprint_area_km2=footprint.area_km2,
                min_elevation_deg=10.0,
                polygon=[{"lat": 0, "lon": 0}],
            ))
    
    region_bounds = data.region_bounds or (-90, 90, -180, 180)
    
    if sat_positions:
        coverage_stats = analyze_combined_coverage(
            sat_positions,
            region_bounds,
            data.grid_resolution_deg,
        )
    else:
        coverage_stats = {
            "total_points": 0,
            "covered_points": 0,
            "coverage_percent": 0,
            "overlap_points": 0,
            "overlap_percent": 0,
            "gap_points": 0,
            "gap_percent": 100,
        }
    
    return CoverageAnalysisResponse(
        id=generate_uuid(),
        faction=data.faction,
        total_satellites=len(filtered_sats),
        total_grid_points=coverage_stats["total_points"],
        covered_points=coverage_stats["covered_points"],
        coverage_percent=coverage_stats["coverage_percent"],
        overlap_points=coverage_stats["overlap_points"],
        overlap_percent=coverage_stats["overlap_percent"],
        gap_points=coverage_stats["gap_points"],
        gap_percent=coverage_stats["gap_percent"],
        footprints=footprints,
    )


@router.delete("/entities/{entity_type}/{entity_id}")
async def remove_entity(
    entity_type: str,
    entity_id: str,
    user: Annotated[TokenData, Depends(get_current_user)],
    ontology: Annotated[OntologyService, Depends(get_ontology_service)],
    db = Depends(get_db),
):
    """Remove an entity from the simulation.
    
    Deletes the entity from the database.
    """
    if entity_type == "satellite":
        satellite = await ontology.get_satellite(entity_id, user.tenant_id)
        if not satellite:
            raise HTTPException(status_code=404, detail="Satellite not found")
        await ontology.delete_satellite(entity_id, user.tenant_id, user.user_id)
        
    elif entity_type == "ground_station":
        station = await ontology.get_ground_station(entity_id, user.tenant_id)
        if not station:
            raise HTTPException(status_code=404, detail="Ground station not found")
        await ontology.delete_ground_station(entity_id, user.tenant_id, user.user_id)
        
    elif entity_type in ("ground_vehicle", "aircraft", "ship"):
        from sqlalchemy import delete as sql_delete
        stmt = sql_delete(PositionReport).where(
            PositionReport.entity_id == entity_id,
            PositionReport.tenant_id == user.tenant_id,
        )
        await db.execute(stmt)
        await db.commit()
        
    else:
        raise HTTPException(status_code=400, detail=f"Unknown entity type: {entity_type}")
    
    return {
        "action_type": "simulation.removeEntity",
        "entity_id": entity_id,
        "entity_type": entity_type,
        "message": f"{entity_type} '{entity_id}' removed from simulation",
    }
