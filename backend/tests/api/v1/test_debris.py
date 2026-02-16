# Tests for Debris API endpoints.

"""Backend unit tests for debris visualization endpoints.

The tests cover:
- Retrieval of debris list (`GET /api/v1/ontology/debris`).
- Retrieval of debris with TLE data (`GET /api/v1/ontology/debris/with-orbits`).
- Orbit propagation endpoint (`GET /api/v1/ontology/orbit`).
- Tenant isolation (different `X-Tenant-ID` headers).

All tests use the provided `client` and `db_session` fixtures.
"""

import pytest
from datetime import datetime, timezone, timedelta

from app.db.base import generate_uuid
from app.db.models.ontology import Satellite, Orbit

# Helper TLE lines (simple, valid format)
TLE_LINE1 = "1 30001U 20000A   24001.00000000  .00000000  00000-0  00000-0 0  9991"
TLE_LINE2 = "2 30001  98.0000   0.0000 0000001  0.0000   0.0000 14.00000000    01"


@pytest.mark.asyncio
async def test_get_debris_returns_expected_structure(client, db_session):
    """GET /api/v1/ontology/debris returns a DebrisResponse with objects.
    """
    # Create a debris satellite for the default tenant
    sat = Satellite(
        id=generate_uuid(),
        norad_id=30001,
        name="Debris 1",
        object_type="debris",
        tenant_id="default",
        is_active=True,
    )
    db_session.add(sat)
    await db_session.flush()

    # Attach an orbit with TLE (altitude fields left as None, endpoint will default to 0.0)
    orb = Orbit(
        id=generate_uuid(),
        satellite_id=sat.id,
        epoch=datetime.utcnow(),
        tle_line1=TLE_LINE1,
        tle_line2=TLE_LINE2,
        tenant_id="default",
    )
    db_session.add(orb)
    await db_session.flush()

    # Query the debris endpoint
    response = await client.get(
        "/api/v1/ontology/debris",
        headers={"X-Tenant-ID": "default"},
    )
    assert response.status_code == 200
    data = response.json()
    # Verify top‑level fields
    assert "timeUtc" in data
    assert isinstance(data["timeUtc"], str)
    assert "objects" in data
    assert isinstance(data["objects"], list)
    # Should contain exactly one object for this tenant
    assert len(data["objects"]) == 1
    obj = data["objects"][0]
    # Verify object fields and alias handling
    assert obj["noradId"] == 30001
    # Verify lat/lon are reasonable floats
    assert isinstance(obj["lat"], float)
    assert isinstance(obj["lon"], float)
    assert -90.0 <= obj["lat"] <= 90.0
    assert -180.0 <= obj["lon"] <= 180.0
    # altKm should be positive (derived from TLE propagation)
    assert isinstance(obj["altKm"], float)
    assert obj["altKm"] > 0


@pytest.mark.asyncio
async def test_get_debris_with_orbits_includes_tle(client, db_session):
    """GET /api/v1/ontology/debris/with-orbits returns TLE lines.
    """
    sat = Satellite(
        id=generate_uuid(),
        norad_id=40001,
        name="Debris 2",
        object_type="debris",
        tenant_id="default",
        is_active=True,
    )
    db_session.add(sat)
    await db_session.flush()

    orb = Orbit(
        id=generate_uuid(),
        satellite_id=sat.id,
        epoch=datetime.utcnow(),
        tle_line1=TLE_LINE1,
        tle_line2=TLE_LINE2,
        tenant_id="default",
    )
    db_session.add(orb)
    await db_session.flush()

    response = await client.get(
        "/api/v1/ontology/debris/with-orbits",
        headers={"X-Tenant-ID": "default"},
    )
    assert response.status_code == 200
    data = response.json()
    # Should be a list of debris with orbit info
    assert isinstance(data, list)
    assert len(data) == 1
    entry = data[0]
    assert entry["noradId"] == 40001
    assert entry["tle_line1"] == TLE_LINE1
    assert entry["tle_line2"] == TLE_LINE2
    # Verify lat/lon are reasonable floats and altitude > 0
    assert isinstance(entry["lat"], float)
    assert isinstance(entry["lon"], float)
    assert -90.0 <= entry["lat"] <= 90.0
    assert -180.0 <= entry["lon"] <= 180.0
    assert isinstance(entry["altKm"], float)
    assert entry["altKm"] > 0


