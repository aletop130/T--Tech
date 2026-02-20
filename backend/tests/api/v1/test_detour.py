# API integration tests for the Detour subsystem.

import pytest
from datetime import datetime, timezone

from app.db.base import generate_uuid
from app.db.models.ontology import Satellite, Orbit, ConjunctionEvent

@pytest.mark.asyncio
async def test_detour_pipeline_and_maneuver_deprecations(client, db_session):
    """Cutover behavior: analysis works, maneuver mutation endpoints are deprecated."""
    # ---------- Setup ----------
    # Create primary and secondary satellites with orbits (required by screening tool).
    primary = Satellite(id=generate_uuid(), norad_id=30001, name="PrimarySatAPI", object_type="satellite")
    secondary = Satellite(id=generate_uuid(), norad_id=30002, name="SecondarySatAPI", object_type="satellite")
    db_session.add_all([primary, secondary])
    await db_session.flush()

    # Simple valid TLEs (format required by skyfield).
    tle1 = "1 30001U 20000A   24001.00000000  .00000000  00000-0  00000-0 0  9991"
    tle2 = "2 30001  98.0000   0.0000 0000001  0.0000   0.0000 14.00000000    01"
    primary_orbit = Orbit(id=generate_uuid(), satellite_id=primary.id, epoch=datetime.utcnow(), tle_line1=tle1, tle_line2=tle2)
    tle3 = "1 30002U 20000B   24001.00000000  .00000000  00000-0  00000-0 0  9991"
    tle4 = "2 30002  98.0000   0.0000 0000001  0.0000   0.0000 14.00000000    01"
    secondary_orbit = Orbit(id=generate_uuid(), satellite_id=secondary.id, epoch=datetime.utcnow(), tle_line1=tle3, tle_line2=tle4)
    db_session.add_all([primary_orbit, secondary_orbit])
    await db_session.flush()

    # Conjunction event (risk set to high to enable full pipeline)
    conj = ConjunctionEvent(
        id=generate_uuid(),
        primary_object_id=primary.id,
        secondary_object_id=secondary.id,
        tca=datetime.utcnow().replace(tzinfo=timezone.utc),
        miss_distance_km=3.0,
        risk_level="high",
        collision_probability=5e-5,
    )
    db_session.add(conj)
    await db_session.flush()

    # ---------- Trigger analysis ----------
    response = await client.post(f"/api/v1/detour/conjunctions/{conj.id}/analyze")
    assert response.status_code == 200
    data = response.json()
    session_id = data["session_id"]
    assert isinstance(session_id, str)

    # ---------- Status ----------
    status_resp = await client.get(f"/api/v1/detour/sessions/{session_id}/status")
    assert status_resp.status_code == 200
    status_data = status_resp.json()
    assert "status" in status_data
    assert status_data["status"] in {"active", "completed", "failed", "cancelled"}

    # ---------- Results (may still be running) ----------
    results_resp = await client.get(f"/api/v1/detour/sessions/{session_id}/results")
    assert results_resp.status_code in {200, 400}
    if results_resp.status_code == 400:
        err_body = results_resp.json()
        assert err_body["type"].endswith("analysis-not-complete")
    else:
        results_data = results_resp.json()
        assert results_data["session_id"] == session_id

    # ---------- Maneuver endpoints are deprecated ----------
    deprecated_calls = [
        ("/api/v1/detour/maneuvers/plan-1/approve", {}),
        ("/api/v1/detour/maneuvers/plan-1/reject", {"reason": "deprecated"}),
        ("/api/v1/detour/maneuvers/plan-1/execute", {}),
    ]
    for path, payload in deprecated_calls:
        response = await client.post(path, json=payload)
        assert response.status_code == 501
        body = response.json()
        assert body["type"].endswith("endpoint-deprecated")
        assert body["deprecated"] is True
