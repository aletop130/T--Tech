"""Integration test for the Celestrak debris import FastAPI endpoint.

The endpoint `POST /api/v1/ontology/debris/fetch-celestrak` calls the same
service functions used by the CLI script.  Here we replace those service
functions with mocks so the test runs fast and without external HTTP calls.
"""

import pytest
from httpx import AsyncClient

@pytest.mark.asyncio
async def test_fetch_celestrak_endpoint(monkeypatch, client: AsyncClient):
    """POST /api/v1/ontology/debris/fetch-celestrak returns import count."""
    # Mock fetch_debris_tle to return a tiny TLE payload
    async def mock_fetch():
        return "1 99999U 20000A   24001.00000000  .00000000  00000-0  00000-0 0  9991\n2 99999  98.0000   0.0000 0000001  0.0000   0.0000 14.00000000    01"

    # Mock import_debris to verify the payload and return a count
    async def mock_import(tle_text, tenant_id="default", user_id="fetch_celestrak_debris"):
        assert "99999U" in tle_text
        return 1  # Simulate one debris object imported

    import app.api.v1.ontology as ontology_mod
    monkeypatch.setattr(ontology_mod, "fetch_debris_tle", mock_fetch)
    monkeypatch.setattr(ontology_mod, "import_debris", mock_import)

    response = await client.post(
        "/api/v1/ontology/debris/fetch-celestrak",
        headers={"X-Tenant-ID": "default"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["imported"] == 1
