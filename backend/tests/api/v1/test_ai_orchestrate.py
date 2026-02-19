"""Tests for chat orchestration endpoint with confirmation-gated side effects."""

from __future__ import annotations

import json

import pytest


def _parse_sse_events(raw_text: str) -> list[dict]:
    events: list[dict] = []
    for block in raw_text.split("\n\n"):
        if not block.startswith("data: "):
            continue
        payload = block[6:]
        if payload == "[DONE]":
            events.append({"type": "done"})
            continue
        try:
            events.append(json.loads(payload))
        except json.JSONDecodeError:
            continue
    return events


@pytest.mark.asyncio
async def test_orchestrate_create_satellite_requires_confirmation(client):
    """A create request must emit confirmation_required instead of immediate write."""
    response = await client.post(
        "/api/v1/ai/chat/orchestrate",
        json={
            "message": 'Create satellite "TEST-SAT-ALPHA" NORAD 990001',
            "session_id": "orchestrate-test-session",
        },
    )
    assert response.status_code == 200
    events = _parse_sse_events(response.text)

    assert any(e.get("type") == "confirmation_required" for e in events)
    assert any(e.get("type") == "cesium_action" for e in events)
    assert any(e.get("type") == "done" for e in events)


@pytest.mark.asyncio
async def test_orchestrate_confirmation_executes_create_satellite(client):
    """A follow-up confirmation should execute the pending operation."""
    session_id = "orchestrate-confirm-session"

    prepare = await client.post(
        "/api/v1/ai/chat/orchestrate",
        json={
            "message": 'Create satellite "TEST-SAT-BRAVO" NORAD 990002',
            "session_id": session_id,
        },
    )
    assert prepare.status_code == 200

    confirm = await client.post(
        "/api/v1/ai/chat/orchestrate",
        json={
            "message": "conferma",
            "session_id": session_id,
        },
    )
    assert confirm.status_code == 200
    events = _parse_sse_events(confirm.text)

    assert any(e.get("type") == "content" and "Satellite creato" in e.get("chunk", "") for e in events)
    assert any(e.get("type") == "cesium_action" for e in events)
    assert any(e.get("type") == "done" for e in events)

    satellites = await client.get("/api/v1/ontology/satellites?search=TEST-SAT-BRAVO")
    assert satellites.status_code == 200
    payload = satellites.json()
    assert any(item["name"] == "TEST-SAT-BRAVO" for item in payload["items"])
