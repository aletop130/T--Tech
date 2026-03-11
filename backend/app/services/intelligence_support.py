"""Shared helpers for intelligence-related backend services."""

from __future__ import annotations

import math
from typing import Any, Mapping

from app.physics.bayesian_scorer import ADVERSARIAL_COUNTRIES
from app.services.celestrack import (
    ALLIED_SATELLITES,
    ENEMY_SATELLITES,
    ITALIAN_SATELLITES,
    NATO_ALLIED_SATELLITES,
)

EARTH_RADIUS_KM = 6378.137

HOSTILE_NAME_PREFIXES = (
    "HOSTILE",
    "UNKNOWN",
    "SUSPECT",
    "CONTACT",
    "TRACKED",
    "UNIDENTIFIED",
)
HOSTILE_TAGS = frozenset({"enemy", "hostile", "adversary"})
ALLIED_TAGS = frozenset({"allied", "friendly", "blue"})

COUNTRY_ALIASES = {
    "CHINA": "PRC",
    "PEOPLE'S REPUBLIC OF CHINA": "PRC",
    "PRC": "PRC",
    "RUSSIA": "RUS",
    "RUSSIAN FEDERATION": "RUS",
    "CIS": "CIS",
    "IRAN": "IRN",
    "IRN": "IRN",
    "NORTH KOREA": "PRK",
    "PRK": "PRK",
    "NKOR": "NKOR",
    "UNITED STATES": "USA",
    "U.S.A.": "USA",
    "USA": "USA",
    "ITALY": "ITA",
    "ITALIAN": "ITA",
    "EUROPE": "EUR",
    "EUROPEAN UNION": "EUR",
    "UNITED KINGDOM": "GBR",
    "UK": "GBR",
    "GREAT BRITAIN": "GBR",
    "FRANCE": "FRA",
    "GERMANY": "DEU",
    "JAPAN": "JPN",
    "INDIA": "IND",
    "MULTINATIONAL": "MULTINATIONAL",
    "UNKNOWN": "UNK",
}

ALLIED_COUNTRY_CODES = frozenset(
    {
        "USA",
        "ITA",
        "EUR",
        "GBR",
        "FRA",
        "DEU",
        "JPN",
        "IND",
        "MULTINATIONAL",
    }
)
ALLIED_NORAD_IDS = frozenset(
    set(ALLIED_SATELLITES) | set(ITALIAN_SATELLITES) | set(NATO_ALLIED_SATELLITES)
)
ENEMY_NORAD_IDS = frozenset(ENEMY_SATELLITES)


def normalize_country(country: str | None) -> str:
    """Normalize country labels to the codes expected by intelligence logic."""
    if not country:
        return ""
    normalized = " ".join(country.strip().upper().replace("-", " ").split())
    return COUNTRY_ALIASES.get(normalized, normalized)


def _normalize_tags(tags: Any) -> set[str]:
    if tags is None:
        return set()
    if isinstance(tags, str):
        return {tags.strip().lower()} if tags.strip() else set()
    if isinstance(tags, (list, tuple, set)):
        return {
            str(tag).strip().lower()
            for tag in tags
            if str(tag).strip()
        }
    return set()


def is_hostile_asset(
    *,
    norad_id: int | None = None,
    name: str | None = None,
    country: str | None = None,
    faction: str | None = None,
    tags: Any = None,
) -> bool:
    """Determine whether an asset should be treated as hostile/adversarial."""
    normalized_faction = (faction or "").strip().lower()
    normalized_name = (name or "").strip().upper()
    normalized_country = normalize_country(country)
    normalized_tags = _normalize_tags(tags)

    if norad_id in ENEMY_NORAD_IDS:
        return True
    if normalized_faction in {"enemy", "hostile", "adversary"}:
        return True
    if HOSTILE_TAGS.intersection(normalized_tags):
        return True
    if normalized_name.startswith(HOSTILE_NAME_PREFIXES):
        return True
    if normalized_country in ADVERSARIAL_COUNTRIES:
        return True
    return False


def is_allied_asset(
    *,
    norad_id: int | None = None,
    country: str | None = None,
    faction: str | None = None,
    tags: Any = None,
) -> bool:
    """Determine whether an asset should be treated as allied/friendly."""
    normalized_faction = (faction or "").strip().lower()
    normalized_country = normalize_country(country)
    normalized_tags = _normalize_tags(tags)

    if norad_id in ALLIED_NORAD_IDS:
        return True
    if normalized_faction in {"allied", "friendly"}:
        return True
    if ALLIED_TAGS.intersection(normalized_tags):
        return True
    if normalized_country in ALLIED_COUNTRY_CODES:
        return True
    return False


