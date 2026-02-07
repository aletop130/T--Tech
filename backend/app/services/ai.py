"""AI service for Regolo.ai integration."""
from datetime import datetime
from typing import Any, Optional, AsyncGenerator
import json
import asyncio

from openai import AsyncOpenAI
from openai.types.chat import ChatCompletionChunk
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.logging import get_logger
from app.core.exceptions import AIServiceError
from app.db.base import generate_uuid
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
from app.services.ontology import OntologyService
from app.services.audit import AuditService

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
    ) -> AsyncGenerator[str, None]:
        """Stream chat with function calling support.
        
        1. First call: Get tool calls (non-streaming)
        2. Emit tool calls as SSE action events
        3. Second call: Stream final response
        """
        if not self.client:
            yield f"data: {json.dumps({'type': 'error', 'error': 'AI service not configured'})}\n\n"
            return
        
        # Build system content with available satellites
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
                if response_message.content:
                    yield f"data: {json.dumps({'type': 'content', 'chunk': response_message.content})}\n\n"
            
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
    

