"""Launch Correlation Engine.

Matches new catalog objects to their launch of origin by querying
The Space Devs API and correlating with CelesTrak catalog data.
"""

from __future__ import annotations

import time
from datetime import datetime, timedelta, timezone
from typing import Optional

import httpx
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import get_logger
from app.db.models.ontology import Satellite, Orbit
from app.services.intelligence_support import derive_orbit_metrics

logger = get_logger(__name__)

SPACE_DEVS_BASE = "https://ll.thespacedevs.com/2.3.0"

# In-memory cache: { key: (data, expiry_timestamp) }
_cache: dict[str, tuple[object, float]] = {}
CACHE_TTL_SECONDS = 3600  # 1 hour


def _get_cached(key: str) -> Optional[object]:
    entry = _cache.get(key)
    if entry and entry[1] > time.time():
        return entry[0]
    return None


def _set_cached(key: str, data: object) -> None:
    _cache[key] = (data, time.time() + CACHE_TTL_SECONDS)


# Orbit name mapping from Space Devs to our orbit types
ORBIT_MAP = {
    "Low Earth Orbit": "LEO",
    "Sun-Synchronous Orbit": "SSO",
    "Medium Earth Orbit": "MEO",
    "Geostationary Orbit": "GEO",
    "Geosynchronous Orbit": "GEO",
    "Geostationary Transfer Orbit": "GTO",
    "Highly Elliptical Orbit": "HEO",
    "Polar Orbit": "LEO",
    "Sub-Orbital": "SUB",
}


def _normalize_orbit(orbit_name: Optional[str]) -> Optional[str]:
    if not orbit_name:
        return None
    return ORBIT_MAP.get(orbit_name, orbit_name)


def _classify_orbit_from_params(
    inclination_deg: Optional[float],
    period_minutes: Optional[float],
    mean_motion: Optional[float],
) -> Optional[str]:
    """Classify orbit type from orbital parameters."""
    if mean_motion is not None:
        if mean_motion > 11:
            return "LEO"
        elif mean_motion > 1.5:
            return "MEO"
        elif 0.9 < mean_motion < 1.1:
            return "GEO"
    if period_minutes is not None:
        if period_minutes < 128:
            return "LEO"
        elif period_minutes < 720:
            return "MEO"
        elif 1400 < period_minutes < 1500:
            return "GEO"
    return None


def _coerce_orbit_type(value: object) -> Optional[str]:
    if value is None:
        return None
    if isinstance(value, str):
        return value.upper()
    return getattr(value, "value", None)


def _build_sat_orbit_index(orbits: list[Orbit]) -> dict[str, dict]:
    sat_orbits: dict[str, dict] = {}
    for orbit in orbits:
        metrics = derive_orbit_metrics(orbit)
        current = sat_orbits.get(orbit.satellite_id)
        next_epoch = metrics.get("epoch")
        current_epoch = current.get("epoch") if current else None
        if current and current_epoch and next_epoch and next_epoch <= current_epoch:
            continue

        orbit_type = _classify_orbit_from_params(
            metrics.get("inclination_deg"),
            metrics.get("period_minutes"),
            metrics.get("mean_motion_rev_day"),
        ) or _coerce_orbit_type(orbit.orbit_type)

        sat_orbits[orbit.satellite_id] = {
            "epoch": next_epoch,
            "orbit_type": orbit_type,
            "inclination_deg": metrics.get("inclination_deg"),
            "mean_motion": metrics.get("mean_motion_rev_day"),
            "period_minutes": metrics.get("period_minutes"),
        }
    return sat_orbits


def _compute_correlation_confidence(
    launch_date: Optional[datetime],
    object_epoch: Optional[datetime],
    launch_orbit: Optional[str],
    object_orbit: Optional[str],
    launch_country: Optional[str],
    object_country: Optional[str],
) -> float:
    """Compute correlation confidence between a launch and catalog object."""
    score = 0.0
    weights_total = 0.0

    # Date matching (weight: 0.5) - within 7 days
    if launch_date and object_epoch:
        ld = launch_date.replace(tzinfo=timezone.utc) if launch_date.tzinfo is None else launch_date
        oe = object_epoch.replace(tzinfo=timezone.utc) if object_epoch.tzinfo is None else object_epoch
        delta_days = abs((oe - ld).total_seconds()) / 86400.0
        if delta_days <= 7:
            date_score = max(0, 1.0 - (delta_days / 7.0))
            score += 0.5 * date_score
        weights_total += 0.5

    # Orbit matching (weight: 0.3)
    if launch_orbit and object_orbit:
        norm_launch = _normalize_orbit(launch_orbit)
        if norm_launch and norm_launch == object_orbit:
            score += 0.3
        weights_total += 0.3

    # Country matching (weight: 0.2)
    if launch_country and object_country:
        lc = launch_country.upper()
        oc = object_country.upper()
        # Fuzzy country match
        country_aliases = {
            "USA": ["US", "USA", "UNITED STATES"],
            "RUS": ["RUS", "RUSSIA", "CIS", "RUSSIAN FEDERATION"],
            "CHN": ["CHN", "CHINA", "PRC"],
            "IND": ["IND", "INDIA"],
            "JPN": ["JPN", "JAPAN"],
            "EUR": ["EUR", "ESA", "EUROPE", "FRANCE", "GERMANY", "ITALY", "UK"],
        }
        match = False
        for _key, aliases in country_aliases.items():
            if any(a in lc for a in aliases) and any(a in oc for a in aliases):
                match = True
                break
        if match or lc == oc:
            score += 0.2
        weights_total += 0.2

    if weights_total == 0:
        return 0.0

    return round(min(score / weights_total, 1.0), 4)


