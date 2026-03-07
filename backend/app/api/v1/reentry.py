"""Reentry tracking API endpoints."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.base import get_db
from app.api.deps import get_tenant_id
from app.services.reentry_tracker import ReentryTrackerService

router = APIRouter()


async def get_reentry_service(
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ReentryTrackerService:
    return ReentryTrackerService(db)


@router.get("/active")
async def get_active_reentries(
    tenant_id: Annotated[str, Depends(get_tenant_id)],
    service: Annotated[ReentryTrackerService, Depends(get_reentry_service)],
):
    """ReentryPrediction[] -- current reentry predictions."""
    return await service.get_active_predictions(tenant_id)


@router.get("/history")
async def get_reentry_history(
    service: Annotated[ReentryTrackerService, Depends(get_reentry_service)],
):
    """ReentryHistory[] -- past reentry events (last 90 days)."""
    return await service.get_history()
