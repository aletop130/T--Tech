"""Schemas for real-time space weather impact assessment."""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Optional

from pydantic import Field

from app.schemas.common import BaseSchema


class StormLevel(str, Enum):
    NONE = "none"
    MINOR = "minor"       # G1
    MODERATE = "moderate"  # G2
    STRONG = "strong"      # G3
    SEVERE = "severe"      # G4
    EXTREME = "extreme"    # G5


class AlertLevel(str, Enum):
    GREEN = "green"
    YELLOW = "yellow"
    ORANGE = "orange"
    RED = "red"


class SpaceWeatherCurrent(BaseSchema):
    """Current space weather conditions from NOAA SWPC."""
    kp_index: float = Field(..., ge=0, le=9, description="Planetary K-index (0-9)")
    f10_7: Optional[float] = Field(None, description="F10.7 solar radio flux (sfu)")
    solar_wind_speed: Optional[float] = Field(None, ge=0, description="Solar wind speed km/s")
    storm_level: StormLevel = StormLevel.NONE
    timestamp: datetime


class NOAAAlert(BaseSchema):
    """Active NOAA SWPC alert."""
    product_id: str
    issue_datetime: Optional[str] = None
    message: str


class DragImpactSatellite(BaseSchema):
    """A satellite at risk of increased atmospheric drag."""
    norad_id: int
    name: str
    altitude_km: float = Field(..., ge=0)
    estimated_drag_increase_pct: float = Field(
        ..., ge=0, description="Estimated drag increase percentage from elevated Kp"
    )


class SpaceWeatherImpact(BaseSchema):
    """Full space weather impact assessment."""
    current_conditions: SpaceWeatherCurrent
    affected_satellites: list[DragImpactSatellite] = Field(default_factory=list)
    alert_level: AlertLevel = AlertLevel.GREEN
    active_alerts: list[NOAAAlert] = Field(default_factory=list)
    total_affected: int = 0
