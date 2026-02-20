#!/usr/bin/env python3
"""Seed demo data for SDA Platform."""
import asyncio
import json
import random
from datetime import datetime, timedelta
from uuid import uuid4

import asyncpg

# Demo TLE data (sample satellites)
DEMO_TLES = [
    ("ISS (ZARYA)", 25544, 
     "1 25544U 98067A   24001.50000000  .00016717  00000-0  10270-3 0  9993",
     "2 25544  51.6416 247.4627 0006703  130.5360 325.0288 15.72125391   06"),
    ("STARLINK-1234", 44725,
     "1 44725U 19074A   24001.50000000  .00000069  00000-0  16234-4 0  9990",
     "2 44725  53.0554  90.0000 0001234  90.0000 270.0000 15.06500000   01"),
    ("COSMOS 2251 DEB", 34456,
     "1 34456U 93036AAA 24001.50000000  .00000789  00000-0  45678-4 0  9991",
     "2 34456  74.0396 123.4567 0156789 234.5678 123.4567 14.45678901   02"),
]

# Ground stations
GROUND_STATIONS = [
    {"name": "White Sands", "code": "WHS", "lat": 32.38, "lon": -106.48, "country": "USA"},
    {"name": "Svalbard", "code": "SVB", "lat": 78.23, "lon": 15.39, "country": "Norway"},
    {"name": "Alice Springs", "code": "ALS", "lat": -23.76, "lon": 133.87, "country": "Australia"},
    {"name": "Kiruna", "code": "KRN", "lat": 67.86, "lon": 20.96, "country": "Sweden"},
    {"name": "McMurdo", "code": "MCM", "lat": -77.85, "lon": 166.67, "country": "Antarctica"},
]

# Sensors
SENSORS = [
    {"name": "SST Radar 1", "type": "radar", "gs": "WHS"},
    {"name": "SST Radar 2", "type": "radar", "gs": "SVB"},
    {"name": "Optical Tracker 1", "type": "optical", "gs": "ALS"},
    {"name": "Optical Tracker 2", "type": "optical", "gs": "KRN"},
    {"name": "RF Monitor 1", "type": "rf", "gs": "WHS"},
    {"name": "Laser Ranger 1", "type": "laser", "gs": "ALS"},
    {"name": "Passive Sensor 1", "type": "passive", "gs": "MCM"},
    {"name": "SST Radar 3", "type": "radar", "gs": "MCM"},
    {"name": "Optical Wide Field", "type": "optical", "gs": "SVB"},
    {"name": "RF Monitor 2", "type": "rf", "gs": "KRN"},
]


async def generate_tle_catalog(n: int = 200):
    """Generate N demo satellites with TLEs."""
    satellites = []
    
    # Start with known satellites
    for name, norad_id, line1, line2 in DEMO_TLES:
        satellites.append({
            "name": name,
            "norad_id": norad_id,
            "line1": line1,
            "line2": line2,
        })
    
    # Generate random satellites
    base_norad = 50000
    for i in range(n - len(DEMO_TLES)):
        norad_id = base_norad + i
        name = f"DEMO-SAT-{norad_id}"
        
        # Generate random orbital elements
        inc = random.uniform(0, 98)  # Inclination
        raan = random.uniform(0, 360)
        ecc = random.uniform(0.0001, 0.02)
        argp = random.uniform(0, 360)
        ma = random.uniform(0, 360)
        mm = random.uniform(14.5, 16.0)  # Mean motion (LEO)
        
        epoch_year = 24
        epoch_day = random.uniform(1, 30)
        
        # Format TLE lines
        line1 = (f"1 {norad_id:5d}U 24001A   {epoch_year:02d}"
                 f"{epoch_day:012.8f}  .00001000  00000-0  10000-4 0  9990")
        line2 = (f"2 {norad_id:5d} {inc:8.4f} {raan:8.4f} "
                 f"{ecc*10000000:07.0f} {argp:8.4f} {ma:8.4f} "
                 f"{mm:11.8f}    01")
        
        satellites.append({
            "name": name,
            "norad_id": norad_id,
            "line1": line1,
            "line2": line2,
        })
    
    return satellites


