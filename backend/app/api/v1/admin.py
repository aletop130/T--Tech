"""Admin API endpoints for system maintenance and management."""
import asyncio
import json
import time
from typing import Annotated, Optional
from datetime import datetime
from io import StringIO

from fastapi import APIRouter, Depends, BackgroundTasks, Query
from fastapi.responses import StreamingResponse, JSONResponse
from sqlalchemy import text, select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_db, require_role
from app.core.security import TokenData
from app.core.config import settings
from app.core.exceptions import SDAException
from app.db.base import engine

router = APIRouter()


@router.post("/cache/clear")
async def clear_cache(
    user: Annotated[TokenData, Depends(require_role('admin'))],
):
    """Clear Redis cache."""
    try:
        import redis.asyncio as redis
        redis_client = redis.from_url(
            settings.REDIS_URL or "redis://localhost:6379",
            decode_responses=True
        )
        await redis_client.flushdb()
        await redis_client.close()
        return {"success": True, "message": "Cache cleared successfully"}
    except Exception as e:
        raise SDAException(
            status_code=500,
            error_type="cache-error",
            title="Cache Error",
            detail=f"Failed to clear cache: {str(e)}"
        )


@router.post("/database/vacuum")
async def run_database_vacuum(
    user: Annotated[TokenData, Depends(require_role('admin'))],
    background_tasks: BackgroundTasks,
):
    """Run PostgreSQL VACUUM ANALYZE as background task."""
    async def vacuum_task():
        try:
            # VACUUM cannot run inside a transaction block.
            # Use AUTOCOMMIT isolation level.
            async with engine.connect() as conn:
                await conn.execution_options(isolation_level="AUTOCOMMIT")
                await conn.execute(text("VACUUM ANALYZE"))
        except Exception as e:
            print(f"Vacuum task failed: {e}")

    background_tasks.add_task(vacuum_task)
    return {
        "success": True,
        "message": "Database vacuum started in background. This may take several minutes."
    }


@router.get("/audit/export")
async def export_audit_logs(
    user: Annotated[TokenData, Depends(require_role('admin'))],
    db: Annotated[AsyncSession, Depends(get_db)],
    start_date: Optional[datetime] = Query(None, description="Start date for logs"),
    end_date: Optional[datetime] = Query(None, description="End date for logs"),
    format: str = Query("csv", description="Export format: csv or json"),
):
    """Export audit logs as CSV or JSON."""
    from app.db.models.audit import AuditEvent

    # Build query using SQLAlchemy 2.0 style
    stmt = select(AuditEvent).where(AuditEvent.tenant_id == user.tenant_id)

    if start_date:
        stmt = stmt.where(AuditEvent.timestamp >= start_date)
    if end_date:
        stmt = stmt.where(AuditEvent.timestamp <= end_date)

    stmt = stmt.order_by(AuditEvent.timestamp.desc())

    result = await db.execute(stmt)
    logs = result.scalars().all()

    if format == "json":
        data = [{
            "id": log.id,
            "action": log.action,
            "entity_type": log.entity_type,
            "entity_id": log.entity_id,
            "user_id": log.user_id,
            "details": log.extra_data,
            "created_at": log.timestamp.isoformat() if log.timestamp else None,
        } for log in logs]
        return JSONResponse(content=data)

    # CSV format
    output = StringIO()
    output.write("id,action,entity_type,entity_id,user_id,details,created_at\n")

    for log in logs:
        details = str(log.extra_data or "").replace('"', '""').replace("\n", " ")
        timestamp = log.timestamp.isoformat() if log.timestamp else ""
        output.write(f'"{log.id}","{log.action}","{log.entity_type}","{log.entity_id}","{log.user_id}","{details}","{timestamp}"\n')

    output.seek(0)

    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=audit_logs_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"}
    )


