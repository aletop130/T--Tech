"""Maneuver Detection Service.

Detects orbital maneuvers by comparing consecutive GP (General Perturbations)
history records from CelesTrak. Uses vis-viva equation for delta-v estimation
and classifies maneuvers by type.
"""

from __future__ import annotations

import asyncio
import hashlib
import logging
import math
import time
from datetime import datetime, timezone
from typing import Dict, List, Optional, Tuple

import httpx

from app.physics.constants import MU_EARTH
from app.services.celestrack import (
    ALLIED_SATELLITES,
    ENEMY_SATELLITES,
    ITALIAN_SATELLITES,
    NATO_ALLIED_SATELLITES,
)

logger = logging.getLogger(__name__)

# Thresholds for maneuver detection
DELTA_A_THRESHOLD_KM = 1.0       # Semi-major axis change
DELTA_I_THRESHOLD_DEG = 0.01     # Inclination change
DELTA_E_THRESHOLD = 0.001        # Eccentricity change

# Deorbit detection: if altitude drops below this AND is decreasing
DEORBIT_ALTITUDE_KM = 300.0

# Cache TTL in seconds (10 minutes)
CACHE_TTL = 600

# CelesTrak GP history endpoint
GP_HISTORY_URL = "https://celestrak.org/NORAD/elements/gp.php"


def _mean_motion_to_sma_km(mean_motion_rev_day: float) -> float:
    """Convert mean motion (rev/day) to semi-major axis (km) via Kepler's 3rd law."""
    if mean_motion_rev_day <= 0:
        return 0.0
    n_rad_s = mean_motion_rev_day * 2.0 * math.pi / 86400.0
    a_m = (MU_EARTH / (n_rad_s ** 2)) ** (1.0 / 3.0)
    return a_m / 1000.0


def _estimate_delta_v_vis_viva(a1_km: float, a2_km: float) -> float:
    """Estimate delta-v (m/s) for a Hohmann-like transfer using vis-viva.

    Approximates the delta-v needed to change from orbit with SMA a1 to a2.
    Uses simplified single-impulse approximation: dv ~ |v2 - v1| at the
    average altitude.
    """
    if a1_km <= 0 or a2_km <= 0:
        return 0.0
    a1_m = a1_km * 1000.0
    a2_m = a2_km * 1000.0
    v1 = math.sqrt(MU_EARTH / a1_m)
    v2 = math.sqrt(MU_EARTH / a2_m)
    return abs(v2 - v1)


def _estimate_plane_change_dv(v_km_s: float, delta_i_deg: float) -> float:
    """Estimate delta-v for a plane change maneuver."""
    delta_i_rad = math.radians(abs(delta_i_deg))
    return abs(2.0 * v_km_s * 1000.0 * math.sin(delta_i_rad / 2.0))


def _classify_maneuver(
    delta_a_km: float,
    delta_i_deg: float,
    delta_e: float,
    after_a_km: float,
) -> str:
    """Classify a maneuver based on orbital element changes."""
    from app.schemas.maneuver_detection import ManeuverType

    after_alt_km = after_a_km - 6378.137  # Approximate altitude

    # Deorbit: significant altitude decrease to below 300 km
    if delta_a_km < -5.0 and after_alt_km < DEORBIT_ALTITUDE_KM:
        return ManeuverType.DEORBIT

    # Plane change: significant inclination change dominates
    if abs(delta_i_deg) > DELTA_I_THRESHOLD_DEG and abs(delta_i_deg) > abs(delta_a_km) * 0.01:
        return ManeuverType.PLANE_CHANGE

    # Orbit raise/lower
    if abs(delta_a_km) >= DELTA_A_THRESHOLD_KM:
        if delta_a_km > 0:
            return ManeuverType.ORBIT_RAISE
        else:
            return ManeuverType.ORBIT_LOWER

    # Small corrections = station-keeping
    return ManeuverType.STATION_KEEPING


def _compute_confidence(delta_a_km: float, delta_i_deg: float, delta_e: float) -> float:
    """Compute confidence score for a detected maneuver."""
    score = 0.0
    if abs(delta_a_km) >= DELTA_A_THRESHOLD_KM:
        score += min(abs(delta_a_km) / 10.0, 0.4)
    if abs(delta_i_deg) >= DELTA_I_THRESHOLD_DEG:
        score += min(abs(delta_i_deg) / 0.1, 0.3)
    if abs(delta_e) >= DELTA_E_THRESHOLD:
        score += min(abs(delta_e) / 0.01, 0.3)
    return min(max(score, 0.3), 1.0)


