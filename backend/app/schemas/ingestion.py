"""Ingestion Pydantic schemas."""
from datetime import datetime
from typing import Any, Optional

from pydantic import Field

from app.schemas.common import AuditSchema, BaseSchema
from app.db.models.ingestion import (
    IngestionStatus,
    DataSourceType,
    QualityCheckType,
    QualityCheckStatus,
)


class IngestionRunBase(BaseSchema):
    """Ingestion run base fields."""
    source_type: DataSourceType
    source_name: str = Field(..., max_length=200)
    pipeline_name: Optional[str] = Field(None, max_length=100)
    processing_config: dict[str, Any] = Field(default_factory=dict)


class IngestionRunCreate(IngestionRunBase):
    """Schema for creating an ingestion run."""
    pass


class IngestionRunResponse(IngestionRunBase, AuditSchema):
    """Ingestion run response schema."""
    id: str
    source_path: Optional[str] = None
    status: IngestionStatus
    error_message: Optional[str] = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    records_total: int = 0
    records_processed: int = 0
    records_failed: int = 0
    records_skipped: int = 0
    output_tables: list[str] = Field(default_factory=list)


class QualityCheckResponse(BaseSchema):
    """Quality check response schema."""
    id: str
    check_type: QualityCheckType
    check_name: str
    check_description: Optional[str] = None
    target_table: Optional[str] = None
    target_column: Optional[str] = None
    status: QualityCheckStatus
    records_checked: int = 0
    records_passed: int = 0
    records_failed: int = 0
    pass_rate: float = 0.0
    failure_samples: list[dict] = Field(default_factory=list)


class IngestionRunDetail(IngestionRunResponse):
    """Ingestion run with quality checks."""
    quality_checks: list[QualityCheckResponse] = Field(default_factory=list)
    parent_run_id: Optional[str] = None
    pipeline_version: Optional[str] = None


class UploadResponse(BaseSchema):
    """File upload response."""
    run_id: str
    filename: str
    file_size: int
    minio_path: str
    status: IngestionStatus


class IngestionStats(BaseSchema):
    """Ingestion statistics."""
    total_runs: int = 0
    completed_runs: int = 0
    failed_runs: int = 0
    by_source_type: dict[str, int] = Field(default_factory=dict)
    total_records_processed: int = 0
    avg_pass_rate: float = 0.0

