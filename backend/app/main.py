"""FastAPI main application."""
import asyncio
import uuid
from contextlib import asynccontextmanager
from datetime import datetime

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import anyio
import structlog
from prometheus_client import generate_latest, CONTENT_TYPE_LATEST
from sqlalchemy import select, func
from starlette.types import ASGIApp, Scope, Receive, Send

from app.core.config import settings
from app.core.logging import configure_logging, get_logger
from app.core.exceptions import SDAException, sda_exception_handler
from app.api.v1.router import api_router
from app.schemas.common import HealthResponse

configure_logging()
logger = get_logger(__name__)


class LoggingContextMiddleware:
    """ASGI middleware to bind tenant/session IDs to structlog contextvars.

    Implemented as pure ASGI middleware to avoid BaseHTTPMiddleware cancellation
    edge-cases with long-lived/streaming requests.
    """

    def __init__(self, app: ASGIApp):
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope.get("type") != "http":
            await self.app(scope, receive, send)
            return

        headers = {
            key.decode("latin1").lower(): value.decode("latin1")
            for key, value in scope.get("headers", [])
        }
        tenant_id = headers.get("x-tenant-id", "default")
        structlog.contextvars.bind_contextvars(tenant_id=tenant_id)

        path = scope.get("path", "")
        path_parts = path.split("/")
        if "sessions" in path_parts:
            idx = path_parts.index("sessions")
            if idx + 1 < len(path_parts):
                structlog.contextvars.bind_contextvars(session_id=path_parts[idx + 1])

        try:
            # Shield request handling from disconnect cancellation long enough
            # to let dependency cleanup return DB connections to the pool.
            with anyio.CancelScope(shield=True):
                await self.app(scope, receive, send)
        except asyncio.CancelledError:
            # Client disconnected; avoid noisy cancellation tracebacks.
            logger.info("request_cancelled", path=path, tenant_id=tenant_id)
            return
        finally:
            structlog.contextvars.clear_contextvars()


async def _seed_initial_data():
    """Seed ground stations, debris, and ground vehicles if the DB is empty."""
    from app.db.base import async_session_factory
    from app.db.models.ontology import GroundStation, Satellite, ObjectType
    from app.db.models.operations import PositionReport
    from app.services.audit import AuditService
    from app.services.ontology import OntologyService
    from app.services.debris import DebrisService
    from app.services.celestrack import (
        GROUND_STATIONS,
        SENSORS,
        create_ground_stations_if_missing,
        create_sensors_if_missing,
    )

    tenant_id = "default"
    user_id = "system_seed"

    try:
        async with async_session_factory() as session:
            audit = AuditService(session)
            ontology = OntologyService(session, audit)

            # --- Ground Stations ---
            gs_count = await session.scalar(
                select(func.count()).select_from(GroundStation).where(
                    GroundStation.tenant_id == tenant_id
                )
            ) or 0
            if gs_count == 0:
                await create_ground_stations_if_missing(ontology, tenant_id, user_id)
                await create_sensors_if_missing(ontology, tenant_id, user_id)
                await session.commit()
                logger.info("Seeded ground stations and sensors")

            # --- Debris ---
            debris_count = await session.scalar(
                select(func.count()).select_from(Satellite).where(
                    Satellite.tenant_id == tenant_id,
                    Satellite.object_type == ObjectType.DEBRIS.value,
                )
            ) or 0
            if debris_count == 0:
                debris_svc = DebrisService(session, audit)
                created = await debris_svc.generate_synthetic_debris(
                    tenant_id, count=500, user_id=user_id,
                )
                logger.info("Seeded synthetic debris", count=created)

            # --- Ground Vehicles ---
            vehicle_count = await session.scalar(
                select(func.count()).select_from(PositionReport).where(
                    PositionReport.tenant_id == tenant_id,
                    PositionReport.entity_type == "ground_vehicle",
                )
            ) or 0
            if vehicle_count == 0:
                import random
                vehicles = [
                    {"name": "ALPHA-1", "lat": 41.90, "lon": 12.50},
                    {"name": "BRAVO-2", "lat": 48.86, "lon": 2.35},
                    {"name": "CHARLIE-3", "lat": 38.72, "lon": -9.14},
                    {"name": "DELTA-4", "lat": 52.52, "lon": 13.41},
                    {"name": "ECHO-5", "lat": 40.42, "lon": -3.70},
                ]
                now = datetime.utcnow()
                for v in vehicles:
                    session.add(PositionReport(
                        id=str(uuid.uuid4()),
                        tenant_id=tenant_id,
                        entity_id=v["name"],
                        entity_type="ground_vehicle",
                        report_time=now,
                        latitude=v["lat"],
                        longitude=v["lon"],
                        altitude_m=0,
                        heading_deg=random.uniform(0, 360),
                        velocity_magnitude_ms=0,
                        data_source="system_seed",
                        created_at=now,
                        updated_at=now,
                        created_by=user_id,
                    ))
                await session.commit()
                logger.info("Seeded ground vehicles", count=len(vehicles))

    except Exception as exc:
        logger.error("Failed to seed initial data", error=str(exc), exc_info=True)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan handler."""
    logger.info("Starting SDA Platform", version=settings.APP_VERSION)
    await _seed_initial_data()
    yield
    logger.info("Shutting down SDA Platform")


app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description="Space Domain Awareness Platform API",
    openapi_url="/api/openapi.json",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    lifespan=lifespan,
)

# CORS middleware
app.add_middleware(LoggingContextMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure properly in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Exception handlers
app.add_exception_handler(SDAException, sda_exception_handler)


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Global exception handler."""
    logger.error(f"Unhandled exception: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={
            "type": "https://sda-platform.io/errors/internal-error",
            "title": "Internal Server Error",
            "status": 500,
            "detail": "An unexpected error occurred",
        },
        media_type="application/problem+json",
    )


# Include API router
app.include_router(api_router, prefix="/api/v1")

# Mount WebSocket router (no /api/v1 prefix for WS)
from app.api.v1.websocket import router as ws_router
app.include_router(ws_router)


@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Health check endpoint."""
    return HealthResponse(
        status="healthy",
        version=settings.APP_VERSION,
        timestamp=datetime.utcnow(),
        services={
            "api": "healthy",
        },
    )


@app.get("/")
async def root():
    """Root endpoint."""
    return {
        "name": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "docs": "/api/docs",
    }

@app.get("/metrics")
def metrics():
    return Response(content=generate_latest(), media_type=CONTENT_TYPE_LATEST)
