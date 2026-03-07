"""Space weather service — fetches NOAA SWPC data and computes satellite drag impact."""

from __future__ import annotations

import time
from datetime import datetime, timezone
from typing import Optional

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import get_logger
from app.db.models.ontology import Satellite, Orbit
from app.schemas.space_weather import (
    AlertLevel,
    DragImpactSatellite,
    NOAAAlert,
    SpaceWeatherCurrent,
    SpaceWeatherImpact,
    StormLevel,
)

logger = get_logger(__name__)

# NOAA SWPC public endpoints (no auth required)
KP_INDEX_URL = "https://services.swpc.noaa.gov/json/planetary_k_index_1m.json"
SOLAR_CYCLE_URL = "https://services.swpc.noaa.gov/json/solar-cycle/observed-solar-cycle-indices.json"
ALERTS_URL = "https://services.swpc.noaa.gov/products/alerts.json"

# In-memory cache
_cache: dict[str, tuple[float, object]] = {}
CACHE_TTL = 300  # 5 minutes


def _get_cached(key: str) -> object | None:
    entry = _cache.get(key)
    if entry and (time.time() - entry[0]) < CACHE_TTL:
        return entry[1]
    return None


def _set_cached(key: str, value: object) -> None:
    _cache[key] = (time.time(), value)


def _kp_to_storm_level(kp: float) -> StormLevel:
    if kp >= 9:
        return StormLevel.EXTREME
    if kp >= 8:
        return StormLevel.SEVERE
    if kp >= 7:
        return StormLevel.STRONG
    if kp >= 6:
        return StormLevel.MODERATE
    if kp >= 5:
        return StormLevel.MINOR
    return StormLevel.NONE


def _kp_to_alert_level(kp: float) -> AlertLevel:
    if kp >= 7:
        return AlertLevel.RED
    if kp >= 5:
        return AlertLevel.ORANGE
    if kp >= 4:
        return AlertLevel.YELLOW
    return AlertLevel.GREEN


def _estimate_drag_increase(kp: float, altitude_km: float) -> float:
    """Estimate atmospheric drag increase percentage.

    Higher Kp causes thermospheric density increases, especially at lower altitudes.
    Rough model: drag increase ~ (Kp - 4)^2 * altitude_factor
    where altitude_factor decreases with altitude.
    """
    if kp <= 4:
        return 0.0
    kp_factor = (kp - 4) ** 2
    # Altitude factor: strongest below 400 km, diminishes toward 600 km
    if altitude_km < 300:
        alt_factor = 5.0
    elif altitude_km < 400:
        alt_factor = 3.0
    elif altitude_km < 500:
        alt_factor = 1.5
    else:
        alt_factor = 0.8
    return round(kp_factor * alt_factor, 1)


async def _fetch_kp_index() -> tuple[float, datetime]:
    """Fetch latest Kp index from NOAA SWPC."""
    cached = _get_cached("kp")
    if cached:
        return cached  # type: ignore

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(KP_INDEX_URL)
            resp.raise_for_status()
            data = resp.json()
        if not data:
            raise ValueError("Empty Kp response")
        latest = data[-1]
        kp = float(latest.get("kp_index", latest.get("kp", 0)))
        ts_str = latest.get("time_tag", "")
        try:
            ts = datetime.fromisoformat(ts_str.replace("Z", "+00:00"))
        except Exception:
            ts = datetime.now(timezone.utc)
        result = (kp, ts)
        _set_cached("kp", result)
        return result
    except Exception as exc:
        logger.warning("Failed to fetch Kp index: %s", exc)
        return (2.0, datetime.now(timezone.utc))


async def _fetch_f10_7() -> Optional[float]:
    """Fetch latest F10.7 solar flux from NOAA SWPC."""
    cached = _get_cached("f10_7")
    if cached is not None:
        return cached  # type: ignore

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(SOLAR_CYCLE_URL)
            resp.raise_for_status()
            data = resp.json()
        if not data:
            return None
        latest = data[-1]
        f10_7 = float(latest.get("f10.7", latest.get("f107", 0)))
        _set_cached("f10_7", f10_7)
        return f10_7
    except Exception as exc:
        logger.warning("Failed to fetch F10.7: %s", exc)
        return None


async def _fetch_alerts() -> list[NOAAAlert]:
    """Fetch active NOAA SWPC alerts."""
    cached = _get_cached("alerts")
    if cached is not None:
        return cached  # type: ignore

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(ALERTS_URL)
            resp.raise_for_status()
            data = resp.json()
        alerts = []
        for item in data[-10:]:  # last 10 alerts
            alerts.append(NOAAAlert(
                product_id=item.get("product_id", "unknown"),
                issue_datetime=item.get("issue_datetime"),
                message=item.get("message", "")[:500],
            ))
        _set_cached("alerts", alerts)
        return alerts
    except Exception as exc:
        logger.warning("Failed to fetch SWPC alerts: %s", exc)
        return []


class SpaceWeatherService:
    """Service for real-time space weather assessment."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_current_conditions(self) -> SpaceWeatherCurrent:
        kp, ts = await _fetch_kp_index()
        f10_7 = await _fetch_f10_7()
        return SpaceWeatherCurrent(
            kp_index=kp,
            f10_7=f10_7,
            solar_wind_speed=None,
            storm_level=_kp_to_storm_level(kp),
            timestamp=ts,
        )

    async def get_impact(self) -> SpaceWeatherImpact:
        conditions = await self.get_current_conditions()
        alerts = await _fetch_alerts()
        affected: list[DragImpactSatellite] = []

        if conditions.kp_index > 4:
            affected = await self._find_at_risk_satellites(conditions.kp_index)

        return SpaceWeatherImpact(
            current_conditions=conditions,
            affected_satellites=affected,
            alert_level=_kp_to_alert_level(conditions.kp_index),
            active_alerts=alerts,
            total_affected=len(affected),
        )

    async def _find_at_risk_satellites(self, kp: float) -> list[DragImpactSatellite]:
        """Find LEO satellites (<600 km) that face increased drag."""
        try:
            # Query satellites with their latest orbits
            stmt = (
                select(Satellite, Orbit)
                .join(Orbit, Satellite.id == Orbit.satellite_id)
                .where(Satellite.is_active == True)  # noqa: E712
            )
            result = await self.db.execute(stmt)
            rows = result.all()

            # Deduplicate: keep only the latest orbit per satellite
            sat_orbits: dict[str, tuple] = {}
            for sat, orbit in rows:
                sid = str(sat.id)
                if sid not in sat_orbits or (orbit.epoch and (
                    not sat_orbits[sid][1].epoch or orbit.epoch > sat_orbits[sid][1].epoch
                )):
                    sat_orbits[sid] = (sat, orbit)

            affected = []
            for sat, orbit in sat_orbits.values():
                alt = None
                if orbit.perigee_km is not None:
                    alt = orbit.perigee_km
                elif orbit.semi_major_axis_km is not None:
                    alt = orbit.semi_major_axis_km - 6371.0

                if alt is None or alt > 600 or alt < 100:
                    continue

                drag_pct = _estimate_drag_increase(kp, alt)
                if drag_pct > 0:
                    affected.append(DragImpactSatellite(
                        norad_id=sat.norad_id,
                        name=sat.name,
                        altitude_km=round(alt, 1),
                        estimated_drag_increase_pct=drag_pct,
                    ))

            affected.sort(key=lambda s: s.estimated_drag_increase_pct, reverse=True)
            return affected
        except Exception as exc:
            logger.error("Error finding at-risk satellites: %s", exc)
            return []