def generate_space_weather_events(n: int = 50):
    """Generate N demo space weather events."""
    events = []
    event_types = [
        "geomagnetic_storm", "solar_flare", "cme", "radiation_storm",
        "radio_blackout"
    ]
    severities = ["minor", "moderate", "strong", "severe", "extreme"]
    severity_weights = [0.4, 0.3, 0.15, 0.1, 0.05]
    
    base_time = datetime.utcnow() - timedelta(days=30)
    
    for i in range(n):
        start = base_time + timedelta(
            hours=random.randint(0, 720)
        )
        duration = timedelta(hours=random.randint(2, 48))
        
        severity = random.choices(severities, weights=severity_weights)[0]
        kp = {
            "minor": random.uniform(4, 5),
            "moderate": random.uniform(5, 6),
            "strong": random.uniform(6, 7),
            "severe": random.uniform(7, 8),
            "extreme": random.uniform(8, 9),
        }[severity]
        
        events.append({
            "event_type": random.choice(event_types),
            "start_time": start.isoformat() + "Z",
            "peak_time": (start + duration/2).isoformat() + "Z",
            "end_time": (start + duration).isoformat() + "Z",
            "severity": severity,
            "kp_index": round(kp, 1),
            "dst_index": random.uniform(-50, -200) if severity != "minor" else random.uniform(0, -50),
            "solar_wind_speed": random.uniform(400, 800),
            "proton_flux": random.uniform(10, 10000) if severity in ["strong", "severe", "extreme"] else random.uniform(1, 10),
            "source": "demo_generator",
            "source_event_id": f"DEMO-{i+1:04d}",
            "description": f"Demo {severity} {random.choice(event_types).replace('_', ' ')} event",
        })
    
    return events


