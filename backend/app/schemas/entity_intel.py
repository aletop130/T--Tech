"""Schemas for Entity Intelligence endpoints."""
from typing import Optional
from pydantic import BaseModel, Field


class EntityIntelBrief(BaseModel):
    """AI-generated intelligence brief for an entity."""
    entity_id: str
    entity_type: str
    summary: str
    threat_level: str = Field(description="low | medium | high | critical")
    capabilities: list[str] = []
    mission_profile: Optional[str] = None
    command_control: Optional[str] = None
    confidence: float = Field(default=0.5, ge=0.0, le=1.0)


class EntitySpecification(BaseModel):
    """A single specification entry."""
    key: str
    value: str
    unit: Optional[str] = None


class EntityLink(BaseModel):
    """A relationship between entities."""
    related_entity_id: str
    related_entity_name: str
    related_entity_type: str
    relationship: str


class EntityTimelineEntry(BaseModel):
    """A single event in entity's activity timeline."""
    timestamp: str
    event: str
    detail: Optional[str] = None
