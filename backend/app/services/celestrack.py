"""CelesTrack API client for fetching TLE data."""
from datetime import datetime, timedelta
from typing import Optional
import httpx
from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import get_logger
from app.core.config import settings

logger = get_logger(__name__)


# Allied satellites (friendly forces) - Displayed as BLUE
ALLIED_SATELLITES = {
    25544: {"name": "Guardian Station Alpha", "country": "Multinational", "operator": "NASA/ESA/JAXA/CSA", "faction": "allied"},
    36516: {"name": "DeepWatch One", "country": "USA", "operator": "NASA/ESA", "faction": "allied"},
    20580: {"name": "TerraScan-1", "country": "USA", "operator": "NASA/USGS", "faction": "allied"},
    43013: {"name": "StarFinder-A", "country": "USA", "operator": "NASA/MIT", "faction": "allied"},
    43205: {"name": "Celestial Station", "country": "China", "operator": "CNSA", "faction": "allied"},
    43689: {"name": "WindWatcher", "country": "Europe", "operator": "ESA", "faction": "allied"},
    44713: {"name": "CommLink-1", "country": "USA", "operator": "SpaceX", "faction": "allied"},
    25530: {"name": "WeatherEye-1", "country": "USA", "operator": "NOAA", "faction": "allied"},
    25994: {"name": "NavBeacon-1", "country": "USA", "operator": "US Space Force", "faction": "allied"},
    43286: {"name": "EyeInSky-1", "country": "India", "operator": "ISRO", "faction": "allied"},
}

# Enemy satellites (unknown/hostile forces) - Displayed as RED
# Data sourced from CelesTrak (celestrak.org) - Real NORAD Catalog IDs
ENEMY_SATELLITES = {
    # Space stations and related — Chinese CSS modules
    48274: {"name": "UNKNOWN-ALPHA", "country": "China", "operator": "CNSA", "faction": "enemy"},
    49044: {"name": "UNKNOWN-BETA", "country": "Russia", "operator": "Roscosmos", "faction": "enemy"},
    53239: {"name": "UNKNOWN-GAMMA", "country": "China", "operator": "CNSA", "faction": "enemy"},
    # Navigation constellation — adversary GNSS
    24876: {"name": "HOSTILE-NAV-1", "country": "Russia", "operator": "VKS", "faction": "enemy"},
    26407: {"name": "HOSTILE-NAV-2", "country": "Russia", "operator": "VKS", "faction": "enemy"},
    26690: {"name": "HOSTILE-NAV-3", "country": "Russia", "operator": "VKS", "faction": "enemy"},
    27663: {"name": "HOSTILE-NAV-4", "country": "Russia", "operator": "VKS", "faction": "enemy"},
    27704: {"name": "HOSTILE-NAV-5", "country": "Russia", "operator": "VKS", "faction": "enemy"},
    # Communication / SIGINT satellites
    40115: {"name": "SUSPECT-COM-1", "country": "Russia", "operator": "GRU", "faction": "enemy"},
    40116: {"name": "SUSPECT-COM-2", "country": "Russia", "operator": "GRU", "faction": "enemy"},
    41771: {"name": "SUSPECT-COM-3", "country": "China", "operator": "PLA-SSF", "faction": "enemy"},
    # Earth observation / reconnaissance
    27424: {"name": "TRACKED-OBJ-1", "country": "China", "operator": "PLA-SSF", "faction": "enemy"},
    33591: {"name": "TRACKED-OBJ-2", "country": "China", "operator": "CNSA", "faction": "enemy"},
    37214: {"name": "TRACKED-OBJ-3", "country": "China", "operator": "CMA", "faction": "enemy"},
    # Scientific / dual-use
    39444: {"name": "UNIDENTIFIED-1", "country": "Iran", "operator": "ISA", "faction": "enemy"},
    41465: {"name": "UNIDENTIFIED-2", "country": "DPRK", "operator": "NADA", "faction": "enemy"},
    44484: {"name": "UNIDENTIFIED-3", "country": "Iran", "operator": "IRGC-ASF", "faction": "enemy"},
    # Recent contacts — unattributed
    49271: {"name": "CONTACT-X1", "country": "China", "operator": "Unknown", "faction": "enemy"},
    54216: {"name": "CONTACT-X2", "country": "China", "operator": "CNSA", "faction": "enemy"},
}

