"""Simulation schemas for interactive entity management."""
from datetime import datetime
from typing import Any, Literal, Optional

from pydantic import Field, BaseModel

from app.schemas.common import BaseSchema


FactionType = Literal["allied", "hostile", "neutral", "unknown"]


class SimulationSatelliteCreate(BaseSchema):
    """Schema for creating a satellite in simulation."""
    name: str = Field(..., max_length=100, description="Satellite name")
    norad_id: Optional[int] = Field(None, ge=1, description="NORAD ID (auto-generated if not provided)")
    altitude_km: float = Field(..., ge=160, le=40000, description="Orbital altitude in km")
    inclination_deg: float = Field(0, ge=0, le=180, description="Orbital inclination")
    raan_deg: float = Field(0, ge=0, lt=360, description="Right Ascension of Ascending Node")
    true_anomaly_deg: float = Field(0, ge=0, lt=360, description="True anomaly at epoch")
    faction: FactionType = Field("neutral", description="Faction affiliation")
    country: Optional[str] = Field(None, max_length=50)
    operator: Optional[str] = Field(None, max_length=100)
    description: Optional[str] = None


class SimulationGroundStationCreate(BaseModel):
    """Schema for creating a ground station in simulation."""
    name: str = Field(..., max_length=100, description="Station name")
    latitude: float = Field(..., ge=-90, le=90, description="Latitude in degrees")
    longitude: float = Field(..., ge=-180, le=180, description="Longitude in degrees")
    altitude_m: float = Field(0, ge=0, description="Altitude in meters")
    coverage_radius_km: float = Field(2000, ge=0, le=10000, description="Coverage radius in km")
    faction: FactionType = Field("neutral", description="Faction affiliation")
    country: Optional[str] = Field(None, max_length=50)
    organization: Optional[str] = Field(None, max_length=100)
    is_operational: bool = Field(True, description="Is station operational")


class SimulationVehicleCreate(BaseModel):
    """Schema for creating a vehicle in simulation."""
    name: str = Field(..., max_length=100, description="Vehicle name/callsign")
    entity_type: Literal["ground_vehicle", "aircraft", "ship"] = Field(
        "ground_vehicle", description="Type of vehicle"
    )
    latitude: float = Field(..., ge=-90, le=90, description="Latitude in degrees")
    longitude: float = Field(..., ge=-180, le=180, description="Longitude in degrees")
    altitude_m: float = Field(0, ge=0, description="Altitude in meters")
    heading_deg: float = Field(0, ge=0, lt=360, description="Heading in degrees")
    velocity_ms: float = Field(0, ge=0, description="Velocity in m/s")
    faction: FactionType = Field("neutral", description="Faction affiliation")


class SatelliteCoverageRequest(BaseModel):
    """Request to show/hide satellite coverage."""
    satellite_id: str = Field(..., description="Satellite UUID")
    show: bool = Field(True, description="Show or hide coverage")
    min_elevation_deg: float = Field(10.0, ge=0, le=90, description="Min elevation angle")


class CoverageAnalysisRequest(BaseModel):
    """Request for coverage analysis."""
    faction: Optional[FactionType] = Field(None, description="Filter by faction")
    region_bounds: Optional[tuple[float, float, float, float]] = Field(
        None, description="min_lat, max_lat, min_lon, max_lon"
    )
    grid_resolution_deg: float = Field(1.0, ge=0.1, le=10, description="Grid resolution")


class FootprintResponse(BaseSchema):
    """Satellite footprint calculation result."""
    satellite_id: str
    satellite_name: str
    altitude_km: float
    footprint_radius_km: float
    footprint_area_km2: float
    min_elevation_deg: float
    polygon: list[dict[str, float]]


class CoverageAnalysisResponse(BaseSchema):
    """Coverage analysis result."""
    faction: Optional[str]
    total_satellites: int
    total_grid_points: int
    covered_points: int
    coverage_percent: float
    overlap_points: int
    overlap_percent: float
    gap_points: int
    gap_percent: float
    footprints: list[FootprintResponse]


class SimulationEntityResponse(BaseSchema):
    """Response for created simulation entity."""
    id: str
    entity_type: str
    name: str
    faction: str
    created_at: datetime
    message: str


class SimulationActionResponse(BaseModel):
    """Response for simulation action to be sent to Cesium."""
    action_type: str
    payload: dict[str, Any]
    entity_id: Optional[str] = None
    message: Optional[str] = None
