"""Schemas for country / operator dashboard."""

from __future__ import annotations

from pydantic import Field

from app.schemas.common import BaseSchema


class CountrySummary(BaseSchema):
    country_code: str
    country_name: str
    total_objects: int = 0
    payloads: int = 0
    rocket_bodies: int = 0
    debris: int = 0
    leo: int = 0
    meo: int = 0
    geo: int = 0
    heo: int = 0


class OperatorSummary(BaseSchema):
    operator_name: str
    country: str = ""
    satellite_count: int = 0
    primary_purpose: str = ""


class OrbitDistribution(BaseSchema):
    leo: int = 0
    meo: int = 0
    geo: int = 0
    heo: int = 0


class GlobalSummary(BaseSchema):
    total_objects: int = 0
    total_countries: int = 0
    total_payloads: int = 0
    total_rocket_bodies: int = 0
    total_debris: int = 0
    top_countries: list[CountrySummary] = Field(default_factory=list)
    orbit_distribution: OrbitDistribution = Field(default_factory=OrbitDistribution)
    all_countries: list[CountrySummary] = Field(default_factory=list)


class CountryDetail(BaseSchema):
    summary: CountrySummary
    top_operators: list[OperatorSummary] = Field(default_factory=list)
    orbit_distribution: OrbitDistribution = Field(default_factory=OrbitDistribution)


class TopOperatorsResponse(BaseSchema):
    operators: list[OperatorSummary] = Field(default_factory=list)
    total: int = 0