# Italian satellites (ASI / Italian MoD) - Displayed as BLUE
ITALIAN_SATELLITES = {
    31598: {"name": "COSMO-SkyMed 1", "country": "Italy", "operator": "ASI/MoD", "faction": "allied"},
    32376: {"name": "COSMO-SkyMed 2", "country": "Italy", "operator": "ASI/MoD", "faction": "allied"},
    33412: {"name": "COSMO-SkyMed 3", "country": "Italy", "operator": "ASI/MoD", "faction": "allied"},
    36599: {"name": "COSMO-SkyMed 4", "country": "Italy", "operator": "ASI/MoD", "faction": "allied"},
    44873: {"name": "CSG-1", "country": "Italy", "operator": "ASI/MoD", "faction": "allied"},
    51444: {"name": "CSG-2", "country": "Italy", "operator": "ASI/MoD", "faction": "allied"},
    44072: {"name": "PRISMA", "country": "Italy", "operator": "ASI", "faction": "allied"},
    42900: {"name": "OPTSAT-3000", "country": "Italy", "operator": "Italian MoD", "faction": "allied"},
    39613: {"name": "ATHENA-FIDUS", "country": "Italy/France", "operator": "ASI/CNES", "faction": "allied"},
    26694: {"name": "SICRAL-1", "country": "Italy", "operator": "Italian MoD", "faction": "allied"},
    37605: {"name": "SICRAL-1B", "country": "Italy", "operator": "Italian MoD", "faction": "allied"},
    40258: {"name": "SICRAL-2", "country": "Italy", "operator": "Italian MoD", "faction": "allied"},
}

# NATO Allied satellites (European key assets) - Displayed as BLUE
NATO_ALLIED_SATELLITES = {
    39634: {"name": "Sentinel-1A", "country": "Europe", "operator": "ESA", "faction": "allied"},
    41456: {"name": "Sentinel-1B", "country": "Europe", "operator": "ESA", "faction": "allied"},
    36793: {"name": "Pleiades-1A", "country": "France", "operator": "CNES", "faction": "allied"},
    38012: {"name": "Pleiades-1B", "country": "France", "operator": "CNES", "faction": "allied"},
    37846: {"name": "Galileo FOC-1", "country": "Europe", "operator": "ESA", "faction": "allied"},
    38857: {"name": "Galileo FOC-2", "country": "Europe", "operator": "ESA", "faction": "allied"},
    43234: {"name": "Carbonite-2", "country": "United Kingdom", "operator": "UK MoD", "faction": "allied"},
}

# Backward compatibility - combine all for existing references
FAMOUS_SATELLITES = {**ALLIED_SATELLITES, **ITALIAN_SATELLITES, **NATO_ALLIED_SATELLITES, **ENEMY_SATELLITES}

# CelesTrak group catalog for browsing
CELESTRAK_GROUPS: dict[str, dict[str, str]] = {
    "Special Interest": {
        "last-30-days": "Last 30 Days",
        "stations": "Space Stations",
        "visual": "Brightest (Visual)",
        "active": "Active Satellites",
        "analyst": "Analyst Satellites",
    },
    "Debris": {
        "cosmos-1408-debris": "COSMOS 1408 Debris",
        "fengyun-1c-debris": "Fengyun 1C Debris",
        "iridium-33-debris": "Iridium 33 Debris",
        "cosmos-2251-debris": "COSMOS 2251 Debris",
    },
    "Weather": {
        "weather": "Weather",
        "noaa": "NOAA",
        "goes": "GOES",
        "resource": "Earth Resources",
        "sarsat": "Search & Rescue (SARSAT)",
    },
    "Communications": {
        "geo": "Geostationary",
        "intelsat": "Intelsat",
        "ses": "SES",
        "starlink": "Starlink",
        "oneweb": "OneWeb",
        "iridium-NEXT": "Iridium NEXT",
        "orbcomm": "Orbcomm",
        "globalstar": "Globalstar",
        "amateur": "Amateur Radio",
    },
    "Navigation": {
        "gnss": "GNSS (All)",
        "gps-ops": "GPS Operational",
        "glo-ops": "GLONASS Operational",
        "galileo": "Galileo",
        "beidou": "Beidou",
    },
    "Science": {
        "science": "Space & Earth Science",
        "geodetic": "Geodetic",
        "engineering": "Engineering",
        "education": "Education",
    },
    "Military": {
        "military": "Military",
    },
    "Other": {
        "cubesat": "CubeSats",
        "radar": "Radar Calibration",
        "other": "Miscellaneous",
    },
}


