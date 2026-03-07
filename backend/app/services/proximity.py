"""Proximity detection and monitoring service."""
from datetime import datetime, timedelta
from typing import Optional
import math
import uuid

from sqlalchemy import select, and_, or_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db.models.incidents import (
    ProximityEvent,
    Incident,
    IncidentType,
    IncidentSeverity,
    IncidentStatus,
)
from app.db.models.ontology import Satellite, Orbit
from app.core.logging import get_logger
from app.core.exceptions import NotFoundError
from app.schemas.incidents import (
    ProximityEventCreate,
    ProximityEventUpdate,
    ProximityDetectionConfig,
    ProximityDetectionResult,
    Position3D,
)
from app.services.incidents import IncidentService
from app.services.audit import AuditService

logger = get_logger(__name__)


class ProximityDetectionService:
    """Service for detecting and managing proximity events between satellites."""
    
    def __init__(
        self,
        db: AsyncSession,
        audit: AuditService,
        incident_service: Optional[IncidentService] = None,
    ):
        self.db = db
        self.audit = audit
        self.incident_service = incident_service
        self.config = ProximityDetectionConfig()
    
    async def detect_proximity_events(
        self,
        tenant_id: str,
        satellite_ids: Optional[list[str]] = None,
        check_time: Optional[datetime] = None,
    ) -> ProximityDetectionResult:
        """Run proximity detection for all or specific satellites."""
        start_time = datetime.utcnow()
        run_id = str(uuid.uuid4())
        
        if check_time is None:
            check_time = datetime.utcnow()
        
        # Get satellites to check
        if satellite_ids:
            stmt = (
                select(Satellite)
                .where(
                    and_(
                        Satellite.id.in_(satellite_ids),
                        Satellite.tenant_id == tenant_id,
                        Satellite.is_active == True,
                    )
                )
            )
        else:
            stmt = (
                select(Satellite)
                .where(
                    and_(
                        Satellite.tenant_id == tenant_id,
                        Satellite.is_active == True,
                    )
                )
            )
        
        result = await self.db.execute(stmt)
        satellites = list(result.scalars().all())
        
        logger.info(
            "proximity_detection_started",
            run_id=run_id,
            tenant_id=tenant_id,
            satellite_count=len(satellites),
        )
        
        events_detected = 0
        events_created = 0
        events_updated = 0
        pairs_checked = 0
        
        # Check all pairs
        for i, sat1 in enumerate(satellites):
            for sat2 in satellites[i+1:]:
                pairs_checked += 1
                
                # Skip if same satellite
                if sat1.id == sat2.id:
                    continue
                
                # Skip if both are enemy/unknown (only check allied vs others)
                sat1_is_allied = self._is_allied_satellite(sat1)
                sat2_is_allied = self._is_allied_satellite(sat2)
                if not sat1_is_allied and not sat2_is_allied:
                    continue
                
                # Detect proximity between this pair
                event = await self._check_satellite_pair(
                    sat1, sat2, tenant_id, check_time
                )
                
                if event:
                    events_detected += 1
                    if event.created_at == event.updated_at:
                        events_created += 1
                    else:
                        events_updated += 1
        
        duration_ms = (datetime.utcnow() - start_time).total_seconds() * 1000
        
        logger.info(
            "proximity_detection_completed",
            run_id=run_id,
            duration_ms=duration_ms,
            pairs_checked=pairs_checked,
            events_detected=events_detected,
            events_created=events_created,
            events_updated=events_updated,
        )
        
        return ProximityDetectionResult(
            run_id=run_id,
            timestamp=start_time,
            satellites_checked=len(satellites),
            pairs_checked=pairs_checked,
            events_detected=events_detected,
            events_created=events_created,
            events_updated=events_updated,
            duration_ms=duration_ms,
        )
    
    async def _check_satellite_pair(
        self,
        sat1: Satellite,
        sat2: Satellite,
        tenant_id: str,
        check_time: datetime,
    ) -> Optional[ProximityEvent]:
        """Check proximity between two satellites."""
        # Get latest orbits for both satellites
        orbit1 = await self._get_latest_orbit(sat1.id)
        orbit2 = await self._get_latest_orbit(sat2.id)
        
        if not orbit1 or not orbit2:
            return None
        
        # Propagate both satellites to check_time
        pos1 = self._propagate_satellite(orbit1, check_time)
        pos2 = self._propagate_satellite(orbit2, check_time)
        
        if not pos1 or not pos2:
            return None
        
        # Calculate distance
        distance_km = self._calculate_distance(pos1, pos2)
        
        # Check if within warning threshold
        if distance_km > self.config.warning_threshold_km:
            # Check if there's an active event that should be closed
            await self._close_resolved_event(sat1.id, sat2.id, tenant_id)
            return None
        
        # Determine alert level
        if distance_km <= self.config.critical_threshold_km:
            alert_level = 'critical'
        else:
            alert_level = 'warning'
        
        # Calculate approach velocity
        velocity1 = self._calculate_velocity(orbit1, check_time)
        velocity2 = self._calculate_velocity(orbit2, check_time)
        relative_velocity = self._calculate_relative_velocity(velocity1, velocity2)
        approach_velocity = math.sqrt(
            relative_velocity.x**2 + 
            relative_velocity.y**2 + 
            relative_velocity.z**2
        )
        
        # Determine if this is a hostile approach
        is_hostile = self._is_hostile_approach(sat1, sat2)
        
        # Calculate threat score
        threat_score = self._calculate_threat_score(
            distance_km, approach_velocity, is_hostile, alert_level
        )
        
        # Check for existing active event
        existing_event = await self._get_active_event(sat1.id, sat2.id, tenant_id)
        
        if existing_event:
            # Update existing event
            return await self._update_proximity_event(
                existing_event,
                distance_km,
                approach_velocity,
                alert_level,
                threat_score,
                check_time,
            )
        else:
            # Create new event
            return await self._create_proximity_event(
                sat1=sat1,
                sat2=sat2,
                tenant_id=tenant_id,
                distance_km=distance_km,
                approach_velocity=approach_velocity,
                alert_level=alert_level,
                is_hostile=is_hostile,
                threat_score=threat_score,
                primary_position=pos1,
                secondary_position=pos2,
                relative_velocity=relative_velocity,
                check_time=check_time,
            )
    
    async def _get_latest_orbit(self, satellite_id: str) -> Optional[Orbit]:
        """Get the latest orbit for a satellite.
        
        Prefers orbits with valid TLEs. If latest orbit has TLE but is marked
        invalid, will fall back to older valid orbit or use keplerian elements.
        """
        stmt = (
            select(Orbit)
            .where(Orbit.satellite_id == satellite_id)
            .order_by(Orbit.epoch.desc())
            .limit(10)
        )
        result = await self.db.execute(stmt)
        orbits = result.scalars().all()
        
        for orbit in orbits:
            if orbit.tle_line1 and orbit.tle_line2:
                if orbit.is_tle_valid is False:
                    continue
            return orbit
        
        return None
    
    def _propagate_satellite(
        self,
        orbit: Orbit,
        target_time: datetime,
    ) -> Optional[Position3D]:
        """Propagate satellite to target time using SGP4."""
        try:
            # Use TLE for SGP4 propagation if available
            if orbit.tle_line1 and orbit.tle_line2:
                from sgp4.api import Satrec
                from sgp4.conveniences import jday_datetime as sg4_jday
                
                # Create satellite from TLE
                sat = Satrec.twoline2rv(
                    orbit.tle_line1.strip(),
                    orbit.tle_line2.strip()
                )
                
                if sat.error > 0:
                    logger.info(
                        "tle_parse_error_fallback_keplerian",
                        orbit_id=orbit.id,
                        error=sat.error,
                    )
                    return self._propagate_keplerian(orbit, target_time)
                
                # Convert target_time to JD
                jd, fr = sg4_jday(target_time)
                
                # Propagate
                error, r, v = sat.sgp4(jd, fr)
                
                if error > 0:
                    logger.info(
                        "sgp4_propagation_error_fallback_keplerian",
                        orbit_id=orbit.id,
                        error=error,
                    )
                    return self._propagate_keplerian(orbit, target_time)
                
                # r is in km (position)
                return Position3D(x=r[0], y=r[1], z=r[2])
            else:
                # Fall back to Keplerian propagation
                return self._propagate_keplerian(orbit, target_time)
                
        except Exception as e:
            logger.error(
                "propagation_error",
                orbit_id=orbit.id,
                error=str(e),
            )
            return self._propagate_keplerian(orbit, target_time)
    
    def _propagate_keplerian(
        self,
        orbit: Orbit,
        target_time: datetime,
    ) -> Optional[Position3D]:
        """Fallback Keplerian propagation when TLE is not available."""
        try:
            # Calculate time difference from epoch
            dt = (target_time - orbit.epoch).total_seconds()
            
            # Mean motion in rad/s
            if orbit.mean_motion_rev_day:
                mean_motion = orbit.mean_motion_rev_day * 2 * math.pi / 86400
            else:
                # Default for LEO (~90 min period)
                mean_motion = 2 * math.pi / 5400
            
            # Update mean anomaly
            mean_anomaly = math.radians(orbit.mean_anomaly_deg or 0) + mean_motion * dt
            
            # For circular orbits, use mean anomaly directly
            eccentricity = orbit.eccentricity or 0
            if eccentricity < 0.01:
                true_anomaly = mean_anomaly
            else:
                true_anomaly = mean_anomaly
            
            # Calculate position in orbital plane
            a = orbit.semi_major_axis_km or 6778  # ~400km altitude LEO
            r = a * (1 - eccentricity**2) / (1 + eccentricity * math.cos(true_anomaly))
            
            x_orbital = r * math.cos(true_anomaly)
            y_orbital = r * math.sin(true_anomaly)
            
            # Rotate by argument of perigee
            arg_perigee = math.radians(orbit.arg_perigee_deg or 0)
            x_rot = x_orbital * math.cos(arg_perigee) - y_orbital * math.sin(arg_perigee)
            y_rot = x_orbital * math.sin(arg_perigee) + y_orbital * math.cos(arg_perigee)
            
            # Rotate by inclination
            inclination = math.radians(orbit.inclination_deg or 0)
            z = y_rot * math.sin(inclination)
            y_incl = y_rot * math.cos(inclination)
            
            # Rotate by RAAN
            raan = math.radians(orbit.raan_deg or 0)
            x = x_rot * math.cos(raan) - y_incl * math.sin(raan)
            y = x_rot * math.sin(raan) + y_incl * math.cos(raan)
            
            return Position3D(x=x, y=y, z=z)
            
        except Exception as e:
            logger.error(
                "keplerian_propagation_error",
                orbit_id=orbit.id,
                error=str(e),
            )
            return None
    
    def _calculate_distance(self, pos1: Position3D, pos2: Position3D) -> float:
        """Calculate distance between two 3D positions."""
        return math.sqrt(
            (pos1.x - pos2.x)**2 +
            (pos1.y - pos2.y)**2 +
            (pos1.z - pos2.z)**2
        )
    
    def _calculate_velocity(
        self,
        orbit: Orbit,
        target_time: datetime,
    ) -> Position3D:
        """Calculate velocity vector (simplified)."""
        # Simplified velocity calculation
        # In production, use proper SGP4 velocity output
        
        if orbit.semi_major_axis_km:
            # Vis-viva equation for circular orbit
            v = math.sqrt(398600.4418 / orbit.semi_major_axis_km)  # km/s
        else:
            v = 7.5  # Default LEO velocity
        
        # Direction based on orbital plane
        inclination = math.radians(orbit.inclination_deg or 0)
        raan = math.radians(orbit.raan_deg or 0)
        
        # Simplified - velocity perpendicular to position in orbital plane
        vx = v * math.cos(raan) * math.cos(inclination)
        vy = v * math.sin(raan) * math.cos(inclination)
        vz = v * math.sin(inclination)
        
        return Position3D(x=vx, y=vy, z=vz)
    
    def _calculate_relative_velocity(
        self,
        v1: Position3D,
        v2: Position3D,
    ) -> Position3D:
        """Calculate relative velocity."""
        return Position3D(
            x=v2.x - v1.x,
            y=v2.y - v1.y,
            z=v2.z - v1.z,
        )
    
    def _is_hostile_approach(self, sat1: Satellite, sat2: Satellite) -> bool:
        """Determine if this is a hostile approach."""
        # Check if one is allied and one is enemy
        sat1_allied = self._is_allied_satellite(sat1)
        sat2_allied = self._is_allied_satellite(sat2)
        sat1_enemy = self._is_enemy_satellite(sat1)
        sat2_enemy = self._is_enemy_satellite(sat2)
        
        # Hostile if enemy is approaching allied
        return (sat1_allied and sat2_enemy) or (sat2_allied and sat1_enemy)
    
    def _is_allied_satellite(self, sat: Satellite) -> bool:
        """Check if satellite is allied (blue force)."""
        tags = sat.tags or []
        return "allied" in tags or sat.country in ["USA", "GBR", "FRA", "DEU", "JPN", "Multinational"]
    
    def _is_enemy_satellite(self, sat: Satellite) -> bool:
        """Check if satellite is enemy (red force)."""
        tags = sat.tags or []
        return "enemy" in tags or "hostile" in tags or sat.name.startswith(("HOSTILE", "UNKNOWN", "SUSPECT"))
    
    def _calculate_threat_score(
        self,
        distance_km: float,
        approach_velocity_kms: float,
        is_hostile: bool,
        alert_level: str,
        country_code: str = "",
        rcs_size: str = "",
    ) -> float:
        """Calculate threat score 0-100 using Bayesian posterior when available.

        Uses Bayesian scoring from the proximity threat model when country_code
        is provided. Falls back to heuristic scoring otherwise.
        """
        try:
            from app.physics.bayesian_scorer import score_satellite
            posterior = score_satellite(distance_km, country_code or ("UNK" if not is_hostile else "PRC"), rcs_size)
            # Convert 0-1 posterior to 0-100 scale
            score = posterior * 100.0
        except Exception:
            # Fallback to heuristic scoring
            score = 0.0
            if distance_km <= 1:
                score += 50
            elif distance_km <= 5:
                score += 40
            elif distance_km <= 10:
                score += 30
            elif distance_km <= 25:
                score += 20
            else:
                score += 10

            if approach_velocity_kms > 10:
                score += 20
            elif approach_velocity_kms > 5:
                score += 15
            elif approach_velocity_kms > 1:
                score += 10
            else:
                score += 5

            if is_hostile:
                score += 20
            if alert_level == 'critical':
                score += 10

        return min(score, 100)
    
    async def _get_active_event(
        self,
        sat1_id: str,
        sat2_id: str,
        tenant_id: str,
    ) -> Optional[ProximityEvent]:
        """Get active proximity event between two satellites."""
        stmt = (
            select(ProximityEvent)
            .where(
                and_(
                    ProximityEvent.tenant_id == tenant_id,
                    ProximityEvent.status.in_([
                        'active',
                        'monitoring',
                    ]),
                    or_(
                        and_(
                            ProximityEvent.primary_satellite_id == sat1_id,
                            ProximityEvent.secondary_satellite_id == sat2_id,
                        ),
                        and_(
                            ProximityEvent.primary_satellite_id == sat2_id,
                            ProximityEvent.secondary_satellite_id == sat1_id,
                        ),
                    ),
                )
            )
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()
    
    async def _create_proximity_event(
        self,
        sat1: Satellite,
        sat2: Satellite,
        tenant_id: str,
        distance_km: float,
        approach_velocity: float,
        alert_level: str,
        is_hostile: bool,
        threat_score: float,
        primary_position: Position3D,
        secondary_position: Position3D,
        relative_velocity: Position3D,
        check_time: datetime,
    ) -> ProximityEvent:
        """Create a new proximity event."""
        # Determine primary/secondary (allied first, or alphabetical)
        if self._is_enemy_satellite(sat1) and self._is_allied_satellite(sat2):
            primary, secondary = sat2, sat1
            primary_pos, secondary_pos = secondary_position, primary_position
        else:
            primary, secondary = sat1, sat2
            primary_pos, secondary_pos = primary_position, secondary_position
        
        event = ProximityEvent(
            id=str(uuid.uuid4()),
            tenant_id=tenant_id,
            primary_satellite_id=primary.id,
            secondary_satellite_id=secondary.id,
            start_time=check_time,
            last_updated=check_time,
            min_distance_km=distance_km,
            current_distance_km=distance_km,
            approach_velocity_kms=approach_velocity,
            predicted_tca=check_time + timedelta(minutes=10),  # Simplified
            alert_level=alert_level,
            status='active',
            is_hostile=is_hostile,
            threat_score=threat_score,
            warning_threshold_km=self.config.warning_threshold_km,
            critical_threshold_km=self.config.critical_threshold_km,
            primary_position=primary_pos.model_dump(),
            secondary_position=secondary_pos.model_dump(),
            relative_velocity=relative_velocity.model_dump(),
        )
        
        self.db.add(event)
        await self.db.flush()
        await self.db.refresh(event)
        
        # Create incident for critical events
        if alert_level == 'critical' and self.config.enable_auto_incident_creation:
            if self.incident_service:
                incident = await self._create_incident_from_event(event, primary, secondary)
                event.incident_id = incident.id
                await self.db.flush()
        
        logger.info(
            "proximity_event_created",
            event_id=event.id,
            primary_satellite=primary.name,
            secondary_satellite=secondary.name,
            distance_km=distance_km,
            alert_level=alert_level,
            is_hostile=is_hostile,
        )
        
        return event
    
    async def _update_proximity_event(
        self,
        event: ProximityEvent,
        distance_km: float,
        approach_velocity: float,
        alert_level: str,
        threat_score: float,
        check_time: datetime,
    ) -> ProximityEvent:
        """Update an existing proximity event."""
        event.current_distance_km = distance_km
        event.approach_velocity_kms = approach_velocity
        event.alert_level = alert_level
        event.threat_score = threat_score
        event.last_updated = check_time
        
        # Update minimum distance if closer
        if distance_km < event.min_distance_km:
            event.min_distance_km = distance_km
            event.tca = check_time
        
        # Escalate to critical if needed
        if alert_level == 'critical' and event.status == 'active':
            event.status = 'monitoring'
            
            # Create incident if not exists
            if not event.incident_id and self.config.enable_auto_incident_creation:
                if self.incident_service:
                    primary = await self.db.get(Satellite, event.primary_satellite_id)
                    secondary = await self.db.get(Satellite, event.secondary_satellite_id)
                    incident = await self._create_incident_from_event(event, primary, secondary)
                    event.incident_id = incident.id
        
        await self.db.flush()
        await self.db.refresh(event)
        
        return event
    
    async def _close_resolved_event(
        self,
        sat1_id: str,
        sat2_id: str,
        tenant_id: str,
    ) -> None:
        """Close a resolved proximity event."""
        event = await self._get_active_event(sat1_id, sat2_id, tenant_id)
        if event:
            event.status = 'resolved'
            event.end_time = datetime.utcnow()
            await self.db.flush()
            
            logger.info(
                "proximity_event_resolved",
                event_id=event.id,
                min_distance_km=event.min_distance_km,
            )
    
    async def _create_incident_from_event(
        self,
        event: ProximityEvent,
        primary: Satellite,
        secondary: Satellite,
    ) -> Incident:
        """Create an incident from a proximity event."""
        if not self.incident_service:
            raise RuntimeError("Incident service not available")
        
        from app.schemas.incidents import IncidentCreate, AffectedAsset
        
        incident_type = (
            IncidentType.HOSTILE_APPROACH 
            if event.is_hostile 
            else IncidentType.PROXIMITY
        )
        
        severity = (
            IncidentSeverity.CRITICAL 
            if event.alert_level == 'critical' 
            else IncidentSeverity.HIGH
        )
        
        # Check if incident already exists for this event
        existing = await self.incident_service.get_incident(event.id, event.tenant_id)
        if existing:
            logger.info(
                "incident_already_exists_for_proximity_event",
                event_id=event.id,
                incident_id=existing.id,
            )
            return existing
        
        title = f"{'Hostile ' if event.is_hostile else ''}Proximity Alert: {primary.name} - {secondary.name}"
        
        description = (
            f"Proximity event detected between satellites.\n\n"
            f"Primary: {primary.name} (NORAD: {primary.norad_id})\n"
            f"Secondary: {secondary.name} (NORAD: {secondary.norad_id})\n"
            f"Current Distance: {event.current_distance_km:.2f} km\n"
            f"Minimum Distance: {event.min_distance_km:.2f} km\n"
            f"Approach Velocity: {event.approach_velocity_kms:.2f} km/s\n"
            f"Threat Score: {event.threat_score:.1f}/100\n"
            f"{'This is classified as a HOSTILE approach.' if event.is_hostile else ''}"
        )
        
        affected_assets = [
            AffectedAsset(type="satellite", id=primary.id, name=primary.name),
            AffectedAsset(type="satellite", id=secondary.id, name=secondary.name),
        ]
        
        data = IncidentCreate(
            title=title,
            description=description,
            incident_type=incident_type,
            severity=severity,
            affected_assets=affected_assets,
            source_event_type="proximity_event",
            source_event_id=event.id,
            priority=90 if event.is_hostile else 80,
        )
        
        incident = await self.incident_service.create_incident(
            data=data,
            tenant_id=event.tenant_id,
        )
        
        logger.info(
            "incident_created_from_proximity",
            incident_id=incident.id,
            event_id=event.id,
        )
        
        return incident
    
    async def get_proximity_event(
        self,
        event_id: str,
        tenant_id: str,
    ) -> Optional[ProximityEvent]:
        """Get a proximity event by ID."""
        stmt = (
            select(ProximityEvent)
            .options(
                selectinload(ProximityEvent.primary_satellite),
                selectinload(ProximityEvent.secondary_satellite),
            )
            .where(
                and_(
                    ProximityEvent.id == event_id,
                    ProximityEvent.tenant_id == tenant_id,
                )
            )
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()
    
    async def list_proximity_events(
        self,
        tenant_id: str,
        alert_level: Optional[str] = None,
        status: Optional[str] = None,
        is_hostile: Optional[bool] = None,
        satellite_id: Optional[str] = None,
        scenario_id: Optional[str] = None,
        page: int = 1,
        page_size: int = 50,
    ) -> tuple[list[ProximityEvent], int]:
        """List proximity events with filters."""
        conditions = [ProximityEvent.tenant_id == tenant_id]
        
        if alert_level:
            conditions.append(ProximityEvent.alert_level == alert_level)
        if status:
            conditions.append(ProximityEvent.status == status)
        if is_hostile is not None:
            conditions.append(ProximityEvent.is_hostile == is_hostile)
        if satellite_id:
            conditions.append(
                or_(
                    ProximityEvent.primary_satellite_id == satellite_id,
                    ProximityEvent.secondary_satellite_id == satellite_id,
                )
            )
        if scenario_id:
            conditions.append(ProximityEvent.scenario_id == scenario_id)
        
        # Count
        from sqlalchemy import func
        count_stmt = select(func.count()).select_from(ProximityEvent).where(
            and_(*conditions)
        )
        total = await self.db.scalar(count_stmt) or 0
        
        # Query
        offset = (page - 1) * page_size
        stmt = (
            select(ProximityEvent)
            .options(
                selectinload(ProximityEvent.primary_satellite),
                selectinload(ProximityEvent.secondary_satellite),
            )
            .where(and_(*conditions))
            .order_by(ProximityEvent.start_time.desc())
            .offset(offset)
            .limit(page_size)
        )
        
        result = await self.db.execute(stmt)
        events = list(result.scalars().all())
        
        return events, total
    
    async def get_active_alerts(
        self,
        tenant_id: str,
    ) -> list[ProximityEvent]:
        """Get currently active proximity alerts."""
        stmt = (
            select(ProximityEvent)
            .options(
                selectinload(ProximityEvent.primary_satellite),
                selectinload(ProximityEvent.secondary_satellite),
            )
            .where(
                and_(
                    ProximityEvent.tenant_id == tenant_id,
                    ProximityEvent.status.in_([
                        'active',
                        'monitoring',
                    ]),
                )
            )
            .order_by(
                ProximityEvent.alert_level.desc(),
                ProximityEvent.threat_score.desc(),
            )
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all())
