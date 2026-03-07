"""Threat detection API endpoints."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.base import get_db
from app.api.deps import get_tenant_id
from app.services.threat_detection import ThreatDetectionService

router = APIRouter()


async def get_threat_service(
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ThreatDetectionService:
    return ThreatDetectionService(db)


@router.get("/proximity")
async def get_proximity_threats(
    tenant_id: Annotated[str, Depends(get_tenant_id)],
    service: Annotated[ThreatDetectionService, Depends(get_threat_service)],
):
    """ProximityThreat[] — foreign satellites approaching our assets."""
    return await service.detect_proximity_threats(tenant_id)


@router.get("/signal")
async def get_signal_threats(
    tenant_id: Annotated[str, Depends(get_tenant_id)],
    service: Annotated[ThreatDetectionService, Depends(get_threat_service)],
):
    """SignalThreat[] — communication link interception risks."""
    return await service.detect_signal_threats(tenant_id)


@router.get("/anomaly")
async def get_anomaly_threats(
    tenant_id: Annotated[str, Depends(get_tenant_id)],
    service: Annotated[ThreatDetectionService, Depends(get_threat_service)],
):
    """AnomalyThreat[] — anomalous satellite behavior."""
    return await service.detect_anomaly_threats(tenant_id)


@router.get("/orbital-similarity")
async def get_orbital_similarity_threats(
    tenant_id: Annotated[str, Depends(get_tenant_id)],
    service: Annotated[ThreatDetectionService, Depends(get_threat_service)],
):
    """OrbitalSimilarityThreat[] — co-orbital shadowing detection."""
    return await service.detect_orbital_similarity(tenant_id)


@router.get("/geo-us-loiter")
async def get_geo_us_loiter_threats(
    tenant_id: Annotated[str, Depends(get_tenant_id)],
    service: Annotated[ThreatDetectionService, Depends(get_threat_service)],
):
    """GeoLoiterThreat[] — adversarial satellites over US territory."""
    return await service.detect_geo_loiter(tenant_id)
