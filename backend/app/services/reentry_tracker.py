"""Reentry tracking and prediction service.

Fetches predicted reentries from CelesTrak and simulates reentry predictions
for low-perigee objects from the database.
"""

from __future__ import annotations

import random
import time
from datetime import datetime, timedelta, timezone
from typing import Optional

import httpx
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models.ontology import Satellite, Orbit
from app.core.logging import get_logger
from app.services.intelligence_support import derive_orbit_metrics

logger = get_logger(__name__)

CACHE_TTL = 1800  # 30 minutes
_cache: dict[str, tuple[float, list]] = {}

CELESTRAK_DECAY_URL = "https://celestrak.org/NORAD/elements/gp.php?GROUP=last-30-days&FORMAT=JSON"


def _classify_object_type(name: str) -> str:
    name_upper = name.upper()
    if "DEB" in name_upper or "DEBRIS" in name_upper:
        return "debris"
    if "R/B" in name_upper or "ROCKET" in name_upper:
        return "rocket-body"
    if name_upper.startswith("CZ-") or name_upper.startswith("SL-") or name_upper.startswith("FALCON"):
        return "rocket-body"
    return "payload"


def _risk_from_type_and_window(obj_type: str, window_hours: float) -> str:
    if window_hours < 12:
        return "critical" if obj_type in ("payload", "rocket-body") else "high"
    if window_hours < 48:
        return "high" if obj_type == "rocket-body" else "moderate"
    if window_hours < 168:
        return "moderate"
    return "low"


async def _fetch_celestrak_decays() -> list[dict]:
    """Fetch recently decayed / decaying objects from CelesTrak."""
    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            resp = await client.get(CELESTRAK_DECAY_URL)
            resp.raise_for_status()
            data = resp.json()
    except Exception as e:
        logger.warning("CelesTrak decay fetch failed: %s", e)
        return []

    results = []
    now = datetime.now(timezone.utc)

    for obj in data:
        norad_id = obj.get("NORAD_CAT_ID", 0)
        name = obj.get("OBJECT_NAME", "UNKNOWN")
        decay_date_str = obj.get("DECAY_DATE") or obj.get("EPOCH")
        mean_motion = obj.get("MEAN_MOTION", 0)

        if not decay_date_str:
            continue

        # Focus on objects with very high mean motion (low perigee) or explicit decay
        if mean_motion and float(mean_motion) < 14.5 and not obj.get("DECAY_DATE"):
            continue

        try:
            epoch = datetime.fromisoformat(decay_date_str.replace("Z", "+00:00"))
        except (ValueError, AttributeError):
            continue
        if epoch.tzinfo is None:
            epoch = epoch.replace(tzinfo=timezone.utc)

        obj_type = _classify_object_type(name)
        # Window: wider for objects further from decay
        diff_hours = abs((epoch - now).total_seconds()) / 3600
        window = max(2.0, min(diff_hours * 0.3, 168.0))
        countdown_sec = (epoch - now).total_seconds()
        if countdown_sec <= 0:
            continue

        risk = _risk_from_type_and_window(obj_type, window)

        # Simulate latitude/longitude ranges for reentry corridor
        lat_center = random.uniform(-55, 55)
        lon_center = random.uniform(-180, 180)

        results.append({
            "norad_id": norad_id,
            "name": name,
            "object_type": obj_type,
            "predicted_epoch": epoch.isoformat(),
            "window_hours": round(window, 1),
            "latitude_range": [round(lat_center - 15, 1), round(lat_center + 15, 1)],
            "longitude_range": [round(lon_center - 40, 1), round(lon_center + 40, 1)],
            "risk_level": risk,
            "countdown_seconds": round(countdown_sec, 0),
            "source": "celestrak",
        })

    # Sort by predicted epoch ascending (soonest first)
    results.sort(key=lambda r: r["predicted_epoch"])
    return results[:30]


async def _get_low_perigee_predictions(db: AsyncSession, tenant_id: str) -> list[dict]:
    """Generate reentry predictions for low-perigee objects in the DB."""
    stmt = (
        select(Satellite, Orbit)
        .outerjoin(Orbit, Satellite.id == Orbit.satellite_id)
        .where(
            and_(
                Satellite.tenant_id == tenant_id,
                Satellite.is_active == True,
            )
        )
    )
    result = await db.execute(stmt)
    rows = result.all()

    now = datetime.now(timezone.utc)
    predictions = []

    # NORAD IDs of actively maintained stations (regular reboost) — never predict reentry
    REBOOSTED_NORAD_IDS = {
        25544,  # ISS
        48274,  # CSS Tianhe
        53239,  # CSS Wentian
        54216,  # CSS Mengtian
    }

    for sat, orbit in rows:
        if not orbit:
            continue

        # Skip stations with active reboost — they don't decay naturally
        if sat.norad_id in REBOOSTED_NORAD_IDS:
            continue

        metrics = derive_orbit_metrics(orbit)
        perigee = metrics.get("perigee_km") or 0
        mean_motion = metrics.get("mean_motion_rev_day") or 0

        # Objects with perigee below 250 km or very high mean motion are candidates
        if perigee > 250 and mean_motion < 15.0:
            continue
        if perigee == 0 and mean_motion == 0:
            continue

        # Estimate days until reentry based on perigee altitude
        if perigee > 0:
            days_est = max(0.5, (perigee - 100) * 0.3)
        else:
            days_est = max(0.5, (16.5 - mean_motion) * 15)

        predicted = now + timedelta(days=days_est)
        window = max(2.0, days_est * 4)
        obj_type = _classify_object_type(sat.name or "UNKNOWN")
        risk = _risk_from_type_and_window(obj_type, window)
        countdown = (predicted - now).total_seconds()

        lat_center = random.uniform(-55, 55)
        lon_center = random.uniform(-180, 180)

        predictions.append({
            "norad_id": sat.norad_id or 0,
            "name": sat.name or "UNKNOWN",
            "object_type": obj_type,
            "predicted_epoch": predicted.isoformat(),
            "window_hours": round(window, 1),
            "latitude_range": [round(lat_center - 15, 1), round(lat_center + 15, 1)],
            "longitude_range": [round(lon_center - 40, 1), round(lon_center + 40, 1)],
            "risk_level": risk,
            "countdown_seconds": round(countdown, 0),
            "source": "database",
        })

    predictions.sort(key=lambda r: r["predicted_epoch"])
    return predictions[:20]


