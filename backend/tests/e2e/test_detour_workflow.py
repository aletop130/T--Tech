"""End‑to‑end tests for the Detour subsystem.

These tests exercise the full API flow:
1. Screening → analysis trigger → simulated pipeline completion → maneuver
   approval/execution.
2. Low‑risk analysis – verify ops brief recommends “monitor”.
3. Concurrent analyses – ensure multiple sessions can be started and completed
   independently.
"""

import asyncio
import pytest
from datetime import datetime, timezone

from app.db.base import generate_uuid
from app.db.models.ontology import Satellite, Orbit, ConjunctionEvent
from app.db.models.detour import (
    DetourSatelliteState,
    DetourConjunctionAnalysis,
    DetourAnalysisStatus,
    DetourManeuverPlan,
    DetourManeuverStatus,
    DetourAgentSession,
    DetourAgentSessionStatus,
)
from app.services.detour.state_manager import DetourStateManager
from app.agents.detour.graph import run_detour_pipeline


@pytest.mark.asyncio
async def test_e2e_complete_workflow(client, db_session):
    """Full workflow: screening, analysis, approve and execute maneuver."""
    # Create primary and secondary satellites with orbits
    primary = Satellite(
        id=generate_uuid(),
        norad_id=80001,
        name="PrimaryE2E",
        object_type="satellite",
    )
    secondary = Satellite(
        id=generate_uuid(),
        norad_id=80002,
        name="SecondaryE2E",
        object_type="satellite",
    )
    db_session.add_all([primary, secondary])
    await db_session.flush()

    tle1 = "1 80001U 20000A   24001.00000000  .00000000  00000-0  00000-0 0  9991"
    tle2 = "2 80001  98.0000   0.0000 0000001  0.0000   0.0000 14.00000000    01"
    primary_orbit = Orbit(
        id=generate_uuid(),
        satellite_id=primary.id,
        epoch=datetime.utcnow(),
        tle_line1=tle1,
        tle_line2=tle2,
    )
    tle3 = "1 80002U 20000B   24001.00000000  .00000000  00000-0  00000-0 0  9991"
    tle4 = "2 80002  98.0000   0.0000 0000001  0.0000   0.0000 14.00000000    01"
    secondary_orbit = Orbit(
        id=generate_uuid(),
        satellite_id=secondary.id,
        epoch=datetime.utcnow(),
        tle_line1=tle3,
        tle_line2=tle4,
    )
    db_session.add_all([primary_orbit, secondary_orbit])
    await db_session.flush()

    # High‑risk conjunction event
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

    # ----------- Screening -----------
    screening_resp = await client.post(
        "/api/v1/detour/screening/run",
        json={"satellite_id": primary.id, "time_window_hours": 72, "threshold_km": 5.0},
    )
    assert screening_resp.status_code == 200
    screening_data = screening_resp.json()
    for key in ["screening_results", "threats_identified", "priority_queue", "notes"]:
        assert key in screening_data

    # ----------- Trigger analysis -----------
    trigger_resp = await client.post(f"/api/v1/detour/conjunctions/{conj.id}/analyze")
    assert trigger_resp.status_code == 200
    session_id = trigger_resp.json()["session_id"]

    # Prepare detour state, analysis and maneuver plan for later steps
    sat_state = DetourSatelliteState(
        id=generate_uuid(),
        satellite_id=primary.id,
        tenant_id="default",
        fuel_remaining_kg=100.0,
        delta_v_budget_m_s=1000.0,
    )
    db_session.add(sat_state)

    analysis = DetourConjunctionAnalysis(
        id=generate_uuid(),
        conjunction_event_id=conj.id,
        tenant_id="default",
        risk_level=conj.risk_level,
        miss_distance_km=conj.miss_distance_km,
        tca=conj.tca,
        collision_probability=conj.collision_probability,
        analysis_status=DetourAnalysisStatus.COMPLETED,
    )
    db_session.add(analysis)

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

    # Mark the agent session as completed so result endpoint would succeed later if used
    session = await db_session.get(DetourAgentSession, session_id)
    session.status = DetourAgentSessionStatus.COMPLETED
    session.completed_at = datetime.utcnow()
    await db_session.flush()

    # ----------- Approve maneuver ----------
    approve_resp = await client.post(f"/api/v1/detour/maneuvers/{plan.id}/approve")
    assert approve_resp.status_code == 200
    approved = approve_resp.json()
    assert approved["status"] == "approved"

    # ----------- Execute maneuver ----------
    exec_resp = await client.post(f"/api/v1/detour/maneuvers/{plan.id}/execute")
    assert exec_resp.status_code == 200
    exec_data = exec_resp.json()
    assert exec_data["status"] == "executed"
    assert exec_data["plan_id"] == plan.id

    # Verify satellite state was updated (fuel reduced)
    refreshed_state = await db_session.get(DetourSatelliteState, sat_state.id)
    assert refreshed_state.fuel_remaining_kg == pytest.approx(95.0)  # 100 - 5
    assert refreshed_state.delta_v_budget_m_s == pytest.approx(1000.0 - 0.2)


