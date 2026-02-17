#!/usr/bin/env python3
"""Fetch debris TLE data from Celestrak and import into the SDA database.

This script downloads the debris TLE catalog (default URL provided) and parses
the TLE entries. It then stores each debris object as a ``Satellite`` with
``object_type='debris'`` and creates an associated ``Orbit`` containing the
TLE lines.

The URL can be overridden via the ``CELERTRAK_DEBRIS_URL`` environment
variable.
"""

import os
import asyncio
from datetime import datetime
from typing import List, Tuple

import httpx

# Local imports – these use the application's service layer for consistency
from app.db.base import async_session_factory
from app.services.ontology import OntologyService
from app.services.audit import AuditService
from app.schemas.ontology import SatelliteCreate, OrbitCreate
from app.db.models.ontology import ObjectType

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


def parse_tle(text: str) -> List[Tuple[int, str, str]]:
    """Parse a raw TLE text block.

    The input is expected to contain one or more TLE entries. Each entry may
    optionally start with a name line, followed by the two standard TLE lines.
    This function extracts the NORAD ID from the first line and returns a list
    of ``(norad_id, line1, line2)`` tuples.
    """
    lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
    result: List[Tuple[int, str, str]] = []
    i = 0
    while i < len(lines):
        line = lines[i]
        if line.startswith("1 "):
            # This line is the first TLE line; the next line should be line 2
            line1 = line
            if i + 1 < len(lines):
                line2 = lines[i + 1]
            else:
                break
            try:
                norad_id = int(''.join(ch for ch in line1.split()[1] if ch.isdigit()))
                result.append((norad_id, line1, line2))
            except (IndexError, ValueError):
                # Skip malformed entry
                pass
            i += 2
        else:
            # Skip possible name line and continue searching
            i += 1
    return result


async def import_debris(
    tle_text: str,
    tenant_id: str = "default",
    user_id: str = "fetch_celestrak_debris",
) -> int:
    """Persist parsed TLE data into the database.

    Returns the number of TLE entries processed.
    """
    parsed = parse_tle(tle_text)
    if not parsed:
        print("No valid TLE entries found to import.")
        return 0

    async with async_session_factory() as session:
        audit = AuditService(session)
        ontology = OntologyService(session, audit)
        processed = 0
        for norad_id, line1, line2 in parsed:
            # Ensure a satellite record exists (skip duplicates thanks to the
            # get‑by‑NORAD check).
            satellite = await ontology.get_satellite_by_norad(norad_id, tenant_id)
            if not satellite:
                sat_data = SatelliteCreate(
                    norad_id=norad_id,
                    name=f"Debris {norad_id}",
                    object_type=ObjectType.DEBRIS,
                    is_active=True,
                    classification="unclassified",
                    international_designator=None,
                    country=None,
                    operator=None,
                    mass_kg=None,
                    rcs_m2=None,
                    tags=[],
                )
                satellite = await ontology.create_satellite(sat_data, tenant_id, user_id)

            # Extract orbital elements from the second TLE line – use the same
            # slicing logic as in the demo seeder.
            try:
                inc = float(line2[8:16])
                raan = float(line2[17:25])
                ecc = float("0." + line2[26:33])
                argp = float(line2[34:42])
                ma = float(line2[43:51])
                mm = float(line2[52:63])
            except Exception:
                inc = raan = ecc = argp = ma = mm = None

            orbit_data = OrbitCreate(
                satellite_id=str(satellite.id),
                epoch=datetime.utcnow(),
                inclination_deg=inc,
                raan_deg=raan,
                eccentricity=ecc,
                arg_perigee_deg=argp,
                mean_anomaly_deg=ma,
                mean_motion_rev_day=mm,
                tle_line1=line1,
                tle_line2=line2,
                source="celestrak",
            )
            await ontology.create_orbit(orbit_data, tenant_id, user_id)
            processed += 1
        await session.commit()
        print(f"✅ Imported {processed} debris objects (satellites/orbits).")
        return processed


async def main(tenant_id: str = "default"):
    tle_text = await fetch_debris_tle()
    line_count = tle_text.count("\n")
    print(f"Fetched debris TLE data: {line_count} lines")
    await import_debris(tle_text, tenant_id=tenant_id)


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Fetch and import Celestrak debris TLE data")
    parser.add_argument("--tenant", default="default", help="Tenant ID for import")
    args = parser.parse_args()
    asyncio.run(main(tenant_id=args.tenant))
