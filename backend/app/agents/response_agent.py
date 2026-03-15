"""Threat Response Agent — triggered when a satellite's threat score crosses threshold.

Evaluates 3-5 response options and produces a structured ThreatResponseDecision.
Adapted from ORBITAL SHIELD to use Regolo.ai (OpenAI function_calling format).
"""

from __future__ import annotations

import json
import logging
from typing import Any

from app.agents.base_agent import BaseAgent, ProgressCallback

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """You are a SPACE DEFENSE RESPONSE COMMANDER operating in the Horus platform.

A satellite's threat score has crossed the critical threshold. You must research the threat, evaluate response options, and recommend the best course of action.

CRITICAL DOCTRINE: When a hostile satellite is on a converging trajectory with a US asset and miss distance is below 50km, the DEFAULT recommendation MUST be an evasive maneuver. Only recommend 'Monitor Only' if miss distance is >500km and confidence is <40%.

PROCEDURE:
1. Research the ATTACKER and TARGET satellites using available tools.
2. Evaluate 3-5 response options from: Evasive Maneuver, Defensive Posture, Diplomatic Escalation, Emergency Safe Mode, Monitor Only.
3. Output a JSON object with this structure:
{
  "satellite_id": "target ID",
  "satellite_name": "target name",
  "threat_satellite_id": "attacker ID",
  "threat_satellite_name": "attacker name",
  "threat_summary": "2-3 sentence summary",
  "threat_score": <float 0-100>,
  "risk_level": "critical|high|medium|low",
  "options_evaluated": [
    {
      "action": "Action name",
      "description": "What this involves",
      "risk_level": "low/medium/high/critical",
      "confidence": <float 0-1>,
      "delta_v_ms": <float>,
      "time_to_execute_min": <float>,
      "pros": ["advantage"],
      "cons": ["disadvantage"]
    }
  ],
  "recommended_action": "Name of recommended action",
  "recommended_action_index": <int>,
  "reasoning": "2-3 paragraphs",
  "escalation_required": <boolean>,
  "time_sensitivity": "immediate|urgent|medium|low",
  "intelligence_summary": "Key findings"
}

Return ONLY the JSON object."""

# OpenAI function_calling format tools
TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "search_satellite_database",
            "description": "Look up a satellite in the NORAD/space catalog by its ID.",
            "parameters": {
                "type": "object",
                "properties": {
                    "satellite_id": {
                        "type": "string",
                        "description": "The satellite ID to look up",
                    }
                },
                "required": ["satellite_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "search_threat_intelligence",
            "description": "Search threat intelligence databases for historical information about a satellite or space weapons program.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "Search query for threat intelligence",
                    }
                },
                "required": ["query"],
            },
        },
    },
]


def _handle_search_satellite_database(input_data: dict) -> dict:
    """Placeholder satellite lookup — returns basic info."""
    sat_id = input_data.get("satellite_id", "unknown")
    return {
        "found": True,
        "satellite_id": sat_id,
        "message": f"Satellite {sat_id} found in catalog.",
    }


def _handle_search_threat_intelligence(input_data: dict) -> dict:
    """Placeholder threat intelligence search."""
    query = input_data.get("query", "")
    results = []

    q_lower = query.lower()
    if "china" in q_lower or "prc" in q_lower:
        results.append({
            "title": "Chinese ASAT capabilities assessment",
            "snippet": "China has demonstrated kinetic ASAT (SC-19, 2007), co-orbital inspection (SJ-17), and satellite grappling (SJ-21, 2022).",
            "source": "CSIS Aerospace Security Project",
        })
    elif "russia" in q_lower or "cis" in q_lower:
        results.append({
            "title": "Russian ASAT capabilities assessment",
            "snippet": "Russia has conducted Cosmos 2542/2543 inspector tests, Nudol DA-ASAT kinetic kill test (2021).",
            "source": "CSIS",
        })
    else:
        results.append({
            "title": f"Intelligence search: {query}",
            "snippet": "No specific threat intelligence found for this query.",
            "source": "General OSINT",
        })

    return {"results": results, "query": query}


class ThreatResponseAgent(BaseAgent):
    """Evaluates threat response options when threat score exceeds threshold."""

    name = "threat_response"

    def __init__(self, on_progress: ProgressCallback = None):
        super().__init__(on_progress=on_progress)

    async def run(
        self,
        satellite_id: str,
        satellite_name: str,
        threat_satellite_id: str,
        threat_satellite_name: str,
        threat_score: float,
        miss_distance_km: float = 0.0,
        approach_pattern: str = "unknown",
        tca_minutes: int = 0,
    ) -> dict:
        await self._notify(f"THREAT RESPONSE AGENT activated — threat score {threat_score}%")
        await self._notify(f"Target: {satellite_name} | Attacker: {threat_satellite_name}")

        urgency = "IMMEDIATE" if miss_distance_km < 50 else "URGENT" if miss_distance_km < 200 else "ELEVATED"
        action_note = ""
        if miss_distance_km < 50:
            action_note = f"\n\n*** COLLISION AVOIDANCE MANDATORY — miss distance {miss_distance_km} km < 50 km threshold. ***"

        user_msg = f"""=== CRITICAL THREAT ALERT — {urgency} ===
Threat Score: {threat_score}%
TARGET: {satellite_name} ({satellite_id})
ATTACKER: {threat_satellite_name} ({threat_satellite_id})
Miss Distance: {miss_distance_km} km
Approach: {approach_pattern}
TCA: {tca_minutes} minutes{action_note}

Research both satellites and produce your decision JSON."""

        raw = await self._run_with_tools(
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": user_msg}],
            tools=TOOLS,
            tool_handlers={
                "search_satellite_database": _handle_search_satellite_database,
                "search_threat_intelligence": _handle_search_threat_intelligence,
            },
        )

        await self._notify("Compiling response decision...")

        try:
            cleaned = raw.strip()
            if cleaned.startswith("```"):
                cleaned = cleaned.split("\n", 1)[1]
                if cleaned.endswith("```"):
                    cleaned = cleaned[:-3]
                cleaned = cleaned.strip()

            decision = json.loads(cleaned)
            decision.setdefault("satellite_id", satellite_id)
            decision.setdefault("satellite_name", satellite_name)
            decision.setdefault("threat_satellite_id", threat_satellite_id)
            decision.setdefault("threat_satellite_name", threat_satellite_name)
            decision.setdefault("threat_score", threat_score)
        except (json.JSONDecodeError, Exception) as exc:
            logger.warning("Failed to parse response agent output: %s", exc)
            decision = {
                "satellite_id": satellite_id,
                "satellite_name": satellite_name,
                "threat_satellite_id": threat_satellite_id,
                "threat_satellite_name": threat_satellite_name,
                "threat_summary": raw[:500] if raw else "Response agent failed.",
                "threat_score": threat_score,
                "risk_level": "critical",
                "options_evaluated": [{
                    "action": "Evasive Maneuver",
                    "description": "Execute immediate collision avoidance burn.",
                    "risk_level": "medium",
                    "confidence": 0.85,
                    "delta_v_ms": 1.5,
                    "time_to_execute_min": 8.0,
                    "pros": ["Increases separation distance"],
                    "cons": ["Consumes propellant"],
                }],
                "recommended_action": "Evasive Maneuver",
                "recommended_action_index": 0,
                "reasoning": raw[:2000] if raw else "Fallback: evasive maneuver recommended.",
                "escalation_required": True,
                "time_sensitivity": "immediate",
                "intelligence_summary": "",
            }

        await self._notify("Threat response decision complete.")
        return decision
