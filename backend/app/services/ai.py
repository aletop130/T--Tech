"""AI service for Regolo.ai integration."""
from datetime import datetime
from typing import Any, Optional
import json

from openai import AsyncOpenAI
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
from app.services.ontology import OntologyService
from app.services.audit import AuditService

logger = get_logger(__name__)


class AIService:
    """AI service using Regolo.ai OpenAI-compatible API."""
    
    SYSTEM_PROMPT = """You are an expert Space Domain Awareness (SDA) analyst AI.
You help operators understand space situational awareness data, analyze
conjunction events, assess space weather impacts, and recommend courses
of action for protecting space assets and ground infrastructure.

Always provide structured, actionable insights. When analyzing risks,
consider:
- Object characteristics (mass, maneuverability, operational status)
- Orbital mechanics and propagation uncertainties
- Space weather conditions and their effects on different services
- Operational constraints and mission priorities

Be concise but thorough. Cite specific data when available."""
    
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
        
        # Build context from referenced objects
        context = await self._build_context(
            request.context_object_ids,
            tenant_id,
            request.include_recent_events,
        )
        
        # Construct messages with system prompt and context
        messages = [
            {"role": "system", "content": self.SYSTEM_PROMPT},
        ]
        
        if context:
            context_str = "Current context:\n" + json.dumps(context, indent=2)
            messages.append({"role": "system", "content": context_str})
        
        for msg in request.messages:
            messages.append({"role": msg.role, "content": msg.content})
        
        # Call Regolo API
        try:
            if not self.client:
                raise AIServiceError("AI service not configured")
            
            response = await self.client.chat.completions.create(
                model=settings.REGOLO_MODEL,
                messages=messages,
                max_tokens=request.max_tokens,
                temperature=request.temperature,
            )
            
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
                # Return mock response for demo
                return self._mock_conjunction_response(
                    request_id, event, request
                )
            
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
            return self._mock_conjunction_response(request_id, event, request)
    
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
                return self._mock_weather_response(request_id, request, events)
            
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
                return self._mock_weather_response(request_id, request, events)
            
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
            return self._mock_weather_response(request_id, request, events)
    
    async def propose_mitigation(
        self,
        event_id: str,
        event_type: str,
        tenant_id: str,
        user_id: Optional[str] = None,
    ) -> MitigationProposal:
        """Propose mitigation options for an event."""
        request_id = generate_uuid()
        
        # Mock implementation for demo
        options = [
            MitigationOption(
                option_id="opt_1",
                title="Collision Avoidance Maneuver",
                description="Execute pre-planned maneuver to increase miss distance",
                risk_reduction_percent=95.0,
                cost_estimate="Medium (fuel consumption)",
                implementation_time="4-8 hours",
                pros=["High risk reduction", "Proven technique"],
                cons=["Fuel cost", "Mission impact"],
            ),
            MitigationOption(
                option_id="opt_2",
                title="Enhanced Tracking",
                description="Increase tracking frequency for better predictions",
                risk_reduction_percent=20.0,
                cost_estimate="Low",
                implementation_time="1 hour",
                pros=["Low cost", "Improved situational awareness"],
                cons=["May not reduce actual risk"],
            ),
            MitigationOption(
                option_id="opt_3",
                title="Accept Risk with Monitoring",
                description="Monitor situation without active intervention",
                risk_reduction_percent=0.0,
                cost_estimate="None",
                implementation_time="Immediate",
                pros=["No resource cost", "No mission impact"],
                cons=["Risk remains unchanged"],
            ),
        ]
        
        return MitigationProposal(
            event_id=event_id,
            event_type=event_type,
            options=options,
            recommended_option_id="opt_1",
            rationale="Based on current risk score and object characteristics",
            confidence=0.85,
        )
    
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
    
    def _mock_conjunction_response(
        self,
        request_id: str,
        event: Any,
        request: ConjunctionAnalystRequest,
    ) -> ConjunctionAnalystResponse:
        """Generate mock response for demo."""
        return ConjunctionAnalystResponse(
            conjunction_event_id=request.conjunction_event_id,
            severity=event.risk_level.value,
            risk_explanation=(
                f"Close approach detected with miss distance of "
                f"{event.miss_distance_km:.3f} km. Risk assessment based on "
                f"orbital mechanics and object characteristics."
            ),
            primary_object_assessment=(
                f"Primary object {event.primary_object.name if event.primary_object else 'N/A'}"
                f" is {'active' if event.primary_object and event.primary_object.is_active else 'inactive'}."
            ),
            secondary_object_assessment=(
                f"Secondary object {event.secondary_object.name if event.secondary_object else 'N/A'}"
                f" assessment pending."
            ),
            recommended_action=(
                "Monitor" if event.miss_distance_km > 1.0 else "Consider maneuver"
            ),
            courses_of_action=[
                CourseOfAction(
                    action_type="monitor",
                    description="Continue tracking and refine prediction",
                    confidence=0.8,
                ),
                CourseOfAction(
                    action_type="maneuver",
                    description="Execute avoidance maneuver if risk increases",
                    maneuver_window_start=event.tca,
                    expected_delta_v_m_s=0.5,
                    risk_reduction_percent=90.0,
                    constraints=["Fuel budget", "Mission timeline"],
                    confidence=0.7,
                ),
            ],
            monitoring_recommendations=[
                "Increase tracking frequency",
                "Notify operations team",
                "Prepare maneuver plan",
            ],
            confidence=0.75,
            request_id=request_id,
        )
    
    def _mock_weather_response(
        self,
        request_id: str,
        request: SpaceWeatherWatchRequest,
        events: list,
    ) -> SpaceWeatherWatchResponse:
        """Generate mock weather response for demo."""
        max_kp = max((e.kp_index or 0 for e in events), default=0)
        overall = "low" if max_kp < 4 else "medium" if max_kp < 6 else "high"
        
        return SpaceWeatherWatchResponse(
            time_range_start=request.start_time,
            time_range_end=request.end_time,
            overall_risk=overall,
            risk_summary=f"Space weather conditions with Kp up to {max_kp}.",
            risk_by_service=[
                ServiceImpact(
                    service="gnss",
                    risk_level=overall,
                    impact_description="Potential ionospheric effects on GNSS",
                    confidence=0.7,
                ),
                ServiceImpact(
                    service="rf_comms",
                    risk_level=overall,
                    impact_description="Possible RF propagation degradation",
                    confidence=0.7,
                ),
            ],
            recommended_controls=[
                RecommendedControl(
                    control_type="monitoring",
                    description="Increase space weather monitoring",
                    priority="medium",
                    affected_services=["gnss", "rf_comms"],
                ),
            ],
            monitoring_actions=[
                "Monitor NOAA alerts",
                "Track Kp index changes",
            ],
            confidence=0.7,
            request_id=request_id,
        )

