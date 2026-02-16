import json
import pytest
from app.db.base import generate_uuid

@pytest.mark.asyncio
async def test_detour_status_sse(client, db_session):
    """Ensure SSE endpoint returns proper content type and payload."""
    session_id = generate_uuid()
    resp = await client.get(
        f"/api/v1/detour/sessions/{session_id}/status",
        headers={"Accept": "text/event-stream"},
    )
    assert resp.status_code == 200
    assert resp.headers["content-type"].startswith("text/event-stream")
    text_bytes = await resp.aread()
    content = text_bytes.decode()
    assert "data:" in content
    # extract JSON payload after "data: " and before newline
    # SSE format: data: {...}\n\n

    # Find the part after "data: " and before the next newline.
    json_part = content.split("data: ", 1)[1].split("\n", 1)[0]
    payload = json.loads(json_part)
    assert payload["session_id"] == session_id
    assert payload["status"] == "active"

