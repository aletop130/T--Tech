"""Space weather service — fetches NOAA SWPC data and computes satellite drag impact."""

from __future__ import annotations

import re
import time
from datetime import datetime, timezone
from typing import Optional

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import get_logger
from app.db.models.ontology import Satellite, Orbit
from app.schemas.space_weather import (
    AlertLevel,
    DragImpactSatellite,
    NOAAAlert,
    ParsedAlert,
    SatelliteWeatherAnalysis,
    SolarWindData,
    SpaceWeatherCurrent,
    SpaceWeatherImpact,
    StormLevel,
    SystemImpact,
)

logger = get_logger(__name__)

# NOAA SWPC public endpoints (no auth required)
KP_INDEX_URL = "https://services.swpc.noaa.gov/json/planetary_k_index_1m.json"
SOLAR_CYCLE_URL = "https://services.swpc.noaa.gov/json/solar-cycle/observed-solar-cycle-indices.json"
ALERTS_URL = "https://services.swpc.noaa.gov/products/alerts.json"
SOLAR_WIND_PLASMA_URL = "https://services.swpc.noaa.gov/products/solar-wind/plasma-2-hour.json"
SOLAR_WIND_MAG_URL = "https://services.swpc.noaa.gov/products/solar-wind/mag-2-hour.json"
XRAY_URL = "https://services.swpc.noaa.gov/json/goes/primary/xrays-6-hour.json"
PROTON_URL = "https://services.swpc.noaa.gov/json/goes/primary/integral-protons-1-day.json"
DST_URL = "https://services.swpc.noaa.gov/products/kyoto-dst.json"

# In-memory cache
_cache: dict[str, tuple[float, object]] = {}
CACHE_TTL = 300  # 5 minutes


def _get_cached(key: str) -> object | None:
    entry = _cache.get(key)
    if entry and (time.time() - entry[0]) < CACHE_TTL:
        return entry[1]
    return None


def _set_cached(key: str, value: object) -> None:
    _cache[key] = (time.time(), value)


def _kp_to_storm_level(kp: float) -> StormLevel:
    if kp >= 9:
        return StormLevel.EXTREME
    if kp >= 8:
        return StormLevel.SEVERE
    if kp >= 7:
        return StormLevel.STRONG
    if kp >= 6:
        return StormLevel.MODERATE
    if kp >= 5:
        return StormLevel.MINOR
    if kp >= 4:
        return StormLevel.MINOR  # Kp 4 = G1 threshold for operational alerting
    return StormLevel.NONE


def _kp_to_alert_level(kp: float) -> AlertLevel:
    if kp >= 7:
        return AlertLevel.RED
    if kp >= 5:
        return AlertLevel.ORANGE
    if kp >= 4:
        return AlertLevel.YELLOW
    return AlertLevel.GREEN


def _estimate_drag_increase(kp: float, altitude_km: float) -> float:
    """Estimate atmospheric drag increase percentage.

    Higher Kp causes thermospheric density increases, especially at lower altitudes.
    Rough model: drag increase ~ (Kp - 3)^2 * altitude_factor
    where altitude_factor decreases with altitude.
    Threshold lowered to Kp>3 for operational conservatism.
    """
    if kp <= 3:
        return 0.0
    kp_factor = (kp - 3) ** 2
    # Altitude factor: strongest below 400 km, diminishes toward 600 km
    if altitude_km < 300:
        alt_factor = 5.0
    elif altitude_km < 400:
        alt_factor = 3.0
    elif altitude_km < 500:
        alt_factor = 1.5
    else:
        alt_factor = 0.8
    return round(kp_factor * alt_factor, 1)


async def _fetch_kp_index() -> tuple[float, datetime]:
    """Fetch latest Kp index from NOAA SWPC."""
    cached = _get_cached("kp")
    if cached:
        return cached  # type: ignore

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(KP_INDEX_URL)
            resp.raise_for_status()
            data = resp.json()
        if not data:
            raise ValueError("Empty Kp response")
        latest = data[-1]
        kp = float(latest.get("kp_index", latest.get("kp", 0)))
        ts_str = latest.get("time_tag", "")
        try:
            ts = datetime.fromisoformat(ts_str.replace("Z", "+00:00"))
        except Exception:
            ts = datetime.now(timezone.utc)
        result = (kp, ts)
        _set_cached("kp", result)
        return result
    except Exception as exc:
        logger.warning("Failed to fetch Kp index: %s", exc)
        return (2.0, datetime.now(timezone.utc))


