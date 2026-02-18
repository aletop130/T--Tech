"""Pydantic schemas for the Detour subsystem.

These schemas expose the data structures used by the Detour API endpoints and
service layer. They map closely to the SQLAlchemy models defined in
`app.db.models.detour` and include strict validation via Pydantic `Field`
constraints.
"""

from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import Field

from app.schemas.common import AuditSchema, BaseSchema
from app.db.models.detour import DetourAnalysisStatus, DetourManeuverStatus, DetourStepStatus, DetourExecutionMode


class SatelliteStateSchema(AuditSchema):
    """Schema representing the detour‑specific state of a satellite.

    Mirrors ``DetourSatelliteState`` model.
    """

    id: str
    satellite_id: str
    fuel_remaining_kg: Optional[float] = Field(
        None, ge=0, description="Remaining fuel in kilograms"
    )
    delta_v_budget_m_s: Optional[float] = Field(
        None, ge=0, description="Δv budget in meters per second"
    )


class StepByStepRequest(BaseSchema):
    """Request to start a step-by-step Detour analysis."""
    
    conjunction_event_id: str = Field(..., description="ID of the conjunction event")
    satellite_id: str = Field(..., description="ID of the satellite to analyze")
    execution_mode: DetourExecutionMode = Field(
        DetourExecutionMode.STEP_BY_STEP,
        description="Execution mode: auto or step_by_step"
    )


class AgentStepInfo(BaseSchema):
    """Information about a single agent step."""
    
    agent_name: str
    step_number: int
    status: DetourStepStatus
    output_summary: Optional[str] = None
    cesium_actions: Optional[List[Dict[str, Any]]] = None
    approved_by: Optional[str] = None
    approved_at: Optional[datetime] = None
    rejection_reason: Optional[str] = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None


class StepSessionResponse(BaseSchema):
    """Response for a step-by-step session."""
    
    session_id: str
    conjunction_event_id: str
    satellite_id: str
    execution_mode: DetourExecutionMode
    status: str
    current_agent: Optional[str] = None
    current_step_number: Optional[int] = None
    steps: List[AgentStepInfo] = Field(default_factory=list)
    cesium_actions: Optional[List[Dict[str, Any]]] = None
    final_ops_brief: Optional[Dict[str, Any]] = None
    final_risk_level: Optional[str] = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None


class AgentApprovalRequest(BaseSchema):
    """Request to approve or reject an agent step."""
    
    notes: Optional[str] = Field(None, max_length=500, description="Optional notes for approval/rejection")


class AgentRejectRequest(BaseSchema):
    """Request to reject an agent step."""
    
    reason: str = Field(..., max_length=500, description="Reason for rejection")


class StepExecutionResponse(BaseSchema):
    """Response after executing an agent step."""
    
    session_id: str
    agent_name: str
    step_number: int
    status: DetourStepStatus
    output_summary: str
    cesium_actions: Optional[List[Dict[str, Any]]] = None
    next_step_available: bool = False
    next_agent: Optional[str] = None
    message: str


class ConjunctionAnalysisRequest(BaseSchema):
    """Payload to request a conjunction analysis for a specific event."""

    conjunction_event_id: str = Field(..., description="ID of the conjunction event to analyse")


class ConjunctionAnalysisResponse(AuditSchema):
    """Response model containing the results of a detour conjunction analysis."""

    id: str
    conjunction_event_id: str
    collision_probability: Optional[float] = Field(
        None, ge=0, le=1, description="Probability of collision (0‑1)"
    )
    risk_level: str
    miss_distance_km: float = Field(..., ge=0, description="Miss distance in kilometres")
    tca: Optional[datetime] = None
    analysis_status: DetourAnalysisStatus = DetourAnalysisStatus.PENDING
    ai_analysis: Optional[Dict[str, Any]] = None


class ManeuverPlanSchema(AuditSchema):
    """Schema for a proposed or executed maneuver plan."""

    id: str
    conjunction_analysis_id: str
    maneuver_type: str
    delta_v_m_s: Optional[float] = Field(
        None, ge=0, description="Δv magnitude in metres per second"
    )
    fuel_cost_kg: Optional[float] = Field(
        None, ge=0, description="Estimated fuel consumption in kilograms"
    )
    execution_window: Optional[Dict[str, Any]] = None
    expected_miss_distance_km: Optional[float] = Field(
        None, ge=0, description="Predicted miss distance after maneuver"
    )
    risk_reduction_percent: Optional[float] = Field(
        None, ge=0, le=100, description="Risk reduction expressed as a percent"
    )
    status: DetourManeuverStatus = DetourManeuverStatus.PROPOSED
    ai_recommendation: Optional[Dict[str, Any]] = None
    approved_by: Optional[str] = None
    executed_at: Optional[datetime] = None


class ManeuverApprovalRequest(BaseSchema):
    """Payload used when approving or rejecting a maneuver plan.

    The service can optionally store free‑form notes supplied by the operator.
    """

    notes: Optional[str] = Field(None, max_length=500)


class OpsBriefSchema(BaseSchema):
    """Operational brief generated after a completed detour analysis."""

    session_id: str
    summary: str
    recommended_actions: List[str] = Field(default_factory=list)
    risk_assessment: str
    created_at: datetime = Field(default_factory=datetime.utcnow)


class AgentEventSchema(BaseSchema):
    """Event emitted by the detour LangGraph agent for SSE streaming."""

    event_type: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    data: Dict[str, Any] = Field(default_factory=dict)


class ScreeningCandidate(BaseSchema):
    """A single conjunction candidate identified by the screening step."""

    candidate_id: str
    satellite_id: str
    tca: datetime
    miss_distance_km: float = Field(..., ge=0)
    collision_probability: Optional[float] = Field(
        None, ge=0, le=1, description="Estimated collision probability"
    )
    risk_level: Optional[str] = None


class ScreeningRequest(BaseSchema):
    """Request payload to trigger a screening operation for a satellite."""

    satellite_id: str
    time_window_hours: float = Field(72, ge=0, description="Length of the screening window in hours")
    threshold_km: float = Field(5.0, ge=0, description="Distance threshold for a candidate (km)")


class ScreeningResponse(BaseSchema):
    """Response containing all candidates found during screening."""

    candidates: List[ScreeningCandidate] = Field(default_factory=list)
    generated_at: datetime = Field(default_factory=datetime.utcnow)

