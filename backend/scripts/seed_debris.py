#!/usr/bin/env python3
"""Seed debris data for SDA Platform.

Creates a large number of debris objects (space junk) in the database with
associated orbit entries.  The script:

1. Connects to the PostgreSQL database using asyncpg.
2. Inserts a few known debris objects (e.g., COSMOS 2251, Fengyun‑1C) with
   generated TLE lines.
3. Generates additional synthetic debris entries (default 1000) using random
   orbital elements.  Names include typical suffixes such as "R/B" (rocket
   bodies) and "DEB" (fragments) to satisfy the category‑assignment requirement.
4. Stores a TLE for each object in the ``orbits`` table.
5. Prints a short summary of the number of records created.

The script can be run with ``python backend/scripts/seed_debris.py`` after the
database has been initialised (``docker-compose up`` or ``alembic upgrade head``).
"""

import asyncio
import json
import random
from datetime import datetime, timedelta
from uuid import uuid4

import asyncpg

# ---------------------------------------------------------------------------
# Configuration – keep in sync with ``seed_demo.py`` for simplicity.
# ---------------------------------------------------------------------------
DB_HOST = "localhost"
DB_PORT = 5432
DB_USER = "sda_user"
DB_PASSWORD = "sda_secret"
DB_NAME = "sda_db"

TENANT_ID = "default"
CREATED_BY = "seed_debris"

# Number of synthetic debris objects to generate (in addition to the known ones).
TOTAL_DEBRIS = 1000

# ---------------------------------------------------------------------------
# Helper: generate a realistic‑looking two‑line element set for a given NORAD ID.
# ---------------------------------------------------------------------------
def generate_tle(norad_id: int) -> tuple[str, str]:
    """Return a tuple ``(line1, line2)`` containing a synthetic TLE.

    The format loosely follows the one used in ``seed_demo.py`` – it is not
    physically accurate but is sufficient for the frontend visualisation and
    unit‑test expectations.
    """
    # Random orbital parameters – values are chosen to stay within typical LEO
    # ranges so that the visualisation appears around Earth.
    inc = random.uniform(0, 98)               # inclination (deg)
    raan = random.uniform(0, 360)            # right ascension of ascending node
    ecc = random.uniform(0.0001, 0.02)        # eccentricity
    argp = random.uniform(0, 360)            # argument of perigee
    ma = random.uniform(0, 360)              # mean anomaly
    mm = random.uniform(14.5, 16.0)           # mean motion (rev per day)
    epoch_day = random.uniform(1, 30)        # day of year fraction

    # Line 1 – simple placeholder values for classification and designator.
    line1 = (
        f"1 {norad_id:5d}U 24001A   {24:02d}{epoch_day:012.8f}  .00001000  00000-0  10000-4 0  9990"
    )

    # Line 2 – uses the random parameters above.  The eccentricity field in a TLE
    # is expressed as an integer representing the value * 1e7.
    line2 = (
        f"2 {norad_id:5d} {inc:8.4f} {raan:8.4f} "
        f"{int(ecc * 1e7):07d} {argp:8.4f} {ma:8.4f} {mm:11.8f}    01"
    )
    return line1, line2

# ---------------------------------------------------------------------------
# Known debris objects – these should reflect real‑world catalog entries.
# ---------------------------------------------------------------------------
KNOWN_DEBRIS = [
    # COSMOS 2251 debris – NORAD 34456 (present in the demo seed data).
    (34456, "COSMOS 2251 DEB"),
    # Fengyun‑1C debris – a widely quoted example.  NORAD 28666 is a
    # representative fragment from the historic anti‑satellite test.
    (28666, "FENGYUN‑1C DEB"),
]

# ---------------------------------------------------------------------------
# Main seeding routine.
# ---------------------------------------------------------------------------
async def seed_debris():
    conn = await asyncpg.connect(
        host=DB_HOST,
        port=DB_PORT,
        user=DB_USER,
        password=DB_PASSWORD,
        database=DB_NAME,
    )
    now = datetime.utcnow()
    created_satellites = 0
    created_orbits = 0

    # -------------------------------------------------------------------
    # Insert the known debris objects.
    # -------------------------------------------------------------------
    for norad_id, name in KNOWN_DEBRIS:
        sat_id = str(uuid4())
        # Insert satellite – ``object_type`` is forced to ``debris``.
        await conn.execute(
            """
            INSERT INTO satellites (
                id, tenant_id, norad_id, name, object_type, is_active,
                classification, tags, created_at, updated_at, created_by
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            ON CONFLICT (norad_id) DO NOTHING
            """,
            sat_id,
            TENANT_ID,
            norad_id,
            name,
            'debris',
            True,
            'unclassified',
            json.dumps([]),
            now,
            now,
            CREATED_BY,
        )
        # Generate a synthetic TLE for the object.
        line1, line2 = generate_tle(norad_id)
        await conn.execute(
            """
            INSERT INTO orbits (
                id, tenant_id, satellite_id, epoch, tle_line1, tle_line2, source,
                created_at, updated_at, created_by
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            """,
            str(uuid4()),
            TENANT_ID,
            sat_id,
            now,
            line1,
            line2,
            'seed_debris',
            now,
            now,
            CREATED_BY,
        )
        created_satellites += 1
        created_orbits += 1

    # -------------------------------------------------------------------
    # Generate additional synthetic debris entries.
    # -------------------------------------------------------------------
    start_norad = 60000  # Start well above the demo random range (50000‑50199).
    suffixes = [" R/B", " DEB", ""]
    for i in range(TOTAL_DEBRIS):
        norad_id = start_norad + i
        suffix = random.choice(suffixes)
        name = f"DEBRIS-{norad_id}{suffix}"
        sat_id = str(uuid4())
        await conn.execute(
            """
            INSERT INTO satellites (
                id, tenant_id, norad_id, name, object_type, is_active,
                classification, tags, created_at, updated_at, created_by
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            ON CONFLICT (norad_id) DO NOTHING
            """,
            sat_id,
            TENANT_ID,
            norad_id,
            name,
            'debris',
            True,
            'unclassified',
            json.dumps([]),
            now,
            now,
            CREATED_BY,
        )
        line1, line2 = generate_tle(norad_id)
        await conn.execute(
            """
            INSERT INTO orbits (
                id, tenant_id, satellite_id, epoch, tle_line1, tle_line2, source,
                created_at, updated_at, created_by
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            """,
            str(uuid4()),
            TENANT_ID,
            sat_id,
            now,
            line1,
            line2,
            'seed_debris',
            now,
            now,
            CREATED_BY,
        )
        created_satellites += 1
        created_orbits += 1

    await conn.close()
    print(f"✅ Seed complete – {created_satellites} debris satellites and {created_orbits} orbits inserted.")


if __name__ == "__main__":
    asyncio.run(seed_debris())
