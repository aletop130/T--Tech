"""Tests for chat orchestration endpoint with confirmation-gated side effects."""

from __future__ import annotations

import json

import pytest

from app.services.ai import AIService
from app.services.detour.upstream_agent_service import UpstreamDetourAgentService


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


@pytest.mark.asyncio
async def test_orchestrate_confirmation_is_scoped_to_session(client):
    """A confirmation from another session must not execute pending operations."""
    prepare = await client.post(
        "/api/v1/ai/chat/orchestrate",
        json={
            "message": 'Create satellite "TEST-SAT-CROSS" NORAD 990003',
            "session_id": "orchestrate-cross-source",
        },
    )
    assert prepare.status_code == 200

    confirm = await client.post(
        "/api/v1/ai/chat/orchestrate",
        json={
            "message": "conferma",
            "session_id": "orchestrate-cross-other",
        },
    )
    assert confirm.status_code == 200
    events = _parse_sse_events(confirm.text)

    assert not any(e.get("type") == "content" and "Satellite creato" in e.get("chunk", "") for e in events)

    satellites = await client.get("/api/v1/ontology/satellites?search=TEST-SAT-CROSS")
    assert satellites.status_code == 200
    payload = satellites.json()
    assert all(item["name"] != "TEST-SAT-CROSS" for item in payload["items"])


@pytest.mark.asyncio
async def test_orchestrate_start_sar_simulation_without_confirmation(client):
    """Starting SAR simulation should execute immediately without confirmation."""
    response = await client.post(
        "/api/v1/ai/chat/orchestrate",
        json={
            "message": "Avvia simulazione SAR Operation Guardian Angel",
            "session_id": "orchestrate-sar-sim-session",
        },
    )
    assert response.status_code == 200
    events = _parse_sse_events(response.text)

    assert any(
        e.get("type") == "simulation_control"
        and e.get("action") == "start_sar_simulation"
        and e.get("mode") == "enter_simulation_mode"
        for e in events
    )
    assert not any(e.get("type") == "confirmation_required" for e in events)
    assert any(
        e.get("type") == "content" and "START MISSION" in e.get("chunk", "")
        for e in events
    )
    assert any(e.get("type") == "done" for e in events)


@pytest.mark.asyncio
async def test_orchestrate_open_sandbox_for_custom_workspace_requests(client):
    """Sandbox workspace requests should navigate into the dedicated sandbox page."""
    response = await client.post(
        "/api/v1/ai/chat/orchestrate",
        json={
            "message": "Open a sandbox for a custom simulation around the selected satellites",
            "session_id": "orchestrate-sandbox-session",
        },
    )
    assert response.status_code == 200
    events = _parse_sse_events(response.text)

    assert any(
        e.get("type") == "simulation_control"
        and e.get("action") == "open_sandbox"
        and e.get("prompt") == "Open a sandbox for a custom simulation around the selected satellites"
        for e in events
    )
    assert any(
        e.get("type") == "content" and "Opening Sandbox" in e.get("chunk", "")
        for e in events
    )
    assert any(e.get("type") == "done" for e in events)


@pytest.mark.asyncio
async def test_orchestrate_conjunction_routes_to_upstream_pipeline(client, monkeypatch):
    """Conjunction prompts must call upstream 5-agent stream without local context gate."""

    async def fake_ensure_demo_data(cls):
        return None

    def fake_build_llm_config():
        return object()

    async def fake_stream_avoidance_pipeline(request: str, config=None, mode: str = "multi"):
        assert mode == "multi"
        assert "congiunzione" in request.lower()
        yield {"type": "agent_start", "agent": "scout"}
        yield {"type": "thinking", "agent": "scout", "text": "Scanning conjunction window"}
        yield {"type": "agent_output", "agent": "scout", "content": "Scout output"}
        yield {"type": "agent_complete", "agent": "scout"}
        yield {"type": "agent_start", "agent": "ops_brief"}
        yield {"type": "agent_output", "agent": "ops_brief", "content": "Ops brief output"}
        yield {"type": "agent_complete", "agent": "ops_brief"}
        yield {"type": "pipeline_complete"}

    monkeypatch.setattr(
        UpstreamDetourAgentService,
        "_ensure_demo_data",
        classmethod(fake_ensure_demo_data),
        raising=False,
    )
    monkeypatch.setattr(
        UpstreamDetourAgentService,
        "_build_llm_config",
        staticmethod(fake_build_llm_config),
    )
    monkeypatch.setattr(
        "app.vendors.detour_upstream.agents.graph.stream_avoidance_pipeline",
        fake_stream_avoidance_pipeline,
    )

    response = await client.post(
        "/api/v1/ai/chat/orchestrate",
        json={
            "message": "analizza la congiunzione Terrascan-1",
            "session_id": "orchestrate-upstream-session",
        },
    )
    assert response.status_code == 200
    events = _parse_sse_events(response.text)

    assert any(
        e.get("type") == "agent_start" and e.get("agent") == "scout"
        for e in events
    )
    assert any(
        e.get("type") == "agent_complete" and e.get("agent") == "all"
        for e in events
    )
    assert not any(
        e.get("type") == "error"
        and "Non ho trovato il satellite menzionato" in e.get("error", "")
        for e in events
    )
    assert any(e.get("type") == "done" for e in events)


@pytest.mark.asyncio
async def test_chat_stream_propagates_session_id(client, monkeypatch):
    """The stream endpoint forwards session_id to AIService for memory partitioning."""
    captured: dict[str, str | None] = {}

    async def fake_stream_chat_with_functions(self, **kwargs):
        captured["session_id"] = kwargs.get("session_id")
        captured["user_id"] = kwargs.get("user_id")
        yield f"data: {json.dumps({'type': 'content', 'chunk': 'ok'})}\n\n"
        yield "data: [DONE]\n\n"

    monkeypatch.setattr(AIService, "stream_chat_with_functions", fake_stream_chat_with_functions)

    response = await client.post(
        "/api/v1/ai/chat/stream",
        json={
            "messages": [{"role": "user", "content": "ciao"}],
            "session_id": "stream-session-123",
        },
    )
    assert response.status_code == 200
    assert "data:" in response.text
    assert "[DONE]" in response.text
    assert captured["session_id"] == "stream-session-123"
    assert captured["user_id"] is not None
