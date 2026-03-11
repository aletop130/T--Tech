"""Sandbox API endpoints."""
from typing import Annotated, List

from fastapi import APIRouter, Depends

from app.api.deps import get_current_user, get_sandbox_service
from app.core.security import TokenData
from app.schemas.sandbox import (
    SandboxActorCreate,
    SandboxActorUpdate,
    SandboxChatRequest,
    SandboxChatResponse,
    SandboxImportRequest,
    SandboxScenarioItemCreate,
    SandboxSessionControlRequest,
    SandboxSessionCreate,
    SandboxSessionSnapshot,
    SandboxSessionSummary,
    SandboxTickRequest,
    SandboxTLEImportRequest,
)
from app.services.sandbox import SandboxService

router = APIRouter()


@router.get("/sessions", response_model=List[SandboxSessionSummary])
async def list_sandbox_sessions(
    user: Annotated[TokenData, Depends(get_current_user)],
    service: Annotated[SandboxService, Depends(get_sandbox_service)],
):
    """List all sandbox sessions for the current user."""
    return await service.list_sessions(
        tenant_id=user.tenant_id,
        user_id=user.sub,
    )


@router.post("/sessions", response_model=SandboxSessionSnapshot)
async def create_sandbox_session(
    data: SandboxSessionCreate,
    user: Annotated[TokenData, Depends(get_current_user)],
    service: Annotated[SandboxService, Depends(get_sandbox_service)],
):
    """Create an isolated sandbox session."""
    return await service.create_session(
        tenant_id=user.tenant_id,
        user_id=user.sub,
        data=data,
    )


@router.get("/sessions/{session_id}", response_model=SandboxSessionSnapshot)
async def get_sandbox_session(
    session_id: str,
    user: Annotated[TokenData, Depends(get_current_user)],
    service: Annotated[SandboxService, Depends(get_sandbox_service)],
):
    """Get a sandbox session snapshot."""
    return await service.get_snapshot(
        session_id=session_id,
        tenant_id=user.tenant_id,
        user_id=user.sub,
    )


@router.post("/sessions/{session_id}/actors", response_model=SandboxSessionSnapshot)
async def create_sandbox_actor(
    session_id: str,
    data: SandboxActorCreate,
    user: Annotated[TokenData, Depends(get_current_user)],
    service: Annotated[SandboxService, Depends(get_sandbox_service)],
):
    """Create a sandbox actor."""
    return await service.create_actor(
        session_id=session_id,
        tenant_id=user.tenant_id,
        user_id=user.sub,
        data=data,
    )


@router.patch("/sessions/{session_id}/actors/{actor_id}", response_model=SandboxSessionSnapshot)
async def update_sandbox_actor(
    session_id: str,
    actor_id: str,
    data: SandboxActorUpdate,
    user: Annotated[TokenData, Depends(get_current_user)],
    service: Annotated[SandboxService, Depends(get_sandbox_service)],
):
    """Update a sandbox actor."""
    return await service.update_actor(
        session_id=session_id,
        actor_id=actor_id,
        tenant_id=user.tenant_id,
        user_id=user.sub,
        data=data,
    )


@router.delete("/sessions/{session_id}/actors/{actor_id}", response_model=SandboxSessionSnapshot)
async def delete_sandbox_actor(
    session_id: str,
    actor_id: str,
    user: Annotated[TokenData, Depends(get_current_user)],
    service: Annotated[SandboxService, Depends(get_sandbox_service)],
):
    """Delete a sandbox actor."""
    return await service.delete_actor(
        session_id=session_id,
        actor_id=actor_id,
        tenant_id=user.tenant_id,
        user_id=user.sub,
    )


@router.post("/sessions/{session_id}/items", response_model=SandboxSessionSnapshot)
async def create_sandbox_item(
    session_id: str,
    data: SandboxScenarioItemCreate,
    user: Annotated[TokenData, Depends(get_current_user)],
    service: Annotated[SandboxService, Depends(get_sandbox_service)],
):
    """Create a non-actor scenario item."""
    return await service.create_scenario_item(
        session_id=session_id,
        tenant_id=user.tenant_id,
        user_id=user.sub,
        data=data,
    )


@router.post("/sessions/{session_id}/control", response_model=SandboxSessionSnapshot)
async def control_sandbox_session(
    session_id: str,
    data: SandboxSessionControlRequest,
    user: Annotated[TokenData, Depends(get_current_user)],
    service: Annotated[SandboxService, Depends(get_sandbox_service)],
):
    """Control sandbox runtime."""
    return await service.control_session(
        session_id=session_id,
        tenant_id=user.tenant_id,
        user_id=user.sub,
        request=data,
    )


@router.post("/sessions/{session_id}/tick", response_model=SandboxSessionSnapshot)
async def tick_sandbox_session(
    session_id: str,
    data: SandboxTickRequest,
    user: Annotated[TokenData, Depends(get_current_user)],
    service: Annotated[SandboxService, Depends(get_sandbox_service)],
):
    """Advance sandbox runtime."""
    return await service.tick_session(
        session_id=session_id,
        tenant_id=user.tenant_id,
        user_id=user.sub,
        request=data,
    )


@router.post("/sessions/{session_id}/import", response_model=SandboxSessionSnapshot)
async def import_into_sandbox(
    session_id: str,
    data: SandboxImportRequest,
    user: Annotated[TokenData, Depends(get_current_user)],
    service: Annotated[SandboxService, Depends(get_sandbox_service)],
):
    """Clone live platform objects into sandbox-local state."""
    return await service.import_live_object(
        session_id=session_id,
        tenant_id=user.tenant_id,
        user_id=user.sub,
        request=data,
    )


@router.post("/sessions/{session_id}/import-tle", response_model=SandboxSessionSnapshot)
async def import_tle(
    session_id: str,
    data: SandboxTLEImportRequest,
    user: Annotated[TokenData, Depends(get_current_user)],
    service: Annotated[SandboxService, Depends(get_sandbox_service)],
):
    """Import a satellite from raw TLE text."""
    return await service.import_tle(
        session_id=session_id,
        tenant_id=user.tenant_id,
        user_id=user.sub,
        request=data,
    )


@router.post("/sessions/{session_id}/chat", response_model=SandboxChatResponse)
async def sandbox_chat(
    session_id: str,
    data: SandboxChatRequest,
    user: Annotated[TokenData, Depends(get_current_user)],
    service: Annotated[SandboxService, Depends(get_sandbox_service)],
):
    """Compile and execute sandbox chat commands."""
    return await service.compile_chat_prompt(
        session_id=session_id,
        tenant_id=user.tenant_id,
        user_id=user.sub,
        request=data,
    )
