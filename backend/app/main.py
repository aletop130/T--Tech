"""FastAPI main application."""
from contextlib import asynccontextmanager
from datetime import datetime

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import structlog
from prometheus_client import generate_latest, CONTENT_TYPE_LATEST

from app.core.config import settings
from app.core.logging import configure_logging, get_logger
from app.core.exceptions import SDAException, sda_exception_handler
from app.api.v1.router import api_router
from app.schemas.common import HealthResponse

configure_logging()
logger = get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan handler."""
    logger.info("Starting SDA Platform", version=settings.APP_VERSION)
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

@app.middleware("http")
async def add_logging_context(request: Request, call_next):
    # Bind tenant_id from header
    tenant_id = request.headers.get("X-Tenant-ID", "default")
    structlog.contextvars.bind_contextvars(tenant_id=tenant_id)
    # Bind session_id from URL path if present
    path_parts = request.url.path.split("/")
    if "sessions" in path_parts:
        idx = path_parts.index("sessions")
        if idx + 1 < len(path_parts):
            session_id = path_parts[idx + 1]
            structlog.contextvars.bind_contextvars(session_id=session_id)
    response = await call_next(request)
    # Clear context variables
    structlog.contextvars.unbind_contextvars("tenant_id", "session_id")
    return response
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


