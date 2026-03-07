"""Insert allied and enemy satellites directly into database."""
import asyncio
import asyncpg
from datetime import datetime
from uuid import uuid4

# Allied satellites (friendly forces) - Displayed as BLUE
ALLIED_SATELLITES = {
    25544: {"name": "Guardian Station Alpha", "country": "Multinational", "operator": "NASA/ESA/JAXA/CSA"},
    36516: {"name": "DeepWatch One", "country": "USA", "operator": "NASA/ESA"},
    20580: {"name": "TerraScan-1", "country": "USA", "operator": "NASA/USGS"},
    43013: {"name": "StarFinder-A", "country": "USA", "operator": "NASA/MIT"},
    43205: {"name": "Celestial Station", "country": "China", "operator": "CNSA"},
    43689: {"name": "WindWatcher", "country": "Europe", "operator": "ESA"},
    44713: {"name": "CommLink-1", "country": "USA", "operator": "SpaceX"},
    25530: {"name": "WeatherEye-1", "country": "USA", "operator": "NOAA"},
    25994: {"name": "NavBeacon-1", "country": "USA", "operator": "US Space Force"},
    43286: {"name": "EyeInSky-1", "country": "India", "operator": "ISRO"},
}

# Enemy satellites (unknown/hostile forces) - Displayed as RED
ENEMY_SATELLITES = {
    48274: {"name": "UNKNOWN-ALPHA", "country": "Unknown", "operator": "Unknown"},
    49044: {"name": "UNKNOWN-BETA", "country": "Unknown", "operator": "Unknown"},
    53239: {"name": "UNKNOWN-GAMMA", "country": "Unknown", "operator": "Unknown"},
    24876: {"name": "HOSTILE-NAV-1", "country": "Unknown", "operator": "Unknown"},
    26407: {"name": "HOSTILE-NAV-2", "country": "Unknown", "operator": "Unknown"},
    26690: {"name": "HOSTILE-NAV-3", "country": "Unknown", "operator": "Unknown"},
    27663: {"name": "HOSTILE-NAV-4", "country": "Unknown", "operator": "Unknown"},
    27704: {"name": "HOSTILE-NAV-5", "country": "Unknown", "operator": "Unknown"},
    40115: {"name": "SUSPECT-COM-1", "country": "Unknown", "operator": "Unknown"},
    40116: {"name": "SUSPECT-COM-2", "country": "Unknown", "operator": "Unknown"},
    41771: {"name": "SUSPECT-COM-3", "country": "Unknown", "operator": "Unknown"},
    27424: {"name": "TRACKED-OBJ-1", "country": "Unknown", "operator": "Unknown"},
    33591: {"name": "TRACKED-OBJ-2", "country": "Unknown", "operator": "Unknown"},
    37214: {"name": "TRACKED-OBJ-3", "country": "Unknown", "operator": "Unknown"},
    39444: {"name": "UNIDENTIFIED-1", "country": "Unknown", "operator": "Unknown"},
    41465: {"name": "UNIDENTIFIED-2", "country": "Unknown", "operator": "Unknown"},
    44484: {"name": "UNIDENTIFIED-3", "country": "Unknown", "operator": "Unknown"},
}

async def insert_satellites():
    """Insert satellites into database."""
    conn = await asyncpg.connect(
        host="postgres",
        port=5432,
        user="sda_user",
        password="sda_secret",
        database="sda_db",
    )
    
    try:
        tenant_id = "default"
        now = datetime.utcnow()
        created = 0
        updated = 0
        
        # Insert allied satellites
        print("Inserting allied satellites...")
        for norad_id, data in ALLIED_SATELLITES.items():
            # Check if exists
            existing = await conn.fetchval(
                "SELECT id FROM satellites WHERE norad_id = $1 AND tenant_id = $2",
                norad_id, tenant_id
            )

            if existing:
                await conn.execute(
                    """UPDATE satellites
                       SET name = $1, country = $2, operator = $3, faction = 'allied', updated_at = $4
                       WHERE id = $5""",
                    data["name"], data["country"], data["operator"], now, existing
                )
                updated += 1
                print(f"  Updated: {data['name']} (NORAD {norad_id})")
            else:
                sat_id = str(uuid4())
                await conn.execute(
                    """INSERT INTO satellites
                       (id, tenant_id, norad_id, name, object_type, country, operator,
                        faction, is_active, classification, created_at, updated_at, created_by)
                       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)""",
                    sat_id, tenant_id, norad_id, data["name"], "satellite",
                    data["country"], data["operator"], "allied", True, "unclassified",
                    now, now, "manual_insert"
                )
                created += 1
                print(f"  Created: {data['name']} (NORAD {norad_id})")

        # Insert enemy satellites
        print("\nInserting enemy satellites...")
        for norad_id, data in ENEMY_SATELLITES.items():
            # Check if exists
            existing = await conn.fetchval(
                "SELECT id FROM satellites WHERE norad_id = $1 AND tenant_id = $2",
                norad_id, tenant_id
            )

            if existing:
                await conn.execute(
                    """UPDATE satellites
                       SET name = $1, country = $2, operator = $3, faction = 'enemy', updated_at = $4
                       WHERE id = $5""",
                    data["name"], data["country"], data["operator"], now, existing
                )
                updated += 1
                print(f"  Updated: {data['name']} (NORAD {norad_id})")
            else:
                sat_id = str(uuid4())
                await conn.execute(
                    """INSERT INTO satellites
                       (id, tenant_id, norad_id, name, object_type, country, operator,
                        faction, is_active, classification, created_at, updated_at, created_by)
                       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)""",
                    sat_id, tenant_id, norad_id, data["name"], "satellite",
                    data["country"], data["operator"], "enemy", True, "unclassified",
                    now, now, "manual_insert"
                )
                created += 1
                print(f"  Created: {data['name']} (NORAD {norad_id})")
        
        print(f"\n=== RISULTATO ===")
        print(f"Creati: {created} satelliti")
        print(f"Aggiornati: {updated} satelliti")
        print(f"Totale: {created + updated} satelliti")
        
    finally:
        await conn.close()

if __name__ == "__main__":
    asyncio.run(insert_satellites())