def _parse_launch(launch_data: dict) -> dict:
    """Parse a launch from Space Devs API response."""
    net_str = launch_data.get("net")
    net = None
    if net_str:
        try:
            net = datetime.fromisoformat(net_str.replace("Z", "+00:00"))
        except (ValueError, TypeError):
            pass

    pad = launch_data.get("pad") or {}
    location = pad.get("location") or {}
    rocket_config = (launch_data.get("rocket") or {}).get("configuration") or {}
    mission = launch_data.get("mission") or {}
    mission_orbit = (mission.get("orbit") or {}).get("name") if isinstance(mission.get("orbit"), dict) else None
    status = (launch_data.get("status") or {}).get("name", "Unknown")

    return {
        "id": str(launch_data.get("id", "")),
        "name": launch_data.get("name", "Unknown"),
        "net": net,
        "pad_name": pad.get("name"),
        "pad_country": location.get("country_code"),
        "rocket_name": rocket_config.get("name") or launch_data.get("name", "").split("|")[0].strip(),
        "mission_name": mission.get("name"),
        "mission_orbit": mission_orbit,
        "status": status,
    }


async def _fetch_launches(url: str, cache_key: str) -> list[dict]:
    """Fetch launches from Space Devs API with caching."""
    cached = _get_cached(cache_key)
    if cached is not None:
        return cached  # type: ignore

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.get(url)
            resp.raise_for_status()
            data = resp.json()

        results = data.get("results", [])
        launches = [_parse_launch(l) for l in results]
        _set_cached(cache_key, launches)
        return launches
    except Exception as e:
        logger.error(f"Failed to fetch launches from {url}: {e}")
        return []


