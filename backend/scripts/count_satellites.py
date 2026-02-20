"""Count satellites in database."""
import asyncio
import asyncpg

async def count():
    conn = await asyncpg.connect(
        host="postgres", port=5432, user="sda_user",
        password="sda_secret", database="sda_db"
    )
    
    sat_count = await conn.fetchval(
        "SELECT COUNT(*) FROM satellites WHERE tenant_id='default' AND object_type='satellite'"
    )
    debris_count = await conn.fetchval(
        "SELECT COUNT(*) FROM satellites WHERE tenant_id='default' AND object_type='debris'"
    )
    
    print(f"Satelliti: {sat_count}")
    print(f"Debris: {debris_count}")
    print(f"Totale: {sat_count + debris_count}")
    
    # List all satellites
    rows = await conn.fetch(
        "SELECT norad_id, name FROM satellites WHERE tenant_id='default' AND object_type='satellite' ORDER BY norad_id"
    )
    print(f"\n=== LISTA SATELLITI ({len(rows)}) ===")
    for row in rows:
        print(f"  {row[0]:>6}: {row[1]}")
    
    await conn.close()

if __name__ == "__main__":
    asyncio.run(count())
