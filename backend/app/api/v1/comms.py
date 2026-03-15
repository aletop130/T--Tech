"""Iridium SBD communication routes — chat, stream, and send endpoints."""

from __future__ import annotations

import asyncio
import json
import logging

from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse

from app.agents.iridium_agent import IridiumProtocolAgent
from app.schemas.comms import CommsRequest, CommsChatRequest, CommsChatResponse

logger = logging.getLogger(__name__)

router = APIRouter()


# ── Chat system prompt ──────────────────────────────────────────────

CHAT_SYSTEM_PROMPT = """You are an Iridium satellite communications officer in the Horus platform. Operators chat with you in plain English to issue satellite commands.

RULES:
1. Keep responses brief (1-3 sentences).
2. If the operator's intent is clear, go straight to presenting the command.
3. If critical info is missing (which satellite? what action?), ask ONE clarifying question.

WHEN READY, respond with text FOLLOWED BY a JSON block:

```command
{
  "command_type": "orbit_adjust",
  "target_satellite_id": "sat-6",
  "target_satellite_name": "USA-245",
  "parameters": {},
  "urgency": "urgent",
  "summary": "Execute maneuver on USA-245"
}
```

Command types: orbit_adjust, attitude_control, telemetry_request, power_management, comm_relay_config, emergency_safe_mode
Only include the ```command block when confident you have enough information."""


@router.post("/chat")
async def comms_chat(body: CommsChatRequest) -> CommsChatResponse:
    """Conversational endpoint — chat with operator to build a command."""
    from app.agents.base_agent import _get_client
    from app.core.config import settings

    client = _get_client()
    messages = [{"role": "system", "content": CHAT_SYSTEM_PROMPT}]
    messages += [{"role": m.role, "content": m.content} for m in body.messages]

    try:
        response = await client.chat.completions.create(
            model=settings.REGOLO_MODEL,
            max_tokens=settings.REGOLO_MAX_TOKENS,
            temperature=settings.REGOLO_TEMPERATURE,
            messages=messages,
        )
        final_text = response.choices[0].message.content or ""
    except Exception as exc:
        logger.exception("Comms chat failed")
        return CommsChatResponse(reply=f"Communication error: {exc}", command_ready=False)

    # Check for ```command block
    command_ready = False
    parsed_command = None
    parsed_intent = None
    reply_text = final_text

    if "```command" in final_text:
        parts = final_text.split("```command")
        reply_text = parts[0].strip()
        try:
            json_str = parts[1].split("```")[0].strip()
            cmd_data = json.loads(json_str)
            parsed_command = json_str
            from app.schemas.comms import ParsedIntent, SatelliteCommandType
            parsed_intent = ParsedIntent(
                command_type=SatelliteCommandType(cmd_data["command_type"]),
                target_satellite_id=cmd_data["target_satellite_id"],
                target_satellite_name=cmd_data["target_satellite_name"],
                parameters=cmd_data.get("parameters", {}),
                urgency=cmd_data.get("urgency", "normal"),
                summary=cmd_data["summary"],
            )
            command_ready = True
        except (json.JSONDecodeError, KeyError, IndexError, ValueError) as exc:
            logger.warning("Failed to parse command block: %s", exc)

    return CommsChatResponse(
        reply=reply_text,
        command_ready=command_ready,
        parsed_command=parsed_command,
        parsed_intent=parsed_intent,
    )


# ── SSE helpers ─────────────────────────────────────────────────────

def _sse_line(data: dict) -> str:
    return f"data: {json.dumps(data)}\n\n"


async def _comms_generator(message: str, target_satellite_id: str | None = None):
    """Run Iridium Protocol Agent and yield SSE events."""
    yield _sse_line({"type": "comms_start", "message": message})
    await asyncio.sleep(0.2)

    yield _sse_line({"type": "comms_stage", "stage": "human_input", "data": {"text": message}})
    await asyncio.sleep(0.3)

    progress_events: list[str] = []

    async def on_progress(text: str):
        progress_events.append(text)

    agent = IridiumProtocolAgent(on_progress=on_progress)

    try:
        transcription = await agent.run(message, target_satellite_id)
    except Exception as exc:
        logger.exception("Iridium agent failed")
        yield _sse_line({"type": "comms_error", "message": str(exc)})
        return

    for ev in progress_events:
        yield _sse_line({"type": "comms_stage", "stage": "agent_reasoning", "data": {"text": ev}})
        await asyncio.sleep(0.05)

    await asyncio.sleep(0.3)
    yield _sse_line({"type": "comms_stage", "stage": "parsed_intent", "data": transcription.parsed_intent.model_dump()})
    await asyncio.sleep(0.4)
    yield _sse_line({"type": "comms_stage", "stage": "at_commands", "data": transcription.at_commands.model_dump()})
    await asyncio.sleep(0.4)
    yield _sse_line({"type": "comms_stage", "stage": "sbd_payload", "data": transcription.sbd_payload.model_dump()})
    await asyncio.sleep(0.4)
    yield _sse_line({"type": "comms_stage", "stage": "gateway_routing", "data": transcription.gateway_routing.model_dump()})
    await asyncio.sleep(0.3)
    yield _sse_line({"type": "comms_complete", "data": transcription.model_dump()})


@router.get("/stream")
async def comms_stream(request: Request, message: str, target_satellite_id: str | None = None):
    """SSE endpoint for Iridium SBD protocol transcription."""
    async def event_generator():
        try:
            async for event in _comms_generator(message, target_satellite_id):
                if await request.is_disconnected():
                    break
                yield event
        except Exception as exc:
            logger.exception("SSE comms stream error")
            yield _sse_line({"type": "comms_error", "message": str(exc)})

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive", "X-Accel-Buffering": "no"},
    )


@router.post("/send")
async def comms_send(body: CommsRequest):
    """Synchronous endpoint — full pipeline, returns transcription."""
    agent = IridiumProtocolAgent()
    transcription = await agent.run(body.message, body.target_satellite_id)
    return transcription.model_dump()