@pytest.mark.asyncio
async def test_e2e_low_risk_brief(db_session):
    """Low‑risk analysis should result in an ops‑brief recommending “monitor”."""
    primary = Satellite(
        id=generate_uuid(),
        norad_id=90001,
        name="LowRiskSat",
        object_type="satellite",
    )
    secondary = Satellite(
        id=generate_uuid(),
        norad_id=90002,
        name="OtherSat",
        object_type="satellite",
    )
    db_session.add_all([primary, secondary])
    await db_session.flush()

    # Orbits (required for screening but not used in this low‑risk path)
    primary_orbit = Orbit(
        id=generate_uuid(),
        satellite_id=primary.id,
        epoch=datetime.utcnow(),
        tle_line1="1 90001U 20000A   24001.00000000  .00000000  00000-0  00000-0 0  9991",
        tle_line2="2 90001  98.0000   0.0000 0000001  0.0000   0.0000 14.00000000    01",
    )
    secondary_orbit = Orbit(
        id=generate_uuid(),
        satellite_id=secondary.id,
        epoch=datetime.utcnow(),
        tle_line1="1 90002U 20000B   24001.00000000  .00000000  00000-0  00000-0 0  9991",
        tle_line2="2 90002  98.0000   0.0000 0000001  0.0000   0.0000 14.00000000    01",
    )
    db_session.add_all([primary_orbit, secondary_orbit])
    await db_session.flush()

    conj = ConjunctionEvent(
        id=generate_uuid(),
        primary_object_id=primary.id,
        secondary_object_id=secondary.id,
        tca=datetime.utcnow().replace(tzinfo=timezone.utc),
        miss_distance_km=15.0,
        risk_level="low",
        collision_probability=1e-6,
    )
    db_session.add(conj)
    await db_session.flush()

    state_manager = DetourStateManager(db_session)
    session_id = generate_uuid()
    final_state = await run_detour_pipeline(
        session_id=session_id,
        satellite_id=primary.id,
        conjunction_event_id=conj.id,
        tenant_id="default",
        state_manager=state_manager,
    )
    # Low‑risk path should skip planner and set recommended_action to "monitor"
    assert final_state["ops_brief"]["recommended_action"] == "monitor"
    assert final_state["maneuver_options"] == []


@pytest.mark.asyncio
async def test_e2e_concurrent_analyses(client, db_session):
    """Start three analyses concurrently and verify they complete independently."""
    primary = Satellite(
        id=generate_uuid(),
        norad_id=100001,
        name="ConcurrentSat",
        object_type="satellite",
    )
    secondary = Satellite(
        id=generate_uuid(),
        norad_id=100002,
        name="OtherSat",
        object_type="satellite",
    )
    db_session.add_all([primary, secondary])
    await db_session.flush()

    events = []
    for i in range(3):
        ev = ConjunctionEvent(
            id=generate_uuid(),
            primary_object_id=primary.id,
            secondary_object_id=secondary.id,
            tca=datetime.utcnow().replace(tzinfo=timezone.utc),
            miss_distance_km=5.0 + i,
            risk_level="high",
            collision_probability=5e-5,
        )
        db_session.add(ev)
        events.append(ev)
    await db_session.flush()

    async def trigger(event_id: str):
        resp = await client.post(f"/api/v1/detour/conjunctions/{event_id}/analyze")
        assert resp.status_code == 200
        return resp.json()["session_id"]

    session_ids = await asyncio.gather(*(trigger(ev.id) for ev in events))
    assert len(session_ids) == 3
    assert len(set(session_ids)) == 3

    # Simulate completion of each session
    for sid in session_ids:
        sess = await db_session.get(DetourAgentSession, sid)
        sess.status = DetourAgentSessionStatus.COMPLETED
        sess.completed_at = datetime.utcnow()
    await db_session.flush()

    # Verify each session reports completed status
    for sid in session_ids:
        status_resp = await client.get(f"/api/v1/detour/sessions/{sid}/status")
        assert status_resp.status_code == 200
        data = status_resp.json()
        # Normalise case variations from the endpoint implementation
        assert data["status"].lower() == "completed"
