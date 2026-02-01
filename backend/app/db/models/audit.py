"""Audit logging models."""
from datetime import datetime

from sqlalchemy import (
    Column,
    DateTime,
    Index,
    String,
    Text,
    JSON,
)

from app.db.base import Base, generate_uuid


class AuditEvent(Base):
    """Audit log entry for all write operations."""
    __tablename__ = "audit_events"
    
    id = Column(String(50), primary_key=True, default=generate_uuid)
    
    # When
    timestamp = Column(
        DateTime, default=datetime.utcnow, nullable=False, index=True
    )
    
    # Who
    user_id = Column(String(50), nullable=True, index=True)
    tenant_id = Column(String(50), nullable=False, index=True)
    
    # What
    action = Column(String(50), nullable=False, index=True)  # create/update/delete
    entity_type = Column(String(100), nullable=False, index=True)
    entity_id = Column(String(50), nullable=False, index=True)
    
    # Changes
    before = Column(JSON, nullable=True)
    after = Column(JSON, nullable=True)
    changed_fields = Column(JSON, nullable=True)  # List of changed field names
    
    # Context
    ip_address = Column(String(50), nullable=True)
    user_agent = Column(String(500), nullable=True)
    request_id = Column(String(50), nullable=True)
    
    # Additional data
    extra_data = Column(JSON, default=dict)
    
    __table_args__ = (
        Index("ix_audit_entity", "entity_type", "entity_id"),
        Index("ix_audit_tenant_time", "tenant_id", "timestamp"),
    )

