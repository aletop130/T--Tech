"""Incident Pydantic schemas."""
from datetime import datetime
from typing import Any, Optional

from pydantic import Field

from app.schemas.common import AuditSchema, BaseSchema
from app.db.models.incidents import (
    IncidentSeverity,
    IncidentStatus,
    IncidentType,
    ProximityAlertLevel,
    ProximityEventStatus,
)


class AffectedAsset(BaseSchema):
    """Affected asset reference."""
    type: str
    id: str
    name: str


class IncidentBase(BaseSchema):
    """Incident base fields."""
    title: str = Field(..., max_length=200)
    description: Optional[str] = None
    incident_type: IncidentType
    severity: IncidentSeverity = IncidentSeverity.MEDIUM
    affected_assets: list[AffectedAsset] = Field(default_factory=list)
    source_event_type: Optional[str] = Field(None, max_length=50)
    source_event_id: Optional[str] = Field(None, max_length=50)


class IncidentCreate(IncidentBase):
    """Schema for creating an incident."""
    assigned_to: Optional[str] = None
    assigned_team: Optional[str] = None
    priority: int = Field(50, ge=0, le=100)


class IncidentUpdate(BaseSchema):
    """Schema for updating an incident."""
    title: Optional[str] = Field(None, max_length=200)
    description: Optional[str] = None
    severity: Optional[IncidentSeverity] = None
    status: Optional[IncidentStatus] = None
    assigned_to: Optional[str] = None
    assigned_team: Optional[str] = None
    priority: Optional[int] = Field(None, ge=0, le=100)
    root_cause: Optional[str] = None
    impact_assessment: Optional[str] = None
    lessons_learned: Optional[str] = None


class IncidentStatusUpdate(BaseSchema):
    """Schema for updating incident status."""
    status: IncidentStatus
    comment: Optional[str] = None


class IncidentAssignment(BaseSchema):
    """Schema for assigning an incident."""
    assigned_to: Optional[str] = None
    assigned_team: Optional[str] = None
    comment: Optional[str] = None


class MitigationAction(BaseSchema):
    """Mitigation action."""
    action: str
    status: str = "pending"  # pending, in_progress, completed, failed
    assigned_to: Optional[str] = None
    due_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    notes: Optional[str] = None


class IncidentAddMitigation(BaseSchema):
    """Schema for adding mitigation action."""
    action: str
    assigned_to: Optional[str] = None
    due_at: Optional[datetime] = None


class CommentBase(BaseSchema):
    """Comment base fields."""
    content: str
    comment_type: str = "note"


class CommentCreate(CommentBase):
    """Schema for creating a comment."""
    pass


class CommentResponse(CommentBase, AuditSchema):
    """Comment response schema."""
    id: str
    incident_id: str
    action_type: Optional[str] = None
    action_data: Optional[dict] = None


class IncidentResponse(IncidentBase, AuditSchema):
    """Incident response schema."""
    id: str
    status: IncidentStatus
    detected_at: datetime
    acknowledged_at: Optional[datetime] = None
    resolved_at: Optional[datetime] = None
    assigned_to: Optional[str] = None
    assigned_team: Optional[str] = None
    priority: int
    mitigation_actions: list[MitigationAction] = Field(default_factory=list)
    ai_analysis: Optional[dict] = None
    ai_recommended_actions: Optional[list[dict]] = None


class IncidentDetail(IncidentResponse):
    """Incident with comments."""
    comments: list[CommentResponse] = Field(default_factory=list)
    root_cause: Optional[str] = None
    impact_assessment: Optional[str] = None
    lessons_learned: Optional[str] = None


class IncidentStats(BaseSchema):
    """Incident statistics."""
    total: int = 0
    by_status: dict[str, int] = Field(default_factory=dict)
    by_severity: dict[str, int] = Field(default_factory=dict)
    by_type: dict[str, int] = Field(default_factory=dict)
    open_count: int = 0
    critical_count: int = 0
    mttr_hours: Optional[float] = None  # Mean time to resolve


# Proximity Event Schemas

class Position3D(BaseSchema):
    """3D position in ECI coordinates."""
    x: float
    y: float
    z: float


