"""Incident management models."""
from datetime import datetime
from typing import Optional

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Enum as SQLEnum,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    JSON,
)
from sqlalchemy.orm import relationship
import enum

from app.db.base import Base, AuditMixin, generate_uuid


class IncidentSeverity(str, enum.Enum):
    """Incident severity levels."""
    INFO = "info"
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class IncidentStatus(str, enum.Enum):
    """Incident status."""
    OPEN = "open"
    INVESTIGATING = "investigating"
    MITIGATING = "mitigating"
    RESOLVED = "resolved"
    CLOSED = "closed"


class IncidentType(str, enum.Enum):
    """Type of incident."""
    CONJUNCTION = "conjunction"
    SPACE_WEATHER = "space_weather"
    RF_INTERFERENCE = "rf_interference"
    ANOMALY = "anomaly"
    CYBER = "cyber"
    PHYSICAL = "physical"
    PROXIMITY = "proximity"
    HOSTILE_APPROACH = "hostile_approach"
    OTHER = "other"


class ProximityAlertLevel(str, enum.Enum):
    """Proximity alert levels."""
    INFO = "info"
    WARNING = "warning"
    CRITICAL = "critical"


class ProximityEventStatus(str, enum.Enum):
    """Proximity event status."""
    ACTIVE = "active"
    MONITORING = "monitoring"
    RESOLVED = "resolved"
    ESCALATED = "escalated"


class Incident(Base, AuditMixin):
    """Security/operational incident."""
    __tablename__ = "incidents"
    
    id = Column(String(50), primary_key=True, default=generate_uuid)
    
    # Basic info
    title = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)
    incident_type = Column(SQLEnum(IncidentType), nullable=False)
    
    # Severity and status
    severity = Column(
        SQLEnum(IncidentSeverity), default=IncidentSeverity.MEDIUM
    )
    status = Column(SQLEnum(IncidentStatus), default=IncidentStatus.OPEN)
    
    # Timing
    detected_at = Column(DateTime, default=datetime.utcnow)
    acknowledged_at = Column(DateTime, nullable=True)
    resolved_at = Column(DateTime, nullable=True)
    
    # Assignment
    assigned_to = Column(String(50), nullable=True)
    assigned_team = Column(String(100), nullable=True)
    
    # Affected assets (JSON array of {type, id, name})
    affected_assets = Column(JSON, default=list)
    
    # Related events
    source_event_type = Column(String(50), nullable=True)
    source_event_id = Column(String(50), nullable=True)
    
    # Analysis
    root_cause = Column(Text, nullable=True)
    impact_assessment = Column(Text, nullable=True)
    
    # Response
    mitigation_actions = Column(JSON, default=list)
    lessons_learned = Column(Text, nullable=True)
    
    # AI recommendations
    ai_analysis = Column(JSON, nullable=True)
    ai_recommended_actions = Column(JSON, nullable=True)
    
    # Priority for queue ordering
    priority = Column(Integer, default=50)  # 0-100, higher = more urgent
    
    # Relationships
    comments = relationship(
        "IncidentComment",
        back_populates="incident",
        cascade="all, delete-orphan",
        order_by="IncidentComment.created_at"
    )


class IncidentComment(Base, AuditMixin):
    """Comment on an incident."""
    __tablename__ = "incident_comments"
    
    id = Column(String(50), primary_key=True, default=generate_uuid)
    incident_id = Column(
        String(50), ForeignKey("incidents.id"), nullable=False, index=True
    )
    
    # Content
    content = Column(Text, nullable=False)
    
    # Type of comment
    comment_type = Column(
        String(50), default="note"
    )  # note, status_change, assignment, action
    
    # If action-related
    action_type = Column(String(50), nullable=True)
    action_data = Column(JSON, nullable=True)
    
    incident = relationship("Incident", back_populates="comments")


class ProximityEvent(Base, AuditMixin):
    """Proximity event / hostile approach between satellites."""
    __tablename__ = "proximity_events"
    
    id = Column(String(50), primary_key=True, default=generate_uuid)
    
    # Satellites involved
    primary_satellite_id = Column(
        String(50), ForeignKey("satellites.id"), nullable=False, index=True
    )
    secondary_satellite_id = Column(
        String(50), ForeignKey("satellites.id"), nullable=False, index=True
    )
    
    # Event timing
    start_time = Column(DateTime, nullable=False, index=True)
    end_time = Column(DateTime, nullable=True)
    last_updated = Column(DateTime, default=datetime.utcnow)
    
    # Distance metrics
    min_distance_km = Column(Float, nullable=False)
    current_distance_km = Column(Float, nullable=True)
    approach_velocity_kms = Column(Float, nullable=True)
    
    # Time of closest approach
    tca = Column(DateTime, nullable=True)
    predicted_tca = Column(DateTime, nullable=True)
    
    # Alert level
    alert_level = Column(
        String(20), 
        default='info'
    )
    
    # Status
    status = Column(
        String(20),
        default='active'
    )
    
    # Is this a hostile approach (enemy satellite approaching allied)
    is_hostile = Column(Boolean, default=False)
    
    # Threat assessment
    threat_score = Column(Float, nullable=True)  # 0-100
    threat_assessment = Column(Text, nullable=True)
    
    # Screening configuration used
    warning_threshold_km = Column(Float, default=10.0)
    critical_threshold_km = Column(Float, default=1.0)
    
    # Position data at detection (JSON with ECI coordinates)
    primary_position = Column(JSON, nullable=True)
    secondary_position = Column(JSON, nullable=True)
    relative_velocity = Column(JSON, nullable=True)  # [vx, vy, vz] km/s
    
    # Related incident (auto-created for critical events)
    incident_id = Column(
        String(50), ForeignKey("incidents.id"), nullable=True, index=True
    )
    
    # Scenario context (for replay)
    scenario_id = Column(String(50), nullable=True, index=True)
    is_simulated = Column(Boolean, default=False)
    
    # Relationships
    primary_satellite = relationship(
        "Satellite",
        foreign_keys=[primary_satellite_id],
        back_populates="proximity_events_primary"
    )
    secondary_satellite = relationship(
        "Satellite",
        foreign_keys=[secondary_satellite_id],
        back_populates="proximity_events_secondary"
    )

