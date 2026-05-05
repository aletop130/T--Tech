"""Traffic schemas for aircraft and vessel tracking."""
from datetime import datetime
from typing import Optional

from app.schemas.common import BaseSchema


class AircraftPosition(BaseSchema):
    icao24: str
    callsign: Optional[str] = None
    latitude: float
    longitude: float
    altitude_m: float
    heading_deg: Optional[float] = None
    speed_ms: Optional[float] = None
    vertical_rate: Optional[float] = None
    on_ground: bool = False
    category: Optional[int] = None
    last_seen: datetime


class VesselPosition(BaseSchema):
    mmsi: int
    name: Optional[str] = None
    ship_type: Optional[int] = None
    latitude: float
    longitude: float
    heading_deg: Optional[float] = None
    speed_knots: Optional[float] = None
    course: Optional[float] = None
    destination: Optional[str] = None
    last_seen: datetime


class TrafficAreaPreset(BaseSchema):
    key: str
    label: str
    bbox: Optional[dict] = None


class TrafficFetchRequest(BaseSchema):
    bbox: Optional[dict] = None
    preset: Optional[str] = None
