"""Collision Risk Heatmap API endpoints."""
from __future__ import annotations

from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Query

from app.services.collision_heatmap import fetch_socrates_data, aggregate_heatmap
from app.schemas.collision_heatmap import (
    CollisionHeatmapBand,
    CollisionHeatmapResponse,
    ConjunctionPair,
    CollisionEventsResponse,
)

router = APIRouter()


@router.get("", response_model=CollisionHeatmapResponse)
async def get_collision_heatmap():
    """Aggregated collision risk heatmap by altitude band."""
    pairs = await fetch_socrates_data()
    bands_raw = aggregate_heatmap(pairs)
    bands = [CollisionHeatmapBand(**b) for b in bands_raw]
    return CollisionHeatmapResponse(
        bands=bands,
        total_events=len(pairs),
        last_updated=datetime.utcnow(),
    )


@router.get("/events", response_model=CollisionEventsResponse)
async def get_collision_events(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    altitude_min: Optional[float] = Query(None, description="Filter by min altitude km"),
    altitude_max: Optional[float] = Query(None, description="Filter by max altitude km"),
):
    """Individual conjunction pairs with optional altitude filtering and pagination."""
    pairs = await fetch_socrates_data()

    # Filter by altitude band if specified
    if altitude_min is not None or altitude_max is not None:
        filtered = []
        for p in pairs:
            alt = p.get("altitude_km")
            if alt is None:
                continue
            if altitude_min is not None and alt < altitude_min:
                continue
            if altitude_max is not None and alt >= altitude_max:
                continue
            filtered.append(p)
        pairs = filtered

    total = len(pairs)
    start = (page - 1) * page_size
    end = start + page_size
    page_items = pairs[start:end]

    items = [ConjunctionPair(**p) for p in page_items]
    return CollisionEventsResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
    )