class CelesTrackClient:
    """HTTP client for CelesTrack API."""

    def __init__(self, base_url: Optional[str] = None):
        self.base_url = base_url or settings.CELESTRACK_BASE_URL
        self.client = httpx.AsyncClient(timeout=30.0)

    @staticmethod
    def _parse_tle_block(name: str, line1: str, line2: str) -> dict:
        """Parse a single 3-line TLE block into a dict."""
        # Extract NORAD ID from line 2 columns 3-7
        norad_id = int(line2[2:7].strip())

        # Parse epoch from line 1 (columns 19-32)
        epoch_str = line1[18:32].strip()
        year = int(epoch_str[0:2])
        day_of_year = float(epoch_str[2:])

        if year < 57:
            year += 2000
        else:
            year += 1900

        start_of_year = datetime(year, 1, 1)
        epoch = start_of_year + timedelta(days=day_of_year - 1)

        classification = line1[7:8].strip() or "U"
        intl_designator = line1[9:17].strip()
        element_set = int(line1[64:68].strip())
        rev_num = int(line2[63:68].strip())

        return {
            "norad_id": norad_id,
            "name": name,
            "tle_line1": line1,
            "tle_line2": line2,
            "epoch": epoch,
            "classification": classification,
            "international_designator": intl_designator,
            "element_set_number": element_set,
            "revolution_number": rev_num,
        }

    async def fetch_tle_by_norad_id(self, norad_id: int) -> Optional[dict]:
        """Fetch TLE data for a specific satellite by NORAD ID."""
        try:
            url = f"{self.base_url}/gp.php"
            params = {
                "CATNR": norad_id,
                "FORMAT": "TLE"
            }

            logger.info("Fetching TLE from CelesTrack", norad_id=norad_id)
            response = await self.client.get(url, params=params)
            response.raise_for_status()

            tle_text = response.text.strip()
            if not tle_text or "No GP data found" in tle_text:
                logger.warning("No TLE found for satellite", norad_id=norad_id)
                return None

            lines = tle_text.split('\n')
            if len(lines) < 3:
                logger.warning("Invalid TLE format", norad_id=norad_id)
                return None

            try:
                result = self._parse_tle_block(lines[0].strip(), lines[1].strip(), lines[2].strip())
                result["norad_id"] = norad_id  # Override with requested ID
                logger.info("TLE fetched successfully", norad_id=norad_id, epoch=result["epoch"].isoformat())
                return result
            except Exception as e:
                logger.warning("Failed to parse TLE block", norad_id=norad_id, error=str(e))
                return None

        except httpx.HTTPStatusError as e:
            logger.error("HTTP error fetching TLE", norad_id=norad_id, error=str(e))
            return None
        except Exception as e:
            logger.error("Error fetching TLE", norad_id=norad_id, error=str(e))
            return None

    async def fetch_tle_by_group(self, group: str) -> list[dict]:
        """Fetch TLE data for all satellites in a CelesTrak group."""
        try:
            url = f"{self.base_url}/gp.php"
            params = {"GROUP": group, "FORMAT": "TLE"}

            logger.info("Fetching TLE group from CelesTrack", group=group)
            response = await self.client.get(url, params=params, timeout=60.0)
            response.raise_for_status()

            tle_text = response.text.strip()
            if not tle_text or "No GP data found" in tle_text:
                logger.warning("No TLE found for group", group=group)
                return []

            lines = [l.rstrip() for l in tle_text.split('\n') if l.strip()]
            results = []

            for i in range(0, len(lines) - 2, 3):
                try:
                    result = self._parse_tle_block(lines[i].strip(), lines[i+1].strip(), lines[i+2].strip())
                    results.append(result)
                except Exception:
                    continue

            logger.info("Group TLEs fetched", group=group, count=len(results))
            return results
        except Exception as e:
            logger.error("Error fetching TLE group", group=group, error=str(e))
            return []

    async def search_by_name(self, name: str) -> list[dict]:
        """Search CelesTrak satellites by name."""
        try:
            url = f"{self.base_url}/gp.php"
            params = {"NAME": name, "FORMAT": "TLE"}

            logger.info("Searching CelesTrack by name", name=name)
            response = await self.client.get(url, params=params, timeout=30.0)
            response.raise_for_status()

            tle_text = response.text.strip()
            if not tle_text or "No GP data found" in tle_text:
                return []

            lines = [l.rstrip() for l in tle_text.split('\n') if l.strip()]
            results = []

            for i in range(0, len(lines) - 2, 3):
                try:
                    result = self._parse_tle_block(lines[i].strip(), lines[i+1].strip(), lines[i+2].strip())
                    results.append(result)
                except Exception:
                    continue

            logger.info("Name search results", name=name, count=len(results))
            return results
        except Exception as e:
            logger.error("Error searching CelesTrack", name=name, error=str(e))
            return []
    
    async def fetch_famous_satellites(self) -> list[dict]:
        """Fetch TLE data for the famous satellites (all factions)."""
        results = []
        
        logger.info("Fetching TLEs for famous satellites", count=len(FAMOUS_SATELLITES))
        
        for norad_id, info in FAMOUS_SATELLITES.items():
            tle_data = await self.fetch_tle_by_norad_id(norad_id)
            if tle_data:
                tle_data.update(info)
                results.append(tle_data)
        
        logger.info("Famous satellites fetched", successful=len(results), total=len(FAMOUS_SATELLITES))
        return results
    
    async def fetch_allied_satellites(self) -> list[dict]:
        """Fetch TLE data for allied satellites (blue)."""
        results = []
        
        logger.info("Fetching TLEs for allied satellites", count=len(ALLIED_SATELLITES))
        
        for norad_id, info in ALLIED_SATELLITES.items():
            tle_data = await self.fetch_tle_by_norad_id(norad_id)
            if tle_data:
                tle_data.update(info)
                results.append(tle_data)
        
        logger.info("Allied satellites fetched", successful=len(results), total=len(ALLIED_SATELLITES))
        return results
    
    async def fetch_enemy_satellites(self) -> list[dict]:
        """Fetch TLE data for enemy satellites (red)."""
        results = []
        
        logger.info("Fetching TLEs for enemy satellites", count=len(ENEMY_SATELLITES))
        
        for norad_id, info in ENEMY_SATELLITES.items():
            tle_data = await self.fetch_tle_by_norad_id(norad_id)
            if tle_data:
                tle_data.update(info)
                results.append(tle_data)
        
        logger.info("Enemy satellites fetched", successful=len(results), total=len(ENEMY_SATELLITES))
        return results
    
    async def fetch_multiple_satellites(self, norad_ids: list[int]) -> list[dict]:
        """Fetch TLE data for multiple satellites by NORAD IDs."""
        results = []
        
        logger.info("Fetching TLEs for multiple satellites", count=len(norad_ids))
        
        for norad_id in norad_ids:
            tle_data = await self.fetch_tle_by_norad_id(norad_id)
            if tle_data:
                if norad_id in FAMOUS_SATELLITES:
                    tle_data.update(FAMOUS_SATELLITES[norad_id])
                results.append(tle_data)
        
        logger.info("Multiple satellites fetched", successful=len(results), total=len(norad_ids))
        return results
    
    async def close(self):
        """Close the HTTP client."""
        await self.client.aclose()


