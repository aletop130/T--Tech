"""AI Agents Detour step-by-step API endpoints.

This module provides endpoints for the step-by-step Detour pipeline execution
with human approval between each agent.
"""

from typing import Any, List, Optional

from fastapi import APIRouter, Depends, Path, Body, HTTPException, Query
from sqlalchemy import and_, select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_db, require_role
from app.core.exceptions import NotFoundError, ValidationError

from app.schemas.detour import (
    StepByStepRequest,
    StepSessionResponse,
    StepExecutionResponse,
    AgentApprovalRequest,
    AgentRejectRequest,
)
from app.services.detour.step_manager import DetourStepManager
from app.db.models.detour import DetourStepStatus, DetourAnalysisArchive
from app.services.detour.state_manager import DetourStateManager

router = APIRouter(prefix="/ai/agents/detour", tags=["AI Agents - Detour"])


async def get_step_manager(db: AsyncSession = Depends(get_db)) -> DetourStepManager:
    """Provide a DetourStepManager instance for the request."""
    return DetourStepManager(db)


@router.post("/start", response_model=StepSessionResponse, summary="Start Step-by-Step Analysis", description="Initialize a new step-by-step Detour analysis session and execute the first agent (Scout).")
async def start_step_by_step(
    request: StepByStepRequest,
    user = Depends(require_role('operator')),
    step_manager: DetourStepManager = Depends(get_step_manager),
):
    """Start a step-by-step Detour analysis.
    
    Creates a new session and immediately executes the Scout agent.
    The session will pause for human approval before executing the next agent.
    """
    try:
        session = await step_manager.start_step_session(
            conjunction_event_id=request.conjunction_event_id,
            satellite_id=request.satellite_id,
            tenant_id=user.tenant_id,
            execution_mode=request.execution_mode,
        )

        # Run Scout immediately so the session starts with actionable output.
        await step_manager.execute_agent_step(session.session_id, "scout")
        
        await step_manager.db.commit()
        
        status = await step_manager.get_session_status(session.session_id)
        
        return StepSessionResponse(
            session_id=status["session_id"],
            conjunction_event_id=status["conjunction_event_id"],
            satellite_id=status["satellite_id"],
            execution_mode=status["execution_mode"],
            status=status["status"],
            current_agent=status["current_agent"],
            current_step_number=int(status["current_step_number"]) if status["current_step_number"] else None,
            cesium_actions=status.get("cesium_actions"),
            started_at=status.get("started_at"),
        )
    except Exception as e:
        await step_manager.db.rollback()
        raise


