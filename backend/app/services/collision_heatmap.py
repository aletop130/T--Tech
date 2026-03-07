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

    The CSV has paired header rows.  Odd data rows represent satellite 1,
    even data rows represent satellite 2, sharing a common conjunction.
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
        # Return cached data if available, even if stale
        return _cache.get("pairs", [])

    pairs: list[dict] = []
    reader = csv.reader(io.StringIO(text))

    rows = list(reader)
    if len(rows) < 3:
        logger.warning("socrates_csv_too_short", row_count=len(rows))
        return pairs

    # Skip header rows (first two rows)
    data_rows = rows[2:]

    # Process pairs: each conjunction is represented by 2 consecutive rows
    i = 0
    while i + 1 < len(data_rows):
        row1 = data_rows[i]
        row2 = data_rows[i + 1]
        i += 2

        if len(row1) < 8 or len(row2) < 8:
            continue

        # SOCRATES CSV columns:
        # 0: NORAD_CAT_ID_1, 1: OBJECT_NAME_1, 2: DSE_1, 3: TCA, 4: MIN_RNG,
        # 5: REL_VEL, 6: MAX_PROB, 7: DILUTION, ...
        # Row2 has the second satellite info but shares TCA/MIN_RNG

        norad1 = _parse_int(row1[0])
        name1 = row1[1].strip() if len(row1) > 1 else "UNKNOWN"
        norad2 = _parse_int(row2[0])
        name2 = row2[1].strip() if len(row2) > 1 else "UNKNOWN"

        tca = _parse_tca(row1[3]) if len(row1) > 3 else None
        min_range = _parse_float(row1[4]) if len(row1) > 4 else None
        rel_vel = _parse_float(row1[5]) if len(row1) > 5 else None
        max_prob = _parse_float(row1[6]) if len(row1) > 6 else None

        if norad1 is None or norad2 is None or min_range is None:
            continue

        # Estimate altitude from DSE (days since epoch) — not reliable
        # Instead use object period if available, or approximate from min_range context
        # The SOCRATES CSV doesn't include altitude directly, so we'll try the
        # MEAN_MOTION or PERIOD columns if present, otherwise use a heuristic.
        # Columns beyond index 7 may include orbital period for sat1.
        period1 = _parse_float(row1[7]) if len(row1) > 7 else None
        period2 = _parse_float(row2[7]) if len(row2) > 7 else None

        alt1 = _estimate_altitude_from_period(period1)
        alt2 = _estimate_altitude_from_period(period2)

        # Use average altitude of the two objects
        if alt1 is not None and alt2 is not None:
            altitude = (alt1 + alt2) / 2
        elif alt1 is not None:
            altitude = alt1
        elif alt2 is not None:
            altitude = alt2
        else:
            altitude = None

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
