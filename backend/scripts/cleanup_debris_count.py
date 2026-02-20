"""Clean up debris to keep only 100 objects."""
import asyncio
import asyncpg

async def cleanup_debris():
    """Delete excess debris, keeping only 100."""
    conn = await asyncpg.connect(
        host="postgres",
        port=5432,
        user="sda_user",
        password="sda_secret",
        database="sda_db",
    )
    
    try:
        # Count current debris
        count = await conn.fetchval("""
            SELECT COUNT(*) FROM satellites 
            WHERE tenant_id = 'default' AND object_type = 'debris'
        """)
        print(f"Current debris count: {count}")
        
        if count > 100:
            # Get 101st NORAD ID (we'll keep up to this one)
            threshold = await conn.fetchval("""
                SELECT norad_id FROM satellites 
                WHERE tenant_id = 'default' 
                AND object_type = 'debris'
                ORDER BY norad_id
                LIMIT 1 OFFSET 100
            """)
            
            if threshold:
                print(f"Deleting debris with norad_id > {threshold}")
                
                # First delete orbits for debris we'll delete
                await conn.execute(f"""
                    DELETE FROM orbits 
                    WHERE satellite_id IN (
                        SELECT id FROM satellites 
                        WHERE tenant_id = 'default' 
                        AND object_type = 'debris'
                        AND norad_id > {threshold}
                    )
                """)
                
                # Then delete debris
                result = await conn.execute(f"""
                    DELETE FROM satellites 
                    WHERE tenant_id = 'default' 
                    AND object_type = 'debris'
                    AND norad_id > {threshold}
                """)
                
                print(f"Cleanup complete - kept 100 debris")
        else:
            print(f"No cleanup needed, {count} debris")
            
    finally:
        await conn.close()

if __name__ == "__main__":
    asyncio.run(cleanup_debris())
