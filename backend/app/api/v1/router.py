"""API v1 router."""
from fastapi import APIRouter

from app.api.v1 import (
    ontology,
    incidents,
    ingestion,
    analytics,
    ai,
    audit,
    search,
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
    audit.router,
    prefix="/audit",
    tags=["Audit"],
)

api_router.include_router(
    search.router,
    prefix="/search",
    tags=["Search"],
)

