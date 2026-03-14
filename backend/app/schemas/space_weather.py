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


class SolarWindData(BaseSchema):
    """Real-time solar wind parameters from DSCOVR/ACE."""
    speed_km_s: Optional[float] = Field(None, description="Solar wind speed km/s")
    density_n_cm3: Optional[float] = Field(None, description="Proton density n/cm³")
    bz_gsm_nt: Optional[float] = Field(None, description="IMF Bz GSM component nT")
    temperature_k: Optional[float] = Field(None, description="Plasma temperature K")


class ParsedAlert(BaseSchema):
    """Structured NOAA SWPC alert."""
    product_id: str
    alert_type: str = Field(..., description="ALERT, WARNING, or WATCH")
    title: str
    description: str
    noaa_scale: Optional[str] = None
    issued: Optional[str] = None
    valid_from: Optional[str] = None
    valid_to: Optional[str] = None
    serial: Optional[str] = None


class SpaceWeatherCurrent(BaseSchema):
    """Current space weather conditions from NOAA SWPC."""
    kp_index: float = Field(..., ge=0, le=9, description="Planetary K-index (0-9)")
    f10_7: Optional[float] = Field(None, description="F10.7 solar radio flux (sfu)")
    solar_wind_speed: Optional[float] = Field(None, ge=0, description="Solar wind speed km/s")
    storm_level: StormLevel = StormLevel.NONE
    timestamp: datetime
    xray_class: Optional[str] = Field(None, description="X-ray flux class (e.g. C1.2)")
    proton_flux_10mev: Optional[float] = Field(None, description="Proton flux >10 MeV p/cm²/s/sr")
    dst_index: Optional[float] = Field(None, description="Disturbance Storm Time index nT")


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
    solar_wind: Optional[SolarWindData] = None
    parsed_alerts: list[ParsedAlert] = Field(default_factory=list)


class SystemImpact(BaseSchema):
    """Impact on a specific system for a satellite."""
    system: str
    status: str
    detail: str
    color: str


class SatelliteWeatherAnalysis(BaseSchema):
    """Space weather impact analysis for a specific satellite."""
    norad_id: int
    name: str
    altitude_km: Optional[float] = None
    inclination_deg: Optional[float] = None
    orbit_type: Optional[str] = None
    # Drag
    drag_increase_pct: float = 0.0
    drag_risk: str = "none"
    projected_decay_m_day: Optional[float] = None
    # Per-system impacts
    impacts: list[SystemImpact] = Field(default_factory=list)
    # Overall
    vulnerability_score: float = 0.0
    vulnerability_level: str = "low"
    recommendations: list[str] = Field(default_factory=list)
    # Context
    current_kp: float = 0.0
    current_storm: str = "none"
