"""RF Spectrum service using SatNOGS DB API."""
import time
from typing import Optional

import httpx

from app.core.logging import get_logger

logger = get_logger(__name__)

SATNOGS_BASE = "https://db.satnogs.org/api"

# Band classification
BANDS = {
    "HF": (3e6, 30e6),
    "VHF": (30e6, 300e6),
    "UHF": (300e6, 3e9),
    "S-band": (2e9, 4e9),
    "C-band": (4e9, 8e9),
    "X-band": (8e9, 12e9),
    "Ku-band": (12e9, 18e9),
    "Ka-band": (26.5e9, 40e9),
}

BAND_DISPLAY = {
    "HF": "3 - 30 MHz",
    "VHF": "30 - 300 MHz",
    "UHF": "300 MHz - 3 GHz",
    "S-band": "2 - 4 GHz",
    "C-band": "4 - 8 GHz",
    "X-band": "8 - 12 GHz",
    "Ku-band": "12 - 18 GHz",
    "Ka-band": "26.5 - 40 GHz",
}

# Cache: (timestamp, data)
_transmitters_cache: tuple[float, list[dict]] | None = None
_modes_cache: tuple[float, list[dict]] | None = None
CACHE_TTL = 3600  # 1 hour


def classify_band(freq_hz: Optional[float]) -> str:
    """Classify a frequency into an RF band."""
    if freq_hz is None or freq_hz <= 0:
        return "Unknown"
    for band_name, (low, high) in BANDS.items():
        if low <= freq_hz < high:
            return band_name
    if freq_hz >= 40e9:
        return "EHF"
    return "Unknown"


def _primary_freq(tx: dict) -> Optional[float]:
    """Get the primary frequency for a transmitter (prefer downlink)."""
    dl = tx.get("downlink_low")
    if dl and dl > 0:
        return dl
    ul = tx.get("uplink_low")
    if ul and ul > 0:
        return ul
    return None


async def _fetch_all_transmitters() -> list[dict]:
    """Fetch all transmitters from SatNOGS with pagination."""
    global _transmitters_cache
    now = time.time()
    if _transmitters_cache and (now - _transmitters_cache[0]) < CACHE_TTL:
        return _transmitters_cache[1]

    all_transmitters: list[dict] = []
    url: Optional[str] = f"{SATNOGS_BASE}/transmitters/"
    async with httpx.AsyncClient(timeout=30.0) as client:
        while url:
            try:
                resp = await client.get(url)
                resp.raise_for_status()
                data = resp.json()
                if isinstance(data, list):
                    all_transmitters.extend(data)
                    # SatNOGS uses Link header for pagination
                    link = resp.headers.get("link", "")
                    url = None
                    if 'rel="next"' in link:
                        for part in link.split(","):
                            if 'rel="next"' in part:
                                url = part.split(";")[0].strip().strip("<>")
                                break
                elif isinstance(data, dict) and "results" in data:
                    all_transmitters.extend(data["results"])
                    url = data.get("next")
                else:
                    break
            except Exception as e:
                logger.error("satnogs_fetch_error", error=str(e), url=url)
                break

    logger.info("satnogs_transmitters_fetched", count=len(all_transmitters))
    _transmitters_cache = (now, all_transmitters)
    return all_transmitters


async def _fetch_modes() -> list[dict]:
    """Fetch transmission modes from SatNOGS."""
    global _modes_cache
    now = time.time()
    if _modes_cache and (now - _modes_cache[0]) < CACHE_TTL:
        return _modes_cache[1]

    async with httpx.AsyncClient(timeout=15.0) as client:
        try:
            resp = await client.get(f"{SATNOGS_BASE}/modes/")
            resp.raise_for_status()
            data = resp.json()
            modes = data if isinstance(data, list) else data.get("results", [])
            _modes_cache = (now, modes)
            return modes
        except Exception as e:
            logger.error("satnogs_modes_error", error=str(e))
            return []


def _to_transmitter_dict(tx: dict) -> dict:
    """Normalize a SatNOGS transmitter to our schema."""
    freq = _primary_freq(tx)
    return {
        "uuid": tx.get("uuid", ""),
        "norad_cat_id": tx.get("norad_cat_id"),
        "description": tx.get("description", ""),
        "alive": tx.get("alive", True),
        "type": tx.get("type", ""),
        "uplink_low": tx.get("uplink_low"),
        "uplink_high": tx.get("uplink_high"),
        "downlink_low": tx.get("downlink_low"),
        "downlink_high": tx.get("downlink_high"),
        "mode": tx.get("mode"),
        "baud": tx.get("baud"),
        "status": tx.get("status", "active"),
        "band": classify_band(freq),
    }


async def get_satellite_rf_profile(norad_id: int) -> dict:
    """Get RF profile for a specific satellite."""
    async with httpx.AsyncClient(timeout=15.0) as client:
        try:
            resp = await client.get(
                f"{SATNOGS_BASE}/transmitters/",
                params={"satellite__norad_cat_id": norad_id},
            )
            resp.raise_for_status()
            data = resp.json()
            raw_list = data if isinstance(data, list) else data.get("results", [])
        except Exception as e:
            logger.error("satnogs_satellite_error", norad_id=norad_id, error=str(e))
            raw_list = []

    transmitters = [_to_transmitter_dict(tx) for tx in raw_list]
    return {
        "norad_id": norad_id,
        "satellite_name": raw_list[0].get("satellite_name", "") if raw_list else "",
        "transmitters": transmitters,
    }


async def search_transmitters(
    band: Optional[str] = None,
    mode: Optional[str] = None,
    alive_only: bool = True,
) -> dict:
    """Search/filter transmitters across all satellites."""
    all_tx = await _fetch_all_transmitters()

    results = []
    for tx in all_tx:
        if alive_only and not tx.get("alive", True):
            continue
        normalized = _to_transmitter_dict(tx)
        if band and normalized["band"].lower() != band.lower():
            continue
        if mode and (normalized["mode"] or "").lower() != mode.lower():
            continue
        results.append(normalized)

    return {
        "transmitters": results,
        "total": len(results),
        "band_filter": band,
        "mode_filter": mode,
    }


async def get_band_summary() -> list[dict]:
    """Get summary of band usage across all transmitters."""
    all_tx = await _fetch_all_transmitters()

    band_stats: dict[str, dict] = {}
    for band_name in BANDS:
        band_stats[band_name] = {
            "band_name": band_name,
            "frequency_range": BAND_DISPLAY.get(band_name, ""),
            "satellites": set(),
            "transmitter_count": 0,
        }

    for tx in all_tx:
        if not tx.get("alive", True):
            continue
        freq = _primary_freq(tx)
        band = classify_band(freq)
        if band in band_stats:
            band_stats[band]["transmitter_count"] += 1
            norad = tx.get("norad_cat_id")
            if norad:
                band_stats[band]["satellites"].add(norad)

    return [
        {
            "band_name": s["band_name"],
            "frequency_range": s["frequency_range"],
            "satellite_count": len(s["satellites"]),
            "transmitter_count": s["transmitter_count"],
        }
        for s in band_stats.values()
    ]
