"""Schemas for threat response decisions."""

from __future__ import annotations

from typing import Optional

from pydantic import Field

from app.schemas.common import BaseSchema


class ResponseOption(BaseSchema):
    action: str
    description: str
    risk_level: str
    confidence: float = Field(ge=0, le=1)
    delta_v_ms: float = 0.0
    time_to_execute_min: float = 0.0
    pros: list[str] = Field(default_factory=list)
    cons: list[str] = Field(default_factory=list)


class ThreatResponseDecision(BaseSchema):
    satellite_id: str
    satellite_name: str
    threat_satellite_id: str
    threat_satellite_name: str
    threat_summary: str = ""
    threat_score: float = 0.0
    risk_level: str = "medium"
    options_evaluated: list[ResponseOption] = Field(default_factory=list)
    recommended_action: str = ""
    recommended_action_index: int = 0
    reasoning: str = ""
    escalation_required: bool = False
    time_sensitivity: str = "medium"
    intelligence_summary: str = ""


class ThreatResponseRequest(BaseSchema):
    satellite_id: str
    satellite_name: str
    threat_satellite_id: str
    threat_satellite_name: str
    threat_score: float
    miss_distance_km: float = 0.0
    approach_pattern: str = "unknown"
    tca_minutes: int = 0
