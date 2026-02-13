"""Analytics services for SDA computations."""
from datetime import datetime, timedelta
from typing import Optional
import math

from sqlalchemy import select, and_, func
from sqlalchemy.ext.asyncio import AsyncSession
import numpy as np

from app.db.models.ontology import (
    Satellite,
    Orbit,
    SpaceWeatherEvent,
    ConjunctionEvent,
    ConjunctionRisk,
    WeatherSeverity,
)
from app.db.base import generate_uuid
from app.services.audit import AuditService
from app.core.logging import get_logger

logger = get_logger(__name__)


# Earth constants
EARTH_RADIUS_KM = 6371.0
EARTH_MU = 398600.4418  # km^3/s^2


class OrbitPropagator:
    """SGP4-based orbit propagation."""
    
    def __init__(self):
        try:
            from sgp4.api import Satrec, jday
            self.Satrec = Satrec
            self.jday = jday
            self.sgp4_available = True
        except ImportError:
            logger.warning("SGP4 library not available")
            self.sgp4_available = False
    
    def propagate_tle(
        self,
        tle_line1: str,
        tle_line2: str,
        times: list[datetime],
    ) -> list[tuple[float, float, float]]:
        """Propagate TLE to get positions at given times.
        
        Returns list of (x, y, z) in km in TEME frame.
        """
        if not self.sgp4_available:
            return self._simple_propagation(times)
        
        try:
            satellite = self.Satrec.twoline2rv(tle_line1, tle_line2)
            positions = []
            
            for t in times:
                jd, fr = self.jday(
                    t.year, t.month, t.day,
                    t.hour, t.minute, t.second + t.microsecond / 1e6
                )
                e, r, v = satellite.sgp4(jd, fr)
                if e != 0:
                    positions.append((0.0, 0.0, 0.0))
                else:
                    positions.append(tuple(r))
            
            return positions
        except Exception as e:
            logger.error(f"SGP4 propagation error: {e}")
            return self._simple_propagation(times)
    
    def _simple_propagation(
        self,
        times: list[datetime],
    ) -> list[tuple[float, float, float]]:
        """Simple circular orbit approximation (fallback)."""
        # Return dummy positions for demo
        return [(7000.0, 0.0, 0.0) for _ in times]
    
    def compute_distance(
        self,
        pos1: tuple[float, float, float],
        pos2: tuple[float, float, float],
    ) -> float:
        """Compute distance between two positions in km."""
        return math.sqrt(
            (pos1[0] - pos2[0])**2 +
            (pos1[1] - pos2[1])**2 +
            (pos1[2] - pos2[2])**2
        )


