"""Schemas for Italy Big Brother — Satellite dependency mapping."""
from __future__ import annotations
from pydantic import BaseModel, Field
from typing import Optional, List
from enum import Enum
from datetime import datetime


class Criticality(str, Enum):
    CRITICAL = "CRITICAL"
    HIGH = "HIGH"
    MEDIUM = "MEDIUM"
    LOW = "LOW"


class ServiceCategory(str, Enum):
    TV_BROADCASTING = "TV_BROADCASTING"
    NAVIGATION = "NAVIGATION"
    EARTH_OBSERVATION = "EARTH_OBSERVATION"
    DEFENSE = "DEFENSE"
    METEO = "METEO"
    MARITIME = "MARITIME"
    AGRICULTURE = "AGRICULTURE"
    TELECOM = "TELECOM"
    FINANCE = "FINANCE"
    ENERGY = "ENERGY"
    TRANSPORT = "TRANSPORT"
    SCIENCE = "SCIENCE"
    EMERGENCY = "EMERGENCY"
    IOT = "IOT"
    GEODESY = "GEODESY"


class ItalyServiceDependency(BaseModel):
    category: ServiceCategory
    icon: str
    name: str
    description: str
    criticality: Criticality
    italian_users: int = Field(description="Estimated number of Italian users/beneficiaries")
    provider: str = Field(description="Italian service provider or operator")
    geographic_coverage: str = "Nazionale"
    source_note: Optional[str] = None


class SatelliteTransmitter(BaseModel):
    description: Optional[str] = None
    alive: bool = False
    type: Optional[str] = None
    downlink_low: Optional[float] = None
    downlink_high: Optional[float] = None
    uplink_low: Optional[float] = None
    uplink_high: Optional[float] = None
    mode: Optional[str] = None
    baud: Optional[float] = None
    service: Optional[str] = None
    band: Optional[str] = None


class SatelliteOverItaly(BaseModel):
    norad_id: int
    name: str
    operator: Optional[str] = None
    country_code: Optional[str] = None
    constellation: Optional[str] = None
    orbit_type: str = "LEO"
    latitude: float
    longitude: float
    altitude: float = Field(description="Altitude in km")
    inclination: Optional[float] = None
    period: Optional[float] = None
    footprint_radius_km: float = Field(description="Coverage footprint radius in km")
    over_italy: bool = True
    is_italian: bool = False
    is_critical: bool = False
    italian_services: List[ItalyServiceDependency] = []
    total_italian_beneficiaries: int = 0
    critical_services_count: int = 0
    transmitters: List[SatelliteTransmitter] = []


class ItalyBigBrotherStats(BaseModel):
    total_satellites_over_italy: int
    italian_satellites: int
    by_category: dict = Field(description="Count of satellites per service category")
    total_beneficiaries: int
    critical_satellites: int
    timestamp: datetime


class ItalyBigBrotherResponse(BaseModel):
    satellites: List[SatelliteOverItaly]
    stats: ItalyBigBrotherStats
    timestamp: datetime


class SatelliteDependencyDetail(BaseModel):
    norad_id: int
    name: str
    operator: Optional[str] = None
    constellation: Optional[str] = None
    orbit_type: str
    altitude: Optional[float] = None
    inclination: Optional[float] = None
    italian_services: List[ItalyServiceDependency]
    total_italian_beneficiaries: int
    critical_services_count: int
    transmitters: List[SatelliteTransmitter] = []
