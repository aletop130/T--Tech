"""AI API endpoints."""
import asyncio
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
from app.core.logging import get_logger

router = APIRouter()
logger = get_logger(__name__)


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
                if await request.is_disconnected():
                    break
                yield data
        except asyncio.CancelledError:
            # Client disconnected while streaming.
            return
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


@router.post("/chat/orchestrate")
async def orchestrate_chat(
    request: Request,
    user: Annotated[TokenData, Depends(get_current_user)],
    service: Annotated[AIService, Depends(get_ai_service)],
):
    """Orchestrate 5 Detour agents with streaming and Cesium actions.
    
    This is the main endpoint for active chat control of the platform.
    Automatically detects user intent and runs appropriate agents with visualization.
    
    Events streamed:
    - agent_start: When an agent starts processing
    - cesium_action: Map visualization commands
    - agent_complete: When agent finishes
    - content: Text response chunks
    - memory_usage: Current context window percentage
    - error: Error messages
    """
    body = await request.json()
    message = body.get("message", "")
    session_id = body.get("session_id")
    map_session_id = body.get("map_session_id")
    mode = body.get("mode", "analyze")
    logger.info(
        "chat_orchestrate_request",
        tenant_id=user.tenant_id,
        user_id=user.sub,
        session_id=session_id,
        map_session_id=map_session_id,
        mode=mode,
        message_preview=message[:120],
    )
    
    async def generate() -> AsyncGenerator[str, None]:
        try:
            # Emit an immediate event so proxies/clients receive stream headers promptly.
            yield f"data: {json.dumps({'type': 'status', 'phase': 'accepted'})}\n\n"
            async for data in service.orchestrate_detour_agents(
                message=message,
                tenant_id=user.tenant_id,
                user_id=user.sub,
                session_id=session_id,
                map_session_id=map_session_id,
                mode=mode,
            ):
                if await request.is_disconnected():
                    break
                yield data
        except asyncio.CancelledError:
            # Client disconnected while streaming.
            return
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
