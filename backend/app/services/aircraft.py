"""Aircraft tracking service using OpenSky Network REST API."""
import hashlib
import json
import logging
from datetime import datetime, timezone

import httpx
import redis.asyncio as aioredis

from app.core.config import settings

logger = logging.getLogger(__name__)

AREA_PRESETS = {
    "italy": {"label": "Italia", "bbox": {"lat_min": 36, "lat_max": 47, "lon_min": 6, "lon_max": 19}},
    "mediterranean": {"label": "Mediterraneo", "bbox": {"lat_min": 30, "lat_max": 46, "lon_min": -6, "lon_max": 36}},
    "europe": {"label": "Europa", "bbox": {"lat_min": 35, "lat_max": 72, "lon_min": -25, "lon_max": 45}},
    "middle_east": {"label": "Medio Oriente", "bbox": {"lat_min": 12, "lat_max": 42, "lon_min": 25, "lon_max": 63}},
    "north_america": {"label": "Nord America", "bbox": {"lat_min": 15, "lat_max": 72, "lon_min": -170, "lon_max": -50}},
    "east_asia": {"label": "Asia Orientale", "bbox": {"lat_min": 10, "lat_max": 55, "lon_min": 90, "lon_max": 150}},
    "baltic": {"label": "Baltico", "bbox": {"lat_min": 53, "lat_max": 66, "lon_min": 10, "lon_max": 30}},
    "hormuz": {"label": "Stretto di Hormuz", "bbox": {"lat_min": 24, "lat_max": 27.5, "lon_min": 54, "lon_max": 58}},
    "persian_gulf": {"label": "Golfo Persico", "bbox": {"lat_min": 23, "lat_max": 31, "lon_min": 47, "lon_max": 57}},
    "gulf_oman": {"label": "Golfo di Oman", "bbox": {"lat_min": 22, "lat_max": 27, "lon_min": 56, "lon_max": 62}},
    "suez": {"label": "Canale di Suez", "bbox": {"lat_min": 29, "lat_max": 32, "lon_min": 32, "lon_max": 34}},
    "gibraltar": {"label": "Stretto di Gibilterra", "bbox": {"lat_min": 35, "lat_max": 37, "lon_min": -6.5, "lon_max": -4}},
    "global": {"label": "Globale", "bbox": None},
}

OPENSKY_API_BASE = "https://opensky-network.org/api"


class AircraftService:
    def __init__(self, redis: aioredis.Redis):
        self.redis = redis

    def _get_auth(self) -> httpx.BasicAuth | None:
        """Get HTTP Basic Auth if credentials are configured."""
        username = settings.OPENSKY_CLIENT_ID
        password = settings.OPENSKY_CLIENT_SECRET
        if username and password:
            return httpx.BasicAuth(username, password)
        return None

    def _bbox_cache_key(self, bbox: dict | None) -> str:
        raw = json.dumps(bbox, sort_keys=True) if bbox else "global"
        h = hashlib.md5(raw.encode()).hexdigest()[:12]
        return f"aircraft:bbox:{h}"

    async def fetch_positions(self, bbox: dict | None = None) -> list[dict]:
        """Fetch live aircraft positions from OpenSky Network."""
        params = {}
        if bbox:
            params = {
                "lamin": bbox["lat_min"],
                "lamax": bbox["lat_max"],
                "lomin": bbox["lon_min"],
                "lomax": bbox["lon_max"],
            }

        auth = self._get_auth()
        url = f"{OPENSKY_API_BASE}/states/all"

        try:
            async with httpx.AsyncClient(timeout=30) as client:
                resp = await client.get(url, params=params, auth=auth)
                resp.raise_for_status()
                data = resp.json()
        except Exception as exc:
            logger.error("OpenSky fetch failed: %s", exc)
            return []

        states = data.get("states") or []
        now = datetime.now(timezone.utc)
        results = []

        for sv in states:
            if len(sv) < 17:
                continue
            lat = sv[6]
            lon = sv[5]
            if lat is None or lon is None:
                continue

            results.append({
                "icao24": sv[0] or "",
                "callsign": (sv[1] or "").strip() or None,
                "latitude": float(lat),
                "longitude": float(lon),
                "altitude_m": float(sv[7] or sv[13] or 0),
                "heading_deg": float(sv[10]) if sv[10] is not None else None,
                "speed_ms": float(sv[9]) if sv[9] is not None else None,
                "vertical_rate": float(sv[11]) if sv[11] is not None else None,
                "on_ground": bool(sv[8]),
                "category": int(sv[16]) if sv[16] is not None else None,
                "last_seen": datetime.fromtimestamp(sv[4] or now.timestamp(), tz=timezone.utc).isoformat(),
            })

        # Cache results
        cache_key = self._bbox_cache_key(bbox)
        await self.redis.setex(cache_key, 30, json.dumps(results))

        return results

    async def get_cached(self, bbox: dict | None = None) -> list[dict] | None:
        cache_key = self._bbox_cache_key(bbox)
        cached = await self.redis.get(cache_key)
        if cached:
            return json.loads(cached)
        return None

    async def get_positions(self, bbox: dict | None = None) -> list[dict]:
        """Get positions from cache or fetch live."""
        cached = await self.get_cached(bbox)
        if cached is not None:
            return cached
        return await self.fetch_positions(bbox)

    def resolve_bbox(self, preset: str | None) -> dict | None:
        if not preset:
            return None
        area = AREA_PRESETS.get(preset)
        if area:
            return area["bbox"]
        return None
