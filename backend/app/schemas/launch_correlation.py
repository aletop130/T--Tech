"""Schemas for launch correlation engine."""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import Field

from app.schemas.common import BaseSchema


class LaunchInfo(BaseSchema):
    """Information about a launch event."""
    id: str
    name: str
    net: Optional[datetime] = None
    pad_name: Optional[str] = None
    pad_country: Optional[str] = None
    rocket_name: Optional[str] = None
    mission_name: Optional[str] = None
    mission_orbit: Optional[str] = None
    status: Optional[str] = None


class CorrelatedObject(BaseSchema):
    """A catalog object correlated to a launch."""
    norad_id: int
    name: str
    correlation_confidence: float = Field(..., ge=0, le=1)
    epoch: Optional[datetime] = None
    orbit_type: Optional[str] = None


class LaunchCorrelation(BaseSchema):
    """A launch with its correlated catalog objects."""
    launch: LaunchInfo
    correlated_objects: list[CorrelatedObject] = Field(default_factory=list)
    total_correlated: int = 0


class UncorrelatedObject(BaseSchema):
    """A catalog object with no matched launch."""
    norad_id: int
    name: str
    epoch: Optional[datetime] = None
    orbit_params: dict = Field(default_factory=dict)
    possible_launches: list[LaunchInfo] = Field(default_factory=list)


class RecentLaunchesResponse(BaseSchema):
    """Response for recent launches with correlations."""
    launches: list[LaunchCorrelation] = Field(default_factory=list)
    total_launches: int = 0
    total_correlated_objects: int = 0
    cached_at: Optional[datetime] = None


class UncorrelatedResponse(BaseSchema):
    """Response for uncorrelated objects."""
    objects: list[UncorrelatedObject] = Field(default_factory=list)
    total: int = 0


class UpcomingLaunchesResponse(BaseSchema):
    """Response for upcoming launches."""
    launches: list[LaunchInfo] = Field(default_factory=list)
    total: int = 0
