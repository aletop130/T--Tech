"""Ontology service for CRUD operations on space objects."""
from datetime import datetime
from typing import Any, Optional, Type, TypeVar

from sqlalchemy import select, and_, or_, func, delete
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db.base import Base, generate_uuid
from app.db.models.ontology import (
    Satellite,
    Orbit,
    Sensor,
    GroundStation,
    RFLink,
    SpaceWeatherEvent,
    ConjunctionEvent,
    ObjectRelation,
    OrbitType,
)
from app.schemas.ontology import (
    SatelliteCreate,
    SatelliteUpdate,
    OrbitCreate,
    GroundStationCreate,
    GroundStationUpdate,
    SensorCreate,
    SpaceWeatherEventCreate,
    ConjunctionEventCreate,
    RelationCreate,
)
from app.services.audit import AuditService
from app.core.logging import get_logger
from app.core.exceptions import NotFoundError

logger = get_logger(__name__)

T = TypeVar("T", bound=Base)


class OntologyService:
    """Service for managing ontology objects."""
    
    def __init__(self, db: AsyncSession, audit: AuditService):
        self.db = db
        self.audit = audit
    
    # ============== Generic Operations ==============
    
    async def _get_by_id(
        self,
        model: Type[T],
        id: str,
        tenant_id: str,
    ) -> Optional[T]:
        """Get entity by ID with tenant check."""
        stmt = select(model).where(
            and_(model.id == id, model.tenant_id == tenant_id)
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()
    
    async def _create(
        self,
        model: Type[T],
        data: dict,
        tenant_id: str,
        user_id: Optional[str] = None,
    ) -> T:
        """Create a new entity."""
        entity = model(
            id=generate_uuid(),
            tenant_id=tenant_id,
            created_by=user_id,
            updated_by=user_id,
            **data,
        )
        self.db.add(entity)
        await self.db.flush()
        await self.db.refresh(entity)
        
        await self.audit.log(
            action="create",
            entity_type=model.__tablename__,
            entity_id=entity.id,
            tenant_id=tenant_id,
            user_id=user_id,
            after=self._to_dict(entity),
        )
        
        return entity
    
    async def _update(
        self,
        entity: T,
        data: dict,
        tenant_id: str,
        user_id: Optional[str] = None,
    ) -> T:
        """Update an entity."""
        before = self._to_dict(entity)
        
        for key, value in data.items():
            if value is not None:
                setattr(entity, key, value)
        
        entity.updated_by = user_id
        entity.updated_at = datetime.utcnow()
        
        await self.db.flush()
        await self.db.refresh(entity)
        
        await self.audit.log(
            action="update",
            entity_type=entity.__tablename__,
            entity_id=entity.id,
            tenant_id=tenant_id,
            user_id=user_id,
            before=before,
            after=self._to_dict(entity),
        )
        
        return entity
    
    async def _delete(
        self,
        entity: T,
        tenant_id: str,
        user_id: Optional[str] = None,
    ) -> None:
        """Delete an entity."""
        before = self._to_dict(entity)
        
        await self.audit.log(
            action="delete",
            entity_type=entity.__tablename__,
            entity_id=entity.id,
            tenant_id=tenant_id,
            user_id=user_id,
            before=before,
        )
        
        await self.db.delete(entity)
        await self.db.flush()
    
    def _to_dict(self, entity: T) -> dict:
        """Convert entity to dict for audit."""
        result = {}
        for c in entity.__table__.columns:
            val = getattr(entity, c.name)
            if isinstance(val, datetime):
                val = val.isoformat()
            elif hasattr(val, "value"):  # Enum
                val = val.value
            result[c.name] = val
        return result
    
    # ============== Satellite Operations ==============
    
    async def get_satellite(
        self,
        satellite_id: str,
        tenant_id: str,
    ) -> Optional[Satellite]:
        """Get satellite by ID."""
        return await self._get_by_id(Satellite, satellite_id, tenant_id)
    
    async def get_satellite_by_norad(
        self,
        norad_id: int,
        tenant_id: str,
    ) -> Optional[Satellite]:
        """Get satellite by NORAD ID."""
        stmt = select(Satellite).where(
            and_(
                Satellite.norad_id == norad_id,
                Satellite.tenant_id == tenant_id
            )
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()
    
    async def list_satellites(
        self,
        tenant_id: str,
        page: int = 1,
        page_size: int = 50,
        search: Optional[str] = None,
        is_active: Optional[bool] = None,
        object_type: Optional[str] = None,
    ) -> tuple[list[Satellite], int]:
        """List satellites with filters."""
        conditions = [Satellite.tenant_id == tenant_id]
        
        if search:
            conditions.append(
                or_(
                    Satellite.name.ilike(f"%{search}%"),
                    Satellite.international_designator.ilike(f"%{search}%"),
                )
            )
        if is_active is not None:
            conditions.append(Satellite.is_active == is_active)
        if object_type:
            conditions.append(Satellite.object_type == object_type)
        
        # Count
        count_stmt = select(func.count()).select_from(Satellite).where(
            and_(*conditions)
        )
        total = await self.db.scalar(count_stmt) or 0
        
        # Query
        offset = (page - 1) * page_size
        stmt = (
            select(Satellite)
            .where(and_(*conditions))
            .order_by(Satellite.name)
            .offset(offset)
            .limit(page_size)
        )
        
        result = await self.db.execute(stmt)
        satellites = list(result.scalars().all())
        
        return satellites, total
    
    async def create_satellite(
        self,
        data: SatelliteCreate,
        tenant_id: str,
        user_id: Optional[str] = None,
    ) -> Satellite:
        """Create a new satellite."""
        return await self._create(
            Satellite,
            data.model_dump(),
            tenant_id,
            user_id,
        )
    
    async def update_satellite(
        self,
        satellite_id: str,
        data: SatelliteUpdate,
        tenant_id: str,
        user_id: Optional[str] = None,
    ) -> Satellite:
        """Update a satellite."""
        satellite = await self.get_satellite(satellite_id, tenant_id)
        if not satellite:
            raise NotFoundError("Satellite", satellite_id)
        
        return await self._update(
            satellite,
            data.model_dump(exclude_unset=True),
            tenant_id,
            user_id,
        )
    
    async def delete_satellite(
        self,
        satellite_id: str,
        tenant_id: str,
        user_id: Optional[str] = None,
    ) -> None:
        """Delete a satellite."""
        satellite = await self.get_satellite(satellite_id, tenant_id)
        if not satellite:
            raise NotFoundError("Satellite", satellite_id)
        
        await self._delete(satellite, tenant_id, user_id)
    
    # ============== Orbit Operations ==============
    
    async def create_orbit(
        self,
        data: OrbitCreate,
        tenant_id: str,
        user_id: Optional[str] = None,
    ) -> Orbit:
        """Create a new orbit record."""
        orbit_data = data.model_dump()
        
        # Calculate derived values
        if orbit_data.get("semi_major_axis_km") and orbit_data.get("eccentricity"):
            sma = orbit_data["semi_major_axis_km"]
            ecc = orbit_data["eccentricity"]
            orbit_data["apogee_km"] = sma * (1 + ecc) - 6371  # Earth radius
            orbit_data["perigee_km"] = sma * (1 - ecc) - 6371
            
            # Determine orbit type
            perigee = orbit_data["perigee_km"]
            apogee = orbit_data["apogee_km"]
            inc = orbit_data.get("inclination_deg", 0)
            
            if perigee < 2000:
                orbit_data["orbit_type"] = OrbitType.LEO
            elif 2000 <= perigee < 35000:
                orbit_data["orbit_type"] = OrbitType.MEO
            elif 35000 <= perigee <= 36000 and ecc < 0.01:
                orbit_data["orbit_type"] = OrbitType.GEO
            elif apogee > 35786 and perigee < 2000:
                orbit_data["orbit_type"] = OrbitType.HEO
            else:
                orbit_data["orbit_type"] = OrbitType.OTHER
        
        return await self._create(Orbit, orbit_data, tenant_id, user_id)
    
    async def get_latest_orbit(
        self,
        satellite_id: str,
        tenant_id: str,
    ) -> Optional[Orbit]:
        """Get latest orbit for a satellite."""
        stmt = (
            select(Orbit)
            .where(
                and_(
                    Orbit.satellite_id == satellite_id,
                    Orbit.tenant_id == tenant_id
                )
            )
            .order_by(Orbit.epoch.desc())
            .limit(1)
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()
    
    # ============== Ground Station Operations ==============
    
    async def get_ground_station(
        self,
        station_id: str,
        tenant_id: str,
    ) -> Optional[GroundStation]:
        """Get ground station by ID."""
        return await self._get_by_id(GroundStation, station_id, tenant_id)
    
    async def list_ground_stations(
        self,
        tenant_id: str,
        page: int = 1,
        page_size: int = 50,
        is_operational: Optional[bool] = None,
    ) -> tuple[list[GroundStation], int]:
        """List ground stations."""
        conditions = [GroundStation.tenant_id == tenant_id]
        
        if is_operational is not None:
            conditions.append(GroundStation.is_operational == is_operational)
        
        count_stmt = select(func.count()).select_from(GroundStation).where(
            and_(*conditions)
        )
        total = await self.db.scalar(count_stmt) or 0
        
        offset = (page - 1) * page_size
        stmt = (
            select(GroundStation)
            .where(and_(*conditions))
            .order_by(GroundStation.name)
            .offset(offset)
            .limit(page_size)
        )
        
        result = await self.db.execute(stmt)
        stations = list(result.scalars().all())
        
        return stations, total
    
    async def create_ground_station(
        self,
        data: GroundStationCreate,
        tenant_id: str,
        user_id: Optional[str] = None,
    ) -> GroundStation:
        """Create a new ground station."""
        return await self._create(
            GroundStation,
            data.model_dump(),
            tenant_id,
            user_id,
        )
    
    async def delete_ground_station(
        self,
        station_id: str,
        tenant_id: str,
        user_id: Optional[str] = None,
    ) -> None:
        """Delete a ground station."""
        station = await self.get_ground_station(station_id, tenant_id)
        if not station:
            raise NotFoundError("GroundStation", station_id)
        
        await self._delete(station, tenant_id, user_id)
    
    # ============== Sensor Operations ==============
    
    async def create_sensor(
        self,
        data: SensorCreate,
        tenant_id: str,
        user_id: Optional[str] = None,
    ) -> Sensor:
        """Create a new sensor."""
        return await self._create(
            Sensor,
            data.model_dump(),
            tenant_id,
            user_id,
        )
    
    async def list_sensors(
        self,
        tenant_id: str,
        page: int = 1,
        page_size: int = 50,
    ) -> tuple[list[Sensor], int]:
        """List sensors."""
        conditions = [Sensor.tenant_id == tenant_id]
        
        count_stmt = select(func.count()).select_from(Sensor).where(
            and_(*conditions)
        )
        total = await self.db.scalar(count_stmt) or 0
        
        offset = (page - 1) * page_size
        stmt = (
            select(Sensor)
            .where(and_(*conditions))
            .order_by(Sensor.name)
            .offset(offset)
            .limit(page_size)
        )
        
        result = await self.db.execute(stmt)
        sensors = list(result.scalars().all())
        
        return sensors, total
    
    # ============== Space Weather Operations ==============
    
    async def create_space_weather_event(
        self,
        data: SpaceWeatherEventCreate,
        tenant_id: str,
        user_id: Optional[str] = None,
    ) -> SpaceWeatherEvent:
        """Create a space weather event."""
        return await self._create(
            SpaceWeatherEvent,
            data.model_dump(),
            tenant_id,
            user_id,
        )
    
    async def list_space_weather_events(
        self,
        tenant_id: str,
        start_time: Optional[datetime] = None,
        end_time: Optional[datetime] = None,
        severity: Optional[str] = None,
        page: int = 1,
        page_size: int = 50,
    ) -> tuple[list[SpaceWeatherEvent], int]:
        """List space weather events."""
        conditions = [SpaceWeatherEvent.tenant_id == tenant_id]
        
        if start_time:
            conditions.append(SpaceWeatherEvent.start_time >= start_time)
        if end_time:
            conditions.append(SpaceWeatherEvent.start_time <= end_time)
        if severity:
            conditions.append(SpaceWeatherEvent.severity == severity)
        
        count_stmt = select(func.count()).select_from(SpaceWeatherEvent).where(
            and_(*conditions)
        )
        total = await self.db.scalar(count_stmt) or 0
        
        offset = (page - 1) * page_size
        stmt = (
            select(SpaceWeatherEvent)
            .where(and_(*conditions))
            .order_by(SpaceWeatherEvent.start_time.desc())
            .offset(offset)
            .limit(page_size)
        )
        
        result = await self.db.execute(stmt)
        events = list(result.scalars().all())
        
        return events, total
    
    # ============== Conjunction Operations ==============
    
    async def create_conjunction_event(
        self,
        data: ConjunctionEventCreate,
        tenant_id: str,
        user_id: Optional[str] = None,
    ) -> ConjunctionEvent:
        """Create a conjunction event."""
        return await self._create(
            ConjunctionEvent,
            data.model_dump(),
            tenant_id,
            user_id,
        )
    
    async def get_conjunction_event(
        self,
        event_id: str,
        tenant_id: str,
    ) -> Optional[ConjunctionEvent]:
        """Get conjunction event by ID."""
        stmt = (
            select(ConjunctionEvent)
            .options(
                selectinload(ConjunctionEvent.primary_object),
                selectinload(ConjunctionEvent.secondary_object),
            )
            .where(
                and_(
                    ConjunctionEvent.id == event_id,
                    ConjunctionEvent.tenant_id == tenant_id
                )
            )
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()
    
    async def list_conjunction_events(
        self,
        tenant_id: str,
        start_time: Optional[datetime] = None,
        end_time: Optional[datetime] = None,
        risk_level: Optional[str] = None,
        is_actionable: Optional[bool] = None,
        page: int = 1,
        page_size: int = 50,
    ) -> tuple[list[ConjunctionEvent], int]:
        """List conjunction events."""
        conditions = [ConjunctionEvent.tenant_id == tenant_id]
        
        if start_time:
            conditions.append(ConjunctionEvent.tca >= start_time)
        if end_time:
            conditions.append(ConjunctionEvent.tca <= end_time)
        if risk_level:
            conditions.append(ConjunctionEvent.risk_level == risk_level)
        if is_actionable is not None:
            conditions.append(ConjunctionEvent.is_actionable == is_actionable)
        
        count_stmt = select(func.count()).select_from(ConjunctionEvent).where(
            and_(*conditions)
        )
        total = await self.db.scalar(count_stmt) or 0
        
        offset = (page - 1) * page_size
        stmt = (
            select(ConjunctionEvent)
            .where(and_(*conditions))
            .order_by(ConjunctionEvent.tca.desc())
            .offset(offset)
            .limit(page_size)
        )

        result = await self.db.execute(stmt)
        events = list(result.scalars().unique().all())

        return events, total

    # ============== Relation Operations ==============
    
    async def create_relation(
        self,
        data: RelationCreate,
        tenant_id: str,
        user_id: Optional[str] = None,
    ) -> ObjectRelation:
        """Create a relation between objects."""
        return await self._create(
            ObjectRelation,
            data.model_dump(),
            tenant_id,
            user_id,
        )
    
    async def get_relations(
        self,
        tenant_id: str,
        source_type: Optional[str] = None,
        source_id: Optional[str] = None,
        target_type: Optional[str] = None,
        target_id: Optional[str] = None,
        relation_type: Optional[str] = None,
    ) -> list[ObjectRelation]:
        """Get relations with filters."""
        conditions = [ObjectRelation.tenant_id == tenant_id]
        
        if source_type:
            conditions.append(ObjectRelation.source_type == source_type)
        if source_id:
            conditions.append(ObjectRelation.source_id == source_id)
        if target_type:
            conditions.append(ObjectRelation.target_type == target_type)
        if target_id:
            conditions.append(ObjectRelation.target_id == target_id)
        if relation_type:
            conditions.append(ObjectRelation.relation_type == relation_type)
        
        stmt = select(ObjectRelation).where(and_(*conditions))
        result = await self.db.execute(stmt)
        return list(result.scalars().all())
    
    # ============== Search Operations ==============
    
    async def global_search(
        self,
        tenant_id: str,
        query: str,
        entity_types: Optional[list[str]] = None,
        limit: int = 20,
    ) -> list[dict]:
        """Search across all entity types."""
        results = []
        
        if not entity_types or "satellite" in entity_types:
            sat_stmt = (
                select(Satellite)
                .where(
                    and_(
                        Satellite.tenant_id == tenant_id,
                        or_(
                            Satellite.name.ilike(f"%{query}%"),
                            Satellite.international_designator.ilike(f"%{query}%"),
                        )
                    )
                )
                .limit(limit)
            )
            sat_result = await self.db.execute(sat_stmt)
            for sat in sat_result.scalars():
                results.append({
                    "type": "satellite",
                    "id": sat.id,
                    "name": sat.name,
                    "norad_id": sat.norad_id,
                })
        
        if not entity_types or "ground_station" in entity_types:
            gs_stmt = (
                select(GroundStation)
                .where(
                    and_(
                        GroundStation.tenant_id == tenant_id,
                        or_(
                            GroundStation.name.ilike(f"%{query}%"),
                            GroundStation.code.ilike(f"%{query}%"),
                        )
                    )
                )
                .limit(limit)
            )
            gs_result = await self.db.execute(gs_stmt)
            for gs in gs_result.scalars():
                results.append({
                    "type": "ground_station",
                    "id": gs.id,
                    "name": gs.name,
                    "code": gs.code,
                })
        
        if not entity_types or "sensor" in entity_types:
            sensor_stmt = (
                select(Sensor)
                .where(
                    and_(
                        Sensor.tenant_id == tenant_id,
                        Sensor.name.ilike(f"%{query}%"),
                    )
                )
                .limit(limit)
            )
            sensor_result = await self.db.execute(sensor_stmt)
            for sensor in sensor_result.scalars():
                results.append({
                    "type": "sensor",
                    "id": sensor.id,
                    "name": sensor.name,
                })
        
        return results[:limit]



# ============== Additional Helper Methods ==============

    async def get_ground_station_by_code(self, code: str, tenant_id: str) -> Optional[GroundStation]:
        """Get ground station by code."""
        stmt = select(GroundStation).where(
            and_(
                GroundStation.tenant_id == tenant_id,
                GroundStation.code == code
            )
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def get_sensor_by_code(self, code: str, tenant_id: str) -> Optional[Sensor]:
        """Get sensor by code."""
        stmt = select(Sensor).where(
            and_(
                Sensor.tenant_id == tenant_id,
                Sensor.code == code
            )
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def calculate_satellite_connections(
        self,
        tenant_id: str,
        satellite_id: Optional[str] = None,
    ) -> list[dict]:
        """Calculate connections between satellites and other entities."""
        results = []
        
        # Get all active satellites
        satellite_stmt = select(Satellite).where(
            and_(
                Satellite.tenant_id == tenant_id,
                Satellite.is_active == True
            )
        )
        sat_result = await self.db.execute(satellite_stmt)
        satellites = list(sat_result.scalars().all())
        
        if satellite_id:
            satellites = [s for s in satellites if s.id == satellite_id]
        
        if not satellites:
            return results
        
        # Get ground stations
        gs_stmt = select(GroundStation).where(
            and_(
                GroundStation.tenant_id == tenant_id,
                GroundStation.is_operational == True
            )
        )
        gs_result = await self.db.execute(gs_stmt)
        ground_stations = list(gs_result.scalars().all())
        
        # Get sensors
        sensor_stmt = select(Sensor).where(
            and_(
                Sensor.tenant_id == tenant_id,
                Sensor.is_operational == True
            )
        )
        sensor_result = await self.db.execute(sensor_stmt)
        sensors = list(sensor_result.scalars().all())
        
        # Calculate ground station connections
        for gs in ground_stations:
            for sat in satellites:
                # Simplified: assume coverage if satellite is active and GS is operational
                # In production, would calculate actual visibility based on orbital parameters
                results.append({
                    "satellite_id": sat.id,
                    "target_id": gs.id,
                    "target_type": "ground_station",
                    "connection_type": "COVERAGE",
                    "confidence": 0.8,
                    "metadata": {
                        "elevation_deg": 45.0,
                        "distance_km": 2000.0,
                        "ground_station_name": gs.name,
                    }
                })
        
        # Calculate sensor connections
        for sensor in sensors:
            for sat in satellites:
                # Simplified: assume tracking if satellite is active and sensor is operational
                results.append({
                    "satellite_id": sat.id,
                    "target_id": sensor.id,
                    "target_type": "sensor",
                    "connection_type": "TRACKS",
                    "confidence": 0.9,
                    "metadata": {
                        "sensor_name": sensor.name,
                        "sensor_type": sensor.sensor_type,
                        "distance_km": 10000.0,
                    }
                })
        
        # Calculate conjunction connections (simplified - all satellites have low probability)
        for i, sat1 in enumerate(satellites):
            for sat2 in satellites[i+1:]:
                # Random conjunction chance for demo purposes
                import random
                if random.random() < 0.1:  # 10% chance of conjunction
                    results.append({
                        "satellite_id": sat1.id,
                        "target_id": sat2.id,
                        "target_type": "satellite",
                        "connection_type": "CONJUNCTION",
                        "confidence": 0.3 + random.random() * 0.5,
                        "metadata": {
                            "other_satellite_id": sat2.id,
                            "other_satellite_name": sat2.name,
                            "miss_distance_km": 5.0 + random.random() * 10,
                            "risk_level": "high",
                        }
                    })
        
        return results
