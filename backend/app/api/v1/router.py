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

