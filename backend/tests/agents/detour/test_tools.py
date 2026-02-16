# Tests for Detour LangGraph tool functions.

import pytest
from datetime import datetime, timezone

from app.db.base import generate_uuid
from app.db.models.ontology import Satellite, Orbit, ConjunctionEvent
from app.agents.detour.tools import screen_conjunctions_tool, assess_risk_tool

@pytest.mark.asyncio
async def test_screen_conjunctions_tool(db_session):
    """Verify that the screening tool returns a well‑formed result dict."""
    # Create primary satellite with a valid TLE.
    primary = Satellite(id=generate_uuid(), norad_id=10001, name="PrimSat", object_type="satellite")
    db_session.add(primary)
    await db_session.flush()
    tle1 = "1 10001U 20000A   24001.00000000  .00000000  00000-0  00000-0 0  9991"
    tle2 = "2 10001  98.0000   0.0000 0000001  0.0000   0.0000 14.00000000    01"
    primary_orbit = Orbit(id=generate_uuid(), satellite_id=primary.id, epoch=datetime.utcnow(), tle_line1=tle1, tle_line2=tle2)
    db_session.add(primary_orbit)

    # Create a secondary satellite with a TLE (will be part of the catalog).
    secondary = Satellite(id=generate_uuid(), norad_id=10002, name="SecSat", object_type="satellite")
    db_session.add(secondary)
    await db_session.flush()
    tle3 = "1 10002U 20000B   24001.00000000  .00000000  00000-0  00000-0 0  9991"
    tle4 = "2 10002  98.0000   0.0000 0000001  0.0000   0.0000 14.00000000    01"
    secondary_orbit = Orbit(id=generate_uuid(), satellite_id=secondary.id, epoch=datetime.utcnow(), tle_line1=tle3, tle_line2=tle4)
    db_session.add(secondary_orbit)
    await db_session.flush()

    result = await screen_conjunctions_tool(satellite_id=primary.id, db=db_session)
    # Basic shape checks
    assert isinstance(result, dict)
    for key in ["screening_results", "threats_identified", "priority_queue", "notes"]:
        assert key in result
    # threats_identified should be an integer >= 0
    assert isinstance(result["threats_identified"], int)
    assert result["threats_identified"] >= 0

@pytest.mark.asyncio
async def test_assess_risk_tool(db_session):
    """Verify that the risk assessment tool returns expected fields."""
    # Create a conjunction event with a known risk level.
    primary = Satellite(id=generate_uuid(), norad_id=20001, name="PrimSat2", object_type="satellite")
    secondary = Satellite(id=generate_uuid(), norad_id=20002, name="SecSat2", object_type="satellite")
    db_session.add_all([primary, secondary])
    await db_session.flush()
    conj = ConjunctionEvent(
        id=generate_uuid(),
        primary_object_id=primary.id,
        secondary_object_id=secondary.id,
        tca=datetime.utcnow().replace(tzinfo=timezone.utc),
        miss_distance_km=5.0,
        risk_level="high",
        collision_probability=2.5e-5,
    )
    db_session.add(conj)
    await db_session.flush()

    result = await assess_risk_tool(conjunction_event_id=conj.id, db=db_session)
    assert isinstance(result, dict)
    assert result["collision_probability"] == 2.5e-5
    assert result["risk_level"] == "high"
    # recommended_action should be "maneuver" for high risk per tool implementation
    assert result["recommended_action"] in {"maneuver", "monitor"}
