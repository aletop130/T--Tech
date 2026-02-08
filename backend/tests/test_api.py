"""API endpoint tests."""
import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_health_check(client: AsyncClient):
    """Test health check endpoint."""
    response = await client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"


@pytest.mark.asyncio
async def test_root_endpoint(client: AsyncClient):
    """Test root endpoint."""
    response = await client.get("/")
    assert response.status_code == 200
    data = response.json()
    assert "name" in data
    assert "version" in data


@pytest.mark.asyncio
async def test_list_satellites_empty(client: AsyncClient):
    """Test listing satellites when empty."""
    response = await client.get(
        "/api/v1/ontology/satellites",
        headers={"X-Tenant-ID": "default"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["items"] == []
    assert data["total"] == 0


@pytest.mark.asyncio
async def test_list_ground_stations_empty(client: AsyncClient):
    """Test listing ground stations when empty."""
    response = await client.get(
        "/api/v1/ontology/ground-stations",
        headers={"X-Tenant-ID": "default"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["items"] == []


@pytest.mark.asyncio
async def test_list_incidents_empty(client: AsyncClient):
    """Test listing incidents when empty."""
    response = await client.get(
        "/api/v1/incidents",
        headers={"X-Tenant-ID": "default"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["items"] == []


@pytest.mark.asyncio
async def test_incident_stats(client: AsyncClient):
    """Test incident statistics."""
    response = await client.get(
        "/api/v1/incidents/stats",
        headers={"X-Tenant-ID": "default"},
    )
    assert response.status_code == 200
    data = response.json()
    assert "total" in data
    assert "by_status" in data
    assert "by_severity" in data


@pytest.mark.asyncio
async def test_search_empty(client: AsyncClient):
    """Test global search with no results."""
    response = await client.get(
        "/api/v1/search?q=nonexistent",
        headers={"X-Tenant-ID": "default"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data == []

