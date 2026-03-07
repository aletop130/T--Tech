"""Schemas for multi-modal threat detection."""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field

from app.schemas.common import BaseSchema


class ThreatSeverity(str, Enum):
    NOMINAL = "nominal"
    WATCHED = "watched"
    THREATENED = "threatened"


class ApproachPattern(str, Enum):
    CO_ORBITAL = "co-orbital"
    DIRECT = "direct"
    DRIFT = "drift"
    UNKNOWN = "unknown"


class AnomalyType(str, Enum):
    UNEXPECTED_MANEUVER = "unexpected-maneuver"
    RF_EMISSION = "rf-emission"
    ORBIT_RAISE = "orbit-raise"
    ORBIT_LOWER = "orbit-lower"
    POINTING_CHANGE = "pointing-change"
    ORIENTATION_CHANGE = "orientation-change"


class OrbitalPattern(str, Enum):
    CO_PLANAR = "co-planar"
    CO_ALTITUDE = "co-altitude"
    CO_INCLINATION = "co-inclination"
    SHADOWING = "shadowing"


class OrbitType(str, Enum):
    GEOSTATIONARY = "geostationary"
    GEOSYNCHRONOUS = "geosynchronous"
    MOLNIYA = "molniya"
    OTHER = "other"


class Position3D(BaseSchema):
    lat: float
    lon: float
    altKm: float


class OrbitSummary(BaseSchema):
    altitudeKm: float
    inclinationDeg: float
    periodMin: float = 0.0
    velocityKms: float = 0.0


# --- Proximity Threats ---

class ProximityThreatResponse(BaseSchema):
    id: str
    foreignSatId: str
    foreignSatName: str
    targetAssetId: str
    targetAssetName: str
    severity: ThreatSeverity
    missDistanceKm: float
    approachVelocityKms: float
    tcaTime: int
    tcaInMinutes: int
    primaryPosition: Position3D
    secondaryPosition: Position3D
    approachPattern: str
    sunHidingDetected: bool = False
    confidence: float


# --- Signal Threats ---

class SignalThreatResponse(BaseSchema):
    id: str
    interceptorId: str
    interceptorName: str
    targetLinkAssetId: str
    targetLinkAssetName: str
    groundStationName: str
    severity: ThreatSeverity
    interceptionProbability: float
    signalPathAngleDeg: float
    commWindowsAtRisk: int
    totalCommWindows: int
    tcaTime: int
    tcaInMinutes: int
    position: Position3D
    confidence: float


# --- Anomaly Threats ---

class AnomalyThreatResponse(BaseSchema):
    id: str
    satelliteId: str
    satelliteName: str
    severity: ThreatSeverity
    anomalyType: str
    baselineDeviation: float
    description: str
    detectedAt: int
    confidence: float
    position: Position3D


# --- Orbital Similarity Threats ---

class OrbitalSimilarityThreatResponse(BaseSchema):
    id: str
    foreignSatId: str
    foreignSatName: str
    targetAssetId: str
    targetAssetName: str
    severity: ThreatSeverity
    inclinationDiffDeg: float
    altitudeDiffKm: float
    divergenceScore: float
    pattern: str
    confidence: float
    position: Position3D
    foreignOrbit: OrbitSummary
    targetOrbit: OrbitSummary


# --- Geo-Loiter Threats ---

class GeoLoiterThreatResponse(BaseSchema):
    id: str
    satelliteId: str
    satelliteName: str
    noradId: int
    countryCode: str
    orbitType: str
    subsatelliteLonDeg: float
    subsatelliteLatDeg: float
    altitudeKm: float
    dwellFractionOverUs: float
    severity: ThreatSeverity
    threatScore: float
    description: str
    confidence: float
    position: Position3D
    detectedAt: int
