"""Audit Pydantic schemas."""
from datetime import datetime
from typing import Any, Optional

from pydantic import Field

from app.schemas.common import BaseSchema


class AuditEventResponse(BaseSchema):
    """Audit event response schema."""
    id: str
    timestamp: datetime
    user_id: Optional[str] = None
    tenant_id: str
    action: str
    entity_type: str
    entity_id: str
    before: Optional[dict[str, Any]] = None
    after: Optional[dict[str, Any]] = None
    changed_fields: Optional[list[str]] = None
    ip_address: Optional[str] = None
    user_agent: Optional[str] = None
    request_id: Optional[str] = None
    extra_data: dict[str, Any] = Field(default_factory=dict)


class AuditQuery(BaseSchema):
    """Audit query parameters."""
    entity_type: Optional[str] = None
    entity_id: Optional[str] = None
    user_id: Optional[str] = None
    action: Optional[str] = None
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    page: int = 1
    page_size: int = 50

