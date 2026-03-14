# -*- coding: utf-8 -*-
"""Service for importing Celestrak debris TLE data.

Provides functions to fetch the debris TLE catalog from Celestrak,
parse the entries, and persist them to the database.
"""

import os
from datetime import datetime, timedelta
from typing import List, Tuple

import httpx

from app.db.base import async_session_factory
from app.services.ontology import OntologyService
from app.services.audit import AuditService
from app.schemas.ontology import SatelliteCreate, OrbitCreate
from app.db.models.ontology import ObjectType

# Real CelesTrak debris groups — each one is a known fragmentation event
DEBRIS_GROUPS = [
    "cosmos-1408-debris",
    "fengyun-1c-debris",
    "iridium-33-debris",
    "cosmos-2251-debris",
]

# Max TLE age in days before it's considered stale and skipped
MAX_TLE_AGE_DAYS = 14


def _parse_epoch_from_tle(line1: str) -> datetime | None:
    """Extract the epoch datetime from a TLE line 1.

    TLE line 1 columns 19-32 contain the epoch in YYDDD.DDDDDDDD format.
    """
    try:
        epoch_str = line1[18:32].strip()
        year = int(epoch_str[0:2])
        day_of_year = float(epoch_str[2:])
        year = year + 2000 if year < 57 else year + 1900
        return datetime(year, 1, 1) + timedelta(days=day_of_year - 1)
    except Exception:
        return None


async def fetch_debris_tle(url: str | None = None) -> str:
    """Fetch debris TLE data from CelesTrak debris groups.

    If a custom URL is provided, uses that. Otherwise fetches all known
    debris fragmentation groups and concatenates them.

    Returns:
        The raw TLE file as a string, or an empty string on failure.
    """
    if url:
        target_url = url
    elif os.getenv("CELERTRAK_DEBRIS_URL"):
        target_url = os.getenv("CELERTRAK_DEBRIS_URL")
    else:
        target_url = None

    async with httpx.AsyncClient(timeout=60.0) as client:
        if target_url:
            try:
                response = await client.get(target_url, follow_redirects=True)
                response.raise_for_status()
                return response.text
            except httpx.HTTPError as e:
                print(f"Failed to fetch debris TLE data: {e}")
                return ""

        # Fetch all debris groups from CelesTrak GP API
        all_tle = []
        base = "https://celestrak.org/NORAD/elements/gp.php"
        for group in DEBRIS_GROUPS:
            try:
                resp = await client.get(
                    base,
                    params={"GROUP": group, "FORMAT": "TLE"},
                    follow_redirects=True,
                )
                resp.raise_for_status()
                text = resp.text.strip()
                if text and "No GP data found" not in text:
                    all_tle.append(text)
                    print(f"  Fetched {group}: {text.count(chr(10)) // 3} entries")
            except httpx.HTTPError as e:
                print(f"  Warning: failed to fetch {group}: {e}")

        return "\n".join(all_tle)


def parse_tle(text: str) -> List[Tuple[int, str, str]]:
    """Parse raw TLE text into a list of tuples.

    Each tuple contains ``(norad_id, line1, line2)``.
    The parser skips malformed entries and stale TLEs older than
    MAX_TLE_AGE_DAYS from their epoch.
    """
    lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
    result: List[Tuple[int, str, str]] = []
    now = datetime.utcnow()
    skipped_stale = 0
    i = 0
    while i < len(lines):
        line = lines[i]
        if line.startswith("1 "):
            line1 = line
            if i + 1 < len(lines):
                line2 = lines[i + 1]
            else:
                break
            try:
                norad_id = int(''.join(ch for ch in line1.split()[1] if ch.isdigit()))

                # Staleness check: skip TLEs too old for accurate propagation
                epoch = _parse_epoch_from_tle(line1)
                if epoch and abs((now - epoch).days) > MAX_TLE_AGE_DAYS:
                    skipped_stale += 1
                    i += 2
                    continue

                result.append((norad_id, line1, line2))
            except (IndexError, ValueError):
                pass
            i += 2
        else:
            i += 1

    if skipped_stale:
        print(f"  Skipped {skipped_stale} stale TLEs (>{MAX_TLE_AGE_DAYS} days old)")
    return result


async def import_debris(
    tle_text: str,
    tenant_id: str = "default",
    user_id: str = "fetch_celestrak_debris",
) -> int:
    """Persist parsed TLE data into the database.

    Returns the number of entries successfully processed.
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

            # Extract epoch from TLE (not utcnow)
            epoch = _parse_epoch_from_tle(line1) or datetime.utcnow()

            # Extract orbital elements from TLE line 2
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
                epoch=epoch,
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
        print(f"Imported {processed} debris objects (satellites/orbits).")
        return processed
