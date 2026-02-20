"""Remove demo satellites, keep only useful ones."""
import asyncio
import asyncpg

# Keep these NORAD IDs (allied + enemy + original)
KEEP_NORAD_IDS = [
    # Allied (10)
    25544, 36516, 20580, 43013, 43205, 43689, 44713, 25530, 25994, 43286,
    # Enemy (19)
    48274, 49044, 53239, 24876, 26407, 26690, 27663, 27704,
    40115, 40116, 41771, 27424, 33591, 37214, 39444, 41465, 44484, 49271, 54216,
    # Original demo
    34456, 44725,  # COSMOS 2251 DEB, STARLINK-1234
]

async def cleanup():
    conn = await asyncpg.connect(
        host="postgres", port=5432, user="sda_user",
        password="sda_secret", database="sda_db"
    )
    
    try:
        # Count before
        before = await conn.fetchval(
            "SELECT COUNT(*) FROM satellites WHERE tenant_id='default' AND object_type='satellite'"
        )
        print(f"Satelliti prima: {before}")
        
        # Get IDs to delete (demo satellites not in keep list)
        to_delete = await conn.fetch(
            f"""SELECT id, norad_id, name FROM satellites 
                WHERE tenant_id='default' 
                AND object_type='satellite'
                AND norad_id NOT IN ({','.join(map(str, KEEP_NORAD_IDS))})"""
        )
        
        print(f"\nSatelliti da eliminare: {len(to_delete)}")
        for row in to_delete[:10]:
            print(f"  {row[1]}: {row[2]}")
        if len(to_delete) > 10:
            print(f"  ... e altri {len(to_delete)-10}")
        
        # Delete orbits first
        if to_delete:
            ids = [str(row[0]) for row in to_delete]
            ids_str = "','".join(ids)
            await conn.execute(
                f"DELETE FROM orbits WHERE satellite_id IN ('{ids_str}')"
            )
            
            # Delete satellites
            norad_str = ','.join(map(str, KEEP_NORAD_IDS))
            await conn.execute(
                f"DELETE FROM satellites WHERE tenant_id='default' AND object_type='satellite' AND norad_id NOT IN ({norad_str})"
            )
        
        # Count after
        after = await conn.fetchval(
            "SELECT COUNT(*) FROM satellites WHERE tenant_id='default' AND object_type='satellite'"
        )
        debris = await conn.fetchval(
            "SELECT COUNT(*) FROM satellites WHERE tenant_id='default' AND object_type='debris'"
        )
        
        print(f"\n=== RISULTATO ===")
        print(f"Satelliti dopo: {after}")
        print(f"Debris: {debris}")
        print(f"TOTALE: {after + debris}")
        
    finally:
        await conn.close()

if __name__ == "__main__":
    asyncio.run(cleanup())
