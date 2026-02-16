# Tests for Detour database models

"""Unit tests covering the core Detour ORM models.

These tests verify:
- Basic CRUD (create, read, update) operations.
- Default enum values are set correctly.
- Relationships between models are functional.
- Foreign‑key constraints raise an ``IntegrityError`` when violated.
"""

import pytest
from datetime import datetime
from sqlalchemy.exc import IntegrityError

from app.db.base import generate_uuid
from app.db.models.ontology import Satellite, ConjunctionEvent
from app.db.models.detour import (
    DetourSatelliteState,
    DetourConjunctionAnalysis,
    DetourAnalysisStatus,
    DetourManeuverPlan,
    DetourManeuverStatus,
    DetourAgentSession,
    DetourAgentSessionStatus,
)

@pytest.mark.asyncio
async def test_detour_satellite_state_crud(db_session):
    """Create a satellite and its detour state, then read back."""
    sat = Satellite(
        id=generate_uuid(),
        norad_id=50001,
        name="TestSat",
        object_type="satellite",
    )
    db_session.add(sat)
    await db_session.flush()

    state = DetourSatelliteState(
        id=generate_uuid(),
        satellite_id=sat.id,
        tenant_id="default",
        fuel_remaining_kg=55.0,
        delta_v_budget_m_s=300.0,
    )
    db_session.add(state)
    await db_session.flush()

    fetched = await db_session.get(DetourSatelliteState, state.id)
    assert fetched is not None
    assert fetched.satellite.id == sat.id
    assert fetched.fuel_remaining_kg == pytest.approx(55.0)
    assert fetched.delta_v_budget_m_s == pytest.approx(300.0)

@pytest.mark.asyncio
async def test_detour_satellite_state_fk_failure(db_session):
    """Inserting a state with a non‑existent satellite should fail."""
    state = DetourSatelliteState(
        id=generate_uuid(),
        satellite_id="nonexistent-id",
        tenant_id="default",
    )
    db_session.add(state)
    with pytest.raises(IntegrityError):
        await db_session.flush()

@pytest.mark.asyncio
async def test_detour_conjunction_analysis_defaults_and_relationship(db_session):
    """Check default enum value and relationship to ``ConjunctionEvent``."""
    # Create two satellites for the conjunction event
    primary = Satellite(
        id=generate_uuid(), norad_id=60001, name="Primary", object_type="satellite"
    )
    secondary = Satellite(
        id=generate_uuid(), norad_id=60002, name="Secondary", object_type="satellite"
    )
    db_session.add_all([primary, secondary])
    await db_session.flush()

    conj = ConjunctionEvent(
        id=generate_uuid(),
        primary_object_id=primary.id,
        secondary_object_id=secondary.id,
        tca=datetime.utcnow(),
        miss_distance_km=2.5,
        risk_level="high",
    )
    db_session.add(conj)
    await db_session.flush()

    analysis = DetourConjunctionAnalysis(
        id=generate_uuid(),
        conjunction_event_id=conj.id,
        tenant_id="default",
        risk_level=conj.risk_level,
        miss_distance_km=conj.miss_distance_km,
        tca=conj.tca,
    )
    db_session.add(analysis)
    await db_session.flush()

    # Default status should be ``PENDING``
    assert analysis.analysis_status == DetourAnalysisStatus.PENDING

    # Relationship back to the ``ConjunctionEvent``
    fetched_event = await db_session.get(ConjunctionEvent, conj.id)
    assert fetched_event.detour_analysis[0].id == analysis.id

@pytest.mark.asyncio
async def test_detour_maneuver_plan_defaults_and_relationship(db_session):
    """Create a maneuver plan and verify defaults and reverse relationship."""
    # Minimal setup: satellite + conjunction event + analysis
    sat = Satellite(
        id=generate_uuid(), norad_id=70001, name="SatM", object_type="satellite"
    )
    other = Satellite(
        id=generate_uuid(), norad_id=70002, name="OtherM", object_type="satellite"
    )
    db_session.add_all([sat, other])
    await db_session.flush()

    conj = ConjunctionEvent(
        id=generate_uuid(),
        primary_object_id=sat.id,
        secondary_object_id=other.id,
        tca=datetime.utcnow(),
        miss_distance_km=4.0,
        risk_level="medium",
    )
    db_session.add(conj)
    await db_session.flush()

    analysis = DetourConjunctionAnalysis(
        id=generate_uuid(),
        conjunction_event_id=conj.id,
        tenant_id="default",
        risk_level=conj.risk_level,
        miss_distance_km=conj.miss_distance_km,
        tca=conj.tca,
        analysis_status="completed",
    )
    db_session.add(analysis)
    await db_session.flush()

    plan = DetourManeuverPlan(
        id=generate_uuid(),
        conjunction_analysis_id=analysis.id,
        tenant_id="default",
        maneuver_type="in_plane",
        delta_v_m_s=0.1,
        fuel_cost_kg=2.0,
    )
    db_session.add(plan)
    await db_session.flush()

    # Default status should be PROPOSED
    assert plan.status == DetourManeuverStatus.PROPOSED

    # Reverse relationship: analysis.maneuver_plans should contain the plan
    fetched_analysis = await db_session.get(DetourConjunctionAnalysis, analysis.id)
    assert fetched_analysis.maneuver_plans[0].id == plan.id

@pytest.mark.asyncio
async def test_detour_agent_session_defaults(db_session):
    """Create an agent session and verify the default status."""
    session = DetourAgentSession(
        id=generate_uuid(),
        tenant_id="default",
        session_type="detour_pipeline",
        input_data={"step": "start"},
    )
    db_session.add(session)
    await db_session.flush()

    assert session.status == DetourAgentSessionStatus.ACTIVE
    # Ensure timestamps are populated via ``TimestampMixin``
    assert isinstance(session.created_at, datetime)
    assert isinstance(session.updated_at, datetime)

