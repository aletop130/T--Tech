"""Incident management models."""
from datetime import datetime
from typing import Optional

from sqlalchemy import (
    Column,
    DateTime,
    Enum as SQLEnum,
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
    OTHER = "other"


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

