"""Detour related database models."""

import enum
from datetime import datetime
from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Enum as SQLEnum,
    Float,
    ForeignKey,
    String,
    JSON,
)
from sqlalchemy.orm import relationship

from app.db.base import Base, AuditMixin, generate_uuid


class DetourAnalysisStatus(str, enum.Enum):
    """Status of a detour conjunction analysis."""
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"


class DetourManeuverStatus(str, enum.Enum):
    """Status of a detour maneuver plan."""
    PROPOSED = "proposed"
    APPROVED = "approved"
    REJECTED = "rejected"
    EXECUTED = "executed"
    FAILED = "failed"


class DetourAgentSessionStatus(str, enum.Enum):
    """Status of a detour agent session."""
    ACTIVE = "active"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class DetourSatelliteState(Base, AuditMixin):
    """State of a satellite for detour planning."""
    __tablename__ = "detour_satellite_state"

    id = Column(String(50), primary_key=True, default=generate_uuid)
    satellite_id = Column(String(50), ForeignKey("satellites.id"), nullable=False, index=True)

    fuel_remaining_kg = Column(Float, nullable=True)
    delta_v_budget_m_s = Column(Float, nullable=True)

    satellite = relationship("Satellite", backref="detour_state")


class DetourConjunctionAnalysis(Base, AuditMixin):
    """Detour analysis results for a conjunction event."""
    __tablename__ = "detour_conjunction_analysis"

    id = Column(String(50), primary_key=True, default=generate_uuid)
    conjunction_event_id = Column(String(50), ForeignKey("conjunction_events.id"), nullable=False, index=True)

    collision_probability = Column(Float, nullable=True)
    risk_level = Column(String(20), nullable=False)
    miss_distance_km = Column(Float, nullable=False)
    tca = Column(DateTime, nullable=True)

    analysis_status = Column(SQLEnum(DetourAnalysisStatus), default=DetourAnalysisStatus.PENDING, nullable=False)
    ai_analysis = Column(JSON, nullable=True)

    conjunction_event = relationship("ConjunctionEvent", backref="detour_analysis")


class DetourManeuverPlan(Base, AuditMixin):
    """Proposed or executed maneuver plan for a detour."""
    __tablename__ = "detour_maneuver_plans"

    id = Column(String(50), primary_key=True, default=generate_uuid)
    conjunction_analysis_id = Column(String(50), ForeignKey("detour_conjunction_analysis.id"), nullable=False, index=True)

    maneuver_type = Column(String(50), nullable=False)
    delta_v_m_s = Column(Float, nullable=True)
    fuel_cost_kg = Column(Float, nullable=True)

    execution_window = Column(JSON, nullable=True)  # e.g., {"start": "...", "end": "..."}
    expected_miss_distance_km = Column(Float, nullable=True)
    risk_reduction_percent = Column(Float, nullable=True)

    status = Column(SQLEnum(DetourManeuverStatus), default=DetourManeuverStatus.PROPOSED, nullable=False)
    ai_recommendation = Column(JSON, nullable=True)

    approved_by = Column(String(50), nullable=True)
    executed_at = Column(DateTime, nullable=True)

    conjunction_analysis = relationship("DetourConjunctionAnalysis", backref="maneuver_plans")


class DetourAgentSession(Base, AuditMixin):
    """Agent session tracking for detour pipeline execution."""
    __tablename__ = "detour_agent_sessions"

    id = Column(String(50), primary_key=True, default=generate_uuid)
    session_type = Column(String(50), nullable=False)
    status = Column(SQLEnum(DetourAgentSessionStatus), default=DetourAgentSessionStatus.ACTIVE, nullable=False)

    input_data = Column(JSON, nullable=True)
    output_data = Column(JSON, nullable=True)
    events = Column(JSON, nullable=True)

    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)