async def _fetch_kp_trend_24h() -> list[dict]:
    """Fetch 24h Kp trend from NOAA SWPC (1-minute resolution, sampled to ~3h intervals)."""
    cached = _get_cached("kp_trend")
    if cached is not None:
        return cached  # type: ignore

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(KP_INDEX_URL)
            resp.raise_for_status()
            data = resp.json()
        if not data:
            return []

        # NOAA returns 1-minute Kp values; sample every ~180 entries for 3h intervals
        # Typically ~1440 entries for 24h
        step = max(1, len(data) // 8)
        sampled = data[::step][-8:]  # Last 8 data points (~24h at 3h intervals)
        trend = []
        for entry in sampled:
            kp_val = float(entry.get("kp_index", entry.get("kp", 0)))
            ts_str = entry.get("time_tag", "")
            trend.append({
                "kp": round(kp_val, 1),
                "time": ts_str,
            })
        _set_cached("kp_trend", trend)
        return trend
    except Exception as exc:
        logger.warning("Failed to fetch Kp trend: %s", exc)
        return []


async def _fetch_f10_7() -> Optional[float]:
    """Fetch latest F10.7 solar flux from NOAA SWPC."""
    cached = _get_cached("f10_7")
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
        _set_cached("f10_7", f10_7)
        return f10_7
    except Exception as exc:
        logger.warning("Failed to fetch F10.7: %s", exc)
        return None


async def _fetch_solar_wind() -> SolarWindData:
    """Fetch real-time solar wind plasma + magnetic field from DSCOVR/ACE."""
    cached = _get_cached("solar_wind")
    if cached is not None:
        return cached  # type: ignore

    speed = None
    density = None
    temperature = None
    bz = None

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            # Fetch plasma data (density, speed, temperature)
            resp = await client.get(SOLAR_WIND_PLASMA_URL)
            resp.raise_for_status()
            plasma_data = resp.json()
            if plasma_data and len(plasma_data) > 1:
                # First row is headers, last row is most recent valid
                for row in reversed(plasma_data[1:]):
                    try:
                        d = float(row[1]) if row[1] else None
                        s = float(row[2]) if row[2] else None
                        t = float(row[3]) if row[3] else None
                        if s is not None:
                            density = d
                            speed = s
                            temperature = t
                            break
                    except (ValueError, IndexError):
                        continue

            # Fetch magnetic field data (Bz GSM)
            resp2 = await client.get(SOLAR_WIND_MAG_URL)
            resp2.raise_for_status()
            mag_data = resp2.json()
            if mag_data and len(mag_data) > 1:
                for row in reversed(mag_data[1:]):
                    try:
                        bz_val = float(row[3]) if row[3] else None
                        if bz_val is not None:
                            bz = bz_val
                            break
                    except (ValueError, IndexError):
                        continue
    except Exception as exc:
        logger.warning("Failed to fetch solar wind data: %s", exc)

    result = SolarWindData(
        speed_km_s=round(speed, 1) if speed else None,
        density_n_cm3=round(density, 1) if density else None,
        bz_gsm_nt=round(bz, 1) if bz else None,
        temperature_k=round(temperature, 0) if temperature else None,
    )
    _set_cached("solar_wind", result)
    return result


async def _fetch_xray_class() -> Optional[str]:
    """Fetch current X-ray flux class from GOES primary."""
    cached = _get_cached("xray")
    if cached is not None:
        return cached  # type: ignore

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(XRAY_URL)
            resp.raise_for_status()
            data = resp.json()
        if not data:
            return None
        # Get the latest entry with a current_class
        for entry in reversed(data):
            xclass = entry.get("current_class")
            if xclass:
                _set_cached("xray", xclass)
                return xclass
        return None
    except Exception as exc:
        logger.warning("Failed to fetch X-ray class: %s", exc)
        return None


async def _fetch_proton_flux() -> Optional[float]:
    """Fetch proton flux >10 MeV from GOES primary."""
    cached = _get_cached("proton")
    if cached is not None:
        return cached  # type: ignore

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(PROTON_URL)
            resp.raise_for_status()
            data = resp.json()
        if not data:
            return None
        # Find the latest >=10 MeV entry
        for entry in reversed(data):
            energy = entry.get("energy", "")
            if "10" in str(energy):
                flux = entry.get("flux")
                if flux is not None:
                    val = float(flux)
                    _set_cached("proton", val)
                    return val
        return None
    except Exception as exc:
        logger.warning("Failed to fetch proton flux: %s", exc)
        return None


async def _fetch_dst() -> Optional[float]:
    """Fetch Disturbance Storm Time (DST) index from Kyoto via NOAA."""
    cached = _get_cached("dst")
    if cached is not None:
        return cached  # type: ignore

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(DST_URL)
            resp.raise_for_status()
            data = resp.json()
        if not data or len(data) < 2:
            return None
        # CSV-style: first row is headers, last row is most recent
        for row in reversed(data[1:]):
            try:
                dst_val = float(row[1])
                _set_cached("dst", dst_val)
                return dst_val
            except (ValueError, IndexError, TypeError):
                continue
        return None
    except Exception as exc:
        logger.warning("Failed to fetch DST index: %s", exc)
        return None


async def _fetch_alerts() -> list[NOAAAlert]:
    """Fetch active NOAA SWPC alerts."""
    cached = _get_cached("alerts")
    if cached is not None:
        return cached  # type: ignore

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(ALERTS_URL)
            resp.raise_for_status()
            data = resp.json()
        alerts = []
        for item in data[-10:]:  # last 10 alerts
            alerts.append(NOAAAlert(
                product_id=item.get("product_id", "unknown"),
                issue_datetime=item.get("issue_datetime"),
                message=item.get("message", "")[:1000],
            ))
        _set_cached("alerts", alerts)
        return alerts
    except Exception as exc:
        logger.warning("Failed to fetch SWPC alerts: %s", exc)
        return []


def _parse_alert(alert: NOAAAlert) -> ParsedAlert:
    """Parse a raw NOAA SWPC alert message into structured fields."""
    msg = alert.message
    product_id = alert.product_id

    # Determine alert type
    alert_type = "INFO"
    if "ALERT" in product_id.upper() or re.search(r"^ALERT:", msg, re.MULTILINE):
        alert_type = "ALERT"
    elif "WAR" in product_id.upper() or re.search(r"^WARNING:", msg, re.MULTILINE):
        alert_type = "WARNING"
    elif "WATCH" in product_id.upper() or re.search(r"^WATCH:", msg, re.MULTILINE):
        alert_type = "WATCH"

    # Extract title (first ALERT:/WARNING:/WATCH: line)
    title_match = re.search(r"(?:ALERT|WARNING|WATCH):\s*(.+?)(?:\n|$)", msg)
    title = title_match.group(0).strip() if title_match else product_id

    # Extract serial number
    serial_match = re.search(r"Serial Number:\s*(\d+)", msg)
    serial = serial_match.group(1) if serial_match else None

    # Extract issue time
    issue_match = re.search(r"Issue Time:\s*(.+?)(?:\n|$)", msg)
    issued = issue_match.group(1).strip() if issue_match else alert.issue_datetime

    # Extract valid from/to
    valid_from_match = re.search(r"Valid From:\s*(.+?)(?:\n|$)", msg)
    valid_from = valid_from_match.group(1).strip() if valid_from_match else None

    valid_to_match = re.search(r"Valid To:\s*(.+?)(?:\n|$)", msg)
    valid_to = valid_to_match.group(1).strip() if valid_to_match else None

    # Extract synoptic period as fallback for time window
    if not valid_from:
        synoptic_match = re.search(r"Synoptic Period:\s*(.+?)(?:\n|$)", msg)
        if synoptic_match:
            valid_from = synoptic_match.group(1).strip()

    # Extract NOAA scale
    scale_match = re.search(r"NOAA Scale:\s*(.+?)(?:\n|$)", msg)
    noaa_scale = scale_match.group(1).strip() if scale_match else None

    # Build description from Potential Impacts or remaining text
    desc_match = re.search(r"Potential Impacts?:\s*(.+?)(?:\n\n|\Z)", msg, re.DOTALL)
    if desc_match:
        description = desc_match.group(1).strip()[:300]
    else:
        # Fallback: use lines after the title
        lines = msg.split("\n")
        desc_lines = []
        found_title = False
        for line in lines:
            if found_title and line.strip():
                if not any(line.strip().startswith(k) for k in [
                    "Serial Number:", "Issue Time:", "Valid From:", "Valid To:",
                    "NOAA Scale:", "Threshold", "Synoptic Period:",
                ]):
                    desc_lines.append(line.strip())
            if "ALERT:" in line or "WARNING:" in line or "WATCH:" in line:
                found_title = True
        description = " ".join(desc_lines)[:300] if desc_lines else msg[:200]

    return ParsedAlert(
        product_id=product_id,
        alert_type=alert_type,
        title=title,
        description=description,
        noaa_scale=noaa_scale,
        issued=issued,
        valid_from=valid_from,
        valid_to=valid_to,
        serial=serial,
    )


class SpaceWeatherService:
    """Service for real-time space weather assessment."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_current_conditions(self) -> SpaceWeatherCurrent:
        kp, ts = await _fetch_kp_index()
        f10_7 = await _fetch_f10_7()
        solar_wind = await _fetch_solar_wind()
        xray = await _fetch_xray_class()
        proton = await _fetch_proton_flux()
        dst = await _fetch_dst()
        return SpaceWeatherCurrent(
            kp_index=kp,
            f10_7=f10_7,
            solar_wind_speed=solar_wind.speed_km_s,
            storm_level=_kp_to_storm_level(kp),
            timestamp=ts,
            xray_class=xray,
            proton_flux_10mev=proton,
            dst_index=dst,
        )

    async def get_impact(self) -> dict:
        conditions = await self.get_current_conditions()
        alerts = await _fetch_alerts()
        kp_trend = await _fetch_kp_trend_24h()
        solar_wind = await _fetch_solar_wind()
        affected: list[DragImpactSatellite] = []

        if conditions.kp_index > 3:
            affected = await self._find_at_risk_satellites(conditions.kp_index)

        # Parse alerts into structured format
        parsed = [_parse_alert(a) for a in alerts]

        impact = SpaceWeatherImpact(
            current_conditions=conditions,
            affected_satellites=affected,
            alert_level=_kp_to_alert_level(conditions.kp_index),
            active_alerts=alerts,
            total_affected=len(affected),
            solar_wind=solar_wind,
            parsed_alerts=parsed,
        )
        # Return as dict with extra trend field not in the schema
        result = impact.model_dump()
        result["kp_trend_24h"] = kp_trend
        return result

    async def _find_at_risk_satellites(self, kp: float) -> list[DragImpactSatellite]:
        """Find LEO satellites (<600 km) that face increased drag."""
        try:
            # Query satellites with their latest orbits
            stmt = (
                select(Satellite, Orbit)
                .join(Orbit, Satellite.id == Orbit.satellite_id)
                .where(Satellite.is_active == True)  # noqa: E712
            )
            result = await self.db.execute(stmt)
            rows = result.all()

            # Deduplicate: keep only the latest orbit per satellite
            sat_orbits: dict[str, tuple] = {}
            for sat, orbit in rows:
                sid = str(sat.id)
                if sid not in sat_orbits or (orbit.epoch and (
                    not sat_orbits[sid][1].epoch or orbit.epoch > sat_orbits[sid][1].epoch
                )):
                    sat_orbits[sid] = (sat, orbit)

            affected = []
            for sat, orbit in sat_orbits.values():
                alt = None
                if orbit.perigee_km is not None:
                    alt = orbit.perigee_km
                elif orbit.semi_major_axis_km is not None:
                    alt = orbit.semi_major_axis_km - 6371.0

                if alt is None or alt > 600 or alt < 100:
                    continue

                drag_pct = _estimate_drag_increase(kp, alt)
                if drag_pct > 0:
                    affected.append(DragImpactSatellite(
                        norad_id=sat.norad_id,
                        name=sat.name,
                        altitude_km=round(alt, 1),
                        estimated_drag_increase_pct=drag_pct,
                    ))

            affected.sort(key=lambda s: s.estimated_drag_increase_pct, reverse=True)
            return affected
        except Exception as exc:
            logger.error("Error finding at-risk satellites: %s", exc)
            return []

    async def analyze_satellite(self, norad_id: int) -> SatelliteWeatherAnalysis:
        """Compute space weather impact analysis for a specific satellite."""
        # Get satellite + orbit from DB
        stmt = (
            select(Satellite, Orbit)
            .join(Orbit, Satellite.id == Orbit.satellite_id)
            .where(Satellite.norad_id == norad_id)
        )
        result = await self.db.execute(stmt)
        rows = result.all()

        if not rows:
            # Try without orbit
            stmt2 = select(Satellite).where(Satellite.norad_id == norad_id)
            sat_result = await self.db.execute(stmt2)
            sat = sat_result.scalar_one_or_none()
            if not sat:
                raise ValueError(f"Satellite NORAD {norad_id} not found")
            return SatelliteWeatherAnalysis(
                norad_id=norad_id,
                name=sat.name,
                recommendations=["Nessun dato orbitale disponibile per analisi dettagliata."],
            )

        # Pick latest orbit
        best_sat, best_orbit = rows[0]
        for sat, orbit in rows:
            if orbit.epoch and (not best_orbit.epoch or orbit.epoch > best_orbit.epoch):
                best_sat, best_orbit = sat, orbit

        # Get orbital parameters
        alt = None
        if best_orbit.perigee_km is not None:
            alt = best_orbit.perigee_km
        elif best_orbit.semi_major_axis_km is not None:
            alt = best_orbit.semi_major_axis_km - 6371.0

        inc = best_orbit.inclination_deg
        orbit_type = getattr(best_orbit, "orbit_type", None)
        if not orbit_type and alt is not None:
            if alt < 2000:
                orbit_type = "LEO"
            elif alt < 20200:
                orbit_type = "MEO"
            elif 35000 < alt < 36000:
                orbit_type = "GEO"
            else:
                orbit_type = "HEO"

        # Get current weather
        cond = await self.get_current_conditions()
        sw = await _fetch_solar_wind()
        kp = cond.kp_index
        bz = sw.bz_gsm_nt
        xray = cond.xray_class
        proton = cond.proton_flux_10mev

        # -- Drag analysis --
        drag_pct = 0.0
        drag_risk = "none"
        projected_decay = None
        if alt is not None and alt < 600:
            drag_pct = _estimate_drag_increase(kp, alt)
            if drag_pct > 15:
                drag_risk = "critical"
            elif drag_pct > 8:
                drag_risk = "high"
            elif drag_pct > 3:
                drag_risk = "moderate"
            elif drag_pct > 0:
                drag_risk = "low"
            # Rough decay estimate: base ~1-5 m/day at 400km, scales with drag
            if alt < 500:
                base_decay = max(0.5, (500 - alt) * 0.02)
                projected_decay = round(base_decay * (1 + drag_pct / 100), 1)

        # -- Per-system impacts --
        kp_active = kp >= 4
        x_high = xray and xray[0].upper() in ("M", "X")
        bz_neg = bz is not None and bz < -5
        is_polar = inc is not None and (inc > 70 or inc < -70)
        is_leo = alt is not None and alt < 2000

        impacts = []
        # HF Comms
        if x_high or kp_active:
            impacts.append(SystemImpact(
                system="Comm HF", status="Degradata",
                detail=f"MUF ridotto ~{max(5, 30 - round(kp * 3))}%"
                       + (" — blackout X-ray" if x_high else ""),
                color="#d29922",
            ))
        else:
            impacts.append(SystemImpact(
                system="Comm HF", status="Nominale",
                detail="Nessun impatto", color="#3fb950",
            ))

        # VHF/UHF (polar scintillation)
        if is_polar and kp >= 5:
            impacts.append(SystemImpact(
                system="Comm VHF/UHF", status="Degradata",
                detail="Scintillazione polare — orbita ad alta inclinazione",
                color="#d29922",
            ))
        else:
            impacts.append(SystemImpact(
                system="Comm VHF/UHF", status="Nominale",
                detail="Nessun impatto", color="#3fb950",
            ))

        # GPS/GNSS
        if kp_active:
            err = f"±{round(kp)}-{round(kp * 2)}m extra"
            impacts.append(SystemImpact(
                system="GPS/GNSS", status="Ridotta acc.",
                detail=err, color="#d29922",
            ))
        else:
            impacts.append(SystemImpact(
                system="GPS/GNSS", status="Nominale",
                detail="Nessun impatto", color="#3fb950",
            ))

        # Drag LEO
        if is_leo and drag_pct > 0:
            impacts.append(SystemImpact(
                system="Drag atmosferico", status="Elevato" if drag_pct > 5 else "Moderato",
                detail=f"+{drag_pct:.1f}% drag"
                       + (f", decadimento ~{projected_decay} m/giorno" if projected_decay else ""),
                color="#f85149" if drag_pct > 8 else "#d29922",
            ))
        else:
            impacts.append(SystemImpact(
                system="Drag atmosferico", status="Nominale",
                detail="Non significativo" if not is_leo else "Kp sotto soglia",
                color="#3fb950",
            ))

        # SAR
        if kp >= 7 or bz_neg:
            impacts.append(SystemImpact(
                system="Radar SAR", status="Degradato",
                detail="Ionosfera perturbata" + (" — Bz negativo" if bz_neg else ""),
                color="#d29922",
            ))
        else:
            impacts.append(SystemImpact(
                system="Radar SAR", status="Nominale",
                detail="Non impattato", color="#3fb950",
            ))

        # EO Sensors
        if proton and proton > 1000:
            impacts.append(SystemImpact(
                system="Sensori EO/IR", status="Degradato",
                detail=f"Rumore particelle — proton flux {proton:.0f} pfu",
                color="#f85149",
            ))
        elif kp >= 8:
            impacts.append(SystemImpact(
                system="Sensori EO/IR", status="Degradato",
                detail="Particelle energetiche", color="#d29922",
            ))
        else:
            impacts.append(SystemImpact(
                system="Sensori EO/IR", status="Nominale",
                detail="Non impattato", color="#3fb950",
            ))

        # -- Vulnerability score (0-100) --
        score = 0.0
        score += min(30, drag_pct * 2)  # drag up to 30 pts
        score += min(20, kp * 3)  # kp up to 27 → cap 20
        if bz_neg:
            score += 15
        if x_high:
            score += 15
        if proton and proton > 100:
            score += min(20, proton / 500 * 20)
        score = min(100, score)

        if score >= 70:
            vuln = "critical"
        elif score >= 45:
            vuln = "high"
        elif score >= 20:
            vuln = "moderate"
        else:
            vuln = "low"

        # -- Recommendations --
        recs: list[str] = []
        if drag_pct > 5 and is_leo:
            recs.append(f"Monitorare decadimento orbitale — drag +{drag_pct:.1f}%")
        if drag_pct > 10 and is_leo:
            recs.append("Valutare manovra di station-keeping preventiva")
        if x_high:
            recs.append("Limitare operazioni HF durante il flare X-ray")
        if bz_neg:
            recs.append("Bz negativo: possibile intensificazione nelle prossime 2-4h")
        if is_polar and kp >= 5:
            recs.append("Orbita polare: prevedere perdita segnale VHF in zone aurorali")
        if proton and proton > 1000:
            recs.append("Proton flux elevato: proteggere sensori ottici sensibili")
        if kp_active:
            recs.append(f"Precisione GPS degradata ±{round(kp)}-{round(kp*2)}m")
        if not recs:
            recs.append("Condizioni nominali — nessuna azione richiesta")

        return SatelliteWeatherAnalysis(
            norad_id=norad_id,
            name=best_sat.name,
            altitude_km=round(alt, 1) if alt else None,
            inclination_deg=round(inc, 2) if inc else None,
            orbit_type=orbit_type,
            drag_increase_pct=round(drag_pct, 1),
            drag_risk=drag_risk,
            projected_decay_m_day=projected_decay,
            impacts=impacts,
            vulnerability_score=round(score, 1),
            vulnerability_level=vuln,
            recommendations=recs,
            current_kp=kp,
            current_storm=cond.storm_level.value,
        )
