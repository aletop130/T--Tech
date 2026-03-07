"""Maneuver Detection API endpoints."""

from __future__ import annotations

from typing import List

from fastapi import APIRouter, Query
from pydantic import BaseModel, Field

from app.services.maneuver_detection import get_maneuver_detection_service

router = APIRouter()


class AnalyzeRequest(BaseModel):
    norad_ids: List[int] = Field(description="NORAD catalog IDs to analyze")


@router.get("/recent")
async def get_recent_maneuvers(
    limit: int = Query(default=50, ge=1, le=200),
):
    """Get recently detected maneuvers across all tracked satellites."""
    service = get_maneuver_detection_service()
    return await service.get_recent_maneuvers(limit=limit)


@router.get("/satellite/{norad_id}/history")
async def get_satellite_maneuver_history(
    norad_id: int,
):
    """Get maneuver history for a specific satellite."""
    service = get_maneuver_detection_service()
    return await service.get_satellite_history(norad_id)


@router.post("/analyze")
async def analyze_satellites(
    request: AnalyzeRequest,
):
    """Trigger maneuver analysis for a specific set of satellites."""
    service = get_maneuver_detection_service()
    return await service.analyze_satellites(request.norad_ids)
