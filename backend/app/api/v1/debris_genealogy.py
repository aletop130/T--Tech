"""Debris Genealogy API endpoints."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.services.debris_genealogy import DebrisGenealogyService
from app.schemas.debris_genealogy import (
    FragmentationEvent,
    FragmentationEventDetail,
    DebrisLineage,
)

router = APIRouter()

_service = DebrisGenealogyService()


@router.get("/events", response_model=list[FragmentationEvent])
async def list_fragmentation_events():
    """Return all known fragmentation events."""
    return _service.list_events()


@router.get("/event/{event_id}", response_model=FragmentationEventDetail)
async def get_fragmentation_event(event_id: str):
    """Return a fragmentation event with its fragment list."""
    result = await _service.get_event_fragments(event_id)
    if not result:
        raise HTTPException(status_code=404, detail=f"Event '{event_id}' not found")
    return result


@router.get("/object/{norad_id}/lineage", response_model=DebrisLineage)
async def get_object_lineage(norad_id: int):
    """Trace a debris object back to its parent fragmentation event."""
    result = await _service.get_object_lineage(norad_id)
    if not result:
        raise HTTPException(status_code=404, detail=f"Object {norad_id} not found")
    return result
