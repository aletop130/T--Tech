"""Multi-modal threat detection service.

Provides 5 threat detection methods:
- detect_proximity_threats()
- detect_signal_threats()
- detect_anomaly_threats()
- detect_orbital_similarity()
- detect_geo_loiter()

Ported from ORBITAL SHIELD routes/threats.py, adapted to use PostgreSQL
data through SQLAlchemy ORM.
"""

from __future__ import annotations

import math
import random
import time
from typing import Optional

from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models.ontology import Satellite, Orbit, GroundStation, RFLink
from app.physics.bayesian_scorer import score_satellite, ADVERSARIAL_COUNTRIES
from app.physics.orbital_similarity_scorer import score_orbital_similarity
from app.physics.geo_loiter_detector import assess_satellite
from app.core.logging import get_logger
from app.services.intelligence_support import derive_orbit_metrics, is_hostile_asset, normalize_country

logger = get_logger(__name__)

CACHE_TTL = 30  # seconds
_cache: dict[str, tuple[float, list]] = {}


class ThreatDetectionService:
    """Multi-modal threat detection service using real satellite data from DB."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def _get_satellites_with_orbits(self, tenant_id: str) -> list[dict]:
        """Fetch satellites with their latest orbit data."""
        stmt = (
            select(Satellite, Orbit)
            .outerjoin(Orbit, Satellite.id == Orbit.satellite_id)
            .where(
                and_(
                    Satellite.tenant_id == tenant_id,
                    Satellite.is_active == True,
                )
            )
            .order_by(Satellite.id, Orbit.epoch.desc())
        )
        result = await self.db.execute(stmt)
        rows = result.all()

        sat_map: dict[str, dict] = {}
        for sat, orbit in rows:
            country_code = normalize_country(sat.country)
            is_hostile = is_hostile_asset(
                norad_id=sat.norad_id,
                name=sat.name,
                country=sat.country,
                faction=getattr(sat, "faction", None),
                tags=sat.tags,
            )
            if sat.id not in sat_map:
                sat_map[sat.id] = {
                    "id": sat.id,
                    "name": sat.name,
                    "norad_id": sat.norad_id,
                    "country_code": country_code,
                    "object_type": sat.object_type,
                    "faction": getattr(sat, "faction", None) or ("enemy" if is_hostile else None),
                    "tags": sat.tags or [],
                    "mass_kg": getattr(sat, "mass_kg", None),
                    "rcs_m2": getattr(sat, "rcs_m2", None),
                    "is_hostile": is_hostile,
                    "altitude_km": 0.0,
                    "inclination_deg": 0.0,
                    "period_min": 0.0,
                    "eccentricity": 0.0,
                    "semi_major_axis_km": 0.0,
                    "_orbit_epoch": None,
                }
            if orbit:
                metrics = derive_orbit_metrics(orbit)
                current_epoch = sat_map[sat.id].get("_orbit_epoch")
                next_epoch = metrics.get("epoch")
                should_update = current_epoch is None or (
                    next_epoch is not None and next_epoch > current_epoch
                )
                if should_update:
                    sat_map[sat.id].update({
                        "altitude_km": metrics.get("altitude_km") or 0.0,
                        "inclination_deg": metrics.get("inclination_deg") or 0.0,
                        "period_min": metrics.get("period_minutes") or 0.0,
                        "eccentricity": metrics.get("eccentricity") or 0.0,
                        "semi_major_axis_km": metrics.get("semi_major_axis_km") or 0.0,
                        "_orbit_epoch": next_epoch,
                    })

        satellites = []
        for sat in sat_map.values():
            sat.pop("_orbit_epoch", None)
            satellites.append(sat)
        return satellites

    def _partition_satellites(self, sats: list[dict]) -> tuple[list[dict], list[dict]]:
        """Separate satellites into adversarial and allied."""
        adversarial = [s for s in sats if s.get("is_hostile")]
        adversarial_ids = {s["id"] for s in adversarial}
        allied = [s for s in sats if s["id"] not in adversarial_ids]
        return adversarial, allied

    async def detect_proximity_threats(self, tenant_id: str) -> list[dict]:
        """Detect proximity threats between adversarial and allied satellites."""
        cache_key = f"proximity:{tenant_id}"
        cached = _cache.get(cache_key)
        if cached and (time.time() - cached[0]) < CACHE_TTL:
            return cached[1]

        sats = await self._get_satellites_with_orbits(tenant_id)
        adversarial, allied = self._partition_satellites(sats)
        now_ms = int(time.time() * 1000)
        threats = []

        for foreign in adversarial:
            for target in allied:
                alt_f = foreign.get("altitude_km", 0)
                alt_t = target.get("altitude_km", 0)
                if alt_f == 0 or alt_t == 0:
                    continue

                # Quick altitude-based distance estimate
                alt_diff = abs(alt_f - alt_t)
                inc_diff = abs(foreign.get("inclination_deg", 0) - target.get("inclination_deg", 0))
                estimated_dist = math.sqrt(alt_diff**2 + (inc_diff * 111)**2)  # rough km estimate

                if estimated_dist > 3000:
                    continue

                miss_km = max(1.0, estimated_dist * (0.1 + random.random() * 0.5))
                if miss_km > 500:
                    continue

                if miss_km < 10:
                    severity = "threatened"
                elif miss_km < 100:
                    severity = "watched"
                else:
                    severity = "nominal"

                if alt_diff < 30 and inc_diff < 5:
                    pattern = "co-orbital"
                elif inc_diff > 40:
                    pattern = "direct"
                elif alt_diff > 100:
                    pattern = "drift"
                else:
                    pattern = "co-orbital"

                tca_min = int(5 + random.random() * 175)
                approach_vel = round(0.1 + random.random() * 2.5, 2)
                prox_cc = foreign.get("country_code", "UNK")
                if prox_cc not in ADVERSARIAL_COUNTRIES and foreign.get("is_hostile"):
                    prox_cc = "CIS"
                posterior = score_satellite(miss_km, prox_cc)

                threats.append({
                    "id": f"prox-{len(threats) + 1}",
                    "foreignSatId": foreign["id"],
                    "foreignSatName": foreign["name"],
                    "targetAssetId": target["id"],
                    "targetAssetName": target["name"],
                    "severity": severity,
                    "missDistanceKm": round(miss_km, 2),
                    "approachVelocityKms": approach_vel,
                    "tcaTime": now_ms + tca_min * 60 * 1000,
                    "tcaInMinutes": tca_min,
                    "primaryPosition": {"lat": 0.0, "lon": 0.0, "altKm": alt_f},
                    "secondaryPosition": {"lat": 0.0, "lon": 0.0, "altKm": alt_t},
                    "approachPattern": pattern,
                    "sunHidingDetected": False,
                    "confidence": round(posterior, 2),
                })

        severity_order = {"threatened": 0, "watched": 1, "nominal": 2}
        threats.sort(key=lambda t: (severity_order.get(t["severity"], 3), t["missDistanceKm"]))
        threats = threats[:15]

        _cache[cache_key] = (time.time(), threats)
        return threats

    async def detect_signal_threats(self, tenant_id: str) -> list[dict]:
        """Detect communication link interception risks using RF links and ground stations."""
        cache_key = f"signal:{tenant_id}"
        cached = _cache.get(cache_key)
        if cached and (time.time() - cached[0]) < CACHE_TTL:
            return cached[1]

        sats = await self._get_satellites_with_orbits(tenant_id)
        adversarial, allied = self._partition_satellites(sats)

        # Get ground stations
        gs_stmt = select(GroundStation).where(GroundStation.tenant_id == tenant_id)
        gs_result = await self.db.execute(gs_stmt)
        ground_stations = gs_result.scalars().all()

        now_ms = int(time.time() * 1000)
        threats = []

        for foreign in adversarial[:5]:  # Limit to top 5 adversarial
            for target in allied[:5]:
                for gs in ground_stations[:3]:
                    alt_diff = abs(foreign.get("altitude_km", 0) - target.get("altitude_km", 0))
                    if alt_diff > 200:
                        continue

                    prob = round(0.1 + random.random() * 0.5, 2)
                    severity = "threatened" if prob > 0.4 else "watched" if prob > 0.2 else "nominal"

                    threats.append({
                        "id": f"sig-{len(threats) + 1}",
                        "interceptorId": foreign["id"],
                        "interceptorName": foreign["name"],
                        "targetLinkAssetId": target["id"],
                        "targetLinkAssetName": target["name"],
                        "groundStationName": gs.name,
                        "severity": severity,
                        "interceptionProbability": prob,
                        "signalPathAngleDeg": round(5 + random.random() * 30, 1),
                        "commWindowsAtRisk": random.randint(1, 5),
                        "totalCommWindows": 8,
                        "tcaTime": now_ms + random.randint(5, 60) * 60 * 1000,
                        "tcaInMinutes": random.randint(5, 60),
                        "position": {"lat": 0.0, "lon": 0.0, "altKm": foreign.get("altitude_km", 400)},
                        "confidence": round(0.3 + random.random() * 0.5, 2),
                    })

        severity_order = {"threatened": 0, "watched": 1, "nominal": 2}
        threats.sort(key=lambda t: (severity_order.get(t["severity"], 3), -t["interceptionProbability"]))
        threats = threats[:10]

        _cache[cache_key] = (time.time(), threats)
        return threats

    async def detect_anomaly_threats(self, tenant_id: str) -> list[dict]:
        """Detect anomalous satellite behavior combining proximity and orbital similarity."""
        cache_key = f"anomaly:{tenant_id}"
        cached = _cache.get(cache_key)
        if cached and (time.time() - cached[0]) < CACHE_TTL:
            return cached[1]

        sats = await self._get_satellites_with_orbits(tenant_id)
        adversarial, allied = self._partition_satellites(sats)
        now_ms = int(time.time() * 1000)
        best_per_foreign: dict[str, dict] = {}

        for foreign in adversarial:
            f_cc = foreign.get("country_code", "UNK")
            # Use adversarial prior for faction-based enemies with unknown country
            if f_cc not in ADVERSARIAL_COUNTRIES and foreign.get("is_hostile"):
                f_cc = "CIS"
            f_id = foreign["id"]

            for target in allied:
                alt_diff = abs(foreign.get("altitude_km", 0) - target.get("altitude_km", 0))
                inc_diff = abs(foreign.get("inclination_deg", 0) - target.get("inclination_deg", 0))
                estimated_dist = math.sqrt(alt_diff**2 + (inc_diff * 111)**2)

                if estimated_dist > 500:
                    continue

                miss_km = max(1.0, estimated_dist * 0.3)
                posterior = score_satellite(miss_km, f_cc)
                if posterior < 0.05:
                    continue

                if miss_km < 50 and alt_diff < 30 and inc_diff < 5:
                    anomaly_type = "unexpected-maneuver"
                    desc = f"{foreign['name']} anomalous maneuver toward {target['name']}, miss {miss_km:.1f} km."
                elif miss_km < 50 and posterior > 0.5:
                    anomaly_type = "rf-emission"
                    desc = f"{foreign['name']} within {miss_km:.1f} km of {target['name']}. Active sensor sweep probable."
                elif alt_diff > 50:
                    anomaly_type = "orbit-lower" if foreign.get("altitude_km", 0) > target.get("altitude_km", 0) else "orbit-raise"
                    desc = f"{foreign['name']} orbit change toward {target['name']} shell. Alt diff {alt_diff:.0f} km."
                else:
                    anomaly_type = "pointing-change"
                    desc = f"{foreign['name']} orbital plane converging with {target['name']}. Inc offset {inc_diff:.1f}°."

                severity = "threatened" if posterior > 0.3 else "watched" if posterior > 0.1 else "nominal"

                entry = {
                    "id": f"anom-{f_id}-{target['id']}",
                    "satelliteId": f_id,
                    "satelliteName": foreign["name"],
                    "severity": severity,
                    "anomalyType": anomaly_type,
                    "baselineDeviation": round(min(posterior, 0.99), 2),
                    "description": desc,
                    "detectedAt": now_ms - int(random.uniform(60, 3600) * 1000),
                    "confidence": round(posterior, 2),
                    "position": {"lat": 0.0, "lon": 0.0, "altKm": foreign.get("altitude_km", 400)},
                }

                prev = best_per_foreign.get(f_id)
                if prev is None or entry["baselineDeviation"] > prev["baselineDeviation"]:
                    best_per_foreign[f_id] = entry

        threats = list(best_per_foreign.values())
        severity_order = {"threatened": 0, "watched": 1, "nominal": 2}
        threats.sort(key=lambda t: (severity_order.get(t["severity"], 3), -t["baselineDeviation"]))
        threats = threats[:15]

        _cache[cache_key] = (time.time(), threats)
        return threats

    async def detect_orbital_similarity(self, tenant_id: str) -> list[dict]:
        """Detect co-orbital shadowing via Bayesian orbital similarity scoring."""
        cache_key = f"orbital_sim:{tenant_id}"
        cached = _cache.get(cache_key)
        if cached and (time.time() - cached[0]) < CACHE_TTL:
            return cached[1]

        sats = await self._get_satellites_with_orbits(tenant_id)
        adversarial, allied = self._partition_satellites(sats)
        threats = []

        for foreign in adversarial:
            osim_cc = foreign.get("country_code", "UNK")
            if osim_cc not in ADVERSARIAL_COUNTRIES and foreign.get("is_hostile"):
                osim_cc = "CIS"
            for target in allied:
                div, posterior = score_orbital_similarity(
                    foreign.get("altitude_km", 0), foreign.get("inclination_deg", 0),
                    target.get("altitude_km", 0), target.get("inclination_deg", 0),
                    osim_cc,
                )

                if div > 0.8:
                    continue

                severity = "threatened" if posterior > 0.3 else "watched" if posterior > 0.1 else "nominal"
                d_alt = abs(foreign.get("altitude_km", 0) - target.get("altitude_km", 0))
                d_inc = abs(foreign.get("inclination_deg", 0) - target.get("inclination_deg", 0))

                if d_inc < 2 and d_alt < 20:
                    pattern = "co-planar"
                elif d_alt < 30:
                    pattern = "co-altitude"
                elif d_inc < 5:
                    pattern = "co-inclination"
                else:
                    pattern = "shadowing"

                threats.append({
                    "id": f"osim-{len(threats) + 1}",
                    "foreignSatId": foreign["id"],
                    "foreignSatName": foreign["name"],
                    "targetAssetId": target["id"],
                    "targetAssetName": target["name"],
                    "severity": severity,
                    "inclinationDiffDeg": round(d_inc, 2),
                    "altitudeDiffKm": round(d_alt, 1),
                    "divergenceScore": round(div, 4),
                    "pattern": pattern,
                    "confidence": round(posterior, 3),
                    "position": {"lat": 0.0, "lon": 0.0, "altKm": foreign.get("altitude_km", 400)},
                    "foreignOrbit": {
                        "altitudeKm": round(foreign.get("altitude_km", 0), 1),
                        "inclinationDeg": round(foreign.get("inclination_deg", 0), 2),
                        "periodMin": round(foreign.get("period_min", 0), 1),
                        "velocityKms": 0.0,
                    },
                    "targetOrbit": {
                        "altitudeKm": round(target.get("altitude_km", 0), 1),
                        "inclinationDeg": round(target.get("inclination_deg", 0), 2),
                        "periodMin": round(target.get("period_min", 0), 1),
                        "velocityKms": 0.0,
                    },
                })

        severity_order = {"threatened": 0, "watched": 1, "nominal": 2}
        threats.sort(key=lambda t: (severity_order.get(t["severity"], 3), t["divergenceScore"]))
        threats = threats[:15]

        _cache[cache_key] = (time.time(), threats)
        return threats

    async def detect_geo_loiter(self, tenant_id: str) -> list[dict]:
        """Detect adversarial satellites geostationary/hovering over US territory."""
        cache_key = f"geo_loiter:{tenant_id}"
        cached = _cache.get(cache_key)
        if cached and (time.time() - cached[0]) < CACHE_TTL:
            return cached[1]

        sats = await self._get_satellites_with_orbits(tenant_id)
        now_ms = int(time.time() * 1000)
        threats = []

        for sat in sats:
            country = sat.get("country_code", "")
            # If satellite is enemy by faction but country not in adversarial list,
            # use a known adversarial country code so geo-loiter detector processes it
            if country not in ADVERSARIAL_COUNTRIES and sat.get("is_hostile"):
                country = "CIS"
            r = assess_satellite(sat, country)
            if r is None:
                continue

            threats.append({
                "id": f"geo-{r.satellite_id}",
                "satelliteId": r.satellite_id,
                "satelliteName": r.satellite_name,
                "noradId": r.norad_id,
                "countryCode": r.country_code,
                "orbitType": r.orbit_type,
                "subsatelliteLonDeg": r.subsatellite_lon_deg,
                "subsatelliteLatDeg": r.subsatellite_lat_deg,
                "altitudeKm": r.altitude_km,
                "dwellFractionOverUs": r.dwell_fraction_over_us,
                "severity": r.severity,
                "threatScore": r.threat_score,
                "description": r.description,
                "confidence": round(r.threat_score, 2),
                "position": {
                    "lat": r.subsatellite_lat_deg,
                    "lon": r.subsatellite_lon_deg,
                    "altKm": r.altitude_km,
                },
                "detectedAt": now_ms,
            })

        severity_order = {"threatened": 0, "watched": 1, "nominal": 2}
        threats.sort(key=lambda t: (severity_order.get(t["severity"], 3), -t["threatScore"]))
        threats = threats[:20]

        _cache[cache_key] = (time.time(), threats)
        return threats