class ProximityEventCreate(BaseSchema):
    """Schema for creating a proximity event."""
    primary_satellite_id: str
    secondary_satellite_id: str
    start_time: datetime
    min_distance_km: float
    current_distance_km: Optional[float] = None
    approach_velocity_kms: Optional[float] = None
    predicted_tca: Optional[datetime] = None
    alert_level: ProximityAlertLevel = ProximityAlertLevel.INFO
    is_hostile: bool = False
    threat_score: Optional[float] = Field(None, ge=0, le=100)
    warning_threshold_km: float = 0.05
    critical_threshold_km: float = 0.005
    primary_position: Optional[Position3D] = None
    secondary_position: Optional[Position3D] = None
    relative_velocity: Optional[Position3D] = None
    scenario_id: Optional[str] = None
    is_simulated: bool = False


class ProximityEventUpdate(BaseSchema):
    """Schema for updating a proximity event."""
    end_time: Optional[datetime] = None
    current_distance_km: Optional[float] = None
    min_distance_km: Optional[float] = None
    tca: Optional[datetime] = None
    alert_level: Optional[ProximityAlertLevel] = None
    status: Optional[ProximityEventStatus] = None
    threat_score: Optional[float] = Field(None, ge=0, le=100)
    threat_assessment: Optional[str] = None


class SatelliteInfo(BaseSchema):
    """Basic satellite info for proximity events."""
    id: str
    name: str
    norad_id: int
    country: Optional[str] = None
    operator: Optional[str] = None
    is_active: bool = True


class ProximityEventResponse(BaseSchema):
    """Proximity event response schema."""
    id: str
    primary_satellite_id: str
    secondary_satellite_id: str
    primary_satellite: Optional[SatelliteInfo] = None
    secondary_satellite: Optional[SatelliteInfo] = None
    start_time: datetime
    end_time: Optional[datetime] = None
    last_updated: datetime
    min_distance_km: float
    current_distance_km: Optional[float] = None
    approach_velocity_kms: Optional[float] = None
    tca: Optional[datetime] = None
    predicted_tca: Optional[datetime] = None
    alert_level: ProximityAlertLevel
    status: ProximityEventStatus
    is_hostile: bool
    threat_score: Optional[float] = None
    threat_assessment: Optional[str] = None
    warning_threshold_km: float
    critical_threshold_km: float
    primary_position: Optional[Position3D] = None
    secondary_position: Optional[Position3D] = None
    relative_velocity: Optional[Position3D] = None
    incident_id: Optional[str] = None
    scenario_id: Optional[str] = None
    is_simulated: bool
    created_at: datetime
    updated_at: datetime


class ProximityEventListParams(BaseSchema):
    """Parameters for listing proximity events."""
    alert_level: Optional[ProximityAlertLevel] = None
    status: Optional[ProximityEventStatus] = None
    is_hostile: Optional[bool] = None
    satellite_id: Optional[str] = None
    scenario_id: Optional[str] = None
    start_time_from: Optional[datetime] = None
    start_time_to: Optional[datetime] = None
    page: int = Field(1, ge=1)
    page_size: int = Field(50, ge=1, le=100)


class ProximityDetectionConfig(BaseSchema):
    """Configuration for proximity detection."""
    warning_threshold_km: float = 10.0
    critical_threshold_km: float = 1.0
    check_interval_seconds: int = 60
    prediction_horizon_hours: int = 24
    enable_auto_incident_creation: bool = True


class ProximityDetectionResult(BaseSchema):
    """Result of a proximity detection run."""
    run_id: str
    timestamp: datetime
    satellites_checked: int
    pairs_checked: int
    events_detected: int
    events_created: int
    events_updated: int
    duration_ms: float


class ProximityAlert(BaseSchema):
    """Active proximity alert for real-time display."""
    event_id: str
    primary_satellite_name: str
    secondary_satellite_name: str
    distance_km: float
    alert_level: ProximityAlertLevel
    is_hostile: bool
    threat_score: Optional[float] = None
    timestamp: datetime
    predicted_tca: Optional[datetime] = None

