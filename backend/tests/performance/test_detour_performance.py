'''Performance tests for Detour system.

These tests verify that key operations meet the performance targets
specified in the implementation plan.
'''

import asyncio
import time
from datetime import datetime

import pytest
from app.db.base import generate_uuid
from app.db.models.ontology import Satellite, Orbit, ConjunctionEvent
from app.services.detour.state_manager import DetourStateManager
from app.agents.detour.tools import screen_conjunctions_tool
from app.agents.detour.graph import run_detour_pipeline

def dummy_tle(norad_id: int) -> tuple[str, str]:
    '''Return a simple TLE pair for a given NORAD ID.'''
    line1 = f'1 {norad_id:05d}U 20000A   24001.00000000  .00000000  00000-0  00000-0 0  9991'
    line2 = f'2 {norad_id:05d}  98.0000   0.0000 0000001  0.0000   0.0000 14.00000000    01'
    return line1, line2

@pytest.mark.asyncio
async def test_screening_performance(db_session):
    '''Screening 1000 objects should complete in <5 seconds.'''
    primary = Satellite(id=generate_uuid(), norad_id=10001, name='PrimSat', object_type='satellite')
    db_session.add(primary)
    await db_session.flush()
    tle1, tle2 = dummy_tle(10001)
    primary_orbit = Orbit(id=generate_uuid(), satellite_id=primary.id, epoch=datetime.utcnow(),
                          tle_line1=tle1, tle_line2=tle2)
    db_session.add(primary_orbit)
    await db_session.flush()
    for i in range(1000):
        sat = Satellite(id=generate_uuid(), norad_id=20000 + i,
                        name=f'SecSat{i}', object_type='satellite')
        db_session.add(sat)
        await db_session.flush()
        tle_sec1, tle_sec2 = dummy_tle(20000 + i)
        orbit = Orbit(id=generate_uuid(), satellite_id=sat.id, epoch=datetime.utcnow(),
                      tle_line1=tle_sec1, tle_line2=tle_sec2)
        db_session.add(orbit)
        await db_session.flush()
    start = time.perf_counter()
    result = await screen_conjunctions_tool(satellite_id=primary.id,
                                            time_window_hours=72,
                                            threshold_km=5.0,
                                            db=db_session)
    elapsed = time.perf_counter() - start
    assert isinstance(result, dict)
    assert 'screening_results' in result
    assert elapsed < 5.0, f'Screening took too long: {elapsed:.2f}s'

@pytest.mark.asyncio
async def test_pipeline_latency(db_session):
    '''Full pipeline should finish within 30 seconds for a critical conjunction.'''
    primary = Satellite(id=generate_uuid(), norad_id=11000, name='PrimSat', object_type='satellite')
    db_session.add(primary)
    await db_session.flush()
    tle1, tle2 = dummy_tle(11000)
    primary_orbit = Orbit(id=generate_uuid(), satellite_id=primary.id, epoch=datetime.utcnow(),
                          tle_line1=tle1, tle_line2=tle2)
    db_session.add(primary_orbit)
    await db_session.flush()
    secondary = Satellite(id=generate_uuid(), norad_id=11001, name='SecSat', object_type='satellite')
    db_session.add(secondary)
    await db_session.flush()
    tle_sec1, tle_sec2 = dummy_tle(11001)
    secondary_orbit = Orbit(id=generate_uuid(), satellite_id=secondary.id, epoch=datetime.utcnow(),
                            tle_line1=tle_sec1, tle_line2=tle_sec2)
    db_session.add(secondary_orbit)
    await db_session.flush()
    conj = ConjunctionEvent(id=generate_uuid(),
                            primary_object_id=primary.id,
                            secondary_object_id=secondary.id,
                            tca=datetime.utcnow(),
                            miss_distance_km=0.0,
                            risk_level='high',
                            collision_probability=0.5)
    db_session.add(conj)
    await db_session.flush()
    state_manager = DetourStateManager(db_session)
    session_id = generate_uuid()
    start = time.perf_counter()
    final_state = await run_detour_pipeline(session_id=session_id,
                                            satellite_id=primary.id,
                                            conjunction_event_id=conj.id,
                                            tenant_id='default',
                                            state_manager=state_manager)
    elapsed = time.perf_counter() - start
    assert final_state.get('completed') is True
    assert elapsed < 30.0, f'Pipeline exceeded latency budget: {elapsed:.2f}s'
