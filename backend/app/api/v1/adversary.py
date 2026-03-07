"""Adversary satellite tracking API endpoints."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.base import get_db
from app.api.deps import get_tenant_id
from app.services.adversary_tracking import AdversaryTrackingService
from app.schemas.adversary import AdversaryChatRequest

router = APIRouter()


async def get_adversary_service(
    db: Annotated[AsyncSession, Depends(get_db)],
) -> AdversaryTrackingService:
    return AdversaryTrackingService(db)


@router.get("/catalog")
async def get_adversary_catalog(
    tenant_id: Annotated[str, Depends(get_tenant_id)],
    service: Annotated[AdversaryTrackingService, Depends(get_adversary_service)],
):
    """Get catalog of all adversary/hostile satellites."""
    return await service.get_catalog(tenant_id)


@router.get("/{satellite_id}/intelligence")
async def get_adversary_intelligence(
    satellite_id: str,
    tenant_id: Annotated[str, Depends(get_tenant_id)],
    service: Annotated[AdversaryTrackingService, Depends(get_adversary_service)],
):
    """Get intelligence report for a specific adversary satellite."""
    return await service.get_intelligence(tenant_id, satellite_id)


@router.post("/{satellite_id}/chat")
async def chat_about_adversary(
    satellite_id: str,
    body: AdversaryChatRequest,
    tenant_id: Annotated[str, Depends(get_tenant_id)],
    service: Annotated[AdversaryTrackingService, Depends(get_adversary_service)],
):
    """AI-powered research chat about a specific adversary satellite."""
    return await service.chat_about_satellite(tenant_id, satellite_id, body.message)
