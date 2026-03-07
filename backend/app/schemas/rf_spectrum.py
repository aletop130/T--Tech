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
