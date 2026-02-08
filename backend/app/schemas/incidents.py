"""Incident Pydantic schemas."""
from datetime import datetime
from typing import Any, Optional

from pydantic import Field

from app.schemas.common import AuditSchema, BaseSchema
from app.db.models.incidents import (
    IncidentSeverity,
    IncidentStatus,
    IncidentType,
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

