"""RF Spectrum Awareness API endpoints."""

from typing import Optional

from fastapi import APIRouter, Query

from app.schemas.rf_spectrum import (
    BandSummary,
    SatelliteRFProfile,
    TransmitterSearchResult,
)
from app.services.rf_spectrum import (
    get_band_summary,
    get_satellite_rf_profile,
    search_transmitters,
)

router = APIRouter()


@router.get("/satellite/{norad_id}", response_model=SatelliteRFProfile)
async def rf_satellite_profile(norad_id: int):
    """Get RF profile for a specific satellite by NORAD ID."""
    return await get_satellite_rf_profile(norad_id)


@router.get("/search", response_model=TransmitterSearchResult)
async def rf_search(
    band: Optional[str] = Query(None, description="Band filter: VHF, UHF, S-band, X-band, etc."),
    mode: Optional[str] = Query(None, description="Mode filter: FM, AFSK, BPSK, etc."),
    alive_only: bool = Query(True, description="Only show active transmitters"),
):
    """Search and filter transmitters across all satellites."""
    return await search_transmitters(band=band, mode=mode, alive_only=alive_only)


@router.get("/bands", response_model=list[BandSummary])
async def rf_bands():
    """Get band usage summary across all tracked satellites."""
    return await get_band_summary()
