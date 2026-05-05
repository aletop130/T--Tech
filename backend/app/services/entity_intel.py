"""Service for entity intelligence — fuses platform DB + LLM briefs."""
import json
from typing import Optional

from openai import AsyncOpenAI

from app.core.config import settings
from app.core.logging import get_logger
from app.schemas.entity_intel import (
    EntityIntelBrief,
    EntitySpecification,
    EntityLink,
    EntityTimelineEntry,
)
from app.services.platform_database import get_platform_specs, get_platform_model

logger = get_logger(__name__)


class EntityIntelService:
    """Generates intelligence briefs and specifications for entities."""

    def __init__(self) -> None:
        self._client: Optional[AsyncOpenAI] = None

    @property
    def client(self) -> AsyncOpenAI:
        if self._client is None:
            self._client = AsyncOpenAI(
                base_url=settings.REGOLO_BASE_URL,
                api_key=settings.REGOLO_API_KEY,
            )
        return self._client

    async def generate_brief(
        self,
        entity_type: str,
        entity_id: str,
        name: str = "",
        faction: str = "unknown",
        subtype: str = "",
        position: Optional[dict] = None,
        heading: Optional[float] = None,
        extra_context: str = "",
    ) -> EntityIntelBrief:
        """Generate an AI intelligence brief for an entity."""
        model_name = get_platform_model(entity_type, subtype or None)

        prompt = f"""You are a military intelligence analyst. Generate a concise tactical intelligence brief for this asset.

Asset Details:
- Name: {name or entity_id}
- Type: {entity_type}{f' / {subtype}' if subtype else ''}
- Platform Model: {model_name}
- Faction: {faction}
- Position: {json.dumps(position) if position else 'Unknown'}
- Heading: {heading if heading is not None else 'Unknown'}°
{f'- Additional Context: {extra_context}' if extra_context else ''}

Respond in JSON with exactly these fields:
{{
  "summary": "2-3 sentence executive summary of the asset and its current tactical situation",
  "threat_level": "low|medium|high|critical",
  "capabilities": ["capability1", "capability2", ...],
  "mission_profile": "estimated current mission or null",
  "command_control": "estimated C2 chain or null"
}}"""

        try:
            response = await self.client.chat.completions.create(
                model=settings.REGOLO_MODEL,
                messages=[{"role": "user", "content": prompt}],
                temperature=0.3,
                max_tokens=500,
            )
            content = response.choices[0].message.content or "{}"
            # Strip markdown code fences if present
            content = content.strip()
            if content.startswith("```"):
                content = content.split("\n", 1)[-1]
                if content.endswith("```"):
                    content = content[:-3]
            data = json.loads(content)

            return EntityIntelBrief(
                entity_id=entity_id,
                entity_type=entity_type,
                summary=data.get("summary", f"{name} — {faction} {entity_type}"),
                threat_level=data.get("threat_level", "medium"),
                capabilities=data.get("capabilities", []),
                mission_profile=data.get("mission_profile"),
                command_control=data.get("command_control"),
                confidence=0.7,
            )
        except Exception as e:
            logger.warning("entity_intel_brief_generation_failed", error=str(e))
            return self._fallback_brief(entity_type, entity_id, name, faction, subtype)

    def _fallback_brief(
        self,
        entity_type: str,
        entity_id: str,
        name: str,
        faction: str,
        subtype: str,
    ) -> EntityIntelBrief:
        """Generate a basic brief without LLM."""
        is_hostile = faction == "hostile"
        cap_map = {
            "drone": ["ISR", "Surveillance", "SIGINT"],
            "aircraft": ["Air Superiority", "Strike", "Intercept"],
            "ship": ["Sea Control", "ASW", "AAW"],
            "tank": ["Direct Fire", "Armor", "Maneuver"],
            "missile": ["Precision Strike", "Standoff"],
            "satellite": ["ISR", "SIGINT", "SATCOM"],
            "ground_station": ["C2", "Tracking", "Communications"],
            "base": ["Force Projection", "Logistics", "C2"],
        }
        caps = cap_map.get(entity_type.lower(), ["Unknown"])
        return EntityIntelBrief(
            entity_id=entity_id,
            entity_type=entity_type,
            summary=f"{name or entity_id} — {faction} {entity_type}"
            f"{f' ({subtype})' if subtype else ''}. "
            f"{'Assessed as active threat.' if is_hostile else 'No immediate threat.'}",
            threat_level="high" if is_hostile else "low",
            capabilities=caps,
            mission_profile=None,
            command_control=None,
            confidence=0.4,
        )

    def get_specifications(
        self, entity_type: str, subtype: Optional[str] = None
    ) -> list[EntitySpecification]:
        """Get platform specifications from reference database."""
        raw = get_platform_specs(entity_type, subtype)
        return [EntitySpecification(**s) for s in raw]


# Singleton
entity_intel_service = EntityIntelService()
