"""Ontology models for Space Domain Awareness."""
from datetime import datetime
from typing import Optional

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    JSON,
    ARRAY,
)
from sqlalchemy.orm import relationship
import enum

from app.db.base import Base, AuditMixin, generate_uuid


class ObjectType(str, enum.Enum):
    """Types of space objects."""
    SATELLITE = "satellite"
    DEBRIS = "debris"
    ROCKET_BODY = "rocket_body"
    UNKNOWN = "unknown"


class OrbitType(str, enum.Enum):
    """Types of orbits."""
    LEO = "leo"
    MEO = "meo"
    GEO = "geo"
    HEO = "heo"
    SSO = "sso"
    MOLNIYA = "molniya"
    OTHER = "other"


class SensorType(str, enum.Enum):
    """Types of sensors."""
    RADAR = "radar"
    OPTICAL = "optical"
    RF = "rf"
    LASER = "laser"
    PASSIVE = "passive"


class LinkStatus(str, enum.Enum):
    """RF Link status."""
    ACTIVE = "active"
    DEGRADED = "degraded"
    OFFLINE = "offline"
    MAINTENANCE = "maintenance"


class WeatherSeverity(str, enum.Enum):
    """Space weather event severity."""
    MINOR = "minor"
    MODERATE = "moderate"
    STRONG = "strong"
    SEVERE = "severe"
    EXTREME = "extreme"


class ConjunctionRisk(str, enum.Enum):
    """Conjunction risk level."""
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class Satellite(Base, AuditMixin):
    """Satellite or space object."""
    __tablename__ = "satellites"
    
    id = Column(String(50), primary_key=True, default=generate_uuid)
    norad_id = Column(Integer, unique=True, index=True, nullable=False)
    name = Column(String(100), nullable=False, index=True)
    international_designator = Column(String(20), nullable=True)
    object_type = Column(
        String(20), default='satellite'
    )
    
    # Owner/operator info
    country = Column(String(50), nullable=True)
    operator = Column(String(100), nullable=True)
    
    # Status
    is_active = Column(Boolean, default=True)
    launch_date = Column(DateTime, nullable=True)
    decay_date = Column(DateTime, nullable=True)
    
    # Physical properties
    mass_kg = Column(Float, nullable=True)
    rcs_m2 = Column(Float, nullable=True)  # Radar cross-section
    
    # Classification and tags
    classification = Column(String(50), default="unclassified")
    tags = Column(JSON, default=list)
    
    # Description for vector search
    description = Column(Text, nullable=True)
    description_embedding = Column(ARRAY(Float), nullable=True)
    
    # Relationships
    orbits = relationship(
        "Orbit", back_populates="satellite", cascade="all, delete-orphan"
    )
    conjunction_events_primary = relationship(
        "ConjunctionEvent",
        foreign_keys="ConjunctionEvent.primary_object_id",
        back_populates="primary_object",
    )
    conjunction_events_secondary = relationship(
        "ConjunctionEvent",
        foreign_keys="ConjunctionEvent.secondary_object_id",
        back_populates="secondary_object",
    )
    
    __table_args__ = (
        Index("ix_satellites_name_tsv", "name", postgresql_using="gin"),
    )


class Orbit(Base, AuditMixin):
    """Orbital parameters (TLE-derived or computed)."""
    __tablename__ = "orbits"
    
    id = Column(String(50), primary_key=True, default=generate_uuid)
    satellite_id = Column(
        String(50), ForeignKey("satellites.id"), nullable=False, index=True
    )
    
    # Epoch
    epoch = Column(DateTime, nullable=False, index=True)
    
    # Keplerian elements
    semi_major_axis_km = Column(Float, nullable=True)
    eccentricity = Column(Float, nullable=True)
    inclination_deg = Column(Float, nullable=True)
    raan_deg = Column(Float, nullable=True)  # Right ascension ascending node
    arg_perigee_deg = Column(Float, nullable=True)
    mean_anomaly_deg = Column(Float, nullable=True)
    mean_motion_rev_day = Column(Float, nullable=True)
    
    # TLE-specific
    tle_line1 = Column(String(80), nullable=True)
    tle_line2 = Column(String(80), nullable=True)
    bstar = Column(Float, nullable=True)
    
    # Derived
    orbit_type = Column(String(20), nullable=True)
    period_minutes = Column(Float, nullable=True)
    apogee_km = Column(Float, nullable=True)
    perigee_km = Column(Float, nullable=True)
    
    # Source
    source = Column(String(50), default="tle")  # tle, ephemeris, computed
    
    satellite = relationship("Satellite", back_populates="orbits")


class Sensor(Base, AuditMixin):
    """Space surveillance sensor."""
    __tablename__ = "sensors"
    
    id = Column(String(50), primary_key=True, default=generate_uuid)
    name = Column(String(100), nullable=False, index=True)
    sensor_type = Column(String(20), nullable=False)
    
    # Location
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    altitude_m = Column(Float, nullable=True)
    
    # Capabilities
    min_elevation_deg = Column(Float, default=10.0)
    max_range_km = Column(Float, nullable=True)
    accuracy_m = Column(Float, nullable=True)
    fov_deg = Column(Float, nullable=True)
    
    # Status
    is_operational = Column(Boolean, default=True)
    
    # Owner
    organization = Column(String(100), nullable=True)
    country = Column(String(50), nullable=True)
    
    description = Column(Text, nullable=True)
    description_embedding = Column(ARRAY(Float), nullable=True)
    
    # Link to ground station
    ground_station_id = Column(
        String(50), ForeignKey("ground_stations.id"), nullable=True
    )
    ground_station = relationship("GroundStation", back_populates="sensors")


