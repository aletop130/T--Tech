# WRITE_TARGET="/root/T--Tech/backend/app/services/debris.py"
# WRITE_CONTENT_LENGTH=2000
"""Debris service for managing space debris objects."""
import random
import uuid
from datetime import datetime
from typing import List, Tuple

from sqlalchemy import select, and_, func
from sqlalchemy.orm import aliased
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models.ontology import Satellite, Orbit, ObjectType
from app.services.audit import AuditService
from app.core.logging import get_logger

logger = get_logger(__name__)

class DebrisService:
    """Service for debris queries."""

    def __init__(self, db: AsyncSession, audit: AuditService):
        self.db = db
        self.audit = audit

    async def list_debris(
        self,
        tenant_id: str,
        page: int = 1,
        page_size: int = 50,
        orbit_classes: str = "LEO",
    ) -> Tuple[List[Satellite], int]:
        """List debris objects with pagination.

        Parameters:
            tenant_id: Tenant identifier.
            page: Page number (1-indexed).
            page_size: Number of items per page.
            orbit_classes: Comma‑separated orbit classes to filter (e.g. "LEO,MEO").

        Returns:
            Tuple of (list of Satellite objects, total count).
        """
        conditions = [
            Satellite.tenant_id == tenant_id,
            Satellite.object_type == ObjectType.DEBRIS.value,
        ]

        # TODO: Implement orbit class filtering using latest orbit data.

        count_stmt = select(func.count()).select_from(Satellite).where(and_(*conditions))
        total = await self.db.scalar(count_stmt) or 0

        offset = (page - 1) * page_size
        stmt = (
            select(Satellite)
            .where(and_(*conditions))
            .order_by(Satellite.name)
            .offset(offset)
            .limit(page_size)
        )
        result = await self.db.execute(stmt)
        debris = list(result.scalars().all())
        logger.info(
            "list_debris",
            tenant_id=tenant_id,
            page=page,
            page_size=page_size,
            returned=len(debris),
            total=total,
        )
        return debris, total

    async def get_debris_batch(
        self,
        tenant_id: str,
        limit: int = 2500,
    ) -> List[Satellite]:
        """Return a batch of debris objects for visualization.

        Retrieves up to `limit` active debris records.
        """
        stmt = (
            select(Satellite)
            .where(
                Satellite.tenant_id == tenant_id,
                Satellite.object_type == ObjectType.DEBRIS.value,
                Satellite.is_active == True,
            )
            .order_by(Satellite.name)
            .limit(limit)
        )
        result = await self.db.execute(stmt)
        batch = list(result.scalars().all())
        logger.info(
            "get_debris_batch",
            tenant_id=tenant_id,
            limit=limit,
            returned=len(batch),
        )
        return batch

    async def get_debris_with_orbits(
        self,
        tenant_id: str,
    ) -> List[Tuple[Satellite, Orbit]]:
        """Return all debris with their latest orbit (including TLE data)."""
        latest_subq = (
            select(Orbit.satellite_id, func.max(Orbit.epoch).label("max_epoch"))
            .where(Orbit.tenant_id == tenant_id)
            .group_by(Orbit.satellite_id)
            .subquery()
        )
        LatestOrbit = aliased(Orbit, name="latest_orbit")
        stmt = (
            select(Satellite, LatestOrbit)
            .join(latest_subq, Satellite.id == latest_subq.c.satellite_id)
            .join(
                LatestOrbit,
                and_(
                    LatestOrbit.satellite_id == latest_subq.c.satellite_id,
                    LatestOrbit.epoch == latest_subq.c.max_epoch,
                ),
            )
            .where(
                Satellite.tenant_id == tenant_id,
                Satellite.object_type == ObjectType.DEBRIS.value,
                LatestOrbit.tle_line1.is_not(None),
                LatestOrbit.tle_line2.is_not(None),
            )
            .order_by(Satellite.name)
        )
        result = await self.db.execute(stmt)
        rows = result.all()
        debris_with_orbits = [(sat, orb) for sat, orb in rows]
        logger.info(
            "get_debris_with_orbits",
            tenant_id=tenant_id,
            count=len(debris_with_orbits),
        )
        return debris_with_orbits

    async def generate_synthetic_debris(
        self,
        tenant_id: str,
        count: int,
        user_id: str = "api_user",
    ) -> int:
        """Generate synthetic debris entries with random TLE data.
        
        Parameters:
            tenant_id: Tenant identifier.
            count: Number of debris objects to generate.
            user_id: ID of the user triggering the generation.
            
        Returns:
            Number of debris objects created.
        """
        if count < 1 or count > 10000:
            raise ValueError("Count must be between 1 and 10000")
        
        now = datetime.utcnow()
        start_norad = 90000
        
        existing_stmt = select(func.max(Satellite.norad_id)).where(
            Satellite.tenant_id == tenant_id,
            Satellite.norad_id >= start_norad,
        )
        max_norad = await self.db.scalar(existing_stmt) or start_norad
        
        created = 0
        suffixes = [" R/B", " DEB", ""]
        
        for i in range(count):
            norad_id = max_norad + i + 1
            suffix = random.choice(suffixes)
            name = f"DEBRIS-{norad_id}{suffix}"
            sat_id = str(uuid.uuid4())
            
            inclination = random.uniform(0, 180)
            raan = random.uniform(0, 360)
            eccentricity = random.uniform(0.001, 0.1)
            mean_anomaly = random.uniform(0, 360)
            mean_motion = random.uniform(8, 16)
            
            line1 = (
                f"1 {norad_id}U 06999A   {now.strftime('%y%m%d')}{raan/15:05.2f}"
                f"{inclination:5.2f}00000-0  00000-0 0  {int(norad_id % 100):02d}"
            )
            line2 = (
                f"2 {norad_id} {raan:7.4f} {inclination:8.4f}{100000 + int(eccentricity * 1000000):06d}"
                f" {mean_anomaly:8.4f} {mean_motion:11.8f}00000{now.strftime('%y%m%d')}00"
            )
            
            await self.db.execute(
                select(Satellite).where(
                    Satellite.tenant_id == tenant_id,
                    Satellite.norad_id == norad_id,
                )
            )
            existing = await self.db.execute(
                select(Satellite).where(
                    Satellite.tenant_id == tenant_id,
                    Satellite.norad_id == norad_id,
                )
            )
            if existing.scalars().first():
                continue
            
            sat = Satellite(
                id=sat_id,
                tenant_id=tenant_id,
                norad_id=norad_id,
                name=name,
                object_type=ObjectType.DEBRIS.value,
                is_active=True,
                classification="unclassified",
                tags="[]",
                created_at=now,
                updated_at=now,
                created_by=user_id,
            )
            self.db.add(sat)
            
            orbit = Orbit(
                id=str(uuid.uuid4()),
                tenant_id=tenant_id,
                satellite_id=sat_id,
                epoch=now,
                tle_line1=line1,
                tle_line2=line2,
                source="api_generated",
                created_at=now,
                updated_at=now,
                created_by=user_id,
            )
            self.db.add(orbit)
            created += 1
        
        await self.db.commit()
        
        logger.info(
            "generate_synthetic_debris",
            tenant_id=tenant_id,
            count=created,
            user_id=user_id,
        )
        return created
