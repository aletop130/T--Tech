"""Analytics API endpoints."""
from datetime import datetime, timedelta
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel

from app.api.deps import (
    get_current_user,
    get_conjunction_analyzer,
    get_space_weather_analyzer,
)
from app.core.security import TokenData
from app.services.analytics import ConjunctionAnalyzer, SpaceWeatherAnalyzer

router = APIRouter()


class ConjunctionRunRequest(BaseModel):
    """Request for conjunction analysis run."""
    satellite_ids: Optional[list[str]] = None
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    screening_volume_km: float = 10.0


class SpaceWeatherAnalysisRequest(BaseModel):
    """Request for space weather analysis."""
    start_time: datetime
    end_time: datetime


@router.post("/conjunction/run")
async def run_conjunction_analysis(
    request: ConjunctionRunRequest,
    user: Annotated[TokenData, Depends(get_current_user)],
    analyzer: Annotated[ConjunctionAnalyzer, Depends(get_conjunction_analyzer)],
):
    """Run conjunction analysis for satellites."""
    result = await analyzer.run_conjunction_analysis(
        tenant_id=user.tenant_id,
        satellite_ids=request.satellite_ids,
        start_time=request.start_time,
        end_time=request.end_time,
        screening_volume_km=request.screening_volume_km,
        user_id=user.sub,
    )
    return result


@router.get("/conjunction/results")
async def get_conjunction_results(
    user: Annotated[TokenData, Depends(get_current_user)],
    analyzer: Annotated[ConjunctionAnalyzer, Depends(get_conjunction_analyzer)],
    run_id: Optional[str] = Query(None),
    start_time: Optional[datetime] = Query(None),
    end_time: Optional[datetime] = Query(None),
):
    """Get conjunction analysis results."""
    # This would query stored results - for now return from run
    result = await analyzer.run_conjunction_analysis(
        tenant_id=user.tenant_id,
        start_time=start_time or datetime.utcnow(),
        end_time=end_time or (datetime.utcnow() + timedelta(hours=24)),
        user_id=user.sub,
    )
    return result


@router.post("/space-weather/analyze")
async def analyze_space_weather(
    request: SpaceWeatherAnalysisRequest,
    user: Annotated[TokenData, Depends(get_current_user)],
    analyzer: Annotated[
        SpaceWeatherAnalyzer, Depends(get_space_weather_analyzer)
    ],
):
    """Analyze space weather impact for a time range."""
    return await analyzer.analyze_time_range(
        tenant_id=user.tenant_id,
        start_time=request.start_time,
        end_time=request.end_time,
    )


@router.get("/space-weather/impact")
async def get_space_weather_impact(
    user: Annotated[TokenData, Depends(get_current_user)],
    analyzer: Annotated[
        SpaceWeatherAnalyzer, Depends(get_space_weather_analyzer)
    ],
    hours: int = Query(24, ge=1, le=168),
):
    """Get space weather impact for the next N hours."""
    start_time = datetime.utcnow()
    end_time = start_time + timedelta(hours=hours)
    
    return await analyzer.analyze_time_range(
        tenant_id=user.tenant_id,
        start_time=start_time,
        end_time=end_time,
    )

