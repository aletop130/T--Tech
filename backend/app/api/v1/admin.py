"""Admin API endpoints for system maintenance and management."""
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
            # Note: VACUUM cannot run inside a transaction block
            # We need to use autocommit mode
            from app.db.base import engine
            async with engine.begin() as conn:
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


@router.get("/system/report")
async def download_system_report(
    user: Annotated[TokenData, Depends(require_role('admin'))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Generate comprehensive system health report."""
    try:
        import psutil
        psutil_available = True
    except ImportError:
        psutil_available = False
    
    # Database stats
    db_result = await db.execute(text("""
        SELECT 
            COUNT(*) as total_satellites,
            COUNT(CASE WHEN is_active THEN 1 END) as active_satellites
        FROM satellites
        WHERE tenant_id = :tenant_id
    """), {"tenant_id": user.tenant_id})
    db_stats = db_result.fetchone()
    
    # Incident stats
    incident_result = await db.execute(text("""
        SELECT 
            COUNT(*) as total,
            COUNT(CASE WHEN status = 'OPEN' THEN 1 END) as open_count,
            COUNT(CASE WHEN severity = 'critical' THEN 1 END) as critical_count
        FROM incidents
        WHERE tenant_id = :tenant_id
    """), {"tenant_id": user.tenant_id})
    incident_stats = incident_result.fetchone()
    
    # Redis health check
    redis_status = "healthy"
    try:
        import redis.asyncio as redis
        redis_client = redis.from_url(settings.REDIS_URL or "redis://localhost:6379")
        await redis_client.ping()
        await redis_client.close()
    except Exception:
        redis_status = "unhealthy"
    
    # System resources
    system_info = {}
    if psutil_available:
        memory = psutil.virtual_memory()
        disk = psutil.disk_usage('/')
        system_info = {
            "cpu_percent": psutil.cpu_percent(interval=1),
            "memory_percent": memory.percent,
            "memory_available_gb": round(memory.available / (1024**3), 2),
            "disk_percent": disk.percent,
            "disk_free_gb": round(disk.free / (1024**3), 2),
        }
    else:
        system_info = {
            "note": "psutil not available - install for system metrics"
        }
    
    report = {
        "timestamp": datetime.utcnow().isoformat(),
        "tenant_id": user.tenant_id,
        "database": {
            "status": "healthy",
            "satellites_total": db_stats.total_satellites if db_stats else 0,
            "satellites_active": db_stats.active_satellites if db_stats else 0,
        },
        "incidents": {
            "total": incident_stats.total if incident_stats else 0,
            "open": incident_stats.open_count if incident_stats else 0,
            "critical": incident_stats.critical_count if incident_stats else 0,
        },
        "redis": {
            "status": redis_status,
        },
        "system": system_info,
    }
    
    return JSONResponse(content=report)


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
    
    return {
        "satellites": satellites_count,
        "open_incidents": open_incidents,
        "incidents_24h": incidents_24h,
        "audit_logs_24h": audit_24h,
    }
