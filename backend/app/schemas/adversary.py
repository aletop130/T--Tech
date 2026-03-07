"""Schemas for adversary satellite tracking."""

from __future__ import annotations

from typing import Optional

from pydantic import Field

from app.schemas.common import BaseSchema


class AdversaryCatalogEntry(BaseSchema):
    satellite_id: str
    name: str
    norad_id: int
    country: str
    operator: Optional[str] = None
    object_type: str = "PAYLOAD"
    altitude_km: float = 0.0
    inclination_deg: float = 0.0
    faction: str = "hostile"
    tags: list[str] = Field(default_factory=list)


class IntelligenceReport(BaseSchema):
    satellite_id: str
    satellite_name: str
    country: str
    risk_assessment: str
    historical_precedents: list[str] = Field(default_factory=list)
    capabilities: list[str] = Field(default_factory=list)
    recent_maneuvers: list[str] = Field(default_factory=list)
    threat_level: str = "unknown"
    summary: str = ""


class AdversaryChatRequest(BaseSchema):
    message: str
    satellite_id: str


class AdversaryChatResponse(BaseSchema):
    reply: str
    satellite_id: str
