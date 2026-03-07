"""SQLAlchemy models for threat events."""

from datetime import datetime

from sqlalchemy import Column, DateTime, Enum, Float, ForeignKey, Integer, String, Text, JSON
from sqlalchemy.orm import relationship

from app.db.base import AuditMixin, Base, generate_uuid


class ThreatEvent(Base, AuditMixin):
    """Base model for all threat events (polymorphic)."""
    __tablename__ = "threat_events"

    id = Column(String(50), primary_key=True, default=generate_uuid)
    threat_type = Column(String(30), nullable=False, index=True)  # proximity, signal, anomaly, orbital_similarity, geo_loiter
    severity = Column(String(20), nullable=False, default="nominal")  # nominal, watched, threatened
    confidence = Column(Float, nullable=False, default=0.0)
    detected_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    primary_satellite_id = Column(String(50), ForeignKey("satellites.id"), nullable=True)
    secondary_satellite_id = Column(String(50), ForeignKey("satellites.id"), nullable=True)
    description = Column(Text, nullable=True)
    position_data = Column(JSON, nullable=True)
    extra_data = Column(JSON, nullable=True)


class SignalThreat(Base, AuditMixin):
    """Signal interception threat events."""
    __tablename__ = "signal_threats"

    id = Column(String(50), primary_key=True, default=generate_uuid)
    interceptor_satellite_id = Column(String(50), ForeignKey("satellites.id"), nullable=True)
    target_link_asset_id = Column(String(50), ForeignKey("satellites.id"), nullable=True)
    ground_station_name = Column(String(200), nullable=True)
    severity = Column(String(20), nullable=False, default="nominal")
    interception_probability = Column(Float, default=0.0)
    signal_path_angle_deg = Column(Float, default=0.0)
    comm_windows_at_risk = Column(Integer, default=0)
    total_comm_windows = Column(Integer, default=0)
    confidence = Column(Float, default=0.0)
    position_data = Column(JSON, nullable=True)


class AnomalyThreat(Base, AuditMixin):
    """Anomalous behavior detection events."""
    __tablename__ = "anomaly_threats"

    id = Column(String(50), primary_key=True, default=generate_uuid)
    satellite_id = Column(String(50), ForeignKey("satellites.id"), nullable=True)
    severity = Column(String(20), nullable=False, default="nominal")
    anomaly_type = Column(String(50), nullable=False)
    baseline_deviation = Column(Float, default=0.0)
    description = Column(Text, nullable=True)
    confidence = Column(Float, default=0.0)
    position_data = Column(JSON, nullable=True)


class OrbitalSimilarityThreat(Base, AuditMixin):
    """Co-orbital shadowing detection events."""
    __tablename__ = "orbital_similarity_threats"

    id = Column(String(50), primary_key=True, default=generate_uuid)
    foreign_satellite_id = Column(String(50), ForeignKey("satellites.id"), nullable=True)
    target_satellite_id = Column(String(50), ForeignKey("satellites.id"), nullable=True)
    severity = Column(String(20), nullable=False, default="nominal")
    inclination_diff_deg = Column(Float, default=0.0)
    altitude_diff_km = Column(Float, default=0.0)
    divergence_score = Column(Float, default=0.0)
    pattern = Column(String(30), nullable=True)
    confidence = Column(Float, default=0.0)
    position_data = Column(JSON, nullable=True)


class GeoLoiterThreat(Base, AuditMixin):
    """GEO loiter detection events."""
    __tablename__ = "geo_loiter_threats"

    id = Column(String(50), primary_key=True, default=generate_uuid)
    satellite_id = Column(String(50), ForeignKey("satellites.id"), nullable=True)
    severity = Column(String(20), nullable=False, default="nominal")
    orbit_type = Column(String(30), nullable=True)
    subsatellite_lon_deg = Column(Float, default=0.0)
    subsatellite_lat_deg = Column(Float, default=0.0)
    altitude_km = Column(Float, default=0.0)
    dwell_fraction_over_us = Column(Float, default=0.0)
    threat_score = Column(Float, default=0.0)
    description = Column(Text, nullable=True)
    country_code = Column(String(10), nullable=True)


class ThreatResponse(Base, AuditMixin):
    """AI response decisions for threats."""
    __tablename__ = "threat_responses"

    id = Column(String(50), primary_key=True, default=generate_uuid)
    threat_event_id = Column(String(50), ForeignKey("threat_events.id"), nullable=True)
    satellite_id = Column(String(50), nullable=True)
    satellite_name = Column(String(200), nullable=True)
    threat_satellite_id = Column(String(50), nullable=True)
    threat_satellite_name = Column(String(200), nullable=True)
    threat_summary = Column(Text, nullable=True)
    threat_score = Column(Float, default=0.0)
    risk_level = Column(String(20), nullable=True)
    recommended_action = Column(String(200), nullable=True)
    reasoning = Column(Text, nullable=True)
    escalation_required = Column(Integer, default=0)  # boolean as int
    time_sensitivity = Column(String(20), nullable=True)
    intelligence_summary = Column(Text, nullable=True)
    options_data = Column(JSON, nullable=True)


class FleetRiskSnapshot(Base, AuditMixin):
    """Time-series risk data for fleet risk accumulation."""
    __tablename__ = "fleet_risk_snapshots"

    id = Column(String(50), primary_key=True, default=generate_uuid)
    satellite_id = Column(String(50), ForeignKey("satellites.id"), nullable=True)
    risk_score = Column(Float, default=0.0)
    snapshot_time = Column(DateTime, default=datetime.utcnow, nullable=False)
    risk_components = Column(JSON, nullable=True)


class ThreatConfig(Base, AuditMixin):
    """Bayesian prior configuration (persisted)."""
    __tablename__ = "threat_config"

    id = Column(String(50), primary_key=True, default=generate_uuid)
    config_key = Column(String(100), nullable=False, unique=True, index=True)
    config_value = Column(Float, nullable=False)
    description = Column(Text, nullable=True)


class CommsTranscription(Base, AuditMixin):
    """Iridium command history."""
    __tablename__ = "comms_transcriptions"

    id = Column(String(50), primary_key=True, default=generate_uuid)
    human_input = Column(Text, nullable=False)
    target_satellite_id = Column(String(50), nullable=True)
    target_satellite_name = Column(String(200), nullable=True)
    command_type = Column(String(50), nullable=True)
    status = Column(String(20), default="complete")
    transcription_data = Column(JSON, nullable=True)