class CelesTrackService:
    """Service for managing CelesTrack operations."""
    
    def __init__(self):
        self.client = CelesTrackClient()
    
    async def fetch_and_store_satellites(
        self,
        norad_ids: list[int],
        tenant_id: str,
        user_id: Optional[str] = None,
        db: Optional[AsyncSession] = None,
    ) -> dict:
        """Fetch satellites from CelesTrack and store in database."""
        from app.services.ontology import OntologyService
        from app.services.audit import AuditService
        from app.db.base import async_session_factory
        from app.schemas.ontology import SatelliteCreate, OrbitCreate
        
        tle_data_list = await self.client.fetch_multiple_satellites(norad_ids)
        
        if not tle_data_list:
            return {
                "success": False,
                "message": "No TLE data fetched",
                "satellites_created": 0,
                "satellites_updated": 0,
                "errors": [],
            }
        
        created_count = 0
        updated_count = 0
        errors = []
        satellite_ids = []
        
        async def process_satellites(session):
            nonlocal created_count, updated_count
            audit = AuditService(session)
            ontology = OntologyService(session, audit)
            
            for tle_data in tle_data_list:
                try:
                    norad_id = tle_data["norad_id"]
                    existing = await ontology.get_satellite_by_norad(norad_id, tenant_id)
                    
                    if existing:
                        satellite_id = str(existing.id)
                        orbit_data = OrbitCreate(
                            satellite_id=satellite_id,
                            epoch=tle_data["epoch"],
                            tle_line1=tle_data["tle_line1"],
                            tle_line2=tle_data["tle_line2"],
                            source="celestrack",
                            semi_major_axis_km=None,
                            eccentricity=None,
                            inclination_deg=None,
                            raan_deg=None,
                            arg_perigee_deg=None,
                            mean_anomaly_deg=None,
                            mean_motion_rev_day=None,
                        )
                        await ontology.create_orbit(orbit_data, tenant_id, user_id)
                        updated_count += 1
                        satellite_ids.append(satellite_id)
                        logger.info("Satellite TLE updated", satellite_id=satellite_id, norad_id=norad_id)
                    else:
                        sat_data = SatelliteCreate(
                            norad_id=norad_id,
                            name=tle_data.get("name", f"Satellite {norad_id}"),
                            country=tle_data.get("country"),
                            operator=tle_data.get("operator"),
                            classification=tle_data.get("classification", "unclassified"),
                            international_designator=tle_data.get("international_designator"),
                            is_active=True,
                            mass_kg=None,
                            rcs_m2=None,
                        )
                        
                        satellite = await ontology.create_satellite(sat_data, tenant_id, user_id)
                        satellite_id = str(satellite.id)
                        
                        orbit_data = OrbitCreate(
                            satellite_id=satellite_id,
                            epoch=tle_data["epoch"],
                            tle_line1=tle_data["tle_line1"],
                            tle_line2=tle_data["tle_line2"],
                            source="celestrack",
                            semi_major_axis_km=None,
                            eccentricity=None,
                            inclination_deg=None,
                            raan_deg=None,
                            arg_perigee_deg=None,
                            mean_anomaly_deg=None,
                            mean_motion_rev_day=None,
                        )
                        await ontology.create_orbit(orbit_data, tenant_id, user_id)
                        created_count += 1
                        satellite_ids.append(satellite_id)
                        logger.info("Satellite created", satellite_id=satellite_id, norad_id=norad_id)
                
                except Exception as e:
                    errors.append(f"Failed to process NORAD {tle_data.get('norad_id')}: {str(e)}")
                    logger.error("Failed to store satellite", error=str(e), tle_data=tle_data)
        
        if db:
            await process_satellites(db)
            await db.commit()
        else:
            async with async_session_factory() as session:
                await process_satellites(session)
                await session.commit()
        
        return {
            "success": True,
            "satellites_created": created_count,
            "satellites_updated": updated_count,
            "satellite_ids": satellite_ids,
            "errors": errors,
        }
    
    async def refresh_satellite_tle(
        self,
        satellite_id: str,
        tenant_id: str,
        user_id: Optional[str] = None,
        db: Optional[AsyncSession] = None,
    ) -> dict:
        """Refresh TLE for a specific satellite."""
        from app.services.ontology import OntologyService
        from app.services.audit import AuditService
        from app.db.base import async_session_factory
        from app.schemas.ontology import OrbitCreate
        
        async def _refresh(session):
            audit = AuditService(session)
            ontology = OntologyService(session, audit)
            
            satellite_obj = await ontology.get_satellite(satellite_id, tenant_id)
            if not satellite_obj:
                return {
                    "success": False,
                    "message": f"Satellite {satellite_id} not found",
                }
            
            norad_id = int(satellite_obj.norad_id)
            
            tle_data = await self.client.fetch_tle_by_norad_id(norad_id)
            if not tle_data:
                return {
                    "success": False,
                    "message": f"No TLE found for NORAD ID {norad_id}",
                }
            
            orbit_data = OrbitCreate(
                satellite_id=satellite_id,
                epoch=tle_data["epoch"],
                tle_line1=tle_data["tle_line1"],
                tle_line2=tle_data["tle_line2"],
                source="celestrack",
                semi_major_axis_km=None,
                eccentricity=None,
                inclination_deg=None,
                raan_deg=None,
                arg_perigee_deg=None,
                mean_anomaly_deg=None,
                mean_motion_rev_day=None,
            )
            orbit = await ontology.create_orbit(orbit_data, tenant_id, user_id)
            
            await session.commit()
            
            return {
                "success": True,
                "message": "TLE refreshed successfully",
                "satellite_id": satellite_id,
                "norad_id": norad_id,
                "orbit_id": str(orbit.id),
                "epoch": tle_data["epoch"].isoformat(),
            }
        
        if db:
            return await _refresh(db)
        else:
            async with async_session_factory() as session:
                return await _refresh(session)
    
    async def fetch_and_store_allied_satellites(
        self,
        tenant_id: str,
        user_id: Optional[str] = None,
        db: Optional[AsyncSession] = None,
    ) -> dict:
        """Fetch allied satellites from CelesTrack and store in database with mock names."""
        from app.services.ontology import OntologyService
        from app.services.audit import AuditService
        from app.db.base import async_session_factory
        from app.schemas.ontology import SatelliteCreate, OrbitCreate
        
        tle_data_list = await self.client.fetch_allied_satellites()
        
        if not tle_data_list:
            return {
                "success": False,
                "message": "No TLE data fetched",
                "satellites_created": 0,
                "satellites_updated": 0,
                "errors": [],
            }
        
        created_count = 0
        updated_count = 0
        errors = []
        satellite_ids = []
        
        async def process_satellites(session):
            nonlocal created_count, updated_count
            audit = AuditService(session)
            ontology = OntologyService(session, audit)
            
            for tle_data in tle_data_list:
                try:
                    norad_id = tle_data["norad_id"]
                    existing = await ontology.get_satellite_by_norad(norad_id, tenant_id)
                    
                    if existing:
                        satellite_id = str(existing.id)
                        # Update orbit with new TLE
                        orbit_data = OrbitCreate(
                            satellite_id=satellite_id,
                            epoch=tle_data["epoch"],
                            tle_line1=tle_data["tle_line1"],
                            tle_line2=tle_data["tle_line2"],
                            source="celestrack",
                            semi_major_axis_km=None,
                            eccentricity=None,
                            inclination_deg=None,
                            raan_deg=None,
                            arg_perigee_deg=None,
                            mean_anomaly_deg=None,
                            mean_motion_rev_day=None,
                        )
                        await ontology.create_orbit(orbit_data, tenant_id, user_id)
                        # Update satellite name to use mock name
                        from app.schemas.ontology import SatelliteUpdate
                        sat_update_data = {
                            "name": tle_data.get("name", f"Satellite {norad_id}"),
                            "country": tle_data.get("country"),
                            "operator": tle_data.get("operator"),
                            "classification": tle_data.get("classification", "unclassified"),
                        }
                        sat_update = SatelliteUpdate.model_validate(sat_update_data)
                        await ontology.update_satellite(satellite_id, sat_update, tenant_id, user_id)
                        updated_count += 1
                        satellite_ids.append(satellite_id)
                        logger.info("Allied satellite TLE and name updated", satellite_id=satellite_id, norad_id=norad_id, name=tle_data.get("name"))
                    else:
                        sat_data = SatelliteCreate(
                            norad_id=norad_id,
                            name=tle_data.get("name", f"Satellite {norad_id}"),
                            country=tle_data.get("country"),
                            operator=tle_data.get("operator"),
                            classification=tle_data.get("classification", "unclassified"),
                            international_designator=tle_data.get("international_designator"),
                            is_active=True,
                            mass_kg=None,
                            rcs_m2=None,
                        )
                        
                        satellite = await ontology.create_satellite(sat_data, tenant_id, user_id)
                        satellite_id = str(satellite.id)
                        
                        orbit_data = OrbitCreate(
                            satellite_id=satellite_id,
                            epoch=tle_data["epoch"],
                            tle_line1=tle_data["tle_line1"],
                            tle_line2=tle_data["tle_line2"],
                            source="celestrack",
                            semi_major_axis_km=None,
                            eccentricity=None,
                            inclination_deg=None,
                            raan_deg=None,
                            arg_perigee_deg=None,
                            mean_anomaly_deg=None,
                            mean_motion_rev_day=None,
                        )
                        await ontology.create_orbit(orbit_data, tenant_id, user_id)
                        created_count += 1
                        satellite_ids.append(satellite_id)
                        logger.info("Allied satellite created", satellite_id=satellite_id, norad_id=norad_id)
                
                except Exception as e:
                    errors.append(f"Failed to process NORAD {tle_data.get('norad_id')}: {str(e)}")
                    logger.error("Failed to store allied satellite", error=str(e), tle_data=tle_data)
        
        if db:
            await process_satellites(db)
            await db.commit()
        else:
            async with async_session_factory() as session:
                await process_satellites(session)
                await session.commit()
        
        return {
            "success": True,
            "satellites_created": created_count,
            "satellites_updated": updated_count,
            "satellite_ids": satellite_ids,
            "errors": errors,
        }
    
    async def fetch_and_store_enemy_satellites(
        self,
        tenant_id: str,
        user_id: Optional[str] = None,
        db: Optional[AsyncSession] = None,
    ) -> dict:
        """Fetch enemy satellites from CelesTrack and store in database with mock names."""
        from app.services.ontology import OntologyService
        from app.services.audit import AuditService
        from app.db.base import async_session_factory
        from app.schemas.ontology import SatelliteCreate, OrbitCreate
        
        tle_data_list = await self.client.fetch_enemy_satellites()
        
        if not tle_data_list:
            return {
                "success": False,
                "message": "No TLE data fetched",
                "satellites_created": 0,
                "satellites_updated": 0,
                "errors": [],
            }
        
        created_count = 0
        updated_count = 0
        errors = []
        satellite_ids = []
        
        async def process_satellites(session):
            nonlocal created_count, updated_count
            audit = AuditService(session)
            ontology = OntologyService(session, audit)
            
            for tle_data in tle_data_list:
                try:
                    norad_id = tle_data["norad_id"]
                    existing = await ontology.get_satellite_by_norad(norad_id, tenant_id)
                    
                    if existing:
                        satellite_id = str(existing.id)
                        orbit_data = OrbitCreate(
                            satellite_id=satellite_id,
                            epoch=tle_data["epoch"],
                            tle_line1=tle_data["tle_line1"],
                            tle_line2=tle_data["tle_line2"],
                            source="celestrack",
                            semi_major_axis_km=None,
                            eccentricity=None,
                            inclination_deg=None,
                            raan_deg=None,
                            arg_perigee_deg=None,
                            mean_anomaly_deg=None,
                            mean_motion_rev_day=None,
                        )
                        await ontology.create_orbit(orbit_data, tenant_id, user_id)
                        # Update satellite name to use mock name
                        from app.schemas.ontology import SatelliteUpdate
                        sat_update_data = {
                            "name": tle_data.get("name", f"Satellite {norad_id}"),
                            "country": tle_data.get("country"),
                            "operator": tle_data.get("operator"),
                            "classification": tle_data.get("classification", "unclassified"),
                        }
                        sat_update = SatelliteUpdate.model_validate(sat_update_data)
                        await ontology.update_satellite(satellite_id, sat_update, tenant_id, user_id)
                        updated_count += 1
                        satellite_ids.append(satellite_id)
                        logger.info("Enemy satellite TLE and name updated", satellite_id=satellite_id, norad_id=norad_id, name=tle_data.get("name"))
                    else:
                        sat_data = SatelliteCreate(
                            norad_id=norad_id,
                            name=tle_data.get("name", f"Satellite {norad_id}"),
                            country=tle_data.get("country"),
                            operator=tle_data.get("operator"),
                            classification=tle_data.get("classification", "unclassified"),
                            international_designator=tle_data.get("international_designator"),
                            is_active=True,
                            mass_kg=None,
                            rcs_m2=None,
                        )
                        
                        satellite = await ontology.create_satellite(sat_data, tenant_id, user_id)
                        satellite_id = str(satellite.id)
                        
                        orbit_data = OrbitCreate(
                            satellite_id=satellite_id,
                            epoch=tle_data["epoch"],
                            tle_line1=tle_data["tle_line1"],
                            tle_line2=tle_data["tle_line2"],
                            source="celestrack",
                            semi_major_axis_km=None,
                            eccentricity=None,
                            inclination_deg=None,
                            raan_deg=None,
                            arg_perigee_deg=None,
                            mean_anomaly_deg=None,
                            mean_motion_rev_day=None,
                        )
                        await ontology.create_orbit(orbit_data, tenant_id, user_id)
                        created_count += 1
                        satellite_ids.append(satellite_id)
                        logger.info("Enemy satellite created", satellite_id=satellite_id, norad_id=norad_id)
                
                except Exception as e:
                    errors.append(f"Failed to process NORAD {tle_data.get('norad_id')}: {str(e)}")
                    logger.error("Failed to store enemy satellite", error=str(e), tle_data=tle_data)
        
        if db:
            await process_satellites(db)
            await db.commit()
        else:
            async with async_session_factory() as session:
                await process_satellites(session)
                await session.commit()
        
        return {
            "success": True,
            "satellites_created": created_count,
            "satellites_updated": updated_count,
            "satellite_ids": satellite_ids,
            "errors": errors,
        }
    
    async def preview_group(self, group: str) -> dict:
        """Preview satellites in a CelesTrak group without storing."""
        tle_data_list = await self.client.fetch_tle_by_group(group)
        satellites = [
            {"norad_id": d["norad_id"], "name": d["name"]}
            for d in tle_data_list
        ]
        return {
            "group": group,
            "count": len(satellites),
            "satellites": satellites,
        }

    async def search_celestrak(self, name: str) -> dict:
        """Search CelesTrak by name without storing."""
        tle_data_list = await self.client.search_by_name(name)
        satellites = [
            {"norad_id": d["norad_id"], "name": d["name"]}
            for d in tle_data_list
        ]
        return {
            "query": name,
            "count": len(satellites),
            "satellites": satellites,
        }

    @staticmethod
    def _detect_object_type(group: str, name: str):
        """Detect the object type based on CelesTrak group name and object name."""
        from app.db.models.ontology import ObjectType
        group_lower = group.lower()
        name_upper = name.upper()
        if "debris" in group_lower or "DEB" in name_upper:
            return ObjectType.DEBRIS
        if "r/b" in name_upper or "rocket" in group_lower:
            return ObjectType.ROCKET_BODY
        return ObjectType.SATELLITE

    async def fetch_and_store_by_group(
        self,
        group: str,
        tenant_id: str,
        user_id: Optional[str] = None,
        db: Optional[AsyncSession] = None,
    ) -> dict:
        """Fetch satellites from a CelesTrak group and store in database."""
        from app.services.ontology import OntologyService
        from app.services.audit import AuditService
        from app.db.base import async_session_factory
        from app.schemas.ontology import SatelliteCreate, OrbitCreate

        tle_data_list = await self.client.fetch_tle_by_group(group)

        if not tle_data_list:
            return {
                "success": False,
                "message": f"No TLE data fetched for group {group}",
                "satellites_created": 0,
                "satellites_updated": 0,
                "errors": [],
            }

        created_count = 0
        updated_count = 0
        errors = []
        satellite_ids = []

        async def process_satellites(session):
            nonlocal created_count, updated_count
            audit = AuditService(session)
            ontology = OntologyService(session, audit)

            for tle_data in tle_data_list:
                try:
                    norad_id = tle_data["norad_id"]
                    existing = await ontology.get_satellite_by_norad(norad_id, tenant_id)

                    if existing:
                        satellite_id = str(existing.id)
                        orbit_data = OrbitCreate(
                            satellite_id=satellite_id,
                            epoch=tle_data["epoch"],
                            tle_line1=tle_data["tle_line1"],
                            tle_line2=tle_data["tle_line2"],
                            source="celestrack",
                            semi_major_axis_km=None,
                            eccentricity=None,
                            inclination_deg=None,
                            raan_deg=None,
                            arg_perigee_deg=None,
                            mean_anomaly_deg=None,
                            mean_motion_rev_day=None,
                        )
                        await ontology.create_orbit(orbit_data, tenant_id, user_id)
                        updated_count += 1
                        satellite_ids.append(satellite_id)
                    else:
                        obj_name = tle_data.get("name", f"Satellite {norad_id}")
                        sat_data = SatelliteCreate(
                            norad_id=norad_id,
                            name=obj_name,
                            object_type=self._detect_object_type(group, obj_name),
                            country=None,
                            operator=None,
                            classification=tle_data.get("classification", "unclassified"),
                            international_designator=tle_data.get("international_designator"),
                            is_active=True,
                            mass_kg=None,
                            rcs_m2=None,
                            tags=[group],
                        )

                        satellite = await ontology.create_satellite(sat_data, tenant_id, user_id)
                        satellite_id = str(satellite.id)

                        orbit_data = OrbitCreate(
                            satellite_id=satellite_id,
                            epoch=tle_data["epoch"],
                            tle_line1=tle_data["tle_line1"],
                            tle_line2=tle_data["tle_line2"],
                            source="celestrack",
                            semi_major_axis_km=None,
                            eccentricity=None,
                            inclination_deg=None,
                            raan_deg=None,
                            arg_perigee_deg=None,
                            mean_anomaly_deg=None,
                            mean_motion_rev_day=None,
                        )
                        await ontology.create_orbit(orbit_data, tenant_id, user_id)
                        created_count += 1
                        satellite_ids.append(satellite_id)

                except Exception as e:
                    errors.append(f"Failed to process NORAD {tle_data.get('norad_id')}: {str(e)}")
                    logger.error("Failed to store satellite from group", error=str(e), group=group)

        if db:
            await process_satellites(db)
            await db.commit()
        else:
            async with async_session_factory() as session:
                await process_satellites(session)
                await session.commit()

        return {
            "success": True,
            "satellites_created": created_count,
            "satellites_updated": updated_count,
            "satellite_ids": satellite_ids,
            "errors": errors,
        }

    async def close(self):
        """Close the service."""
        await self.client.close()


