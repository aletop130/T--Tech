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
from sqlalchemy.orm import relationship, backref
from app.db.models.ontology import ConjunctionEvent

from app.db.base import Base, AuditMixin, generate_uuid

DETOUR_ENUM_KWARGS = {
    "native_enum": False,
    "create_constraint": False,
    "validate_strings": True,
}


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


class DetourStepStatus(str, enum.Enum):
    """Status of a step in the step-by-step pipeline."""
    PENDING = "pending"
    RUNNING = "running"
    WAITING_APPROVAL = "waiting_approval"
    COMPLETED = "completed"
    REJECTED = "rejected"
    ERROR = "error"


class DetourExecutionMode(str, enum.Enum):
    """Execution mode for detour pipeline."""
    AUTO = "auto"
    STEP_BY_STEP = "step_by_step"


class DetourSatelliteState(Base, AuditMixin):
    """State of a satellite for detour planning."""
    __tablename__ = "detour_satellite_state"

    id = Column(String(50), primary_key=True, default=generate_uuid)
    satellite_id = Column(String(50), ForeignKey("satellites.id"), nullable=False, index=True)
    tenant_id = Column(String(50), nullable=False, index=True)

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

    analysis_status = Column(
        SQLEnum(DetourAnalysisStatus, **DETOUR_ENUM_KWARGS),
        default=DetourAnalysisStatus.PENDING,
        nullable=False,
    )
    ai_analysis = Column(JSON, nullable=True)

    conjunction_event = relationship("ConjunctionEvent", back_populates="detour_analyses", lazy="selectin")


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

    status = Column(
        SQLEnum(DetourManeuverStatus, **DETOUR_ENUM_KWARGS),
        default=DetourManeuverStatus.PROPOSED,
        nullable=False,
    )
    ai_recommendation = Column(JSON, nullable=True)

    approved_by = Column(String(50), nullable=True)
    executed_at = Column(DateTime, nullable=True)

    conjunction_analysis = relationship("DetourConjunctionAnalysis", back_populates="maneuver_plans_rel", lazy="selectin")


class DetourAgentSession(Base, AuditMixin):
    """Agent session tracking for detour pipeline execution."""
    __tablename__ = "detour_agent_sessions"

    id = Column(String(50), primary_key=True, default=generate_uuid)
    session_type = Column(String(50), nullable=False)
    status = Column(
        SQLEnum(DetourAgentSessionStatus, **DETOUR_ENUM_KWARGS),
        default=DetourAgentSessionStatus.ACTIVE,
        nullable=False,
    )

    input_data = Column(JSON, nullable=True)
    output_data = Column(JSON, nullable=True)
    events = Column(JSON, nullable=True)

    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)


class DetourStepSession(Base, AuditMixin):
    """Session for step-by-step pipeline execution with human approval."""
    __tablename__ = "detour_step_sessions"

    id = Column(String(50), primary_key=True, default=generate_uuid)
    session_id = Column(String(50), unique=True, nullable=False, index=True)
    
    conjunction_event_id = Column(String(50), ForeignKey("conjunction_events.id"), nullable=False, index=True)
    satellite_id = Column(String(50), nullable=False)
    tenant_id = Column(String(50), nullable=False, index=True)
    
    execution_mode = Column(
        SQLEnum(DetourExecutionMode, **DETOUR_ENUM_KWARGS),
        default=DetourExecutionMode.STEP_BY_STEP,
        nullable=False,
    )
    status = Column(
        SQLEnum(DetourAgentSessionStatus, **DETOUR_ENUM_KWARGS),
        default=DetourAgentSessionStatus.ACTIVE,
        nullable=False,
    )
    
    current_agent = Column(String(50), nullable=True)
    current_step_number = Column(String(10), nullable=True)
    
    cesium_actions = Column(JSON, nullable=True)
    final_ops_brief = Column(JSON, nullable=True)
    final_risk_level = Column(String(20), nullable=True)
    
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    
    conjunction_event = relationship("ConjunctionEvent", lazy="selectin")


