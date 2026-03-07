"""Satellite profile schemas for fused OSINT data."""
from typing import Optional

from pydantic import Field

from app.schemas.common import BaseSchema


class TransmitterInfo(BaseSchema):
    """RF transmitter information from SatNOGS."""
    uuid: Optional[str] = None
    description: str = ""
    alive: bool = True
    uplink_low: Optional[float] = None
    uplink_high: Optional[float] = None
    downlink_low: Optional[float] = None
    downlink_high: Optional[float] = None
    mode: Optional[str] = None
    baud: Optional[float] = None
    type: Optional[str] = None
    service: Optional[str] = None
    status: Optional[str] = None


class OrbitInfo(BaseSchema):
    """Orbital parameters extracted from TLE/GP data."""
    epoch: Optional[str] = None
    inclination_deg: Optional[float] = None
    raan_deg: Optional[float] = None
    eccentricity: Optional[float] = None
    arg_perigee_deg: Optional[float] = None
    mean_anomaly_deg: Optional[float] = None
    mean_motion_rev_day: Optional[float] = None
    period_minutes: Optional[float] = None
    apogee_km: Optional[float] = None
    perigee_km: Optional[float] = None
    orbit_type: Optional[str] = None
    tle_line1: Optional[str] = None
    tle_line2: Optional[str] = None


class SatelliteProfile(BaseSchema):
    """Unified satellite profile fusing multiple OSINT sources."""
    norad_id: int = Field(..., description="NORAD catalog number")
    name: str = ""
    international_designator: Optional[str] = None
    country: Optional[str] = None
    operator: Optional[str] = None
    object_type: Optional[str] = None
    purpose: Optional[str] = None
    is_active: bool = True
    launch_date: Optional[str] = None
    mass_kg: Optional[float] = None
    rcs_m2: Optional[float] = None
    faction: Optional[str] = None

    orbit: Optional[OrbitInfo] = None
    transmitters: list[TransmitterInfo] = Field(default_factory=list)

    sources: list[str] = Field(default_factory=list, description="Data sources used")
