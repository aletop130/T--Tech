"""Vessel tracking service using MyShipTracking.com REST API."""
import hashlib
import json
import logging
from datetime import datetime, timezone

import httpx
import redis.asyncio as aioredis

from app.core.config import settings

logger = logging.getLogger(__name__)

MYSHIP_BASE = "https://api.myshiptracking.com/api/v2"
CACHE_TTL = 3600  # 1 hour cache to save credits

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


class VesselService:
    def __init__(self, redis: aioredis.Redis):
        self.redis = redis

    def _cache_key(self, bbox: dict | None) -> str:
        raw = json.dumps(bbox, sort_keys=True) if bbox else "global"
        h = hashlib.md5(raw.encode()).hexdigest()[:12]
        return f"vessels:bbox:{h}"

    async def fetch_positions(self, bbox: dict | None = None) -> list[dict]:
        """Fetch vessel positions from MyShipTracking zone API."""
        api_key = settings.MYSHIPTRACKING_API_KEY
        if not api_key:
            logger.warning("MYSHIPTRACKING_API_KEY not set")
            return []

        if not bbox:
            # Default to Hormuz if no bbox
            bbox = AREA_PRESETS["hormuz"]["bbox"]

        params = {
            "minlat": bbox["lat_min"],
            "maxlat": bbox["lat_max"],
            "minlon": bbox["lon_min"],
            "maxlon": bbox["lon_max"],
            "response": "simple",
            "minutesBack": 60,
        }
        headers = {"Authorization": f"Bearer {api_key}"}

        try:
            async with httpx.AsyncClient(timeout=20) as client:
                resp = await client.get(f"{MYSHIP_BASE}/vessel/zone", params=params, headers=headers)
                resp.raise_for_status()
                data = resp.json()
        except Exception as exc:
            logger.error("MyShipTracking fetch failed: %s", exc)
            return []

        if data.get("status") != "success":
            logger.warning("MyShipTracking error: %s", data.get("message") or data.get("code"))
            return []

        vessels = data.get("data") or []
        now = datetime.now(timezone.utc).isoformat()
        results = []

        for v in vessels:
            lat = v.get("lat")
            lng = v.get("lng")
            if lat is None or lng is None:
                continue

            results.append({
                "mmsi": int(v.get("mmsi") or 0),
                "name": v.get("vessel_name") or None,
                "ship_type": v.get("vtype"),
                "latitude": float(lat),
                "longitude": float(lng),
                "heading_deg": float(v["course"]) if v.get("course") not in (None, 511) else None,
                "speed_knots": float(v["speed"]) if v.get("speed") is not None else None,
                "course": float(v["course"]) if v.get("course") not in (None, 511) else None,
                "destination": None,
                "last_seen": v.get("received") or now,
            })

        # Cache to avoid burning credits
        cache_key = self._cache_key(bbox)
        await self.redis.setex(cache_key, CACHE_TTL, json.dumps(results))

        return results

    async def get_positions(self, bbox: dict | None = None) -> list[dict]:
        """Get positions from cache first, fetch only if expired."""
        cache_key = self._cache_key(bbox)
        cached = await self.redis.get(cache_key)
        if cached:
            return json.loads(cached)
        return await self.fetch_positions(bbox)

    async def update_subscription(self, bbox_list: list[dict]):
        """Compatibility — triggers a fresh fetch for the first bbox."""
        if bbox_list:
            await self.fetch_positions(bbox_list[0])

    def resolve_bbox(self, preset: str | None) -> dict | None:
        if not preset:
            return None
        area = AREA_PRESETS.get(preset)
        if area:
            return area["bbox"]
        return None