class DetourAgentStep(Base, AuditMixin):
    """Individual agent step within a step-by-step session."""
    __tablename__ = "detour_agent_steps"

    id = Column(String(50), primary_key=True, default=generate_uuid)
    session_id = Column(String(50), ForeignKey("detour_step_sessions.session_id"), nullable=False, index=True)
    
    agent_name = Column(String(50), nullable=False)
    step_number = Column(String(10), nullable=False)
    
    status = Column(
        SQLEnum(DetourStepStatus, **DETOUR_ENUM_KWARGS),
        default=DetourStepStatus.PENDING,
        nullable=False,
    )
    
    input_data = Column(JSON, nullable=True)
    output_data = Column(JSON, nullable=True)
    cesium_actions = Column(JSON, nullable=True)
    
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    
    approved_by = Column(String(50), nullable=True)
    approved_at = Column(DateTime, nullable=True)
    rejection_reason = Column(String(500), nullable=True)

    __table_args__ = (
        {"sqlite_autoincrement": True},
    )


class DetourAnalysisArchive(Base, AuditMixin):
    """Archived analysis for historical reference."""
    __tablename__ = "detour_analysis_archive"

    id = Column(String(50), primary_key=True, default=generate_uuid)
    session_id = Column(String(50), unique=True, nullable=False, index=True)
    
    conjunction_event_id = Column(String(50), nullable=False, index=True)
    satellite_id = Column(String(50), nullable=False)
    satellite_name = Column(String(100), nullable=True)
    tenant_id = Column(String(50), nullable=False, index=True)
    
    status = Column(String(50), nullable=False)
    final_risk_level = Column(String(20), nullable=True)
    
    recommended_maneuver = Column(JSON, nullable=True)
    was_executed = Column(Boolean, default=False)
    executed_at = Column(DateTime, nullable=True)
    
    steps_summary = Column(JSON, nullable=True)
    
    created_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)

# Relationships for detour models
# ConjunctionEvent -> DetourConjunctionAnalysis (one-to-many)
ConjunctionEvent.detour_analyses = relationship(
    "DetourConjunctionAnalysis",
    back_populates="conjunction_event",
    lazy="joined",
)

# Provide legacy attribute name for compatibility with tests
@property
def detour_analysis(self):
    """Return list of DetourConjunctionAnalysis for this ConjunctionEvent.
    Uses a synchronous engine query derived from the object's session to avoid async lazy loading issues.
    """
    from sqlalchemy.orm import object_session
    from sqlalchemy import select
    # Try to get the async session bound to this instance
    sess = object_session(self)
    if sess is not None:
        # Attempt to retrieve from the session's identity map to avoid extra queries
        try:
            # Access identity map containing all loaded objects in this session
            identity_map = sess.identity_map
        except AttributeError:
            # If the session does not have identity_map (unlikely), fall back to empty list
            return []
        results = [obj for obj in identity_map.values()
                   if isinstance(obj, DetourConjunctionAnalysis) and obj.conjunction_event_id == self.id]
        if results:
            return results
        # If not found in identity map, fall back to empty list (or could query DB)
        return []
    else:
        # No session bound; return empty list
        return []
ConjunctionEvent.detour_analysis = detour_analysis

# DetourConjunctionAnalysis -> DetourManeuverPlan (one-to-many)
DetourConjunctionAnalysis.maneuver_plans_rel = relationship(
    "DetourManeuverPlan",
    back_populates="conjunction_analysis",
    lazy="joined",
)

@property
def maneuver_plans(self):
    """Return list of DetourManeuverPlan for this DetourConjunctionAnalysis.
    Uses a synchronous engine query derived from the object's session to avoid async lazy loading issues.
    """
    from sqlalchemy.orm import object_session
    from sqlalchemy import select
    sess = object_session(self)
    if sess is not None:
        try:
            identity_map = sess.identity_map
        except AttributeError:
            return []
        results = [obj for obj in identity_map.values()
                   if isinstance(obj, DetourManeuverPlan) and obj.conjunction_analysis_id == self.id]
        if results:
            return results
        return []
    else:
        return []
DetourConjunctionAnalysis.maneuver_plans = maneuver_plans