class ManeuverDetectionService:
    """Service for detecting orbital maneuvers from GP history."""

    def __init__(self) -> None:
        self._cache: Dict[int, List[dict]] = {}
        self._maneuver_cache: Dict[int, List[dict]] = {}
        self._last_scan: Optional[float] = None
        self._all_maneuvers: List[dict] = []

    def _get_tracked_satellites(self) -> Dict[int, dict]:
        """Get all tracked satellites (allied + italian + nato + enemy)."""
        tracked = {}
        tracked.update(ALLIED_SATELLITES)
        tracked.update(ITALIAN_SATELLITES)
        tracked.update(NATO_ALLIED_SATELLITES)
        tracked.update(ENEMY_SATELLITES)
        return tracked

    async def _fetch_gp_history(self, norad_id: int) -> List[dict]:
        """Fetch GP history for a satellite from CelesTrak."""
        cache_key = norad_id
        if cache_key in self._cache:
            return self._cache[cache_key]

        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.get(
                    GP_HISTORY_URL,
                    params={
                        "CATNR": norad_id,
                        "FORMAT": "json",
                    },
                )
                if resp.status_code != 200:
                    logger.warning("CelesTrak GP history returned %d for NORAD %d", resp.status_code, norad_id)
                    return []
                data = resp.json()
                if not isinstance(data, list):
                    return []
                self._cache[cache_key] = data
                return data
        except Exception as e:
            logger.error("Failed to fetch GP history for NORAD %d: %s", norad_id, e)
            return []

    def _detect_maneuvers_from_gp(
        self, norad_id: int, sat_name: str, gp_records: List[dict]
    ) -> List[dict]:
        """Compare consecutive GP records and detect maneuvers."""
        if len(gp_records) < 2:
            return []

        maneuvers = []
        sorted_records = sorted(gp_records, key=lambda r: r.get("EPOCH", ""))

        for i in range(1, len(sorted_records)):
            prev = sorted_records[i - 1]
            curr = sorted_records[i]

            prev_mm = float(prev.get("MEAN_MOTION", 0))
            curr_mm = float(curr.get("MEAN_MOTION", 0))
            prev_inc = float(prev.get("INCLINATION", 0))
            curr_inc = float(curr.get("INCLINATION", 0))
            prev_ecc = float(prev.get("ECCENTRICITY", 0))
            curr_ecc = float(curr.get("ECCENTRICITY", 0))

            prev_a = _mean_motion_to_sma_km(prev_mm)
            curr_a = _mean_motion_to_sma_km(curr_mm)

            delta_a = curr_a - prev_a
            delta_i = curr_inc - prev_inc
            delta_e = curr_ecc - prev_ecc

            # Check if any threshold is exceeded
            if (
                abs(delta_a) >= DELTA_A_THRESHOLD_KM
                or abs(delta_i) >= DELTA_I_THRESHOLD_DEG
                or abs(delta_e) >= DELTA_E_THRESHOLD
            ):
                maneuver_type = _classify_maneuver(delta_a, delta_i, delta_e, curr_a)

                # Estimate delta-v
                dv_orbital = _estimate_delta_v_vis_viva(prev_a, curr_a)
                v_circ = math.sqrt(MU_EARTH / (prev_a * 1000.0)) / 1000.0 if prev_a > 0 else 7.5
                dv_plane = _estimate_plane_change_dv(v_circ, delta_i)
                total_dv = math.sqrt(dv_orbital ** 2 + dv_plane ** 2)

                confidence = _compute_confidence(delta_a, delta_i, delta_e)
                epoch_str = curr.get("EPOCH", "")

                raw_id = f"{norad_id}-{epoch_str}"
                maneuver_id = hashlib.md5(raw_id.encode()).hexdigest()[:12]

                before_snapshot = {
                    "epoch": prev.get("EPOCH", ""),
                    "semi_major_axis_km": round(prev_a, 3),
                    "eccentricity": prev_ecc,
                    "inclination_deg": prev_inc,
                    "raan_deg": float(prev.get("RA_OF_ASC_NODE", 0)),
                    "arg_perigee_deg": float(prev.get("ARG_OF_PERICENTER", 0)),
                    "mean_anomaly_deg": float(prev.get("MEAN_ANOMALY", 0)),
                    "mean_motion_rev_day": prev_mm,
                }

                after_snapshot = {
                    "epoch": curr.get("EPOCH", ""),
                    "semi_major_axis_km": round(curr_a, 3),
                    "eccentricity": curr_ecc,
                    "inclination_deg": curr_inc,
                    "raan_deg": float(curr.get("RA_OF_ASC_NODE", 0)),
                    "arg_perigee_deg": float(curr.get("ARG_OF_PERICENTER", 0)),
                    "mean_anomaly_deg": float(curr.get("MEAN_ANOMALY", 0)),
                    "mean_motion_rev_day": curr_mm,
                }

                maneuvers.append({
                    "id": maneuver_id,
                    "norad_id": norad_id,
                    "satellite_name": sat_name,
                    "detection_time": epoch_str,
                    "maneuver_type": maneuver_type,
                    "delta_a_km": round(delta_a, 4),
                    "delta_i_deg": round(delta_i, 6),
                    "delta_e": round(delta_e, 7),
                    "estimated_delta_v_ms": round(total_dv, 3),
                    "confidence": round(confidence, 3),
                    "before": before_snapshot,
                    "after": after_snapshot,
                })

        return maneuvers

    async def _fetch_and_detect(
        self,
        norad_id: int,
        info: dict,
        semaphore: asyncio.Semaphore,
    ) -> List[dict]:
        """Fetch GP history and detect maneuvers for one satellite, bounded by semaphore."""
        async with semaphore:
            sat_name = info.get("name", f"NORAD-{norad_id}")
            gp_records = await self._fetch_gp_history(norad_id)
            maneuvers = self._detect_maneuvers_from_gp(norad_id, sat_name, gp_records)
            if maneuvers:
                self._maneuver_cache[norad_id] = maneuvers
            return maneuvers

    async def scan_all(self) -> List[dict]:
        """Scan all tracked satellites for maneuvers. Uses cache if fresh.

        Fetches CelesTrak GP history in parallel (max 10 concurrent requests)
        to avoid sequential timeout when the satellite list is large.
        """
        now = time.time()
        if self._last_scan and (now - self._last_scan) < CACHE_TTL and self._all_maneuvers:
            return self._all_maneuvers

        tracked = self._get_tracked_satellites()

        # Parallel fetch with concurrency cap to be polite to CelesTrak
        semaphore = asyncio.Semaphore(10)
        tasks = [
            self._fetch_and_detect(norad_id, info, semaphore)
            for norad_id, info in tracked.items()
        ]
        results = await asyncio.gather(*tasks, return_exceptions=True)

        all_maneuvers: List[dict] = []
        for result in results:
            if isinstance(result, list):
                all_maneuvers.extend(result)
            # silently skip exceptions — already logged inside _fetch_gp_history

        all_maneuvers.sort(key=lambda m: m["detection_time"], reverse=True)
        self._all_maneuvers = all_maneuvers
        self._last_scan = now
        return all_maneuvers

    async def get_recent_maneuvers(self, limit: int = 50) -> dict:
        """Get recent detected maneuvers across all tracked satellites."""
        maneuvers = await self.scan_all()
        limited = maneuvers[:limit]
        return {
            "maneuvers": limited,
            "total": len(maneuvers),
            "last_scan": datetime.fromtimestamp(
                self._last_scan, tz=timezone.utc
            ).isoformat() if self._last_scan else None,
        }

    async def analyze_satellites(self, norad_ids: List[int]) -> dict:
        """Trigger analysis for a specific set of satellites."""
        tracked = self._get_tracked_satellites()

        # Clear GP cache to force re-fetch, then fetch in parallel
        for norad_id in norad_ids:
            self._cache.pop(norad_id, None)

        semaphore = asyncio.Semaphore(10)
        tasks = [
            self._fetch_and_detect(norad_id, tracked.get(norad_id, {}), semaphore)
            for norad_id in norad_ids
        ]
        raw = await asyncio.gather(*tasks, return_exceptions=True)

        results: List[dict] = []
        for item in raw:
            if isinstance(item, list):
                results.extend(item)

        results.sort(key=lambda m: m["detection_time"], reverse=True)
        return {
            "analyzed": len(norad_ids),
            "maneuvers": results,
            "total": len(results),
        }

    async def get_satellite_history(self, norad_id: int) -> dict:
        """Get maneuver history for a specific satellite."""
        # Check cache first
        if norad_id in self._maneuver_cache:
            maneuvers = self._maneuver_cache[norad_id]
        else:
            tracked = self._get_tracked_satellites()
            info = tracked.get(norad_id, {})
            sat_name = info.get("name", f"NORAD-{norad_id}")
            gp_records = await self._fetch_gp_history(norad_id)
            maneuvers = self._detect_maneuvers_from_gp(norad_id, sat_name, gp_records)
            self._maneuver_cache[norad_id] = maneuvers

        tracked = self._get_tracked_satellites()
        sat_name = tracked.get(norad_id, {}).get("name", f"NORAD-{norad_id}")

        return {
            "norad_id": norad_id,
            "satellite_name": sat_name,
            "maneuvers": maneuvers,
            "total": len(maneuvers),
        }


# Singleton instance
_service: Optional[ManeuverDetectionService] = None


def get_maneuver_detection_service() -> ManeuverDetectionService:
    global _service
    if _service is None:
        _service = ManeuverDetectionService()
    return _service