@router.post("/sessions/{session_id}/steps/{agent_name}/execute", response_model=StepExecutionResponse, summary="Execute Agent Step", description="Execute a specific agent step (after approval of the previous step).")
async def execute_agent_step(
    session_id: str = Path(..., description="Detour session identifier"),
    agent_name: str = Path(..., description="Agent name: scout, analyst, planner, safety, or ops_brief"),
    step_manager: DetourStepManager = Depends(get_step_manager),
):
    """Execute a specific agent step.
    
    The step must be pending execution (previous step was approved).
    """
    try:
        agent_step = await step_manager.execute_agent_step(session_id, agent_name)
        
        next_available = await step_manager.get_next_available_step(session_id)
        
        await step_manager.db.commit()
        
        summary = ""
        if agent_name == "scout":
            output = agent_step.output_data or {}
            results = output.get("screening_results", [])
            summary = f"Trovate {len(results)} congiunzioni potenziali"
        elif agent_name == "analyst":
            output = agent_step.output_data or {}
            risk = output.get("risk_assessment", {})
            summary = f"Rischio: {risk.get('risk_level', 'UNKNOWN')}"
        elif agent_name == "planner":
            output = agent_step.output_data or {}
            options = output.get("maneuver_options", [])
            summary = f"Proposte {len(options)} opzioni di manovra"
        elif agent_name == "safety":
            summary = "Validazione completata"
        elif agent_name == "ops_brief":
            summary = "Riepilogo operativo generato"
        
        return StepExecutionResponse(
            session_id=session_id,
            agent_name=agent_name,
            step_number=int(agent_step.step_number),
            status=agent_step.status,
            output_summary=summary,
            cesium_actions=agent_step.cesium_actions,
            next_step_available=next_available is not None,
            next_agent=next_available.get("agent_name") if next_available else None,
            message=f"Agent {agent_name} executed successfully" if agent_step.status == DetourStepStatus.WAITING_APPROVAL else f"Pipeline {agent_name} completed",
        )
    except (NotFoundError, ValidationError) as e:
        await step_manager.db.rollback()
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        await step_manager.db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/sessions/{session_id}/steps/{agent_name}/approve", response_model=StepSessionResponse, summary="Approve Agent Step", description="Approve the current agent step and allow execution of the next agent.")
async def approve_agent_step(
    session_id: str = Path(..., description="Detour session identifier"),
    agent_name: str = Path(..., description="Agent name to approve"),
    request: AgentApprovalRequest = Body(None),
    user = Depends(require_role('operator')),
    step_manager: DetourStepManager = Depends(get_step_manager),
):
    """Approve the current agent step.
    
    After approval, the next agent in the pipeline becomes available for execution.
    """
    try:
        await step_manager.approve_agent_step(
            session_id=session_id,
            agent_name=agent_name,
            approved_by=user.sub,
            notes=request.notes if request else None,
        )
        
        await step_manager.db.commit()
        
        status = await step_manager.get_session_status(session_id)
        
        return StepSessionResponse(
            session_id=status["session_id"],
            conjunction_event_id=status["conjunction_event_id"],
            satellite_id=status["satellite_id"],
            execution_mode=status["execution_mode"],
            status=status["status"],
            current_agent=status["current_agent"],
            current_step_number=int(status["current_step_number"]) if status["current_step_number"] else None,
            cesium_actions=status.get("cesium_actions"),
            final_ops_brief=status.get("final_ops_brief"),
            started_at=status.get("started_at"),
            completed_at=status.get("completed_at"),
        )
    except (NotFoundError, ValidationError) as e:
        await step_manager.db.rollback()
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        await step_manager.db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/sessions/{session_id}/steps/{agent_name}/reject", response_model=StepSessionResponse, summary="Reject Agent Step", description="Reject the current agent step and halt the pipeline.")
async def reject_agent_step(
    session_id: str = Path(..., description="Detour session identifier"),
    agent_name: str = Path(..., description="Agent name to reject"),
    request: AgentRejectRequest = Body(...),
    user = Depends(require_role('operator')),
    step_manager: DetourStepManager = Depends(get_step_manager),
):
    """Reject the current agent step.
    
    This halts the entire pipeline. The session is marked as cancelled.
    """
    try:
        await step_manager.reject_agent_step(
            session_id=session_id,
            agent_name=agent_name,
            reason=request.reason,
        )
        
        await step_manager.db.commit()
        
        status = await step_manager.get_session_status(session_id)
        
        return StepSessionResponse(
            session_id=status["session_id"],
            conjunction_event_id=status["conjunction_event_id"],
            satellite_id=status["satellite_id"],
            execution_mode=status["execution_mode"],
            status=status["status"],
            started_at=status.get("started_at"),
            completed_at=status.get("completed_at"),
        )
    except (NotFoundError, ValidationError) as e:
        await step_manager.db.rollback()
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        await step_manager.db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/sessions/{session_id}", response_model=StepSessionResponse, summary="Get Session Status", description="Get the complete status of a step-by-step Detour session.")
async def get_session_status(
    session_id: str = Path(..., description="Detour session identifier"),
    step_manager: DetourStepManager = Depends(get_step_manager),
):
    """Retrieve the complete status of a step-by-step session.
    
    Returns details about all executed steps, current status, and Cesium actions.
    """
    try:
        status = await step_manager.get_session_status(session_id)
        
        return StepSessionResponse(
            session_id=status["session_id"],
            conjunction_event_id=status["conjunction_event_id"],
            satellite_id=status["satellite_id"],
            execution_mode=status["execution_mode"],
            status=status["status"],
            current_agent=status["current_agent"],
            current_step_number=int(status["current_step_number"]) if status["current_step_number"] else None,
            cesium_actions=status.get("cesium_actions"),
            final_ops_brief=status.get("final_ops_brief"),
            final_risk_level=status.get("final_risk_level"),
            started_at=status.get("started_at"),
            completed_at=status.get("completed_at"),
        )
    except NotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/sessions/{session_id}/next", response_model=dict, summary="Get Next Available Step", description="Get the next step available for execution in the pipeline.")
async def get_next_step(
    session_id: str = Path(..., description="Detour session identifier"),
    step_manager: DetourStepManager = Depends(get_step_manager),
):
    """Get the next available step for execution.
    
    Returns the agent that can be executed next, or null if the pipeline is complete.
    """
    try:
        next_step = await step_manager.get_next_available_step(session_id)
        
        if next_step is None:
            return {
                "available": False,
                "message": "Pipeline completed or no active session",
            }
        
        return {
            "available": True,
            "agent_name": next_step["agent_name"],
            "step_number": next_step["step_number"],
            "status": next_step["status"],
            "output_summary": next_step.get("output_summary"),
            "cesium_actions": next_step.get("cesium_actions"),
        }
    except NotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))


# =============================================================================
# Archive Endpoints
# =============================================================================

