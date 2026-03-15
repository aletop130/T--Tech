"""Tests for sandbox session and actor APIs."""

from __future__ import annotations

from datetime import datetime

import pytest

from app.db.models.ontology import Orbit, Satellite
from app.services import sandbox as sandbox_service


@pytest.mark.asyncio
async def test_sandbox_session_actor_tick_flow(client):
    session_response = await client.post(
        "/api/v1/sandbox/sessions",
        json={"name": "Tick Test Sandbox"},
    )
    assert session_response.status_code == 200
    session_payload = session_response.json()
    session_id = session_payload["session"]["id"]

    actor_response = await client.post(
        f"/api/v1/sandbox/sessions/{session_id}/actors",
        json={
            "actor_class": "mobile_ground",
            "actor_type": "ground_vehicle",
            "label": "Alpha Convoy",
            "faction": "allied",
            "state": {
                "position": {"lat": 41.9, "lon": 12.5, "alt_m": 0},
                "speed_ms": 100,
                "heading_deg": 90,
            },
            "behavior": {
                "type": "move_to",
                "target": {"lat": 41.9, "lon": 12.8, "alt_m": 0},
                "speed_ms": 100,
            },
        },
    )
    assert actor_response.status_code == 200
    actor_payload = actor_response.json()
    actor_id = actor_payload["actors"][0]["id"]

    start_response = await client.post(
        f"/api/v1/sandbox/sessions/{session_id}/control",
        json={"action": "start"},
    )
    assert start_response.status_code == 200
    assert start_response.json()["session"]["status"] == "running"

    tick_response = await client.post(
        f"/api/v1/sandbox/sessions/{session_id}/tick",
        json={"delta_seconds": 30},
    )
    assert tick_response.status_code == 200
    tick_payload = tick_response.json()
    actor = next(item for item in tick_payload["actors"] if item["id"] == actor_id)
    assert actor["state"]["position"]["lon"] > 12.5
    assert tick_payload["session"]["current_time_seconds"] == pytest.approx(30.0)


@pytest.mark.asyncio
async def test_sandbox_imports_live_satellite_as_isolated_actor(client, db_session):
    satellite = Satellite(
        id="sat-live-1",
        tenant_id="default",
        norad_id=123456,
        name="Live TestSat",
        object_type="satellite",
        is_active=True,
        created_by="tester",
        updated_by="tester",
    )
    orbit = Orbit(
        id="orbit-live-1",
        tenant_id="default",
        satellite_id=satellite.id,
        epoch=datetime.utcnow(),
        inclination_deg=97.4,
        raan_deg=14.2,
        mean_anomaly_deg=20.0,
        apogee_km=540.0,
        perigee_km=540.0,
        period_minutes=95.0,
        source="test",
        created_by="tester",
        updated_by="tester",
    )
    db_session.add(satellite)
    db_session.add(orbit)
    await db_session.flush()

    session_response = await client.post("/api/v1/sandbox/sessions", json={"name": "Import Sandbox"})
    assert session_response.status_code == 200
    session_id = session_response.json()["session"]["id"]

    import_response = await client.post(
        f"/api/v1/sandbox/sessions/{session_id}/import",
        json={"source_type": "satellite", "source_id": satellite.id},
    )
    assert import_response.status_code == 200
    payload = import_response.json()

    assert len(payload["actors"]) == 1
    actor = payload["actors"][0]
    assert actor["label"] == "Live TestSat"
    assert actor["provenance"] == "live_cloned"
    assert actor["source_ref"]["source_id"] == satellite.id
    assert actor["state"]["orbit"]["mode"] == "simplified"

    satellites_response = await client.get("/api/v1/ontology/satellites?search=Live TestSat")
    assert satellites_response.status_code == 200
    assert satellites_response.json()["total"] == 1


