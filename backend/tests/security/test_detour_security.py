WRITE_TARGET="backend/tests/security/test_detour_security.py"
WRITE_CONTENT_LENGTH=0

import pytest
from datetime import datetime, timezone

from app.db.base import generate_uuid
from app.db.models.ontology import Satellite, ConjunctionEvent
from app.db.models.detour import (
    DetourSatelliteState,
    DetourConjunctionAnalysis,
    DetourManeuverPlan,
    DetourManeuverStatus,
)
from app.core.security import TokenData
from app.api.deps import get_current_user
from app.main import app

# ---------------------------------------------------------------------------
# Security / Isolation Tests
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_cross_tenant_isolation(client, db_session):
    """A satellite state belonging to tenantA must not be visible to tenantB."""
    # Create a satellite
    sat = Satellite(
        id=generate_uuid(), norad_id=50001, name="CrossTenantSat", object_type="satellite"
    )
    db_session.add(sat)
    await db_session.flush()

    # State for tenantA only
    state = DetourSatelliteState(
        id=generate_uuid(),
        satellite_id=sat.id,
        tenant_id="tenantA",
        fuel_remaining_kg=100.0,
        delta_v_budget_m_s=500.0,
    )
    db_session.add(state)
    await db_session.flush()

    # Attempt to fetch with a different tenant header
    resp = await client.get(
        f"/api/v1/detour/satellites/{sat.id}/state",
        headers={"X-Tenant-ID": "tenantB"},
    )
    assert resp.status_code == 404
    err = resp.json()
    assert err["type"].endswith("not-found")
    assert err.get("resource_type") == "DetourSatelliteState"

# ---------------------------------------------------------------------------
# Deprecation Tests for Maneuver Execution
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_execute_maneuver_endpoint_deprecated(client, db_session):
    """Maneuver execution endpoint is deprecated after upstream cutover."""
    # Minimal setup: primary and secondary satellites, conjunction, analysis, approved plan
    primary = Satellite(
        id=generate_uuid(), norad_id=60001, name="PrimaryRBAC", object_type="satellite"
    )
    secondary = Satellite(
        id=generate_uuid(), norad_id=60002, name="SecondaryRBAC", object_type="satellite"
    )
    db_session.add_all([primary, secondary])
    await db_session.flush()

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

    analysis = DetourConjunctionAnalysis(
        id=generate_uuid(),
        conjunction_event_id=conj.id,
        tenant_id="default",
        risk_level="high",
        miss_distance_km=3.0,
        tca=conj.tca,
        collision_probability=conj.collision_probability,
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
        fuel_cost_kg=1.0,
        status=DetourManeuverStatus.APPROVED,
    )
    db_session.add(plan)
    await db_session.flush()

    # Override the user dependency to verify endpoint behavior is independent
    # of prior RBAC branch (now deprecated).
    async def _non_admin_user():
        return TokenData(sub="nonadmin", tenant_id="default", roles=["analyst"])

    app.dependency_overrides[get_current_user] = _non_admin_user
    try:
        resp = await client.post(f"/api/v1/detour/maneuvers/{plan.id}/execute")
        assert resp.status_code == 501
        err = resp.json()
        assert err["type"].endswith("endpoint-deprecated")
        assert err["deprecated"] is True
    finally:
        # Clean up the override regardless of test outcome
        app.dependency_overrides.pop(get_current_user, None)

# ---------------------------------------------------------------------------
# SQL Injection Sanitization Test
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_sql_injection_sanitization(client, db_session):
    """A malicious path parameter must not cause SQL injection or server error."""
    sat = Satellite(
        id=generate_uuid(), norad_id=70001, name="NormalSat", object_type="satellite"
    )
    db_session.add(sat)
    await db_session.flush()
    state = DetourSatelliteState(
        id=generate_uuid(),
        satellite_id=sat.id,
        tenant_id="default",
        fuel_remaining_kg=100.0,
        delta_v_budget_m_s=500.0,
    )
    db_session.add(state)
    await db_session.flush()

    injection = "invalid'; DROP TABLE detour_satellite_state;--"
    resp = await client.get(
        f"/api/v1/detour/satellites/{injection}/state",
        headers={"X-Tenant-ID": "default"},
    )
    # Server should respond with 404 Not Found, not 500 Internal Server Error
    assert resp.status_code == 404
    # Verify the legitimate record is still present
    fetched = await db_session.get(DetourSatelliteState, state.id)
    assert fetched is not None

# ---------------------------------------------------------------------------
# SSE Authentication / Content Type Test
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_sse_endpoint_returns_event_stream(client):
    """The AI chat streaming endpoint returns a text/event-stream response."""
    resp = await client.post(
        "/api/v1/ai/chat/stream",
        json={"messages": []},
    )
    assert resp.status_code == 200
    # The content type should start with text/event-stream
    assert resp.headers["content-type"].startswith("text/event-stream")
    # Because the AI service is not configured, the payload includes an error event
    assert "data:" in resp.text
    assert "[DONE]" in resp.text

# ---------------------------------------------------------------------------
# Rate Limit Error Structure Test
# ---------------------------------------------------------------------------

def test_rate_limit_error_structure():
    from app.core.exceptions import RateLimitError
    err = RateLimitError(limit=10, window=60)
    assert err.status_code == 429
    prob = err.to_problem_json()
    assert prob["type"].endswith("rate-limit-exceeded")
    assert prob["detail"] == "Rate limit of 10 requests per 60s exceeded"
    assert prob["limit"] == 10
    assert prob["window_seconds"] == 60
