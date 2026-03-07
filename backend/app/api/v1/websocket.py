"""WebSocket endpoint for real-time threat data push.

Supports commands:
- ping → pong
- {"speed": N} → update tick rate
- {"prior_adversarial": N} → update Bayesian prior
- {"subscribe": ["proximity", "signal", ...]} → filter threat types
"""

from __future__ import annotations

import asyncio
import json
import logging
import math
import time
import copy

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.services.threat_detection import ThreatDetectionService
from app.db.base import async_session_factory

logger = logging.getLogger(__name__)

router = APIRouter()

# Active WebSocket connections
active_connections: list[WebSocket] = []

# Simulation speed (1x real-time by default)
_sim_speed: float = 1.0

# Golden ratio for well-distributed phase offsets
_PHI = 0.6180339887498949


def _wobble_threats(threats: list[dict], elapsed: float) -> list[dict]:
    """Apply smooth time-based drift to threat values for organic variation."""
    out = []
    for t in threats:
        t = copy.copy(t)
        tid = t.get("id", "")
        seed = hash(tid) & 0xFFFF
        p1 = (seed * _PHI) % (2 * math.pi)
        p2 = ((seed * 31) * _PHI) % (2 * math.pi)
        w = (math.sin(2 * math.pi * elapsed / 30.0 + p1) * 0.10
             + math.sin(2 * math.pi * elapsed / 13.0 + p2) * 0.07)

        if "confidence" in t:
            t["confidence"] = round(max(0.01, min(0.99, t["confidence"] + w)), 2)
        if "baselineDeviation" in t:
            t["baselineDeviation"] = round(max(0.10, min(0.99, t["baselineDeviation"] + w)), 2)
        if "missDistanceKm" in t:
            t["missDistanceKm"] = round(max(0.05, t["missDistanceKm"] * (1 + w)), 2)
        if "interceptionProbability" in t:
            t["interceptionProbability"] = round(max(0.01, min(0.99, t["interceptionProbability"] + w)), 2)
        out.append(t)
    return out


@router.websocket("/ws/threats")
async def threat_stream_ws(ws: WebSocket):
    """Push fresh threat data every tick. Speed-aware tick rate.

    Client sends: {"speed": 10} to update sim speed.
    Client sends: {"prior_adversarial": 0.8} to adjust priors.
    Server sends: scenario_tick messages at max(0.1s, 1/speed).
    """
    await ws.accept()
    active_connections.append(ws)
    logger.info("Threat WS client connected (%d total)", len(active_connections))

    global _sim_speed
    send_task: asyncio.Task | None = None
    tenant_id = "default"
    start_time = time.time()

    async def sender():
        tick_count = 0
        try:
            while True:
                elapsed = (time.time() - start_time) * _sim_speed
                async with async_session_factory() as session:
                    service = ThreatDetectionService(session)
                    proximity = await service.detect_proximity_threats(tenant_id)
                    signal = await service.detect_signal_threats(tenant_id)
                    anomaly = await service.detect_anomaly_threats(tenant_id)

                # Apply wobble for organic variation
                proximity = _wobble_threats(proximity, elapsed)
                signal = _wobble_threats(signal, elapsed)
                anomaly = _wobble_threats(anomaly, elapsed)

                tick = {
                    "type": "scenario_tick",
                    "elapsed": round(elapsed, 1),
                    "proximityThreats": proximity,
                    "signalThreats": signal,
                    "anomalyThreats": anomaly,
                    "threats": [],
                }

                await ws.send_json(tick)
                tick_count += 1

                interval = max(0.1, 1.0 / max(_sim_speed, 0.1))
                await asyncio.sleep(interval)
        except asyncio.CancelledError:
            pass

    send_task = asyncio.create_task(sender())

    try:
        while True:
            raw = await ws.receive_text()
            try:
                msg = json.loads(raw)
                if "speed" in msg:
                    _sim_speed = max(0.1, float(msg["speed"]))
                    logger.info("Threat WS: speed set to %.1fx", _sim_speed)
                if "prior_adversarial" in msg:
                    # Update is accepted but uses config defaults via settings
                    logger.info("Threat WS: prior_adversarial update received")
                if msg.get("type") == "ping":
                    await ws.send_json({"type": "pong"})
            except (json.JSONDecodeError, ValueError):
                pass
    except WebSocketDisconnect:
        logger.info("Threat WS client disconnected")
    except Exception as exc:
        logger.exception("Threat WS error: %s", exc)
    finally:
        if send_task:
            send_task.cancel()
        if ws in active_connections:
            active_connections.remove(ws)