def _get_value(orbit: Any | Mapping[str, Any] | None, key: str) -> Any:
    if orbit is None:
        return None
    if isinstance(orbit, Mapping):
        return orbit.get(key)
    return getattr(orbit, key, None)


def _coerce_float(value: Any) -> float | None:
    if value is None or value == "":
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def mean_motion_to_sma_km(mean_motion_rev_day: float | None) -> float | None:
    """Convert mean motion (rev/day) to semi-major axis in kilometers."""
    if mean_motion_rev_day is None or mean_motion_rev_day <= 0:
        return None
    mean_motion_rad_s = mean_motion_rev_day * 2.0 * math.pi / 86400.0
    mu_earth_m3_s2 = 3.986004418e14
    semi_major_axis_m = (mu_earth_m3_s2 / (mean_motion_rad_s ** 2)) ** (1.0 / 3.0)
    return semi_major_axis_m / 1000.0


def parse_tle_line2(line2: str | None) -> dict[str, float] | None:
    """Parse the subset of TLE line 2 needed by the intelligence pages."""
    if not line2:
        return None
    parts = line2.split()
    if len(parts) < 8 or parts[0] != "2":
        return None
    try:
        inclination_deg = float(parts[2])
        raan_deg = float(parts[3])
        eccentricity = float(f"0.{parts[4].strip()}")
        arg_perigee_deg = float(parts[5])
        mean_anomaly_deg = float(parts[6])
        mean_motion_rev_day = float(parts[7])
    except (TypeError, ValueError):
        return None

    return {
        "inclination_deg": inclination_deg,
        "raan_deg": raan_deg,
        "eccentricity": eccentricity,
        "arg_perigee_deg": arg_perigee_deg,
        "mean_anomaly_deg": mean_anomaly_deg,
        "mean_motion_rev_day": mean_motion_rev_day,
    }


def derive_orbit_metrics(orbit: Any | Mapping[str, Any] | None) -> dict[str, Any]:
    """Derive usable orbit metrics from explicit DB fields or embedded TLE data."""
    parsed_tle = parse_tle_line2(_get_value(orbit, "tle_line2"))

    mean_motion_rev_day = _coerce_float(_get_value(orbit, "mean_motion_rev_day"))
    if mean_motion_rev_day is None and parsed_tle:
        mean_motion_rev_day = parsed_tle["mean_motion_rev_day"]

    inclination_deg = _coerce_float(_get_value(orbit, "inclination_deg"))
    if inclination_deg is None and parsed_tle:
        inclination_deg = parsed_tle["inclination_deg"]

    eccentricity = _coerce_float(_get_value(orbit, "eccentricity"))
    if eccentricity is None and parsed_tle:
        eccentricity = parsed_tle["eccentricity"]

    semi_major_axis_km = _coerce_float(_get_value(orbit, "semi_major_axis_km"))
    if semi_major_axis_km is None:
        semi_major_axis_km = mean_motion_to_sma_km(mean_motion_rev_day)

    period_minutes = _coerce_float(_get_value(orbit, "period_minutes"))
    if period_minutes is None and mean_motion_rev_day and mean_motion_rev_day > 0:
        period_minutes = 1440.0 / mean_motion_rev_day

    apogee_km = _coerce_float(_get_value(orbit, "apogee_km"))
    perigee_km = _coerce_float(_get_value(orbit, "perigee_km"))
    if semi_major_axis_km is not None and eccentricity is not None:
        if apogee_km is None:
            apogee_km = semi_major_axis_km * (1.0 + eccentricity) - EARTH_RADIUS_KM
        if perigee_km is None:
            perigee_km = semi_major_axis_km * (1.0 - eccentricity) - EARTH_RADIUS_KM

    altitude_km = None
    if apogee_km is not None and perigee_km is not None:
        altitude_km = (apogee_km + perigee_km) / 2.0
    elif semi_major_axis_km is not None:
        altitude_km = semi_major_axis_km - EARTH_RADIUS_KM

    return {
        "epoch": _get_value(orbit, "epoch"),
        "semi_major_axis_km": semi_major_axis_km,
        "eccentricity": eccentricity,
        "inclination_deg": inclination_deg,
        "mean_motion_rev_day": mean_motion_rev_day,
        "period_minutes": period_minutes,
        "apogee_km": apogee_km,
        "perigee_km": perigee_km,
        "altitude_km": altitude_km,
    }
