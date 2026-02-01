"""AI API endpoints."""
from typing import Annotated

from fastapi import APIRouter, Depends

from app.api.deps import get_current_user, get_ai_service
from app.core.security import TokenData
from app.services.ai import AIService
from app.schemas.ai import (
    ChatRequest,
    ChatResponse,
    ConjunctionAnalystRequest,
    ConjunctionAnalystResponse,
    SpaceWeatherWatchRequest,
    SpaceWeatherWatchResponse,
    MitigationProposal,
)

router = APIRouter()


@router.post("/chat", response_model=ChatResponse)
async def chat(
    request: ChatRequest,
    user: Annotated[TokenData, Depends(get_current_user)],
    service: Annotated[AIService, Depends(get_ai_service)],
):
    """Chat with AI assistant with context."""
    return await service.chat(
        request=request,
        tenant_id=user.tenant_id,
        user_id=user.sub,
    )


@router.post(
    "/agents/conjunction-analyst",
    response_model=ConjunctionAnalystResponse
)
async def conjunction_analyst(
    request: ConjunctionAnalystRequest,
    user: Annotated[TokenData, Depends(get_current_user)],
    service: Annotated[AIService, Depends(get_ai_service)],
):
    """Conjunction Analyst agent for risk analysis and COA recommendations."""
    return await service.analyze_conjunction(
        request=request,
        tenant_id=user.tenant_id,
        user_id=user.sub,
    )


@router.post(
    "/agents/space-weather-watch",
    response_model=SpaceWeatherWatchResponse
)
async def space_weather_watch(
    request: SpaceWeatherWatchRequest,
    user: Annotated[TokenData, Depends(get_current_user)],
    service: Annotated[AIService, Depends(get_ai_service)],
):
    """Space Weather Watch agent for impact analysis and playbooks."""
    return await service.analyze_space_weather(
        request=request,
        tenant_id=user.tenant_id,
        user_id=user.sub,
    )


@router.post(
    "/agents/propose-mitigation",
    response_model=MitigationProposal
)
async def propose_mitigation(
    event_id: str,
    event_type: str,
    user: Annotated[TokenData, Depends(get_current_user)],
    service: Annotated[AIService, Depends(get_ai_service)],
):
    """Propose mitigation options for an event."""
    return await service.propose_mitigation(
        event_id=event_id,
        event_type=event_type,
        tenant_id=user.tenant_id,
        user_id=user.sub,
    )

