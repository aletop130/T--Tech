"""Chat command service — orchestrates backend services for SDA operator commands.

Implements: shift_brief, fleet_threat_scan, what_if_scenario.
Each method gathers data from multiple services in parallel and returns
structured results with Cesium actions for map visualization.
"""

from __future__ import annotations

import asyncio
import json
import re
from datetime import datetime, timezone
from typing import Any, Optional

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import get_logger
from app.services.threat_detection import ThreatDetectionService
from app.services.fleet_risk import FleetRiskService
from app.services.space_weather import SpaceWeatherService
from app.services.reentry_tracker import ReentryTrackerService
from app.services.maneuver_detection import ManeuverDetectionService
from app.services.incidents import IncidentService
from app.services.launch_correlation import LaunchCorrelationService
from app.services.adversary_tracking import AdversaryTrackingService
from app.services.collision_heatmap import fetch_socrates_data
from app.services.audit import AuditService

logger = get_logger(__name__)

# Reusable singleton for maneuver detection (no DB needed)
_maneuver_service = ManeuverDetectionService()


def _severity_order(level: str) -> int:
    """Map severity strings to numeric priority for sorting."""
    return {
        "critical": 0, "high": 1, "medium": 2,
        "moderate": 2, "low": 3, "info": 4, "nominal": 5,
    }.get(level.lower(), 6)


def _risk_label(score: float) -> str:
    if score >= 0.8:
        return "CRITICAL"
    if score >= 0.6:
        return "HIGH"
    if score >= 0.4:
        return "MEDIUM"
    return "LOW"


