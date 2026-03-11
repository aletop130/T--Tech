"""AI service for Regolo.ai integration."""
import asyncio
from datetime import datetime, timedelta
from typing import Any, Awaitable, Callable, Optional, AsyncGenerator
import json
import re

from openai import AsyncOpenAI
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.logging import get_logger
from app.core.exceptions import AIServiceError
from app.db.base import generate_uuid
from app.services.chat_memory import PostgreSQLChatMemory
from app.db.models.ontology import ObjectType
from app.schemas.ai import (
    ChatMessage,
    ChatRequest,
    ChatResponse,
    ConjunctionAnalystRequest,
    ConjunctionAnalystResponse,
    CourseOfAction,
    SpaceWeatherWatchRequest,
    SpaceWeatherWatchResponse,
    ServiceImpact,
    RecommendedControl,
    MitigationProposal,
    MitigationOption,
)
from app.schemas.cesium import CESIUM_FUNCTION_DEFINITIONS, CesiumAction
from app.schemas.agent_tools import ALL_AGENT_TOOLS
from app.schemas.ontology import SatelliteCreate, GroundStationCreate
from app.schemas.operations import PositionReportCreate, OperationCreate
from app.services.ontology import OntologyService
from app.services.audit import AuditService
from app.services.operations import PositionTrackingService, OperationService
from app.agents.detour.state import DetourGraphState

logger = get_logger(__name__)


