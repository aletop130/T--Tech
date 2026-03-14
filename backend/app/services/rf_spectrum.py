"""RF Spectrum service using SatNOGS DB API."""
import math
import time
from datetime import datetime, timezone
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


# ============== Operational Dashboard ==============

# NOAA SWPC endpoints for X-ray and proton flux
XRAY_URL = "https://services.swpc.noaa.gov/json/goes/primary/xrays-6-hour.json"
PROTON_URL = "https://services.swpc.noaa.gov/json/goes/primary/integral-protons-1-day.json"
KP_INDEX_URL = "https://services.swpc.noaa.gov/json/planetary_k_index_1m.json"
SOLAR_CYCLE_URL = "https://services.swpc.noaa.gov/json/solar-cycle/observed-solar-cycle-indices.json"

# Band vulnerability model
BAND_VULNERABILITY = {
    "HF": "ionospheric",
    "VHF": "ionospheric",
    "UHF": "scintillation",
    "S-band": "scintillation",
    "C-band": "none",
    "X-band": "none",
    "Ku-band": "rain_fade",
    "Ka-band": "rain_fade",
}

# Alternative band routing table
BAND_ALTERNATIVES = {
    "HF": ("X-band", "HF ionospheric absorption — route to X-band (immune to D-layer)"),
    "VHF": ("S-band", "VHF scintillation — route to S-band (above ionospheric cutoff)"),
    "UHF": ("X-band", "UHF scintillation risk — route to X-band (no ionospheric dependency)"),
    "S-band": ("X-band", "S-band margin reduced — route to X-band"),
}


def _classify_xray(flux: float) -> str:
    """Classify X-ray flux into solar flare class."""
    if flux >= 1e-4:
        return "X"
    if flux >= 1e-5:
        return "M"
    if flux >= 1e-6:
        return "C"
    if flux >= 1e-7:
        return "B"
    return "A"


async def _fetch_xray_flux() -> tuple[Optional[float], Optional[str]]:
    """Fetch latest GOES X-ray flux."""
    cached = _get_sw_cached("xray")
    if cached is not None:
        return cached  # type: ignore

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(XRAY_URL)
            resp.raise_for_status()
            data = resp.json()
        if not data:
            return None, None
        # Get the latest 0.1-0.8nm (long) channel entry
        latest = data[-1]
        flux = float(latest.get("flux", 0))
        xclass = _classify_xray(flux)
        result = (flux, xclass)
        _set_sw_cached("xray", result)
        return result
    except Exception as exc:
        logger.warning("Failed to fetch X-ray flux: %s", exc)
        return None, None


async def _fetch_proton_flux() -> Optional[float]:
    """Fetch latest >10 MeV proton flux from GOES."""
    cached = _get_sw_cached("proton")
    if cached is not None:
        return cached  # type: ignore

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(PROTON_URL)
            resp.raise_for_status()
            data = resp.json()
        if not data:
            return None
        # Find the >10 MeV channel
        latest = data[-1]
        flux = float(latest.get("flux", 0))
        _set_sw_cached("proton", flux)
        return flux
    except Exception as exc:
        logger.warning("Failed to fetch proton flux: %s", exc)
        return None


async def _fetch_kp() -> tuple[float, str]:
    """Fetch latest Kp index."""
    cached = _get_sw_cached("kp_rf")
    if cached is not None:
        return cached  # type: ignore

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(KP_INDEX_URL)
            resp.raise_for_status()
            data = resp.json()
        if not data:
            return 2.0, datetime.now(timezone.utc).isoformat()
        latest = data[-1]
        kp = float(latest.get("kp_index", latest.get("kp", 2.0)))
        ts = latest.get("time_tag", datetime.now(timezone.utc).isoformat())
        result = (kp, ts)
        _set_sw_cached("kp_rf", result)
        return result
    except Exception as exc:
        logger.warning("Failed to fetch Kp: %s", exc)
        return 2.0, datetime.now(timezone.utc).isoformat()


