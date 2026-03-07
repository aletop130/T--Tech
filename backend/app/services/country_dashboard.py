"""Country / Operator dashboard service.

Fetches active satellite data from CelesTrak SATCAT GP data,
aggregates by country and operator, and caches for 6 hours.
"""

from __future__ import annotations

import time
from typing import Optional

import httpx

from app.core.logging import get_logger

logger = get_logger(__name__)

CELESTRAK_GP_URL = "https://celestrak.org/NORAD/elements/gp.php?GROUP=ACTIVE&FORMAT=JSON"

CACHE_TTL = 6 * 3600  # 6 hours

_cache: dict[str, object] = {
    "data": None,
    "timestamp": 0.0,
}

# ISO 3166-1 alpha-2/custom CelesTrak owner codes -> full names
COUNTRY_NAMES: dict[str, str] = {
    "US": "United States",
    "CIS": "Commonwealth of Independent States (Russia)",
    "PRC": "China",
    "UK": "United Kingdom",
    "FR": "France",
    "J": "Japan",
    "IN": "India",
    "D": "Germany",
    "IT": "Italy",
    "CA": "Canada",
    "AU": "Australia",
    "BR": "Brazil",
    "ISR": "Israel",
    "KOR": "South Korea",
    "ES": "Spain",
    "NL": "Netherlands",
    "INDO": "Indonesia",
    "ARGN": "Argentina",
    "TW": "Taiwan",
    "TURK": "Turkey",
    "UAE": "United Arab Emirates",
    "SAFR": "South Africa",
    "EGYP": "Egypt",
    "KSA": "Saudi Arabia",
    "NIG": "Nigeria",
    "THAI": "Thailand",
    "SING": "Singapore",
    "NZ": "New Zealand",
    "MEX": "Mexico",
    "CHLE": "Chile",
    "COL": "Colombia",
    "IRAN": "Iran",
    "NKOR": "North Korea",
    "PAK": "Pakistan",
    "AB": "Arab Satellite Communications Organization",
    "AC": "Asia Satellite Telecommunications Company",
    "ALG": "Algeria",
    "ANG": "Angola",
    "AZER": "Azerbaijan",
    "BELA": "Belarus",
    "BERM": "Bermuda",
    "BOL": "Bolivia",
    "CZCH": "Czech Republic",
    "DEN": "Denmark",
    "ECU": "Ecuador",
    "ESA": "European Space Agency",
    "EUME": "EUMETSAT",
    "EUTE": "EUTELSAT",
    "FGER": "Germany",
    "FIN": "Finland",
    "GER": "Germany",
    "GLOB": "Globalstar",
    "GREC": "Greece",
    "HUN": "Hungary",
    "IM": "International Maritime Satellite Organization",
    "IRID": "Iridium",
    "ISRA": "Israel",
    "ITSO": "International Telecommunications Satellite Organization",
    "JPN": "Japan",
    "LAOS": "Laos",
    "LTU": "Lithuania",
    "LUXE": "Luxembourg",
    "MALA": "Malaysia",
    "NATO": "North Atlantic Treaty Organization",
    "NORW": "Norway",
    "O3B": "O3b Networks",
    "ORB": "ORBCOMM",
    "PAKI": "Pakistan",
    "PERU": "Peru",
    "POL": "Poland",
    "POR": "Portugal",
    "RASC": "RascomStar-QAF",
    "ROC": "Taiwan",
    "ROM": "Romania",
    "RP": "Philippines",
    "SEAL": "Sea Launch",
    "SES": "SES",
    "SKOR": "South Korea",
    "SPN": "Spain",
    "STCT": "Singapore/Taiwan",
    "SWED": "Sweden",
    "SWTZ": "Switzerland",
    "UKR": "Ukraine",
    "URY": "Uruguay",
    "VENZ": "Venezuela",
    "VTNM": "Vietnam",
}


def _classify_orbit(mean_motion: Optional[float], eccentricity: Optional[float]) -> str:
    """Classify orbit as LEO/MEO/GEO/HEO from mean motion and eccentricity."""
    if mean_motion is None:
        return "LEO"
    if eccentricity is not None and eccentricity > 0.25:
        return "HEO"
    # GEO: ~1 rev/day
    if 0.9 <= mean_motion <= 1.1:
        return "GEO"
    # MEO: between GEO and LEO
    if 1.1 < mean_motion < 6.4:
        return "MEO"
    # LEO: > ~6.4 rev/day (period < ~225 min)
    return "LEO"


def _classify_object_type(object_type: Optional[str]) -> str:
    """Classify CelesTrak OBJECT_TYPE into payload/rocket_body/debris."""
    if not object_type:
        return "payload"
    ot = object_type.upper().strip()
    if "PAY" in ot:
        return "payload"
    if "R/B" in ot or "ROCKET" in ot:
        return "rocket_body"
    if "DEB" in ot:
        return "debris"
    return "payload"


async def _fetch_gp_data() -> list[dict]:
    """Fetch GP data from CelesTrak, with caching."""
    now = time.time()
    if _cache["data"] is not None and (now - _cache["timestamp"]) < CACHE_TTL:
        return _cache["data"]  # type: ignore[return-value]

    logger.info("Fetching active satellite GP data from CelesTrak...")
    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.get(CELESTRAK_GP_URL)
            resp.raise_for_status()
            data = resp.json()
            _cache["data"] = data
            _cache["timestamp"] = now
            logger.info(f"Cached {len(data)} satellite records from CelesTrak")
            return data
    except Exception as e:
        logger.error(f"Failed to fetch CelesTrak GP data: {e}")
        if _cache["data"] is not None:
            return _cache["data"]  # type: ignore[return-value]
        return []


