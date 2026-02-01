"""Audit logging service."""
from datetime import datetime
from typing import Any, Optional

from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models.audit import AuditEvent
from app.schemas.audit import AuditQuery
from app.core.logging import get_logger

logger = get_logger(__name__)


class AuditService:
    """Service for audit logging."""
    
    def __init__(self, db: AsyncSession):
        self.db = db
    
    async def log(
        self,
        action: str,
        entity_type: str,
        entity_id: str,
        tenant_id: str,
        user_id: Optional[str] = None,
        before: Optional[dict] = None,
        after: Optional[dict] = None,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
        request_id: Optional[str] = None,
        metadata: Optional[dict] = None,
    ) -> AuditEvent:
        """Log an audit event."""
        changed_fields = None
        if before and after:
            changed_fields = [
                k for k in set(before.keys()) | set(after.keys())
                if before.get(k) != after.get(k)
            ]
        
        event = AuditEvent(
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
            tenant_id=tenant_id,
            user_id=user_id,
            before=before,
            after=after,
            changed_fields=changed_fields,
            ip_address=ip_address,
            user_agent=user_agent,
            request_id=request_id,
            metadata=metadata or {},
        )
        
        self.db.add(event)
        await self.db.flush()
        
        logger.info(
            "audit_event",
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
            user_id=user_id,
            tenant_id=tenant_id,
        )
        
        return event
    
    async def query(
        self,
        tenant_id: str,
        query: AuditQuery,
    ) -> tuple[list[AuditEvent], int]:
        """Query audit events."""
        conditions = [AuditEvent.tenant_id == tenant_id]
        
        if query.entity_type:
            conditions.append(AuditEvent.entity_type == query.entity_type)
        if query.entity_id:
            conditions.append(AuditEvent.entity_id == query.entity_id)
        if query.user_id:
            conditions.append(AuditEvent.user_id == query.user_id)
        if query.action:
            conditions.append(AuditEvent.action == query.action)
        if query.start_time:
            conditions.append(AuditEvent.timestamp >= query.start_time)
        if query.end_time:
            conditions.append(AuditEvent.timestamp <= query.end_time)
        
        # Count total
        from sqlalchemy import func
        count_stmt = select(func.count()).select_from(AuditEvent).where(
            and_(*conditions)
        )
        total = await self.db.scalar(count_stmt) or 0
        
        # Get paginated results
        offset = (query.page - 1) * query.page_size
        stmt = (
            select(AuditEvent)
            .where(and_(*conditions))
            .order_by(AuditEvent.timestamp.desc())
            .offset(offset)
            .limit(query.page_size)
        )
        
        result = await self.db.execute(stmt)
        events = list(result.scalars().all())
        
        return events, total
    
    async def get_entity_history(
        self,
        tenant_id: str,
        entity_type: str,
        entity_id: str,
        limit: int = 100,
    ) -> list[AuditEvent]:
        """Get audit history for a specific entity."""
        stmt = (
            select(AuditEvent)
            .where(
                and_(
                    AuditEvent.tenant_id == tenant_id,
                    AuditEvent.entity_type == entity_type,
                    AuditEvent.entity_id == entity_id,
                )
            )
            .order_by(AuditEvent.timestamp.desc())
            .limit(limit)
        )
        
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

