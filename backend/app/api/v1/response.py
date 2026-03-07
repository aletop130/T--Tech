"""Threat response API endpoints with SSE streaming."""

from __future__ import annotations

import asyncio
import json
import logging

from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse

from app.agents.response_agent import ThreatResponseAgent
from app.schemas.response import ThreatResponseRequest

logger = logging.getLogger(__name__)

router = APIRouter()


def _sse_line(data: dict) -> str:
    return f"data: {json.dumps(data)}\n\n"


async def _response_generator(req: ThreatResponseRequest):
    """Run threat response agent and yield SSE events."""
    yield _sse_line({"type": "response_start", "satellite_id": req.satellite_id})
    await asyncio.sleep(0.1)

    progress_events: list[str] = []

    async def on_progress(text: str):
        progress_events.append(text)

    agent = ThreatResponseAgent(on_progress=on_progress)

    try:
        decision = await agent.run(
            satellite_id=req.satellite_id,
            satellite_name=req.satellite_name,
            threat_satellite_id=req.threat_satellite_id,
            threat_satellite_name=req.threat_satellite_name,
            threat_score=req.threat_score,
            miss_distance_km=req.miss_distance_km,
            approach_pattern=req.approach_pattern,
            tca_minutes=req.tca_minutes,
        )
    except Exception as exc:
        logger.exception("Response agent failed")
        yield _sse_line({"type": "response_error", "message": str(exc)})
        return

    for ev in progress_events:
        yield _sse_line({"type": "response_progress", "data": {"text": ev}})
        await asyncio.sleep(0.05)

    yield _sse_line({"type": "response_complete", "data": decision})


@router.get("/stream")
async def stream_response(
    request: Request,
    satellite_id: str,
    satellite_name: str,
    threat_satellite_id: str,
    threat_satellite_name: str,
    threat_score: float,
    miss_distance_km: float = 0.0,
    approach_pattern: str = "unknown",
    tca_minutes: int = 0,
):
    """SSE streaming endpoint for threat response decisions."""
    req = ThreatResponseRequest(
        satellite_id=satellite_id,
        satellite_name=satellite_name,
        threat_satellite_id=threat_satellite_id,
        threat_satellite_name=threat_satellite_name,
        threat_score=threat_score,
        miss_distance_km=miss_distance_km,
        approach_pattern=approach_pattern,
        tca_minutes=tca_minutes,
    )

    async def event_generator():
        try:
            async for event in _response_generator(req):
                if await request.is_disconnected():
                    break
                yield event
        except Exception as exc:
            logger.exception("SSE response stream error")
            yield _sse_line({"type": "response_error", "message": str(exc)})

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive", "X-Accel-Buffering": "no"},
    )


@router.post("/evaluate")
async def evaluate_response(body: ThreatResponseRequest):
    """Synchronous endpoint — runs full agent pipeline and returns decision."""
    agent = ThreatResponseAgent()
    decision = await agent.run(
        satellite_id=body.satellite_id,
        satellite_name=body.satellite_name,
        threat_satellite_id=body.threat_satellite_id,
        threat_satellite_name=body.threat_satellite_name,
        threat_score=body.threat_score,
        miss_distance_km=body.miss_distance_km,
        approach_pattern=body.approach_pattern,
        tca_minutes=body.tca_minutes,
    )
    return decision
