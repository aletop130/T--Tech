"""Iridium Protocol Agent — translates natural language commands into Iridium SBD protocol.

Adapted from ORBITAL SHIELD to use Regolo.ai (OpenAI function_calling format).
"""

from __future__ import annotations

import json
import logging
from typing import Any

from app.agents.base_agent import BaseAgent, ProgressCallback
from app.services.iridium import get_imei, route_to_gateway, IRIDIUM_GATEWAYS
from app.schemas.comms import (
    CommsTranscriptionSchema,
    ParsedIntent,
    ATCommand,
    ATCommandSequence,
    SBDPayload,
    GatewayRouting,
    SatelliteCommandType,
)

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """You are an Iridium satellite communications protocol specialist. Translate natural language satellite commands into valid Iridium Short Burst Data (SBD) protocol transmissions.

When a user issues a command, you must:
1. Parse intent (command type, target satellite, parameters)
2. Look up target satellite for metadata and IMEI
3. Generate AT command sequence (AT+CSQF, AT+SBDD2, AT+SBDWB, AT+SBDIX)
4. Encode SBD binary payload

Command types: orbit_adjust, attitude_control, telemetry_request, power_management, comm_relay_config, emergency_safe_mode
Command opcodes: orbit_adjust=0x10, attitude_control=0x20, telemetry_request=0x30, power_management=0x40, comm_relay_config=0x50, emergency_safe_mode=0xFF

Return a JSON object with: parsed_intent, at_commands, sbd_payload, reasoning.
Return ONLY the JSON object."""

# OpenAI function_calling format tools
TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "lookup_satellite",
            "description": "Look up satellite metadata by name or ID. Returns NORAD ID, name, nation, and IMEI.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "Satellite name or ID"}
                },
                "required": ["query"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "lookup_satellite_position",
            "description": "Get current position (lat, lon, altitude) of a satellite.",
            "parameters": {
                "type": "object",
                "properties": {
                    "satellite_id": {"type": "string", "description": "Satellite ID"}
                },
                "required": ["satellite_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_iridium_signal_status",
            "description": "Check Iridium network signal quality for a given position.",
            "parameters": {
                "type": "object",
                "properties": {
                    "lat": {"type": "number", "description": "Latitude"},
                    "lon": {"type": "number", "description": "Longitude"},
                },
                "required": ["lat", "lon"],
            },
        },
    },
]


def _handle_lookup_satellite(input_data: dict) -> dict:
    query = input_data.get("query", "")
    sat_id = query if query.startswith("sat-") else f"sat-{query}" if query.isdigit() else query
    imei = get_imei(sat_id)
    return {
        "found": True,
        "satellite_id": sat_id,
        "imei": imei,
        "name": query,
    }


def _handle_lookup_satellite_position(input_data: dict) -> dict:
    sat_id = input_data.get("satellite_id", "sat-0")
    h = abs(hash(sat_id)) % 100
    return {
        "found": True,
        "satellite_id": sat_id,
        "lat": 35.0 + h % 50 - 25,
        "lon": -80.0 + h % 160,
        "alt_km": 400 + h * 5,
    }


def _handle_get_iridium_signal_status(input_data: dict) -> dict:
    lat = input_data.get("lat", 0)
    lon = input_data.get("lon", 0)
    bars = 3 + (hash(f"{lat:.1f}{lon:.1f}") % 3)
    return {
        "signal_bars": bars,
        "signal_bars_max": 5,
        "link_quality": "excellent" if bars >= 4 else "good",
        "network": "Iridium NEXT",
    }


