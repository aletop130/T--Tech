"""Schemas for fleet risk accumulation."""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import Field

from app.schemas.common import BaseSchema


class RiskSnapshot(BaseSchema):
    satellite_id: str
    risk_score: float
    timestamp: float
    components: dict[str, float] = Field(default_factory=dict)


class FleetRiskCurrent(BaseSchema):
    """Current risk snapshot for all satellites in the fleet."""
    satellites: list[RiskSnapshot]
    computed_at: float


class SatelliteRiskTimeline(BaseSchema):
    """Risk timeline for a single satellite."""
    satellite_id: str
    satellite_name: str
    snapshots: list[RiskSnapshot]
    current_risk: float = 0.0
