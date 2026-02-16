# WRITE_TARGET="/root/T--Tech/backend/app/services/debris.py"
# WRITE_CONTENT_LENGTH=2000
"""Debris service for managing space debris objects."""
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
