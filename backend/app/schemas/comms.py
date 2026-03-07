"""Schemas for Iridium SBD communications."""

from __future__ import annotations

from enum import Enum
from typing import Any, Optional

from pydantic import Field

from app.schemas.common import BaseSchema


class SatelliteCommandType(str, Enum):
    ORBIT_ADJUST = "orbit_adjust"
    ATTITUDE_CONTROL = "attitude_control"
    TELEMETRY_REQUEST = "telemetry_request"
    POWER_MANAGEMENT = "power_management"
    COMM_RELAY_CONFIG = "comm_relay_config"
    EMERGENCY_SAFE_MODE = "emergency_safe_mode"


class IridiumGateway(BaseSchema):
    name: str
    location: str
    lat: float
    lon: float
    region: str
    status: str = "operational"


class ParsedIntent(BaseSchema):
    command_type: SatelliteCommandType
    target_satellite_id: str
    target_satellite_name: str
    parameters: dict[str, Any] = Field(default_factory=dict)
    urgency: str = "normal"
    summary: str


class ATCommand(BaseSchema):
    command: str
    description: str
    expected_response: str


class ATCommandSequence(BaseSchema):
    commands: list[ATCommand]
    total_commands: int
    estimated_duration_ms: int


class SBDPayload(BaseSchema):
    protocol_revision: int = 1
    overall_message_length: int
    mt_header_iei: str = "0x41"
    mt_header_length: int
    unique_client_message_id: str
    imei: str
    mt_disposition_flags: str
    mt_payload_iei: str = "0x42"
    mt_payload_length: int
    mt_payload_hex: str
    mt_payload_human_readable: str
    total_bytes: int


class GatewayRouting(BaseSchema):
    selected_gateway: IridiumGateway
    routing_reason: str
    satellite_position: dict[str, float]
    signal_hops: int
    estimated_latency_ms: int
    alternative_gateways: list[IridiumGateway] = Field(default_factory=list)


class CommsTranscriptionSchema(BaseSchema):
    transcription_id: str = ""
    timestamp: float = 0.0
    human_input: str
    parsed_intent: ParsedIntent
    at_commands: ATCommandSequence
    sbd_payload: SBDPayload
    gateway_routing: GatewayRouting
    agent_reasoning: str = ""
    status: str = "complete"


class CommsRequest(BaseSchema):
    message: str
    target_satellite_id: Optional[str] = None


class ChatMessage(BaseSchema):
    role: str
    content: str


class CommsChatRequest(BaseSchema):
    messages: list[ChatMessage]


class CommsChatResponse(BaseSchema):
    reply: str
    command_ready: bool = False
    parsed_command: Optional[str] = None
    parsed_intent: Optional[ParsedIntent] = None
