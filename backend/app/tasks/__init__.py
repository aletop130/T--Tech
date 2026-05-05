"""Celery tasks."""
import asyncio
import random
from datetime import datetime, timedelta
from typing import Optional

from app.celery_app import celery_app
from app.core.logging import get_logger
from app.core.config import settings

logger = get_logger(__name__)

ATTACK_TYPES = ["ddos", "intrusion", "malware", "data_exfiltration", "jamming", "spoofing"]
ATTACK_TARGETS = ["ground_station", "satellite_link", "mission_control", "tracking_system"]
SEVERITY_CHOICES = ["low", "medium", "high", "critical"]


@celery_app.task(name="app.tasks.run_proximity_detection")
def run_proximity_detection(tenant_id: str = "default"):
    """Run proximity detection periodically."""
    return asyncio.run(_run_proximity_detection(tenant_id))


async def _run_proximity_detection(tenant_id: str):
    """Run proximity detection with proper async setup."""
    from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
    from sqlalchemy.orm import sessionmaker
    from app.services.proximity import ProximityDetectionService
    from app.services.incidents import IncidentService
    from app.services.audit import AuditService
    
    engine = create_async_engine(settings.DATABASE_URL)
    async_session = sessionmaker(
        engine, class_=AsyncSession, expire_on_commit=False
    )
    
    async with async_session() as session:
        audit = AuditService(session)
        incident_service = IncidentService(session, audit)
        proximity_service = ProximityDetectionService(
            session, audit, incident_service
        )
        
        result = await proximity_service.detect_proximity_events(
            tenant_id=tenant_id,
        )
        
        await session.commit()
        
        logger.info(
            "proximity_detection_completed",
            tenant_id=tenant_id,
            events_detected=result.events_detected,
            events_created=result.events_created,
            events_updated=result.events_updated,
        )
        
        return {
            "status": "completed",
            "tenant_id": tenant_id,
            "events_detected": result.events_detected,
            "events_created": result.events_created,
            "events_updated": result.events_updated,
        }


@celery_app.task(name="app.tasks.run_conjunction_analysis")
def run_conjunction_analysis(tenant_id: str = "default"):
    """Run periodic conjunction analysis."""
    logger.info(
        "scheduled_conjunction_analysis",
        tenant_id=tenant_id,
    )
    return {"status": "completed", "tenant_id": tenant_id}


@celery_app.task(name="app.tasks.fetch_space_weather")
def fetch_space_weather():
    """Fetch space weather data from external sources."""
    logger.info("scheduled_space_weather_fetch")
    return {"status": "completed"}


@celery_app.task(name="app.tasks.process_tle_file")
def process_tle_file_task(run_id: str, tenant_id: str, user_id: str = None):
    """Process TLE file asynchronously."""
    logger.info(
        "processing_tle_file",
        run_id=run_id,
        tenant_id=tenant_id,
    )
    return {"status": "completed", "run_id": run_id}


@celery_app.task(name="app.tasks.generate_ai_analysis")
def generate_ai_analysis(
    event_type: str,
    event_id: str,
    tenant_id: str,
):
    """Generate AI analysis for an event."""
    logger.info(
        "generating_ai_analysis",
        event_type=event_type,
        event_id=event_id,
        tenant_id=tenant_id,
    )
    return {"status": "completed", "event_id": event_id}


@celery_app.task(name="app.tasks.simulate_cyber_attacks")
def simulate_cyber_attacks(tenant_id: str = "default"):
    """Simulate cyber attack events on ground stations."""
    return asyncio.run(_simulate_cyber_attacks(tenant_id))


async def _simulate_cyber_attacks(tenant_id: str):
    """Generate simulated cyber attack incidents."""
    from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
    from sqlalchemy.orm import sessionmaker
    from sqlalchemy import select
    from app.db.models.incidents import Incident, IncidentSeverity, IncidentType
    from app.db.models.ontology import GroundStation
    from app.services.audit import AuditService
    
    engine = create_async_engine(settings.DATABASE_URL)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    
    async with async_session() as session:
        audit = AuditService(session)
        
        stmt = select(GroundStation)
        result = await session.execute(stmt)
        stations = list(result.scalars().all())
        
        if not stations:
            logger.info("no_ground_stations_found_for_cyber_simulation")
            return {"status": "completed", "attacks_generated": 0}
        
        attacks_generated = 0
        num_attacks = random.randint(1, 3)
        
        for _ in range(num_attacks):
            station = random.choice(stations)
            attack_type = random.choice(ATTACK_TYPES)
            target = random.choice(ATTACK_TARGETS)
            severity = random.choice(SEVERITY_CHOICES)
            
            attack_descriptions = {
                "ddos": f"DDoS attack detected on {station.name} - high volume traffic from multiple sources",
                "intrusion": f"Unauthorized intrusion attempt detected at {station.name}",
                "malware": f"Malware signature detected in {station.name} network traffic",
                "data_exfiltration": f"Possible data exfiltration detected from {station.name}",
                "jamming": f"RF jamming detected affecting {station.name} uplink",
                "spoofing": f"GPS spoofing attempt detected near {station.name}",
            }
            
            title = f"Cyber Attack: {attack_type.upper()} on {station.name}"
            description = attack_descriptions.get(attack_type, f"Cyber attack on {station.name}")
            
            incident = Incident(
                id=f"cyber_{datetime.utcnow().strftime('%Y%m%d%H%M%S')}_{random.randint(1000, 9999)}",
                tenant_id=tenant_id,
                title=title,
                description=description,
                incident_type=IncidentType.CYBER,
                severity=IncidentSeverity(severity),
                status="open",
                priority=random.randint(70, 100) if severity == "critical" else random.randint(30, 70),
                affected_assets=[
                    {
                        "type": "ground_station",
                        "id": station.id,
                        "name": station.name,
                        "attack_type": attack_type,
                        "target": target,
                    }
                ],
                source_event_type="simulation",
                detected_at=datetime.utcnow(),
            )
            
            session.add(incident)
            attacks_generated += 1
        
        await session.commit()
        
        logger.info(
            "cyber_attacks_simulated",
            tenant_id=tenant_id,
            attacks_generated=attacks_generated,
        )
        
        return {
            "status": "completed",
            "tenant_id": tenant_id,
            "attacks_generated": attacks_generated,
        }


