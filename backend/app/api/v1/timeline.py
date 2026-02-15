"""Timeline API endpoints for event aggregation."""
from typing import Annotated, Optional, List
from datetime import datetime, timedelta, date
from enum import Enum

from fastapi import APIRouter, Depends, Query
from fastapi.responses import JSONResponse
from sqlalchemy import text, select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_db
from app.core.security import TokenData

router = APIRouter()


class EventType(str, Enum):
    CONJUNCTION = "conjunction"
    SPACE_WEATHER = "space_weather"
    INCIDENT = "incident"
    INGESTION = "ingestion"


class TimelineEvent:
    """Timeline event representation."""
    def __init__(
        self,
        id: str,
        type: str,
        title: str,
        time: datetime,
        severity: Optional[str] = None,
        details: Optional[str] = None,
    ):
        self.id = id
        self.type = type
        self.title = title
        self.time = time
        self.severity = severity
        self.details = details
    
    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "type": self.type,
            "title": self.title,
            "time": self.time.isoformat() if self.time else None,
            "severity": self.severity,
            "details": self.details,
        }


@router.get("/events")
async def get_timeline_events(
    user: Annotated[TokenData, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    date: date = Query(..., description="Date to fetch events for (YYYY-MM-DD)"),
    event_types: Optional[str] = Query(None, description="Comma-separated event types to filter"),
):
    """Get all events for a specific date."""
    # Parse event types filter
    types_filter = None
    if event_types:
        types_filter = [t.strip() for t in event_types.split(",")]
    
    events: List[TimelineEvent] = []
    
    # Start and end of the day
    start_dt = datetime.combine(date, datetime.min.time())
    end_dt = datetime.combine(date, datetime.max.time())
    
    # Fetch incidents for date
    if not types_filter or "incident" in types_filter:
        try:
            stmt = text("""
                SELECT id, title, incident_type, severity, status, detected_at, description
                FROM incidents
                WHERE tenant_id = :tenant_id
                  AND detected_at >= :start_dt
                  AND detected_at <= :end_dt
                ORDER BY detected_at DESC
            """)
            result = await db.execute(stmt, {
                "tenant_id": user.tenant_id,
                "start_dt": start_dt,
                "end_dt": end_dt,
            })
            rows = result.fetchall()
            
            for row in rows:
                events.append(TimelineEvent(
                    id=f"incident-{row.id}",
                    type="incident",
                    title=row.title,
                    time=row.detected_at,
                    severity=row.severity,
                    details=f"{row.incident_type} - {row.status}",
                ))
        except Exception as e:
            print(f"Error fetching incidents: {e}")
    
    # Fetch conjunctions (time of closest approach)
    if not types_filter or "conjunction" in types_filter:
        try:
            stmt = text("""
                SELECT id, primary_object_id, secondary_object_id, tca, risk_level, miss_distance_km
                FROM conjunctions
                WHERE tenant_id = :tenant_id
                  AND tca >= :start_dt
                  AND tca <= :end_dt
                ORDER BY tca ASC
            """)
            result = await db.execute(stmt, {
                "tenant_id": user.tenant_id,
                "start_dt": start_dt,
                "end_dt": end_dt,
            })
            rows = result.fetchall()
            
            for row in rows:
                events.append(TimelineEvent(
                    id=f"conjunction-{row.id}",
                    type="conjunction",
                    title=f"Close approach: {row.primary_object_id} / {row.secondary_object_id}",
                    time=row.tca,
                    severity=row.risk_level,
                    details=f"Miss distance: {row.miss_distance_km:.1f} km",
                ))
        except Exception as e:
            print(f"Error fetching conjunctions: {e}")
    
    # Fetch space weather events
    if not types_filter or "space_weather" in types_filter:
        try:
            stmt = text("""
                SELECT id, event_type, severity, start_time, kp_index
                FROM space_weather_events
                WHERE start_time >= :start_dt
                  AND start_time <= :end_dt
                ORDER BY start_time DESC
            """)
            result = await db.execute(stmt, {
                "start_dt": start_dt,
                "end_dt": end_dt,
            })
            rows = result.fetchall()
            
            for row in rows:
                events.append(TimelineEvent(
                    id=f"spaceweather-{row.id}",
                    type="space_weather",
                    title=f"Space Weather: {row.event_type}",
                    time=row.start_time,
                    severity=row.severity,
                    details=f"Kp index: {row.kp_index}" if row.kp_index else None,
                ))
        except Exception as e:
            print(f"Error fetching space weather: {e}")
    
    # Fetch ingestion events (simulated - would come from actual ingestion logs)
    if not types_filter or "ingestion" in types_filter:
        # This would typically be from an ingestion_events table
        # For now, return sample data structure
        pass
    
    # Sort by time
    events.sort(key=lambda e: e.time, reverse=True)
    
    return {
        "date": date.isoformat(),
        "events": [e.to_dict() for e in events],
        "count": len(events),
    }


@router.get("/events/range")
async def get_timeline_events_range(
    user: Annotated[TokenData, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    start_date: date = Query(..., description="Start date (YYYY-MM-DD)"),
    end_date: date = Query(..., description="End date (YYYY-MM-DD)"),
):
    """Get events for a date range."""
    events: List[TimelineEvent] = []
    
    start_dt = datetime.combine(start_date, datetime.min.time())
    end_dt = datetime.combine(end_date, datetime.max.time())
    
    # Fetch incidents
    try:
        stmt = text("""
            SELECT id, title, incident_type, severity, detected_at
            FROM incidents
            WHERE tenant_id = :tenant_id
              AND detected_at >= :start_dt
              AND detected_at <= :end_dt
            ORDER BY detected_at DESC
        """)
        result = await db.execute(stmt, {
            "tenant_id": user.tenant_id,
            "start_dt": start_dt,
            "end_dt": end_dt,
        })
        rows = result.fetchall()
        
        for row in rows:
            events.append(TimelineEvent(
                id=f"incident-{row.id}",
                type="incident",
                title=row.title,
                time=row.detected_at,
                severity=row.severity,
                details=row.incident_type,
            ))
    except Exception as e:
        print(f"Error fetching incidents: {e}")
    
    # Fetch conjunctions
    try:
        stmt = text("""
            SELECT id, primary_object_id, secondary_object_id, tca, risk_level
            FROM conjunctions
            WHERE tenant_id = :tenant_id
              AND tca >= :start_dt
              AND tca <= :end_dt
            ORDER BY tca ASC
        """)
        result = await db.execute(stmt, {
            "tenant_id": user.tenant_id,
            "start_dt": start_dt,
            "end_dt": end_dt,
        })
        rows = result.fetchall()
        
        for row in rows:
            events.append(TimelineEvent(
                id=f"conjunction-{row.id}",
                type="conjunction",
                title=f"{row.primary_object_id} / {row.secondary_object_id}",
                time=row.tca,
                severity=row.risk_level,
            ))
    except Exception as e:
        print(f"Error fetching conjunctions: {e}")
    
    # Sort by time
    events.sort(key=lambda e: e.time, reverse=True)
    
    return {
        "start_date": start_date.isoformat(),
        "end_date": end_date.isoformat(),
        "events": [e.to_dict() for e in events],
        "count": len(events),
    }


@router.get("/summary")
async def get_timeline_summary(
    user: Annotated[TokenData, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    days: int = Query(7, ge=1, le=90, description="Number of days to summarize"),
):
    """Get summary of events for the past N days."""
    end_dt = datetime.utcnow()
    start_dt = end_dt - timedelta(days=days)
    
    summary = {
        "period": {
            "start": start_dt.isoformat(),
            "end": end_dt.isoformat(),
        },
        "incidents": {"total": 0, "by_severity": {}},
        "conjunctions": {"total": 0, "by_risk": {}},
    }
    
    # Incident summary
    try:
        stmt = text("""
            SELECT severity, COUNT(*) as count
            FROM incidents
            WHERE tenant_id = :tenant_id
              AND detected_at >= :start_dt
              AND detected_at <= :end_dt
            GROUP BY severity
        """)
        result = await db.execute(stmt, {
            "tenant_id": user.tenant_id,
            "start_dt": start_dt,
            "end_dt": end_dt,
        })
        rows = result.fetchall()
        
        for row in rows:
            summary["incidents"]["by_severity"][row.severity] = row.count
            summary["incidents"]["total"] += row.count
    except Exception as e:
        print(f"Error fetching incident summary: {e}")
    
    # Conjunction summary
    try:
        stmt = text("""
            SELECT risk_level, COUNT(*) as count
            FROM conjunctions
            WHERE tenant_id = :tenant_id
              AND tca >= :start_dt
              AND tca <= :end_dt
            GROUP BY risk_level
        """)
        result = await db.execute(stmt, {
            "tenant_id": user.tenant_id,
            "start_dt": start_dt,
            "end_dt": end_dt,
        })
        rows = result.fetchall()
        
        for row in rows:
            summary["conjunctions"]["by_risk"][row.risk_level] = row.count
            summary["conjunctions"]["total"] += row.count
    except Exception as e:
        print(f"Error fetching conjunction summary: {e}")
    
    return summary