async def seed_database():
    """Seed the database with demo data."""
    # Connect to database
    conn = await asyncpg.connect(
        host="postgres",
        port=5432,
        user="sda_user",
        password="sda_secret",
        database="sda_db",
    )
    
    tenant_id = "default"
    now = datetime.utcnow()
    
    print("Seeding satellites...")
    satellites = await generate_tle_catalog(200)
    
    for sat in satellites:
        sat_id = str(uuid4())
        
        # Insert satellite
        await conn.execute("""
            INSERT INTO satellites (
                id, tenant_id, norad_id, name, object_type, is_active,
                classification, tags, created_at, updated_at, created_by
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            ON CONFLICT (norad_id) DO NOTHING
        """, sat_id, tenant_id, sat["norad_id"], sat["name"],
            "satellite", True, "unclassified", json.dumps([]),
            now, now, "seed_demo")
        
        # Insert orbit
        orbit_id = str(uuid4())
        epoch = now - timedelta(hours=random.randint(0, 48))
        
        try:
            # Parse orbital elements from TLE
            line2 = sat["line2"]
            inc = float(line2[8:16])
            raan = float(line2[17:25])
            ecc = float("0." + line2[26:33])
            argp = float(line2[34:42])
            ma = float(line2[43:51])
            mm = float(line2[52:63])
            
            await conn.execute("""
                INSERT INTO orbits (
                    id, tenant_id, satellite_id, epoch, inclination_deg,
                    raan_deg, eccentricity, arg_perigee_deg, mean_anomaly_deg,
                    mean_motion_rev_day, tle_line1, tle_line2, source,
                    created_at, updated_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
            """, orbit_id, tenant_id, sat_id, epoch, inc, raan, ecc,
                argp, ma, mm, sat["line1"], sat["line2"], "tle",
                now, now)
        except Exception as e:
            print(f"  Skipped orbit for {sat['name']}: {e}")
    
    print(f"  Inserted {len(satellites)} satellites")
    
    print("Seeding ground stations...")
    gs_ids = {}
    for gs in GROUND_STATIONS:
        gs_id = str(uuid4())
        gs_ids[gs["code"]] = gs_id
        
        await conn.execute("""
            INSERT INTO ground_stations (
                id, tenant_id, name, code, latitude, longitude, altitude_m,
                antenna_count, frequency_bands, is_operational, country,
                created_at, updated_at, created_by
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        """, gs_id, tenant_id, gs["name"], gs["code"], gs["lat"], gs["lon"],
            0.0, random.randint(1, 4), json.dumps(["S", "X", "Ka"]),
            True, gs["country"], now, now, "seed_demo")
    
    print(f"  Inserted {len(GROUND_STATIONS)} ground stations")
    
    print("Seeding sensors...")
    for sensor in SENSORS:
        sensor_id = str(uuid4())
        gs_id = gs_ids.get(sensor["gs"])
        
        await conn.execute("""
            INSERT INTO sensors (
                id, tenant_id, name, sensor_type, is_operational,
                ground_station_id, min_elevation_deg, created_at, updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        """, sensor_id, tenant_id, sensor["name"], sensor["type"],
            True, gs_id, 10.0, now, now)
    
    print(f"  Inserted {len(SENSORS)} sensors")
    
    print("Seeding space weather events...")
    weather_events = generate_space_weather_events(50)
    
    for event in weather_events:
        event_id = str(uuid4())
        
        await conn.execute("""
            INSERT INTO space_weather_events (
                id, tenant_id, event_type, start_time, peak_time, end_time,
                severity, kp_index, dst_index, solar_wind_speed, proton_flux,
                source, source_event_id, description, created_at, updated_at
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16
            )
        """, event_id, tenant_id, event["event_type"],
            datetime.fromisoformat(event["start_time"].replace("Z", "")),
            datetime.fromisoformat(event["peak_time"].replace("Z", "")),
            datetime.fromisoformat(event["end_time"].replace("Z", "")),
            event["severity"], event["kp_index"], event["dst_index"],
            event["solar_wind_speed"], event["proton_flux"],
            event["source"], event["source_event_id"], event["description"],
            now, now)
    
    print(f"  Inserted {len(weather_events)} space weather events")
    
    print("Generating conjunction events...")
    # Get some satellite IDs
    sat_rows = await conn.fetch("""
        SELECT id, norad_id FROM satellites 
        WHERE tenant_id = $1 LIMIT 50
    """, tenant_id)
    
    conjunction_count = 0
    for i in range(20):
        sat1 = random.choice(sat_rows)
        sat2 = random.choice(sat_rows)
        if sat1["id"] == sat2["id"]:
            continue
        
        tca = now + timedelta(hours=random.randint(1, 72))
        miss_dist = random.uniform(0.1, 15.0)
        
        risk = "low"
        if miss_dist < 1.0:
            risk = "critical"
        elif miss_dist < 3.0:
            risk = "high"
        elif miss_dist < 7.0:
            risk = "medium"
        
        conj_id = str(uuid4())
        await conn.execute("""
            INSERT INTO conjunction_events (
                id, tenant_id, primary_object_id, secondary_object_id,
                tca, miss_distance_km, risk_level, risk_score,
                screening_volume_km, is_actionable, created_at, updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        """, conj_id, tenant_id, sat1["id"], sat2["id"],
            tca, miss_dist, risk, 
            100 - (miss_dist * 6.67),  # Score 0-100
            10.0, risk in ["high", "critical"], now, now)
        conjunction_count += 1
    
    print(f"  Generated {conjunction_count} conjunction events")
    
    print("Creating demo incidents...")
    incident_types = ["CONJUNCTION", "SPACE_WEATHER", "RF_INTERFERENCE", "ANOMALY"]
    severities = ["info", "low", "medium", "high", "critical"]
    statuses = ["open", "investigating", "mitigating", "resolved"]
    
    for i in range(10):
        inc_id = str(uuid4())
        inc_type = random.choice(incident_types)
        
        await conn.execute("""
            INSERT INTO incidents (
                id, tenant_id, title, description, incident_type,
                severity, status, detected_at, priority,
                created_at, updated_at, created_by
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        """, inc_id, tenant_id,
            f"Demo {inc_type.replace('_', ' ').title()} Incident #{i+1}",
            f"Demo incident for testing - {inc_type}",
            inc_type, random.choice(severities),
            random.choice(statuses), now - timedelta(hours=random.randint(0, 72)),
            random.randint(20, 90), now, now, "seed_demo")
    
    print("  Created 10 demo incidents")
    
    await conn.close()
    print("\nDemo data seeding complete!")


if __name__ == "__main__":
    asyncio.run(seed_database())

