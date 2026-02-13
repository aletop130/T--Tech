"""Proximity detection API endpoints."""
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db, get_current_user, get_audit_service, get_tenant_id
from app.core.security import TokenData
from app.services.proximity import ProximityDetectionService
from app.services.incidents import IncidentService
from app.services.audit import AuditService
from app.db.models.incidents import (
    ProximityAlertLevel,
    ProximityEventStatus,
)
from app.schemas.incidents import (
    ProximityEventResponse,
    ProximityEventListParams,
    ProximityDetectionConfig,
    ProximityDetectionResult,
    ProximityAlert,
    SatelliteInfo,
    Position3D,
)
from app.core.logging import get_logger

logger = get_logger(__name__)
router = APIRouter()


def get_proximity_service(
    db: AsyncSession = Depends(get_db),
    audit: AuditService = Depends(get_audit_service),
) -> ProximityDetectionService:
    """Get proximity detection service."""
    incident_service = IncidentService(db, audit)
    return ProximityDetectionService(db, audit, incident_service)


@router.post("/detect", response_model=ProximityDetectionResult)
async def run_proximity_detection(
    db: AsyncSession = Depends(get_db),
    audit: AuditService = Depends(get_audit_service),
    tenant_id: str = Depends(get_tenant_id),
    current_user: TokenData = Depends(get_current_user),
    satellite_ids: Optional[list[str]] = None,
) -> ProximityDetectionResult:
    """Run proximity detection for all or specific satellites."""
    service = get_proximity_service(db, audit)
    
    logger.info(
        "proximity_detection_api_called",
        tenant_id=tenant_id,
        user_id=current_user.user_id,
        satellite_count=len(satellite_ids) if satellite_ids else None,
    )
    
    result = await service.detect_proximity_events(
        tenant_id=tenant_id,
        satellite_ids=satellite_ids,
    )
    
    return result


@router.get("/events", response_model=list[ProximityEventResponse])
async def list_proximity_events(
    db: AsyncSession = Depends(get_db),
    audit: AuditService = Depends(get_audit_service),
    tenant_id: str = Depends(get_tenant_id),
    current_user: TokenData = Depends(get_current_user),
    alert_level: Optional[ProximityAlertLevel] = None,
    status: Optional[ProximityEventStatus] = None,
    is_hostile: Optional[bool] = None,
    satellite_id: Optional[str] = None,
    scenario_id: Optional[str] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
) -> list[ProximityEventResponse]:
    """List proximity events with optional filters."""
    service = get_proximity_service(db, audit)
    
    events, total = await service.list_proximity_events(
        tenant_id=tenant_id,
        alert_level=alert_level,
        status=status,
        is_hostile=is_hostile,
        satellite_id=satellite_id,
        scenario_id=scenario_id,
        page=page,
        page_size=page_size,
    )
    
    return [_event_to_response(event) for event in events]


@router.get("/events/{event_id}", response_model=ProximityEventResponse)
async def get_proximity_event(
    event_id: str,
    db: AsyncSession = Depends(get_db),
    audit: AuditService = Depends(get_audit_service),
    tenant_id: str = Depends(get_tenant_id),
    current_user: TokenData = Depends(get_current_user),
) -> ProximityEventResponse:
    """Get a specific proximity event by ID."""
    service = get_proximity_service(db, audit)
    
    event = await service.get_proximity_event(event_id, tenant_id)
    if not event:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Proximity event {event_id} not found",
        )
    
    return _event_to_response(event)


@router.get("/alerts/active", response_model=list[ProximityAlert])
async def get_active_alerts(
    db: AsyncSession = Depends(get_db),
    audit: AuditService = Depends(get_audit_service),
    tenant_id: str = Depends(get_tenant_id),
    current_user: TokenData = Depends(get_current_user),
) -> list[ProximityAlert]:
    """Get currently active proximity alerts (only allied vs others)."""
    service = get_proximity_service(db, audit)
    
    events = await service.get_active_alerts(tenant_id)
    
    # Filter to only show events where at least one satellite is allied
    filtered_events = [
        event for event in events
        if event.primary_satellite and event.secondary_satellite
        and (service._is_allied_satellite(event.primary_satellite) 
             or service._is_allied_satellite(event.secondary_satellite))
    ]
    
    return [
        ProximityAlert(
            event_id=event.id,
            primary_satellite_name=event.primary_satellite.name if event.primary_satellite else "Unknown",
            secondary_satellite_name=event.secondary_satellite.name if event.secondary_satellite else "Unknown",
            distance_km=event.current_distance_km or event.min_distance_km,
            alert_level=event.alert_level,
            is_hostile=event.is_hostile,
            threat_score=event.threat_score,
            timestamp=event.last_updated or event.start_time,
            predicted_tca=event.predicted_tca,
        )
        for event in filtered_events
    ]


@router.get("/config", response_model=ProximityDetectionConfig)
async def get_detection_config(
    current_user: TokenData = Depends(get_current_user),
) -> ProximityDetectionConfig:
    """Get current proximity detection configuration."""
    # Return default config for now
    # In production, this would be stored in database per tenant
    return ProximityDetectionConfig()


@router.post("/config", response_model=ProximityDetectionConfig)
async def update_detection_config(
    config: ProximityDetectionConfig,
    current_user: TokenData = Depends(get_current_user),
) -> ProximityDetectionConfig:
    """Update proximity detection configuration."""
    # Store config in database per tenant
    # For now, just return the updated config
    return config


def _event_to_response(event) -> ProximityEventResponse:
    """Convert ProximityEvent model to response schema."""
    return ProximityEventResponse(
        id=event.id,
        primary_satellite_id=event.primary_satellite_id,
        secondary_satellite_id=event.secondary_satellite_id,
        primary_satellite=_satellite_to_info(event.primary_satellite) if event.primary_satellite else None,
        secondary_satellite=_satellite_to_info(event.secondary_satellite) if event.secondary_satellite else None,
        start_time=event.start_time,
        end_time=event.end_time,
        last_updated=event.last_updated or event.start_time,
        min_distance_km=event.min_distance_km,
        current_distance_km=event.current_distance_km,
        approach_velocity_kms=event.approach_velocity_kms,
        tca=event.tca,
        predicted_tca=event.predicted_tca,
        alert_level=event.alert_level,
        status=event.status,
        is_hostile=event.is_hostile,
        threat_score=event.threat_score,
        threat_assessment=event.threat_assessment,
        warning_threshold_km=event.warning_threshold_km,
        critical_threshold_km=event.critical_threshold_km,
        primary_position=Position3D(**event.primary_position) if event.primary_position else None,
        secondary_position=Position3D(**event.secondary_position) if event.secondary_position else None,
        relative_velocity=Position3D(**event.relative_velocity) if event.relative_velocity else None,
        incident_id=event.incident_id,
        scenario_id=event.scenario_id,
        is_simulated=event.is_simulated,
        created_at=event.created_at,
        updated_at=event.updated_at,
    )


def _satellite_to_info(satellite) -> SatelliteInfo:
    """Convert Satellite model to info schema."""
    return SatelliteInfo(
        id=satellite.id,
        name=satellite.name,
        norad_id=satellite.norad_id,
        country=satellite.country,
        operator=satellite.operator,
        is_active=satellite.is_active,
    )
