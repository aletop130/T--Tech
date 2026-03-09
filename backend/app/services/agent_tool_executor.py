"""AEGIS Agent Tool Executor - dispatches tool calls to backend services."""
import json
from typing import Any, Optional
from sqlalchemy import select, and_, or_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from app.core.logging import get_logger
from app.services.ontology import OntologyService
from app.db.models.ontology import (
    Satellite, Orbit, GroundStation, ConjunctionEvent,
    SpaceWeatherEvent, ObjectType, ConjunctionRisk
)
from app.db.models.incidents import ProximityEvent

logger = get_logger(__name__)

# Max tokens per tool result to prevent context overflow
MAX_RESULT_TOKENS = 2000
MAX_RESULT_CHARS = MAX_RESULT_TOKENS * 4  # approximate


def truncate_result(result: Any) -> str:
    """Truncate tool result to prevent context overflow."""
    text = json.dumps(result, default=str)
    if len(text) > MAX_RESULT_CHARS:
        text = text[:MAX_RESULT_CHARS] + '... [truncated]'
    return text


class AgentToolExecutor:
    def __init__(self, db: AsyncSession, ontology: OntologyService):
        self.db = db
        self.ontology = ontology

    async def execute(self, tool_name: str, args: dict, tenant_id: str) -> dict:
        """Execute a tool by name and return results."""
        handler = getattr(self, f'_handle_{tool_name}', None)
        if not handler:
            return {"error": f"Unknown tool: {tool_name}"}
        try:
            result = await handler(args, tenant_id)
            return result
        except Exception as e:
            logger.error(f"Tool execution error: {tool_name}", error=str(e))
            return {"error": str(e)}

    # ================================================================
    # Query handlers
    # ================================================================

    async def _handle_query_satellites(self, args: dict, tenant_id: str) -> dict:
        """Query satellites with optional filters."""
        try:
            search = args.get("search")
            object_type = args.get("object_type")
            is_active = args.get("is_active")
            limit = args.get("limit", 20)

            satellites, total = await self.ontology.list_satellites(
                tenant_id=tenant_id,
                search=search,
                object_type=object_type,
                is_active=is_active,
                page=1,
                page_size=limit,
            )

            results = []
            for sat in satellites:
                results.append({
                    "id": sat.id,
                    "name": sat.name,
                    "norad_id": sat.norad_id,
                    "object_type": sat.object_type,
                    "country": sat.country,
                    "is_active": sat.is_active,
                    "faction": sat.faction,
                })

            return {"satellites": results, "total": total}
        except Exception as e:
            logger.error("query_satellites failed", error=str(e))
            return {"error": str(e)}

    async def _handle_query_satellite_detail(self, args: dict, tenant_id: str) -> dict:
        """Get full satellite details including orbit info."""
        try:
            satellite_id = args.get("satellite_id")
            if not satellite_id:
                return {"error": "satellite_id is required"}

            sat = await self.ontology.get_satellite(satellite_id, tenant_id=tenant_id)
            if not sat:
                return {"error": f"Satellite {satellite_id} not found"}

            result = {
                "id": sat.id,
                "name": sat.name,
                "norad_id": sat.norad_id,
                "international_designator": sat.international_designator,
                "object_type": sat.object_type,
                "country": sat.country,
                "operator": sat.operator,
                "is_active": sat.is_active,
                "launch_date": str(sat.launch_date) if sat.launch_date else None,
                "decay_date": str(sat.decay_date) if sat.decay_date else None,
                "mass_kg": sat.mass_kg,
                "rcs_m2": sat.rcs_m2,
                "classification": sat.classification,
                "tags": sat.tags,
                "faction": sat.faction,
                "description": sat.description,
            }

            # Fetch latest orbit
            orbit = await self.ontology.get_latest_orbit(satellite_id, tenant_id=tenant_id)
            if orbit:
                result["orbit"] = {
                    "epoch": str(orbit.epoch) if orbit.epoch else None,
                    "semi_major_axis_km": orbit.semi_major_axis_km,
                    "eccentricity": orbit.eccentricity,
                    "inclination_deg": orbit.inclination_deg,
                    "raan_deg": orbit.raan_deg,
                    "arg_perigee_deg": orbit.arg_perigee_deg,
                    "mean_anomaly_deg": orbit.mean_anomaly_deg,
                    "mean_motion_rev_day": orbit.mean_motion_rev_day,
                    "orbit_type": orbit.orbit_type,
                    "period_minutes": orbit.period_minutes,
                    "apogee_km": orbit.apogee_km,
                    "perigee_km": orbit.perigee_km,
                }
            else:
                result["orbit"] = None

            return result
        except Exception as e:
            logger.error("query_satellite_detail failed", error=str(e))
            return {"error": str(e)}

    async def _handle_query_conjunctions(self, args: dict, tenant_id: str) -> dict:
        """Query conjunction events with filters."""
        try:
            satellite_id = args.get("satellite_id")
            risk_level = args.get("risk_level")
            limit = args.get("limit", 10)

            conditions = [ConjunctionEvent.tenant_id == tenant_id]

            if satellite_id:
                conditions.append(
                    or_(
                        ConjunctionEvent.primary_object_id == satellite_id,
                        ConjunctionEvent.secondary_object_id == satellite_id,
                    )
                )
            if risk_level:
                conditions.append(ConjunctionEvent.risk_level == risk_level)

            stmt = (
                select(ConjunctionEvent)
                .options(
                    selectinload(ConjunctionEvent.primary_object),
                    selectinload(ConjunctionEvent.secondary_object),
                )
                .where(and_(*conditions))
                .order_by(ConjunctionEvent.tca.desc())
                .limit(limit)
            )

            result = await self.db.execute(stmt)
            rows = result.scalars().unique().all()

            conjunctions = []
            for evt in rows:
                primary_name = evt.primary_object.name if evt.primary_object else "Unknown"
                secondary_name = evt.secondary_object.name if evt.secondary_object else "Unknown"
                conjunctions.append({
                    "id": evt.id,
                    "primary_object_name": primary_name,
                    "secondary_object_name": secondary_name,
                    "tca": str(evt.tca) if evt.tca else None,
                    "miss_distance_km": evt.miss_distance_km,
                    "risk_level": evt.risk_level,
                    "collision_probability": evt.collision_probability,
                })

            return {"conjunctions": conjunctions, "count": len(conjunctions)}
        except Exception as e:
            logger.error("query_conjunctions failed", error=str(e))
            return {"error": str(e)}

    async def _handle_query_debris(self, args: dict, tenant_id: str) -> dict:
        """Query debris objects with optional altitude filtering."""
        try:
            limit = args.get("limit", 20)
            min_altitude = args.get("min_altitude")
            max_altitude = args.get("max_altitude")

            conditions = [
                Satellite.tenant_id == tenant_id,
                Satellite.object_type == ObjectType.DEBRIS.value,
            ]

            if min_altitude is not None or max_altitude is not None:
                # Join with Orbit for altitude filtering
                stmt = (
                    select(Satellite)
                    .join(Orbit, Satellite.id == Orbit.satellite_id)
                    .where(and_(*conditions))
                )
                if min_altitude is not None:
                    stmt = stmt.where(Orbit.semi_major_axis_km >= (min_altitude + 6371))
                if max_altitude is not None:
                    stmt = stmt.where(Orbit.semi_major_axis_km <= (max_altitude + 6371))
                stmt = stmt.order_by(Satellite.name).limit(limit)
            else:
                stmt = (
                    select(Satellite)
                    .where(and_(*conditions))
                    .order_by(Satellite.name)
                    .limit(limit)
                )

            result = await self.db.execute(stmt)
            rows = result.scalars().all()

            debris = []
            for sat in rows:
                debris.append({
                    "id": sat.id,
                    "name": sat.name,
                    "norad_id": sat.norad_id,
                    "country": sat.country,
                })

            return {"debris": debris, "count": len(debris)}
        except Exception as e:
            logger.error("query_debris failed", error=str(e))
            return {"error": str(e)}

    async def _handle_query_threats(self, args: dict, tenant_id: str) -> dict:
        """Query threats using ThreatDetectionService."""
        try:
            from app.services.threat_detection import ThreatDetectionService

            threat_type = args.get("threat_type")
            threat_service = ThreatDetectionService(self.db)

            if threat_type == "proximity":
                threats = await threat_service.detect_proximity_threats(tenant_id)
            elif threat_type == "signal":
                threats = await threat_service.detect_signal_threats(tenant_id)
            elif threat_type == "anomaly":
                threats = await threat_service.detect_anomaly_threats(tenant_id)
            elif threat_type == "orbital_similarity":
                threats = await threat_service.detect_orbital_similarity(tenant_id)
            elif threat_type == "geo_loiter":
                threats = await threat_service.detect_geo_loiter(tenant_id)
            else:
                # Run all threat detections and combine
                all_threats = []
                proximity = await threat_service.detect_proximity_threats(tenant_id)
                all_threats.extend([{**t, "threat_category": "proximity"} for t in proximity])

                signal = await threat_service.detect_signal_threats(tenant_id)
                all_threats.extend([{**t, "threat_category": "signal"} for t in signal])

                anomaly = await threat_service.detect_anomaly_threats(tenant_id)
                all_threats.extend([{**t, "threat_category": "anomaly"} for t in anomaly])

                orbital_sim = await threat_service.detect_orbital_similarity(tenant_id)
                all_threats.extend([{**t, "threat_category": "orbital_similarity"} for t in orbital_sim])

                geo_loiter = await threat_service.detect_geo_loiter(tenant_id)
                all_threats.extend([{**t, "threat_category": "geo_loiter"} for t in geo_loiter])

                threats = all_threats

            return {"threats": threats, "count": len(threats)}
        except Exception as e:
            logger.error("query_threats failed", error=str(e))
            return {"error": str(e)}

    async def _handle_query_ground_stations(self, args: dict, tenant_id: str) -> dict:
        """Query ground stations with optional search filter."""
        try:
            search = args.get("search")
            limit = args.get("limit", 20)

            stations, total = await self.ontology.list_ground_stations(
                tenant_id=tenant_id,
                page=1,
                page_size=limit,
            )

            results = []
            for gs in stations:
                # Apply search filter if provided
                if search and search.lower() not in (gs.name or "").lower():
                    continue
                results.append({
                    "id": gs.id,
                    "name": gs.name,
                    "latitude": gs.latitude,
                    "longitude": gs.longitude,
                    "coverage_radius_km": gs.altitude_m,  # approximate
                })

            if search:
                results = results[:limit]

            return {"ground_stations": results, "total": len(results)}
        except Exception as e:
            logger.error("query_ground_stations failed", error=str(e))
            return {"error": str(e)}

    async def _handle_query_incidents(self, args: dict, tenant_id: str) -> dict:
        """Query recent incidents."""
        try:
            from app.services.incidents import IncidentService
            from app.services.audit import AuditService

            audit = AuditService(self.db)
            incident_service = IncidentService(self.db, audit)

            status = args.get("status")
            severity = args.get("severity")
            limit = args.get("limit", 20)

            incidents, total = await incident_service.list_incidents(
                tenant_id=tenant_id,
                status=status,
                severity=severity,
                page=1,
                page_size=limit,
            )

            results = []
            for inc in incidents:
                results.append({
                    "id": inc.id,
                    "title": inc.title,
                    "description": inc.description,
                    "incident_type": inc.incident_type.value if inc.incident_type else None,
                    "severity": inc.severity.value if inc.severity else None,
                    "status": inc.status.value if inc.status else None,
                    "detected_at": str(inc.detected_at) if inc.detected_at else None,
                    "assigned_to": inc.assigned_to,
                    "priority": inc.priority,
                })

            return {"incidents": results, "total": total}
        except Exception as e:
            logger.error("query_incidents failed", error=str(e))
            return {"error": str(e)}

    async def _handle_query_space_weather(self, args: dict, tenant_id: str) -> dict:
        """Query space weather events."""
        try:
            limit = args.get("limit", 10)

            stmt = (
                select(SpaceWeatherEvent)
                .where(SpaceWeatherEvent.tenant_id == tenant_id)
                .order_by(SpaceWeatherEvent.start_time.desc())
                .limit(limit)
            )

            result = await self.db.execute(stmt)
            rows = result.scalars().all()

            events = []
            for evt in rows:
                events.append({
                    "id": evt.id,
                    "event_type": evt.event_type,
                    "kp_index": evt.kp_index,
                    "dst_index": evt.dst_index,
                    "solar_wind_speed": evt.solar_wind_speed,
                    "severity": evt.severity,
                    "event_time": str(evt.start_time) if evt.start_time else None,
                })

            return {"space_weather_events": events, "count": len(events)}
        except Exception as e:
            logger.error("query_space_weather failed", error=str(e))
            return {"error": str(e)}

    async def _handle_query_proximity_alerts(self, args: dict, tenant_id: str) -> dict:
        """Query active proximity alerts ordered by threat score."""
        try:
            limit = args.get("limit", 10)

            stmt = (
                select(ProximityEvent)
                .options(
                    selectinload(ProximityEvent.primary_satellite),
                    selectinload(ProximityEvent.secondary_satellite),
                )
                .where(
                    and_(
                        ProximityEvent.tenant_id == tenant_id,
                        ProximityEvent.status == "active",
                    )
                )
                .order_by(ProximityEvent.threat_score.desc())
                .limit(limit)
            )

            result = await self.db.execute(stmt)
            rows = result.scalars().unique().all()

            alerts = []
            for evt in rows:
                primary_name = evt.primary_satellite.name if evt.primary_satellite else "Unknown"
                secondary_name = evt.secondary_satellite.name if evt.secondary_satellite else "Unknown"
                alerts.append({
                    "id": evt.id,
                    "primary_name": primary_name,
                    "secondary_name": secondary_name,
                    "current_distance_km": evt.current_distance_km,
                    "threat_score": evt.threat_score,
                    "detection_time": str(evt.start_time) if evt.start_time else None,
                })

            return {"proximity_alerts": alerts, "count": len(alerts)}
        except Exception as e:
            logger.error("query_proximity_alerts failed", error=str(e))
            return {"error": str(e)}

    async def _handle_get_scene_state(self, args: dict, tenant_id: str) -> dict:
        """Return scene state info (provided via system prompt from frontend)."""
        return {
            "status": "scene_state_from_frontend",
            "note": "Scene state is provided in the system prompt",
        }

    # ================================================================
    # Physics tool handlers (with graceful fallback stubs)
    # ================================================================

    async def _handle_propagate_orbit(self, args: dict, tenant_id: str) -> dict:
        """Propagate satellite orbit using SGP4."""
        try:
            from app.physics.propagator import propagate_tle

            satellite_id = args.get("satellite_id")
            if not satellite_id:
                return {"error": "satellite_id is required"}

            sat = await self.ontology.get_satellite(satellite_id, tenant_id=tenant_id)
            if not sat:
                return {"error": f"Satellite {satellite_id} not found"}

            orbit = await self.ontology.get_latest_orbit(satellite_id, tenant_id=tenant_id)
            if not orbit or not orbit.tle_line1 or not orbit.tle_line2:
                return {
                    "status": "no_tle_available",
                    "satellite_id": satellite_id,
                    "satellite_name": sat.name,
                    "note": "No TLE data available for propagation",
                }

            from datetime import datetime, timedelta
            duration_hours = args.get("duration_hours", 24)
            step_minutes = args.get("step_minutes", 10)
            now = datetime.utcnow()
            epochs = [
                now + timedelta(minutes=i * step_minutes)
                for i in range(int(duration_hours * 60 / step_minutes))
            ]

            states = propagate_tle(
                (orbit.tle_line1, orbit.tle_line2),
                epochs,
            )

            # Return a summary rather than full ephemeris to keep result small
            return {
                "status": "propagated",
                "satellite_id": satellite_id,
                "satellite_name": sat.name,
                "epoch_start": str(epochs[0]),
                "epoch_end": str(epochs[-1]),
                "num_points": len(epochs),
                "initial_position_km": states[0, :3].tolist() if len(states) > 0 else None,
                "initial_velocity_kms": states[0, 3:6].tolist() if len(states) > 0 else None,
                "final_position_km": states[-1, :3].tolist() if len(states) > 0 else None,
                "final_velocity_kms": states[-1, 3:6].tolist() if len(states) > 0 else None,
            }
        except ImportError:
            return {
                "status": "physics_module_unavailable",
                "satellite_id": args.get("satellite_id"),
                "note": "Orbit propagation module not available in this environment",
            }
        except Exception as e:
            logger.error("propagate_orbit failed", error=str(e))
            return {
                "status": "error",
                "satellite_id": args.get("satellite_id"),
                "error": str(e),
            }

    async def _handle_compute_conjunction_risk(self, args: dict, tenant_id: str) -> dict:
        """Compute conjunction risk between two objects."""
        try:
            from app.physics.screening import screen_conjunctions

            primary_id = args.get("primary_id")
            secondary_id = args.get("secondary_id")
            if not primary_id or not secondary_id:
                return {"error": "primary_id and secondary_id are required"}

            primary_orbit = await self.ontology.get_latest_orbit(primary_id, tenant_id=tenant_id)
            secondary_orbit = await self.ontology.get_latest_orbit(secondary_id, tenant_id=tenant_id)

            if (not primary_orbit or not primary_orbit.tle_line1 or not primary_orbit.tle_line2 or
                    not secondary_orbit or not secondary_orbit.tle_line1 or not secondary_orbit.tle_line2):
                return {
                    "status": "insufficient_tle_data",
                    "primary_id": primary_id,
                    "secondary_id": secondary_id,
                    "note": "TLE data missing for one or both objects",
                }

            candidates = screen_conjunctions(
                primary_tle=(primary_orbit.tle_line1, primary_orbit.tle_line2),
                catalog=[(secondary_orbit.tle_line1, secondary_orbit.tle_line2)],
            )

            if candidates:
                c = candidates[0]
                return {
                    "status": "conjunction_detected",
                    "primary_id": primary_id,
                    "secondary_id": secondary_id,
                    "min_distance_km": c.min_distance_km,
                    "tca": str(c.tca),
                }
            else:
                return {
                    "status": "no_conjunction",
                    "primary_id": primary_id,
                    "secondary_id": secondary_id,
                    "note": "No conjunction detected within screening window",
                }
        except ImportError:
            return {
                "status": "physics_module_unavailable",
                "primary_id": args.get("primary_id"),
                "secondary_id": args.get("secondary_id"),
                "note": "Screening module not available in this environment",
            }
        except Exception as e:
            logger.error("compute_conjunction_risk failed", error=str(e))
            return {
                "status": "error",
                "primary_id": args.get("primary_id"),
                "secondary_id": args.get("secondary_id"),
                "error": str(e),
            }

    async def _handle_compute_coverage(self, args: dict, tenant_id: str) -> dict:
        """Compute satellite ground footprint / coverage area."""
        try:
            from app.physics.footprint import calculate_satellite_footprint

            altitude_km = args.get("altitude_km")
            min_elevation_deg = args.get("min_elevation_deg", 10.0)

            if altitude_km is None:
                # Try to get from satellite
                satellite_id = args.get("satellite_id")
                if satellite_id:
                    orbit = await self.ontology.get_latest_orbit(satellite_id, tenant_id=tenant_id)
                    if orbit and orbit.apogee_km and orbit.perigee_km:
                        altitude_km = (orbit.apogee_km + orbit.perigee_km) / 2.0
                    elif orbit and orbit.semi_major_axis_km:
                        altitude_km = orbit.semi_major_axis_km - 6371.0

            if altitude_km is None:
                return {
                    "status": "missing_altitude",
                    "note": "Provide altitude_km or a valid satellite_id with orbit data",
                }

            fp = calculate_satellite_footprint(
                altitude_km=altitude_km,
                min_elevation_deg=min_elevation_deg,
            )

            return {
                "status": "computed",
                "altitude_km": altitude_km,
                "radius_km": fp.radius_km,
                "area_km2": fp.area_km2,
                "swath_width_km": fp.swath_width_km,
                "central_angle_deg": fp.central_angle_deg,
                "earth_central_angle_deg": fp.earth_central_angle_deg,
            }
        except ImportError:
            return {
                "status": "physics_module_unavailable",
                "note": "Footprint module not available in this environment",
            }
        except Exception as e:
            logger.error("compute_coverage failed", error=str(e))
            return {
                "status": "error",
                "error": str(e),
            }

    async def _handle_estimate_maneuver_cost(self, args: dict, tenant_id: str) -> dict:
        """Estimate delta-v cost for an orbital maneuver."""
        try:
            from app.physics.maneuver import calculate_delta_v_cost, ManeuverOption, SatelliteState

            satellite_id = args.get("satellite_id")
            target_altitude_km = args.get("target_altitude_km")

            if not satellite_id:
                return {"error": "satellite_id is required"}

            sat = await self.ontology.get_satellite(satellite_id, tenant_id=tenant_id)
            if not sat:
                return {"error": f"Satellite {satellite_id} not found"}

            orbit = await self.ontology.get_latest_orbit(satellite_id, tenant_id=tenant_id)
            if not orbit or not orbit.semi_major_axis_km:
                return {
                    "status": "insufficient_orbit_data",
                    "satellite_id": satellite_id,
                    "note": "Orbit data missing for maneuver estimation",
                }

            # Compute a simple Hohmann transfer delta-v estimate
            import math
            mu = 398600.4418  # km^3/s^2
            r1 = orbit.semi_major_axis_km
            if target_altitude_km:
                r2 = target_altitude_km + 6371.0
            else:
                # Default: small altitude raise for avoidance
                r2 = r1 + 10.0

            v1 = math.sqrt(mu / r1)
            v_transfer_1 = math.sqrt(mu * (2.0 / r1 - 2.0 / (r1 + r2)))
            v_transfer_2 = math.sqrt(mu * (2.0 / r2 - 2.0 / (r1 + r2)))
            v2 = math.sqrt(mu / r2)

            delta_v_1 = abs(v_transfer_1 - v1)
            delta_v_2 = abs(v2 - v_transfer_2)
            total_delta_v = delta_v_1 + delta_v_2

            # Fuel estimate using Tsiolkovsky equation
            mass_kg = sat.mass_kg or 1000.0
            isp = 300.0  # typical bipropellant
            g0 = 9.80665e-3  # km/s^2
            fuel_kg = mass_kg * (1 - math.exp(-total_delta_v / (isp * g0)))

            return {
                "status": "estimated",
                "satellite_id": satellite_id,
                "satellite_name": sat.name,
                "current_sma_km": r1,
                "target_sma_km": r2,
                "delta_v_km_s": round(total_delta_v, 6),
                "delta_v_m_s": round(total_delta_v * 1000, 2),
                "estimated_fuel_kg": round(fuel_kg, 2),
                "satellite_mass_kg": mass_kg,
                "assumed_isp_s": isp,
            }
        except ImportError:
            # Fallback stub if maneuver module imports fail
            return {
                "status": "physics_module_unavailable",
                "satellite_id": args.get("satellite_id"),
                "note": "Maneuver estimation module not available; used inline calculation",
            }
        except Exception as e:
            logger.error("estimate_maneuver_cost failed", error=str(e))
            return {
                "status": "error",
                "satellite_id": args.get("satellite_id"),
                "error": str(e),
            }