def _country_name(code: str) -> str:
    return COUNTRY_NAMES.get(code, code)


async def get_global_summary() -> dict:
    """Build the global summary with all countries."""
    records = await _fetch_gp_data()

    countries: dict[str, dict] = {}
    orbit_dist = {"LEO": 0, "MEO": 0, "GEO": 0, "HEO": 0}
    total_payloads = 0
    total_rb = 0
    total_debris = 0

    for rec in records:
        cc = (rec.get("COUNTRY_CODE") or rec.get("TLE_LINE0", "")[:5] or "UNK").strip()
        if not cc:
            cc = "UNK"

        obj_type = _classify_object_type(rec.get("OBJECT_TYPE"))
        orbit_class = _classify_orbit(rec.get("MEAN_MOTION"), rec.get("ECCENTRICITY"))

        entry = countries.setdefault(cc, {
            "country_code": cc,
            "country_name": _country_name(cc),
            "total_objects": 0,
            "payloads": 0,
            "rocket_bodies": 0,
            "debris": 0,
            "leo": 0,
            "meo": 0,
            "geo": 0,
            "heo": 0,
        })

        entry["total_objects"] += 1
        if obj_type == "payload":
            entry["payloads"] += 1
            total_payloads += 1
        elif obj_type == "rocket_body":
            entry["rocket_bodies"] += 1
            total_rb += 1
        else:
            entry["debris"] += 1
            total_debris += 1

        orbit_key = orbit_class.lower()
        entry[orbit_key] = entry.get(orbit_key, 0) + 1
        orbit_dist[orbit_class] += 1

    all_countries = sorted(countries.values(), key=lambda c: -c["total_objects"])
    top_countries = all_countries[:15]

    return {
        "total_objects": len(records),
        "total_countries": len(countries),
        "total_payloads": total_payloads,
        "total_rocket_bodies": total_rb,
        "total_debris": total_debris,
        "top_countries": top_countries,
        "orbit_distribution": {
            "leo": orbit_dist["LEO"],
            "meo": orbit_dist["MEO"],
            "geo": orbit_dist["GEO"],
            "heo": orbit_dist["HEO"],
        },
        "all_countries": all_countries,
    }


async def get_country_detail(country_code: str) -> dict:
    """Detailed breakdown for one country."""
    records = await _fetch_gp_data()

    cc_upper = country_code.upper()
    summary = {
        "country_code": cc_upper,
        "country_name": _country_name(cc_upper),
        "total_objects": 0,
        "payloads": 0,
        "rocket_bodies": 0,
        "debris": 0,
        "leo": 0,
        "meo": 0,
        "geo": 0,
        "heo": 0,
    }
    orbit_dist = {"leo": 0, "meo": 0, "geo": 0, "heo": 0}
    operators: dict[str, dict] = {}

    for rec in records:
        rec_cc = (rec.get("COUNTRY_CODE") or "UNK").strip().upper()
        if rec_cc != cc_upper:
            continue

        obj_type = _classify_object_type(rec.get("OBJECT_TYPE"))
        orbit_class = _classify_orbit(rec.get("MEAN_MOTION"), rec.get("ECCENTRICITY"))

        summary["total_objects"] += 1
        if obj_type == "payload":
            summary["payloads"] += 1
        elif obj_type == "rocket_body":
            summary["rocket_bodies"] += 1
        else:
            summary["debris"] += 1

        orbit_key = orbit_class.lower()
        summary[orbit_key] = summary.get(orbit_key, 0) + 1
        orbit_dist[orbit_key] = orbit_dist.get(orbit_key, 0) + 1

        # Track operators by OBJECT_NAME prefix (first word often indicates operator/program)
        name = rec.get("OBJECT_NAME", "Unknown")
        op_key = name.split()[0] if name else "Unknown"
        op_entry = operators.setdefault(op_key, {
            "operator_name": op_key,
            "country": cc_upper,
            "satellite_count": 0,
            "primary_purpose": obj_type,
        })
        op_entry["satellite_count"] += 1

    top_ops = sorted(operators.values(), key=lambda o: -o["satellite_count"])[:20]

    return {
        "summary": summary,
        "top_operators": top_ops,
        "orbit_distribution": orbit_dist,
    }


async def get_top_operators(limit: int = 50) -> dict:
    """Top operators across all countries."""
    records = await _fetch_gp_data()

    operators: dict[str, dict] = {}

    for rec in records:
        cc = (rec.get("COUNTRY_CODE") or "UNK").strip()
        name = rec.get("OBJECT_NAME", "Unknown")
        op_key = name.split()[0] if name else "Unknown"
        obj_type = _classify_object_type(rec.get("OBJECT_TYPE"))

        op_entry = operators.setdefault(op_key, {
            "operator_name": op_key,
            "country": _country_name(cc),
            "satellite_count": 0,
            "primary_purpose": obj_type,
        })
        op_entry["satellite_count"] += 1

    sorted_ops = sorted(operators.values(), key=lambda o: -o["satellite_count"])[:limit]

    return {
        "operators": sorted_ops,
        "total": len(operators),
    }
