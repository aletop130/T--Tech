"""Celery tasks for traffic data polling."""
import asyncio
import logging

import redis.asyncio as aioredis

from app.celery_app import celery_app
from app.core.config import settings

logger = logging.getLogger(__name__)


@celery_app.task(name="app.tasks.poll_aircraft")
def poll_aircraft():
    """Poll OpenSky for active area presets."""
    from app.services.aircraft import AircraftService, AREA_PRESETS

    async def _run():
        r = aioredis.from_url(settings.REDIS_URL, decode_responses=False)
        try:
            svc = AircraftService(r)
            for key, area in AREA_PRESETS.items():
                if key == "global":
                    continue
                bbox = area["bbox"]
                try:
                    positions = await svc.fetch_positions(bbox)
                    logger.info("Polled %d aircraft for %s", len(positions), key)
                except Exception as exc:
                    logger.error("Aircraft poll failed for %s: %s", key, exc)
        finally:
            await r.aclose()

    asyncio.get_event_loop().run_until_complete(_run())