class ConjunctionAnalyzer:
    """Conjunction detection and analysis."""
    
    def __init__(self, db: AsyncSession, audit: AuditService):
        self.db = db
        self.audit = audit
        self.propagator = OrbitPropagator()
    
    async def run_conjunction_analysis(
        self,
        tenant_id: str,
        satellite_ids: Optional[list[str]] = None,
        start_time: Optional[datetime] = None,
        end_time: Optional[datetime] = None,
        screening_volume_km: float = 0.5,
        user_id: Optional[str] = None,
    ) -> dict:
        """Run conjunction analysis for given satellites.
        
        Returns analysis results with detected events.
        """
        run_id = generate_uuid()
        
        start_time = start_time or datetime.utcnow()
        end_time = end_time or (start_time + timedelta(hours=72))
        
        logger.info(
            "conjunction_analysis_start",
            run_id=run_id,
            start_time=start_time.isoformat(),
            end_time=end_time.isoformat(),
        )
        
        # Get satellites with TLEs
        conditions = [
            Satellite.tenant_id == tenant_id,
            Satellite.is_active == True,
        ]
        if satellite_ids:
            conditions.append(Satellite.id.in_(satellite_ids))
        
        sat_stmt = select(Satellite).where(and_(*conditions))
        sat_result = await self.db.execute(sat_stmt)
        satellites = list(sat_result.scalars().all())
        
        # Get latest orbits for each satellite
        sat_orbits = {}
        for sat in satellites:
            orbit_stmt = (
                select(Orbit)
                .where(
                    and_(
                        Orbit.satellite_id == sat.id,
                        Orbit.tenant_id == tenant_id,
                    )
                )
                .order_by(Orbit.epoch.desc())
                .limit(1)
            )
            orbit_result = await self.db.execute(orbit_stmt)
            orbit = orbit_result.scalar_one_or_none()
            if orbit and orbit.tle_line1 and orbit.tle_line2:
                sat_orbits[sat.id] = {
                    "satellite": sat,
                    "orbit": orbit,
                }
        
        # Generate time steps (every 60 seconds)
        time_step = timedelta(seconds=60)
        times = []
        current = start_time
        while current <= end_time:
            times.append(current)
            current += time_step
        
        # Propagate all satellites
        positions = {}
        for sat_id, data in sat_orbits.items():
            orbit = data["orbit"]
            positions[sat_id] = self.propagator.propagate_tle(
                orbit.tle_line1,
                orbit.tle_line2,
                times,
            )
        
        # Find close approaches (O(N^2) with time-based pruning)
        events = []
        sat_ids = list(positions.keys())
        
        for i in range(len(sat_ids)):
            for j in range(i + 1, len(sat_ids)):
                sat1_id = sat_ids[i]
                sat2_id = sat_ids[j]
                
                pos1_list = positions[sat1_id]
                pos2_list = positions[sat2_id]
                
                # Find minimum distance
                min_dist = float('inf')
                min_time_idx = 0
                
                for t_idx in range(len(times)):
                    dist = self.propagator.compute_distance(
                        pos1_list[t_idx],
                        pos2_list[t_idx],
                    )
                    if dist < min_dist:
                        min_dist = dist
                        min_time_idx = t_idx
                
                # Check if close approach
                if min_dist < screening_volume_km:
                    risk_level = self._compute_risk_level(min_dist)
                    risk_score = self._compute_risk_score(min_dist)
                    
                    event = ConjunctionEvent(
                        id=generate_uuid(),
                        tenant_id=tenant_id,
                        primary_object_id=sat1_id,
                        secondary_object_id=sat2_id,
                        tca=times[min_time_idx],
                        miss_distance_km=min_dist,
                        risk_level=risk_level,
                        risk_score=risk_score,
                        screening_volume_km=screening_volume_km,
                        analysis_run_id=run_id,
                        is_actionable=risk_level in [
                            ConjunctionRisk.HIGH, ConjunctionRisk.CRITICAL
                        ],
                        created_by=user_id,
                        updated_by=user_id,
                    )
                    
                    self.db.add(event)
                    events.append(event)
        
        await self.db.flush()
        
        logger.info(
            "conjunction_analysis_complete",
            run_id=run_id,
            satellites_analyzed=len(sat_orbits),
            events_detected=len(events),
        )
        
        return {
            "run_id": run_id,
            "start_time": start_time.isoformat(),
            "end_time": end_time.isoformat(),
            "satellites_analyzed": len(sat_orbits),
            "events_detected": len(events),
            "events": [
                {
                    "id": e.id,
                    "primary_object_id": e.primary_object_id,
                    "secondary_object_id": e.secondary_object_id,
                    "tca": e.tca.isoformat(),
                    "miss_distance_km": e.miss_distance_km,
                    "risk_level": e.risk_level.value,
                    "risk_score": e.risk_score,
                }
                for e in events
            ],
        }
    
    def _compute_risk_level(self, distance_km: float) -> ConjunctionRisk:
        """Compute risk level from miss distance."""
        if distance_km < 0.001:
            return ConjunctionRisk.CRITICAL
        elif distance_km < 0.01:
            return ConjunctionRisk.HIGH
        elif distance_km < 0.1:
            return ConjunctionRisk.MEDIUM
        else:
            return ConjunctionRisk.LOW
    
    def _compute_risk_score(self, distance_km: float) -> float:
        """Compute risk score (0-100) from miss distance."""
        # Exponential decay: closer = higher score
        if distance_km <= 0:
            return 100.0
        score = 100.0 * math.exp(-distance_km / 2.0)
        return round(min(100.0, max(0.0, score)), 2)