async def _fetch_kp_trend() -> list[dict]:
    """Fetch Kp trend for forecast model."""
    cached = _get_sw_cached("kp_trend_rf")
    if cached is not None:
        return cached  # type: ignore

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(KP_INDEX_URL)
            resp.raise_for_status()
            data = resp.json()
        if not data:
            return []
        step = max(1, len(data) // 8)
        sampled = data[::step][-8:]
        trend = []
        for entry in sampled:
            kp_val = float(entry.get("kp_index", entry.get("kp", 0)))
            trend.append({"kp": round(kp_val, 1), "time": entry.get("time_tag", "")})
        _set_sw_cached("kp_trend_rf", trend)
        return trend
    except Exception as exc:
        logger.warning("Failed to fetch Kp trend: %s", exc)
        return []


async def _fetch_f10_7() -> Optional[float]:
    """Fetch latest F10.7 solar flux."""
    cached = _get_sw_cached("f10_7_rf")
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
        _set_sw_cached("f10_7_rf", f10_7)
        return f10_7
    except Exception as exc:
        logger.warning("Failed to fetch F10.7: %s", exc)
        return None


# Space weather cache (separate from SatNOGS cache)
_sw_cache: dict[str, tuple[float, object]] = {}
SW_CACHE_TTL = 300  # 5 minutes


def _get_sw_cached(key: str) -> object | None:
    entry = _sw_cache.get(key)
    if entry and (time.time() - entry[0]) < SW_CACHE_TTL:
        return entry[1]
    return None


def _set_sw_cached(key: str, value: object) -> None:
    _sw_cache[key] = (time.time(), value)


def _compute_band_status(
    band: str,
    kp: float,
    f10_7: Optional[float],
    xray_flux: Optional[float],
    xray_class: Optional[str],
    proton_flux: Optional[float],
    sat_count: int,
    tx_count: int,
) -> dict:
    """Compute operational status for a single band based on space weather."""
    freq_range = BAND_DISPLAY.get(band, "")
    vulnerability = BAND_VULNERABILITY.get(band, "none")
    status = "operational"
    degradation = 0.0
    reason = ""
    alternative = None

    if band == "HF":
        # HF is extremely vulnerable to ionospheric absorption
        # D-layer absorption from X-ray flares
        if xray_class in ("X", "M"):
            status = "blackout"
            degradation = 100.0 if xray_class == "X" else 80.0
            reason = f"HF blackout — {xray_class}-class solar flare (D-layer absorption)"
        elif kp >= 7:
            status = "blackout"
            degradation = 95.0
            reason = f"HF blackout — severe geomagnetic storm (Kp {kp:.1f})"
        elif kp >= 5:
            status = "degraded"
            degradation = min(80.0, (kp - 4) * 20.0)
            reason = f"HF degraded — geomagnetic storm (Kp {kp:.1f}), F-layer instability"
        elif kp >= 4:
            status = "degraded"
            degradation = 25.0
            reason = f"HF marginally degraded — elevated Kp ({kp:.1f})"
        # Proton events cause polar cap absorption
        if proton_flux and proton_flux > 10:
            status = "blackout" if proton_flux > 100 else "degraded"
            degradation = max(degradation, 90.0 if proton_flux > 100 else 60.0)
            reason = f"Polar cap absorption — proton flux {proton_flux:.0f} pfu"

    elif band == "VHF":
        if kp >= 7:
            status = "degraded"
            degradation = 60.0
            reason = f"VHF degraded — severe storm scintillation (Kp {kp:.1f})"
        elif kp >= 5:
            status = "degraded"
            degradation = min(40.0, (kp - 4) * 12.0)
            reason = f"VHF scintillation risk — storm activity (Kp {kp:.1f})"

    elif band == "UHF":
        # UHF vulnerable to scintillation, especially polar/equatorial
        if kp >= 8:
            status = "degraded"
            degradation = 50.0
            reason = f"UHF degraded — extreme scintillation (Kp {kp:.1f})"
        elif kp >= 6:
            status = "degraded"
            degradation = min(35.0, (kp - 5) * 12.0)
            reason = f"UHF scintillation active — storm (Kp {kp:.1f})"

    elif band == "S-band":
        # S-band has mild scintillation vulnerability
        if kp >= 8:
            status = "degraded"
            degradation = 20.0
            reason = f"S-band mild scintillation (Kp {kp:.1f})"

    # X, Ku, Ka, C bands: immune to ionospheric effects
    elif band in ("X-band", "Ku-band", "Ka-band"):
        # Note: Ku and Ka are vulnerable to rain fade, not solar weather
        if band in ("Ku-band", "Ka-band"):
            vulnerability = "rain_fade"
            reason = "Immune to ionospheric effects — primary vulnerability is rain fade"
        else:
            reason = "Immune to ionospheric disturbances"

    # Get alternative band if degraded
    if status in ("degraded", "blackout") and band in BAND_ALTERNATIVES:
        alt_band, alt_reason = BAND_ALTERNATIVES[band]
        alternative = alt_band

    return {
        "band_name": band,
        "frequency_range": freq_range,
        "status": status,
        "degradation_pct": round(degradation, 1),
        "reason": reason,
        "satellite_count": sat_count,
        "transmitter_count": tx_count,
        "vulnerability": vulnerability,
        "alternative_band": alternative,
    }


def _compute_scintillation(kp: float, f10_7: Optional[float]) -> list[dict]:
    """Compute S4 scintillation index by geographic region."""
    f = f10_7 or 100.0

    # Polar scintillation: driven by Kp and particle precipitation
    polar_s4 = 0.05 + (kp / 9.0) * 0.8 + max(0, (kp - 5)) * 0.15
    # Equatorial scintillation: driven by F10.7 (ionization) and Kp
    equatorial_s4 = 0.03 + (f / 300.0) * 0.3 + max(0, (kp - 4)) * 0.1
    # Mid-latitude: generally calm unless severe storm
    midlat_s4 = 0.02 + max(0, (kp - 6)) * 0.2

    def severity(s4: float) -> str:
        if s4 >= 0.6:
            return "strong"
        if s4 >= 0.3:
            return "moderate"
        if s4 >= 0.15:
            return "weak"
        return "none"

    def affected(s4: float) -> list[str]:
        bands = []
        if s4 >= 0.15:
            bands.append("UHF")
        if s4 >= 0.3:
            bands.append("VHF")
        if s4 >= 0.5:
            bands.extend(["S-band", "HF"])
        return bands

    return [
        {
            "region": "polar",
            "s4_index": round(min(polar_s4, 1.5), 2),
            "severity": severity(polar_s4),
            "affected_bands": affected(polar_s4),
        },
        {
            "region": "equatorial",
            "s4_index": round(min(equatorial_s4, 1.5), 2),
            "severity": severity(equatorial_s4),
            "affected_bands": affected(equatorial_s4),
        },
        {
            "region": "mid_latitude",
            "s4_index": round(min(midlat_s4, 1.5), 2),
            "severity": severity(midlat_s4),
            "affected_bands": affected(midlat_s4),
        },
    ]


def _compute_forecast(
    band: str,
    kp: float,
    kp_trend: list[dict],
    xray_class: Optional[str],
) -> dict:
    """Compute 12-hour availability forecast for a band.

    Uses persistence model with storm phase decay.
    """
    points = []

    # Determine Kp trend direction
    if len(kp_trend) >= 2:
        recent_kps = [p["kp"] for p in kp_trend[-3:]]
        trend_slope = (recent_kps[-1] - recent_kps[0]) / max(len(recent_kps) - 1, 1)
    else:
        trend_slope = 0.0

    for h in range(1, 13):
        # Simple persistence + decay model
        # Storms typically last 12-24h and decay exponentially
        projected_kp = kp + trend_slope * h * 0.3
        # Apply natural decay toward Kp 2
        decay = 0.92 ** h
        projected_kp = 2.0 + (projected_kp - 2.0) * decay
        projected_kp = max(0, min(9, projected_kp))

        # Compute status at projected Kp
        status = "operational"
        degradation = 0.0

        if band == "HF":
            if projected_kp >= 7 or xray_class == "X":
                status = "blackout"
                degradation = 95.0
            elif projected_kp >= 5:
                status = "degraded"
                degradation = min(80, (projected_kp - 4) * 20)
            elif projected_kp >= 4:
                status = "degraded"
                degradation = 25.0
        elif band == "VHF":
            if projected_kp >= 7:
                status = "degraded"
                degradation = 60.0
            elif projected_kp >= 5:
                status = "degraded"
                degradation = (projected_kp - 4) * 12
        elif band == "UHF":
            if projected_kp >= 8:
                status = "degraded"
                degradation = 50.0
            elif projected_kp >= 6:
                status = "degraded"
                degradation = (projected_kp - 5) * 12
        elif band == "S-band":
            if projected_kp >= 8:
                status = "degraded"
                degradation = 20.0

        # Confidence decreases with forecast horizon
        confidence = max(0.3, 1.0 - h * 0.055)

        points.append({
            "hours_ahead": h,
            "status": status,
            "degradation_pct": round(degradation, 1),
            "confidence": round(confidence, 2),
        })

    return {"band_name": band, "points": points}


def _compute_alternatives(band_statuses: list[dict]) -> list[dict]:
    """Compute frequency routing alternatives for degraded bands."""
    alternatives = []
    degraded_bands = {
        b["band_name"] for b in band_statuses if b["status"] in ("degraded", "blackout")
    }

    for band in degraded_bands:
        if band in BAND_ALTERNATIVES:
            alt_band, reason = BAND_ALTERNATIVES[band]
            # Check if alternative is also degraded
            alt_status = next(
                (b for b in band_statuses if b["band_name"] == alt_band), None
            )
            if alt_status and alt_status["status"] == "operational":
                impact = "minimal"
            elif alt_status and alt_status["status"] == "degraded":
                impact = "moderate"
            else:
                impact = "significant"

            alternatives.append({
                "degraded_band": band,
                "alternative_band": alt_band,
                "reason": reason,
                "link_margin_impact": impact,
            })

    return alternatives


async def get_operational_dashboard() -> dict:
    """Build complete RF operational dashboard with space weather correlation."""
    # Fetch all data concurrently
    import asyncio

    kp_task = _fetch_kp()
    f10_7_task = _fetch_f10_7()
    xray_task = _fetch_xray_flux()
    proton_task = _fetch_proton_flux()
    bands_task = get_band_summary()
    kp_trend_task = _fetch_kp_trend()

    kp_result, f10_7, xray_result, proton_flux, band_summaries, kp_trend = (
        await asyncio.gather(
            kp_task, f10_7_task, xray_task, proton_task, bands_task, kp_trend_task
        )
    )

    kp, timestamp = kp_result
    xray_flux, xray_class = xray_result

    # Determine storm and alert level
    if kp >= 9:
        storm_level = "extreme"
    elif kp >= 8:
        storm_level = "severe"
    elif kp >= 7:
        storm_level = "strong"
    elif kp >= 6:
        storm_level = "moderate"
    elif kp >= 5:
        storm_level = "minor"
    else:
        storm_level = "none"

    if kp >= 7:
        alert_level = "red"
    elif kp >= 5:
        alert_level = "orange"
    elif kp >= 4:
        alert_level = "yellow"
    else:
        alert_level = "green"

    hf_blackout = (xray_class in ("X", "M")) or kp >= 7
    polar_cap = proton_flux is not None and proton_flux > 10

    space_weather = {
        "kp_index": kp,
        "f10_7": f10_7,
        "xray_flux": xray_flux,
        "xray_class": xray_class,
        "proton_flux": proton_flux,
        "storm_level": storm_level,
        "alert_level": alert_level,
        "hf_blackout": hf_blackout,
        "polar_cap_absorption": polar_cap,
        "timestamp": timestamp,
    }

    # Build band-level lookup for satellite/tx counts
    band_lookup = {b["band_name"]: b for b in band_summaries}

    # Compute operational status for each band
    band_statuses = []
    for band_name in BANDS:
        summary = band_lookup.get(band_name, {})
        status = _compute_band_status(
            band_name,
            kp,
            f10_7,
            xray_flux,
            xray_class,
            proton_flux,
            summary.get("satellite_count", 0),
            summary.get("transmitter_count", 0),
        )
        band_statuses.append(status)

    # Scintillation
    scintillation = _compute_scintillation(kp, f10_7)

    # Forecasts for vulnerable bands
    forecasts = []
    for band_name in ["HF", "VHF", "UHF", "S-band"]:
        forecasts.append(_compute_forecast(band_name, kp, kp_trend, xray_class))

    # Alternatives
    alternatives = _compute_alternatives(band_statuses)

    # Overall status
    any_blackout = any(b["status"] == "blackout" for b in band_statuses)
    any_degraded = any(b["status"] == "degraded" for b in band_statuses)
    if any_blackout:
        overall = "critical"
    elif any_degraded:
        overall = "degraded"
    else:
        overall = "nominal"

    return {
        "space_weather": space_weather,
        "band_status": band_statuses,
        "scintillation": scintillation,
        "forecasts": forecasts,
        "alternatives": alternatives,
        "overall_status": overall,
    }