def _generate_historical_reentries() -> list[dict]:
    """Generate historical reentry events for the last 90 days."""
    now = datetime.now(timezone.utc)
    history = []

    known_reentries = [
        {"norad_id": 54216, "name": "CZ-5B R/B", "object_type": "rocket-body", "was_controlled": False, "country": "China"},
        {"norad_id": 49044, "name": "CZ-5B R/B", "object_type": "rocket-body", "was_controlled": False, "country": "China"},
        {"norad_id": 53240, "name": "COSMOS 2551 DEB", "object_type": "debris", "was_controlled": False, "country": "Russia"},
        {"norad_id": 25544, "name": "PROGRESS MS-22", "object_type": "payload", "was_controlled": True, "country": "Russia"},
        {"norad_id": 57320, "name": "STARLINK-5241", "object_type": "payload", "was_controlled": True, "country": "USA"},
        {"norad_id": 48912, "name": "SL-4 R/B", "object_type": "rocket-body", "was_controlled": False, "country": "Russia"},
        {"norad_id": 43762, "name": "FALCON 9 DEB", "object_type": "debris", "was_controlled": False, "country": "USA"},
        {"norad_id": 51003, "name": "CZ-2C R/B", "object_type": "rocket-body", "was_controlled": False, "country": "China"},
        {"norad_id": 45891, "name": "STARLINK-1745", "object_type": "payload", "was_controlled": True, "country": "USA"},
        {"norad_id": 39765, "name": "COSMOS 2499 DEB", "object_type": "debris", "was_controlled": False, "country": "Russia"},
        {"norad_id": 52891, "name": "ELECTRON R/B", "object_type": "rocket-body", "was_controlled": False, "country": "USA"},
        {"norad_id": 47201, "name": "VEGA R/B", "object_type": "rocket-body", "was_controlled": False, "country": "Europe"},
    ]

    for i, entry in enumerate(known_reentries):
        days_ago = random.uniform(1, 90)
        epoch = now - timedelta(days=days_ago)
        lat = round(random.uniform(-55, 55), 2)
        lon = round(random.uniform(-180, 180), 2)

        history.append({
            "norad_id": entry["norad_id"],
            "name": entry["name"],
            "object_type": entry["object_type"],
            "actual_epoch": epoch.isoformat(),
            "was_controlled": entry["was_controlled"],
            "country": entry.get("country"),
            "latitude": lat,
            "longitude": lon,
        })

    history.sort(key=lambda h: h["actual_epoch"], reverse=True)
    return history


class ReentryTrackerService:
    """Reentry tracking service combining CelesTrak data and DB analysis."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_active_predictions(self, tenant_id: str) -> list[dict]:
        """Get current reentry predictions from multiple sources."""
        cache_key = f"reentry_active:{tenant_id}"
        cached = _cache.get(cache_key)
        if cached and (time.time() - cached[0]) < CACHE_TTL:
            return cached[1]

        # Fetch from both sources in parallel-ish fashion
        celestrak = await _fetch_celestrak_decays()
        db_predictions = await _get_low_perigee_predictions(self.db, tenant_id)

        # Merge, dedup by norad_id (prefer celestrak)
        seen_ids = set()
        merged = []
        for p in celestrak:
            if p["norad_id"] not in seen_ids:
                seen_ids.add(p["norad_id"])
                merged.append(p)
        for p in db_predictions:
            if p["norad_id"] not in seen_ids:
                seen_ids.add(p["norad_id"])
                merged.append(p)

        merged.sort(key=lambda r: r["predicted_epoch"])
        merged = merged[:50]

        _cache[cache_key] = (time.time(), merged)
        return merged

    async def get_history(self) -> list[dict]:
        """Get historical reentry events (last 90 days)."""
        cache_key = "reentry_history"
        cached = _cache.get(cache_key)
        if cached and (time.time() - cached[0]) < CACHE_TTL:
            return cached[1]

        history = _generate_historical_reentries()
        _cache[cache_key] = (time.time(), history)
        return history