class IridiumProtocolAgent(BaseAgent):
    """Translates natural language satellite commands into Iridium SBD protocol."""

    name = "iridium_protocol"

    def __init__(self, on_progress: ProgressCallback = None):
        super().__init__(on_progress=on_progress)

    async def run(
        self,
        human_message: str,
        target_satellite_id: str | None = None,
    ) -> CommsTranscriptionSchema:
        await self._notify("Parsing natural language command...")

        user_msg = f"Operator command: {human_message}"
        if target_satellite_id:
            user_msg += f"\nPre-selected target satellite: {target_satellite_id}"

        raw = await self._run_with_tools(
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": user_msg}],
            tools=TOOLS,
            tool_handlers={
                "lookup_satellite": _handle_lookup_satellite,
                "lookup_satellite_position": _handle_lookup_satellite_position,
                "get_iridium_signal_status": _handle_get_iridium_signal_status,
            },
        )

        await self._notify("Building protocol transcription...")

        try:
            cleaned = raw.strip()
            if cleaned.startswith("```"):
                cleaned = cleaned.split("\n", 1)[1]
                if cleaned.endswith("```"):
                    cleaned = cleaned[:-3]
                cleaned = cleaned.strip()

            data = json.loads(cleaned)

            intent_data = data["parsed_intent"]
            parsed_intent = ParsedIntent(
                command_type=SatelliteCommandType(intent_data["command_type"]),
                target_satellite_id=intent_data["target_satellite_id"],
                target_satellite_name=intent_data["target_satellite_name"],
                parameters=intent_data.get("parameters", {}),
                urgency=intent_data.get("urgency", "normal"),
                summary=intent_data["summary"],
            )

            at_data = data["at_commands"]
            at_commands = ATCommandSequence(
                commands=[ATCommand(**cmd) for cmd in at_data["commands"]],
                total_commands=at_data["total_commands"],
                estimated_duration_ms=at_data.get("estimated_duration_ms", 15000),
            )

            sbd_data = data["sbd_payload"]
            sbd_payload = SBDPayload(
                overall_message_length=sbd_data["overall_message_length"],
                mt_header_length=sbd_data.get("mt_header_length", 21),
                unique_client_message_id=sbd_data["unique_client_message_id"],
                imei=sbd_data["imei"],
                mt_disposition_flags=sbd_data.get("mt_disposition_flags", "0x0000"),
                mt_payload_length=sbd_data["mt_payload_length"],
                mt_payload_hex=sbd_data["mt_payload_hex"],
                mt_payload_human_readable=sbd_data["mt_payload_human_readable"],
                total_bytes=sbd_data["total_bytes"],
            )

            reasoning = data.get("reasoning", "")

        except (json.JSONDecodeError, KeyError, Exception) as exc:
            logger.warning("Failed to parse iridium agent output: %s", exc)
            return self._fallback_transcription(human_message, raw)

        # Gateway routing
        try:
            pos = _handle_lookup_satellite_position(
                {"satellite_id": parsed_intent.target_satellite_id}
            )
            gateway_routing = route_to_gateway(pos["lat"], pos["lon"], pos["alt_km"])
        except Exception:
            gateway_routing = route_to_gateway(0.0, 0.0, 500.0)

        await self._notify("Iridium protocol translation complete.")

        import time
        import uuid
        return CommsTranscriptionSchema(
            transcription_id=str(uuid.uuid4()),
            timestamp=time.time(),
            human_input=human_message,
            parsed_intent=parsed_intent,
            at_commands=at_commands,
            sbd_payload=sbd_payload,
            gateway_routing=gateway_routing,
            agent_reasoning=reasoning,
            status="complete",
        )

    def _fallback_transcription(self, human_message: str, raw: str) -> CommsTranscriptionSchema:
        """Produce a minimal valid transcription if parsing fails."""
        import time
        import uuid
        return CommsTranscriptionSchema(
            transcription_id=str(uuid.uuid4()),
            timestamp=time.time(),
            human_input=human_message,
            parsed_intent=ParsedIntent(
                command_type=SatelliteCommandType.TELEMETRY_REQUEST,
                target_satellite_id="sat-0",
                target_satellite_name="UNKNOWN",
                parameters={},
                urgency="normal",
                summary=f"Failed to parse: {human_message[:80]}",
            ),
            at_commands=ATCommandSequence(
                commands=[
                    ATCommand(command="AT+CSQF", description="Check signal quality", expected_response="+CSQF:4"),
                    ATCommand(command="AT+SBDD2", description="Clear buffers", expected_response="0"),
                    ATCommand(command="AT+SBDIX", description="Initiate SBD session", expected_response="+SBDIX:0,0,0,0,0,0"),
                ],
                total_commands=3,
                estimated_duration_ms=10000,
            ),
            sbd_payload=SBDPayload(
                overall_message_length=24,
                mt_header_length=21,
                unique_client_message_id="00000000",
                imei="300234010000000",
                mt_disposition_flags="0x0000",
                mt_payload_length=1,
                mt_payload_hex="01 00 18 41 00 15 00 00 00 00 33 30 30 32 33 34 30 31 30 30 30 30 30 30 30 00 00 42 00 01 30",
                mt_payload_human_readable="Fallback telemetry request",
                total_bytes=31,
            ),
            gateway_routing=route_to_gateway(0.0, 0.0, 500.0),
            agent_reasoning=raw[:500] if raw else "Agent produced no output.",
            status="complete",
        )
