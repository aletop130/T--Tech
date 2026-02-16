"""Ontology Pydantic schemas."""
from datetime import datetime
from typing import Any, Optional

from pydantic import Field

from app.schemas.common import AuditSchema, BaseSchema
from app.db.models.ontology import (
    ObjectType,
    OrbitType,
    SensorType,
    LinkStatus,
    WeatherSeverity,
    ConjunctionRisk,
)


# ============== Satellite ==============

class SatelliteBase(BaseSchema):
    """Satellite base fields."""
    norad_id: int = Field(..., ge=1, description="NORAD catalog number")
    name: str = Field(..., max_length=100)
    international_designator: Optional[str] = Field(None, max_length=20)
    object_type: ObjectType = ObjectType.SATELLITE
    country: Optional[str] = Field(None, max_length=50)
    operator: Optional[str] = Field(None, max_length=100)
    is_active: bool = True
    launch_date: Optional[datetime] = None
    mass_kg: Optional[float] = Field(None, ge=0)
    rcs_m2: Optional[float] = Field(None, ge=0)
    classification: str = "unclassified"
    tags: list[str] = Field(default_factory=list)
    description: Optional[str] = None


class SatelliteCreate(SatelliteBase):
    """Schema for creating a satellite."""
    pass


class SatelliteUpdate(BaseSchema):
    """Schema for updating a satellite."""
    name: Optional[str] = Field(None, max_length=100)
    object_type: Optional[ObjectType] = None
    country: Optional[str] = Field(None, max_length=50)
    operator: Optional[str] = Field(None, max_length=100)
    is_active: Optional[bool] = None
    mass_kg: Optional[float] = Field(None, ge=0)
    rcs_m2: Optional[float] = Field(None, ge=0)
    classification: Optional[str] = None
    tags: Optional[list[str]] = None
    description: Optional[str] = None


class SatelliteResponse(SatelliteBase, AuditSchema):
    """Satellite response schema."""
    id: str
    decay_date: Optional[datetime] = None


class SatelliteDetail(SatelliteResponse):
    """Satellite with related data."""
    latest_orbit: Optional["OrbitResponse"] = None
    relations: list["RelationResponse"] = Field(default_factory=list)


# ============== Orbit ==============

class OrbitBase(BaseSchema):
    """Orbit base fields."""
    epoch: datetime
    semi_major_axis_km: Optional[float] = None
    eccentricity: Optional[float] = Field(None, ge=0, le=1)
    inclination_deg: Optional[float] = Field(None, ge=0, le=180)
    raan_deg: Optional[float] = Field(None, ge=0, lt=360)
    arg_perigee_deg: Optional[float] = Field(None, ge=0, lt=360)
    mean_anomaly_deg: Optional[float] = Field(None, ge=0, lt=360)
    mean_motion_rev_day: Optional[float] = None
    tle_line1: Optional[str] = Field(None, max_length=80)
    tle_line2: Optional[str] = Field(None, max_length=80)
    orbit_type: Optional[OrbitType] = None
    source: str = "tle"


class OrbitCreate(OrbitBase):
    """Schema for creating an orbit."""
    satellite_id: str


class OrbitResponse(OrbitBase, AuditSchema):
    """Orbit response schema."""
    id: str
    satellite_id: str
    period_minutes: Optional[float] = None
    apogee_km: Optional[float] = None
    perigee_km: Optional[float] = None


# ============== Ground Station ==============

class GroundStationBase(BaseSchema):
    """Ground station base fields."""
    name: str = Field(..., max_length=100)
    code: Optional[str] = Field(None, max_length=10)
    latitude: float = Field(..., ge=-90, le=90)
    longitude: float = Field(..., ge=-180, le=180)
    altitude_m: float = 0
    antenna_count: int = Field(1, ge=1)
    frequency_bands: list[str] = Field(default_factory=list)
    is_operational: bool = True
    status_message: Optional[str] = Field(None, max_length=200)
    organization: Optional[str] = Field(None, max_length=100)
    country: Optional[str] = Field(None, max_length=50)
    description: Optional[str] = None


class GroundStationCreate(GroundStationBase):
    """Schema for creating a ground station."""
    pass


class GroundStationUpdate(BaseSchema):
    """Schema for updating a ground station."""
    name: Optional[str] = Field(None, max_length=100)
    latitude: Optional[float] = Field(None, ge=-90, le=90)
    longitude: Optional[float] = Field(None, ge=-180, le=180)
    is_operational: Optional[bool] = None
    status_message: Optional[str] = Field(None, max_length=200)
    frequency_bands: Optional[list[str]] = None
    description: Optional[str] = None


class GroundStationResponse(GroundStationBase, AuditSchema):
    """Ground station response schema."""
    id: str


# ============== Sensor ==============

