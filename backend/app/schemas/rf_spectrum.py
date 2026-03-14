"""RF Spectrum Awareness schemas."""
from typing import Optional

from pydantic import Field

from app.schemas.common import BaseSchema


class Transmitter(BaseSchema):
    """Single transmitter from SatNOGS."""
    uuid: str = ""
    norad_cat_id: Optional[int] = Field(None, description="NORAD catalog ID")
    description: str = ""
    alive: bool = True
    type: str = ""
    uplink_low: Optional[float] = Field(None, description="Uplink low freq in Hz")
    uplink_high: Optional[float] = Field(None, description="Uplink high freq in Hz")
    downlink_low: Optional[float] = Field(None, description="Downlink low freq in Hz")
    downlink_high: Optional[float] = Field(None, description="Downlink high freq in Hz")
    mode: Optional[str] = None
    baud: Optional[float] = None
    status: str = "active"
    band: str = ""


class BandSummary(BaseSchema):
    """Summary of a frequency band."""
    band_name: str
    frequency_range: str
    satellite_count: int = 0
    transmitter_count: int = 0


class SatelliteRFProfile(BaseSchema):
    """RF profile for a specific satellite."""
    norad_id: int
    satellite_name: str = ""
    transmitters: list[Transmitter] = Field(default_factory=list)


class TransmitterSearchResult(BaseSchema):
    """Search results for transmitter query."""
    transmitters: list[Transmitter] = Field(default_factory=list)
    total: int = 0
    band_filter: Optional[str] = None
    mode_filter: Optional[str] = None


# ============== Operational Dashboard Schemas ==============


class BandOperationalStatus(BaseSchema):
    """Operational status for a single frequency band."""
    band_name: str
    frequency_range: str
    status: str = Field(
        "operational",
        description="operational | degraded | blackout",
    )
    degradation_pct: float = Field(0.0, ge=0, le=100)
    reason: str = ""
    satellite_count: int = 0
    transmitter_count: int = 0
    vulnerability: str = Field(
        "none",
        description="ionospheric | scintillation | rain_fade | cme | none",
    )
    alternative_band: Optional[str] = Field(
        None, description="Suggested alternative band if degraded",
    )


class ScintillationRegion(BaseSchema):
    """S4 scintillation index for a geographic region."""
    region: str = Field(..., description="polar | equatorial | mid_latitude")
    s4_index: float = Field(0.0, ge=0, description="S4 scintillation index (0-1+)")
    severity: str = Field("none", description="none | weak | moderate | strong")
    affected_bands: list[str] = Field(default_factory=list)


class BandForecastPoint(BaseSchema):
    """Predicted band status at a future time."""
    hours_ahead: int
    status: str = Field("operational", description="operational | degraded | blackout")
    degradation_pct: float = Field(0.0, ge=0, le=100)
    confidence: float = Field(0.8, ge=0, le=1)


class BandForecast(BaseSchema):
    """12-hour availability forecast for a band."""
    band_name: str
    points: list[BandForecastPoint] = Field(default_factory=list)


class FrequencyAlternative(BaseSchema):
    """Suggested alternative when a band is degraded."""
    degraded_band: str
    alternative_band: str
    reason: str
    link_margin_impact: str = Field(
        "minimal",
        description="minimal | moderate | significant",
    )


class SpaceWeatherStrip(BaseSchema):
    """Compact space weather data for the RF panel."""
    kp_index: float = Field(0.0, ge=0, le=9)
    f10_7: Optional[float] = None
    xray_flux: Optional[float] = Field(None, description="X-ray flux W/m^2")
    xray_class: Optional[str] = Field(None, description="A | B | C | M | X")
    proton_flux: Optional[float] = Field(None, description=">10 MeV pfu")
    storm_level: str = "none"
    alert_level: str = "green"
    hf_blackout: bool = False
    polar_cap_absorption: bool = False
    timestamp: str = ""


class RFOperationalDashboard(BaseSchema):
    """Complete RF operational dashboard response."""
    space_weather: SpaceWeatherStrip
    band_status: list[BandOperationalStatus] = Field(default_factory=list)
    scintillation: list[ScintillationRegion] = Field(default_factory=list)
    forecasts: list[BandForecast] = Field(default_factory=list)
    alternatives: list[FrequencyAlternative] = Field(default_factory=list)
    overall_status: str = Field(
        "nominal",
        description="nominal | degraded | critical",
    )
