"""Sandbox schemas for isolated scenario authoring."""
from datetime import datetime
from typing import Any, Literal, Optional

from pydantic import BaseModel, Field

from app.schemas.common import BaseSchema


SandboxSessionStatus = Literal["draft", "running", "paused"]
SandboxActorClass = Literal[
    "orbital",
    "fixed_ground",
    "mobile_ground",
    "air",
    "sea",
    "weapon",
    "effect",
]
SandboxProvenance = Literal["manual", "agent", "live_cloned"]
SandboxFaction = Literal["allied", "hostile", "neutral", "unknown"]
SandboxScenarioItemType = Literal["event", "modifier", "overlay", "objective"]
SandboxCommandSource = Literal["manual", "chat", "import", "system"]


class SandboxPosition(BaseModel):
    """Map position for a sandbox actor."""

    lat: float = Field(..., ge=-90, le=90)
    lon: float = Field(..., ge=-180, le=180)
    alt_m: float = Field(0, ge=0)


class SandboxSessionCreate(BaseSchema):
    """Create a sandbox session."""

    name: Optional[str] = Field(None, max_length=200)
    description: Optional[str] = None
    initial_prompt: Optional[str] = None
    is_saved: bool = False
    duration_seconds: Optional[float] = Field(None, gt=0, le=864000)


class SandboxSessionControlRequest(BaseSchema):
    """Session runtime control request."""

    action: Literal["start", "pause", "resume", "reset", "set_speed", "set_duration"]
    time_multiplier: Optional[float] = Field(None, gt=0, le=1000)
    duration_seconds: Optional[float] = Field(None, gt=0, le=864000)


class SandboxTickRequest(BaseSchema):
    """Advance the sandbox runtime."""

    delta_seconds: float = Field(1.0, gt=0, le=3600)


class SandboxActorCreate(BaseSchema):
    """Create a sandbox actor."""

    actor_class: SandboxActorClass
    actor_type: str = Field(..., min_length=1, max_length=40)
    subtype: Optional[str] = Field(None, max_length=80)
    faction: SandboxFaction = "neutral"
    label: str = Field(..., min_length=1, max_length=200)
    provenance: SandboxProvenance = "manual"
    visual_config: dict[str, Any] = Field(default_factory=dict)
    state: dict[str, Any] = Field(default_factory=dict)
    capabilities: dict[str, Any] = Field(default_factory=dict)
    behavior: dict[str, Any] = Field(default_factory=dict)
    source_ref: dict[str, Any] = Field(default_factory=dict)


class SandboxActorUpdate(BaseSchema):
    """Update a sandbox actor."""

    label: Optional[str] = Field(None, min_length=1, max_length=200)
    subtype: Optional[str] = Field(None, max_length=80)
    faction: Optional[SandboxFaction] = None
    visual_config: Optional[dict[str, Any]] = None
    state: Optional[dict[str, Any]] = None
    capabilities: Optional[dict[str, Any]] = None
    behavior: Optional[dict[str, Any]] = None


class SandboxScenarioItemCreate(BaseSchema):
    """Create a sandbox scenario item."""

    item_type: SandboxScenarioItemType
    label: str = Field(..., min_length=1, max_length=200)
    source_type: Optional[str] = Field(None, max_length=50)
    source_id: Optional[str] = Field(None, max_length=100)
    payload: dict[str, Any] = Field(default_factory=dict)


class SandboxImportRequest(BaseSchema):
    """Import live platform data into sandbox-local state."""

    source_type: Literal["satellite", "ground_station", "ground_vehicle", "conjunction"]
    source_id: str = Field(..., min_length=1, max_length=100)
    drop_position: Optional[SandboxPosition] = None


class SandboxTLEImportRequest(BaseSchema):
    """Import a satellite from raw TLE text."""

    tle_text: str = Field(..., min_length=10, max_length=500)
    label: Optional[str] = Field(None, max_length=200)
    faction: SandboxFaction = "neutral"


class SandboxChatRequest(BaseSchema):
    """Natural-language chat request for sandbox commands."""

    prompt: str = Field(..., min_length=1, max_length=4000)


class SandboxSessionRead(BaseSchema):
    """Sandbox session response."""

    id: str
    tenant_id: str
    user_id: str
    name: str
    description: Optional[str] = None
    status: SandboxSessionStatus
    is_saved: bool
    initial_prompt: Optional[str] = None
    current_time_seconds: float
    time_multiplier: float
    duration_seconds: Optional[float] = None
    created_at: datetime
    updated_at: datetime


class SandboxActorRead(BaseSchema):
    """Sandbox actor response."""

    id: str
    session_id: str
    tenant_id: str
    actor_class: SandboxActorClass
    actor_type: str
    subtype: Optional[str] = None
    faction: SandboxFaction
    label: str
    provenance: SandboxProvenance
    visual_config: dict[str, Any]
    state: dict[str, Any]
    initial_state: dict[str, Any]
    capabilities: dict[str, Any]
    behavior: dict[str, Any]
    source_ref: dict[str, Any]
    created_at: datetime
    updated_at: datetime


class SandboxScenarioItemRead(BaseSchema):
    """Sandbox scenario item response."""

    id: str
    session_id: str
    tenant_id: str
    item_type: SandboxScenarioItemType
    label: str
    source_type: Optional[str] = None
    source_id: Optional[str] = None
    payload: dict[str, Any]
    created_at: datetime
    updated_at: datetime


class SandboxCommandRead(BaseSchema):
    """Sandbox command history entry."""

    id: str
    session_id: str
    tenant_id: str
    command_type: str
    source: SandboxCommandSource
    summary: str
    payload: dict[str, Any]
    created_at: datetime
    updated_at: datetime


class SandboxSessionSnapshot(BaseSchema):
    """Complete sandbox state payload."""

    session: SandboxSessionRead
    actors: list[SandboxActorRead]
    scenario_items: list[SandboxScenarioItemRead]
    commands: list[SandboxCommandRead]


class SandboxSessionSummary(BaseSchema):
    """Lightweight session summary for listing."""

    id: str
    name: str
    description: Optional[str] = None
    status: SandboxSessionStatus
    is_saved: bool
    actor_count: int = 0
    created_at: datetime
    updated_at: datetime


class SandboxChatResponse(BaseSchema):
    """Sandbox chat response."""

    message: str
    applied_commands: list[str] = Field(default_factory=list)
    snapshot: SandboxSessionSnapshot
