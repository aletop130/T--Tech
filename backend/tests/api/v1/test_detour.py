# API integration tests for the Detour subsystem.

import pytest
from datetime import datetime, timezone

from app.db.base import generate_uuid
from app.db.models.ontology import Satellite, Orbit, ConjunctionEvent
from app.db.models.detour import (
    DetourSatelliteState,
    DetourConjunctionAnalysis,
    DetourManeuverPlan,
    DetourManeuverStatus,
)

@pytest.mark.asyncio
async def test_detour_pipeline_and_maneuver_flow(client, db_session):
    """Full end‑to‑end test covering analysis trigger, status, approval and execution.
    """
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
    assert status_data["status"] in {"active", "ACTIVE", "active"}

    # ---------- Results (should error because not completed) ----------
    results_resp = await client.get(f"/api/v1/detour/sessions/{session_id}/results")
    assert results_resp.status_code == 400
    # Verify RFC‑7807 problem+json fields
    err_body = results_resp.json()
    assert err_body["type"].endswith("analysis-not-complete")

    # ---------- Prepare maneuver plan ----------
    # Detour satellite state – enough fuel and Δv budget.
    sat_state = DetourSatelliteState(
        id=generate_uuid(),
        satellite_id=primary.id,
        tenant_id="default",
        fuel_remaining_kg=100.0,
        delta_v_budget_m_s=1000.0,
    )
    db_session.add(sat_state)
    await db_session.flush()

    # Detour conjunction analysis linked to the event.
    analysis = DetourConjunctionAnalysis(
        id=generate_uuid(),
        conjunction_event_id=conj.id,
        tenant_id="default",
        risk_level=conj.risk_level,
        miss_distance_km=conj.miss_distance_km,
        tca=conj.tca,
        collision_probability=conj.collision_probability,
        analysis_status="completed",
    )
    db_session.add(analysis)
    await db_session.flush()

    # Maneuver plan (initially proposed).
    plan = DetourManeuverPlan(
        id=generate_uuid(),
        conjunction_analysis_id=analysis.id,
        tenant_id="default",
        maneuver_type="in_plane",
        delta_v_m_s=0.2,
        fuel_cost_kg=5.0,
        status=DetourManeuverStatus.PROPOSED,
    )
    db_session.add(plan)
    await db_session.flush()

    # ---------- Approve maneuver ----------
    approve_resp = await client.post(f"/api/v1/detour/maneuvers/{plan.id}/approve")
    assert approve_resp.status_code == 200
    approved_plan = approve_resp.json()
    assert approved_plan["status"] == "approved"

    # ---------- Execute maneuver (admin role required, default user is admin) ----------
    exec_resp = await client.post(f"/api/v1/detour/maneuvers/{plan.id}/execute")
    assert exec_resp.status_code == 200
    exec_data = exec_resp.json()
    assert exec_data["status"] == "executed"
    assert exec_data["plan_id"] == plan.id

    # Verify satellite state was updated (fuel reduced).
    refreshed_state = await db_session.get(DetourSatelliteState, sat_state.id)
    assert refreshed_state.fuel_remaining_kg == pytest.approx(95.0)  # 100 - 5
    # Δv budget also reduced
    assert refreshed_state.delta_v_budget_m_s == pytest.approx(1000.0 - 0.2)
