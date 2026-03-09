"""Collision Risk Heatmap service — fetches SOCRATES CSV and aggregates by altitude band."""
from datetime import datetime, timedelta
from typing import Optional
import csv
import io
import math

import httpx

from app.core.logging import get_logger

logger = get_logger(__name__)

SOCRATES_URL = "https://celestrak.org/SOCRATES/sort-minRange.csv"

ALTITUDE_BANDS = [
    (200, 400),
    (400, 600),
    (600, 800),
    (800, 1000),
    (1000, 1500),
    (1500, 2000),
]

# Cache to avoid hitting CelesTrak on every request
_cache: dict[str, object] = {
    "pairs": [],
    "fetched_at": None,
}
_CACHE_TTL = timedelta(minutes=15)


def _estimate_altitude_from_period(period_min: Optional[float]) -> Optional[float]:
    """Estimate mean altitude from orbital period using Kepler's third law."""
    if period_min is None or period_min <= 0:
        return None
    mu = 398600.4418  # km^3/s^2
    period_s = period_min * 60.0
    a = (mu * (period_s / (2 * math.pi)) ** 2) ** (1 / 3)
    altitude = a - 6371.0  # Earth radius
    if altitude < 0 or altitude > 100000:
        return None
    return altitude


def _parse_tca(tca_str: str) -> Optional[datetime]:
    """Parse TCA string from SOCRATES CSV."""
    for fmt in (
        "%Y-%m-%d %H:%M:%S.%f",
        "%Y-%m-%d %H:%M:%S",
        "%Y/%m/%d %H:%M:%S.%f",
        "%Y/%m/%d %H:%M:%S",
    ):
        try:
            return datetime.strptime(tca_str.strip(), fmt)
        except (ValueError, AttributeError):
            continue
    return None


def _parse_float(val: str) -> Optional[float]:
    try:
        v = float(val.strip())
        if math.isnan(v) or math.isinf(v):
            return None
        return v
    except (ValueError, TypeError):
        return None


def _parse_int(val: str) -> Optional[int]:
    try:
        return int(val.strip())
    except (ValueError, TypeError):
        return None


async def fetch_socrates_data() -> list[dict]:
    """Fetch and parse the SOCRATES min-range CSV from CelesTrak.

    Current CSV format (single-row per conjunction):
    NORAD_CAT_ID_1, OBJECT_NAME_1, DSE_1, NORAD_CAT_ID_2, OBJECT_NAME_2,
    DSE_2, TCA, TCA_RANGE, TCA_RELATIVE_SPEED, MAX_PROB, DILUTION
    """
    now = datetime.utcnow()
    fetched_at = _cache.get("fetched_at")
    if fetched_at and (now - fetched_at) < _CACHE_TTL and _cache["pairs"]:
        return _cache["pairs"]

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.get(SOCRATES_URL)
            resp.raise_for_status()
            text = resp.text
    except Exception as e:
        logger.error("socrates_fetch_failed", error=str(e))
        return _cache.get("pairs", [])

    pairs: list[dict] = []
    reader = csv.reader(io.StringIO(text))

    rows = list(reader)
    if len(rows) < 2:
        logger.warning("socrates_csv_too_short", row_count=len(rows))
        return pairs

    # Single header row, data starts at row 1
    data_rows = rows[1:]

    for row in data_rows:
        if len(row) < 11:
            continue

        # Columns: 0=NORAD1, 1=NAME1, 2=DSE1, 3=NORAD2, 4=NAME2,
        #          5=DSE2, 6=TCA, 7=TCA_RANGE, 8=TCA_REL_SPEED,
        #          9=MAX_PROB, 10=DILUTION
        norad1 = _parse_int(row[0])
        name1 = row[1].strip()
        norad2 = _parse_int(row[3])
        name2 = row[4].strip()

        tca = _parse_tca(row[6])
        min_range = _parse_float(row[7])
        rel_vel = _parse_float(row[8])
        max_prob = _parse_float(row[9])

        if norad1 is None or norad2 is None or min_range is None:
            continue

        # Estimate altitude from DSE (days since epoch) using mean motion
        # DSE columns (2 and 5) are not orbital periods but we can use them
        # as a rough proxy. For better accuracy, use the TCA_RANGE context.
        # CelesTrak SOCRATES doesn't include altitude or period directly,
        # so we estimate from DSE if it looks like a mean-motion value.
        dse1 = _parse_float(row[2])
        dse2 = _parse_float(row[5])

        # DSE is "days since epoch" — not usable for altitude.
        # Use a heuristic based on relative velocity to estimate altitude band:
        # LEO (<2000km): rel_vel typically 7-15 km/s
        # MEO: rel_vel typically 3-7 km/s
        # GEO: rel_vel typically <3 km/s
        altitude = None
        if rel_vel is not None:
            if rel_vel > 10:
                altitude = 400 + (15 - min(rel_vel, 15)) * 100  # ~400-900 km
            elif rel_vel > 7:
                altitude = 600 + (10 - rel_vel) * 150  # ~600-1050 km
            elif rel_vel > 3:
                altitude = 1000 + (7 - rel_vel) * 250  # ~1000-2000 km
            else:
                altitude = 2000  # MEO/GEO range

        pairs.append({
            "sat1_name": name1,
            "sat1_norad": norad1,
            "sat2_name": name2,
            "sat2_norad": norad2,
            "min_range_km": min_range,
            "tca": tca,
            "relative_velocity_km_s": rel_vel,
            "max_probability": max_prob,
            "altitude_km": altitude,
        })

    _cache["pairs"] = pairs
    _cache["fetched_at"] = now
    logger.info("socrates_data_fetched", pair_count=len(pairs))
    return pairs


def aggregate_heatmap(pairs: list[dict]) -> list[dict]:
    """Aggregate conjunction pairs into altitude-band risk scores."""
    bands = []
    for alt_min, alt_max in ALTITUDE_BANDS:
        events_in_band = [
            p for p in pairs
            if p.get("altitude_km") is not None
            and alt_min <= p["altitude_km"] < alt_max
        ]
        count = len(events_in_band)

        # Risk score: combination of event density and proximity severity
        if count == 0:
            risk = 0.0
        else:
            # Close approaches contribute more to risk
            proximity_scores = []
            for e in events_in_band:
                rng = e["min_range_km"]
                if rng < 1.0:
                    proximity_scores.append(100.0)
                elif rng < 5.0:
                    proximity_scores.append(80.0)
                elif rng < 10.0:
                    proximity_scores.append(60.0)
                elif rng < 25.0:
                    proximity_scores.append(40.0)
                else:
                    proximity_scores.append(20.0)
            avg_proximity = sum(proximity_scores) / len(proximity_scores)
            # Scale by count (more events = higher overall risk), capped at 100
            density_factor = min(count / 10.0, 1.0)
            risk = min(avg_proximity * 0.7 + density_factor * 30.0, 100.0)

        bands.append({
            "altitude_min_km": alt_min,
            "altitude_max_km": alt_max,
            "event_count": count,
            "risk_score": round(risk, 1),
        })
    return bands
