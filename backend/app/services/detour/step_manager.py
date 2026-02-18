"""Detour step-by-step pipeline manager.

Manages the execution of the Detour pipeline in step-by-step mode,
allowing human approval between each agent execution.
"""

import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional

from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import get_logger
from app.core.exceptions import NotFoundError, ValidationError

from app.db.models.detour import (
    DetourStepSession,
    DetourAgentStep,
    DetourAgentSessionStatus,
    DetourStepStatus,
    DetourExecutionMode,
    DetourAnalysisArchive,
)
from app.db.models.ontology import ConjunctionEvent
from app.agents.detour.nodes import (
    scout_node,
    analyst_node,
    planner_node,
    safety_node,
    ops_brief_node,
)
from app.agents.detour.state import DetourGraphState

logger = get_logger(__name__)

AGENT_ORDER = ["scout", "analyst", "planner", "safety", "ops_brief"]
AGENT_NODE_MAP = {
    "scout": scout_node,
    "analyst": analyst_node,
    "planner": planner_node,
    "safety": safety_node,
    "ops_brief": ops_brief_node,
}


class DetourStepManager:
    """Service for managing step-by-step Detour pipeline execution."""

    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def start_step_session(
        self,
        conjunction_event_id: str,
        satellite_id: str,
        tenant_id: str,
        execution_mode: DetourExecutionMode = DetourExecutionMode.STEP_BY_STEP,
    ) -> DetourStepSession:
        """Start a new step-by-step analysis session.
        
        Creates a session and immediately executes the first agent (Scout).
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
                detail="Conjunction event not found",
            )

        session_id = f"DET-{uuid.uuid4().hex[:8].upper()}"
        
        step_session = DetourStepSession(
            session_id=session_id,
            conjunction_event_id=conjunction_event_id,
            satellite_id=satellite_id,
            tenant_id=tenant_id,
            execution_mode=execution_mode,
            status=DetourAgentSessionStatus.ACTIVE,
            current_agent="scout",
            current_step_number="1",
            started_at=datetime.utcnow(),
        )
        self.db.add(step_session)

        for idx, agent_name in enumerate(AGENT_ORDER, start=1):
            agent_step = DetourAgentStep(
                session_id=session_id,
                agent_name=agent_name,
                step_number=str(idx),
                status=DetourStepStatus.PENDING,
            )
            self.db.add(agent_step)

        await self.db.flush()
        
        logger.info(
            "detour_step_session_started",
            session_id=session_id,
            conjunction_event_id=conjunction_event_id,
            satellite_id=satellite_id,
        )
        
        await self.db.refresh(step_session)
        return step_session

    async def execute_agent_step(
        self,
        session_id: str,
        agent_name: str,
    ) -> DetourAgentStep:
        """Execute a specific agent step."""
        step_session = await self._get_step_session(session_id)
        
        if step_session.status != DetourAgentSessionStatus.ACTIVE:
            raise ValidationError(f"Session {session_id} is not active")

        step_number = str(AGENT_ORDER.index(agent_name) + 1)
        
        stmt = select(DetourAgentStep).where(
            and_(
                DetourAgentStep.session_id == session_id,
                DetourAgentStep.agent_name == agent_name,
            )
        )
        result = await self.db.execute(stmt)
        agent_step = result.scalar_one_or_none()
        
        if not agent_step:
            raise NotFoundError(
                resource_type="DetourAgentStep",
                resource_id=f"{session_id}:{agent_name}",
            )

        agent_step.status = DetourStepStatus.RUNNING
        agent_step.started_at = datetime.utcnow()
        
        await self.db.flush()

        state = await self._build_graph_state(step_session)
        config = {"db": self.db}
        
        node_fn = AGENT_NODE_MAP.get(agent_name)
        if not node_fn:
            raise ValidationError(f"Unknown agent: {agent_name}")

        try:
            state = await node_fn(state, config)
            output_data = self._extract_agent_output(agent_name, state)
            cesium_actions = self._extract_cesium_actions(agent_name, state)
            
            agent_step.output_data = output_data
            agent_step.cesium_actions = cesium_actions
            agent_step.status = DetourStepStatus.WAITING_APPROVAL
            agent_step.completed_at = datetime.utcnow()
            
            step_session.current_agent = agent_name
            step_session.current_step_number = step_number
            
            if cesium_actions:
                existing_actions = step_session.cesium_actions or []
                step_session.cesium_actions = existing_actions + cesium_actions
            
            if agent_name == "ops_brief":
                step_session.final_ops_brief = state.get("ops_brief")
                step_session.status = DetourAgentSessionStatus.COMPLETED
                step_session.completed_at = datetime.utcnow()
                await self._archive_session(step_session, state)
            
            await self.db.flush()
            
            logger.info(
                "detour_agent_step_executed",
                session_id=session_id,
                agent_name=agent_name,
                status=agent_step.status,
            )
            
        except Exception as exc:
            agent_step.status = DetourStepStatus.ERROR
            agent_step.completed_at = datetime.utcnow()
            step_session.status = DetourAgentSessionStatus.FAILED
            await self.db.flush()
            
            logger.exception(
                "detour_agent_step_error",
                session_id=session_id,
                agent_name=agent_name,
                error=str(exc),
            )
            raise

        await self.db.refresh(agent_step)
        return agent_step

    async def approve_agent_step(
        self,
        session_id: str,
        agent_name: str,
        approved_by: str,
        notes: Optional[str] = None,
    ) -> DetourAgentStep:
        """Approve the current agent step and proceed to the next."""
        step_session = await self._get_step_session(session_id)
        
        stmt = select(DetourAgentStep).where(
            and_(
                DetourAgentStep.session_id == session_id,
                DetourAgentStep.agent_name == agent_name,
            )
        )
        result = await self.db.execute(stmt)
        agent_step = result.scalar_one_or_none()
        
        if not agent_step:
            raise NotFoundError(resource_type="DetourAgentStep", resource_id=f"{session_id}:{agent_name}")

        if agent_step.status != DetourStepStatus.WAITING_APPROVAL:
            raise ValidationError(f"Agent step {agent_name} is not waiting for approval")

        agent_step.status = DetourStepStatus.COMPLETED
        agent_step.approved_by = approved_by
        agent_step.approved_at = datetime.utcnow()
        
        await self.db.flush()

        logger.info(
            "detour_step_approved",
            session_id=session_id,
            agent_name=agent_name,
            approved_by=approved_by,
        )
        
        await self.db.refresh(agent_step)
        return agent_step

    async def reject_agent_step(
        self,
        session_id: str,
        agent_name: str,
        reason: str,
    ) -> DetourAgentStep:
        """Reject the current agent step and halt the pipeline."""
        step_session = await self._get_step_session(session_id)
        
        stmt = select(DetourAgentStep).where(
            and_(
                DetourAgentStep.session_id == session_id,
                DetourAgentStep.agent_name == agent_name,
            )
        )
        result = await self.db.execute(stmt)
        agent_step = result.scalar_one_or_none()
        
        if not agent_step:
            raise NotFoundError(resource_type="DetourAgentStep", resource_id=f"{session_id}:{agent_name}")

        agent_step.status = DetourStepStatus.REJECTED
        agent_step.rejection_reason = reason
        agent_step.completed_at = datetime.utcnow()
        
        step_session.status = DetourAgentSessionStatus.CANCELLED
        step_session.completed_at = datetime.utcnow()
        
        await self.db.flush()

        logger.info(
            "detour_step_rejected",
            session_id=session_id,
            agent_name=agent_name,
            reason=reason,
        )
        
        await self.db.refresh(agent_step)
        return agent_step

    async def get_session_status(self, session_id: str) -> Dict[str, Any]:
        """Get the complete status of a step-by-step session."""
        step_session = await self._get_step_session(session_id)
        
        stmt = select(DetourAgentStep).where(
            DetourAgentStep.session_id == session_id
        ).order_by(DetourAgentStep.step_number)
        
        result = await self.db.execute(stmt)
        steps = result.scalars().all()
        
        return {
            "session_id": step_session.session_id,
            "conjunction_event_id": step_session.conjunction_event_id,
            "satellite_id": step_session.satellite_id,
            "execution_mode": step_session.execution_mode.value,
            "status": step_session.status.value,
            "current_agent": step_session.current_agent,
            "current_step_number": step_session.current_step_number,
            "cesium_actions": step_session.cesium_actions,
            "final_ops_brief": step_session.final_ops_brief,
            "final_risk_level": step_session.final_risk_level,
            "started_at": step_session.started_at.isoformat() if step_session.started_at else None,
            "completed_at": step_session.completed_at.isoformat() if step_session.completed_at else None,
            "steps": [
                {
                    "agent_name": s.agent_name,
                    "step_number": int(s.step_number),
                    "status": s.status.value,
                    "output_summary": self._summarize_output(s.agent_name, s.output_data),
                    "cesium_actions": s.cesium_actions,
                    "approved_by": s.approved_by,
                    "approved_at": s.approved_at.isoformat() if s.approved_at else None,
                    "rejection_reason": s.rejection_reason,
                }
                for s in steps
            ],
        }

    async def get_next_available_step(self, session_id: str) -> Optional[Dict[str, Any]]:
        """Get the next available step for execution."""
        step_session = await self._get_step_session(session_id)
        
        if step_session.status != DetourAgentSessionStatus.ACTIVE:
            return None
        
        stmt = select(DetourAgentStep).where(
            and_(
                DetourAgentStep.session_id == session_id,
                DetourAgentStep.status == DetourStepStatus.WAITING_APPROVAL,
            )
        )
        result = await self.db.execute(stmt)
        waiting_step = result.scalar_one_or_none()
        
        if waiting_step:
            return {
                "agent_name": waiting_step.agent_name,
                "step_number": int(waiting_step.step_number),
                "status": waiting_step.status.value,
                "output_summary": self._summarize_output(waiting_step.agent_name, waiting_step.output_data),
                "cesium_actions": waiting_step.cesium_actions,
            }
        
        current_idx = AGENT_ORDER.index(step_session.current_agent) if step_session.current_agent else -1
        if current_idx < len(AGENT_ORDER) - 1:
            next_agent = AGENT_ORDER[current_idx + 1]
            return {
                "agent_name": next_agent,
                "step_number": current_idx + 2,
                "status": "pending",
                "output_summary": None,
                "cesium_actions": None,
            }
        
        return None

    async def _get_step_session(self, session_id: str) -> DetourStepSession:
        stmt = select(DetourStepSession).where(DetourStepSession.session_id == session_id)
        result = await self.db.execute(stmt)
        step_session = result.scalar_one_or_none()
        
        if not step_session:
            raise NotFoundError(
                resource_type="DetourStepSession",
                resource_id=session_id,
            )
        return step_session

    async def _build_graph_state(self, step_session: DetourStepSession) -> DetourGraphState:
        return {
            "session_id": step_session.session_id,
            "tenant_id": step_session.tenant_id,
            "satellite_id": step_session.satellite_id,
            "conjunction_event_id": step_session.conjunction_event_id,
            "satellite_state": None,
            "conjunction_data": None,
            "screening_results": [],
            "risk_assessment": None,
            "maneuver_options": [],
            "safety_review": None,
            "ops_brief": None,
            "current_agent": "",
            "events": [],
            "errors": [],
            "completed": False,
        }

    def _extract_agent_output(self, agent_name: str, state: DetourGraphState) -> Dict[str, Any]:
        """Extract relevant output data from graph state for a specific agent."""
        if agent_name == "scout":
            return {"screening_results": state.get("screening_results", [])}
        elif agent_name == "analyst":
            return {"risk_assessment": state.get("risk_assessment")}
        elif agent_name == "planner":
            return {"maneuver_options": state.get("maneuver_options", [])}
        elif agent_name == "safety":
            return {"safety_review": state.get("safety_review")}
        elif agent_name == "ops_brief":
            return {"ops_brief": state.get("ops_brief")}
        return {}

    def _extract_cesium_actions(self, agent_name: str, state: DetourGraphState) -> List[Dict[str, Any]]:
        """Extract Cesium actions from agent execution."""
        actions = []
        
        if agent_name == "scout":
            screening = state.get("screening_results", [])
            if screening:
                for result in screening[:1]:
                    actions.append({
                        "type": "cesium.flyTo",
                        "payload": {
                            "target": "conjunction",
                            "conjunction_data": result,
                        },
                    })
                    actions.append({
                        "type": "cesium.drawLine",
                        "payload": {
                            "from": state.get("satellite_id"),
                            "to": result.get("object_id"),
                            "color": "#FF6B6B",
                        },
                    })
        
        elif agent_name == "analyst":
            risk = state.get("risk_assessment")
            if risk:
                risk_level = risk.get("risk_level", "LOW")
                color = {"LOW": "#4CAF50", "MEDIUM": "#FFC107", "HIGH": "#FF9800", "CRITICAL": "#F44336"}.get(risk_level, "#9E9E9E")
                actions.append({
                    "type": "cesium.showUncertainty",
                    "payload": {
                        "risk_level": risk_level,
                        "color": color,
                    },
                })
        
        elif agent_name == "planner":
            maneuvers = state.get("maneuver_options", [])
            for m in maneuvers[:3]:
                actions.append({
                    "type": "cesium.showTrajectory",
                    "payload": {
                        "maneuver": m,
                        "color": "#2196F3",
                    },
                })
        
        elif agent_name == "ops_brief":
            actions.append({
                "type": "cesium.showSummary",
                "payload": {
                    "ops_brief": state.get("ops_brief"),
                },
            })
        
        return actions

    def _summarize_output(self, agent_name: str, output_data: Optional[Dict[str, Any]]) -> str:
        """Create a human-readable summary of agent output."""
        if not output_data:
            return ""
        
        if agent_name == "scout":
            results = output_data.get("screening_results", [])
            return f"Trovate {len(results)} congiunzioni potenziali"
        elif agent_name == "analyst":
            risk = output_data.get("risk_assessment", {})
            return f"Rischio: {risk.get('risk_level', 'UNKNOWN')}"
        elif agent_name == "planner":
            options = output_data.get("maneuver_options", [])
            return f"Proposte {len(options)} opzioni di manovra"
        elif agent_name == "safety":
            review = output_data.get("safety_review", {})
            return "Approvato" if review.get("approved") else "Non approvato"
        elif agent_name == "ops_brief":
            brief = output_data.get("ops_brief", {})
            return brief.get("recommended_action", "")
        return ""

    async def _archive_session(self, step_session: DetourStepSession, state: DetourGraphState) -> None:
        """Archive completed session for historical reference."""
        risk = (state.get("risk_assessment") or {}).get("risk_level", "unknown")
        
        stmt = select(DetourAgentStep).where(DetourAgentStep.session_id == step_session.session_id)
        result = await self.db.execute(stmt)
        steps = result.scalars().all()
        
        archive = DetourAnalysisArchive(
            session_id=step_session.session_id,
            conjunction_event_id=step_session.conjunction_event_id,
            satellite_id=step_session.satellite_id,
            tenant_id=step_session.tenant_id,
            status="completed",
            final_risk_level=risk,
            recommended_maneuver=state.get("maneuver_options", [{}])[0] if state.get("maneuver_options") else None,
            steps_summary=[
                {
                    "agent": s.agent_name,
                    "status": s.status.value,
                    "output_summary": self._summarize_output(s.agent_name, s.output_data),
                }
                for s in steps
            ],
            created_at=step_session.started_at,
            completed_at=step_session.completed_at,
        )
        self.db.add(archive)
        
        logger.info(
            "detour_session_archived",
            session_id=step_session.session_id,
        )