class GroundStation(Base, AuditMixin):
    """Ground station facility."""
    __tablename__ = "ground_stations"
    
    id = Column(String(50), primary_key=True, default=generate_uuid)
    name = Column(String(100), nullable=False, index=True)
    code = Column(String(10), unique=True, nullable=True)
    
    # Location
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    altitude_m = Column(Float, default=0)
    
    # Capabilities
    antenna_count = Column(Integer, default=1)
    frequency_bands = Column(JSON, default=list)  # ["S", "X", "Ka"]
    
    # Status
    is_operational = Column(Boolean, default=True)
    status_message = Column(String(200), nullable=True)
    
    # Organization
    organization = Column(String(100), nullable=True)
    country = Column(String(50), nullable=True)
    
    description = Column(Text, nullable=True)
    description_embedding = Column(ARRAY(Float), nullable=True)
    
    # Relationships
    sensors = relationship("Sensor", back_populates="ground_station")
    rf_links = relationship(
        "RFLink", back_populates="ground_station", cascade="all, delete-orphan"
    )


class RFLink(Base, AuditMixin):
    """RF communication link."""
    __tablename__ = "rf_links"
    
    id = Column(String(50), primary_key=True, default=generate_uuid)
    name = Column(String(100), nullable=False)
    
    ground_station_id = Column(
        String(50), ForeignKey("ground_stations.id"), nullable=False
    )
    satellite_id = Column(
        String(50), ForeignKey("satellites.id"), nullable=True
    )
    
    # Link parameters
    frequency_mhz = Column(Float, nullable=True)
    bandwidth_khz = Column(Float, nullable=True)
    polarization = Column(String(20), nullable=True)
    
    # Status
    status = Column(String(20), default='active')
    signal_strength_dbm = Column(Float, nullable=True)
    bit_error_rate = Column(Float, nullable=True)
    
    # Schedule
    next_pass_start = Column(DateTime, nullable=True)
    next_pass_end = Column(DateTime, nullable=True)
    
    ground_station = relationship("GroundStation", back_populates="rf_links")


class SpaceWeatherEvent(Base, AuditMixin):
    """Space weather event (solar flare, CME, geomagnetic storm)."""
    __tablename__ = "space_weather_events"
    
    id = Column(String(50), primary_key=True, default=generate_uuid)
    event_type = Column(String(50), nullable=False, index=True)
    
    # Timing
    start_time = Column(DateTime, nullable=False, index=True)
    peak_time = Column(DateTime, nullable=True)
    end_time = Column(DateTime, nullable=True)
    
    # Intensity
    severity = Column(String(20), nullable=False)
    kp_index = Column(Float, nullable=True)
    dst_index = Column(Float, nullable=True)
    solar_wind_speed = Column(Float, nullable=True)
    proton_flux = Column(Float, nullable=True)
    
    # Impact assessment
    gnss_impact_score = Column(Float, default=0)  # 0-1
    rf_impact_score = Column(Float, default=0)
    drag_impact_score = Column(Float, default=0)
    radiation_impact_score = Column(Float, default=0)
    
    # Source
    source = Column(String(100), nullable=True)  # NOAA, ESA, etc.
    source_event_id = Column(String(50), nullable=True)
    
    description = Column(Text, nullable=True)


class ConjunctionEvent(Base, AuditMixin):
    """Close approach / conjunction event between two objects."""
    __tablename__ = "conjunction_events"
    
    id = Column(String(50), primary_key=True, default=generate_uuid)
    
    # Objects involved
    primary_object_id = Column(
        String(50), ForeignKey("satellites.id"), nullable=False
    )
    secondary_object_id = Column(
        String(50), ForeignKey("satellites.id"), nullable=False
    )
    
    # Time of closest approach
    tca = Column(DateTime, nullable=False, index=True)
    
    # Miss distance
    miss_distance_km = Column(Float, nullable=False)
    miss_distance_radial_km = Column(Float, nullable=True)
    miss_distance_intrack_km = Column(Float, nullable=True)
    miss_distance_crosstrack_km = Column(Float, nullable=True)
    
    # Probability
    collision_probability = Column(Float, nullable=True)
    
    # Risk assessment
    risk_level = Column(String(20), nullable=False)
    risk_score = Column(Float, nullable=True)  # 0-100
    
    # Analysis metadata
    analysis_run_id = Column(String(50), nullable=True)
    screening_volume_km = Column(Float, default=10.0)
    
    # Status
    is_actionable = Column(Boolean, default=False)
    maneuver_planned = Column(Boolean, default=False)
    
    # AI analysis
    ai_analysis = Column(JSON, nullable=True)
    
    primary_object = relationship(
        "Satellite",
        foreign_keys=[primary_object_id],
        back_populates="conjunction_events_primary"
    )
    secondary_object = relationship(
        "Satellite",
        foreign_keys=[secondary_object_id],
        back_populates="conjunction_events_secondary"
    )


class ObjectRelation(Base, AuditMixin):
    """Generic relation between ontology objects."""
    __tablename__ = "object_relations"
    
    id = Column(String(50), primary_key=True, default=generate_uuid)
    
    source_type = Column(String(50), nullable=False, index=True)
    source_id = Column(String(50), nullable=False, index=True)
    
    relation_type = Column(String(50), nullable=False, index=True)
    
    target_type = Column(String(50), nullable=False, index=True)
    target_id = Column(String(50), nullable=False, index=True)
    
    # Relation metadata
    properties = Column(JSON, default=dict)
    valid_from = Column(DateTime, nullable=True)
    valid_to = Column(DateTime, nullable=True)
    
    __table_args__ = (
        Index(
            "ix_relations_source",
            "source_type", "source_id"
        ),
        Index(
            "ix_relations_target",
            "target_type", "target_id"
        ),
    )

