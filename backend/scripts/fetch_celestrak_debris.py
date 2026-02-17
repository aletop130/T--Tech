WRITE_TARGET="/root/T--Tech/backend/scripts/fetch_celestrak_debris.py"
WRITE_CONTENT_LENGTH=0
#!/usr/bin/env python3
"""Fetch debris TLE data from Celestrak.

Downloads the TLE file from Celestrak (default URL provided) and returns
the raw text. The URL can be overridden via the ``CELERTRAK_DEBRIS_URL``
environment variable.
"""

import os
import asyncio
import httpx

DEFAULT_URL = "https://celestrak.com/NORAD/elements/debris.txt"

async def fetch_debris_tle(url: str | None = None) -> str:
    """Fetch the debris TLE catalog from Celestrak.

    Args:
        url: Optional custom URL. If not provided, the environment variable
            ``CELERTRAK_DEBRIS_URL`` is consulted, falling back to the default
            Celestrak URL.

    Returns:
        The raw TLE file as a string.
    """
    # Resolve URL
    target_url = url or os.getenv("CELERTRAK_DEBRIS_URL", DEFAULT_URL)

    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            response = await client.get(target_url, follow_redirects=True)
            response.raise_for_status()
            return response.text
        except httpx.HTTPError as e:
            # Print warning and return empty string on failure
            print(f"Failed to fetch debris TLE data: {e}")
            return ""

async def main():
    tle_text = await fetch_debris_tle()
    # Simple verification output – print number of lines fetched
    line_count = tle_text.count("\n")
    print(f"Fetched debris TLE data: {line_count} lines")

if __name__ == "__main__":
    asyncio.run(main())