class AIService:
    """AI service using Regolo.ai OpenAI-compatible API."""
    
    SYSTEM_PROMPT = """You are a helpful AI assistant for Space Domain Awareness (SDA).

IMPORTANT RULES:
1. Be conversational and natural - respond like a helpful colleague, not a database
2. For greetings like "ciao", "hello", "hi" - respond warmly and ask how you can help
3. NEVER invent or generate mock data - only use real data from the system
4. If no data is available, simply say: "Non ho dati disponibili nel sistema per questa richiesta."
5. Only provide technical satellite/conjunction/space weather data when explicitly asked
6. Keep responses concise and natural unless detailed analysis is requested

You can help with:
- Space situational awareness and satellite tracking
- Conjunction event analysis and risk assessment
- Space weather impact evaluation
- Ground station operations
- Incident analysis and management (you have access to active incidents)
- General questions about space domain awareness

When technical data IS requested and available, provide structured, actionable insights citing specific data."""
    
    VISUALIZATION_PATTERNS = {
        "show_maneuver_options": [
            r"(?i)(opzioni|options).*(manovra|maneuver)",
            r"(?i)(come|how).*(evitare|avoid|evito).*(collisione|collision)",
            r"(?i)(mostra|show).*(opzioni|options).*(manovra|maneuver)?",
            r"(?i)(cosa.*posso.*fare|what.*can.*do).*(collisione|collision)",
            r"(?i)(piano.*manovra|maneuver.*plan)",
        ],
        "highlight_maneuver": [
            r"(?i)(evidenzia|highlight).*(raccomandata|recommended|consigliata|migliore)",
            r"(?i)(quale|which|what).*(manovra|maneuver).*(consigli|recommend|migliore|best)",
            r"(?i)(scegli|choose|preferisci|suggest).*(manovra|maneuver)",
            r"(?i)(la.*migliore|the.*best).*(opzione|option|manovra|maneuver)",
        ],
        "show_conjunction_line": [
            r"(?i)(mostra|show|visualizza|display).*(conjunction|congiunzione|collisione).*(line|linea)",
            r"(?i)(linea|line).*(congiunzione|conjunction|tra|between)",
            r"(?i)(collegamento|connection|collega).*(satellit|debris|oggetti)",
            r"(?i)(dove.*incontra|where.*meet)",
        ],
        "show_risk_heatmap": [
            r"(?i)(heatmap|mappa.*rischio|risk.*heatmap|mappa.*rischi)",
            r"(?i)(mostra|show|visualizza).*(risk|rischio).*(area|mappa|heatmap|zona)",
            r"(?i)(area.*rischio|risk.*area)",
        ],
        "show_threat_radius": [
            r"(?i)(threat|minaccia|pericolo).*(radius|raggio|area)",
            r"(?i)(raggio|radius).*(minaccia|threat|pericolo)",
            r"(?i)(zona.*pericolo|danger.*zone|keep.*out)",
        ],
    }
    
    def __init__(self, db: AsyncSession, ontology: OntologyService):
        self.db = db
        self.ontology = ontology
        
        if settings.REGOLO_API_KEY:
            self.client = AsyncOpenAI(
                api_key=settings.REGOLO_API_KEY,
                base_url=settings.REGOLO_BASE_URL,
            )
        else:
            self.client = None
            logger.warning("REGOLO_API_KEY not configured")

    async def _create_completion(self, **kwargs) -> Any:
        """Create a chat completion with automatic fallback to REGOLO_FALLBACK_MODEL."""
        if not self.client:
            raise AIServiceError("AI service not configured")
        try:
            return await self.client.chat.completions.create(**kwargs)
        except Exception as primary_err:
            fallback = settings.REGOLO_FALLBACK_MODEL
            primary_model = kwargs.get("model", settings.REGOLO_MODEL)
            if fallback and fallback != primary_model:
                logger.warning(
                    "primary_model_failed_falling_back",
                    primary_model=primary_model,
                    fallback_model=fallback,
                    error=str(primary_err),
                )
                kwargs["model"] = fallback
                return await self.client.chat.completions.create(**kwargs)
            raise
    
    async def chat(
        self,
        request: ChatRequest,
        tenant_id: str,
        user_id: Optional[str] = None,
    ) -> ChatResponse:
        """Process a chat request with context."""
        request_id = generate_uuid()
        
        context = await self._build_context(
            request.context_object_ids,
            tenant_id,
            request.include_recent_events,
        )
        
        messages = [
            {"role": "system", "content": self.SYSTEM_PROMPT},
        ]
        
        if context:
            context_str = "Current context:\n" + json.dumps(context, indent=2)
            messages.append({"role": "system", "content": context_str})
        
        for msg in request.messages:
            messages.append({"role": msg.role, "content": msg.content})
        
        try:
            if not self.client:
                raise AIServiceError("AI service not configured")

            request_params = {
                "model": settings.REGOLO_MODEL,
                "messages": messages,
                "max_tokens": request.max_tokens,
                "temperature": request.temperature,
            }

            # Only include tools and tool_choice when context_object_ids are provided
            # Regolo API requires tools when tool_choice is set
            if request.context_object_ids:
                request_params["tools"] = CESIUM_FUNCTION_DEFINITIONS
                request_params["tool_choice"] = "auto"

            response = await self._create_completion(**request_params)
            
            assistant_message = response.choices[0].message
            
            logger.info(
                "ai_chat_complete",
                request_id=request_id,
                tokens_used=response.usage.total_tokens if response.usage else 0,
            )
            
            return ChatResponse(
                message=ChatMessage(
                    role="assistant",
                    content=assistant_message.content or "",
                ),
                usage={
                    "prompt_tokens": response.usage.prompt_tokens if response.usage else 0,
                    "completion_tokens": response.usage.completion_tokens if response.usage else 0,
                    "total_tokens": response.usage.total_tokens if response.usage else 0,
                },
                context_used=context,
                request_id=request_id,
            )
        except Exception as e:
            logger.error(f"AI chat error: {e}", request_id=request_id)
            raise AIServiceError(f"Failed to process chat: {str(e)}")
    
    async def chat_with_functions(
        self,
        request: ChatRequest,
        tenant_id: str,
        scene_state: Optional[dict[str, Any]] = None,
        user_id: Optional[str] = None,
    ) -> tuple[str, list[CesiumAction]]:
        """Process a chat request with function calling for Cesium actions."""
        request_id = generate_uuid()
        
        context = await self._build_context(
            request.context_object_ids,
            tenant_id,
            request.include_recent_events,
        )
        
        system_content = self.SYSTEM_PROMPT
        if scene_state:
            system_content += f"\n\nCurrent scene state:\n{json.dumps(scene_state, indent=2)}"
        
        messages: list[dict[str, Any]] = [
            {"role": "system", "content": system_content},
        ]
        
        if context:
            context_str = "Referenced objects:\n" + json.dumps(context, indent=2)
            messages.append({"role": "system", "content": context_str})
        
        for msg in request.messages:
            messages.append({"role": msg.role, "content": msg.content})
        
        actions: list[CesiumAction] = []
        
        try:
            if not self.client:
                return "AI service not configured. Please configure REGOLO_API_KEY.", actions
            
            response = await self._create_completion(
                model=settings.REGOLO_MODEL,
                messages=messages,
                max_tokens=request.max_tokens,
                temperature=request.temperature,
                tools=CESIUM_FUNCTION_DEFINITIONS,
            )
            
            response_message = response.choices[0].message
            content = response_message.content or ""
            
            if response_message.tool_calls:
                for tool_call in response_message.tool_calls:
                    function_name = tool_call.function.name
                    function_args = json.loads(tool_call.function.arguments or "{}")
                    
                    action = self._create_cesium_action(function_name, function_args)
                    if action:
                        actions.append(action)
                    
                    messages.append({
                        "role": "tool",
                        "tool_call_id": tool_call.id,
                        "name": function_name,
                        "content": json.dumps(function_args),
                    })
                
                second_response = await self._create_completion(
                    model=settings.REGOLO_MODEL,
                    messages=messages,
                    max_tokens=request.max_tokens,
                    temperature=request.temperature,
                )
                
                content = second_response.choices[0].message.content or content
            
            logger.info(
                "ai_chat_with_functions_complete",
                request_id=request_id,
                actions_count=len(actions),
            )
            
            return content, actions
            
        except Exception as e:
            logger.error(f"AI chat with functions error: {e}", request_id=request_id)
            return f"Error: {str(e)}", actions
    
    def _create_cesium_action(
        self,
        function_name: str,
        arguments: dict[str, Any],
    ) -> Optional[CesiumAction]:
        """Create a CesiumAction from function name and arguments."""
        action_map = {
            "cesium_set_clock": ("cesium.setClock", arguments),
            "cesium_load_czml": ("cesium.loadCzml", {"layerId": arguments.get("layerId"), "data": arguments.get("data")}),
            "cesium_add_entity": ("cesium.addEntity", {
                "entityType": arguments.get("entityType"),
                "name": arguments.get("name"),
                "position": arguments.get("position"),
                "properties": arguments.get("properties"),
            }),
            "cesium_fly_to": ("cesium.flyTo", {
                "entityId": arguments.get("entityId"),
                "longitude": arguments.get("longitude"),
                "latitude": arguments.get("latitude"),
                "altitude": arguments.get("altitude"),
                "heading": arguments.get("heading"),
                "pitch": arguments.get("pitch"),
                "roll": arguments.get("roll"),
                "duration": arguments.get("duration"),
            }),
            "cesium_toggle": ("cesium.toggle", {
                "showOrbits": arguments.get("showOrbits"),
                "showCoverage": arguments.get("showCoverage"),
                "showConjunctions": arguments.get("showConjunctions"),
                "showLabels": arguments.get("showLabels"),
            }),
            "cesium_remove_layer": ("cesium.removeLayer", {"layerId": arguments.get("layerId")}),
            "cesium_set_selected": ("cesium.setSelected", {"entityId": arguments.get("entityId")}),
            "cesium_fly_to_country": ("cesium.flyToCountry", {
                "country": arguments.get("country"),
                "altitude": arguments.get("altitude"),
                "duration": arguments.get("duration"),
            }),
"cesium_search_location": ("cesium.searchLocation", {
                "query": arguments.get("query"),
                "altitude": arguments.get("altitude"),
                "duration": arguments.get("duration"),
            }),
            "cesium_show_maneuver_options": ("cesium.showManeuverOptions", {
                "satellite_id": arguments.get("satellite_id"),
                "maneuvers": arguments.get("maneuvers"),
                "recommended_id": arguments.get("recommended_id"),
            }),
            "cesium_highlight_maneuver": ("cesium.highlightManeuver", {
                "satellite_id": arguments.get("satellite_id"),
                "maneuver_id": arguments.get("maneuver_id"),
                "color": arguments.get("color", "#00FF00"),
            }),
            "cesium_show_conjunction_line": ("cesium.showConjunctionLine", {
                "satellite_a_id": arguments.get("satellite_a_id"),
                "satellite_b_id": arguments.get("satellite_b_id"),
                "color": arguments.get("color", "#FF1744"),
                "label": arguments.get("label"),
            }),
            "cesium_show_risk_heatmap": ("cesium.showRiskHeatmap", {
                "satellite_id": arguments.get("satellite_id"),
                "risk_level": arguments.get("risk_level", "medium"),
                "probability": arguments.get("probability"),
            }),
            "cesium_show_threat_radius": ("cesium.showThreatRadius", {
                "satellite_id": arguments.get("satellite_id"),
                "radius_km": arguments.get("radius_km", 5.0),
                "color": arguments.get("color", "#FF5722"),
            }),
            "simulation_add_satellite": ("simulation.addSatellite", {
                "name": arguments.get("name"),
                "altitude_km": arguments.get("altitude_km"),
                "inclination_deg": arguments.get("inclination_deg", 0),
                "raan_deg": arguments.get("raan_deg", 0),
                "faction": arguments.get("faction", "neutral"),
            }),
            "simulation_add_ground_station": ("simulation.addGroundStation", {
                "name": arguments.get("name"),
                "latitude": arguments.get("latitude"),
                "longitude": arguments.get("longitude"),
                "coverage_radius_km": arguments.get("coverage_radius_km", 2000),
                "faction": arguments.get("faction", "neutral"),
            }),
            "simulation_add_vehicle": ("simulation.addVehicle", {
                "name": arguments.get("name"),
                "entity_type": arguments.get("entity_type", "ground_vehicle"),
                "latitude": arguments.get("latitude"),
                "longitude": arguments.get("longitude"),
                "heading_deg": arguments.get("heading_deg", 0),
                "faction": arguments.get("faction", "neutral"),
            }),
            "simulation_show_coverage": ("simulation.showCoverage", {
                "satellite_id": arguments.get("satellite_id"),
                "show": arguments.get("show", True),
                "min_elevation_deg": arguments.get("min_elevation_deg", 10.0),
            }),
            "simulation_analyze_coverage": ("simulation.analyzeCoverage", {
                "faction": arguments.get("faction", "allied"),
                "region_bounds": arguments.get("region_bounds"),
            }),
            "simulation_remove_entity": ("simulation.removeEntity", {
                "entity_type": arguments.get("entity_type"),
                "entity_id": arguments.get("entity_id"),
            }),
        }
        
        if function_name in action_map:
            action_type, payload = action_map[function_name]
            return CesiumAction(type=action_type, payload=payload)
        
        return None
    
    async def stream_chat(
        self,
        messages: list[dict[str, Any]],
        scene_state: Optional[dict[str, Any]] = None,
    ) -> AsyncGenerator[str, None]:
        """Stream chat response from AI."""
        if not self.client:
            yield "data: error\n\n"
            return
        
        system_content = self.SYSTEM_PROMPT
        if scene_state:
            system_content += f"\n\nCurrent scene state:\n{json.dumps(scene_state, indent=2)}"
        
        full_messages = [{"role": "system", "content": system_content}] + messages
        
        try:
            response = await self._create_completion(
                model=settings.REGOLO_MODEL,
                messages=full_messages,
                max_tokens=2048,
                temperature=0.7,
                stream=True,
            )
            
            async for chunk in response:
                if chunk.choices[0].delta.content:
                    yield f"data: {json.dumps({'type': 'content', 'chunk': chunk.choices[0].delta.content})}\n\n"
            
            yield "data: [DONE]\n\n"
            
        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'error': str(e)})}\n\n"
    
    async def stream_chat_with_functions(
        self,
        messages: list[dict[str, Any]],
        scene_state: Optional[dict[str, Any]] = None,
        tenant_id: Optional[str] = None,
        include_satellites: bool = True,
        include_incidents: bool = True,
        session_id: Optional[str] = None,
        user_id: Optional[str] = None,
        use_memory: bool = True,
    ) -> AsyncGenerator[str, None]:
        """Stream chat with function calling support.

        1. First call: Get tool calls (non-streaming)
        2. Emit tool calls as SSE action events
        3. Second call: Stream final response
        """
        if not self.client:
            yield f"data: {json.dumps({'type': 'error', 'error': 'AI service not configured'})}\n\n"
            return

        client_session_id, chat_session_id, memory, memory_call, pop_memory_error_event = (
            self._init_memory_runtime(
                tenant_id=tenant_id,
                user_id=user_id,
                session_id=session_id,
                source="chat_stream",
                enabled=use_memory,
            )
        )

        if use_memory:
            yield f"data: {json.dumps({'type': 'session', 'session_id': client_session_id})}\n\n"

        def flush_memory_error_event_line() -> Optional[str]:
            event = pop_memory_error_event()
            if not event:
                return None
            return f"data: {json.dumps(event)}\n\n"

        # LIVELLO 1: Pattern matching deterministico per visualizzazioni
        last_user_message = ""
        for msg in reversed(messages):
            if msg.get("role") == "user":
                last_user_message = msg.get("content", "")
                break

        memory_context_messages: list[dict[str, Any]] = []
        if use_memory:
            memory_context_messages = await memory_call(
                "get_context_before_stream",
                lambda: memory.get_context_as_messages(limit=20),  # type: ignore[union-attr]
                [],
            )
            if error_line := flush_memory_error_event_line():
                yield error_line

            if last_user_message:
                await memory_call(
                    "add_user_message_before_stream",
                    lambda: memory.add_message(last_user_message, role="user"),  # type: ignore[union-attr]
                )
                if error_line := flush_memory_error_event_line():
                    yield error_line

            usage = await memory_call(
                "get_window_usage_before_stream",
                lambda: memory.get_window_usage(),  # type: ignore[union-attr]
                {"percentage": 0.0},
            )
            if error_line := flush_memory_error_event_line():
                yield error_line
            yield f"data: {json.dumps({'type': 'memory_usage', 'percentage': usage.get('percentage', 0.0)})}\n\n"

        if last_user_message and tenant_id:
            direct_action = await self._route_visualization_command(last_user_message, tenant_id)
            if direct_action:
                yield f"data: {json.dumps({'type': 'action', 'action_type': direct_action.type, 'payload': direct_action.payload})}\n\n"

        # Build system content with available data
        system_content = self.SYSTEM_PROMPT

        if scene_state:
            system_content += f"\n\nCurrent scene state:\n{json.dumps(scene_state, indent=2)}"

        # Add satellite data to context if requested and tenant_id provided
        if include_satellites and tenant_id:
            try:
                satellites_data = await self._get_satellites_context(tenant_id)
                if satellites_data:
                    system_content += f"""

AVAILABLE SATELLITES (use cesium_fly_to with entityId):
{json.dumps(satellites_data, indent=2)}

INSTRUCTIONS FOR SATELLITES:
- When user asks to view/fly to/show a satellite: use cesium_fly_to with entityId
- entityId format: 'satellite-<id>' (e.g., 'satellite-a8839b77-86c8-44b4-be09-6e09aaef6b40')
- Find the satellite in the list above and use its id field to construct the entityId
- NEVER guess entityId - always use the exact id from the list"""
            except Exception as e:
                logger.warning(f"Failed to load satellites context: {e}")

        # Add ground stations to context
        if tenant_id:
            try:
                ground_stations_data = await self._get_ground_stations_context(tenant_id)
                if ground_stations_data:
                    system_content += f"""

AVAILABLE GROUND STATIONS (use cesium_fly_to with coordinates):
{json.dumps(ground_stations_data, indent=2)}

INSTRUCTIONS FOR GROUND STATIONS (VERY IMPORTANT):
- These are ground stations/bases like Ceccano, White Sands, etc.
- When user asks to view/fly to/show a base/station (e.g., "mostrami Ceccano", "vai a White Sands"):
  1. Find the station in the list above by matching the name
  2. Use cesium_fly_to with longitude and latitude from the station
  3. NEVER use entityId for stations - they don't have one, use coordinates only!
- Examples: "mostrami Ceccano" → cesium_fly_to(longitude: 13.3, latitude: 41.6)"""
            except Exception as e:
                logger.warning(f"Failed to load ground stations context: {e}")

        # Add ground vehicles to context
        if tenant_id:
            try:
                ground_vehicles_data = await self._get_ground_vehicles_context(tenant_id)
                if ground_vehicles_data:
                    system_content += f"""

AVAILABLE GROUND VEHICLES (use cesium_fly_to with coordinates):
{json.dumps(ground_vehicles_data, indent=2)}

INSTRUCTIONS FOR GROUND VEHICLES (VERY IMPORTANT):
- These are military/ground vehicles with names like ALPHA-1, BRAVO-2, CHARLIE-3
- When user asks to view/fly to/show a vehicle (e.g., "mostrami ALPHA-1", "vai su ALPHA-1", "veicolo Alpha"):
  1. Find the vehicle in the list above by matching the name
  2. Use cesium_fly_to with longitude and latitude from the vehicle
  3. NEVER use entityId for vehicles - they don't have one, use coordinates only!
- Examples: "mostrami ALPHA-1" → cesium_fly_to(longitude: 13.315, latitude: 41.595)
- The vehicles are near Ceccano, Italy (41.6°N, 13.3°E)"""
            except Exception as e:
                logger.warning(f"Failed to load ground vehicles context: {e}")

        # Add incident data to context if requested and tenant_id provided
        if include_incidents and tenant_id:
            try:
                incidents_data = await self._get_incidents_context(tenant_id)
                if incidents_data:
                    system_content += f"\n\nINCIDENTS (last 10):\n{json.dumps(incidents_data, indent=2)}"
            except Exception as e:
                logger.warning(f"Failed to load incidents context: {e}")

        # Add space weather events to context
        if tenant_id:
            try:
                space_weather_data = await self._get_space_weather_context(tenant_id)
                if space_weather_data:
                    system_content += f"\n\nSPACE WEATHER EVENTS:\n{json.dumps(space_weather_data, indent=2)}"
            except Exception as e:
                logger.warning(f"Failed to load space weather context: {e}")

        # Add conjunction events to context
        if tenant_id:
            try:
                conjunctions_data = await self._get_conjunctions_context(tenant_id)
                if conjunctions_data:
                    system_content += f"\n\nACTIVE CONJUNCTION EVENTS (actionable):\n{json.dumps(conjunctions_data, indent=2)}"
            except Exception as e:
                logger.warning(f"Failed to load conjunctions context: {e}")

        # Add proximity alerts to context
        if tenant_id:
            try:
                proximity_data = await self._get_proximity_alerts_context(tenant_id)
                if proximity_data:
                    system_content += f"\n\nACTIVE PROXIMITY ALERTS:\n{json.dumps(proximity_data, indent=2)}"
            except Exception as e:
                logger.warning(f"Failed to load proximity alerts context: {e}")

        # Add clear instructions about all data types
        system_content += """

RULES FOR FLY-TO COMMANDS:
1. For SATELLITES: use cesium_fly_to with entityId='satellite-<id>'
2. For GROUND STATIONS: use cesium_fly_to with longitude/latitude coordinates
3. For GROUND VEHICLES: use cesium_fly_to with longitude/latitude coordinates (entityId NOT supported!)
4. For WORLD LOCATIONS (cities, countries): use cesium_search_location
5. NEVER guess - always use values from the lists above!
"""
        
        full_messages: list[dict[str, Any]] = [{"role": "system", "content": system_content}]
        full_messages.extend(memory_context_messages)
        full_messages.extend(messages)
        
        actions: list[CesiumAction] = []
        assistant_text_chunks: list[str] = []
        
        try:
            # Step 1: First call with tools (non-streaming) to get tool calls
            response = await self._create_completion(
                model=settings.REGOLO_MODEL,
                messages=full_messages,
                max_tokens=2048,
                temperature=0.7,
                tools=CESIUM_FUNCTION_DEFINITIONS,
            )
            
            response_message = response.choices[0].message
            
            # Step 2: Handle tool calls if present
            if response_message.tool_calls:
                for tool_call in response_message.tool_calls:
                    function_name = tool_call.function.name
                    function_args = json.loads(tool_call.function.arguments or "{}")
                    
                    # Create action
                    action = self._create_cesium_action(function_name, function_args)
                    if action:
                        actions.append(action)
                        # Emit action as SSE event immediately
                        yield f"data: {json.dumps({'type': 'action', 'action_type': action.type, 'payload': action.payload})}\n\n"
                    
                    # Add tool result to messages for second call
                    full_messages.append({
                        "role": "assistant",
                        "content": None,
                        "tool_calls": [{
                            "id": tool_call.id,
                            "type": "function",
                            "function": {
                                "name": function_name,
                                "arguments": tool_call.function.arguments
                            }
                        }]
                    })
                    full_messages.append({
                        "role": "tool",
                        "tool_call_id": tool_call.id,
                        "content": json.dumps({"status": "success", "action": action.type if action else "unknown"}),
                    })
                
                # Step 3: Second call for final response (streaming)
                final_response = await self._create_completion(
                    model=settings.REGOLO_MODEL,
                    messages=full_messages,
                    max_tokens=2048,
                    temperature=0.7,
                    stream=True,
                )
                
                async for chunk in final_response:
                    if chunk.choices[0].delta.content:
                        chunk_text = chunk.choices[0].delta.content
                        assistant_text_chunks.append(chunk_text)
                        yield f"data: {json.dumps({'type': 'content', 'chunk': chunk_text})}\n\n"
            else:
                # No tool calls, stream the first response
                final_response = await self._create_completion(
                    model=settings.REGOLO_MODEL,
                    messages=full_messages,
                    max_tokens=2048,
                    temperature=0.7,
                    stream=True,
                )
                
                async for chunk in final_response:
                    if chunk.choices[0].delta.content:
                        chunk_text = chunk.choices[0].delta.content
                        assistant_text_chunks.append(chunk_text)
                        yield f"data: {json.dumps({'type': 'content', 'chunk': chunk_text})}\n\n"

            assistant_text = "".join(assistant_text_chunks).strip()
            if assistant_text and use_memory:
                await memory_call(
                    "add_assistant_message_after_stream",
                    lambda: memory.add_message(assistant_text, role="assistant"),  # type: ignore[union-attr]
                )
                if error_line := flush_memory_error_event_line():
                    yield error_line

            if use_memory:
                usage = await memory_call(
                    "get_window_usage_after_stream",
                    lambda: memory.get_window_usage(),  # type: ignore[union-attr]
                    {"percentage": 0.0},
                )
                if error_line := flush_memory_error_event_line():
                    yield error_line
                yield f"data: {json.dumps({'type': 'memory_usage', 'percentage': usage.get('percentage', 0.0)})}\n\n"
            
            yield "data: [DONE]\n\n"
            
        except Exception as e:
            logger.error(f"Stream chat with functions error: {e}")
            yield f"data: {json.dumps({'type': 'error', 'error': str(e)})}\n\n"
    
    # ── AEGIS Agent System ──────────────────────────────────────────────

    AGENT_SYSTEM_PROMPT = """You are AEGIS, the AI map controller for Space Domain Awareness.

You have direct control of a Cesium 3D globe. You can command the camera,
visualize data, query the database, run physics calculations, and
present briefings to the operator.

CAPABILITIES:
- Camera: fly to satellites, countries, coordinates; set heading/pitch
- Visualization: highlight satellites, threat radius, conjunction lines,
  risk heatmaps, TCA countdown, maneuver options, coverage
- Data: query satellites, conjunctions, debris, threats, incidents, space weather
- Physics: propagate orbits, compute conjunction risk, coverage analysis
- Timing: pause between actions for dramatic effect, narrate the analysis

BEHAVIORAL RULES:
1. When asked to "show" something, ALWAYS combine camera + visualization.
   Fly to the object FIRST, then add overlay.
2. Use agent_wait(2-3 seconds) between important visual changes.
3. For threat analysis:
   a) Query the relevant data
   b) Fly to the primary object
   c) Show the threat visualization
   d) Narrate the findings
   e) Show recommended actions
4. Do NOT guess entity IDs. Query FIRST with query_satellites, use the returned IDs.
   Entity ID format for satellites: 'satellite-<uuid>'
5. For tours/demos: overview -> zoom in -> analyze -> zoom out -> summarize.
6. Respond in the user's language (Italian if they speak Italian, English if English).
7. When using cesium_fly_to for a satellite, use entityId='satellite-<id>'.
   For locations/countries use cesium_fly_to_country or cesium_search_location.
8. Before showing any visualization, ALWAYS query to obtain real data.
   Never invent data or IDs.
"""

    # Scenario templates that the run_scenario tool can return
    SCENARIO_TEMPLATES = {
        "threat_landscape": {
            "name": "Threat Landscape Overview",
            "steps": [
                "1. Query all proximity alerts and active conjunctions using query_proximity_alerts and query_conjunctions",
                "2. Fly to global view (cesium_fly_to longitude=0, latitude=0, altitude=20000000, pitch=-90)",
                "3. For the highest-risk satellite, show risk heatmap (cesium_show_risk_heatmap)",
                "4. Use agent_narrate to report: threat count and severity summary",
                "5. Fly to the most critical conjunction (cesium_fly_to the primary satellite)",
                "6. Show conjunction line + TCA countdown between the two objects",
                "7. Use agent_narrate to report risk level and recommended action",
                "8. Fly back to global view",
                "9. Provide final text summary of overall threat posture",
            ],
        },
        "constellation_tour": {
            "name": "Constellation Tour",
            "steps": [
                "1. Query all allied satellites using query_satellites(is_active=true)",
                "2. Fly to global view showing all satellites",
                "3. For each key satellite: fly to it, highlight it, show coverage, narrate its role",
                "4. Use agent_wait(2) between each satellite for dramatic effect",
                "5. Show coverage gaps if any",
                "6. Summarize constellation status",
            ],
        },
        "critical_conjunction": {
            "name": "Critical Conjunction Analysis",
            "steps": [
                "1. Query the highest-risk conjunction using query_conjunctions(risk_level='critical', limit=1)",
                "2. Fly to the primary satellite",
                "3. Highlight it + show threat radius",
                "4. Show conjunction line to the secondary object",
                "5. Show risk heatmap",
                "6. Show TCA countdown",
                "7. Estimate maneuver cost with estimate_maneuver_cost",
                "8. Show maneuver options on the map",
                "9. Narrate recommendation",
            ],
        },
        "defense_demo": {
            "name": "Defense Demonstration",
            "steps": [
                "1. Fly to Italy (cesium_fly_to_country country='Italy')",
                "2. Query ground stations near Italy",
                "3. Highlight allied ground stations",
                "4. Query threats of type 'proximity'",
                "5. Show threat visualizations for nearby hostile objects",
                "6. Narrate the defense posture",
            ],
        },
        "full_briefing": {
            "name": "Full Operational Briefing",
            "steps": [
                "1. Start with threat_landscape scenario steps",
                "2. Then do constellation_tour steps",
                "3. Then analyze the most critical conjunction",
                "4. End with overall situation summary and recommendations",
            ],
        },
    }

    async def stream_agentic_chat(
        self,
        messages: list[dict[str, Any]],
        scene_state: Optional[dict[str, Any]] = None,
        tenant_id: Optional[str] = None,
        session_id: Optional[str] = None,
        user_id: Optional[str] = None,
    ) -> AsyncGenerator[str, None]:
        """AEGIS agentic loop: multi-turn tool calling with SSE streaming.

        Key differences from stream_chat_with_functions:
        - Loop up to 8 iterations (multi-turn) instead of 2 fixed calls
        - Data is NOT stuffed in system prompt - agent queries on-demand
        - agent_wait pauses the stream with asyncio.sleep
        - Emits new SSE event types: agent_thinking, agent_pause, narration, scene_mood, heartbeat
        - Tool results are fed back into context for the next iteration
        """
        if not self.client:
            yield f"data: {json.dumps({'type': 'error', 'error': 'AI service not configured'})}\n\n"
            return

        # Initialize memory
        client_session_id, chat_session_id, memory, memory_call, pop_memory_error_event = (
            self._init_memory_runtime(
                tenant_id=tenant_id,
                user_id=user_id,
                session_id=session_id,
                source="agent_chat",
                enabled=True,
            )
        )

        yield f"data: {json.dumps({'type': 'session', 'session_id': client_session_id})}\n\n"

        # Build lean system prompt (no data dump)
        system_content = self.AGENT_SYSTEM_PROMPT
        if scene_state:
            system_content += f"\n\nCurrent scene state:\n{json.dumps(scene_state)}"

        # Get memory context
        memory_context_messages: list[dict[str, Any]] = []
        if memory:
            memory_context_messages = await memory_call(
                "get_context_agent",
                lambda: memory.get_context_as_messages(limit=20),
                [],
            )

        # Save user message to memory
        last_user_message = ""
        for msg in reversed(messages):
            if msg.get("role") == "user":
                last_user_message = msg.get("content", "")
                break
        if last_user_message and memory:
            await memory_call(
                "add_user_message_agent",
                lambda: memory.add_message(last_user_message, role="user"),
            )

        # Emit memory usage
        if memory:
            usage = await memory_call(
                "get_window_usage_agent",
                lambda: memory.get_window_usage(),
                {"percentage": 0.0},
            )
            yield f"data: {json.dumps({'type': 'memory_usage', 'percentage': usage.get('percentage', 0.0)})}\n\n"

        # Build full messages
        full_messages: list[dict[str, Any]] = [{"role": "system", "content": system_content}]
        full_messages.extend(memory_context_messages)
        full_messages.extend(messages)

        # All tools: Cesium + data + physics + control
        all_tools = CESIUM_FUNCTION_DEFINITIONS + ALL_AGENT_TOOLS

        # Import tool executor
        from app.services.agent_tool_executor import AgentToolExecutor
        tool_executor = AgentToolExecutor(self.db, self.ontology)

        max_iterations = 8
        final_text = ""

        try:
            for iteration in range(max_iterations):
                # Emit thinking event
                yield f"data: {json.dumps({'type': 'agent_thinking', 'step': iteration + 1})}\n\n"

                # Heartbeat before LLM call
                yield f"data: {json.dumps({'type': 'heartbeat'})}\n\n"

                response = await self._create_completion(
                    model=settings.REGOLO_MODEL,
                    messages=full_messages,
                    max_tokens=2048,
                    temperature=0.7,
                    tools=all_tools,
                )

                message = response.choices[0].message

                # No tool calls -> stream final response
                if not message.tool_calls:
                    # Stream the final response text
                    final_response = await self._create_completion(
                        model=settings.REGOLO_MODEL,
                        messages=full_messages,
                        max_tokens=2048,
                        temperature=0.7,
                        stream=True,
                    )

                    async for chunk in final_response:
                        if chunk.choices and chunk.choices[0].delta.content:
                            chunk_text = chunk.choices[0].delta.content
                            final_text += chunk_text
                            yield f"data: {json.dumps({'type': 'content', 'chunk': chunk_text})}\n\n"
                    break

                # Process tool calls
                # Build the assistant message with tool_calls for context
                assistant_msg: dict[str, Any] = {
                    "role": "assistant",
                    "content": message.content or None,
                    "tool_calls": [
                        {
                            "id": tc.id,
                            "type": "function",
                            "function": {
                                "name": tc.function.name,
                                "arguments": tc.function.arguments,
                            },
                        }
                        for tc in message.tool_calls
                    ],
                }
                full_messages.append(assistant_msg)

                for tool_call in message.tool_calls:
                    name = tool_call.function.name
                    try:
                        args = json.loads(tool_call.function.arguments or "{}")
                    except json.JSONDecodeError:
                        args = {}

                    # Emit tool call event
                    yield f"data: {json.dumps({'type': 'tool_call', 'tool_name': name, 'arguments': args, 'iteration': iteration})}\n\n"

                    result: dict[str, Any]

                    # ── Cesium/Simulation actions ──
                    if name.startswith("cesium_") or name.startswith("simulation_"):
                        action = self._create_cesium_action(name, args)
                        if action:
                            yield f"data: {json.dumps({'type': 'action', 'action_type': action.type, 'payload': action.payload})}\n\n"
                            result = {"status": "dispatched", "action": action.type}
                        else:
                            result = {"status": "error", "error": f"Unknown cesium action: {name}"}

                    # ── Data query / Physics / Scene tools ──
                    elif name.startswith("query_") or name.startswith("compute_") or name.startswith("get_") or name.startswith("propagate_") or name.startswith("estimate_"):
                        result = await tool_executor.execute(name, args, tenant_id or "default")

                    # ── Agent control tools ──
                    elif name == "agent_wait":
                        seconds = min(float(args.get("seconds", 2)), 10)  # Cap at 10s
                        reason = args.get("reason", "")
                        yield f"data: {json.dumps({'type': 'agent_pause', 'seconds': seconds, 'reason': reason})}\n\n"
                        await asyncio.sleep(seconds)
                        # Heartbeat after wait
                        yield f"data: {json.dumps({'type': 'heartbeat'})}\n\n"
                        result = {"status": "resumed", "waited_seconds": seconds}

                    elif name == "agent_narrate":
                        text = args.get("text", "")
                        style = args.get("style", "info")
                        yield f"data: {json.dumps({'type': 'narration', 'text': text, 'style': style})}\n\n"
                        result = {"status": "narrated"}

                    elif name == "clear_all_overlays":
                        yield f"data: {json.dumps({'type': 'action', 'action_type': 'cesium.clearAllOverlays', 'payload': {}})}\n\n"
                        result = {"status": "cleared"}

                    elif name == "set_scene_mood":
                        mood = args.get("mood", "normal")
                        yield f"data: {json.dumps({'type': 'action', 'action_type': 'cesium.setSceneMood', 'payload': {'mood': mood}})}\n\n"
                        yield f"data: {json.dumps({'type': 'scene_mood', 'mood': mood})}\n\n"
                        result = {"status": "mood_set", "mood": mood}

                    elif name == "run_scenario":
                        scenario_id = args.get("scenario_id", "")
                        template = self.SCENARIO_TEMPLATES.get(scenario_id)
                        if template:
                            result = {"scenario": template["name"], "steps": template["steps"]}
                        else:
                            available = list(self.SCENARIO_TEMPLATES.keys())
                            result = {"error": f"Unknown scenario: {scenario_id}", "available": available}

                    else:
                        result = {"error": f"Unknown tool: {name}"}

                    # Emit tool result
                    yield f"data: {json.dumps({'type': 'tool_result', 'tool_call_id': tool_call.id, 'tool_name': name, 'result': result})}\n\n"

                    # Add tool result to context for next iteration
                    result_str = json.dumps(result, default=str)
                    if len(result_str) > 4000:
                        result_str = result_str[:4000] + "... [truncated]"

                    full_messages.append({
                        "role": "tool",
                        "tool_call_id": tool_call.id,
                        "content": result_str,
                    })

            # Save assistant response to memory
            if final_text and memory:
                await memory_call(
                    "add_assistant_message_agent",
                    lambda: memory.add_message(final_text, role="assistant"),
                )

            yield "data: [DONE]\n\n"

        except Exception as e:
            logger.error(f"Agentic chat error: {e}")
            yield f"data: {json.dumps({'type': 'error', 'error': str(e)})}\n\n"
            yield "data: [DONE]\n\n"

    async def _get_satellites_context(self, tenant_id: str) -> list[dict]:
        """Get list of satellites for context."""
        satellites = []
        try:
            # Get satellites from ontology service
            from app.schemas.ontology import ObjectType
            sats, _ = await self.ontology.list_satellites(
                tenant_id=tenant_id,
                page_size=100,  # Limit to avoid too much context
            )
            
            for sat in sats:
                sat_data = {
                    "id": sat.id,
                    "entityId": f"satellite-{sat.id}",  # Cesium entity ID format
                    "name": sat.name,
                    "norad_id": sat.norad_id,
                    "is_active": sat.is_active,
                    "object_type": sat.object_type.value if hasattr(sat.object_type, 'value') else str(sat.object_type),
                }
                satellites.append(sat_data)
                
        except Exception as e:
            logger.warning(f"Failed to get satellites for context: {e}")
        
        return satellites

    async def _get_incidents_context(self, tenant_id: str) -> list[dict]:
        """Get recent incidents for context (limit to 10 latest)."""
        incidents = []
        try:
            # Import here to avoid circular imports
            from app.services.incidents import IncidentService
            from app.services.audit import AuditService

            audit_service = AuditService(self.db)
            incident_service = IncidentService(self.db, audit_service)

            # Get latest 10 incidents
            incidents_list, _ = await incident_service.list_incidents(
                tenant_id=tenant_id,
                page_size=10,
            )

            for incident in incidents_list:
                inc_data = {
                    "id": incident.id,
                    "title": incident.title,
                    "severity": incident.severity.value if hasattr(incident.severity, 'value') else str(incident.severity),
                    "status": incident.status.value if hasattr(incident.status, 'value') else str(incident.status),
                    "type": incident.incident_type.value if hasattr(incident.incident_type, 'value') else str(incident.incident_type),
                    "detected_at": incident.detected_at.isoformat() if incident.detected_at else None,
                    "assigned_to": incident.assigned_to,
                    "priority": incident.priority,
                }
                incidents.append(inc_data)

        except Exception as e:
            logger.warning(f"Failed to get incidents for context: {e}")

        return incidents

    async def _get_ground_stations_context(self, tenant_id: str) -> list[dict]:
        """Get ground stations for context."""
        stations = []
        try:
            stations_list, _ = await self.ontology.list_ground_stations(
                tenant_id=tenant_id,
                page_size=50,
            )
            
            for station in stations_list:
                station_data = {
                    "id": station.id,
                    "name": station.name,
                    "code": station.code,
                    "latitude": station.latitude,
                    "longitude": station.longitude,
                    "country": station.country,
                    "is_operational": station.is_operational,
                    "organization": station.organization,
                }
                stations.append(station_data)
                
        except Exception as e:
            logger.warning(f"Failed to get ground stations for context: {e}")
        
        return stations

    async def _get_ground_vehicles_context(self, tenant_id: str) -> list[dict]:
        """Get ground vehicles for context."""
        vehicles = []
        try:
            from app.services.operations import PositionTrackingService
            
            audit_service = AuditService(self.db)
            position_service = PositionTrackingService(self.db, audit_service)
            vehicles_list = await position_service.get_all_ground_vehicles(tenant_id)
            
            for vehicle in vehicles_list:
                vehicle_data = {
                    "entity_id": vehicle.entity_id,
                    "name": vehicle.entity_id,
                    "latitude": vehicle.latitude,
                    "longitude": vehicle.longitude,
                    "altitude_m": vehicle.altitude_m,
                    "heading_deg": vehicle.heading_deg,
                    "velocity_ms": vehicle.velocity_magnitude_ms,
                    "report_time": vehicle.report_time.isoformat() if vehicle.report_time else None,
                }
                vehicles.append(vehicle_data)
                
        except Exception as e:
            logger.warning(f"Failed to get ground vehicles for context: {e}")
        
        return vehicles

    async def _get_space_weather_context(self, tenant_id: str) -> list[dict]:
        """Get space weather events for context."""
        events = []
        try:
            events_list, _ = await self.ontology.list_space_weather_events(
                tenant_id=tenant_id,
                page_size=10,
            )
            
            for event in events_list:
                event_data = {
                    "id": event.id,
                    "event_type": event.event_type.value if hasattr(event.event_type, 'value') else str(event.event_type),
                    "severity": event.severity.value if hasattr(event.severity, 'value') else str(event.severity),
                    "start_time": event.start_time.isoformat() if event.start_time else None,
                    "end_time": event.end_time.isoformat() if event.end_time else None,
                    "description": event.description,
                }
                events.append(event_data)
                
        except Exception as e:
            logger.warning(f"Failed to get space weather events for context: {e}")
        
        return events

    async def _get_conjunctions_context(self, tenant_id: str) -> list[dict]:
        """Get actionable conjunction events for context."""
        conjunctions = []
        try:
            events_list, _ = await self.ontology.list_conjunction_events(
                tenant_id=tenant_id,
                page_size=10,
            )
            
            for event in events_list:
                if event.is_actionable:
                    event_data = {
                        "id": event.id,
                        "tca": event.tca.isoformat() if event.tca else None,
                        "miss_distance_km": event.miss_distance_km,
                        "risk_level": event.risk_level,
                        "risk_score": event.risk_score,
                        "collision_probability": event.collision_probability,
                        "maneuver_planned": event.maneuver_planned,
                    }
                    conjunctions.append(event_data)
                    
        except Exception as e:
            logger.warning(f"Failed to get conjunctions for context: {e}")
        
        return conjunctions

    async def _get_proximity_alerts_context(self, tenant_id: str) -> list[dict]:
        """Get active proximity alerts for context."""
        alerts = []
        try:
            from app.services.proximity import ProximityDetectionService
            
            audit_service = AuditService(self.db)
            proximity_service = ProximityDetectionService(self.db, audit_service)
            alerts_list = await proximity_service.get_active_alerts(tenant_id)
            
            for alert in alerts_list:
                alert_data = {
                    "id": alert.id,
                    "alert_level": alert.alert_level,
                    "status": alert.status,
                    "min_distance_km": alert.min_distance_km,
                    "current_distance_km": alert.current_distance_km,
                    "tca": alert.tca.isoformat() if alert.tca else None,
                    "is_hostile": alert.is_hostile,
                    "threat_score": alert.threat_score,
                }
                alerts.append(alert_data)
                
        except Exception as e:
            logger.warning(f"Failed to get proximity alerts for context: {e}")
        
        return alerts

    async def analyze_conjunction(
        self,
        request: ConjunctionAnalystRequest,
        tenant_id: str,
        user_id: Optional[str] = None,
    ) -> ConjunctionAnalystResponse:
        """Conjunction Analyst agent."""
        request_id = generate_uuid()
        
        # Get conjunction event details
        event = await self.ontology.get_conjunction_event(
            request.conjunction_event_id,
            tenant_id,
        )
        
        if not event:
            raise AIServiceError(
                f"Conjunction event {request.conjunction_event_id} not found"
            )
        
        # Build analysis prompt
        event_data = {
            "tca": event.tca.isoformat(),
            "miss_distance_km": event.miss_distance_km,
            "risk_level": event.risk_level.value,
            "risk_score": event.risk_score,
            "collision_probability": event.collision_probability,
            "primary_object": {
                "id": event.primary_object.id,
                "name": event.primary_object.name,
                "norad_id": event.primary_object.norad_id,
                "object_type": event.primary_object.object_type.value,
                "is_active": event.primary_object.is_active,
            } if event.primary_object else None,
            "secondary_object": {
                "id": event.secondary_object.id,
                "name": event.secondary_object.name,
                "norad_id": event.secondary_object.norad_id,
                "object_type": event.secondary_object.object_type.value,
                "is_active": event.secondary_object.is_active,
            } if event.secondary_object else None,
        }
        
        prompt = f"""Analyze this conjunction event and provide recommendations:

Event Data:
{json.dumps(event_data, indent=2)}

Provide your analysis in the following JSON format:
{{
  "severity": "low|medium|high|critical",
  "risk_explanation": "Detailed explanation of the risk",
  "primary_object_assessment": "Assessment of primary object",
  "secondary_object_assessment": "Assessment of secondary object",
  "recommended_action": "Primary recommended action",
  "courses_of_action": [
    {{
      "action_type": "maneuver|monitor|accept_risk|collaborate",
      "description": "Description of the action",
      "maneuver_window_start": "ISO datetime if applicable",
      "maneuver_window_end": "ISO datetime if applicable",
      "expected_delta_v_m_s": 0.0,
      "risk_reduction_percent": 0.0,
      "constraints": ["list of constraints"],
      "confidence": 0.0-1.0
    }}
  ],
  "monitoring_recommendations": ["list of monitoring actions"],
  "confidence": 0.0-1.0
}}"""
        
        try:
            if not self.client:
                raise AIServiceError("Servizio AI non configurato. Contatta l'amministratore.")
            
            response = await self._create_completion(
                model=settings.REGOLO_MODEL,
                messages=[
                    {"role": "system", "content": self.SYSTEM_PROMPT},
                    {"role": "user", "content": prompt},
                ],
                max_tokens=2048,
                temperature=0.3,
            )
            
            content = response.choices[0].message.content or "{}"
            
            # Parse JSON response
            try:
                # Extract JSON from response
                json_str = content
                if "```json" in content:
                    json_str = content.split("```json")[1].split("```")[0]
                elif "```" in content:
                    json_str = content.split("```")[1].split("```")[0]
                
                analysis = json.loads(json_str)
            except json.JSONDecodeError:
                analysis = {
                    "severity": event.risk_level.value,
                    "risk_explanation": content,
                    "recommended_action": "Monitor situation",
                    "confidence": 0.5,
                }
            
            return ConjunctionAnalystResponse(
                conjunction_event_id=request.conjunction_event_id,
                severity=analysis.get("severity", event.risk_level.value),
                risk_explanation=analysis.get("risk_explanation", ""),
                primary_object_assessment=analysis.get(
                    "primary_object_assessment", ""
                ),
                secondary_object_assessment=analysis.get(
                    "secondary_object_assessment", ""
                ),
                recommended_action=analysis.get("recommended_action", ""),
                courses_of_action=[
                    CourseOfAction(**coa)
                    for coa in analysis.get("courses_of_action", [])
                ],
                monitoring_recommendations=analysis.get(
                    "monitoring_recommendations", []
                ),
                confidence=analysis.get("confidence", 0.7),
                request_id=request_id,
            )
        except Exception as e:
            logger.error(f"Conjunction analysis error: {e}")
            raise AIServiceError(f"Errore durante l'analisi della congiunzione: {str(e)}")
    
    async def analyze_space_weather(
        self,
        request: SpaceWeatherWatchRequest,
        tenant_id: str,
        user_id: Optional[str] = None,
    ) -> SpaceWeatherWatchResponse:
        """Space Weather Watch agent."""
        request_id = generate_uuid()
        
        # Get space weather events in time range
        events, _ = await self.ontology.list_space_weather_events(
            tenant_id,
            start_time=request.start_time,
            end_time=request.end_time,
            page_size=100,
        )
        
        events_data = [
            {
                "event_type": e.event_type,
                "severity": e.severity.value,
                "start_time": e.start_time.isoformat(),
                "kp_index": e.kp_index,
                "dst_index": e.dst_index,
                "solar_wind_speed": e.solar_wind_speed,
            }
            for e in events
        ]
        
        prompt = f"""Analyze space weather conditions and impacts:

Time Range: {request.start_time.isoformat()} to {request.end_time.isoformat()}

Events:
{json.dumps(events_data, indent=2)}

Provide your analysis in the following JSON format:
{{
  "overall_risk": "low|medium|high|critical",
  "risk_summary": "Summary of overall space weather risk",
  "risk_by_service": [
    {{
      "service": "gnss|rf_comms|drag|radiation",
      "risk_level": "low|medium|high|critical",
      "impact_description": "Description of impact",
      "confidence": 0.0-1.0
    }}
  ],
  "recommended_controls": [
    {{
      "control_type": "type of control",
      "description": "Description",
      "priority": "low|medium|high|critical",
      "affected_services": ["list of services"]
    }}
  ],
  "monitoring_actions": ["list of monitoring actions"],
  "confidence": 0.0-1.0
}}"""
        
        try:
            if not self.client:
                raise AIServiceError("Servizio AI non configurato. Contatta l'amministratore.")
            
            response = await self._create_completion(
                model=settings.REGOLO_MODEL,
                messages=[
                    {"role": "system", "content": self.SYSTEM_PROMPT},
                    {"role": "user", "content": prompt},
                ],
                max_tokens=2048,
                temperature=0.3,
            )
            
            content = response.choices[0].message.content or "{}"
            
            try:
                json_str = content
                if "```json" in content:
                    json_str = content.split("```json")[1].split("```")[0]
                elif "```" in content:
                    json_str = content.split("```")[1].split("```")[0]
                
                analysis = json.loads(json_str)
            except json.JSONDecodeError:
                raise AIServiceError("Impossibile analizzare la risposta del modello AI. Riprova.")
            
            return SpaceWeatherWatchResponse(
                time_range_start=request.start_time,
                time_range_end=request.end_time,
                overall_risk=analysis.get("overall_risk", "low"),
                risk_summary=analysis.get("risk_summary", ""),
                risk_by_service=[
                    ServiceImpact(**s)
                    for s in analysis.get("risk_by_service", [])
                ],
                recommended_controls=[
                    RecommendedControl(**c)
                    for c in analysis.get("recommended_controls", [])
                ],
                monitoring_actions=analysis.get("monitoring_actions", []),
                confidence=analysis.get("confidence", 0.7),
                request_id=request_id,
            )
        except Exception as e:
            logger.error(f"Space weather analysis error: {e}")
            raise AIServiceError(f"Errore durante l'analisi meteo spaziale: {str(e)}")
    
    async def propose_mitigation(
        self,
        event_id: str,
        event_type: str,
        tenant_id: str,
        user_id: Optional[str] = None,
    ) -> MitigationProposal:
        """Propose mitigation options for an event using AI analysis."""
        request_id = generate_uuid()
        
        if not self.client:
            raise AIServiceError("Servizio AI non configurato. Contatta l'amministratore.")
        
        # Get event data based on type
        event_data = {}
        if event_type == "conjunction":
            event = await self.ontology.get_conjunction_event(event_id, tenant_id)
            if event:
                event_data = {
                    "type": "conjunction",
                    "miss_distance_km": event.miss_distance_km,
                    "risk_level": event.risk_level.value if event.risk_level else "unknown",
                    "collision_probability": event.collision_probability,
                    "tca": event.tca.isoformat() if event.tca else None,
                }
        
        if not event_data:
            raise AIServiceError(f"Evento {event_id} di tipo {event_type} non trovato o dati non disponibili.")
        
        prompt = f"""Proponi opzioni di mitigazione per questo evento:

Dati evento:
{json.dumps(event_data, indent=2)}

Fornisci 2-3 opzioni realistiche in formato JSON:
{{
  "options": [
    {{
      "option_id": "unique_id",
      "title": "Titolo breve",
      "description": "Descrizione dettagliata",
      "risk_reduction_percent": 0-100,
      "cost_estimate": "Basso/Medio/Alto",
      "implementation_time": "tempo stimato",
      "pros": ["vantaggio 1", "vantaggio 2"],
      "cons": ["svantaggio 1"]
    }}
  ],
  "recommended_option_id": "id dell'opzione consigliata",
  "rationale": "spiegazione della scelta",
  "confidence": 0.0-1.0
}}"""
        
        try:
            response = await self._create_completion(
                model=settings.REGOLO_MODEL,
                messages=[
                    {"role": "system", "content": self.SYSTEM_PROMPT},
                    {"role": "user", "content": prompt},
                ],
                max_tokens=2048,
                temperature=0.3,
            )
            
            content = response.choices[0].message.content or "{}"
            
            try:
                json_str = content
                if "```json" in content:
                    json_str = content.split("```json")[1].split("```")[0]
                elif "```" in content:
                    json_str = content.split("```")[1].split("```")[0]
                
                analysis = json.loads(json_str)
            except json.JSONDecodeError:
                raise AIServiceError("Impossibile analizzare le opzioni di mitigazione dal modello AI.")
            
            return MitigationProposal(
                event_id=event_id,
                event_type=event_type,
                options=[MitigationOption(**opt) for opt in analysis.get("options", [])],
                recommended_option_id=analysis.get("recommended_option_id", ""),
                rationale=analysis.get("rationale", ""),
                confidence=analysis.get("confidence", 0.7),
            )
            
        except Exception as e:
            logger.error(f"Mitigation proposal error: {e}")
            raise AIServiceError(f"Errore durante la generazione delle opzioni di mitigazione: {str(e)}")
    
    async def _build_context(
        self,
        object_ids: list[str],
        tenant_id: str,
        include_events: bool,
    ) -> list[dict]:
        """Build context from object IDs."""
        context = []
        
        for obj_id in object_ids:
            # Try to find as satellite
            sat = await self.ontology.get_satellite(obj_id, tenant_id)
            if sat:
                context.append({
                    "type": "satellite",
                    "id": sat.id,
                    "name": sat.name,
                    "norad_id": sat.norad_id,
                    "is_active": sat.is_active,
                })
                continue
            
            # Try ground station
            gs = await self.ontology.get_ground_station(obj_id, tenant_id)
            if gs:
                context.append({
                    "type": "ground_station",
                    "id": gs.id,
                    "name": gs.name,
                    "latitude": gs.latitude,
                    "longitude": gs.longitude,
                    "is_operational": gs.is_operational,
                })
        
        return context
    
    async def orchestrate_detour_agents(
        self,
        message: str,
        tenant_id: str,
        user_id: Optional[str] = None,
        session_id: Optional[str] = None,
        map_session_id: Optional[str] = None,
        mode: str = "analyze",
    ) -> AsyncGenerator[str, None]:
        """Orchestrate Detour + platform control with memory and SSE map actions."""

        logger.info(
            "chat_orchestration_started",
            tenant_id=tenant_id,
            user_id=user_id,
            session_id=session_id,
            map_session_id=map_session_id,
            mode=mode,
            message_preview=message[:120],
        )

        client_session_id, chat_session_id, memory, memory_call, pop_memory_error_event = (
            self._init_memory_runtime(
                tenant_id=tenant_id,
                user_id=user_id,
                session_id=session_id,
                map_session_id=map_session_id,
                source="chat_orchestration",
                enabled=True,
            )
        )

        yield f"data: {json.dumps({'type': 'session', 'session_id': client_session_id})}\n\n"

        def flush_memory_error_event_line() -> Optional[str]:
            event = pop_memory_error_event()
            if not event:
                return None
            return f"data: {json.dumps(event)}\n\n"

        logger.info(
            "chat_orchestration_memory_add_start",
            tenant_id=tenant_id,
            session_id=chat_session_id,
        )
        await memory_call(
            "add_user_message",
            lambda: memory.add_message(message, role="user"),  # type: ignore[union-attr]
        )
        if error_line := flush_memory_error_event_line():
            yield error_line
        logger.info(
            "chat_orchestration_memory_add_done",
            tenant_id=tenant_id,
            session_id=chat_session_id,
        )
        usage = await memory_call(
            "get_window_usage_initial",
            lambda: memory.get_window_usage(),  # type: ignore[union-attr]
            {"percentage": 0.0},
        )
        if error_line := flush_memory_error_event_line():
            yield error_line
        logger.info(
            "chat_orchestration_memory_usage_done",
            tenant_id=tenant_id,
            session_id=chat_session_id,
            usage_percentage=usage.get("percentage"),
        )
        yield f"data: {json.dumps({'type': 'memory_usage', 'percentage': usage.get('percentage', 0.0)})}\n\n"

        if self._is_confirmation_message(message):
            pending = await memory_call(
                "get_latest_pending_confirmation",
                lambda: memory.get_latest_pending_confirmation(),
            )
            if pending:
                execution = await self._execute_side_effect_operation(
                    proposal=pending,
                    tenant_id=tenant_id,
                    user_id=user_id,
                )
                for action in execution.get("cesium_actions", []):
                    yield f"data: {json.dumps({'type': 'cesium_action', 'action': action})}\n\n"
                for command in execution.get("simulation_actions", []):
                    yield f"data: {json.dumps({'type': 'simulation_control', **command})}\n\n"

                await memory_call(
                    "mark_confirmation_resolved",
                    lambda: memory.mark_confirmation_resolved(pending.get("operation_id", "")),
                )
                assistant_text = execution.get("message", "Operazione completata.")
                await memory_call(
                    "add_assistant_confirmation_result",
                    lambda: memory.add_message(assistant_text, role="assistant"),
                )
                yield f"data: {json.dumps({'type': 'content', 'chunk': assistant_text})}\n\n"
                usage = await memory_call(
                    "get_window_usage_after_confirmation",
                    lambda: memory.get_window_usage(),  # type: ignore[union-attr]
                    {"percentage": 0.0},
                )
                if error_line := flush_memory_error_event_line():
                    yield error_line
                yield f"data: {json.dumps({'type': 'memory_usage', 'percentage': usage.get('percentage', 0.0)})}\n\n"
                if error_line := flush_memory_error_event_line():
                    yield error_line
                yield "data: [DONE]\n\n"
                return

        intent = await self._classify_intent(message)
        logger.info(
            "chat_orchestration_intent",
            tenant_id=tenant_id,
            user_id=user_id,
            intent=intent,
            session_id=session_id,
        )

        # ── SDA Operator Commands ──────────────────────────────────
        if intent in ("shift_brief", "fleet_threat_scan", "what_if_scenario"):
            from app.services.chat_commands import ChatCommandService
            from app.services.chat_prompts import (
                shift_brief_prompt,
                fleet_threat_scan_prompt,
                what_if_scenario_prompt,
            )

            cmd_svc = ChatCommandService(self.db, tenant_id)

            try:
                # Notify frontend that we're starting the command
                cmd_label = {
                    "shift_brief": "Shift Brief",
                    "fleet_threat_scan": "Fleet Threat Scan",
                    "what_if_scenario": "What-If Scenario",
                }[intent]
                yield f"data: {json.dumps({'type': 'agent_start', 'agent': intent, 'message': f'Executing {cmd_label}...'})}\n\n"

                # Execute the command
                if intent == "shift_brief":
                    cmd_data = await cmd_svc.shift_brief()
                    llm_prompt = shift_brief_prompt(cmd_data)
                elif intent == "fleet_threat_scan":
                    cmd_data = await cmd_svc.fleet_threat_scan()
                    llm_prompt = fleet_threat_scan_prompt(cmd_data)
                else:
                    cmd_data = await cmd_svc.what_if_scenario(message)
                    llm_prompt = what_if_scenario_prompt(cmd_data)

                # Emit Cesium actions
                for action in cmd_data.get("cesium_actions", []):
                    yield f"data: {json.dumps({'type': 'cesium_action', 'action': action})}\n\n"

                # Stream LLM response using the structured prompt
                context_messages = await memory_call(
                    "get_context_for_sda_command",
                    lambda: memory.get_context_as_messages(limit=5),
                    [],
                )
                messages_for_llm = context_messages + [{"role": "user", "content": llm_prompt}]

                assistant_chunks: list[str] = []
                async for line in self.stream_chat_with_functions(
                    messages=messages_for_llm,
                    scene_state=None,
                    tenant_id=tenant_id,
                    include_satellites=False,
                    use_memory=False,
                ):
                    if not line.startswith("data: "):
                        continue
                    payload = line[6:].strip()
                    if payload == "[DONE]":
                        continue
                    try:
                        event = json.loads(payload)
                    except json.JSONDecodeError:
                        continue
                    if event.get("type") == "content":
                        chunk = event.get("chunk", "")
                        assistant_chunks.append(chunk)
                        yield f"data: {json.dumps({'type': 'content', 'chunk': chunk})}\n\n"

                final_text = "".join(assistant_chunks)
                if final_text:
                    await memory_call(
                        "add_sda_command_response",
                        lambda: memory.add_message(final_text, role="assistant"),
                    )

                yield f"data: {json.dumps({'type': 'agent_complete', 'agent': intent, 'message': f'{cmd_label} complete'})}\n\n"

            except Exception as exc:
                logger.exception("sda_command_failed", intent=intent, error=str(exc))
                try:
                    await self.db.rollback()
                except Exception:
                    pass
                yield f"data: {json.dumps({'type': 'error', 'error': f'Errore durante {intent}: {str(exc)}'})}\n\n"

            usage = await memory_call(
                "get_window_usage_after_sda_command",
                lambda: memory.get_window_usage(),
                {"percentage": 0.0},
            )
            if error_line := flush_memory_error_event_line():
                yield error_line
            yield f"data: {json.dumps({'type': 'memory_usage', 'percentage': usage.get('percentage', 0.0)})}\n\n"
            if error_line := flush_memory_error_event_line():
                yield error_line
            yield "data: [DONE]\n\n"
            return

        if intent == "conjunction_analysis":
            from app.services.detour.upstream_agent_service import UpstreamDetourAgentService
            from app.vendors.detour_upstream.agents.graph import stream_avoidance_pipeline

            active_agents: list[str] = []
            agent_outputs: dict[str, str] = {}
            saw_upstream_error = False

            try:
                await UpstreamDetourAgentService._ensure_demo_data()
                config = UpstreamDetourAgentService._build_llm_config()

                async for upstream_event in stream_avoidance_pipeline(
                    message,
                    config=config,
                    mode="multi",
                ):
                    if not isinstance(upstream_event, dict):
                        continue

                    event_type = str(upstream_event.get("type", ""))

                    if event_type == "agent_start":
                        current_agent = str(upstream_event.get("agent", "detour"))
                        if current_agent not in active_agents:
                            active_agents.append(current_agent)
                            await memory_call(
                                "update_active_agents",
                                lambda: memory.update_active_agents(active_agents),
                            )

                        start_message = self._build_upstream_agent_start_message(current_agent)
                        yield f"data: {json.dumps({'type': 'agent_start', 'agent': current_agent, 'message': start_message})}\n\n"
                        await memory_call(
                            "add_upstream_agent_start_event",
                            lambda: memory.add_agent_event(
                                agent_name=current_agent,
                                event_type="start",
                                message=start_message,
                            ),
                        )
                        continue

                    if event_type == "thinking":
                        thinking_text = str(upstream_event.get("text", "")).strip()
                        if thinking_text:
                            yield f"data: {json.dumps({'type': 'content', 'chunk': f'\\n💭 {thinking_text}\\n'})}\n\n"
                        continue

                    if event_type == "tool_calls":
                        tools = upstream_event.get("tools")
                        if isinstance(tools, list) and tools:
                            tool_names = ", ".join(str(tool) for tool in tools)
                            yield f"data: {json.dumps({'type': 'content', 'chunk': f'\\n🧰 Tool call: {tool_names}\\n'})}\n\n"
                        continue

                    if event_type == "tool_result":
                        tool_name = str(upstream_event.get("tool", "tool"))
                        summary = str(upstream_event.get("summary", "")).strip()
                        if summary:
                            yield f"data: {json.dumps({'type': 'content', 'chunk': f'\\n📎 {tool_name}: {summary}\\n'})}\n\n"
                        continue

                    if event_type == "maneuver_executed":
                        action = self._default_map_action()
                        yield f"data: {json.dumps({'type': 'cesium_action', 'action': action})}\n\n"
                        await memory_call(
                            "add_upstream_maneuver_map_event",
                            lambda: memory.add_agent_event(
                                agent_name=str(upstream_event.get("agent", "detour")),
                                event_type="action",
                                message="Maneuver executed: map refresh",
                                cesium_action=action,
                            ),
                        )
                        continue

                    if event_type == "agent_output":
                        current_agent = str(upstream_event.get("agent", "detour"))
                        output_text = str(upstream_event.get("content", "")).strip()
                        if not output_text:
                            continue

                        agent_outputs[current_agent] = output_text
                        label = self._build_upstream_agent_label(current_agent)
                        yield f"data: {json.dumps({'type': 'content', 'chunk': f'\\n{label}\\n{output_text}\\n'})}\n\n"
                        await memory_call(
                            "add_upstream_agent_output_event",
                            lambda: memory.add_agent_event(
                                agent_name=current_agent,
                                event_type="output",
                                message=output_text[:400],
                            ),
                        )
                        continue

                    if event_type == "agent_complete":
                        current_agent = str(upstream_event.get("agent", "detour"))
                        complete_message = self._build_upstream_agent_complete_message(current_agent)
                        yield f"data: {json.dumps({'type': 'agent_complete', 'agent': current_agent, 'message': complete_message})}\n\n"
                        await memory_call(
                            "add_upstream_agent_complete_event",
                            lambda: memory.add_agent_event(
                                agent_name=current_agent,
                                event_type="complete",
                                message=complete_message,
                            ),
                        )
                        continue

                    if event_type == "error":
                        saw_upstream_error = True
                        error_message = str(
                            upstream_event.get("message")
                            or upstream_event.get("error")
                            or "Errore sconosciuto nella pipeline upstream."
                        )
                        yield f"data: {json.dumps({'type': 'error', 'error': error_message})}\n\n"
                        await memory_call(
                            "add_upstream_pipeline_error",
                            lambda: memory.add_message(
                                f"Errore pipeline upstream: {error_message}",
                                role="assistant",
                            ),
                        )
                        break

                if saw_upstream_error:
                    usage = await memory_call(
                        "get_window_usage_after_upstream_error",
                        lambda: memory.get_window_usage(),  # type: ignore[union-attr]
                        {"percentage": 0.0},
                    )
                    if error_line := flush_memory_error_event_line():
                        yield error_line
                    yield f"data: {json.dumps({'type': 'memory_usage', 'percentage': usage.get('percentage', 0.0)})}\n\n"
                    if error_line := flush_memory_error_event_line():
                        yield error_line
                    yield "data: [DONE]\n\n"
                    return

                final_message = self._generate_upstream_pipeline_summary(agent_outputs)
                yield f"data: {json.dumps({'type': 'agent_complete', 'agent': 'all', 'message': final_message})}\n\n"
                await memory_call(
                    "add_upstream_pipeline_summary",
                    lambda: memory.add_message(final_message, role="assistant"),
                )

                usage = await memory_call(
                    "get_window_usage_after_upstream_pipeline",
                    lambda: memory.get_window_usage(),  # type: ignore[union-attr]
                    {"percentage": 0.0},
                )
                if error_line := flush_memory_error_event_line():
                    yield error_line
                yield f"data: {json.dumps({'type': 'memory_usage', 'percentage': usage.get('percentage', 0.0)})}\n\n"
                if error_line := flush_memory_error_event_line():
                    yield error_line
                yield "data: [DONE]\n\n"
            except Exception as e:
                logger.exception(
                    "chat_orchestration_upstream_pipeline_failed",
                    tenant_id=tenant_id,
                    session_id=chat_session_id,
                    error=str(e),
                )
                try:
                    await self.db.rollback()
                except Exception:
                    logger.warning("chat_orchestration_upstream_pipeline_rollback_failed")
                yield f"data: {json.dumps({'type': 'error', 'error': f'Errore durante l\'analisi: {str(e)}'})}\n\n"
                if error_line := flush_memory_error_event_line():
                    yield error_line
                yield "data: [DONE]\n\n"
            return

        if intent == "start_sar_simulation":
            command = {
                "action": "start_sar_simulation",
                "mode": "enter_simulation_mode",
                "source": "chat_orchestrator",
            }
            yield f"data: {json.dumps({'type': 'simulation_control', **command})}\n\n"

            assistant_text = (
                "Modalità SAR Simulation attivata. "
                "Premi START MISSION per avviare la missione."
            )
            await memory_call(
                "add_start_sar_simulation_message",
                lambda: memory.add_message(assistant_text, role="assistant"),
            )
            yield f"data: {json.dumps({'type': 'content', 'chunk': assistant_text})}\n\n"

            usage = await memory_call(
                "get_window_usage_after_start_sar_simulation",
                lambda: memory.get_window_usage(),  # type: ignore[union-attr]
                {"percentage": 0.0},
            )
            if error_line := flush_memory_error_event_line():
                yield error_line
            yield f"data: {json.dumps({'type': 'memory_usage', 'percentage': usage.get('percentage', 0.0)})}\n\n"
            if error_line := flush_memory_error_event_line():
                yield error_line
            yield "data: [DONE]\n\n"
            return

        if intent == "open_sandbox":
            command = {
                "action": "open_sandbox",
                "mode": "navigate",
                "source": "chat_orchestrator",
                "prompt": message,
            }
            yield f"data: {json.dumps({'type': 'simulation_control', **command})}\n\n"

            assistant_text = (
                "Opening Sandbox for a custom scenario. "
                "Continue authoring the session there."
            )
            await memory_call(
                "add_open_sandbox_message",
                lambda: memory.add_message(assistant_text, role="assistant"),
            )
            yield f"data: {json.dumps({'type': 'content', 'chunk': assistant_text})}\n\n"

            usage = await memory_call(
                "get_window_usage_after_open_sandbox",
                lambda: memory.get_window_usage(),  # type: ignore[union-attr]
                {"percentage": 0.0},
            )
            if error_line := flush_memory_error_event_line():
                yield error_line
            yield f"data: {json.dumps({'type': 'memory_usage', 'percentage': usage.get('percentage', 0.0)})}\n\n"
            if error_line := flush_memory_error_event_line():
                yield error_line
            yield "data: [DONE]\n\n"
            return

        if intent in {
            "create_satellite",
            "create_ground_station",
            "create_ground_vehicle",
            "create_operation",
        }:
            try:
                proposal = await self._build_side_effect_proposal(
                    intent=intent,
                    message=message,
                    tenant_id=tenant_id,
                    user_id=user_id,
                )
            except AIServiceError as exc:
                yield f"data: {json.dumps({'type': 'error', 'error': str(exc)})}\n\n"
                if error_line := flush_memory_error_event_line():
                    yield error_line
                yield "data: [DONE]\n\n"
                return

            preview_actions = proposal.get("preview_actions") or [self._default_map_action()]
            for action in preview_actions:
                yield f"data: {json.dumps({'type': 'cesium_action', 'action': action})}\n\n"

            if mode == "execute":
                execution = await self._execute_side_effect_operation(
                    proposal=proposal,
                    tenant_id=tenant_id,
                    user_id=user_id,
                )
                for action in execution.get("cesium_actions", []):
                    yield f"data: {json.dumps({'type': 'cesium_action', 'action': action})}\n\n"
                for command in execution.get("simulation_actions", []):
                    yield f"data: {json.dumps({'type': 'simulation_control', **command})}\n\n"
                assistant_text = execution.get("message", "Operazione completata.")
                await memory_call(
                    "add_side_effect_execution_message",
                    lambda: memory.add_message(assistant_text, role="assistant"),
                )
                yield f"data: {json.dumps({'type': 'content', 'chunk': assistant_text})}\n\n"
            else:
                confirmation_text = (
                    "Ho preparato l'operazione richiesta. Scrivi `conferma` per eseguirla "
                    "oppure indica modifiche."
                )
                await memory_call(
                    "add_pending_confirmation",
                    lambda: memory.add_message(
                        content=f"Pending confirmation: {proposal.get('summary', 'operazione')}",
                        role="system",
                        metadata={"pending_confirmation": proposal},
                    ),
                )
                yield f"data: {json.dumps({'type': 'confirmation_required', 'operation': proposal})}\n\n"
                await memory_call(
                    "add_confirmation_prompt",
                    lambda: memory.add_message(confirmation_text, role="assistant"),
                )
                yield f"data: {json.dumps({'type': 'content', 'chunk': confirmation_text})}\n\n"

            usage = await memory_call(
                "get_window_usage_after_side_effect",
                lambda: memory.get_window_usage(),  # type: ignore[union-attr]
                {"percentage": 0.0},
            )
            if error_line := flush_memory_error_event_line():
                yield error_line
            yield f"data: {json.dumps({'type': 'memory_usage', 'percentage': usage.get('percentage', 0.0)})}\n\n"
            if error_line := flush_memory_error_event_line():
                yield error_line
            yield "data: [DONE]\n\n"
            return

        if intent == "map_control":
            # Carica i dati nel contesto
            satellites_data = await self._get_satellites_context(tenant_id)
            ground_stations_data = await self._get_ground_stations_context(tenant_id)
            ground_vehicles_data = await self._get_ground_vehicles_context(tenant_id)
            
            context_parts = []
            
            if satellites_data:
                context_parts.append(f"""AVAILABLE SATELLITES (use cesium_fly_to with entityId):
{json.dumps(satellites_data, indent=2)}

INSTRUCTIONS: Use cesium_fly_to with entityId='satellite-<id>'""")
            
            if ground_stations_data:
                context_parts.append(f"""AVAILABLE GROUND STATIONS (use cesium_fly_to with coordinates):
{json.dumps(ground_stations_data, indent=2)}

INSTRUCTIONS: Use cesium_fly_to with longitude/latitude from the list""")
            
            if ground_vehicles_data:
                context_parts.append(f"""AVAILABLE GROUND VEHICLES (use cesium_fly_to with coordinates):
{json.dumps(ground_vehicles_data, indent=2)}

INSTRUCTIONS: Use cesium_fly_to with longitude/latitude from the list""")
            
            satellite_context = "\n\n".join(context_parts)
            
            context_messages = await memory_call(
                "get_context_for_map_control",
                lambda: memory.get_context_as_messages(limit=5),  # Ridotto per non confondere l'AI
                [],
            )
            
            # Aggiungi il contesto satelliti come messaggio di sistema
            messages_with_context = [
                {"role": "system", "content": satellite_context}
            ] + context_messages + [{"role": "user", "content": message}]
            
            assistant_text_chunks: list[str] = []
            action_emitted = False
            async for line in self.stream_chat_with_functions(
                messages=messages_with_context,
                scene_state=None,
                tenant_id=tenant_id,
                include_satellites=False,  # Già incluso manualmente sopra
                use_memory=False,
            ):
                if not line.startswith("data: "):
                    continue
                payload = line[6:].strip()
                if payload == "[DONE]":
                    continue
                try:
                    event = json.loads(payload)
                except json.JSONDecodeError:
                    continue

                if event.get("type") == "action":
                    mapped_action = {
                        "type": event.get("action_type"),
                        "payload": event.get("payload", {}),
                    }
                    action_emitted = True
                    yield f"data: {json.dumps({'type': 'cesium_action', 'action': mapped_action})}\n\n"
                elif event.get("type") == "content":
                    chunk = event.get("chunk", "")
                    assistant_text_chunks.append(chunk)
                    yield f"data: {json.dumps({'type': 'content', 'chunk': chunk})}\n\n"
                elif event.get("type") == "error":
                    yield f"data: {json.dumps({'type': 'error', 'error': event.get('error', 'Errore sconosciuto')})}\n\n"

            if not action_emitted:
                yield f"data: {json.dumps({'type': 'cesium_action', 'action': self._default_map_action()})}\n\n"
            if assistant_text_chunks:
                await memory_call(
                    "add_map_control_response",
                    lambda: memory.add_message("".join(assistant_text_chunks), role="assistant"),
                )
            usage = await memory_call(
                "get_window_usage_after_map_control",
                lambda: memory.get_window_usage(),  # type: ignore[union-attr]
                {"percentage": 0.0},
            )
            if error_line := flush_memory_error_event_line():
                yield error_line
            yield f"data: {json.dumps({'type': 'memory_usage', 'percentage': usage.get('percentage', 0.0)})}\n\n"
            if error_line := flush_memory_error_event_line():
                yield error_line
            yield "data: [DONE]\n\n"
            return

        # Generic chat fallback with persistent memory context.
        context_messages = await memory_call(
            "get_context_for_generic_chat",
            lambda: memory.get_context_as_messages(limit=20),
            [],
        )
        yield f"data: {json.dumps({'type': 'cesium_action', 'action': self._default_map_action()})}\n\n"
        async for chunk in self.stream_chat_with_memory(
            message,
            context_messages,
            tenant_id,
            session_id=chat_session_id,
        ):
            yield chunk

        usage = await memory_call(
            "get_window_usage_after_generic_chat",
            lambda: memory.get_window_usage(),  # type: ignore[union-attr]
            {"percentage": 0.0},
        )
        if error_line := flush_memory_error_event_line():
            yield error_line
        yield f"data: {json.dumps({'type': 'memory_usage', 'percentage': usage.get('percentage', 0.0)})}\n\n"

    async def _classify_intent(self, message: str) -> str:
        """Classify user intent to determine which workflow to run."""
        message_lower = message.lower().strip()

        # ── SDA Operator Commands (checked first — high-value, specific) ──
        shift_brief_patterns = (
            "briefing turno", "shift brief", "briefing di turno",
            "briefing operativo", "stato del mondo", "situazione generale",
            "morning brief", "handover brief",
        )
        if any(p in message_lower for p in shift_brief_patterns):
            return "shift_brief"

        fleet_threat_patterns = (
            "scansione minacce", "fleet threat", "threat scan",
            "any threats", "minacce attive", "ci sono minacce",
            "asset sicur", "are my assets safe", "scansione flotta",
        )
        if any(p in message_lower for p in fleet_threat_patterns):
            return "fleet_threat_scan"

        if re.search(
            r"\b(sandbox|custom simulation|custom scenario|simulation workspace|what-if workspace)\b",
            message_lower,
        ):
            return "open_sandbox"

        if re.search(
            r"\b(cosa succede|what if|what-if|simula|scenario|se\s+.+\s+esplod|se\s+.+\s+fragment|"
            r"se perdo|if i lose|se approvo|if i approve|se la manovra)\b",
            message_lower,
        ):
            return "what_if_scenario"

        # ── Existing intents ──
        conjunction_keywords = (
            "congiunzione", "conjunction", "collisione", "collision",
            "rischio", "risk", "manovra evasiva", "avoidance", "detour",
        )
        if any(keyword in message_lower for keyword in conjunction_keywords):
            return "conjunction_analysis"

        if re.search(r"\b(crea|create|add)\b.*\b(satellite|satellit)", message_lower):
            return "create_satellite"
        if re.search(r"\b(crea|create|add)\b.*\b(base|ground station|stazione)", message_lower):
            return "create_ground_station"
        if re.search(r"\b(crea|create|add|spawn)\b.*\b(vehicle|veicolo|ground vehicle)", message_lower):
            return "create_ground_vehicle"
        if re.search(
            r"\b(start|avvia|avviare|inizia|iniziare|lancia|launch)\b.*\b(sar|simulation|simulazione|missione|mission)\b",
            message_lower,
        ):
            return "start_sar_simulation"
        if re.search(r"\b(crea|create|start|avvia)\b.*\b(operation|operazione)", message_lower):
            return "create_operation"

        # Visualization intents (more specific, check before map_control)
        for intent, patterns in self.VISUALIZATION_PATTERNS.items():
            for pattern in patterns:
                if re.search(pattern, message_lower):
                    return intent

        map_keywords = (
            "fly to", "zoom", "focalizza", "map", "mappa", "camera",
            "mostra", "show", "nascondi", "hide",
        )
        if any(keyword in message_lower for keyword in map_keywords):
            return "map_control"

        return "generic_chat"

    async def _extract_conjunction_context(self, message: str, tenant_id: str) -> tuple[Optional[str], Optional[str]]:
        """Extract satellite ID and conjunction event ID from message."""
        satellite_id = None
        conjunction_event_id = None

        message_lower = message.lower()
        explicit_conjunction = re.search(r"\b([a-z]{2,6}-\d{4}-\d+)\b", message_lower)

        # Try to find satellite by name, ID or NORAD.
        satellites, _ = await self.ontology.list_satellites(tenant_id=tenant_id, page_size=100)
        for sat in satellites:
            if sat.name.lower() in message_lower or sat.id.lower() in message_lower:
                satellite_id = sat.id
                break
            if str(sat.norad_id) in message_lower:
                satellite_id = sat.id
                break

        if satellite_id:
            events, _ = await self.ontology.list_conjunction_events(
                tenant_id=tenant_id,
                page_size=10,
            )
            for event in events:
                if explicit_conjunction and event.id.lower() == explicit_conjunction.group(1):
                    conjunction_event_id = event.id
                    break
                if event.primary_object_id == satellite_id:
                    conjunction_event_id = event.id
                    break

        return satellite_id, conjunction_event_id

    async def _route_visualization_command(
        self,
        message: str,
        tenant_id: str,
    ) -> Optional[CesiumAction]:
        """Deterministic pattern matching for visualization commands."""
        message_lower = message.lower()

        for intent, patterns in self.VISUALIZATION_PATTERNS.items():
            for pattern in patterns:
                if re.search(pattern, message_lower):
                    return await self._build_visualization_action(intent, message, tenant_id)

        return None

    async def _build_visualization_action(
        self,
        intent: str,
        message: str,
        tenant_id: str,
    ) -> Optional[CesiumAction]:
        """Build CesiumAction for visualization intent."""
        satellite_id = await self._resolve_satellite_from_message(message, tenant_id)
        if not satellite_id and intent not in ["show_conjunction_line"]:
            logger.warning(f"Could not resolve satellite for intent {intent}")
            return None

        if intent == "show_maneuver_options":
            maneuvers = await self._get_maneuver_options(satellite_id, tenant_id)
            recommended_id = maneuvers[0].get("id") if maneuvers else None
            return CesiumAction(
                type="cesium.showManeuverOptions",
                payload={
                    "satellite_id": satellite_id,
                    "maneuvers": maneuvers,
                    "recommended_id": recommended_id,
                },
            )

        elif intent == "highlight_maneuver":
            recommended_id = await self._get_recommended_maneuver_id(satellite_id, tenant_id)
            return CesiumAction(
                type="cesium.highlightManeuver",
                payload={
                    "satellite_id": satellite_id,
                    "maneuver_id": recommended_id,
                    "color": "#00FF00",
                },
            )

        elif intent == "show_conjunction_line":
            target_id = await self._get_conjunction_target(satellite_id, tenant_id)
            if not satellite_id or not target_id:
                return None
            return CesiumAction(
                type="cesium.showConjunctionLine",
                payload={
                    "satellite_a_id": satellite_id,
                    "satellite_b_id": target_id,
                    "color": "#FF1744",
                },
            )

        elif intent == "show_risk_heatmap":
            risk_level = await self._get_risk_level(satellite_id, tenant_id)
            return CesiumAction(
                type="cesium.showRiskHeatmap",
                payload={
                    "satellite_id": satellite_id,
                    "risk_level": risk_level,
                },
            )

        elif intent == "show_threat_radius":
            return CesiumAction(
                type="cesium.showThreatRadius",
                payload={
                    "satellite_id": satellite_id,
                    "radius_km": 5.0,
                    "color": "#FF5722",
                },
            )

        return None

    async def _resolve_satellite_from_message(self, message: str, tenant_id: str) -> Optional[str]:
        """Resolve satellite UUID from message text using name, NORAD ID, or alias."""
        message_lower = message.lower()
        satellites, _ = await self.ontology.list_satellites(tenant_id=tenant_id, page_size=100)

        norad_match = re.search(r'\b(\d{5,})\b', message)
        if norad_match:
            for sat in satellites:
                if str(sat.norad_id) == norad_match.group(1):
                    return sat.id

        for sat in satellites:
            if sat.name.lower() in message_lower:
                return sat.id
            if message_lower in sat.name.lower():
                return sat.id

        ALIASES = {
            "iss": "International Space Station",
            "stazione spaziale": "International Space Station",
            "stazione": "International Space Station",
            "hubble": "Hubble Space Telescope",
            "starlink": "Starlink",
        }
        for alias, full_name in ALIASES.items():
            if alias in message_lower:
                for sat in satellites:
                    if full_name.lower() in sat.name.lower():
                        return sat.id

        return None

    async def _get_maneuver_options(self, satellite_id: str, tenant_id: str) -> list[dict]:
        """Get maneuver options for satellite from conjunction events."""
        try:
            events, _ = await self.ontology.list_conjunction_events(tenant_id=tenant_id, page_size=10)
            for event in events:
                if event.primary_object_id == satellite_id:
                    if hasattr(event, 'maneuver_options') and event.maneuver_options:
                        return event.maneuver_options
                    return [
                        {"id": "m1", "type": "delta_v_posigrade", "delta_v_m_s": 0.5, "description": "Aumenta altitudine"},
                        {"id": "m2", "type": "delta_v_retrograde", "delta_v_m_s": 0.3, "description": "Riduci altitudine"},
                        {"id": "m3", "type": "plane_change", "delta_v_m_s": 1.2, "description": "Cambia piano orbitale"},
                    ]
        except Exception as e:
            logger.warning(f"Failed to get maneuver options: {e}")
        return []

    async def _get_recommended_maneuver_id(self, satellite_id: str, tenant_id: str) -> Optional[str]:
        """Get recommended maneuver ID (lowest delta-v)."""
        maneuvers = await self._get_maneuver_options(satellite_id, tenant_id)
        if not maneuvers:
            return None
        return min(maneuvers, key=lambda m: m.get("delta_v_m_s", float("inf"))).get("id")

    async def _get_conjunction_target(self, satellite_id: str, tenant_id: str) -> Optional[str]:
        """Get conjunction target satellite ID."""
        try:
            events, _ = await self.ontology.list_conjunction_events(tenant_id=tenant_id, page_size=10)
            for event in events:
                if event.primary_object_id == satellite_id:
                    return event.secondary_object_id
        except Exception as e:
            logger.warning(f"Failed to get conjunction target: {e}")
        return None

    async def _get_risk_level(self, satellite_id: str, tenant_id: str) -> str:
        """Get risk level for satellite from conjunction events."""
        try:
            events, _ = await self.ontology.list_conjunction_events(tenant_id=tenant_id, page_size=10)
            for event in events:
                if event.primary_object_id == satellite_id:
                    if hasattr(event, 'risk_level') and event.risk_level:
                        return event.risk_level.value if hasattr(event.risk_level, 'value') else str(event.risk_level)
        except Exception as e:
            logger.warning(f"Failed to get risk level: {e}")
        return "medium"

    def _build_upstream_agent_start_message(self, agent_name: str) -> str:
        """Human-friendly start message for vendored upstream agents."""
        messages = {
            "scout": "🔍 Agente Scout: Analizzo oggetti vicini e potenziali minacce...",
            "analyst": "📊 Agente Analyst: Valuto il rischio di collisione...",
            "planner": "📋 Agente Planner: Genero opzioni di manovra...",
            "safety": "🛡️ Agente Safety: Valido il piano di manovra...",
            "ops_brief": "📢 Agente Ops Brief: Preparo il riepilogo operativo...",
            "detour": "🤖 Agente Detour: Analisi in corso...",
        }
        return messages.get(agent_name, f"🤖 Agente {agent_name}: elaborazione in corso...")

    def _build_upstream_agent_complete_message(self, agent_name: str) -> str:
        """Human-friendly completion message for vendored upstream agents."""
        labels = {
            "scout": "Scout",
            "analyst": "Analyst",
            "planner": "Planner",
            "safety": "Safety",
            "ops_brief": "Ops Brief",
            "detour": "Detour",
        }
        label = labels.get(agent_name, agent_name)
        return f"✅ Agente {label} completato."

    def _build_upstream_agent_label(self, agent_name: str) -> str:
        """Readable label used when relaying upstream agent outputs in chat."""
        labels = {
            "scout": "🔍 Scout",
            "analyst": "📊 Analyst",
            "planner": "📋 Planner",
            "safety": "🛡️ Safety",
            "ops_brief": "📢 Ops Brief",
            "detour": "🤖 Detour",
        }
        return labels.get(agent_name, f"🤖 {agent_name}")

    def _generate_upstream_pipeline_summary(self, outputs: dict[str, str]) -> str:
        """Build final summary from vendored upstream 5-agent outputs."""
        if outputs.get("ops_brief"):
            return f"✅ Pipeline multi-agent completata.\n\n{outputs['ops_brief']}"

        ordered_agents = ["scout", "analyst", "planner", "safety"]
        sections: list[str] = []
        for agent_name in ordered_agents:
            output_text = outputs.get(agent_name)
            if not output_text:
                continue
            sections.append(f"{self._build_upstream_agent_label(agent_name)}\n{output_text}")

        if not sections:
            return "✅ Pipeline multi-agent completata. Nessun output testuale disponibile."

        return "✅ Pipeline multi-agent completata.\n\n" + "\n\n".join(sections)

    def _generate_pipeline_summary(self, state: DetourGraphState) -> str:
        """Generate a human-readable summary of the Detour pipeline results."""
        parts = ["✅ **Analisi Completa**\n\n"]

        if state.get("screening_results"):
            threats = len(state.get("screening_results", []))
            parts.append(f"🔍 **Scout**: Identificate {threats} potenziali minacce\n")

        if state.get("risk_assessment"):
            risk = state["risk_assessment"].get("risk_level", "unknown")
            parts.append(f"📊 **Analyst**: Livello di rischio: **{risk.upper()}**\n")

        if state.get("maneuver_options"):
            planner_output = state.get("planner_output", {}) or {}
            options = planner_output.get("maneuver_options", state.get("maneuver_options", []))
            rec = planner_output.get("recommended_option", "N/A")
            parts.append(f"📋 **Planner**: Generate {len(options)} opzioni di manovra (consigliata: {rec})\n")

        if state.get("safety_review"):
            approved = state["safety_review"].get("approved", False)
            status = "✅ Approvata" if approved else "⚠️ Richiede revisione"
            parts.append(f"🛡️ **Safety**: {status}\n")

        if state.get("ops_brief"):
            parts.append(f"📢 **Ops Brief**: Piano operativo pronto per l'esecuzione\n")

        parts.append("\n🎬 **Tutte le azioni sono state visualizzate sulla mappa!**")

        return "".join(parts)

    def _extract_detour_actions(self, state_update: dict[str, Any]) -> list[dict[str, Any]]:
        """Extract Cesium actions from Detour state update with safe fallback."""
        action_sources = (
            state_update.get("scout_output"),
            state_update.get("analyst_output"),
            state_update.get("planner_output"),
            state_update.get("safety_output"),
            state_update.get("ops_brief_output"),
            state_update.get("risk_assessment"),
        )
        actions: list[dict[str, Any]] = []
        for source in action_sources:
            if isinstance(source, dict):
                for action in source.get("cesium_actions", []) or []:
                    if isinstance(action, dict) and action.get("type"):
                        actions.append(action)

        if actions:
            return actions
        return [self._default_map_action()]

    def _default_map_action(self) -> dict[str, Any]:
        """Fallback action used when a step has no explicit visualization output."""
        return {
            "type": "cesium.toggle",
            "payload": {"showLabels": True},
        }

    def _resolve_client_session_id(
        self,
        session_id: Optional[str] = None,
        map_session_id: Optional[str] = None,
    ) -> str:
        """Resolve a stable client-facing session id, generating one when absent."""
        base = (session_id or map_session_id or str(generate_uuid())).strip()
        safe = re.sub(r"[^a-zA-Z0-9:_-]", "_", base)
        return safe[:80] or str(generate_uuid())

    def _init_memory_runtime(
        self,
        tenant_id: Optional[str],
        user_id: Optional[str],
        session_id: Optional[str],
        source: str,
        map_session_id: Optional[str] = None,
        enabled: bool = True,
        memory_timeout_s: float = 5.0,
    ) -> tuple[
        str,
        Optional[str],
        Optional[PostgreSQLChatMemory],
        Callable[[str, Callable[[], Awaitable[Any]], Any], Awaitable[Any]],
        Callable[[], Optional[dict[str, Any]]],
    ]:
        """Initialize shared memory runtime helpers for chat streams."""
        client_session_id = self._resolve_client_session_id(
            session_id=session_id,
            map_session_id=map_session_id,
        )

        memory: Optional[PostgreSQLChatMemory] = None
        chat_session_id: Optional[str] = None
        memory_available = enabled and bool(tenant_id)
        pending_memory_error: Optional[dict[str, Any]] = None

        if memory_available and tenant_id:
            chat_session_id = self._build_chat_session_id(
                tenant_id=tenant_id,
                user_id=user_id,
                session_id=client_session_id,
            )
            memory = PostgreSQLChatMemory(
                self.db,
                max_tokens=128000,
                session_id=chat_session_id,
                tenant_id=tenant_id,
            )

        async def memory_call(
            step: str,
            call_factory: Callable[[], Awaitable[Any]],
            fallback: Any = None,
        ) -> Any:
            nonlocal memory_available, pending_memory_error
            if not memory_available or memory is None:
                return fallback

            try:
                result = await asyncio.wait_for(call_factory(), timeout=memory_timeout_s)
                if step.startswith(("add_", "mark_", "update_", "clear_")):
                    await asyncio.wait_for(self.db.commit(), timeout=memory_timeout_s)
                return result
            except Exception as exc:
                memory_available = False
                try:
                    await self.db.rollback()
                except Exception as rollback_exc:
                    logger.warning(
                        f"{source}_memory_rollback_failed",
                        tenant_id=tenant_id,
                        session_id=chat_session_id,
                        step=step,
                        error=str(rollback_exc),
                    )

                logger.warning(
                    f"{source}_memory_unavailable",
                    tenant_id=tenant_id,
                    session_id=chat_session_id,
                    step=step,
                    error=str(exc),
                )

                if pending_memory_error is None:
                    pending_memory_error = {
                        "type": "memory_error",
                        "error": (
                            "Memoria chat temporaneamente non disponibile. "
                            "Continuo senza contesto persistente."
                        ),
                        "step": step,
                        "details": str(exc),
                    }
                return fallback

        def pop_memory_error_event() -> Optional[dict[str, Any]]:
            nonlocal pending_memory_error
            if pending_memory_error is None:
                return None
            payload = pending_memory_error
            pending_memory_error = None
            return payload

        return client_session_id, chat_session_id, memory, memory_call, pop_memory_error_event

    def _build_chat_session_id(
        self,
        tenant_id: str,
        user_id: Optional[str] = None,
        session_id: Optional[str] = None,
        map_session_id: Optional[str] = None,
    ) -> str:
        """Build a bounded chat session key for memory partitioning."""
        sid = session_id or map_session_id or "default"
        uid = user_id or "anon"
        raw = f"chat:{tenant_id}:{uid}:{sid}"
        safe = re.sub(r"[^a-zA-Z0-9:_-]", "_", raw)
        return safe[:100]

    def _is_confirmation_message(self, message: str) -> bool:
        """Return True if message acknowledges execution of a pending operation."""
        normalized = message.lower().strip()
        confirmation_tokens = {
            "conferma", "confirm", "yes", "ok", "procedi", "esegui",
            "vai", "approve", "approved",
        }
        if normalized in confirmation_tokens:
            return True
        return any(token in normalized for token in ("conferma", "confirm", "procedi", "esegui"))

    def _extract_named_value(self, message: str, keywords: tuple[str, ...], default: str) -> str:
        """Extract a human-readable entity name from natural language."""
        quoted = re.search(r'"([^"]+)"', message)
        if quoted:
            return quoted.group(1).strip()

        lowered = message.lower()
        for keyword in keywords:
            idx = lowered.find(keyword)
            if idx >= 0:
                candidate = message[idx + len(keyword):].strip(" :,-.")
                if candidate:
                    return candidate[:80]
        return default

    def _extract_lat_lon(self, message: str) -> tuple[Optional[float], Optional[float]]:
        """Extract latitude/longitude from common NL patterns."""
        lat_match = re.search(r"(?:lat|latitude)\s*[:=]?\s*(-?\d+(?:\.\d+)?)", message, re.IGNORECASE)
        lon_match = re.search(r"(?:lon|longitude)\s*[:=]?\s*(-?\d+(?:\.\d+)?)", message, re.IGNORECASE)
        if lat_match and lon_match:
            return float(lat_match.group(1)), float(lon_match.group(1))

        pair_match = re.search(r"(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)", message)
        if pair_match:
            return float(pair_match.group(1)), float(pair_match.group(2))
        return None, None

    async def _build_side_effect_proposal(
        self,
        intent: str,
        message: str,
        tenant_id: str,
        user_id: Optional[str],
    ) -> dict[str, Any]:
        """Build a confirmation-gated side-effect proposal from natural language."""
        operation_id = str(generate_uuid())

        if intent == "create_satellite":
            name = self._extract_named_value(
                message,
                keywords=("satellite", "satellit"),
                default=f"AI-SAT-{datetime.utcnow().strftime('%H%M%S')}",
            )
            norad_match = re.search(r"(?:norad\s*#?\s*)(\d+)", message, re.IGNORECASE)
            if norad_match:
                norad_id = int(norad_match.group(1))
            else:
                satellites, _ = await self.ontology.list_satellites(tenant_id=tenant_id, page_size=500)
                norad_id = max((int(s.norad_id) for s in satellites), default=80000) + 1

            lat, lon = self._extract_lat_lon(message)
            payload = SatelliteCreate(
                norad_id=norad_id,
                name=name,
                object_type=ObjectType.SATELLITE,
            ).model_dump(mode="json")
            preview_actions = []
            if lat is not None and lon is not None:
                preview_actions.append(
                    {
                        "type": "cesium.addEntity",
                        "payload": {
                            "entityType": "point",
                            "name": f"Preview {name}",
                            "position": {"longitude": lon, "latitude": lat, "altitude": 450000},
                            "properties": {"preview": True},
                        },
                    }
                )
                preview_actions.append(
                    {
                        "type": "cesium.flyTo",
                        "payload": {"longitude": lon, "latitude": lat, "altitude": 1200000, "duration": 1.5},
                    }
                )
            return {
                "operation_id": operation_id,
                "operation_type": "create_satellite",
                "payload": payload,
                "summary": f"Crea satellite '{name}' (NORAD {norad_id})",
                "map_coordinates": {"lat": lat, "lon": lon},
                "preview_actions": preview_actions,
                "requires_confirmation": True,
                "created_at": datetime.utcnow().isoformat(),
                "resolved": False,
            }

        if intent == "create_ground_station":
            name = self._extract_named_value(
                message,
                keywords=("ground station", "stazione", "base"),
                default=f"AI-BASE-{datetime.utcnow().strftime('%H%M%S')}",
            )
            lat, lon = self._extract_lat_lon(message)
            if lat is None or lon is None:
                raise AIServiceError("Per creare una base devo avere coordinate `lat` e `lon`.")

            payload = GroundStationCreate(
                name=name,
                latitude=lat,
                longitude=lon,
                code=re.sub(r"[^A-Z0-9]", "", name.upper())[:8] or "AIBASE",
            ).model_dump(mode="json")
            preview_actions = [
                {
                    "type": "cesium.addEntity",
                    "payload": {
                        "entityType": "ground_station",
                        "name": f"Preview {name}",
                        "position": {"longitude": lon, "latitude": lat, "altitude": 0},
                        "properties": {"preview": True},
                    },
                },
                {
                    "type": "cesium.flyTo",
                    "payload": {"longitude": lon, "latitude": lat, "altitude": 150000, "duration": 1.5},
                },
            ]
            return {
                "operation_id": operation_id,
                "operation_type": "create_ground_station",
                "payload": payload,
                "summary": f"Crea base '{name}' @ ({lat:.3f}, {lon:.3f})",
                "preview_actions": preview_actions,
                "requires_confirmation": True,
                "created_at": datetime.utcnow().isoformat(),
                "resolved": False,
            }

        if intent == "create_ground_vehicle":
            name = self._extract_named_value(
                message,
                keywords=("vehicle", "veicolo"),
                default=f"AI-VEH-{datetime.utcnow().strftime('%H%M%S')}",
            )
            lat, lon = self._extract_lat_lon(message)
            if lat is None or lon is None:
                raise AIServiceError("Per creare un veicolo devo avere coordinate `lat` e `lon`.")
            heading_match = re.search(r"(?:heading|rotta)\s*[:=]?\s*(-?\d+(?:\.\d+)?)", message, re.IGNORECASE)
            heading = float(heading_match.group(1)) if heading_match else 0.0
            entity_id = re.sub(r"[^a-z0-9-]", "-", name.lower()).strip("-") or f"veh-{operation_id[:8]}"

            payload = PositionReportCreate(
                entity_id=entity_id,
                entity_type="ground_vehicle",
                report_time=datetime.utcnow(),
                latitude=lat,
                longitude=lon,
                altitude_m=0.0,
                heading_deg=heading,
                data_source="ai-chat",
            ).model_dump(mode="json")
            preview_actions = [
                {
                    "type": "cesium.addEntity",
                    "payload": {
                        "entityType": "point",
                        "name": f"Preview {name}",
                        "position": {"longitude": lon, "latitude": lat, "altitude": 0},
                        "properties": {"preview": True, "entityId": entity_id},
                    },
                },
                {
                    "type": "cesium.flyTo",
                    "payload": {"longitude": lon, "latitude": lat, "altitude": 80000, "duration": 1.5},
                },
            ]
            return {
                "operation_id": operation_id,
                "operation_type": "create_ground_vehicle",
                "payload": payload,
                "summary": f"Crea veicolo '{name}' @ ({lat:.3f}, {lon:.3f})",
                "preview_actions": preview_actions,
                "requires_confirmation": True,
                "created_at": datetime.utcnow().isoformat(),
                "resolved": False,
            }

        if intent == "create_operation":
            name = self._extract_named_value(
                message,
                keywords=("operation", "operazione"),
                default=f"AI-OP-{datetime.utcnow().strftime('%H%M%S')}",
            )
            op_type = "reconnaissance"
            for candidate in (
                "transit", "patrol", "intercept", "strike", "reconnaissance",
                "support", "debris_avoidance", "station_keeping", "formation",
            ):
                if candidate.replace("_", " ") in message.lower() or candidate in message.lower():
                    op_type = candidate
                    break

            entities_match = re.search(r"(?:entities|asset|assets)\s*[:=]\s*([a-zA-Z0-9_, -]+)", message, re.IGNORECASE)
            entities = []
            if entities_match:
                entities = [e.strip() for e in entities_match.group(1).split(",") if e.strip()]

            payload = OperationCreate(
                name=name,
                operation_type=op_type,
                start_time=datetime.utcnow() + timedelta(minutes=1),
                participating_entities=entities,
                objectives=["AI-generated operation from chat"],
            ).model_dump(mode="json")
            preview_actions = [self._default_map_action()]
            return {
                "operation_id": operation_id,
                "operation_type": "create_operation",
                "payload": payload,
                "summary": f"Crea operazione '{name}' tipo '{op_type}'",
                "preview_actions": preview_actions,
                "requires_confirmation": True,
                "created_at": datetime.utcnow().isoformat(),
                "resolved": False,
            }

        if intent == "start_sar_simulation":
            preview_actions = [
                {
                    "type": "cesium.toggle",
                    "payload": {
                        "showLabels": True,
                        "showCoverage": False,
                    },
                }
            ]
            return {
                "operation_id": operation_id,
                "operation_type": "start_sar_simulation",
                "payload": {},
                "summary": "Avvia simulazione SAR Operation Guardian Angel",
                "preview_actions": preview_actions,
                "requires_confirmation": True,
                "created_at": datetime.utcnow().isoformat(),
                "resolved": False,
            }

        raise AIServiceError("Intent non supportato per operazioni con side-effect.")

    async def _execute_side_effect_operation(
        self,
        proposal: dict[str, Any],
        tenant_id: str,
        user_id: Optional[str],
    ) -> dict[str, Any]:
        """Execute a previously proposed side-effect operation."""
        op_type = proposal.get("operation_type")
        payload = proposal.get("payload", {})
        actor = user_id or "ai-agent"

        if op_type == "create_satellite":
            created = await self.ontology.create_satellite(
                SatelliteCreate(**payload),
                tenant_id=tenant_id,
                user_id=actor,
            )
            coords = proposal.get("map_coordinates") or {}
            lat = coords.get("lat")
            lon = coords.get("lon")
            if lat is None or lon is None:
                lat, lon = 0.0, 0.0
            actions = [
                {
                    "type": "cesium.addEntity",
                    "payload": {
                        "entityType": "satellite",
                        "name": created.name,
                        "position": {"longitude": lon, "latitude": lat, "altitude": 450000},
                        "properties": {"entityId": f"satellite-{created.id}", "objectType": "satellite"},
                    },
                },
                {
                    "type": "cesium.flyTo",
                    "payload": {"longitude": lon, "latitude": lat, "altitude": 1200000, "duration": 1.6},
                },
            ]
            return {
                "message": f"Satellite creato: `{created.name}` (ID: {created.id}, NORAD: {created.norad_id}).",
                "cesium_actions": actions,
            }

        if op_type == "create_ground_station":
            created = await self.ontology.create_ground_station(
                GroundStationCreate(**payload),
                tenant_id=tenant_id,
                user_id=actor,
            )
            actions = [
                {
                    "type": "cesium.addEntity",
                    "payload": {
                        "entityType": "ground_station",
                        "name": created.name,
                        "position": {
                            "longitude": created.longitude,
                            "latitude": created.latitude,
                            "altitude": created.altitude_m if hasattr(created, "altitude_m") else 0,
                        },
                        "properties": {"entityId": f"ground-station-{created.id}", "objectType": "ground_station"},
                    },
                },
                {
                    "type": "cesium.flyTo",
                    "payload": {
                        "longitude": created.longitude,
                        "latitude": created.latitude,
                        "altitude": 150000,
                        "duration": 1.5,
                    },
                },
            ]
            return {
                "message": f"Base creata: `{created.name}` (ID: {created.id}).",
                "cesium_actions": actions,
            }

        if op_type == "create_ground_vehicle":
            audit = AuditService(self.db)
            position_service = PositionTrackingService(self.db, audit)
            report = await position_service.report_position(
                tenant_id=tenant_id,
                user_id=actor,
                report_data=PositionReportCreate(**payload),
            )
            actions = [
                {
                    "type": "cesium.addEntity",
                    "payload": {
                        "entityType": "point",
                        "name": report.entity_id,
                        "position": {
                            "longitude": report.longitude,
                            "latitude": report.latitude,
                            "altitude": report.altitude_m or 0,
                        },
                        "properties": {"entityId": report.entity_id, "objectType": "ground_vehicle"},
                    },
                },
                {
                    "type": "cesium.flyTo",
                    "payload": {
                        "longitude": report.longitude,
                        "latitude": report.latitude,
                        "altitude": 80000,
                        "duration": 1.5,
                    },
                },
            ]
            return {
                "message": f"Veicolo registrato: `{report.entity_id}` ({report.latitude:.3f}, {report.longitude:.3f}).",
                "cesium_actions": actions,
            }

        if op_type == "create_operation":
            audit = AuditService(self.db)
            operation_service = OperationService(self.db, audit)
            op = await operation_service.create_operation(
                tenant_id=tenant_id,
                user_id=actor,
                operation_data=OperationCreate(**payload),
            )
            first_entity = op.participating_entities[0] if op.participating_entities else None
            actions = []
            if first_entity:
                actions.append(
                    {
                        "type": "cesium.setSelected",
                        "payload": {"entityId": first_entity},
                    }
                )
            else:
                actions.append(self._default_map_action())
            return {
                "message": f"Operazione creata: `{op.name}` (ID: {op.id}, stato: {op.status}).",
                "cesium_actions": actions,
            }

        if op_type == "start_sar_simulation":
            return {
                "message": (
                    "Simulazione SAR pronta: conferma ricevuta. "
                    "Avvio di Operation Guardian Angel in corso."
                ),
                "cesium_actions": [],
                "simulation_actions": [
                    {
                        "action": "start_sar_simulation",
                        "mode": "enter_and_start",
                        "source": "chat_orchestrator",
                    }
                ],
            }

        raise AIServiceError("Tipo operazione non supportato.")
    
    async def stream_chat_with_memory(
        self,
        message: str,
        context_messages: list[dict],
        tenant_id: str,
        session_id: Optional[str] = None,
    ) -> AsyncGenerator[str, None]:
        """Stream chat response using memory context."""
        if not self.client:
            yield f"data: {json.dumps({'type': 'error', 'error': 'AI service not configured'})}\n\n"
            return
        
        # Build messages with context
        messages = [
            {"role": "system", "content": self.SYSTEM_PROMPT}
        ] + context_messages + [
            {"role": "user", "content": message}
        ]
        
        try:
            response = await self._create_completion(
                model=settings.REGOLO_MODEL,
                messages=messages,
                max_tokens=2048,
                temperature=0.7,
                stream=True,
            )
            
            full_content = ""
            async for chunk in response:
                if chunk.choices[0].delta.content:
                    content = chunk.choices[0].delta.content
                    full_content += content
                    yield f"data: {json.dumps({'type': 'content', 'chunk': content})}\n\n"
            
            # Add assistant response to memory
            memory = PostgreSQLChatMemory(
                self.db,
                max_tokens=128000,
                session_id=session_id or f"chat_{tenant_id}",
                tenant_id=tenant_id,
            )
            try:
                await asyncio.wait_for(memory.add_message(full_content, role="assistant"), timeout=5.0)
                await asyncio.wait_for(self.db.commit(), timeout=5.0)
            except Exception as exc:
                try:
                    await self.db.rollback()
                except Exception as rollback_exc:
                    logger.warning(
                        "stream_chat_memory_rollback_failed",
                        tenant_id=tenant_id,
                        session_id=session_id or f"chat_{tenant_id}",
                        error=str(rollback_exc),
                    )
                logger.warning(
                    "stream_chat_memory_unavailable",
                    tenant_id=tenant_id,
                    session_id=session_id or f"chat_{tenant_id}",
                    error=str(exc),
                )
                yield f"data: {json.dumps({'type': 'memory_error', 'error': 'Memoria chat temporaneamente non disponibile.', 'details': str(exc)})}\n\n"
            
            yield "data: [DONE]\n\n"
            
        except Exception as e:
            logger.error(f"Stream chat with memory error: {e}")
            yield f"data: {json.dumps({'type': 'error', 'error': str(e)})}\n\n"
