"""Country / Operator dashboard API endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Query

from app.services.country_dashboard import (
    get_global_summary,
    get_country_detail,
    get_top_operators,
)

router = APIRouter()


@router.get("/summary")
async def country_dashboard_summary():
    """Global overview with all countries."""
    return await get_global_summary()


@router.get("/country/{country_code}")
async def country_dashboard_detail(country_code: str):
    """Detailed breakdown for one country."""
    return await get_country_detail(country_code)


@router.get("/operators")
async def country_dashboard_operators(
    limit: int = Query(50, ge=1, le=200),
):
    """Top operators across all countries."""
    return await get_top_operators(limit)
