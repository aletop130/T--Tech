"""Satellite profile service — fuses data from DB, CelesTrak, and SatNOGS."""
import time
from typing import Optional

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import get_logger
from app.db.models.ontology import Satellite, Orbit
from app.services.celestrack import CelesTrackClient, FAMOUS_SATELLITES
from app.schemas.satellite_profile import (
    SatelliteProfile,
    OrbitInfo,
    TransmitterInfo,
)

logger = get_logger(__name__)

SATNOGS_BASE = "https://db.satnogs.org/api"

# Simple TTL cache: {norad_id: (timestamp, data)}
_profile_cache: dict[int, tuple[float, SatelliteProfile]] = {}
_CACHE_TTL = 600  # 10 minutes


class SatelliteProfileService:
    """Fetches and fuses satellite data from multiple OSINT sources."""

    def __init__(self, db: AsyncSession):
        self.db = db
        self.celestrak = CelesTrackClient()
        self.http = httpx.AsyncClient(timeout=15.0)

    async def get_profile(self, norad_id: int) -> SatelliteProfile:
        now = time.time()
        cached = _profile_cache.get(norad_id)
        if cached and (now - cached[0]) < _CACHE_TTL:
            return cached[1]

        # Fetch from all sources concurrently-ish (sequential to avoid overload)
        db_data = await self._from_db(norad_id)
        tle_data = await self._from_celestrak(norad_id)
        transmitters = await self._from_satnogs(norad_id)

        sources: list[str] = []

        # Start with defaults
        name = f"NORAD {norad_id}"
        country: Optional[str] = None
        operator: Optional[str] = None
        object_type: Optional[str] = None
        purpose: Optional[str] = None
        is_active = True
        intl_designator: Optional[str] = None
        launch_date: Optional[str] = None
        mass_kg: Optional[float] = None
        rcs_m2: Optional[float] = None
        faction: Optional[str] = None
        orbit: Optional[OrbitInfo] = None

        # Layer 1: Local DB
        if db_data:
            sources.append("local_db")
            name = db_data.get("name", name)
            country = db_data.get("country")
            operator = db_data.get("operator")
            object_type = db_data.get("object_type")
            is_active = db_data.get("is_active", True)
            intl_designator = db_data.get("international_designator")
            launch_date = db_data.get("launch_date")
            mass_kg = db_data.get("mass_kg")
            rcs_m2 = db_data.get("rcs_m2")
            faction = db_data.get("faction")
            if db_data.get("orbit"):
                o = db_data["orbit"]
                orbit = OrbitInfo(
                    epoch=o.get("epoch"),
                    inclination_deg=o.get("inclination_deg"),
                    raan_deg=o.get("raan_deg"),
                    eccentricity=o.get("eccentricity"),
                    arg_perigee_deg=o.get("arg_perigee_deg"),
                    mean_anomaly_deg=o.get("mean_anomaly_deg"),
                    mean_motion_rev_day=o.get("mean_motion_rev_day"),
                    period_minutes=o.get("period_minutes"),
                    apogee_km=o.get("apogee_km"),
                    perigee_km=o.get("perigee_km"),
                    orbit_type=o.get("orbit_type"),
                    tle_line1=o.get("tle_line1"),
                    tle_line2=o.get("tle_line2"),
                )

        # Layer 2: FAMOUS_SATELLITES overlay
        famous = FAMOUS_SATELLITES.get(norad_id)
        if famous:
            sources.append("faction_catalog")
            name = famous.get("name", name)
            country = famous.get("country", country)
            operator = famous.get("operator", operator)
            faction = famous.get("faction", faction)

        # Layer 3: CelesTrak TLE
        if tle_data:
            sources.append("celestrak")
            if not intl_designator:
                intl_designator = tle_data.get("international_designator")
            tle_name = tle_data.get("name", "").strip()
            if tle_name and name == f"NORAD {norad_id}":
                name = tle_name

            mm = None
            if tle_data.get("tle_line2"):
                try:
                    mm = float(tle_data["tle_line2"][52:63])
                except (ValueError, IndexError):
                    pass

            inc = ecc = raan = argp = ma = None
            line2 = tle_data.get("tle_line2", "")
            if len(line2) >= 63:
                try:
                    inc = float(line2[8:16])
                    raan = float(line2[17:25])
                    ecc = float("0." + line2[26:33])
                    argp = float(line2[34:42])
                    ma = float(line2[43:51])
                except (ValueError, IndexError):
                    pass

            period = (1440.0 / mm) if mm and mm > 0 else None
            earth_r = 6371.0
            if mm and mm > 0:
                import math
                a = (8681663.653 / (mm * mm)) ** (1.0 / 3.0)  # semi-major axis in km
                e = ecc if ecc is not None else 0.0
                apogee = a * (1 + e) - earth_r
                perigee = a * (1 - e) - earth_r
            else:
                apogee = perigee = None

            orbit_type_str = _classify_orbit(inc, period, ecc)
            epoch_str = tle_data.get("epoch")
            if epoch_str and hasattr(epoch_str, "isoformat"):
                epoch_str = epoch_str.isoformat()

            if orbit is None:
                orbit = OrbitInfo(
                    epoch=epoch_str,
                    inclination_deg=inc,
                    raan_deg=raan,
                    eccentricity=ecc,
                    arg_perigee_deg=argp,
                    mean_anomaly_deg=ma,
                    mean_motion_rev_day=mm,
                    period_minutes=round(period, 2) if period else None,
                    apogee_km=round(apogee, 1) if apogee is not None else None,
                    perigee_km=round(perigee, 1) if perigee is not None else None,
                    orbit_type=orbit_type_str,
                    tle_line1=tle_data.get("tle_line1"),
                    tle_line2=tle_data.get("tle_line2"),
                )
            else:
                # Fill gaps
                if not orbit.tle_line1:
                    orbit.tle_line1 = tle_data.get("tle_line1")
                    orbit.tle_line2 = tle_data.get("tle_line2")
                if orbit.orbit_type is None:
                    orbit.orbit_type = orbit_type_str

        # Layer 4: SatNOGS transmitters
        if transmitters:
            sources.append("satnogs")

        # Derive purpose from transmitters if not set
        if not purpose and transmitters:
            services = {t.service for t in transmitters if t.service}
            if services:
                purpose = ", ".join(sorted(services))

        profile = SatelliteProfile(
            norad_id=norad_id,
            name=name,
            international_designator=intl_designator,
            country=country,
            operator=operator,
            object_type=object_type,
            purpose=purpose,
            is_active=is_active,
            launch_date=launch_date,
            mass_kg=mass_kg,
            rcs_m2=rcs_m2,
            faction=faction,
            orbit=orbit,
            transmitters=transmitters,
            sources=sources,
        )

        _profile_cache[norad_id] = (now, profile)
        return profile

    async def _from_db(self, norad_id: int) -> Optional[dict]:
        try:
            stmt = select(Satellite).where(Satellite.norad_id == norad_id)
            result = await self.db.execute(stmt)
            sat = result.scalar_one_or_none()
            if not sat:
                return None

            data: dict = {
                "name": sat.name,
                "country": sat.country,
                "operator": sat.operator,
                "object_type": sat.object_type,
                "is_active": sat.is_active,
                "international_designator": sat.international_designator,
                "launch_date": sat.launch_date.isoformat() if sat.launch_date else None,
                "mass_kg": sat.mass_kg,
                "rcs_m2": sat.rcs_m2,
                "faction": getattr(sat, "faction", None),
            }

            # Get latest orbit
            orbit_stmt = (
                select(Orbit)
                .where(Orbit.satellite_id == sat.id)
                .order_by(Orbit.epoch.desc())
                .limit(1)
            )
            orbit_result = await self.db.execute(orbit_stmt)
            orbit = orbit_result.scalar_one_or_none()
            if orbit:
                data["orbit"] = {
                    "epoch": orbit.epoch.isoformat() if orbit.epoch else None,
                    "inclination_deg": orbit.inclination_deg,
                    "raan_deg": orbit.raan_deg,
                    "eccentricity": orbit.eccentricity,
                    "arg_perigee_deg": orbit.arg_perigee_deg,
                    "mean_anomaly_deg": orbit.mean_anomaly_deg,
                    "mean_motion_rev_day": orbit.mean_motion_rev_day,
                    "period_minutes": orbit.period_minutes,
                    "apogee_km": orbit.apogee_km,
                    "perigee_km": orbit.perigee_km,
                    "orbit_type": orbit.orbit_type,
                    "tle_line1": orbit.tle_line1,
                    "tle_line2": orbit.tle_line2,
                }

            return data
        except Exception as e:
            logger.warning("Failed to fetch satellite from DB", norad_id=norad_id, error=str(e))
            return None

    async def _from_celestrak(self, norad_id: int) -> Optional[dict]:
        try:
            return await self.celestrak.fetch_tle_by_norad_id(norad_id)
        except Exception as e:
            logger.warning("CelesTrak fetch failed", norad_id=norad_id, error=str(e))
            return None

    async def _from_satnogs(self, norad_id: int) -> list[TransmitterInfo]:
        try:
            resp = await self.http.get(
                f"{SATNOGS_BASE}/transmitters/",
                params={"satellite__norad_cat_id": norad_id, "format": "json"},
            )
            if resp.status_code != 200:
                return []
            raw = resp.json()
            result = []
            for t in raw:
                result.append(TransmitterInfo(
                    uuid=t.get("uuid"),
                    description=t.get("description", ""),
                    alive=t.get("alive", True),
                    uplink_low=t.get("uplink_low"),
                    uplink_high=t.get("uplink_high"),
                    downlink_low=t.get("downlink_low"),
                    downlink_high=t.get("downlink_high"),
                    mode=t.get("mode"),
                    baud=t.get("baud"),
                    type=t.get("type"),
                    service=t.get("service"),
                    status=t.get("status"),
                ))
            return result
        except Exception as e:
            logger.warning("SatNOGS fetch failed", norad_id=norad_id, error=str(e))
            return []


def _classify_orbit(
    inclination: Optional[float],
    period: Optional[float],
    eccentricity: Optional[float],
) -> Optional[str]:
    if inclination is None or period is None:
        return None
    if 1400 < period < 1500:
        return "GEO"
    if 86 < inclination < 84 + 20 and period and 600 < period < 850:
        return "Molniya"
    if 95 < inclination < 100 and period and 90 < period < 110:
        return "SSO"
    if period < 130:
        return "LEO"
    if 130 <= period < 700:
        return "MEO"
    if period >= 700:
        return "HEO"
    return None