@celery_app.task(name="app.tasks.detect_maneuvers")
def detect_maneuvers(tenant_id: str = "default"):
    """Detect anomalous maneuvers based on proximity events."""
    return asyncio.run(_detect_maneuvers(tenant_id))


async def _detect_maneuvers(tenant_id: str):
    """Detect sudden proximity changes indicating maneuvers."""
    from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
    from sqlalchemy.orm import sessionmaker
    from sqlalchemy import select, and_
    from app.db.models.incidents import Incident, IncidentSeverity, IncidentType
    from app.db.models.operations import Maneuver, ManeuverStatus
    from app.services.audit import AuditService
    
    engine = create_async_engine(settings.DATABASE_URL)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    
    async with async_session() as session:
        from app.db.models.incidents import ProximityEvent
        
        stmt = select(ProximityEvent).where(
            and_(
                ProximityEvent.tenant_id == tenant_id,
                ProximityEvent.alert_level == "critical",
                ProximityEvent.status == "active",
            )
        )
        result = await session.execute(stmt)
        critical_events = list(result.scalars().all())
        
        maneuvers_created = 0
        
        for event in critical_events:
            existing_maneuver_stmt = select(Maneuver).where(
                and_(
                    Maneuver.entity_id == event.primary_satellite_id,
                    Maneuver.route_plan_id == event.id,
                )
            )
            existing = await session.execute(existing_maneuver_stmt)
            if existing.scalar_one_or_none():
                continue
            
            maneuver = Maneuver(
                id=f"maneuver_{event.id}_{datetime.utcnow().strftime('%Y%m%d%H%M%S')}",
                route_plan_id=event.id,
                entity_id=event.primary_satellite_id,
                maneuver_type="collision_avoidance",
                burn_time=datetime.utcnow() + timedelta(minutes=random.randint(5, 30)),
                burn_duration_sec=random.uniform(10, 60),
                delta_v_x=random.uniform(-0.5, 0.5),
                delta_v_y=random.uniform(-0.5, 0.5),
                delta_v_z=random.uniform(-0.5, 0.5),
                total_delta_v_ms=random.uniform(10, 100),
                status="planned",
                fuel_consumed_kg=random.uniform(0.5, 5.0),
            )
            
            session.add(maneuver)
            maneuvers_created += 1
            
            incident = Incident(
                id=f"maneuver_incident_{datetime.utcnow().strftime('%Y%m%d%H%M%S')}_{random.randint(1000, 9999)}",
                tenant_id=tenant_id,
                title=f"Maneuver Detected: {event.primary_satellite_id} approaching {event.secondary_satellite_id}",
                description=f"Sudden proximity detected between satellites. Estimated collision probability increased. Maneuver recommended for collision avoidance.",
                incident_type=IncidentType.PROXIMITY,
                severity=IncidentSeverity.CRITICAL,
                status="open",
                priority=100,
                affected_assets=[
                    {
                        "type": "satellite",
                        "id": event.primary_satellite_id,
                        "role": "primary",
                    },
                    {
                        "type": "satellite",
                        "id": event.secondary_satellite_id,
                        "role": "secondary",
                    },
                ],
                source_event_type="maneuver_detection",
                source_event_id=event.id,
                detected_at=datetime.utcnow(),
            )
            session.add(incident)
        
        await session.commit()
        
        logger.info(
            "maneuver_detection_completed",
            tenant_id=tenant_id,
            critical_events_checked=len(critical_events),
            maneuvers_created=maneuvers_created,
        )
        
        return {
            "status": "completed",
            "tenant_id": tenant_id,
            "critical_events_checked": len(critical_events),
            "maneuvers_created": maneuvers_created,
        }

@celery_app.task(name="app.tasks.fetch_celestrak_debris")
def fetch_celestrak_debris(tenant_id: str = "default"):
    """Fetch and import Celestrak debris TLE data.

    This task runs the backend fetch script as a subprocess and returns the
    number of imported debris objects.
    """
    import os
    import sys
    import subprocess
    import re

    # Resolve path to the fetch script relative to this file
    script_path = os.path.abspath(
        os.path.join(
            os.path.dirname(__file__),
            "..",
            "..",
            "scripts",
            "fetch_celestrak_debris.py",
        )
    )
    # Execute the script with the tenant argument
    result = subprocess.run(
        [sys.executable, script_path, "--tenant", tenant_id],
        capture_output=True,
        text=True,
    )
    # Extract import count from stdout (the script prints a line like "✅ Imported X debris objects")
    match = re.search(r"✅ Imported (\d+) debris objects", result.stdout)
    imported = int(match.group(1)) if match else 0
    return {
        "status": "completed",
        "tenant_id": tenant_id,
        "imported": imported,
        "stdout": result.stdout,
        "stderr": result.stderr,
    }
