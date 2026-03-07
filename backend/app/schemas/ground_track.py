"""Schemas for ground track and sensor footprint overlay."""

from __future__ import annotations

from pydantic import BaseModel, Field


class GroundTrackPoint(BaseModel):
    """A single sub-satellite point along the ground track."""
    time_offset_s: float = Field(..., description="Seconds from track start")
    latitude: float = Field(..., ge=-90, le=90)
    longitude: float = Field(..., ge=-180, le=180)
    altitude_km: float = Field(..., ge=0)


class GroundTrack(BaseModel):
    """Full ground track for a satellite over a time window."""
    norad_id: int
    satellite_name: str
    duration_minutes: int
    interval_seconds: int
    points: list[GroundTrackPoint]


class SensorFootprint(BaseModel):
    """Current sensor footprint circle projected onto the ground."""
    norad_id: int
    center_lat: float = Field(..., ge=-90, le=90)
    center_lon: float = Field(..., ge=-180, le=180)
    radius_km: float = Field(..., ge=0)
    altitude_km: float = Field(..., ge=0)
    fov_deg: float = Field(..., gt=0, le=180)


class SatellitePass(BaseModel):
    """A single pass of a satellite over a ground location."""
    rise_time: str = Field(..., description="ISO UTC time when satellite rises above horizon")
    culmination_time: str = Field(..., description="ISO UTC time of maximum elevation")
    set_time: str = Field(..., description="ISO UTC time when satellite sets below horizon")
    max_elevation_deg: float = Field(..., ge=0, le=90, description="Peak elevation in degrees")
    duration_seconds: float = Field(..., ge=0, description="Pass duration in seconds")


class PassPredictions(BaseModel):
    """Pass predictions for a satellite over a ground location."""
    norad_id: int
    satellite_name: str
    observer_lat: float
    observer_lon: float
    passes: list[SatellitePass]