class SpaceWeatherAnalyzer:
    """Space weather impact analysis."""
    
    # Impact weights by service
    IMPACT_WEIGHTS = {
        "gnss": {
            "kp": 0.4,
            "dst": 0.2,
            "proton": 0.3,
            "solar_wind": 0.1,
        },
        "rf": {
            "kp": 0.3,
            "dst": 0.3,
            "proton": 0.2,
            "solar_wind": 0.2,
        },
        "drag": {
            "kp": 0.2,
            "dst": 0.1,
            "proton": 0.1,
            "solar_wind": 0.6,
        },
        "radiation": {
            "kp": 0.1,
            "dst": 0.1,
            "proton": 0.7,
            "solar_wind": 0.1,
        },
    }
    
    def __init__(self, db: AsyncSession):
        self.db = db
    
    async def compute_impact_scores(
        self,
        event: SpaceWeatherEvent,
    ) -> dict[str, float]:
        """Compute service impact scores for a space weather event."""
        scores = {}
        
        # Normalize indices to 0-1 scale
        kp_norm = (event.kp_index or 0) / 9.0
        dst_norm = min(1.0, abs(event.dst_index or 0) / 500.0)
        proton_norm = min(1.0, (event.proton_flux or 0) / 10000.0)
        sw_norm = min(1.0, (event.solar_wind_speed or 400) / 1000.0)
        
        for service, weights in self.IMPACT_WEIGHTS.items():
            score = (
                weights["kp"] * kp_norm +
                weights["dst"] * dst_norm +
                weights["proton"] * proton_norm +
                weights["solar_wind"] * sw_norm
            )
            scores[service] = round(min(1.0, score), 3)
        
        return scores
    
    async def analyze_time_range(
        self,
        tenant_id: str,
        start_time: datetime,
        end_time: datetime,
    ) -> dict:
        """Analyze space weather impact over a time range."""
        stmt = (
            select(SpaceWeatherEvent)
            .where(
                and_(
                    SpaceWeatherEvent.tenant_id == tenant_id,
                    SpaceWeatherEvent.start_time >= start_time,
                    SpaceWeatherEvent.start_time <= end_time,
                )
            )
            .order_by(SpaceWeatherEvent.start_time)
        )
        
        result = await self.db.execute(stmt)
        events = list(result.scalars().all())
        
        if not events:
            return {
                "start_time": start_time.isoformat(),
                "end_time": end_time.isoformat(),
                "events_count": 0,
                "max_severity": None,
                "aggregate_impact": {
                    "gnss": 0.0,
                    "rf": 0.0,
                    "drag": 0.0,
                    "radiation": 0.0,
                },
            }
        
        # Compute aggregate impact (max of all events)
        aggregate_impact = {"gnss": 0.0, "rf": 0.0, "drag": 0.0, "radiation": 0.0}
        max_severity = WeatherSeverity.MINOR
        
        for event in events:
            scores = await self.compute_impact_scores(event)
            for service, score in scores.items():
                aggregate_impact[service] = max(aggregate_impact[service], score)
            
            if event.severity.value > max_severity.value:
                max_severity = event.severity
        
        return {
            "start_time": start_time.isoformat(),
            "end_time": end_time.isoformat(),
            "events_count": len(events),
            "max_severity": max_severity.value,
            "aggregate_impact": aggregate_impact,
            "events": [
                {
                    "id": e.id,
                    "event_type": e.event_type,
                    "severity": e.severity.value,
                    "start_time": e.start_time.isoformat(),
                    "kp_index": e.kp_index,
                }
                for e in events
            ],
        }

