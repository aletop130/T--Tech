"""Deprecated step-by-step Detour API endpoints.

After upstream agent cutover, step-by-step human-approval endpoints are
temporarily disabled.
"""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Body, Depends, Path, Query

from app.api.deps import require_role
from app.core.exceptions import SDAException
from app.schemas.detour import AgentApprovalRequest, AgentRejectRequest, StepByStepRequest

router = APIRouter(prefix="/ai/agents/detour", tags=["AI Agents - Detour"])


def _step_api_disabled() -> None:
    raise SDAException(
        status_code=501,
        error_type="detour-step-api-disabled",
        title="Detour Step API Disabled",
        detail=(
            "Step-by-step Detour workflow is disabled after upstream agent cutover. "
            "Use /api/v1/detour/conjunctions/{conjunction_id}/analyze."
        ),
        extra={
            "deprecated": True,
            "replacement": "/api/v1/detour/conjunctions/{conjunction_id}/analyze",
        },
    )


@router.post("/start", response_model=dict)
async def start_step_by_step(
    request: StepByStepRequest,
    user=Depends(require_role("operator")),
):
    _step_api_disabled()


@router.post("/sessions/{session_id}/steps/{agent_name}/execute", response_model=dict)
async def execute_agent_step(
    session_id: str = Path(..., description="Detour session identifier"),
    agent_name: str = Path(..., description="Agent name"),
):
    _step_api_disabled()


@router.post("/sessions/{session_id}/steps/{agent_name}/approve", response_model=dict)
async def approve_agent_step(
    session_id: str = Path(..., description="Detour session identifier"),
    agent_name: str = Path(..., description="Agent name"),
    request: Optional[AgentApprovalRequest] = Body(None),
    user=Depends(require_role("operator")),
):
    _step_api_disabled()


@router.post("/sessions/{session_id}/steps/{agent_name}/reject", response_model=dict)
async def reject_agent_step(
    session_id: str = Path(..., description="Detour session identifier"),
    agent_name: str = Path(..., description="Agent name"),
    request: AgentRejectRequest = Body(...),
    user=Depends(require_role("operator")),
):
    _step_api_disabled()


@router.get("/sessions/{session_id}", response_model=dict)
async def get_session_status(
    session_id: str = Path(..., description="Detour session identifier"),
    user=Depends(require_role("viewer")),
):
    _step_api_disabled()


@router.get("/sessions/{session_id}/next", response_model=dict)
async def get_next_step(
    session_id: str = Path(..., description="Detour session identifier"),
    user=Depends(require_role("viewer")),
):
    _step_api_disabled()


@router.get("/archive", response_model=dict)
async def list_archived_analyses(
    page: int = Query(1, ge=1, description="Page number"),
    limit: int = Query(20, ge=1, le=100, description="Items per page"),
    satellite_id: Optional[str] = Query(None, description="Filter by satellite ID"),
    risk_level: Optional[str] = Query(None, description="Filter by risk level"),
    user=Depends(require_role("viewer")),
):
    _step_api_disabled()


@router.get("/archive/{analysis_id}", response_model=dict)
async def get_archived_analysis(
    analysis_id: str = Path(..., description="Archived analysis identifier"),
    user=Depends(require_role("viewer")),
):
    _step_api_disabled()


@router.post("/archive/{analysis_id}/reanalyze", response_model=dict)
async def reanalyze_archived(
    analysis_id: str = Path(..., description="Archived analysis identifier"),
    user=Depends(require_role("operator")),
):
    _step_api_disabled()
