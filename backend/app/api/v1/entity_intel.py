"""Entity Intelligence API — briefs, specs, links, timeline."""
from fastapi import APIRouter, Query
from typing import Optional

from app.schemas.entity_intel import (
    EntityIntelBrief,
    EntitySpecification,
    EntityLink,
    EntityTimelineEntry,
)
from app.services.entity_intel import entity_intel_service

router = APIRouter()


@router.get("/{entity_type}/{entity_id}/brief", response_model=EntityIntelBrief)
async def get_entity_brief(
    entity_type: str,
    entity_id: str,
    name: str = Query("", description="Entity display name"),
    faction: str = Query("unknown", description="Entity faction"),
    subtype: str = Query("", description="Entity subtype"),
    lat: Optional[float] = Query(None),
    lon: Optional[float] = Query(None),
    alt_m: Optional[float] = Query(None),
    heading: Optional[float] = Query(None),
) -> EntityIntelBrief:
    """Generate an AI intelligence brief for any entity type."""
    position = None
    if lat is not None and lon is not None:
        position = {"lat": lat, "lon": lon, "alt_m": alt_m or 0}

    return await entity_intel_service.generate_brief(
        entity_type=entity_type,
        entity_id=entity_id,
        name=name,
        faction=faction,
        subtype=subtype,
        position=position,
        heading=heading,
    )


@router.get(
    "/{entity_type}/{entity_id}/specs",
    response_model=list[EntitySpecification],
)
async def get_entity_specs(
    entity_type: str,
    entity_id: str,
    subtype: str = Query("", description="Entity subtype"),
) -> list[EntitySpecification]:
    """Get technical specifications for an entity type."""
    return entity_intel_service.get_specifications(entity_type, subtype or None)


@router.get(
    "/{entity_type}/{entity_id}/links",
    response_model=list[EntityLink],
)
async def get_entity_links(
    entity_type: str,
    entity_id: str,
) -> list[EntityLink]:
    """Get related entities — currently returns empty (derived client-side for sandbox)."""
    return []


@router.get(
    "/{entity_type}/{entity_id}/timeline",
    response_model=list[EntityTimelineEntry],
)
async def get_entity_timeline(
    entity_type: str,
    entity_id: str,
) -> list[EntityTimelineEntry]:
    """Get activity timeline — currently returns empty (derived client-side for sandbox)."""
    return []