class SensorBase(BaseSchema):
    """Sensor base fields."""
    name: str = Field(..., max_length=100)
    sensor_type: SensorType
    latitude: Optional[float] = Field(None, ge=-90, le=90)
    longitude: Optional[float] = Field(None, ge=-180, le=180)
    altitude_m: Optional[float] = None
    min_elevation_deg: float = 10.0
    max_range_km: Optional[float] = None
    accuracy_m: Optional[float] = None
    fov_deg: Optional[float] = None
    is_operational: bool = True
    organization: Optional[str] = Field(None, max_length=100)
    country: Optional[str] = Field(None, max_length=50)
    ground_station_id: Optional[str] = None
    description: Optional[str] = None


class SensorCreate(SensorBase):
    """Schema for creating a sensor."""
    pass


class SensorResponse(SensorBase, AuditSchema):
    """Sensor response schema."""
    id: str


# ============== Space Weather ==============

class SpaceWeatherEventBase(BaseSchema):
    """Space weather event base fields."""
    event_type: str = Field(..., max_length=50)
    start_time: datetime
    peak_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    severity: WeatherSeverity
    kp_index: Optional[float] = Field(None, ge=0, le=9)
    dst_index: Optional[float] = None
    solar_wind_speed: Optional[float] = Field(None, ge=0)
    proton_flux: Optional[float] = None
    source: Optional[str] = Field(None, max_length=100)
    source_event_id: Optional[str] = Field(None, max_length=50)
    description: Optional[str] = None


class SpaceWeatherEventCreate(SpaceWeatherEventBase):
    """Schema for creating a space weather event."""
    pass


class SpaceWeatherEventResponse(SpaceWeatherEventBase, AuditSchema):
    """Space weather event response schema."""
    id: str
    gnss_impact_score: float = 0
    rf_impact_score: float = 0
    drag_impact_score: float = 0
    radiation_impact_score: float = 0


# ============== Conjunction Event ==============

# ============== Debris ==============

class DebrisObject(BaseSchema):
    """Debris object for visualization."""
    norad_id: int = Field(..., alias="noradId", description="NORAD catalog number")
    lat: float
    lon: float
    alt_km: float = Field(..., alias="altKm", description="Altitude in km")

class DebrisResponse(BaseSchema):
    """Response model for debris list."""
    time_utc: datetime = Field(..., alias="timeUtc")
    objects: list[DebrisObject] = Field(default_factory=list)

class DebrisOrbitInfo(BaseSchema):
    """Debris object with orbit TLE data for detailed visualization."""
    norad_id: int = Field(..., alias="noradId")
    lat: float = 0.0
    lon: float = 0.0
    alt_km: float = Field(..., alias="altKm")
    tle_line1: Optional[str] = None
    tle_line2: Optional[str] = None

# ============== Conjunction Event ==============

class ConjunctionEventBase(BaseSchema):
    """Conjunction event base fields."""
    primary_object_id: str
    secondary_object_id: str
    tca: datetime
    miss_distance_km: float = Field(..., ge=0)
    miss_distance_radial_km: Optional[float] = None
    miss_distance_intrack_km: Optional[float] = None
    miss_distance_crosstrack_km: Optional[float] = None
    collision_probability: Optional[float] = Field(None, ge=0, le=1)
    risk_level: ConjunctionRisk
    risk_score: Optional[float] = Field(None, ge=0, le=100)
    screening_volume_km: float = 10.0


class ConjunctionEventCreate(ConjunctionEventBase):
    """Schema for creating a conjunction event."""
    analysis_run_id: Optional[str] = None


class ConjunctionEventResponse(ConjunctionEventBase, AuditSchema):
    """Conjunction event response schema."""
    id: str
    is_actionable: bool = False
    maneuver_planned: bool = False
    ai_analysis: Optional[dict] = None


class ConjunctionEventDetail(ConjunctionEventResponse):
    """Conjunction event with related objects."""
    primary_object: Optional[SatelliteResponse] = None
    secondary_object: Optional[SatelliteResponse] = None


# ============== Relations ==============

class RelationBase(BaseSchema):
    """Object relation base fields."""
    source_type: str
    source_id: str
    relation_type: str
    target_type: str
    target_id: str
    properties: dict[str, Any] = Field(default_factory=dict)
    valid_from: Optional[datetime] = None
    valid_to: Optional[datetime] = None


class RelationCreate(RelationBase):
    """Schema for creating a relation."""
    pass


class RelationResponse(RelationBase, AuditSchema):
    """Relation response schema."""
    id: str


# Forward references
SatelliteDetail.model_rebuild()


# ============== CelesTrack ==============

class CelestrackFetchRequest(BaseSchema):
    """Request to fetch satellites from CelesTrack."""
    norad_ids: list[int] = Field(..., min_length=1, max_length=100, description="List of NORAD IDs to fetch")


class CelestrackFetchResponse(BaseSchema):
    """Response from CelesTrack fetch operation."""
    success: bool
    message: str = ""
    satellites_created: int = 0
    satellites_updated: int = 0
    satellite_ids: list[str] = Field(default_factory=list)
    errors: list[str] = Field(default_factory=list)


class CelestrackRefreshResponse(BaseSchema):
    """Response from TLE refresh operation."""
    success: bool
    message: str
    satellite_id: Optional[str] = None
    norad_id: Optional[int] = None
    orbit_id: Optional[str] = None
    epoch: Optional[str] = None

