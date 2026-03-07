"""Schemas for the Maneuver Detection System."""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import List, Optional

from pydantic import Field

from app.schemas.common import BaseSchema


class ManeuverType(str, Enum):
    STATION_KEEPING = "station-keeping"
    ORBIT_RAISE = "orbit-raise"
    ORBIT_LOWER = "orbit-lower"
    PLANE_CHANGE = "plane-change"
    DEORBIT = "deorbit"
    UNKNOWN = "unknown"


class OrbitalSnapshot(BaseSchema):
    """Orbital elements at a single epoch."""
    epoch: str
    semi_major_axis_km: float
    eccentricity: float
    inclination_deg: float
    raan_deg: float
    arg_perigee_deg: float
    mean_anomaly_deg: float
    mean_motion_rev_day: float


class DetectedManeuver(BaseSchema):
    """A single detected maneuver event."""
    id: str
    norad_id: int
    satellite_name: str
    detection_time: str
    maneuver_type: ManeuverType
    delta_a_km: float = Field(description="Semi-major axis change in km")
    delta_i_deg: float = Field(description="Inclination change in degrees")
    delta_e: float = Field(description="Eccentricity change")
    estimated_delta_v_ms: float = Field(description="Estimated delta-v in m/s")
    confidence: float = Field(ge=0.0, le=1.0)
    before: Optional[OrbitalSnapshot] = None
    after: Optional[OrbitalSnapshot] = None


class ManeuverHistory(BaseSchema):
    """Maneuver history for a single satellite."""
    norad_id: int
    satellite_name: str
    maneuvers: List[DetectedManeuver]
    total: int


class RecentManeuversResponse(BaseSchema):
    """Response for recent maneuvers across all tracked satellites."""
    maneuvers: List[DetectedManeuver]
    total: int
    last_scan: Optional[str] = None


class AnalyzeRequest(BaseSchema):
    """Request body for triggering maneuver analysis on specific satellites."""
    norad_ids: List[int] = Field(description="NORAD catalog IDs to analyze")