@pytest.mark.asyncio
async def test_orbit_propagation_endpoint(client, db_session):
    """GET /api/v1/ontology/orbit returns propagated points.
    """
    # Create a satellite and an orbit with valid TLE for propagation
    sat = Satellite(
        id=generate_uuid(),
        norad_id=50001,
        name="Satellite for Orbit",
        object_type="satellite",
        tenant_id="default",
        is_active=True,
    )
    db_session.add(sat)
    await db_session.flush()

    orb = Orbit(
        id=generate_uuid(),
        satellite_id=sat.id,
        epoch=datetime.utcnow(),
        tle_line1=TLE_LINE1,
        tle_line2=TLE_LINE2,
        tenant_id="default",
    )
    db_session.add(orb)
    await db_session.flush()

    # Use default minutes=180, stepSec=60 => 181 points expected
    response = await client.get(
        "/api/v1/ontology/orbit",
        params={"norad": 50001},
        headers={"X-Tenant-ID": "default"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["noradId"] == 50001
    # Verify stepSec defaults to 60
    assert data["stepSec"] == 60
    # timeStartUtc should be ISO string ending with Z
    assert data["timeStartUtc"].endswith("Z")
    points = data["points"]
    # Expect 181 points (including start and end)
    assert len(points) == 181
    # Verify structure of a point
    point = points[0]
    assert "tUtc" in point
    assert "lat" in point
    assert "lon" in point
    assert "altKm" in point
    # Values should be numeric and roughly realistic (altitude > 0)
    assert isinstance(point["lat"], float)
    assert isinstance(point["lon"], float)
    assert isinstance(point["altKm"], float)
    assert point["altKm"] > 0


@pytest.mark.asyncio
async def test_tenant_isolation_for_debris(client, db_session):
    """Debris endpoints respect the X‑Tenant‑ID header.
    """
    # Debris for default tenant
    default_sat = Satellite(
        id=generate_uuid(),
        norad_id=60001,
        name="Default Tenant Debris",
        object_type="debris",
        tenant_id="default",
        is_active=True,
    )
    db_session.add(default_sat)
    await db_session.flush()
    default_orb = Orbit(
        id=generate_uuid(),
        satellite_id=default_sat.id,
        epoch=datetime.utcnow(),
        tle_line1=TLE_LINE1,
        tle_line2=TLE_LINE2,
        tenant_id="default",
    )
    db_session.add(default_orb)
    await db_session.flush()

    # Debris for a secondary tenant
    other_sat = Satellite(
        id=generate_uuid(),
        norad_id=60002,
        name="Other Tenant Debris",
        object_type="debris",
        tenant_id="other",
        is_active=True,
    )
    db_session.add(other_sat)
    await db_session.flush()
    other_orb = Orbit(
        id=generate_uuid(),
        satellite_id=other_sat.id,
        epoch=datetime.utcnow(),
        tle_line1=TLE_LINE1,
        tle_line2=TLE_LINE2,
        tenant_id="other",
    )
    db_session.add(other_orb)
    await db_session.flush()

    # Query with default tenant header – should see only its own debris
    resp_default = await client.get(
        "/api/v1/ontology/debris",
        headers={"X-Tenant-ID": "default"},
    )
    assert resp_default.status_code == 200
    data_def = resp_default.json()
    assert len(data_def["objects"]) == 1
    assert data_def["objects"][0]["noradId"] == 60001

    # Query with other tenant header – should see only its own debris
    resp_other = await client.get(
        "/api/v1/ontology/debris",
        headers={"X-Tenant-ID": "other"},
    )
    assert resp_other.status_code == 200
    data_oth = resp_other.json()
    assert len(data_oth["objects"]) == 1
    assert data_oth["objects"][0]["noradId"] == 60002
