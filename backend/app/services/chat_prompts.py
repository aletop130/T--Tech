"""Prompt templates for SDA chat commands.

Each function takes structured data from ChatCommandService and returns
a formatted prompt string for the LLM to produce the final operator-facing
response (bilingual IT/EN).
"""

from __future__ import annotations

import json
from typing import Any


def shift_brief_prompt(data: dict[str, Any]) -> str:
    """Build the LLM prompt for a shift briefing response."""
    items_text = ""
    for item in data.get("items", []):
        items_text += f"- [{item['severity']}] {item['category']}: {item['summary']}\n"

    counts = data.get("summary_counts", {})
    errors = data.get("errors", [])
    error_note = f"\n⚠️ Services unavailable: {', '.join(errors)}" if errors else ""

    return f"""You are an SDA (Space Domain Awareness) shift briefing assistant.
Generate a concise, prioritized shift briefing based on the data below.

FORMAT RULES:
- Start with a one-line status summary (e.g., "🔴 CRITICAL: 2 threats require immediate attention")
- Group items by severity: CRITICAL first, then HIGH, MEDIUM, LOW/INFO
- Use bullet points, keep each item to 1-2 lines
- End with "Azioni raccomandate / Recommended actions" section
- Be bilingual: Italian headers, English technical details
- Do NOT invent data — only report what is provided below

BRIEFING DATA:
Timestamp: {data.get('timestamp', 'N/A')}
Summary: CRITICAL={counts.get('critical', 0)}, HIGH={counts.get('high', 0)}, MEDIUM={counts.get('medium', 0)}, LOW={counts.get('low', 0)}
{error_note}

ITEMS:
{items_text if items_text else "Nessun alert attivo / No active alerts"}

Generate the shift briefing now. Keep it under 400 words."""


def fleet_threat_scan_prompt(data: dict[str, Any]) -> str:
    """Build the LLM prompt for a fleet threat scan response."""
    threats_text = ""
    for i, t in enumerate(data.get("threats", [])[:10], 1):
        threats_text += (
            f"{i}. [{t['mode']}] {t['severity']} — {t.get('source', '?')} → {t.get('target', '?')}\n"
            f"   {t.get('detail', '')}\n"
            f"   Raccomandazione: {t.get('recommendation', 'N/A')}\n"
        )

    counts = data.get("threat_counts", {})
    fleet_top = data.get("fleet_risk_top5", [])
    fleet_text = ""
    for s in fleet_top:
        risk = s.get("risk", 0)
        fleet_text += f"- {s.get('name', '?')}: {risk:.0%} ({', '.join(s.get('components', {}).keys())})\n"

    return f"""You are an SDA threat assessment officer.
Produce a threat scan report based on the data below.

FORMAT RULES:
- Start with overall threat level (e.g., "⚠️ ELEVATED: 3 active threats detected across 2 domains")
- List threats by risk score (highest first), numbered
- Include the detection mode, target, source, and recommended action for each
- Add a "Fleet Risk Summary" section with the top satellites at risk
- End with "Priorità operative / Operational priorities" (top 3 actions)
- Be bilingual: Italian headers, English technical details
- Do NOT invent data

SCAN DATA:
Timestamp: {data.get('timestamp', 'N/A')}
Total threats: {data.get('total_threats', 0)}
By mode: proximity={counts.get('proximity', 0)}, signal={counts.get('signal', 0)}, anomaly={counts.get('anomaly', 0)}, orbital_similarity={counts.get('orbital_similarity', 0)}, geo_loiter={counts.get('geo_loiter', 0)}

TOP THREATS:
{threats_text if threats_text else "Nessuna minaccia rilevata / No threats detected"}

FLEET RISK (top 5):
{fleet_text if fleet_text else "No fleet risk data"}

Generate the threat scan report now. Keep it under 500 words."""


def what_if_scenario_prompt(data: dict[str, Any]) -> str:
    """Build the LLM prompt for a what-if scenario response."""
    scenario_type = data.get("scenario_type", "generic")
    params = data.get("parameters", {})
    impact = data.get("impact_assessment", {})
    recommendations = data.get("recommendations", [])

    params_text = "\n".join(f"- {k}: {v}" for k, v in params.items())
    impact_text = "\n".join(f"- {k}: {v}" for k, v in impact.items())
    recs_text = "\n".join(f"{i+1}. {r}" for i, r in enumerate(recommendations))

    scenario_labels = {
        "fragmentation": "Evento di frammentazione / Fragmentation Event",
        "solar_storm": "Tempesta solare / Solar Storm",
        "maneuver": "Simulazione manovra / Maneuver Simulation",
        "ground_station_loss": "Perdita stazione / Ground Station Loss",
        "generic": "Scenario generico / Generic Scenario",
    }
    label = scenario_labels.get(scenario_type, "Scenario")

    user_query = data.get("user_query", "")
    query_note = f"\nOriginal user query: {user_query}" if user_query else ""

    return f"""You are an SDA scenario analyst.
Produce a what-if analysis report for: {label}

FORMAT RULES:
- Start with scenario description in 1-2 sentences
- "Parametri / Parameters" section with simulation inputs
- "Valutazione impatto / Impact Assessment" section
- "Raccomandazioni / Recommendations" numbered list
- If the scenario is fragmentation, mention debris cloud persistence
- If solar storm, mention comm impact and drag
- If maneuver, mention fuel budget and new conjunction risk
- Be bilingual: Italian headers, English technical details
- Do NOT invent data beyond what is provided
{query_note}

SCENARIO TYPE: {scenario_type}

PARAMETERS:
{params_text}

IMPACT ASSESSMENT:
{impact_text}

RECOMMENDATIONS:
{recs_text}

Generate the scenario analysis now. Keep it under 400 words."""
