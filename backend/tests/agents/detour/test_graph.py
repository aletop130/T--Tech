# Integration tests for the Detour LangGraph pipeline.

"""These tests verify that the graph executes correctly for a low‑risk conjunction (planner node is skipped) and that the final state contains the expected values."""

import pytest
from datetime import datetime, timezone

from app.db.base import generate_uuid
from app.db.models.ontology import Satellite, Orbit, ConjunctionEvent
from app.db.models.detour import DetourConjunctionAnalysis
from app.services.detour.state_manager import DetourStateManager
from app.agents.detour.graph import run_detour_pipeline

@pytest.mark.asyncio
async def test_detour_graph_low_risk(db_session):
    # Create primary and secondary satellites
    primary = Satellite(
        id=generate_uuid(),
        norad_id=99999,
        name="PrimarySat",
        object_type="satellite",
    )
    secondary = Satellite(
        id=generate_uuid(),
        norad_id=88888,
        name="SecondarySat",
        object_type="satellite",
    )
    db_session.add_all([primary, secondary])
    await db_session.flush()

    # Add simple TLEs (valid format required by skyfield)
    tle1 = "1 99999U 20000A   24001.00000000  .00000000  00000-0  00000-0 0  9991"
    tle2 = "2 99999  98.0000   0.0000 0000001  0.0000   0.0000 14.00000000    01"
    primary_orbit = Orbit(
        id=generate_uuid(),
        satellite_id=primary.id,
        epoch=datetime.utcnow(),
        tle_line1=tle1,
        tle_line2=tle2,
    )
    # Secondary satellite also needs a TLE for the screening tool
    tle3 = "1 88888U 20001A   24001.00000000  .00000000  00000-0  00000-0 0  9991"
    tle4 = "2 88888  98.0000   0.0000 0000001  0.0000   0.0000 14.00000000    01"
    secondary_orbit = Orbit(
        id=generate_uuid(),
        satellite_id=secondary.id,
        epoch=datetime.utcnow(),
        tle_line1=tle3,
        tle_line2=tle4,
    )
    db_session.add_all([primary_orbit, secondary_orbit])
    await db_session.flush()

    # Conjunction event with low risk
    conj = ConjunctionEvent(
        id=generate_uuid(),
        primary_object_id=primary.id,
        secondary_object_id=secondary.id,
        tca=datetime.utcnow().replace(tzinfo=timezone.utc),
        miss_distance_km=20.0,
        risk_level="low",
        collision_probability=1e-6,
    )
    db_session.add(conj)
    await db_session.flush()

    # Detour analysis linked to the event (pending status)
    analysis = DetourConjunctionAnalysis(
        id=generate_uuid(),
        conjunction_event_id=conj.id,
        tenant_id="default",
        risk_level=conj.risk_level,
        miss_distance_km=conj.miss_distance_km,
        tca=conj.tca,
        collision_probability=conj.collision_probability,
        analysis_status="pending",
    )
    db_session.add(analysis)
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

    assert final_state["session_id"] == session_id
    assert final_state["maneuver_options"] == []
    safety = final_state.get("safety_review")
    assert safety is not None
    assert safety["approved"] is False
    ops_brief = final_state.get("ops_brief")
    assert ops_brief is not None
    assert ops_brief["recommended_action"] == "monitor"
    assert final_state["completed"] is True