@pytest.mark.asyncio
async def test_sandbox_chat_compiler_creates_and_moves_actor(client, monkeypatch):
    monkeypatch.setattr(sandbox_service, "_get_sandbox_llm_client", lambda: None)
    session_response = await client.post("/api/v1/sandbox/sessions", json={"name": "Chat Sandbox"})
    assert session_response.status_code == 200
    session_id = session_response.json()["session"]["id"]

    create_response = await client.post(
        f"/api/v1/sandbox/sessions/{session_id}/chat",
        json={"prompt": "Create allied base named Alpha at 41.9, 12.5"},
    )
    assert create_response.status_code == 200
    create_payload = create_response.json()
    assert "Created base 'Alpha'" in create_payload["message"]
    assert any(actor["label"] == "Alpha" for actor in create_payload["snapshot"]["actors"])

    move_response = await client.post(
        f"/api/v1/sandbox/sessions/{session_id}/chat",
        json={"prompt": "Move Alpha to 42.1, 12.7"},
    )
    assert move_response.status_code == 200
    move_payload = move_response.json()
    actor = next(actor for actor in move_payload["snapshot"]["actors"] if actor["label"] == "Alpha")
    assert actor["behavior"]["type"] == "move_to"
    assert actor["behavior"]["target"]["lat"] == pytest.approx(42.1)
    assert actor["behavior"]["target"]["lon"] == pytest.approx(12.7)


@pytest.mark.asyncio
async def test_sandbox_chat_compiler_creates_drone_subtype(client, monkeypatch):
    monkeypatch.setattr(sandbox_service, "_get_sandbox_llm_client", lambda: None)
    session_response = await client.post("/api/v1/sandbox/sessions", json={"name": "Drone Sandbox"})
    assert session_response.status_code == 200
    session_id = session_response.json()["session"]["id"]

    create_response = await client.post(
        f"/api/v1/sandbox/sessions/{session_id}/chat",
        json={"prompt": "Create hostile drone named Raven at 41.9, 12.5"},
    )
    assert create_response.status_code == 200
    payload = create_response.json()

    actor = next(actor for actor in payload["snapshot"]["actors"] if actor["label"] == "Raven")
    assert actor["actor_type"] == "aircraft"
    assert actor["subtype"] == "drone"
    assert actor["state"]["position"]["alt_m"] == pytest.approx(2500.0)
    assert actor["state"]["speed_ms"] == pytest.approx(85.0)


@pytest.mark.asyncio
async def test_sandbox_coordinate_approach_target_moves_actor(client):
    session_response = await client.post(
        "/api/v1/sandbox/sessions",
        json={"name": "Coordinate Approach Sandbox"},
    )
    assert session_response.status_code == 200
    session_id = session_response.json()["session"]["id"]

    actor_response = await client.post(
        f"/api/v1/sandbox/sessions/{session_id}/actors",
        json={
            "actor_class": "air",
            "actor_type": "aircraft",
            "label": "Falcon",
            "faction": "allied",
            "state": {
                "position": {"lat": 41.9, "lon": 12.5, "alt_m": 8500},
                "speed_ms": 180,
                "heading_deg": 90,
            },
            "behavior": {"type": "hold"},
        },
    )
    assert actor_response.status_code == 200
    actor_id = actor_response.json()["actors"][0]["id"]

    update_response = await client.patch(
        f"/api/v1/sandbox/sessions/{session_id}/actors/{actor_id}",
        json={
            "behavior": {
                "type": "approach_target",
                "target": {"lat": 41.9, "lon": 12.8, "alt_m": 8500},
                "speed_ms": 180,
            }
        },
    )
    assert update_response.status_code == 200
    updated_actor = next(actor for actor in update_response.json()["actors"] if actor["id"] == actor_id)
    assert updated_actor["behavior"]["type"] == "approach_target"
    assert updated_actor["behavior"]["target"]["lon"] == pytest.approx(12.8)

    start_response = await client.post(
        f"/api/v1/sandbox/sessions/{session_id}/control",
        json={"action": "start"},
    )
    assert start_response.status_code == 200

    tick_response = await client.post(
        f"/api/v1/sandbox/sessions/{session_id}/tick",
        json={"delta_seconds": 30},
    )
    assert tick_response.status_code == 200
    actor = next(item for item in tick_response.json()["actors"] if item["id"] == actor_id)
    assert actor["state"]["position"]["lon"] > 12.5
