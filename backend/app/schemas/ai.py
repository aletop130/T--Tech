"""AI/LLM Pydantic schemas."""
from datetime import datetime
from typing import Any, Optional

from pydantic import Field

from app.schemas.common import BaseSchema


class ChatMessage(BaseSchema):
    """Chat message."""
    role: str = Field(..., pattern="^(system|user|assistant|tool)$")
    content: str
    name: Optional[str] = None
    tool_call_id: Optional[str] = None


class ChatRequest(BaseSchema):
    """Chat request schema."""
    messages: list[ChatMessage]
    context_object_ids: list[str] = Field(default_factory=list)
    include_recent_events: bool = True
    max_tokens: int = Field(2048, ge=100, le=8192)
    temperature: float = Field(0.7, ge=0, le=2)


class ChatResponse(BaseSchema):
    """Chat response schema."""
    message: ChatMessage
    usage: dict[str, int] = Field(default_factory=dict)
    context_used: list[dict] = Field(default_factory=list)
    request_id: str


class ToolDefinition(BaseSchema):
    """Tool definition for function calling."""
    name: str
    description: str
    parameters: dict[str, Any]


class ToolCall(BaseSchema):
    """Tool call from LLM."""
    id: str
    name: str
    arguments: dict[str, Any]


class ToolResult(BaseSchema):
    """Tool execution result."""
    tool_call_id: str
    name: str
    result: Any
    error: Optional[str] = None


# ============== Conjunction Analyst Agent ==============

class CourseOfAction(BaseSchema):
    """Course of action recommendation."""
    action_type: str  # maneuver, monitor, accept_risk, collaborate
    description: str
    maneuver_window_start: Optional[datetime] = None
    maneuver_window_end: Optional[datetime] = None
    expected_delta_v_m_s: Optional[float] = None
    fuel_cost_kg: Optional[float] = None
    risk_reduction_percent: Optional[float] = None
    constraints: list[str] = Field(default_factory=list)
    confidence: float = Field(..., ge=0, le=1)


class ConjunctionAnalystRequest(BaseSchema):
    """Request for Conjunction Analyst agent."""
    conjunction_event_id: str
    include_historical: bool = True
    max_coa_options: int = 3


class ConjunctionAnalystResponse(BaseSchema):
    """Response from Conjunction Analyst agent."""
    conjunction_event_id: str
    severity: str  # low, medium, high, critical
    risk_explanation: str
    primary_object_assessment: str
    secondary_object_assessment: str
    recommended_action: str
    courses_of_action: list[CourseOfAction]
    monitoring_recommendations: list[str] = Field(default_factory=list)
    confidence: float = Field(..., ge=0, le=1)
    analysis_timestamp: datetime = Field(default_factory=datetime.utcnow)
    request_id: str


# ============== Space Weather Watch Agent ==============

class ServiceImpact(BaseSchema):
    """Impact assessment for a service."""
    service: str  # gnss, rf_comms, drag, radiation
    risk_level: str  # low, medium, high, critical
    impact_description: str
    affected_assets: list[str] = Field(default_factory=list)
    confidence: float = Field(..., ge=0, le=1)


class RecommendedControl(BaseSchema):
    """Recommended control action."""
    control_type: str
    description: str
    priority: str  # low, medium, high, critical
    affected_services: list[str] = Field(default_factory=list)
    implementation_time_hours: Optional[float] = None


class SpaceWeatherWatchRequest(BaseSchema):
    """Request for Space Weather Watch agent."""
    start_time: datetime
    end_time: datetime
    asset_ids: list[str] = Field(default_factory=list)
    include_forecast: bool = True


class SpaceWeatherWatchResponse(BaseSchema):
    """Response from Space Weather Watch agent."""
    time_range_start: datetime
    time_range_end: datetime
    overall_risk: str  # low, medium, high, critical
    risk_summary: str
    risk_by_service: list[ServiceImpact]
    recommended_controls: list[RecommendedControl]
    monitoring_actions: list[str] = Field(default_factory=list)
    confidence: float = Field(..., ge=0, le=1)
    analysis_timestamp: datetime = Field(default_factory=datetime.utcnow)
    request_id: str


# ============== Mitigation Proposal ==============

class MitigationOption(BaseSchema):
    """Mitigation option."""
    option_id: str
    title: str
    description: str
    risk_reduction_percent: float
    cost_estimate: Optional[str] = None
    implementation_time: Optional[str] = None
    pros: list[str] = Field(default_factory=list)
    cons: list[str] = Field(default_factory=list)


class MitigationProposal(BaseSchema):
    """Mitigation proposal from AI."""
    event_id: str
    event_type: str
    options: list[MitigationOption]
    recommended_option_id: str
    rationale: str
    confidence: float = Field(..., ge=0, le=1)

