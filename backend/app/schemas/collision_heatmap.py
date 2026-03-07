"""Collision Risk Heatmap schemas."""
from datetime import datetime
from typing import Optional

from pydantic import Field

from app.schemas.common import BaseSchema


class CollisionHeatmapBand(BaseSchema):
    """Aggregated collision risk for an altitude band."""
    altitude_min_km: float
    altitude_max_km: float
    event_count: int = 0
    risk_score: float = Field(0.0, ge=0, le=100)


class ConjunctionPair(BaseSchema):
    """Individual conjunction pair from SOCRATES data."""
    sat1_name: str
    sat1_norad: int
    sat2_name: str
    sat2_norad: int
    min_range_km: float
    tca: Optional[datetime] = None
    relative_velocity_km_s: Optional[float] = None
    max_probability: Optional[float] = None
    altitude_km: Optional[float] = None


class CollisionHeatmapResponse(BaseSchema):
    """Response with heatmap bands and metadata."""
    bands: list[CollisionHeatmapBand]
    total_events: int
    last_updated: datetime


class CollisionEventsResponse(BaseSchema):
    """Paginated conjunction events response."""
    items: list[ConjunctionPair]
    total: int
    page: int = 1
    page_size: int = 50
