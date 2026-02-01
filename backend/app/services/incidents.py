"""Incident management service."""
from datetime import datetime
from typing import Optional

from sqlalchemy import select, and_, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db.models.incidents import (
    Incident,
    IncidentComment,
    IncidentStatus,
    IncidentSeverity,
)
from app.db.base import generate_uuid
from app.schemas.incidents import (
    IncidentCreate,
    IncidentUpdate,
    IncidentStatusUpdate,
    IncidentAssignment,
    CommentCreate,
    IncidentStats,
)
from app.services.audit import AuditService
from app.core.logging import get_logger
from app.core.exceptions import NotFoundError

logger = get_logger(__name__)


class IncidentService:
    """Service for incident management."""
    
    def __init__(self, db: AsyncSession, audit: AuditService):
        self.db = db
        self.audit = audit
    
    async def create_incident(
        self,
        data: IncidentCreate,
        tenant_id: str,
        user_id: Optional[str] = None,
    ) -> Incident:
        """Create a new incident."""
        incident = Incident(
            id=generate_uuid(),
            tenant_id=tenant_id,
            created_by=user_id,
            updated_by=user_id,
            **data.model_dump(),
        )
        
        self.db.add(incident)
        await self.db.flush()
        await self.db.refresh(incident)
        
        await self.audit.log(
            action="create",
            entity_type="incidents",
            entity_id=incident.id,
            tenant_id=tenant_id,
            user_id=user_id,
            after=self._incident_to_dict(incident),
        )
        
        logger.info(
            "incident_created",
            incident_id=incident.id,
            incident_type=incident.incident_type.value,
            severity=incident.severity.value,
        )
        
        return incident
    
    async def get_incident(
        self,
        incident_id: str,
        tenant_id: str,
    ) -> Optional[Incident]:
        """Get incident by ID with comments."""
        stmt = (
            select(Incident)
            .options(selectinload(Incident.comments))
            .where(
                and_(
                    Incident.id == incident_id,
                    Incident.tenant_id == tenant_id,
                )
            )
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()
    
    async def list_incidents(
        self,
        tenant_id: str,
        status: Optional[str] = None,
        severity: Optional[str] = None,
        incident_type: Optional[str] = None,
        assigned_to: Optional[str] = None,
        page: int = 1,
        page_size: int = 50,
    ) -> tuple[list[Incident], int]:
        """List incidents with filters."""
        conditions = [Incident.tenant_id == tenant_id]
        
        if status:
            conditions.append(Incident.status == status)
        if severity:
            conditions.append(Incident.severity == severity)
        if incident_type:
            conditions.append(Incident.incident_type == incident_type)
        if assigned_to:
            conditions.append(Incident.assigned_to == assigned_to)
        
        count_stmt = select(func.count()).select_from(Incident).where(
            and_(*conditions)
        )
        total = await self.db.scalar(count_stmt) or 0
        
        offset = (page - 1) * page_size
        stmt = (
            select(Incident)
            .where(and_(*conditions))
            .order_by(Incident.priority.desc(), Incident.created_at.desc())
            .offset(offset)
            .limit(page_size)
        )
        
        result = await self.db.execute(stmt)
        incidents = list(result.scalars().all())
        
        return incidents, total
    
    async def update_incident(
        self,
        incident_id: str,
        data: IncidentUpdate,
        tenant_id: str,
        user_id: Optional[str] = None,
    ) -> Incident:
        """Update an incident."""
        incident = await self.get_incident(incident_id, tenant_id)
        if not incident:
            raise NotFoundError("Incident", incident_id)
        
        before = self._incident_to_dict(incident)
        
        update_data = data.model_dump(exclude_unset=True)
        for key, value in update_data.items():
            if value is not None:
                setattr(incident, key, value)
        
        incident.updated_by = user_id
        incident.updated_at = datetime.utcnow()
        
        await self.db.flush()
        await self.db.refresh(incident)
        
        await self.audit.log(
            action="update",
            entity_type="incidents",
            entity_id=incident.id,
            tenant_id=tenant_id,
            user_id=user_id,
            before=before,
            after=self._incident_to_dict(incident),
        )
        
        return incident
    
    async def update_status(
        self,
        incident_id: str,
        data: IncidentStatusUpdate,
        tenant_id: str,
        user_id: Optional[str] = None,
    ) -> Incident:
        """Update incident status."""
        incident = await self.get_incident(incident_id, tenant_id)
        if not incident:
            raise NotFoundError("Incident", incident_id)
        
        old_status = incident.status
        incident.status = data.status
        incident.updated_by = user_id
        incident.updated_at = datetime.utcnow()
        
        # Update timing fields
        if data.status == IncidentStatus.INVESTIGATING:
            if not incident.acknowledged_at:
                incident.acknowledged_at = datetime.utcnow()
        elif data.status in [IncidentStatus.RESOLVED, IncidentStatus.CLOSED]:
            if not incident.resolved_at:
                incident.resolved_at = datetime.utcnow()
        
        # Add status change comment
        if data.comment:
            comment = IncidentComment(
                id=generate_uuid(),
                incident_id=incident.id,
                tenant_id=tenant_id,
                content=data.comment,
                comment_type="status_change",
                action_type="status_change",
                action_data={
                    "old_status": old_status.value,
                    "new_status": data.status.value,
                },
                created_by=user_id,
                updated_by=user_id,
            )
            self.db.add(comment)
        
        await self.db.flush()
        await self.db.refresh(incident)
        
        await self.audit.log(
            action="update",
            entity_type="incidents",
            entity_id=incident.id,
            tenant_id=tenant_id,
            user_id=user_id,
            metadata={
                "status_change": {
                    "from": old_status.value,
                    "to": data.status.value,
                }
            },
        )
        
        return incident
    
    async def assign_incident(
        self,
        incident_id: str,
        data: IncidentAssignment,
        tenant_id: str,
        user_id: Optional[str] = None,
    ) -> Incident:
        """Assign incident to user/team."""
        incident = await self.get_incident(incident_id, tenant_id)
        if not incident:
            raise NotFoundError("Incident", incident_id)
        
        old_assigned = incident.assigned_to
        incident.assigned_to = data.assigned_to
        incident.assigned_team = data.assigned_team
        incident.updated_by = user_id
        incident.updated_at = datetime.utcnow()
        
        # Add assignment comment
        if data.comment:
            comment = IncidentComment(
                id=generate_uuid(),
                incident_id=incident.id,
                tenant_id=tenant_id,
                content=data.comment,
                comment_type="assignment",
                action_type="assignment",
                action_data={
                    "old_assigned": old_assigned,
                    "new_assigned": data.assigned_to,
                    "team": data.assigned_team,
                },
                created_by=user_id,
                updated_by=user_id,
            )
            self.db.add(comment)
        
        await self.db.flush()
        await self.db.refresh(incident)
        
        return incident
    
    async def add_comment(
        self,
        incident_id: str,
        data: CommentCreate,
        tenant_id: str,
        user_id: Optional[str] = None,
    ) -> IncidentComment:
        """Add a comment to an incident."""
        incident = await self.get_incident(incident_id, tenant_id)
        if not incident:
            raise NotFoundError("Incident", incident_id)
        
        comment = IncidentComment(
            id=generate_uuid(),
            incident_id=incident.id,
            tenant_id=tenant_id,
            content=data.content,
            comment_type=data.comment_type,
            created_by=user_id,
            updated_by=user_id,
        )
        
        self.db.add(comment)
        await self.db.flush()
        await self.db.refresh(comment)
        
        return comment
    
    async def get_stats(self, tenant_id: str) -> IncidentStats:
        """Get incident statistics."""
        # Total count
        total = await self.db.scalar(
            select(func.count())
            .select_from(Incident)
            .where(Incident.tenant_id == tenant_id)
        ) or 0
        
        # By status
        status_stmt = (
            select(Incident.status, func.count())
            .where(Incident.tenant_id == tenant_id)
            .group_by(Incident.status)
        )
        status_result = await self.db.execute(status_stmt)
        by_status = {
            str(row[0].value): row[1]
            for row in status_result
        }
        
        # By severity
        severity_stmt = (
            select(Incident.severity, func.count())
            .where(Incident.tenant_id == tenant_id)
            .group_by(Incident.severity)
        )
        severity_result = await self.db.execute(severity_stmt)
        by_severity = {
            str(row[0].value): row[1]
            for row in severity_result
        }
        
        # By type
        type_stmt = (
            select(Incident.incident_type, func.count())
            .where(Incident.tenant_id == tenant_id)
            .group_by(Incident.incident_type)
        )
        type_result = await self.db.execute(type_stmt)
        by_type = {
            str(row[0].value): row[1]
            for row in type_result
        }
        
        # Open count
        open_count = by_status.get("open", 0) + by_status.get("investigating", 0)
        
        # Critical count
        critical_count = by_severity.get("critical", 0)
        
        return IncidentStats(
            total=total,
            by_status=by_status,
            by_severity=by_severity,
            by_type=by_type,
            open_count=open_count,
            critical_count=critical_count,
        )
    
    def _incident_to_dict(self, incident: Incident) -> dict:
        """Convert incident to dict for audit."""
        return {
            "id": incident.id,
            "title": incident.title,
            "incident_type": incident.incident_type.value,
            "severity": incident.severity.value,
            "status": incident.status.value,
            "assigned_to": incident.assigned_to,
            "priority": incident.priority,
        }

