"""Common Pydantic schemas."""
from datetime import datetime
from typing import Any, Generic, Optional, TypeVar

from pydantic import BaseModel, ConfigDict, Field


class BaseSchema(BaseModel):
    """Base schema with common config."""
    model_config = ConfigDict(
        from_attributes=True,
        populate_by_name=True,
        str_strip_whitespace=True,
    )


class TimestampSchema(BaseSchema):
    """Schema with timestamp fields."""
    created_at: datetime
    updated_at: datetime


class AuditSchema(TimestampSchema):
    """Schema with audit fields."""
    tenant_id: str
    created_by: Optional[str] = None
    updated_by: Optional[str] = None


T = TypeVar("T")


class PaginatedResponse(BaseSchema, Generic[T]):
    """Paginated response wrapper."""
    items: list[T]
    total: int
    page: int = 1
    page_size: int = 50
    pages: int = 1


class SearchQuery(BaseSchema):
    """Search query parameters."""
    query: str = ""
    filters: dict[str, Any] = Field(default_factory=dict)
    page: int = 1
    page_size: int = 50
    sort_by: str = "created_at"
    sort_order: str = "desc"


class HealthResponse(BaseSchema):
    """Health check response."""
    status: str = "healthy"
    version: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    services: dict[str, str] = Field(default_factory=dict)