_celestrack_service: Optional[CelesTrackService] = None


def get_celestrack_service() -> CelesTrackService:
    """Create a fresh CelesTrack service instance.
    
    Note: We create a new instance each time to avoid issues with closed HTTP clients.
    The service should be properly closed after use.
    """
    return CelesTrackService()


# Ground Stations around the world
GROUND_STATIONS = [
    {
        "name": "White Sands",
        "code": "WS",
        "latitude": 32.24,
        "longitude": -106.38,
        "altitude_m": 1450,
        "antenna_count": 3,
        "frequency_bands": ["S", "X", "Ka"],
        "is_operational": True,
        "organization": "NASA",
        "country": "USA",
    },
    {
        "name": "Svalbard",
        "code": "SV",
        "latitude": 78.22,
        "longitude": 15.33,
        "altitude_m": 520,
        "antenna_count": 2,
        "frequency_bands": ["S", "X"],
        "is_operational": True,
        "organization": "KSAT",
        "country": "Norway",
    },
]

# Sensor networks
SENSORS = [
    {
        "name": "Space Surveillance Telescope",
        "code": "SST",
        "sensor_type": "optical",
        "latitude": 32.24,
        "longitude": -106.38,
        "max_range_km": 36000,
        "fov_deg": 5,
        "is_operational": True,
        "organization": "Space Force",
        "country": "USA",
    },
]

