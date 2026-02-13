#!/usr/bin/env python3
"""Seed custom data: Ceccano Ground Station and vehicles."""
import asyncio
from datetime import datetime
from uuid import uuid4

import asyncpg


async def seed_custom_data():
    """Seed custom data for the user."""
    conn = await asyncpg.connect(
        host="sda-postgres",
        port=5432,
        user="sda_user",
        password="sda_secret",
        database="sda_db",
    )
    
    tenant_id = "default"
    now = datetime.utcnow()
    
    print("Creating Ceccano Ground Station...")
    gs_id = str(uuid4())
    await conn.execute("""
        INSERT INTO ground_stations (
            id, tenant_id, name, code, latitude, longitude, altitude_m,
            antenna_count, frequency_bands, is_operational, organization, country,
            created_at, updated_at, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
    """, gs_id, tenant_id, "Ceccano Ground Station", "CEC", 41.6, 13.3, 180.0,
        2, '["S", "X", "UHF"]', True, "T-Tech", "Italy", now, now, "seed_custom")
    print(f"  Created: Ceccano Ground Station (CEC) at 41.6°N, 13.3°E")
    
    print("Creating 3 vehicles near Ceccano...")
    vehicles = [
        {"name": "ALPHA-1", "lat": 41.595, "lon": 13.315, "heading": 45},
        {"name": "BRAVO-2", "lat": 41.605, "lon": 13.285, "heading": 120},
        {"name": "CHARLIE-3", "lat": 41.590, "lon": 13.300, "heading": 270},
    ]
    
    for v in vehicles:
        vehicle_id = str(uuid4())
        await conn.execute("""
            INSERT INTO position_reports (
                id, tenant_id, entity_id, entity_type, report_time,
                latitude, longitude, altitude_m, velocity_magnitude_ms,
                heading_deg, is_simulated, created_at, updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        """, vehicle_id, tenant_id, v["name"], "ground_vehicle", now,
            v["lat"], v["lon"], 180.0, 5.0, v["heading"], True, now, now)
        print(f"  Created vehicle: {v['name']} at {v['lat']}°N, {v['lon']}°E")
    
    print("\nAlso creating default tenant and user...")
    tenant_id_db = str(uuid4())
    await conn.execute("""
        INSERT INTO tenants (id, name, display_name, is_active, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (name) DO NOTHING
    """, tenant_id_db, "default", "Default Tenant", True, now, now)
    print("  Created default tenant")
    
    user_id = str(uuid4())
    await conn.execute("""
        INSERT INTO users (id, tenant_id, email, username, full_name, is_active, roles, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (email) DO NOTHING
    """, user_id, tenant_id, "admin@example.com", "admin", "Admin User", True, '["admin"]', now, now)
    print("  Created default admin user")
    
    await conn.close()
    print("\nCustom data seeding complete!")
    print("- 1 ground station: Ceccano Ground Station")
    print("- 3 vehicles: ALPHA-1, BRAVO-2, CHARLIE-3")


if __name__ == "__main__":
    asyncio.run(seed_custom_data())
