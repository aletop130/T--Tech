"""CelesTrack API client for fetching TLE data."""
from datetime import datetime, timedelta
from typing import Optional
import httpx
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
    # Space stations and related
    48274: {"name": "UNKNOWN-ALPHA", "country": "Unknown", "operator": "Unknown", "faction": "enemy"},
    49044: {"name": "UNKNOWN-BETA", "country": "Unknown", "operator": "Unknown", "faction": "enemy"},
    53239: {"name": "UNKNOWN-GAMMA", "country": "Unknown", "operator": "Unknown", "faction": "enemy"},
    # GPS and navigation
    24876: {"name": "HOSTILE-NAV-1", "country": "Unknown", "operator": "Unknown", "faction": "enemy"},
    26407: {"name": "HOSTILE-NAV-2", "country": "Unknown", "operator": "Unknown", "faction": "enemy"},
    26690: {"name": "HOSTILE-NAV-3", "country": "Unknown", "operator": "Unknown", "faction": "enemy"},
    27663: {"name": "HOSTILE-NAV-4", "country": "Unknown", "operator": "Unknown", "faction": "enemy"},
    27704: {"name": "HOSTILE-NAV-5", "country": "Unknown", "operator": "Unknown", "faction": "enemy"},
    # Communication satellites
    40115: {"name": "SUSPECT-COM-1", "country": "Unknown", "operator": "Unknown", "faction": "enemy"},
    40116: {"name": "SUSPECT-COM-2", "country": "Unknown", "operator": "Unknown", "faction": "enemy"},
    41771: {"name": "SUSPECT-COM-3", "country": "Unknown", "operator": "Unknown", "faction": "enemy"},
    # Weather/Earth observation
    27424: {"name": "TRACKED-OBJ-1", "country": "Unknown", "operator": "Unknown", "faction": "enemy"},
    33591: {"name": "TRACKED-OBJ-2", "country": "Unknown", "operator": "Unknown", "faction": "enemy"},
    37214: {"name": "TRACKED-OBJ-3", "country": "Unknown", "operator": "Unknown", "faction": "enemy"},
    # Scientific/Research
    39444: {"name": "UNIDENTIFIED-1", "country": "Unknown", "operator": "Unknown", "faction": "enemy"},
    41465: {"name": "UNIDENTIFIED-2", "country": "Unknown", "operator": "Unknown", "faction": "enemy"},
    44484: {"name": "UNIDENTIFIED-3", "country": "Unknown", "operator": "Unknown", "faction": "enemy"},
    # Debris/Other tracked objects
    49271: {"name": "CONTACT-X1", "country": "Unknown", "operator": "Unknown", "faction": "enemy"},
    54216: {"name": "CONTACT-X2", "country": "Unknown", "operator": "Unknown", "faction": "enemy"},
}

# Backward compatibility - combine all for existing references
FAMOUS_SATELLITES = {**ALLIED_SATELLITES, **ENEMY_SATELLITES}


class CelesTrackClient:
    """HTTP client for CelesTrack API."""
    
    def __init__(self, base_url: Optional[str] = None):
        self.base_url = base_url or settings.CELESTRACK_BASE_URL
        self.client = httpx.AsyncClient(timeout=30.0)
    
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
            
            name = lines[0].strip()
            line1 = lines[1].strip()
            line2 = lines[2].strip()
            
            # Parse epoch from line 1 (columns 19-32)
            epoch_str = line1[18:32].strip()
            year = int(epoch_str[0:2])
            day_of_year = float(epoch_str[2:])
            
            # Convert to full year
            if year < 57:
                year += 2000
            else:
                year += 1900
            
            # Calculate epoch datetime
            start_of_year = datetime(year, 1, 1)
            epoch = start_of_year + timedelta(days=day_of_year - 1)
            
            # Parse classification
            classification = line1[7:8].strip() or "U"
            
            # Parse international designator
            intl_designator = line1[9:17].strip()
            
            # Parse element set number
            element_set = int(line1[64:68].strip())
            
            # Parse revolution number from line 2
            rev_num = int(line2[63:68].strip())
            
            logger.info("TLE fetched successfully", norad_id=norad_id, epoch=epoch.isoformat())
            
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
            
        except httpx.HTTPStatusError as e:
            logger.error("HTTP error fetching TLE", norad_id=norad_id, error=str(e))
            return None
        except Exception as e:
            logger.error("Error fetching TLE", norad_id=norad_id, error=str(e))
            return None
    
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
