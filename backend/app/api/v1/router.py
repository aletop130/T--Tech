"""API v1 router."""
from fastapi import APIRouter

from app.api.v1 import (
    admin,
    ontology,
    incidents,
    ingestion,
    analytics,
    ai,
    ai_detour,
    audit,
    detour,
    search,
    operations,
    proximity,
    timeline,
    simulation,
    threats,
    fleet_risk,
    adversary,
    response,
    comms,
    satellite_profile,
    space_weather,
    rf_spectrum,
    reentry,
    collision_heatmap,
    launch_correlation,
    country_dashboard,
    maneuver_detection,
    ground_track,
    debris_genealogy,
    sandbox,
)

api_router = APIRouter()

api_router.include_router(
    ontology.router,
    prefix="/ontology",
    tags=["Ontology"],
)

api_router.include_router(
    incidents.router,
    prefix="/incidents",
    tags=["Incidents"],
)

api_router.include_router(
    ingestion.router,
    prefix="/ingestion",
    tags=["Ingestion"],
)

api_router.include_router(
    analytics.router,
    prefix="/analytics",
    tags=["Analytics"],
)

api_router.include_router(
    ai.router,
    prefix="/ai",
    tags=["AI"],
)

api_router.include_router(
    ai_detour.router,
    prefix="/ai",
    tags=["AI Agents - Detour"],
)

api_router.include_router(
    audit.router,
    prefix="/audit",
    tags=["Audit"],
)

api_router.include_router(
    search.router,
    prefix="/search",
    tags=["Search"],
)

api_router.include_router(
    operations.router,
    prefix="/operations",
    tags=["Operations"],
)

api_router.include_router(
    proximity.router,
    prefix="/proximity",
    tags=["Proximity Detection"],
)

api_router.include_router(
    detour.router,
    prefix="/detour",
    tags=["detour"],
)

api_router.include_router(
    admin.router,
    prefix="/admin",
    tags=["Admin"],
)

api_router.include_router(
    timeline.router,
    prefix="/timeline",
    tags=["Timeline"],
)

api_router.include_router(
    simulation.router,
    prefix="/simulation",
    tags=["Simulation"],
)

api_router.include_router(
    sandbox.router,
    prefix="/sandbox",
    tags=["Sandbox"],
)

api_router.include_router(
    threats.router,
    prefix="/threats",
    tags=["Threats"],
)

api_router.include_router(
    fleet_risk.router,
    prefix="/fleet-risk",
    tags=["Fleet Risk"],
)

api_router.include_router(
    adversary.router,
    prefix="/adversary",
    tags=["Adversary Tracking"],
)

api_router.include_router(
    response.router,
    prefix="/response",
    tags=["Threat Response"],
)

api_router.include_router(
    comms.router,
    prefix="/comms",
    tags=["Iridium Communications"],
)

api_router.include_router(
    satellite_profile.router,
    prefix="/satellite-profile",
    tags=["Satellite Profile"],
)

api_router.include_router(
    space_weather.router,
    prefix="/space-weather",
    tags=["Space Weather"],
)

api_router.include_router(
    rf_spectrum.router,
    prefix="/rf-spectrum",
    tags=["RF Spectrum"],
)

api_router.include_router(
    reentry.router,
    prefix="/reentry",
    tags=["Reentry Tracker"],
)

api_router.include_router(
    collision_heatmap.router,
    prefix="/collision-heatmap",
    tags=["Collision Heatmap"],
)

api_router.include_router(
    launch_correlation.router,
    prefix="/launch-correlation",
    tags=["Launch Correlation"],
)

api_router.include_router(
    country_dashboard.router,
    prefix="/country-dashboard",
    tags=["Country Dashboard"],
)

api_router.include_router(
    maneuver_detection.router,
    prefix="/maneuver-detection",
    tags=["Maneuver Detection"],
)

api_router.include_router(
    ground_track.router,
    prefix="/ground-track",
    tags=["Ground Track"],
)

api_router.include_router(
    debris_genealogy.router,
    prefix="/debris-genealogy",
    tags=["Debris Genealogy"],
)