class ChatCommandService:
    """Executes structured SDA operator commands by calling backend services."""

    def __init__(self, db: AsyncSession, tenant_id: str):
        self.db = db
        self.tenant_id = tenant_id
        self.threat_svc = ThreatDetectionService(db)
        self.fleet_svc = FleetRiskService(db)
        self.weather_svc = SpaceWeatherService(db)
        self.reentry_svc = ReentryTrackerService(db)
        self.launch_svc = LaunchCorrelationService(db)
        self.adversary_svc = AdversaryTrackingService(db)
        self.audit_svc = AuditService(db)
        self.incident_svc = IncidentService(db, self.audit_svc)

    # ──────────────────────────────────────────────────────────────
    # 1. SHIFT BRIEF
    # ──────────────────────────────────────────────────────────────
    async def shift_brief(self) -> dict[str, Any]:
        """Gather data from 8 services and produce a prioritised shift briefing."""
        results: dict[str, Any] = {}
        errors: list[str] = []

        async def _safe(key: str, coro):
            try:
                results[key] = await coro
            except Exception as exc:
                logger.warning("shift_brief %s failed: %s", key, exc)
                errors.append(key)
                results[key] = None

        await asyncio.gather(
            _safe("fleet_risk", self.fleet_svc.compute_current_risk(self.tenant_id)),
            _safe("space_weather", self.weather_svc.get_impact()),
            _safe("reentries", self.reentry_svc.get_active_predictions(self.tenant_id)),
            _safe("maneuvers", _maneuver_service.get_recent_maneuvers(limit=10)),
            _safe("uncorrelated", self.launch_svc.get_uncorrelated_objects(self.tenant_id)),
            _safe("incidents", self._get_open_incidents()),
            _safe("proximity", self.threat_svc.detect_proximity_threats(self.tenant_id)),
            _safe("collision_heatmap", fetch_socrates_data()),
        )

        # Build prioritised items
        items: list[dict] = []

        # Proximity alerts
        proximity = results.get("proximity") or []
        for p in proximity:
            sev = p.get("severity", "nominal")
            if sev in ("critical", "high", "threatened"):
                items.append({
                    "priority": _severity_order("critical" if sev == "threatened" else sev),
                    "category": "PROXIMITY",
                    "severity": sev.upper(),
                    "summary": (
                        f"Proximity alert: {p.get('foreignObjectName', '?')} → "
                        f"{p.get('targetAssetName', '?')} "
                        f"(est. {p.get('estimatedDistanceKm', '?')} km)"
                    ),
                    "satellite_id": p.get("targetAssetId"),
                })

        # Fleet risk
        fleet_data = results.get("fleet_risk") or {}
        fleet_satellites = fleet_data.get("satellites", [])
        for sat in fleet_satellites[:10]:
            risk = sat.get("risk", 0)
            if risk >= 0.4:
                items.append({
                    "priority": _severity_order(_risk_label(risk).lower()),
                    "category": "FLEET_RISK",
                    "severity": _risk_label(risk),
                    "summary": (
                        f"{sat.get('name', '?')}: risk {risk:.0%} "
                        f"({', '.join(sat.get('components', {}).keys())})"
                    ),
                    "satellite_id": sat.get("satellite_id"),
                })

        # Space weather
        weather = results.get("space_weather")
        if weather:
            conditions = getattr(weather, "current_conditions", None) or weather
            kp = getattr(conditions, "kp_index", None)
            if kp is None and isinstance(conditions, dict):
                kp = conditions.get("kp_index", 0)
            if kp is None:
                kp = 0
            storm = getattr(conditions, "storm_level", None)
            if storm is None and isinstance(conditions, dict):
                storm = conditions.get("storm_level", "NONE")
            storm_str = storm.value if hasattr(storm, "value") else str(storm)
            sev = "high" if kp >= 7 else ("medium" if kp >= 5 else "info")
            items.append({
                "priority": _severity_order(sev),
                "category": "SPACE_WEATHER",
                "severity": sev.upper(),
                "summary": f"Kp={kp}, storm={storm_str}, F10.7={getattr(conditions, 'f10_7', '?')}",
            })
            affected_count = getattr(weather, "total_affected", 0)
            if affected_count:
                items.append({
                    "priority": _severity_order(sev),
                    "category": "LEO_DRAG",
                    "severity": sev.upper(),
                    "summary": f"{affected_count} LEO satellites with increased drag",
                })

        # Reentries
        reentries = results.get("reentries") or []
        for r in reentries[:5]:
            risk = r.get("risk_level", "low")
            items.append({
                "priority": _severity_order(risk),
                "category": "REENTRY",
                "severity": risk.upper(),
                "summary": (
                    f"{r.get('name', '?')} (NORAD {r.get('norad_id', '?')}) "
                    f"reentry ~{r.get('predicted_epoch', '?')}"
                ),
            })

        # Maneuvers
        maneuver_data = results.get("maneuvers") or {}
        for m in (maneuver_data.get("maneuvers") or [])[:5]:
            items.append({
                "priority": _severity_order("medium"),
                "category": "MANEUVER",
                "severity": "MEDIUM",
                "summary": (
                    f"{m.get('satellite_name', '?')}: {m.get('maneuver_type', '?')} "
                    f"Δv={m.get('estimated_delta_v_ms', 0):.1f} m/s"
                ),
            })

        # Uncorrelated objects
        uncorrelated = results.get("uncorrelated") or {}
        uco_list = uncorrelated.get("uncorrelated_objects") or []
        if uco_list:
            items.append({
                "priority": _severity_order("medium"),
                "category": "UNCORRELATED",
                "severity": "MEDIUM",
                "summary": f"{len(uco_list)} uncorrelated objects detected",
            })

        # Open incidents
        incidents = results.get("incidents") or []
        for inc in incidents[:5]:
            sev = getattr(inc, "severity", "low")
            sev_str = sev.value if hasattr(sev, "value") else str(sev)
            items.append({
                "priority": _severity_order(sev_str),
                "category": "INCIDENT",
                "severity": sev_str.upper(),
                "summary": (
                    f"[{getattr(inc, 'incident_type', '?')}] "
                    f"{getattr(inc, 'title', '?')}"
                ),
            })

        items.sort(key=lambda x: x["priority"])

        # Cesium actions: fly to highest-risk satellite
        cesium_actions = []
        top_sat = next((i for i in items if i.get("satellite_id")), None)
        if top_sat:
            cesium_actions.append({
                "type": "cesium.flyTo",
                "payload": {"entityId": f"satellite-{top_sat['satellite_id']}", "duration": 2.0},
            })
            cesium_actions.append({
                "type": "showThreatRadius",
                "payload": {"satellite_id": top_sat["satellite_id"], "radius_km": 10, "color": "#FF1744"},
            })

        return {
            "command": "shift_brief",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "items": items,
            "summary_counts": {
                "critical": sum(1 for i in items if i["severity"] == "CRITICAL"),
                "high": sum(1 for i in items if i["severity"] == "HIGH"),
                "medium": sum(1 for i in items if i["severity"] == "MEDIUM"),
                "low": sum(1 for i in items if i["severity"] in ("LOW", "INFO")),
            },
            "errors": errors,
            "cesium_actions": cesium_actions,
        }

    async def _get_open_incidents(self):
        try:
            incidents, _ = await self.incident_svc.list_incidents(
                tenant_id=self.tenant_id, status="open", page_size=10,
            )
            return incidents
        except Exception:
            return []

    # ──────────────────────────────────────────────────────────────
    # 2. FLEET THREAT SCAN
    # ──────────────────────────────────────────────────────────────
    async def fleet_threat_scan(self) -> dict[str, Any]:
        """Run all 5 threat modes + fleet risk and return top threats with recommendations."""
        results: dict[str, Any] = {}
        errors: list[str] = []

        async def _safe(key: str, coro):
            try:
                results[key] = await coro
            except Exception as exc:
                logger.warning("fleet_threat_scan %s failed: %s", key, exc)
                errors.append(key)
                results[key] = None

        await asyncio.gather(
            _safe("proximity", self.threat_svc.detect_proximity_threats(self.tenant_id)),
            _safe("signal", self.threat_svc.detect_signal_threats(self.tenant_id)),
            _safe("anomaly", self.threat_svc.detect_anomaly_threats(self.tenant_id)),
            _safe("orbital_similarity", self.threat_svc.detect_orbital_similarity(self.tenant_id)),
            _safe("geo_loiter", self.threat_svc.detect_geo_loiter(self.tenant_id)),
            _safe("fleet_risk", self.fleet_svc.compute_current_risk(self.tenant_id)),
        )

        # Aggregate all threats into a unified list
        threats: list[dict] = []

        for p in (results.get("proximity") or []):
            threats.append({
                "mode": "PROXIMITY",
                "severity": p.get("severity", "nominal").upper(),
                "risk_score": p.get("confidence", 0),
                "target": p.get("targetAssetName", "?"),
                "target_id": p.get("targetAssetId"),
                "source": p.get("foreignObjectName", "?"),
                "source_id": p.get("foreignObjectId"),
                "detail": f"Est. distance: {p.get('estimatedDistanceKm', '?')} km",
                "recommendation": "Monitor TCA; prepare avoidance maneuver if distance < 1 km",
            })

        for s in (results.get("signal") or []):
            threats.append({
                "mode": "SIGNAL",
                "severity": "HIGH" if s.get("interceptionProbability", 0) > 0.6 else "MEDIUM",
                "risk_score": s.get("interceptionProbability", 0),
                "target": s.get("targetLinkAssetName", "?"),
                "target_id": s.get("targetLinkAssetId"),
                "source": s.get("interceptorName", "?"),
                "source_id": s.get("interceptorId"),
                "detail": f"RF interception prob: {s.get('interceptionProbability', 0):.0%}",
                "recommendation": "Consider frequency hopping or link encryption upgrade",
            })

        for a in (results.get("anomaly") or []):
            threats.append({
                "mode": "ANOMALY",
                "severity": "HIGH" if a.get("confidence", 0) > 0.7 else "MEDIUM",
                "risk_score": a.get("confidence", 0),
                "target": a.get("satelliteName", "?"),
                "target_id": a.get("satelliteId"),
                "source": "behavioral analysis",
                "source_id": None,
                "detail": f"Anomaly: {a.get('anomaly_type', '?')} (conf {a.get('confidence', 0):.0%})",
                "recommendation": "Investigate behavior pattern; cross-reference with maneuver data",
            })

        for o in (results.get("orbital_similarity") or []):
            threats.append({
                "mode": "ORBITAL_SIMILARITY",
                "severity": "HIGH" if o.get("confidence", 0) > 0.7 else "MEDIUM",
                "risk_score": o.get("confidence", 0),
                "target": o.get("targetAssetName", "?"),
                "target_id": o.get("targetAssetId"),
                "source": o.get("foreignObjectName", "?"),
                "source_id": o.get("foreignObjectId"),
                "detail": f"Co-orbital shadow detected (conf {o.get('confidence', 0):.0%})",
                "recommendation": "Track co-orbital object; assess intent via maneuver history",
            })

        for g in (results.get("geo_loiter") or []):
            threats.append({
                "mode": "GEO_LOITER",
                "severity": "HIGH" if g.get("threatScore", 0) > 0.7 else "MEDIUM",
                "risk_score": g.get("threatScore", 0),
                "target": g.get("region", "GEO belt"),
                "target_id": None,
                "source": g.get("satelliteName", "?"),
                "source_id": g.get("satelliteId"),
                "detail": f"GEO loiter score: {g.get('threatScore', 0):.0%}",
                "recommendation": "Monitor station-keeping; compare with declared mission",
            })

        # Sort by risk
        threats.sort(key=lambda t: t["risk_score"], reverse=True)
        top_threats = threats[:10]

        # Fleet risk summary
        fleet_data = results.get("fleet_risk") or {}
        fleet_sats = fleet_data.get("satellites", [])
        fleet_sats.sort(key=lambda s: s.get("risk", 0), reverse=True)

        # Cesium actions: show threat radius + conjunction lines for top 3
        cesium_actions = []
        fly_to_done = False
        for t in top_threats[:3]:
            target_id = t.get("target_id")
            source_id = t.get("source_id")
            if target_id and not fly_to_done:
                cesium_actions.append({
                    "type": "cesium.flyTo",
                    "payload": {"entityId": f"satellite-{target_id}", "duration": 2.0},
                })
                fly_to_done = True
            if target_id:
                cesium_actions.append({
                    "type": "showThreatRadius",
                    "payload": {"satellite_id": target_id, "radius_km": 10, "color": "#FF1744"},
                })
            if target_id and source_id:
                cesium_actions.append({
                    "type": "showConjunctionLine",
                    "payload": {
                        "satellite_a_id": target_id,
                        "satellite_b_id": source_id,
                        "color": "#FF1744",
                        "label": t["mode"],
                    },
                })

        return {
            "command": "fleet_threat_scan",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "threats": top_threats,
            "total_threats": len(threats),
            "threat_counts": {
                "proximity": len(results.get("proximity") or []),
                "signal": len(results.get("signal") or []),
                "anomaly": len(results.get("anomaly") or []),
                "orbital_similarity": len(results.get("orbital_similarity") or []),
                "geo_loiter": len(results.get("geo_loiter") or []),
            },
            "fleet_risk_top5": fleet_sats[:5],
            "errors": errors,
            "cesium_actions": cesium_actions,
        }

    # ──────────────────────────────────────────────────────────────
    # 3. WHAT-IF SCENARIO
    # ──────────────────────────────────────────────────────────────
    async def what_if_scenario(self, message: str) -> dict[str, Any]:
        """Interpret and simulate a what-if scenario from the user message."""
        scenario_type = self._detect_scenario_type(message)

        if scenario_type == "fragmentation":
            return await self._what_if_fragmentation(message)
        elif scenario_type == "solar_storm":
            return await self._what_if_solar_storm(message)
        elif scenario_type == "maneuver":
            return await self._what_if_maneuver(message)
        elif scenario_type == "ground_station_loss":
            return await self._what_if_ground_station_loss(message)
        else:
            return await self._what_if_generic(message)

    def _detect_scenario_type(self, message: str) -> str:
        msg = message.lower()
        if any(w in msg for w in ("framment", "fragment", "breakup", "explosion", "esplod", "disintegr")):
            return "fragmentation"
        if any(w in msg for w in ("solar storm", "tempesta solare", "kp", "geomagnetic", "geomagnetica")):
            return "solar_storm"
        if any(w in msg for w in ("manovra", "maneuver", "delta-v", "delta v", "burn", "thrust")):
            return "maneuver"
        if any(w in msg for w in ("ground station", "stazione", "antenna", "downlink", "perdita")):
            return "ground_station_loss"
        return "generic"

    async def _what_if_fragmentation(self, message: str) -> dict[str, Any]:
        """Simulate a fragmentation event."""
        # Extract altitude hint from message
        alt_match = re.search(r"(\d{3,5})\s*km", message)
        altitude_km = int(alt_match.group(1)) if alt_match else 800

        # Estimate fragments based on altitude and typical events
        fragment_count = 500 if altitude_km > 600 else 200
        debris_lifetime_years = max(1, (altitude_km - 200) / 100)

        # Get current collision heatmap for context
        try:
            socrates = await fetch_socrates_data()
        except Exception:
            socrates = []

        # Compute altitude band impact
        band_low = (altitude_km // 100) * 100
        band_high = band_low + 200
        existing_pairs_in_band = sum(
            1 for p in socrates
            if band_low <= (p.get("altitude_1_km") or 0) <= band_high
        )

        cesium_actions = [
            {
                "type": "showDebrisCloud",
                "payload": {
                    "center_altitude_km": altitude_km,
                    "fragment_count": fragment_count,
                    "spread_km": 50,
                    "color": "#FF6D00",
                },
            },
            {
                "type": "showRiskHeatmap",
                "payload": {
                    "satellite_id": "fragmentation-scenario",
                    "risk_level": "critical",
                    "probability": 0.9,
                },
            },
        ]

        return {
            "command": "what_if_scenario",
            "scenario_type": "fragmentation",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "parameters": {
                "altitude_km": altitude_km,
                "estimated_fragments": fragment_count,
                "debris_lifetime_years": round(debris_lifetime_years, 1),
                "altitude_band": f"{band_low}-{band_high} km",
                "existing_conjunction_pairs_in_band": existing_pairs_in_band,
                "new_conjunction_risk_increase": f"+{fragment_count * 2}%",
            },
            "impact_assessment": {
                "immediate": f"{fragment_count} fragments generated in {band_low}-{band_high} km band",
                "short_term": f"Collision probability in band increases ~{fragment_count * 2}% for 30 days",
                "long_term": f"Debris cloud persists ~{debris_lifetime_years:.0f} years at {altitude_km} km",
            },
            "recommendations": [
                "Issue COLA (Collision On Launch Assessment) advisory for upcoming launches",
                f"Increase conjunction screening frequency for {band_low}-{band_high} km assets",
                "Prepare avoidance maneuvers for allied LEO assets in affected band",
            ],
            "cesium_actions": cesium_actions,
        }

    async def _what_if_solar_storm(self, message: str) -> dict[str, Any]:
        """Simulate increased solar activity impact."""
        kp_match = re.search(r"kp\s*[=:]?\s*(\d+)", message.lower())
        target_kp = int(kp_match.group(1)) if kp_match else 7

        # Get current weather as baseline
        try:
            current = await self.weather_svc.get_impact()
            current_kp = getattr(
                getattr(current, "current_conditions", None), "kp_index", 3
            )
            affected_sats = getattr(current, "affected_satellites", [])
        except Exception:
            current_kp = 3
            affected_sats = []

        drag_increase_factor = max(1, (target_kp - 4) ** 2) / max(1, (current_kp - 4) ** 2) if current_kp > 4 else (target_kp - 4) ** 2

        cesium_actions = []
        at_risk_names = []
        for sat in affected_sats[:5]:
            name = getattr(sat, "name", None) or sat.get("name", "?") if isinstance(sat, dict) else "?"
            at_risk_names.append(name)

        if at_risk_names:
            cesium_actions.append({
                "type": "showCoverageGaps",
                "payload": {
                    "scenario": "solar_storm",
                    "kp": target_kp,
                    "affected_count": len(affected_sats),
                },
            })

        return {
            "command": "what_if_scenario",
            "scenario_type": "solar_storm",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "parameters": {
                "simulated_kp": target_kp,
                "current_kp": current_kp,
                "storm_category": "G5-Extreme" if target_kp >= 9 else "G4-Severe" if target_kp >= 8 else "G3-Strong" if target_kp >= 7 else "G2-Moderate" if target_kp >= 6 else "G1-Minor",
            },
            "impact_assessment": {
                "drag_increase": f"Atmospheric drag increases ~{drag_increase_factor:.0f}x vs current",
                "affected_leo_count": len(affected_sats),
                "at_risk_satellites": at_risk_names[:10],
                "comm_impact": "HF blackout likely" if target_kp >= 7 else "Possible HF degradation" if target_kp >= 5 else "Minimal",
            },
            "recommendations": [
                "Increase orbit determination cadence for LEO assets < 600 km",
                "Pre-position avoidance maneuver budgets for drag compensation",
                "Alert ground stations for potential comm degradation",
            ] + (["Consider raising perigee for critically low assets"] if target_kp >= 7 else []),
            "cesium_actions": cesium_actions,
        }

    async def _what_if_maneuver(self, message: str) -> dict[str, Any]:
        """Simulate a maneuver and check for new conjunctions."""
        dv_match = re.search(r"(\d+(?:\.\d+)?)\s*m/s", message)
        delta_v = float(dv_match.group(1)) if dv_match else 1.0

        # Get current proximity data to check what new conjunctions might occur
        try:
            proximity = await self.threat_svc.detect_proximity_threats(self.tenant_id)
        except Exception:
            proximity = []

        # Simple estimate: maneuver changes altitude by ~delta_v * 0.5 km
        altitude_change_km = delta_v * 0.5
        new_band = True  # simplified

        cesium_actions = [
            {
                "type": "showGroundTrack",
                "payload": {
                    "scenario": "post_maneuver",
                    "delta_v_ms": delta_v,
                    "altitude_change_km": altitude_change_km,
                },
            },
        ]

        return {
            "command": "what_if_scenario",
            "scenario_type": "maneuver",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "parameters": {
                "delta_v_ms": delta_v,
                "estimated_altitude_change_km": round(altitude_change_km, 1),
            },
            "impact_assessment": {
                "fuel_cost": f"{delta_v} m/s",
                "current_proximity_events": len(proximity),
                "potential_new_conjunctions": "Screening required post-maneuver",
                "orbit_regime_change": new_band,
            },
            "recommendations": [
                "Run full conjunction screening 72h post-maneuver",
                "Verify TLE update propagated to all tracking sources",
                f"Budget ~{delta_v} m/s fuel consumption",
            ],
            "cesium_actions": cesium_actions,
        }

    async def _what_if_ground_station_loss(self, message: str) -> dict[str, Any]:
        """Simulate loss of a ground station and assess coverage impact."""
        from app.services.ontology import OntologyService
        ontology = OntologyService(self.db)

        # Try to extract station name from message
        stations, _ = await ontology.list_ground_stations(tenant_id=self.tenant_id, page_size=50)
        lost_station = None
        msg_lower = message.lower()
        for gs in stations:
            if gs.name.lower() in msg_lower:
                lost_station = gs
                break
        if not lost_station and stations:
            lost_station = stations[0]

        remaining = len(stations) - 1 if lost_station else len(stations)

        cesium_actions = []
        if lost_station:
            cesium_actions.append({
                "type": "showCoverageGaps",
                "payload": {
                    "scenario": "ground_station_loss",
                    "lost_station": lost_station.name,
                    "latitude": lost_station.latitude,
                    "longitude": lost_station.longitude,
                },
            })
            cesium_actions.append({
                "type": "cesium.flyTo",
                "payload": {
                    "longitude": lost_station.longitude,
                    "latitude": lost_station.latitude,
                    "altitude": 5000000,
                    "duration": 2.0,
                },
            })

        return {
            "command": "what_if_scenario",
            "scenario_type": "ground_station_loss",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "parameters": {
                "lost_station": lost_station.name if lost_station else "unknown",
                "remaining_stations": remaining,
                "total_stations": len(stations),
            },
            "impact_assessment": {
                "coverage_reduction": f"~{100 // max(len(stations), 1)}% coverage gap",
                "contact_window_impact": "Reduced pass opportunities; increased latency for commanding",
                "data_downlink": "Reduced throughput; may need to prioritize critical telemetry",
            },
            "recommendations": [
                "Reroute telemetry to nearest operational station",
                "Increase data buffer onboard affected satellites",
                "Schedule additional passes through remaining stations",
            ],
            "cesium_actions": cesium_actions,
        }

    async def _what_if_generic(self, message: str) -> dict[str, Any]:
        """Generic what-if: provide context data for LLM to reason over."""
        results: dict[str, Any] = {}

        async def _safe(key, coro):
            try:
                results[key] = await coro
            except Exception:
                results[key] = None

        await asyncio.gather(
            _safe("fleet_risk", self.fleet_svc.compute_current_risk(self.tenant_id)),
            _safe("proximity", self.threat_svc.detect_proximity_threats(self.tenant_id)),
            _safe("space_weather", self.weather_svc.get_current_conditions()),
        )

        return {
            "command": "what_if_scenario",
            "scenario_type": "generic",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "context": {
                "fleet_risk_summary": _summarize_fleet(results.get("fleet_risk")),
                "active_proximity_events": len(results.get("proximity") or []),
                "space_weather_kp": getattr(results.get("space_weather"), "kp_index", "?"),
            },
            "user_query": message,
            "cesium_actions": [],
        }


def _summarize_fleet(fleet_data) -> str:
    if not fleet_data:
        return "No fleet data available"
    sats = fleet_data.get("satellites", [])
    if not sats:
        return "No satellites in fleet"
    high_risk = sum(1 for s in sats if s.get("risk", 0) >= 0.6)
    return f"{len(sats)} satellites tracked, {high_risk} at HIGH+ risk"
