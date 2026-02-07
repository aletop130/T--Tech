"""AI API endpoints."""
import json
from typing import Annotated, Any, AsyncGenerator
from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse

from app.api.deps import get_current_user, get_ai_service
from app.core.security import TokenData
from app.services.ai import AIService
from app.schemas.ai import (
    ChatMessage,
    ChatRequest,
    ChatResponse,
    ConjunctionAnalystRequest,
    ConjunctionAnalystResponse,
    SpaceWeatherWatchRequest,
    SpaceWeatherWatchResponse,
    MitigationProposal,
)
from app.schemas.cesium import CesiumAction

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


@router.post("/chat/stream")
async def stream_chat(
    request: Request,
    user: Annotated[TokenData, Depends(get_current_user)],
    service: Annotated[AIService, Depends(get_ai_service)],
):
    """Stream chat response with SSE and function calling."""
    body = await request.json()
    messages = body.get("messages", [])
    scene_state = body.get("sceneState", {})
    include_satellites = body.get("includeSatellites", True)  # Default: includi satelliti
    
    async def generate() -> AsyncGenerator[str, None]:
        try:
            async for data in service.stream_chat_with_functions(
                messages=messages, 
                scene_state=scene_state,
                tenant_id=user.tenant_id,
                include_satellites=include_satellites
            ):
                yield data
        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'error': str(e)})}\n\n"
    
    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/chat/execute")
async def execute_chat(
    request: Request,
    user: Annotated[TokenData, Depends(get_current_user)],
    service: Annotated[AIService, Depends(get_ai_service)],
):
    """Chat with function calling execution."""
    body = await request.json()
    messages = body.get("messages", [])
    scene_state = body.get("sceneState", {})
    
    chat_request = ChatRequest(
        messages=[ChatMessage(role=m.get("role", "user"), content=m.get("content", "")) for m in messages],
        max_tokens=2048,
        temperature=0.7,
    )
    
    content, actions = await service.chat_with_functions(
        request=chat_request,
        tenant_id=user.tenant_id,
        scene_state=scene_state,
        user_id=user.sub,
    )
    
    return {
        "message": content,
        "actions": [a.model_dump() for a in actions],
    }


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

