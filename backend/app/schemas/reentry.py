"""Schemas for reentry tracking and prediction."""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Optional

from pydantic import Field

from app.schemas.common import BaseSchema


class RiskLevel(str, Enum):
    LOW = "low"
    MODERATE = "moderate"
    HIGH = "high"
    CRITICAL = "critical"


class ObjectType(str, Enum):
    PAYLOAD = "payload"
    ROCKET_BODY = "rocket-body"
    DEBRIS = "debris"
    UNKNOWN = "unknown"


class ReentryPrediction(BaseSchema):
    norad_id: int
    name: str
    object_type: str
    predicted_epoch: str
    window_hours: float
    latitude_range: Optional[list[float]] = None
    longitude_range: Optional[list[float]] = None
    risk_level: str
    countdown_seconds: float
    source: str = "celestrak"


class ReentryHistory(BaseSchema):
    norad_id: int
    name: str
    object_type: str
    actual_epoch: str
    was_controlled: bool
    country: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
