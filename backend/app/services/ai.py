"""AI service for Regolo.ai integration."""
import asyncio
from datetime import datetime, timedelta
from typing import Any, Optional, AsyncGenerator
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

            response = await self.client.chat.completions.create(**request_params)
            
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
            
            response = await self.client.chat.completions.create(
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
                
                second_response = await self.client.chat.completions.create(
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
            response = await self.client.chat.completions.create(
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
    ) -> AsyncGenerator[str, None]:
        """Stream chat with function calling support.

        1. First call: Get tool calls (non-streaming)
        2. Emit tool calls as SSE action events
        3. Second call: Stream final response
        """
        if not self.client:
            yield f"data: {json.dumps({'type': 'error', 'error': 'AI service not configured'})}\n\n"
            return

        # Build system content with available data
        system_content = self.SYSTEM_PROMPT

        if scene_state:
            system_content += f"\n\nCurrent scene state:\n{json.dumps(scene_state, indent=2)}"

        # Add satellite data to context if requested and tenant_id provided
        if include_satellites and tenant_id:
            try:
                satellites_data = await self._get_satellites_context(tenant_id)
                if satellites_data:
                    system_content += f"\n\nAvailable satellites in system:\n{json.dumps(satellites_data, indent=2)}\n\nWhen user asks to view a satellite (e.g., 'show me ISS'), use cesium_fly_to with the entityId from the entityId field (format: 'satellite-<id>') matching the satellite name or NORAD ID."
            except Exception as e:
                logger.warning(f"Failed to load satellites context: {e}")

        # Add incident data to context if requested and tenant_id provided
        if include_incidents and tenant_id:
            try:
                incidents_data = await self._get_incidents_context(tenant_id)
                if incidents_data:
                    system_content += f"\n\nRecent incidents (last 10):\n{json.dumps(incidents_data, indent=2)}\n\nYou have access to incident information and can help analyze incidents, suggest mitigation strategies, and correlate them with satellite and ground station data."
            except Exception as e:
                logger.warning(f"Failed to load incidents context: {e}")
        
        full_messages: list[dict[str, Any]] = [
            {"role": "system", "content": system_content}
        ] + messages
        
        actions: list[CesiumAction] = []
        
        try:
            # Step 1: First call with tools (non-streaming) to get tool calls
            response = await self.client.chat.completions.create(
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
                final_response = await self.client.chat.completions.create(
                    model=settings.REGOLO_MODEL,
                    messages=full_messages,
                    max_tokens=2048,
                    temperature=0.7,
                    stream=True,
                )
                
                async for chunk in final_response:
                    if chunk.choices[0].delta.content:
                        yield f"data: {json.dumps({'type': 'content', 'chunk': chunk.choices[0].delta.content})}\n\n"
            else:
                # No tool calls, stream the first response
                final_response = await self.client.chat.completions.create(
                    model=settings.REGOLO_MODEL,
                    messages=full_messages,
                    max_tokens=2048,
                    temperature=0.7,
                    stream=True,
                )
                
                async for chunk in final_response:
                    if chunk.choices[0].delta.content:
                        yield f"data: {json.dumps({'type': 'content', 'chunk': chunk.choices[0].delta.content})}\n\n"
            
            yield "data: [DONE]\n\n"
            
        except Exception as e:
            logger.error(f"Stream chat with functions error: {e}")
            yield f"data: {json.dumps({'type': 'error', 'error': str(e)})}\n\n"
    
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
            
            response = await self.client.chat.completions.create(
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
            
            response = await self.client.chat.completions.create(
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
            response = await self.client.chat.completions.create(
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
        from app.agents.detour.graph import stream_detour_pipeline
        from app.services.detour.state_manager import DetourStateManager

        logger.info(
            "chat_orchestration_started",
            tenant_id=tenant_id,
            user_id=user_id,
            session_id=session_id,
            map_session_id=map_session_id,
            mode=mode,
            message_preview=message[:120],
        )

        chat_session_id = self._build_chat_session_id(
            tenant_id=tenant_id,
            user_id=user_id,
            session_id=session_id,
            map_session_id=map_session_id,
        )

        memory = PostgreSQLChatMemory(
            self.db,
            max_tokens=128000,
            session_id=chat_session_id,
            tenant_id=tenant_id,
        )

        memory_available = True
        memory_timeout_s = 5.0

        async def memory_call(step: str, coroutine, fallback=None):
            nonlocal memory_available
            if not memory_available:
                return fallback
            try:
                return await asyncio.wait_for(coroutine, timeout=memory_timeout_s)
            except Exception as exc:
                memory_available = False
                logger.warning(
                    "chat_orchestration_memory_unavailable",
                    tenant_id=tenant_id,
                    session_id=chat_session_id,
                    step=step,
                    error=str(exc),
                )
                return fallback

        logger.info(
            "chat_orchestration_memory_add_start",
            tenant_id=tenant_id,
            session_id=chat_session_id,
        )
        await memory_call("add_user_message", memory.add_message(message, role="user"))
        logger.info(
            "chat_orchestration_memory_add_done",
            tenant_id=tenant_id,
            session_id=chat_session_id,
        )
        usage = await memory_call(
            "get_window_usage_initial",
            memory.get_window_usage(),
            {"percentage": 0.0},
        )
        logger.info(
            "chat_orchestration_memory_usage_done",
            tenant_id=tenant_id,
            session_id=chat_session_id,
            usage_percentage=usage.get("percentage"),
        )
        yield f"data: {json.dumps({'type': 'memory_usage', 'percentage': usage['percentage']})}\n\n"

        if self._is_confirmation_message(message):
            pending = await memory_call(
                "get_latest_pending_confirmation",
                memory.get_latest_pending_confirmation(),
            )
            if pending:
                execution = await self._execute_side_effect_operation(
                    proposal=pending,
                    tenant_id=tenant_id,
                    user_id=user_id,
                )
                for action in execution.get("cesium_actions", []):
                    yield f"data: {json.dumps({'type': 'cesium_action', 'action': action})}\n\n"

                await memory_call(
                    "mark_confirmation_resolved",
                    memory.mark_confirmation_resolved(pending.get("operation_id", "")),
                )
                assistant_text = execution.get("message", "Operazione completata.")
                await memory_call(
                    "add_assistant_confirmation_result",
                    memory.add_message(assistant_text, role="assistant"),
                )
                yield f"data: {json.dumps({'type': 'content', 'chunk': assistant_text})}\n\n"
                usage = await memory_call(
                    "get_window_usage_after_confirmation",
                    memory.get_window_usage(),
                    {"percentage": 0.0},
                )
                yield f"data: {json.dumps({'type': 'memory_usage', 'percentage': usage['percentage']})}\n\n"
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

        if intent == "conjunction_analysis":
            satellite_id, conjunction_event_id = await self._extract_conjunction_context(message, tenant_id)

            if not satellite_id or not conjunction_event_id:
                yield f"data: {json.dumps({'type': 'error', 'error': 'Non ho trovato il satellite menzionato. Per favore specifica il nome o ID del satellite.'})}\n\n"
                yield "data: [DONE]\n\n"
                return

            active_agents: list[str] = []
            final_state: dict[str, Any] = {}
            state_manager = DetourStateManager(self.db)
            graph_session_id = str(generate_uuid())

            try:
                async for state_update in stream_detour_pipeline(
                    session_id=graph_session_id,
                    satellite_id=satellite_id,
                    conjunction_event_id=conjunction_event_id,
                    tenant_id=tenant_id,
                    state_manager=state_manager,
                ):
                    final_state = state_update
                    current_agent = state_update.get("current_agent")

                    if current_agent and current_agent not in active_agents:
                        active_agents.append(current_agent)
                        await memory_call(
                            "update_active_agents",
                            memory.update_active_agents(active_agents),
                        )

                        agent_messages = {
                            "scout": "🔍 Agente Scout: Analizzo oggetti vicini e potenziali minacce...",
                            "analyst": "📊 Agente Analyst: Valuto il rischio di collisione...",
                            "planner": "📋 Agente Planner: Genero opzioni di manovra...",
                            "safety": "🛡️ Agente Safety: Valido il piano di manovra...",
                            "ops_brief": "📢 Agente Ops Brief: Preparo il riepilogo operativo...",
                        }

                        yield f"data: {json.dumps({
                            'type': 'agent_start',
                            'agent': current_agent,
                            'message': agent_messages.get(current_agent, f'Agente {current_agent} avviato...')
                        })}\n\n"

                        await memory_call(
                            "add_agent_start_event",
                            memory.add_agent_event(
                                agent_name=current_agent,
                                event_type="start",
                                message=agent_messages.get(current_agent, f"Agente {current_agent} avviato"),
                            ),
                        )

                    for action in self._extract_detour_actions(state_update):
                        yield f"data: {json.dumps({'type': 'cesium_action', 'action': action})}\n\n"
                        await memory_call(
                            "add_agent_action_event",
                            memory.add_agent_event(
                                agent_name=current_agent or "detour",
                                event_type="action",
                                message=f"Azione mappa: {action.get('type', 'unknown')}",
                                cesium_action=action,
                            ),
                        )

                final_message = self._generate_pipeline_summary(final_state)
                yield f"data: {json.dumps({'type': 'agent_complete', 'agent': 'all', 'message': final_message})}\n\n"
                await memory_call(
                    "add_pipeline_summary",
                    memory.add_message(final_message, role="assistant"),
                )

                usage = await memory_call(
                    "get_window_usage_after_pipeline",
                    memory.get_window_usage(),
                    {"percentage": 0.0},
                )
                yield f"data: {json.dumps({'type': 'memory_usage', 'percentage': usage['percentage']})}\n\n"
                yield "data: [DONE]\n\n"
            except Exception as e:
                logger.error(f"Detour pipeline error: {e}")
                yield f"data: {json.dumps({'type': 'error', 'error': f'Errore durante l\'analisi: {str(e)}'})}\n\n"
                yield "data: [DONE]\n\n"
            return

        if intent in {"create_satellite", "create_ground_station", "create_ground_vehicle", "create_operation"}:
            try:
                proposal = await self._build_side_effect_proposal(
                    intent=intent,
                    message=message,
                    tenant_id=tenant_id,
                    user_id=user_id,
                )
            except AIServiceError as exc:
                yield f"data: {json.dumps({'type': 'error', 'error': str(exc)})}\n\n"
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
                assistant_text = execution.get("message", "Operazione completata.")
                await memory_call(
                    "add_side_effect_execution_message",
                    memory.add_message(assistant_text, role="assistant"),
                )
                yield f"data: {json.dumps({'type': 'content', 'chunk': assistant_text})}\n\n"
            else:
                confirmation_text = (
                    "Ho preparato l'operazione richiesta. Scrivi `conferma` per eseguirla "
                    "oppure indica modifiche."
                )
                await memory_call(
                    "add_pending_confirmation",
                    memory.add_message(
                        content=f"Pending confirmation: {proposal.get('summary', 'operazione')}",
                        role="system",
                        metadata={"pending_confirmation": proposal},
                    ),
                )
                yield f"data: {json.dumps({'type': 'confirmation_required', 'operation': proposal})}\n\n"
                await memory_call(
                    "add_confirmation_prompt",
                    memory.add_message(confirmation_text, role="assistant"),
                )
                yield f"data: {json.dumps({'type': 'content', 'chunk': confirmation_text})}\n\n"

            usage = await memory_call(
                "get_window_usage_after_side_effect",
                memory.get_window_usage(),
                {"percentage": 0.0},
            )
            yield f"data: {json.dumps({'type': 'memory_usage', 'percentage': usage['percentage']})}\n\n"
            yield "data: [DONE]\n\n"
            return

        if intent == "map_control":
            context_messages = await memory_call(
                "get_context_for_map_control",
                memory.get_context_as_messages(limit=20),
                [],
            )
            assistant_text_chunks: list[str] = []
            action_emitted = False
            async for line in self.stream_chat_with_functions(
                messages=context_messages + [{"role": "user", "content": message}],
                scene_state=None,
                tenant_id=tenant_id,
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
                    memory.add_message("".join(assistant_text_chunks), role="assistant"),
                )
            usage = await memory_call(
                "get_window_usage_after_map_control",
                memory.get_window_usage(),
                {"percentage": 0.0},
            )
            yield f"data: {json.dumps({'type': 'memory_usage', 'percentage': usage['percentage']})}\n\n"
            yield "data: [DONE]\n\n"
            return

        # Generic chat fallback with persistent memory context.
        context_messages = await memory_call(
            "get_context_for_generic_chat",
            memory.get_context_as_messages(limit=20),
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
            memory.get_window_usage(),
            {"percentage": 0.0},
        )
        yield f"data: {json.dumps({'type': 'memory_usage', 'percentage': usage['percentage']})}\n\n"

    async def _classify_intent(self, message: str) -> str:
        """Classify user intent to determine which workflow to run."""
        message_lower = message.lower().strip()

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
        if re.search(r"\b(crea|create|start|avvia)\b.*\b(operation|operazione)", message_lower):
            return "create_operation"

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
            response = await self.client.chat.completions.create(
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
            except Exception as exc:
                logger.warning(
                    "stream_chat_memory_unavailable",
                    tenant_id=tenant_id,
                    session_id=session_id or f"chat_{tenant_id}",
                    error=str(exc),
                )
            
            yield "data: [DONE]\n\n"
            
        except Exception as e:
            logger.error(f"Stream chat with memory error: {e}")
            yield f"data: {json.dumps({'type': 'error', 'error': str(e)})}\n\n"
