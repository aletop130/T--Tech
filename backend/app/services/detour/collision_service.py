'''Collision avoidance service for Detour pipeline.

Provides orchestration of the multi‑agent pipeline, status tracking and
maneuver plan lifecycle (propose → approve → reject → execute). The service
uses DetourStateManager for state persistence and AuditService for audit logging.
'''

from datetime import datetime
from typing import Any, Dict, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import get_logger
from app.core.exceptions import NotFoundError, SDAException
from app.db.base import generate_uuid
from app.db.models.detour import (
    DetourAgentSession,
    DetourAgentSessionStatus,
    DetourConjunctionAnalysis,
    DetourManeuverPlan,
    DetourManeuverStatus,
)
from app.db.models.ontology import ConjunctionEvent

from app.services.detour.state_manager import DetourStateManager
from app.services.audit import AuditService

logger = get_logger(__name__)

class CollisionAvoidanceService:
    """Service orchestrating the Detour collision‑avoidance pipeline.

    This lightweight implementation stores session records, updates maneuver plan
    status and, when a maneuver is executed, updates the satellite's fuel state
    via DetourStateManager. In a full system a Celery task would launch the
    LangGraph pipeline; here we simply create the session record and log the
    intent.
    """

    def __init__(
        self,
        db: AsyncSession,
        state_manager: DetourStateManager,
        audit: AuditService,
    ) -> None:
        self.db = db
        self.state_manager = state_manager
        self.audit = audit
        self.logger = logger

    # ---------------------------------------------------------------------
    # Pipeline orchestration
    # ---------------------------------------------------------------------

    async def trigger_conjunction_analysis(
        self, conjunction_event_id: str, tenant_id: str
    ) -> str:
        """Create a new agent session for a conjunction analysis.

        Validates the ConjunctionEvent exists, creates a DetourAgentSession,
        logs the action and returns the session identifier.
        """
        stmt = select(ConjunctionEvent).where(
            ConjunctionEvent.id == conjunction_event_id,
            ConjunctionEvent.tenant_id == tenant_id,
        )
        result = await self.db.execute(stmt)
        conj = result.scalar_one_or_none()
        if not conj:
            raise NotFoundError(
                resource_type='ConjunctionEvent',
                resource_id=conjunction_event_id,
                detail='Conjunction event not found',
            )

        session = DetourAgentSession(
            id=generate_uuid(),
            tenant_id=tenant_id,
            session_type='detour_pipeline',
            status=DetourAgentSessionStatus.ACTIVE,
            input_data={'conjunction_event_id': conjunction_event_id},
            started_at=datetime.utcnow(),
        )
        self.db.add(session)
        await self.db.flush()
        await self.db.refresh(session)

        await self.audit.log(
            action='TRIGGER_ANALYSIS',
            entity_type='DetourAgentSession',
            entity_id=session.id,
            tenant_id=tenant_id,
            user_id=None,
            detail='Started Detour conjunction analysis pipeline',
            input_data=session.input_data,
        )
        self.logger.info(
            'detour_analysis_triggered',
            session_id=session.id,
            conjunction_event_id=conjunction_event_id,
            tenant_id=tenant_id,
        )
        return session.id

    async def get_analysis_status(self, session_id: str) -> dict:
        """Return the current status of a Detour analysis session."""
        session = await self.db.get(DetourAgentSession, session_id)
        if not session:
            raise NotFoundError(
                resource_type='DetourAgentSession',
                resource_id=session_id,
                detail='Detour analysis session not found',
            )
        return {
            'session_id': session.id,
            'status': session.status.value if hasattr(session.status, 'value') else str(session.status),
            'started_at': session.started_at.isoformat() if session.started_at else None,
            'completed_at': session.completed_at.isoformat() if session.completed_at else None,
            'events': session.events or [],
        }

    async def get_analysis_results(self, session_id: str) -> dict:
        """Return the final results of a completed analysis session.

        Raises a SDAException (400) if the session has not yet reached the
        COMPLETED status.
        """
        session = await self.db.get(DetourAgentSession, session_id)
        if not session:
            raise NotFoundError(
                resource_type='DetourAgentSession',
                resource_id=session_id,
                detail='Detour analysis session not found',
            )
        if session.status != DetourAgentSessionStatus.COMPLETED:
            raise SDAException(
                status_code=400,
                error_type='analysis-not-complete',
                title='Analysis Not Complete',
                detail='Requested analysis results but session is not completed',
            )
        return {
            'session_id': session.id,
            'status': session.status.value if hasattr(session.status, 'value') else str(session.status),
            'output_data': session.output_data or {},
        }

    # ---------------------------------------------------------------------
    # Maneuver plan management
    # ---------------------------------------------------------------------

    async def approve_maneuver_plan(
        self, plan_id: str, user_id: str
    ) -> DetourManeuverPlan:
        """Approve a proposed maneuver plan."""
        plan = await self.db.get(DetourManeuverPlan, plan_id)
        if not plan:
            raise NotFoundError(
                resource_type='DetourManeuverPlan',
                resource_id=plan_id,
                detail='Maneuver plan not found',
            )
        if plan.status != DetourManeuverStatus.PROPOSED:
            raise SDAException(
                status_code=400,
                error_type='invalid-plan-status',
                title='Invalid Plan Status',
                detail='Only plans in PROPOSED state can be approved',
            )
        plan.status = DetourManeuverStatus.APPROVED
        plan.approved_by = user_id
        await self.db.flush()
        await self.db.refresh(plan)

        await self.audit.log(
            action='APPROVE_MANEUVER',
            entity_type='DetourManeuverPlan',
            entity_id=plan.id,
            tenant_id=plan.tenant_id,
            user_id=user_id,
            detail='Maneuver plan approved',
        )
        self.logger.info('detour_maneuver_plan_approved', plan_id=plan.id, user_id=user_id)
        return plan

    async def reject_maneuver_plan(
        self, plan_id: str, reason: str, user_id: str
    ) -> DetourManeuverPlan:
        """Reject a proposed maneuver plan, persisting the rejection reason."""
        plan = await self.db.get(DetourManeuverPlan, plan_id)
        if not plan:
            raise NotFoundError(
                resource_type='DetourManeuverPlan',
                resource_id=plan_id,
                detail='Maneuver plan not found',
            )
        if plan.status != DetourManeuverStatus.PROPOSED:
            raise SDAException(
                status_code=400,
                error_type='invalid-plan-status',
                title='Invalid Plan Status',
                detail='Only plans in PROPOSED state can be rejected',
            )
        plan.status = DetourManeuverStatus.REJECTED
        # Store rejection reason in the JSON column for traceability
        plan.ai_recommendation = {'rejection_reason': reason}
        await self.db.flush()
        await self.db.refresh(plan)

        await self.audit.log(
            action='REJECT_MANEUVER',
            entity_type='DetourManeuverPlan',
            entity_id=plan.id,
            tenant_id=plan.tenant_id,
            user_id=user_id,
            detail='Maneuver plan rejected',
            metadata={'reason': reason},
        )
        self.logger.info(
            'detour_maneuver_plan_rejected',
            plan_id=plan.id,
            user_id=user_id,
            reason=reason,
        )
        return plan

    async def execute_maneuver_plan(self, plan_id: str, user_id: str) -> dict:
        """Execute an approved maneuver plan and update satellite state."""
        plan = await self.db.get(DetourManeuverPlan, plan_id)
        if not plan:
            raise NotFoundError(
                resource_type='DetourManeuverPlan',
                resource_id=plan_id,
                detail='Maneuver plan not found',
            )
        if plan.status != DetourManeuverStatus.APPROVED:
            raise SDAException(
                status_code=400,
                error_type='invalid-plan-status',
                title='Invalid Plan Status',
                detail='Only approved plans can be executed',
            )
        # Mark execution
        plan.status = DetourManeuverStatus.EXECUTED
        plan.executed_at = datetime.utcnow()
        await self.db.flush()
        await self.db.refresh(plan)

        # Update satellite fuel/state if possible
        analysis = await self.db.get(DetourConjunctionAnalysis, plan.conjunction_analysis_id)
        if analysis:
            stmt = select(ConjunctionEvent).where(
                ConjunctionEvent.id == analysis.conjunction_event_id
            )
            result = await self.db.execute(stmt)
            conj_event = result.scalar_one_or_none()
            if conj_event:
                satellite_id = conj_event.primary_object_id
                sat_state = await self.state_manager.get_satellite_state(
                    satellite_id, analysis.tenant_id
                )
                if sat_state:
                    fuel_before = sat_state.fuel_remaining_kg or 0.0
                    fuel_cost = plan.fuel_cost_kg or 0.0
                    new_fuel = max(fuel_before - fuel_cost, 0.0)
                    await self.state_manager.update_satellite_state(
                        satellite_id,
                        analysis.tenant_id,
                        {'fuel_remaining_kg': new_fuel},
                    )

        await self.audit.log(
            action='EXECUTE_MANEUVER',
            entity_type='DetourManeuverPlan',
            entity_id=plan.id,
            tenant_id=plan.tenant_id,
            user_id=user_id,
            detail='Maneuver plan executed',
        )
        self.logger.info('detour_maneuver_executed', plan_id=plan.id, user_id=user_id)
        return {
            'plan_id': plan.id,
            'status': plan.status.value,
            'executed_at': plan.executed_at.isoformat(),
        }
