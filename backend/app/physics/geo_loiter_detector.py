"""Geo-US loiter threat detector — identifies adversarial satellites
geostationary/loitering over US territory.

Detects:
1. Geostationary (GEO): Satellites at ~35,786 km altitude with subsatellite
   longitude in the Americas sector.
2. Geosynchronous with US loiter: High-inclination GEO-like orbits that
   spend disproportionate time over US longitudes.
3. Molniya-type: Highly elliptical orbits with apogee dwell over US.

Ported from ORBITAL SHIELD geo_us_loiter_detector.py.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

from app.physics.bayesian_scorer import ADVERSARIAL_COUNTRIES

# GEO orbit thresholds (km)
GEO_ALT_MIN_KM = 35_500
GEO_ALT_MAX_KM = 36_200
GEO_PERIOD_MIN = 1430
GEO_PERIOD_MAX = 1445
GEO_INCLINATION_THRESHOLD_DEG = 8.0

# US longitudinal sector
US_LON_MIN = -130.0
US_LON_MAX = -60.0
US_LAT_MIN = 24.0
US_LAT_MAX = 55.0

# Molniya-type thresholds
MOLNIYA_ECCENTRICITY_MIN = 0.5
MOLNIYA_APOGEE_MIN_KM = 25_000
MOLNIYA_INCLINATION_MIN = 55.0
MOLNIYA_INCLINATION_MAX = 70.0


@dataclass
class GeoLoiterResult:
    """Result of geo-US loiter threat assessment for one satellite."""
    satellite_id: str
    satellite_name: str
    norad_id: int
    country_code: str
    orbit_type: str  # "geostationary", "geosynchronous", "molniya", "other"
    subsatellite_lon_deg: float
    subsatellite_lat_deg: float
    altitude_km: float
    dwell_fraction_over_us: float
    threat_score: float
    severity: str  # "threatened", "watched", "nominal"
    description: str


def _normalize_lon(lon: float) -> float:
    """Normalize longitude to [-180, 180]."""
    while lon > 180:
        lon -= 360
    while lon < -180:
        lon += 360
    return lon


def _is_geostationary(alt_km: float, period_min: float, inc_deg: float) -> bool:
    return (
        GEO_ALT_MIN_KM <= alt_km <= GEO_ALT_MAX_KM
        and GEO_PERIOD_MIN <= period_min <= GEO_PERIOD_MAX
        and abs(inc_deg) <= GEO_INCLINATION_THRESHOLD_DEG
    )


def _is_molniya_like(
    alt_km: float, ecc: float, inc_deg: float, semi_major_km: float
) -> bool:
    if ecc < MOLNIYA_ECCENTRICITY_MIN:
        return False
    if not (MOLNIYA_INCLINATION_MIN <= abs(inc_deg) <= MOLNIYA_INCLINATION_MAX):
        return False
    apogee_km = semi_major_km * (1 + ecc) - 6378.137
    return apogee_km >= MOLNIYA_APOGEE_MIN_KM


def _lon_in_us_sector(lon: float) -> bool:
    return US_LON_MIN <= _normalize_lon(lon) <= US_LON_MAX


def _point_over_us(lat: float, lon: float) -> bool:
    lon_n = _normalize_lon(lon)
    return US_LAT_MIN <= lat <= US_LAT_MAX and US_LON_MIN <= lon_n <= US_LON_MAX


def _compute_dwell_over_us(trajectory: list[dict]) -> float:
    if not trajectory:
        return 0.0
    over_us = sum(
        1 for pt in trajectory
        if _point_over_us(pt.get("lat", 0), pt.get("lon", 0))
    )
    return over_us / len(trajectory)


def assess_satellite(
    sat: dict,
    country_code: str,
) -> GeoLoiterResult | None:
    """Assess one satellite for geo-US loiter threat.

    Returns None if satellite is not adversarial or not in relevant orbit.
    """
    if country_code not in ADVERSARIAL_COUNTRIES:
        return None

    alt_km = sat.get("altitude_km", 0)
    period_min = sat.get("period_min", 90)
    inc_deg = sat.get("inclination_deg", 0)
    trajectory = sat.get("trajectory") or []

    subsat_lat = 0.0
    subsat_lon = 0.0
    if trajectory:
        p0 = trajectory[0]
        subsat_lat = p0.get("lat", 0)
        subsat_lon = p0.get("lon", 0)

    dwell_frac = _compute_dwell_over_us(trajectory)

    ecc = sat.get("eccentricity", 0.0)
    semi_major_km = sat.get("semi_major_axis_km") or (6378.137 + alt_km)

    orbit_type = "other"
    base_score = 0.0
    description = ""

    if _is_geostationary(alt_km, period_min, inc_deg):
        orbit_type = "geostationary"
        if _lon_in_us_sector(subsat_lon):
            base_score = 0.85
            description = (
                f"{sat.get('name', 'Unknown')} is geostationary with subsatellite "
                f"longitude {subsat_lon:.1f}° — positioned in Americas sector with "
                f"coverage footprint over continental US. Country: {country_code}."
            )
        else:
            base_score = 0.2
            description = (
                f"{sat.get('name', 'Unknown')} is geostationary at {subsat_lon:.1f}°E — "
                f"outside US sector but adversarial GEO asset."
            )

    elif _is_molniya_like(alt_km, ecc, inc_deg, semi_major_km):
        orbit_type = "molniya"
        if dwell_frac > 0.15:
            base_score = 0.75
            description = (
                f"{sat.get('name', 'Unknown')} is in Molniya-type orbit (e={ecc:.2f}, "
                f"inc={inc_deg:.1f}°). {dwell_frac*100:.0f}% of orbit over US. "
                f"Country: {country_code}."
            )
        else:
            base_score = 0.4
            description = (
                f"{sat.get('name', 'Unknown')} in Molniya-type orbit — "
                f"periodic northern hemisphere dwell."
            )

    elif GEO_ALT_MIN_KM <= alt_km <= GEO_ALT_MAX_KM and GEO_PERIOD_MIN <= period_min <= GEO_PERIOD_MAX:
        orbit_type = "geosynchronous"
        if dwell_frac > 0.25 or _lon_in_us_sector(subsat_lon):
            base_score = 0.6
            description = (
                f"{sat.get('name', 'Unknown')} is geosynchronous (inclined GEO) — "
                f"spends significant time over US longitudes. "
                f"Current subsatellite: {subsat_lat:.1f}°N, {subsat_lon:.1f}°E."
            )
        else:
            base_score = 0.25
            description = (
                f"{sat.get('name', 'Unknown')} in geosynchronous orbit — "
                f"adversarial GEO asset."
            )
    else:
        return None

    if base_score >= 0.6:
        severity = "threatened"
    elif base_score >= 0.3:
        severity = "watched"
    else:
        severity = "nominal"

    return GeoLoiterResult(
        satellite_id=sat.get("id", ""),
        satellite_name=sat.get("name", "Unknown"),
        norad_id=sat.get("norad_id", 0),
        country_code=country_code,
        orbit_type=orbit_type,
        subsatellite_lon_deg=round(subsat_lon, 2),
        subsatellite_lat_deg=round(subsat_lat, 2),
        altitude_km=round(alt_km, 1),
        dwell_fraction_over_us=round(dwell_frac, 4),
        threat_score=round(base_score, 3),
        severity=severity,
        description=description,
    )


def assess_all(
    satellites: list[dict],
    country_by_id: dict[str, str] | None = None,
) -> list[GeoLoiterResult]:
    """Assess all satellites, returning only those flagged as geo-US loiter threats."""
    results = []
    for sat in satellites:
        country = country_by_id.get(sat.get("id", "")) if country_by_id else sat.get("country_code", "")
        if not country:
            continue
        r = assess_satellite(sat, country)
        if r is not None:
            results.append(r)
    return results
