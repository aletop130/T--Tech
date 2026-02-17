"""Tests for parse_tle and fetch_debris_tle utilities.

These tests verify that the TLE parsing logic works correctly and that the HTTP
fetch function can be mocked to avoid real network calls.
"""

import pytest
import httpx
from app.services.debris_import import parse_tle, fetch_debris_tle

# Sample TLE payload with two entries and optional name lines
SAMPLE_TLE = """DEBRIS ONE
1 12345U 20000A   24001.00000000  .00000000  00000-0  00000-0 0  9991
2 12345  98.0000   0.0000 0000001  0.0000   0.0000 14.00000000    01
ANOTHER DEBRIS
1 67890U 20000A   24001.00000000  .00000000  00000-0  00000-0 0  9991
2 67890  98.0000   0.0000 0000001  0.0000   0.0000 14.00000000    01
"""

@pytest.mark.asyncio
async def test_fetch_debris_tle_mock(monkeypatch):
    """Mock httpx.AsyncClient to avoid real network I/O."""
    class MockResponse:
        def __init__(self, text: str):
            self.text = text
        def raise_for_status(self):
            pass

    class MockClient:
        async def __aenter__(self):
            return self
        async def __aexit__(self, exc_type, exc, tb):
            pass
        async def get(self, url, follow_redirects=True):
            return MockResponse("mocked TLE payload")

    monkeypatch.setattr(httpx, "AsyncClient", lambda timeout=30.0: MockClient())
    result = await fetch_debris_tle()
    assert result == "mocked TLE payload"

def test_parse_tle_returns_expected():
    """Ensure parse_tle extracts the expected tuples from raw text."""
    parsed = parse_tle(SAMPLE_TLE)
    assert len(parsed) == 2
    # First entry checks
    norad1, line1_1, line2_1 = parsed[0]
    assert norad1 == 12345
    assert line1_1.startswith("1 12345")
    assert line2_1.startswith("2 12345")
    # Second entry checks
    norad2, line1_2, line2_2 = parsed[1]
    assert norad2 == 67890
    assert line1_2.startswith("1 67890")
    assert line2_2.startswith("2 67890")
