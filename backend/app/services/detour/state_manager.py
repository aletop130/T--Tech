"""Detour state manager service.

Provides persistent CRUD operations for Detour-related entities using async SQLAlchemy.
All methods are safe for use within FastAPI request-scoped sessions.
"""

from datetime import datetime
from typing import Any, Dict, List, Optional

from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import get_logger
from app.core.exceptions import NotFoundError

from app.db.models.detour import (
    DetourSatelliteState,
    DetourConjunctionAnalysis,
    DetourManeuverPlan,
    DetourAnalysisStatus,
)
from app.db.models.ontology import ConjunctionEvent

logger = get_logger(__name__)


class DetourStateManager:
    """Service class handling persistent Detour state.

    The manager works with an ``AsyncSession`` provided by FastAPI dependency
    injection. It does **not** commit transactions itself – the surrounding
    request handler (or test fixture) is responsible for committing or rolling
    back the session. This mirrors the pattern used by other services in the
    codebase (e.g. ``OntologyService``).
    """

    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self.logger = logger

    # ---------------------------------------------------------------------
    # Satellite state
    # ---------------------------------------------------------------------
    async def get_satellite_state(
        self, satellite_id: str, tenant_id: str
    ) -> Optional[DetourSatelliteState]:
        """Retrieve the ``DetourSatelliteState`` for a satellite.

        Returns ``None`` if no state record exists for the given satellite and
        tenant.
        """
        stmt = select(DetourSatelliteState).where(
            and_(
                DetourSatelliteState.satellite_id == satellite_id,
                DetourSatelliteState.tenant_id == tenant_id,
            )
        )
        result = await self.db.execute(stmt)
        state = result.scalar_one_or_none()
        self.logger.debug(
            "detour_get_satellite_state",
            satellite_id=satellite_id,
            tenant_id=tenant_id,
            found=bool(state),
        )
        return state

    async def update_satellite_state(
        self,
        satellite_id: str,
        tenant_id: str,
        updates: Dict[str, Any],
    ) -> DetourSatelliteState:
        """Update fields of an existing ``DetourSatelliteState``.

        Raises ``NotFoundError`` if the state does not exist.
        """
        state = await self.get_satellite_state(satellite_id, tenant_id)
        if not state:
            raise NotFoundError(
                resource_type="DetourSatelliteState",
                resource_id=f"{satellite_id}:{tenant_id}",
                detail="Satellite detour state not found",
            )
        for key, value in updates.items():
            if hasattr(state, key):
                setattr(state, key, value)
        state.updated_at = datetime.utcnow()
        await self.db.flush()
        await self.db.refresh(state)
        self.logger.info(
            "detour_satellite_state_updated",
            satellite_id=satellite_id,
            tenant_id=tenant_id,
            updates=updates,
        )
        return state

    # ---------------------------------------------------------------------
    # Conjunction analysis
    # ---------------------------------------------------------------------
    async def create_conjunction_analysis(
        self, conjunction_event_id: str, tenant_id: str
    ) -> DetourConjunctionAnalysis:
        """Create a new ``DetourConjunctionAnalysis`` linked to a ``ConjunctionEvent``.

        The analysis is initialised with data copied from the related
        ``ConjunctionEvent`` where possible (risk level, miss distance, TCA,
        collision probability). The ``analysis_status`` starts as ``PENDING``.
        """
        stmt = select(ConjunctionEvent).where(
            and_(
                ConjunctionEvent.id == conjunction_event_id,
                ConjunctionEvent.tenant_id == tenant_id,
            )
        )
        result = await self.db.execute(stmt)
        conj_event = result.scalar_one_or_none()
        if not conj_event:
            raise NotFoundError(
                resource_type="ConjunctionEvent",
                resource_id=conjunction_event_id,
                detail="Conjunction event not found for tenant",
            )
        analysis = DetourConjunctionAnalysis(
            conjunction_event_id=conjunction_event_id,
            tenant_id=tenant_id,
            risk_level=conj_event.risk_level,
            miss_distance_km=conj_event.miss_distance_km,
            tca=conj_event.tca,
            collision_probability=getattr(conj_event, "collision_probability", None),
            analysis_status=DetourAnalysisStatus.PENDING,
        )
        self.db.add(analysis)
        await self.db.flush()
        await self.db.refresh(analysis)
        self.logger.info(
            "detour_conjunction_analysis_created",
            analysis_id=analysis.id,
            conjunction_event_id=conjunction_event_id,
            tenant_id=tenant_id,
        )
        return analysis

    async def update_conjunction_analysis(
        self, analysis_id: str, updates: Dict[str, Any]
    ) -> DetourConjunctionAnalysis:
        """Apply a partial update to a ``DetourConjunctionAnalysis``.

        Raises ``NotFoundError`` if the analysis does not exist.
        """
        stmt = select(DetourConjunctionAnalysis).where(
            DetourConjunctionAnalysis.id == analysis_id
        )
        result = await self.db.execute(stmt)
        analysis = result.scalar_one_or_none()
        if not analysis:
            raise NotFoundError(
                resource_type="DetourConjunctionAnalysis",
                resource_id=analysis_id,
                detail="Conjunction analysis not found",
            )
        for key, value in updates.items():
            if hasattr(analysis, key):
                setattr(analysis, key, value)
        analysis.updated_at = datetime.utcnow()
        await self.db.flush()
        await self.db.refresh(analysis)
        self.logger.info(
            "detour_conjunction_analysis_updated",
            analysis_id=analysis_id,
            updates=updates,
        )
        return analysis

    async def get_pending_conjunctions(
        self, tenant_id: str, risk_threshold: str = "medium"
    ) -> List[DetourConjunctionAnalysis]:
        """Return pending analyses filtered by risk threshold.

        ``risk_threshold`` can be ``low``, ``medium``, ``high`` or ``critical``.
        Analyses with a risk level **greater than or equal to** the threshold
        are returned.
        """
        stmt = select(DetourConjunctionAnalysis).where(
            and_(
                DetourConjunctionAnalysis.tenant_id == tenant_id,
                DetourConjunctionAnalysis.analysis_status == DetourAnalysisStatus.PENDING,
            )
        )
        result = await self.db.execute(stmt)
        pending = result.scalars().all()
        order = {"low": 1, "medium": 2, "high": 3, "critical": 4}
        threshold_val = order.get(risk_threshold.lower(), 2)
        filtered = [
            a for a in pending if order.get(str(a.risk_level).lower(), 0) >= threshold_val
        ]
        self.logger.debug(
            "detour_pending_conjunctions",
            tenant_id=tenant_id,
            threshold=risk_threshold,
            count=len(filtered),
        )
        return filtered

    # ---------------------------------------------------------------------
    # Maneuver plans
    # ---------------------------------------------------------------------
    async def save_maneuver_plan(
        self, analysis_id: str, plan_data: Dict[str, Any]
    ) -> DetourManeuverPlan:
        """Persist a maneuver plan linked to a specific analysis.

        ``plan_data`` should contain column names compatible with
        ``DetourManeuverPlan`` (e.g. ``maneuver_type``, ``delta_v_m_s``).
        ``tenant_id`` is inferred from the related analysis.
        """
        analysis = await self.db.get(DetourConjunctionAnalysis, analysis_id)
        if not analysis:
            raise NotFoundError(
                resource_type="DetourConjunctionAnalysis",
                resource_id=analysis_id,
                detail="Conjunction analysis not found",
            )
        maneuver = DetourManeuverPlan(
            conjunction_analysis_id=analysis_id,
            tenant_id=analysis.tenant_id,
            **plan_data,
        )
        self.db.add(maneuver)
        await self.db.flush()
        await self.db.refresh(maneuver)
        self.logger.info(
            "detour_maneuver_plan_saved",
            maneuver_id=maneuver.id,
            analysis_id=analysis_id,
        )
        return maneuver

    async def get_maneuver_history(
        self, satellite_id: str, tenant_id: str
    ) -> List[DetourManeuverPlan]:
        """Return all maneuver plans affecting a given satellite.

        The query joins ``DetourManeuverPlan`` → ``DetourConjunctionAnalysis`` →
        ``ConjunctionEvent`` and filters where the satellite appears as either the
        primary or secondary object.
        """
        stmt = (
            select(DetourManeuverPlan)
            .join(DetourConjunctionAnalysis)
            .join(ConjunctionEvent)
            .where(
                and_(
                    DetourManeuverPlan.tenant_id == tenant_id,
                    or_(
                        ConjunctionEvent.primary_object_id == satellite_id,
                        ConjunctionEvent.secondary_object_id == satellite_id,
                    ),
                )
            )
        )
        result = await self.db.execute(stmt)
        plans = result.scalars().all()
        self.logger.debug(
            "detour_maneuver_history_fetched",
            satellite_id=satellite_id,
            tenant_id=tenant_id,
            count=len(plans),
        )
        return plans