# Helper functions
async def create_ground_stations_if_missing(ontology_service, tenant_id: str, user_id: Optional[str] = None):
    """Create ground stations in the database if they don't exist."""
    from app.schemas.ontology import GroundStationCreate
    created = 0
    for gs_data in GROUND_STATIONS:
        existing = await ontology_service.get_ground_station_by_code(gs_data["code"], tenant_id)
        if not existing:
            await ontology_service.create_ground_station(GroundStationCreate(**gs_data), tenant_id, user_id)
            created += 1

    if created:
        logger.info("Created ground stations", count=created)

    return created


async def create_sensors_if_missing(ontology_service, tenant_id: str, user_id: Optional[str] = None):
    """Create sensors in the database if they don't exist."""
    from app.schemas.ontology import SensorCreate
    from app.db.models.ontology import Sensor
    created = 0
    for sensor_data in SENSORS:
        stmt = select(Sensor).where(
            and_(
                Sensor.tenant_id == tenant_id,
                Sensor.name == sensor_data["name"],
            )
        )
        result = await ontology_service.db.execute(stmt)
        existing = result.scalar_one_or_none()
        if not existing:
            # Remove 'code' key since Sensor model has no code field
            data = {k: v for k, v in sensor_data.items() if k != "code"}
            await ontology_service.create_sensor(SensorCreate(**data), tenant_id, user_id)
            created += 1

    if created:
        logger.info("Created sensors", count=created)

    return created