@router.get("/archive", response_model=dict, summary="List Archived Analyses", description="Get all archived Detour analyses with pagination.")
async def list_archived_analyses(
    page: int = Query(1, ge=1, description="Page number"),
    limit: int = Query(20, ge=1, le=100, description="Items per page"),
    satellite_id: Optional[str] = Query(None, description="Filter by satellite ID"),
    risk_level: Optional[str] = Query(None, description="Filter by risk level"),
    user = Depends(require_role('viewer')),
    db: AsyncSession = Depends(get_db),
):
    """Retrieve archived analyses with optional filters."""
    stmt = select(DetourAnalysisArchive).where(
        DetourAnalysisArchive.tenant_id == user.tenant_id
    )
    
    if satellite_id:
        stmt = stmt.where(DetourAnalysisArchive.satellite_id == satellite_id)
    
    if risk_level:
        stmt = stmt.where(DetourAnalysisArchive.final_risk_level == risk_level)
    
    # Count total
    from sqlalchemy import func
    count_stmt = select(func.count()).select_from(stmt.subquery())
    total_result = await db.execute(count_stmt)
    total = total_result.scalar() or 0
    
    # Get paginated results
    stmt = stmt.order_by(desc(DetourAnalysisArchive.completed_at))
    stmt = stmt.offset((page - 1) * limit).limit(limit)
    
    result = await db.execute(stmt)
    analyses = result.scalars().all()
    
    return {
        "items": [
            {
                "id": a.id,
                "session_id": a.session_id,
                "conjunction_event_id": a.conjunction_event_id,
                "satellite_id": a.satellite_id,
                "satellite_name": a.satellite_name,
                "status": a.status,
                "final_risk_level": a.final_risk_level,
                "was_executed": a.was_executed,
                "executed_at": a.executed_at.isoformat() if a.executed_at else None,
                "created_at": a.created_at.isoformat() if a.created_at else None,
                "completed_at": a.completed_at.isoformat() if a.completed_at else None,
                "steps_summary": a.steps_summary,
            }
            for a in analyses
        ],
        "total": total,
        "page": page,
        "limit": limit,
        "pages": (total + limit - 1) // limit if total > 0 else 0,
    }


@router.get("/archive/{analysis_id}", response_model=dict, summary="Get Archived Analysis", description="Get detailed information about a specific archived analysis.")
async def get_archived_analysis(
    analysis_id: str = Path(..., description="Archived analysis identifier"),
    user = Depends(require_role('viewer')),
    db: AsyncSession = Depends(get_db),
):
    """Retrieve detailed information about a specific archived analysis."""
    stmt = select(DetourAnalysisArchive).where(
        and_(
            DetourAnalysisArchive.id == analysis_id,
            DetourAnalysisArchive.tenant_id == user.tenant_id,
        )
    )
    result = await db.execute(stmt)
    analysis = result.scalar_one_or_none()
    
    if not analysis:
        raise HTTPException(status_code=404, detail="Archived analysis not found")
    
    return {
        "id": analysis.id,
        "session_id": analysis.session_id,
        "conjunction_event_id": analysis.conjunction_event_id,
        "satellite_id": analysis.satellite_id,
        "satellite_name": analysis.satellite_name,
        "status": analysis.status,
        "final_risk_level": analysis.final_risk_level,
        "recommended_maneuver": analysis.recommended_maneuver,
        "was_executed": analysis.was_executed,
        "executed_at": analysis.executed_at.isoformat() if analysis.executed_at else None,
        "steps_summary": analysis.steps_summary,
        "created_at": analysis.created_at.isoformat() if analysis.created_at else None,
        "completed_at": analysis.completed_at.isoformat() if analysis.completed_at else None,
    }


@router.post("/archive/{analysis_id}/reanalyze", response_model=dict, summary="Reanalyze Archived", description="Start a new analysis based on an archived analysis.")
async def reanalyze_archived(
    analysis_id: str = Path(..., description="Archived analysis identifier"),
    user = Depends(require_role('operator')),
    db: AsyncSession = Depends(get_db),
):
    """Start a new step-by-step analysis based on an archived one."""
    stmt = select(DetourAnalysisArchive).where(
        and_(
            DetourAnalysisArchive.id == analysis_id,
            DetourAnalysisArchive.tenant_id == user.tenant_id,
        )
    )
    result = await db.execute(stmt)
    analysis = result.scalar_one_or_none()
    
    if not analysis:
        raise HTTPException(status_code=404, detail="Archived analysis not found")
    
    # Start new step-by-step session
    step_manager = DetourStepManager(db)
    session = await step_manager.start_step_session(
        conjunction_event_id=analysis.conjunction_event_id,
        satellite_id=analysis.satellite_id,
        tenant_id=user.tenant_id,
        execution_mode="step_by_step",
    )
    
    await db.commit()
    
    return {
        "message": "New analysis started based on archived session",
        "new_session_id": session.session_id,
        "archived_session_id": analysis.session_id,
    }
