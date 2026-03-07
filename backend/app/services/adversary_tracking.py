"""Adversary satellite tracking service.

Provides catalog of hostile satellites, intelligence reports,
and AI-powered research chat per satellite.
"""

from __future__ import annotations

from typing import Optional

from sqlalchemy import select, and_, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models.ontology import Satellite, Orbit
from app.physics.bayesian_scorer import ADVERSARIAL_COUNTRIES
from app.core.logging import get_logger

logger = get_logger(__name__)


class AdversaryTrackingService:
    """Service for tracking and analyzing adversary satellites."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_catalog(self, tenant_id: str) -> list[dict]:
        """Get catalog of all adversary/hostile satellites."""
        stmt = (
            select(Satellite, Orbit)
            .outerjoin(Orbit, Satellite.id == Orbit.satellite_id)
            .where(
                and_(
                    Satellite.tenant_id == tenant_id,
                    Satellite.is_active == True,
                    or_(
                        Satellite.country.in_(list(ADVERSARIAL_COUNTRIES)),
                        Satellite.faction == "enemy",
                    ),
                )
            )
        )
        result = await self.db.execute(stmt)
        rows = result.all()

        sat_map: dict[str, dict] = {}
        for sat, orbit in rows:
            if sat.id not in sat_map:
                sat_map[sat.id] = {
                    "satellite_id": sat.id,
                    "name": sat.name,
                    "norad_id": sat.norad_id,
                    "country": sat.country or "UNK",
                    "operator": sat.operator,
                    "object_type": sat.object_type or "PAYLOAD",
                    "altitude_km": 0.0,
                    "inclination_deg": 0.0,
                    "faction": getattr(sat, "faction", "hostile") or "hostile",
                    "tags": sat.tags or [],
                }
            if orbit:
                alt = ((orbit.apogee_km or 0) + (orbit.perigee_km or 0)) / 2 if orbit.apogee_km else (orbit.semi_major_axis_km - 6378.137 if orbit.semi_major_axis_km else 0)
                sat_map[sat.id].update({
                    "altitude_km": round(alt, 1),
                    "inclination_deg": round(orbit.inclination_deg or 0.0, 2),
                })

        return sorted(sat_map.values(), key=lambda s: s["name"])

    async def get_intelligence(self, tenant_id: str, satellite_id: str) -> dict:
        """Generate intelligence report for a specific adversary satellite."""
        stmt = (
            select(Satellite, Orbit)
            .outerjoin(Orbit, Satellite.id == Orbit.satellite_id)
            .where(
                and_(
                    Satellite.id == satellite_id,
                    Satellite.tenant_id == tenant_id,
                )
            )
        )
        result = await self.db.execute(stmt)
        row = result.first()

        if not row:
            return {
                "satellite_id": satellite_id,
                "satellite_name": "Unknown",
                "country": "UNK",
                "risk_assessment": "No data available",
                "historical_precedents": [],
                "capabilities": [],
                "recent_maneuvers": [],
                "threat_level": "unknown",
                "summary": "Satellite not found in database.",
            }

        sat, orbit = row
        country = sat.country or "UNK"

        # Build intelligence based on country and satellite type
        precedents = []
        capabilities = []
        threat_level = "low"

        if country in ("PRC", "CIS", "RUS"):
            threat_level = "high"
            if country == "PRC":
                precedents = [
                    "SC-19 kinetic kill test (2007) — destroyed FY-1C",
                    "SJ-21 grappling demonstration (2022)",
                    "SJ-17 robotic arm operations in GEO (2016)",
                ]
                capabilities = [
                    "Co-orbital inspection",
                    "Robotic grappling",
                    "RF interception",
                ]
            else:
                precedents = [
                    "Cosmos 2542/2543 inspector satellite tests (2019-2020)",
                    "Nudol DA-ASAT kinetic kill test (2021)",
                    "Luch/Olymp SIGINT operations in GEO",
                ]
                capabilities = [
                    "Co-orbital inspection",
                    "Direct-ascent ASAT",
                    "Electronic warfare",
                ]

        maneuvers = []
        if orbit and orbit.semi_major_axis_km:
            maneuvers.append(f"Current orbit: {orbit.semi_major_axis_km:.0f} km SMA, {orbit.inclination_deg:.1f}° inclination")

        return {
            "satellite_id": satellite_id,
            "satellite_name": sat.name,
            "country": country,
            "risk_assessment": f"{'High' if threat_level == 'high' else 'Medium'} risk — {country} military/dual-use satellite",
            "historical_precedents": precedents,
            "capabilities": capabilities,
            "recent_maneuvers": maneuvers,
            "threat_level": threat_level,
            "summary": f"{sat.name} is a {country} satellite assessed as {threat_level} threat level based on nation-state capabilities and historical precedents.",
        }

    async def chat_about_satellite(
        self,
        tenant_id: str,
        satellite_id: str,
        message: str,
    ) -> dict:
        """AI-powered research chat about a specific satellite.

        Uses the existing AIService with a specialized system prompt.
        """
        # Get satellite context
        intel = await self.get_intelligence(tenant_id, satellite_id)

        try:
            from app.services.ai import AIService
            from app.services.ontology import OntologyService
            from app.services.audit import AuditService

            ai_service = AIService(self.db, OntologyService(self.db, AuditService(self.db)))

            system_context = (
                f"You are an intelligence analyst researching satellite {intel['satellite_name']} "
                f"({intel['country']}). Known threat level: {intel['threat_level']}. "
                f"Historical precedents: {', '.join(intel['historical_precedents'][:3])}. "
                f"Provide concise, actionable intelligence analysis."
            )

            # Use the AI service chat method
            response = await ai_service.chat(
                message=message,
                system_prompt=system_context,
                tenant_id=tenant_id,
            )
            reply = response.get("content", response.get("reply", "Analysis unavailable."))
        except Exception as e:
            logger.warning("AI chat failed for adversary: %s", e)
            reply = (
                f"Intelligence brief for {intel['satellite_name']}:\n\n"
                f"Country: {intel['country']}\n"
                f"Threat Level: {intel['threat_level']}\n"
                f"Assessment: {intel['risk_assessment']}\n\n"
                f"Note: AI analysis service unavailable. Showing cached intelligence."
            )

        return {
            "reply": reply,
            "satellite_id": satellite_id,
        }
