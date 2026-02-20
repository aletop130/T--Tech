"""Detour API endpoints backed by vendored upstream agent pipeline."""

from __future__ import annotations

import json
from typing import Any

from fastapi import APIRouter, Body, Depends, Path, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_db, require_role
from app.core.exceptions import NotFoundError, SDAException
from app.schemas.detour import (
    ManeuverApprovalRequest,
    ManeuverPlanSchema,
    SatelliteStateSchema,
    ScreeningRequest,
)
from app.services.detour.state_manager import DetourStateManager
from app.services.detour.upstream_agent_service import UpstreamDetourAgentService

router = APIRouter()


class ManeuverRejectRequest(BaseModel):
    """Payload to reject a maneuver plan."""

    reason: str = Field(..., description="Reason for rejection")


async def get_detour_state_manager(db: AsyncSession = Depends(get_db)) -> DetourStateManager:
    return DetourStateManager(db)


async def get_upstream_agent_service(
    db: AsyncSession = Depends(get_db),
) -> UpstreamDetourAgentService:
    return UpstreamDetourAgentService(db)


def _deprecated_endpoint(detail: str, replacement: str | None = None) -> None:
    extra: dict[str, Any] = {"deprecated": True}
    if replacement:
        extra["replacement"] = replacement
    raise SDAException(
        status_code=501,
        error_type="endpoint-deprecated",
        title="Endpoint Deprecated",
        detail=detail,
        extra=extra,
    )


@router.post(
    "/conjunctions/{conjunction_id}/analyze",
    response_model=dict,
    summary="Trigger Conjunction Analysis",
    description="Triggers the upstream Detour multi-agent pipeline for a conjunction.",
)
async def trigger_conjunction_analysis(
    conjunction_id: str = Path(..., description="Conjunction event identifier"),
    user=Depends(require_role("operator")),
    service: UpstreamDetourAgentService = Depends(get_upstream_agent_service),
):
    session_id = await service.trigger_conjunction_analysis(conjunction_id, user.tenant_id)
    return {"session_id": session_id}


@router.get(
    "/sessions/{session_id}/status",
    response_model=dict,
    summary="Get Analysis Status",
    description="Retrieve current status or stream status events for a Detour analysis session.",
)
async def get_analysis_status(
    request: Request,
    session_id: str = Path(..., description="Detour analysis session identifier"),
    user=Depends(require_role("viewer")),
    service: UpstreamDetourAgentService = Depends(get_upstream_agent_service),
):
    accept = request.headers.get("Accept", "")
    if "text/event-stream" in accept:
        async def event_generator():
            async for payload in service.stream_analysis_status(session_id):
                yield f"data: {json.dumps(payload)}\n\n"

        return StreamingResponse(event_generator(), media_type="text/event-stream")
    return await service.get_analysis_status(session_id)


@router.get(
    "/sessions/{session_id}/results",
    response_model=dict,
    summary="Get Analysis Results",
    description="Retrieve final results of a completed Detour analysis session.",
)
async def get_analysis_results(
    session_id: str = Path(..., description="Detour analysis session identifier"),
    user=Depends(require_role("viewer")),
    service: UpstreamDetourAgentService = Depends(get_upstream_agent_service),
):
    return await service.get_analysis_results(session_id)


@router.post(
    "/maneuvers/{plan_id}/approve",
    response_model=ManeuverPlanSchema,
    summary="Approve Maneuver Plan",
    description="Deprecated endpoint after upstream agent cutover.",
)
async def approve_maneuver_plan(
    plan_id: str = Path(..., description="Maneuver plan identifier"),
    request: ManeuverApprovalRequest | None = Body(None),
    user=Depends(require_role("operator")),
):
    _deprecated_endpoint(
        detail="Maneuver plan approval endpoint is deprecated after upstream cutover.",
        replacement="/api/v1/detour/conjunctions/{conjunction_id}/analyze",
    )


@router.post(
    "/maneuvers/{plan_id}/reject",
    response_model=ManeuverPlanSchema,
    summary="Reject Maneuver Plan",
    description="Deprecated endpoint after upstream agent cutover.",
)
async def reject_maneuver_plan(
    plan_id: str = Path(..., description="Maneuver plan identifier"),
    request: ManeuverRejectRequest = Body(...),
    user=Depends(require_role("operator")),
):
    _deprecated_endpoint(
        detail="Maneuver plan rejection endpoint is deprecated after upstream cutover.",
        replacement="/api/v1/detour/conjunctions/{conjunction_id}/analyze",
    )


@router.post(
    "/maneuvers/{plan_id}/execute",
    response_model=dict,
    summary="Execute Maneuver Plan",
    description="Deprecated endpoint after upstream agent cutover.",
)
async def execute_maneuver_plan(
    plan_id: str = Path(..., description="Maneuver plan identifier"),
    user=Depends(get_current_user),
):
    _deprecated_endpoint(
        detail="Maneuver execution endpoint is deprecated after upstream cutover.",
        replacement="/api/v1/detour/conjunctions/{conjunction_id}/analyze",
    )


@router.get(
    "/satellites/{satellite_id}/state",
    response_model=SatelliteStateSchema,
    summary="Get Satellite Detour State",
    description="Fetch detour-specific state for a satellite (legacy read-only endpoint).",
)
async def get_satellite_state(
    satellite_id: str = Path(..., description="Satellite identifier"),
    user=Depends(require_role("viewer")),
    state_manager: DetourStateManager = Depends(get_detour_state_manager),
):
    state = await state_manager.get_satellite_state(satellite_id, user.tenant_id)
    if not state:
        raise NotFoundError("DetourSatelliteState", f"{satellite_id}:{user.tenant_id}")
    return SatelliteStateSchema.model_validate(state)


@router.get(
    "/satellites/{satellite_id}/maneuvers",
    response_model=list[ManeuverPlanSchema],
    summary="List Maneuver History",
    description="Legacy read-only maneuver history endpoint.",
)
async def list_maneuver_history(
    satellite_id: str = Path(..., description="Satellite identifier"),
    user=Depends(require_role("viewer")),
    state_manager: DetourStateManager = Depends(get_detour_state_manager),
):
    plans = await state_manager.get_maneuver_history(satellite_id, user.tenant_id)
    return [ManeuverPlanSchema.model_validate(p) for p in plans]


@router.post(
    "/screening/run",
    response_model=dict,
    summary="Run Manual Screening",
    description="Run manual screening via vendored upstream toolchain.",
)
async def run_screening(
    request: ScreeningRequest = Body(...),
    user=Depends(require_role("operator")),
    service: UpstreamDetourAgentService = Depends(get_upstream_agent_service),
):
    return await service.run_manual_screening(
        satellite_id=request.satellite_id,
        time_window_hours=request.time_window_hours,
        threshold_km=request.threshold_km,
    )
