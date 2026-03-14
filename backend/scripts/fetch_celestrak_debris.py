#!/usr/bin/env python3
"""Fetch debris TLE data from CelesTrak and import into the SDA database.

Downloads debris TLE data from known CelesTrak fragmentation groups
(COSMOS 1408, Fengyun 1C, Iridium 33, COSMOS 2251) and stores each
debris object as a ``Satellite`` with ``object_type='debris'`` and an
associated ``Orbit`` containing the TLE lines with the correct epoch.

The URL can be overridden via the ``CELERTRAK_DEBRIS_URL`` environment
variable.
"""

import asyncio

from app.services.debris_import import fetch_debris_tle, import_debris


async def main(tenant_id: str = "default"):
    print("Fetching debris TLE data from CelesTrak debris groups...")
    tle_text = await fetch_debris_tle()
    line_count = tle_text.count("\n")
    print(f"Fetched debris TLE data: {line_count} lines")
    await import_debris(tle_text, tenant_id=tenant_id)


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Fetch and import CelesTrak debris TLE data")
    parser.add_argument("--tenant", default="default", help="Tenant ID for import")
    args = parser.parse_args()
    asyncio.run(main(tenant_id=args.tenant))
