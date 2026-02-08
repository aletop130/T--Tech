"""Data ingestion and lineage models."""
from datetime import datetime
from typing import Optional

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Enum as SQLEnum,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    JSON,
)
from sqlalchemy.orm import relationship
import enum

from app.db.base import Base, AuditMixin, generate_uuid


class IngestionStatus(str, enum.Enum):
    """Status of an ingestion run."""
    PENDING = "pending"
    UPLOADING = "uploading"
    PARSING = "parsing"
    VALIDATING = "validating"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"
    PARTIAL = "partial"


class DataSourceType(str, enum.Enum):
    """Type of data source."""
    TLE_FILE = "tle_file"
    OBSERVATIONS_JSON = "observations_json"
    SPACE_WEATHER_JSON = "space_weather_json"
    EPHEMERIS = "ephemeris"
    MANUAL = "manual"
    API = "api"


class QualityCheckType(str, enum.Enum):
    """Type of data quality check."""
    SCHEMA = "schema"
    NULL_CHECK = "null_check"
    RANGE_CHECK = "range_check"
    CONSISTENCY = "consistency"
    DUPLICATE = "duplicate"
    CUSTOM = "custom"


class QualityCheckStatus(str, enum.Enum):
    """Status of a quality check."""
    PASSED = "passed"
    FAILED = "failed"
    WARNING = "warning"
    SKIPPED = "skipped"


class IngestionRun(Base, AuditMixin):
    """Record of a data ingestion run."""
    __tablename__ = "ingestion_runs"
    
    id = Column(String(50), primary_key=True, default=generate_uuid)
    
    # Source info
    source_type = Column(SQLEnum(DataSourceType), nullable=False)
    source_name = Column(String(200), nullable=False)
    source_path = Column(String(500), nullable=True)  # MinIO path
    
    # Status
    status = Column(
        SQLEnum(IngestionStatus), default=IngestionStatus.PENDING
    )
    error_message = Column(Text, nullable=True)
    
    # Timing
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    
    # Statistics
    records_total = Column(Integer, default=0)
    records_processed = Column(Integer, default=0)
    records_failed = Column(Integer, default=0)
    records_skipped = Column(Integer, default=0)
    
    # Lineage
    parent_run_id = Column(String(50), nullable=True)
    pipeline_name = Column(String(100), nullable=True)
    pipeline_version = Column(String(20), nullable=True)
    
    # Processing details
    processing_config = Column(JSON, default=dict)
    output_tables = Column(JSON, default=list)  # Tables affected
    
    # Relationships
    quality_checks = relationship(
        "DataQualityCheck",
        back_populates="ingestion_run",
        cascade="all, delete-orphan"
    )


class DataQualityCheck(Base, AuditMixin):
    """Data quality check result."""
    __tablename__ = "data_quality_checks"
    
    id = Column(String(50), primary_key=True, default=generate_uuid)
    ingestion_run_id = Column(
        String(50), ForeignKey("ingestion_runs.id"), nullable=False
    )
    
    # Check definition
    check_type = Column(SQLEnum(QualityCheckType), nullable=False)
    check_name = Column(String(100), nullable=False)
    check_description = Column(String(500), nullable=True)
    
    # Target
    target_table = Column(String(100), nullable=True)
    target_column = Column(String(100), nullable=True)
    
    # Result
    status = Column(SQLEnum(QualityCheckStatus), nullable=False)
    
    # Metrics
    records_checked = Column(Integer, default=0)
    records_passed = Column(Integer, default=0)
    records_failed = Column(Integer, default=0)
    pass_rate = Column(Float, default=0.0)
    
    # Details
    failure_samples = Column(JSON, default=list)  # Sample of failed records
    check_parameters = Column(JSON, default=dict)
    
    ingestion_run = relationship("IngestionRun", back_populates="quality_checks")