@router.get("/stats")
async def get_admin_stats(
    user: Annotated[TokenData, Depends(require_role('admin'))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Get real-time admin dashboard statistics."""
    # Database stats using async queries
    satellites_result = await db.execute(
        select(func.count()).select_from(text("satellites")).where(text("tenant_id = :tenant_id")),
        {"tenant_id": user.tenant_id}
    )
    satellites_count = satellites_result.scalar() or 0

    # Open incidents
    open_incidents_result = await db.execute(
        select(func.count()).select_from(text("incidents"))
        .where(text("tenant_id = :tenant_id AND status = 'OPEN'")),
        {"tenant_id": user.tenant_id}
    )
    open_incidents = open_incidents_result.scalar() or 0

    # Incidents in last 24h
    incidents_24h_result = await db.execute(
        select(func.count()).select_from(text("incidents"))
        .where(text("tenant_id = :tenant_id AND created_at > NOW() - INTERVAL '24 hours'")),
        {"tenant_id": user.tenant_id}
    )
    incidents_24h = incidents_24h_result.scalar() or 0

    # Audit logs in last 24h
    audit_24h_result = await db.execute(
        select(func.count()).select_from(text("audit_events"))
        .where(text("tenant_id = :tenant_id AND timestamp > NOW() - INTERVAL '24 hours'")),
        {"tenant_id": user.tenant_id}
    )
    audit_24h = audit_24h_result.scalar() or 0

    # Ground stations count
    ground_stations_result = await db.execute(
        select(func.count()).select_from(text("ground_stations")).where(text("tenant_id = :tenant_id")),
        {"tenant_id": user.tenant_id}
    )
    ground_stations_count = ground_stations_result.scalar() or 0

    # Orbits count
    orbits_result = await db.execute(
        select(func.count()).select_from(text("orbits")).where(text("tenant_id = :tenant_id")),
        {"tenant_id": user.tenant_id}
    )
    orbits_count = orbits_result.scalar() or 0

    # Conjunctions count
    conjunctions_result = await db.execute(
        select(func.count()).select_from(text("conjunction_events")).where(text("tenant_id = :tenant_id")),
        {"tenant_id": user.tenant_id}
    )
    conjunctions_count = conjunctions_result.scalar() or 0

    # Ingestion runs in last 24h
    ingestion_24h_result = await db.execute(
        select(func.count()).select_from(text("ingestion_runs"))
        .where(text("tenant_id = :tenant_id AND created_at > NOW() - INTERVAL '24 hours'")),
        {"tenant_id": user.tenant_id}
    )
    ingestion_runs_24h = ingestion_24h_result.scalar() or 0

    return {
        "satellites": satellites_count,
        "open_incidents": open_incidents,
        "incidents_24h": incidents_24h,
        "audit_logs_24h": audit_24h,
        "ground_stations": ground_stations_count,
        "orbits": orbits_count,
        "conjunctions": conjunctions_count,
        "ingestion_runs_24h": ingestion_runs_24h,
    }


@router.get("/health/services")
async def get_service_health(
    user: Annotated[TokenData, Depends(require_role('admin'))],
):
    """Check real health of all backend services."""

    async def _check_database() -> dict:
        start = time.monotonic()
        try:
            async with engine.connect() as conn:
                await asyncio.wait_for(
                    conn.execute(text("SELECT 1")),
                    timeout=5.0,
                )
            latency = (time.monotonic() - start) * 1000
            return {"name": "Database", "status": "healthy", "latency_ms": round(latency, 2), "detail": None}
        except Exception as e:
            latency = (time.monotonic() - start) * 1000
            return {"name": "Database", "status": "unhealthy", "latency_ms": round(latency, 2), "detail": str(e)}

    async def _check_redis() -> dict:
        start = time.monotonic()
        try:
            import redis.asyncio as redis
            client = redis.from_url(
                settings.REDIS_URL or "redis://localhost:6379",
                decode_responses=True,
            )
            await asyncio.wait_for(client.ping(), timeout=5.0)
            await client.close()
            latency = (time.monotonic() - start) * 1000
            return {"name": "Redis Cache", "status": "healthy", "latency_ms": round(latency, 2), "detail": None}
        except Exception as e:
            latency = (time.monotonic() - start) * 1000
            return {"name": "Redis Cache", "status": "unhealthy", "latency_ms": round(latency, 2), "detail": str(e)}

    async def _check_minio() -> dict:
        start = time.monotonic()
        try:
            from minio import Minio
            client = Minio(
                settings.MINIO_ENDPOINT,
                access_key=settings.MINIO_ACCESS_KEY,
                secret_key=settings.MINIO_SECRET_KEY,
                secure=settings.MINIO_SECURE,
            )
            # list_buckets is synchronous in the minio library, run in executor
            loop = asyncio.get_event_loop()
            await asyncio.wait_for(
                loop.run_in_executor(None, client.list_buckets),
                timeout=5.0,
            )
            latency = (time.monotonic() - start) * 1000
            return {"name": "MinIO Storage", "status": "healthy", "latency_ms": round(latency, 2), "detail": None}
        except Exception as e:
            latency = (time.monotonic() - start) * 1000
            return {"name": "MinIO Storage", "status": "unhealthy", "latency_ms": round(latency, 2), "detail": str(e)}

    async def _check_ai_service() -> dict:
        start = time.monotonic()
        try:
            if not settings.REGOLO_API_KEY:
                latency = (time.monotonic() - start) * 1000
                return {"name": "AI Service", "status": "unavailable", "latency_ms": round(latency, 2), "detail": "API key not configured"}

            import httpx
            async with httpx.AsyncClient(timeout=5.0) as client:
                resp = await client.get(settings.REGOLO_BASE_URL)
                latency = (time.monotonic() - start) * 1000
                if resp.status_code < 500:
                    return {"name": "AI Service", "status": "healthy", "latency_ms": round(latency, 2), "detail": None}
                else:
                    return {"name": "AI Service", "status": "degraded", "latency_ms": round(latency, 2), "detail": f"HTTP {resp.status_code}"}
        except Exception as e:
            latency = (time.monotonic() - start) * 1000
            return {"name": "AI Service", "status": "degraded", "latency_ms": round(latency, 2), "detail": str(e)}

    # Run all checks concurrently
    results = await asyncio.gather(
        _check_database(),
        _check_redis(),
        _check_minio(),
        _check_ai_service(),
    )

    services = list(results)

    # Determine overall status
    statuses = [s["status"] for s in services]
    if all(s == "healthy" for s in statuses):
        overall = "healthy"
    elif any(s == "unhealthy" for s in statuses):
        overall = "unhealthy"
    else:
        overall = "degraded"

    return {"services": services, "overall": overall}


@router.get("/settings")
async def get_tenant_settings(
    user: Annotated[TokenData, Depends(require_role('admin'))],
):
    """Get tenant settings from Redis."""
    defaults = {
        "ai_features": True,
        "auto_conjunction_analysis": True,
        "space_weather_alerts": True,
        "tenant_name": "Default Tenant",
    }

    try:
        import redis.asyncio as redis
        client = redis.from_url(
            settings.REDIS_URL or "redis://localhost:6379",
            decode_responses=True,
        )
        raw = await client.get(f"tenant_settings:{user.tenant_id}")
        await client.close()

        if raw:
            stored = json.loads(raw)
            # Merge defaults with stored (stored takes priority)
            merged = {**defaults, **stored}
            return merged
    except Exception:
        pass

    return defaults


@router.put("/settings")
async def update_tenant_settings(
    user: Annotated[TokenData, Depends(require_role('admin'))],
    body: dict,
):
    """Save tenant settings to Redis. Accepts any subset of setting keys."""
    allowed_keys = {"ai_features", "auto_conjunction_analysis", "space_weather_alerts", "tenant_name"}
    defaults = {
        "ai_features": True,
        "auto_conjunction_analysis": True,
        "space_weather_alerts": True,
        "tenant_name": "Default Tenant",
    }

    try:
        import redis.asyncio as redis
        client = redis.from_url(
            settings.REDIS_URL or "redis://localhost:6379",
            decode_responses=True,
        )
        key = f"tenant_settings:{user.tenant_id}"

        # Load existing settings
        raw = await client.get(key)
        existing = json.loads(raw) if raw else {}

        # Merge defaults -> existing -> new values (only allowed keys)
        merged = {**defaults, **existing}
        for k, v in body.items():
            if k in allowed_keys:
                merged[k] = v

        await client.set(key, json.dumps(merged))
        await client.close()

        return {"success": True, "settings": merged}
    except Exception as e:
        raise SDAException(
            status_code=500,
            error_type="settings-error",
            title="Settings Error",
            detail=f"Failed to update settings: {str(e)}",
        )