class LaunchCorrelationService:
    """Correlates new catalog objects with recent launches."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_recent_launches_correlated(self, tenant_id: str) -> dict:
        """Get recent launches with correlated catalog objects."""
        url = f"{SPACE_DEVS_BASE}/launches/previous/?mode=list&limit=20"
        launches = await _fetch_launches(url, "recent_launches")

        # Get recent satellites from DB (last 30 days)
        cutoff = datetime.utcnow() - timedelta(days=30)
        stmt = (
            select(Satellite)
            .where(Satellite.tenant_id == tenant_id)
            .where(Satellite.created_at >= cutoff)
            .order_by(desc(Satellite.created_at))
            .limit(200)
        )
        result = await self.db.execute(stmt)
        satellites = result.scalars().all()

        # Get orbits for these satellites
        sat_orbits: dict[str, dict] = {}
        if satellites:
            sat_ids = [s.id for s in satellites]
            orbit_stmt = (
                select(Orbit)
                .where(Orbit.satellite_id.in_(sat_ids))
                .order_by(desc(Orbit.epoch))
            )
            orbit_result = await self.db.execute(orbit_stmt)
            sat_orbits = _build_sat_orbit_index(orbit_result.scalars().all())

        # Correlate
        launch_correlations = []
        correlated_sat_ids: set[str] = set()
        total_correlated = 0

        for launch in launches:
            correlated = []
            for sat in satellites:
                orbit_data = sat_orbits.get(sat.id, {})
                confidence = _compute_correlation_confidence(
                    launch_date=launch.get("net"),
                    object_epoch=orbit_data.get("epoch"),
                    launch_orbit=launch.get("mission_orbit"),
                    object_orbit=orbit_data.get("orbit_type"),
                    launch_country=launch.get("pad_country"),
                    object_country=sat.country,
                )
                if confidence >= 0.3:
                    correlated.append({
                        "norad_id": sat.norad_id,
                        "name": sat.name,
                        "correlation_confidence": confidence,
                        "epoch": orbit_data.get("epoch"),
                        "orbit_type": orbit_data.get("orbit_type"),
                    })
                    correlated_sat_ids.add(sat.id)

            correlated.sort(key=lambda x: -x["correlation_confidence"])
            total_correlated += len(correlated)
            launch_correlations.append({
                "launch": launch,
                "correlated_objects": correlated,
                "total_correlated": len(correlated),
            })

        return {
            "launches": launch_correlations,
            "total_launches": len(launch_correlations),
            "total_correlated_objects": total_correlated,
            "cached_at": datetime.now(timezone.utc).isoformat(),
        }

    async def get_uncorrelated_objects(self, tenant_id: str) -> dict:
        """Get catalog objects that don't match any recent launch."""
        url = f"{SPACE_DEVS_BASE}/launches/previous/?mode=list&limit=20"
        launches = await _fetch_launches(url, "recent_launches")

        cutoff = datetime.utcnow() - timedelta(days=30)
        stmt = (
            select(Satellite)
            .where(Satellite.tenant_id == tenant_id)
            .where(Satellite.created_at >= cutoff)
            .order_by(desc(Satellite.created_at))
            .limit(200)
        )
        result = await self.db.execute(stmt)
        satellites = result.scalars().all()

        # Get orbits
        sat_orbits: dict[str, dict] = {}
        if satellites:
            sat_ids = [s.id for s in satellites]
            orbit_stmt = (
                select(Orbit)
                .where(Orbit.satellite_id.in_(sat_ids))
                .order_by(desc(Orbit.epoch))
            )
            orbit_result = await self.db.execute(orbit_stmt)
            sat_orbits = _build_sat_orbit_index(orbit_result.scalars().all())

        uncorrelated = []
        for sat in satellites:
            orbit_data = sat_orbits.get(sat.id, {})
            best_confidence = 0.0
            possible = []

            for launch in launches:
                confidence = _compute_correlation_confidence(
                    launch_date=launch.get("net"),
                    object_epoch=orbit_data.get("epoch"),
                    launch_orbit=launch.get("mission_orbit"),
                    object_orbit=orbit_data.get("orbit_type"),
                    launch_country=launch.get("pad_country"),
                    object_country=sat.country,
                )
                if confidence > best_confidence:
                    best_confidence = confidence
                if 0.1 <= confidence < 0.3:
                    possible.append(launch)

            if best_confidence < 0.3:
                uncorrelated.append({
                    "norad_id": sat.norad_id,
                    "name": sat.name,
                    "epoch": orbit_data.get("epoch"),
                    "orbit_params": {
                        "inclination_deg": orbit_data.get("inclination_deg"),
                        "mean_motion": orbit_data.get("mean_motion"),
                        "period_minutes": orbit_data.get("period_minutes"),
                        "orbit_type": orbit_data.get("orbit_type"),
                    },
                    "possible_launches": possible[:3],
                })

        return {
            "objects": uncorrelated,
            "total": len(uncorrelated),
        }

    async def get_launch_detail(self, tenant_id: str, launch_id: str) -> dict:
        """Get details of a specific launch with all correlated objects."""
        url = f"{SPACE_DEVS_BASE}/launches/previous/?mode=list&limit=20"
        launches = await _fetch_launches(url, "recent_launches")

        # Also check upcoming
        upcoming_url = f"{SPACE_DEVS_BASE}/launches/upcoming/?mode=list&limit=10"
        upcoming = await _fetch_launches(upcoming_url, "upcoming_launches")

        target_launch = None
        for l in launches + upcoming:
            if l["id"] == launch_id:
                target_launch = l
                break

        if not target_launch:
            return {"launch": None, "correlated_objects": [], "total_correlated": 0}

        # Correlate with DB satellites
        cutoff = datetime.utcnow() - timedelta(days=30)
        stmt = (
            select(Satellite)
            .where(Satellite.tenant_id == tenant_id)
            .where(Satellite.created_at >= cutoff)
            .order_by(desc(Satellite.created_at))
            .limit(200)
        )
        result = await self.db.execute(stmt)
        satellites = result.scalars().all()

        sat_orbits: dict[str, dict] = {}
        if satellites:
            sat_ids = [s.id for s in satellites]
            orbit_stmt = (
                select(Orbit)
                .where(Orbit.satellite_id.in_(sat_ids))
                .order_by(desc(Orbit.epoch))
            )
            orbit_result = await self.db.execute(orbit_stmt)
            sat_orbits = _build_sat_orbit_index(orbit_result.scalars().all())

        correlated = []
        for sat in satellites:
            orbit_data = sat_orbits.get(sat.id, {})
            confidence = _compute_correlation_confidence(
                launch_date=target_launch.get("net"),
                object_epoch=orbit_data.get("epoch"),
                launch_orbit=target_launch.get("mission_orbit"),
                object_orbit=orbit_data.get("orbit_type"),
                launch_country=target_launch.get("pad_country"),
                object_country=sat.country,
            )
            if confidence >= 0.2:
                correlated.append({
                    "norad_id": sat.norad_id,
                    "name": sat.name,
                    "correlation_confidence": confidence,
                    "epoch": orbit_data.get("epoch"),
                    "orbit_type": orbit_data.get("orbit_type"),
                })

        correlated.sort(key=lambda x: -x["correlation_confidence"])

        return {
            "launch": target_launch,
            "correlated_objects": correlated,
            "total_correlated": len(correlated),
        }

    async def get_upcoming_launches(self) -> dict:
        """Get upcoming launches from Space Devs API."""
        url = f"{SPACE_DEVS_BASE}/launches/upcoming/?mode=list&limit=10"
        launches = await _fetch_launches(url, "upcoming_launches")
        return {
            "launches": launches,
            "total": len(launches),
        }
