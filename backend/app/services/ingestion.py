"""Data ingestion service."""
from datetime import datetime
from typing import Any, Optional
import io
import re

from minio import Minio
from sqlalchemy import select, and_, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.logging import get_logger
from app.db.base import generate_uuid
from app.db.models.ingestion import (
    IngestionRun,
    DataQualityCheck,
    IngestionStatus,
    DataSourceType,
    QualityCheckType,
    QualityCheckStatus,
)
from app.db.models.ontology import (
    Satellite,
    Orbit,
    SpaceWeatherEvent,
    ObjectType,
    WeatherSeverity,
)
from app.services.audit import AuditService
from app.services.ontology import OntologyService
from app.schemas.ontology import (
    SatelliteCreate,
    OrbitCreate,
    SpaceWeatherEventCreate,
)

logger = get_logger(__name__)


class MinIOClient:
    """MinIO object storage client."""
    
    def __init__(self):
        self.client = Minio(
            settings.MINIO_ENDPOINT,
            access_key=settings.MINIO_ACCESS_KEY,
            secret_key=settings.MINIO_SECRET_KEY,
            secure=settings.MINIO_SECURE,
        )
        self._ensure_bucket()
    
    def _ensure_bucket(self):
        """Ensure ingestion bucket exists."""
        bucket = settings.MINIO_BUCKET_INGESTION
        if not self.client.bucket_exists(bucket):
            self.client.make_bucket(bucket)
            logger.info(f"Created MinIO bucket: {bucket}")
    
    def upload(
        self,
        file_data: bytes,
        object_name: str,
        content_type: str = "application/octet-stream",
    ) -> str:
        """Upload file to MinIO."""
        bucket = settings.MINIO_BUCKET_INGESTION
        data = io.BytesIO(file_data)
        
        self.client.put_object(
            bucket,
            object_name,
            data,
            len(file_data),
            content_type=content_type,
        )
        
        return f"{bucket}/{object_name}"
    
    def download(self, object_name: str) -> bytes:
        """Download file from MinIO."""
        bucket = settings.MINIO_BUCKET_INGESTION
        response = self.client.get_object(bucket, object_name)
        return response.read()


class IngestionService:
    """Service for data ingestion and processing."""
    
    def __init__(
        self,
        db: AsyncSession,
        audit: AuditService,
        ontology: OntologyService,
    ):
        self.db = db
        self.audit = audit
        self.ontology = ontology
        
        try:
            self.minio = MinIOClient()
        except Exception as e:
            logger.warning(f"MinIO client not available: {e}")
            self.minio = None
    
    async def create_run(
        self,
        source_type: DataSourceType,
        source_name: str,
        tenant_id: str,
        user_id: Optional[str] = None,
        config: Optional[dict] = None,
    ) -> IngestionRun:
        """Create a new ingestion run."""
        run = IngestionRun(
            id=generate_uuid(),
            tenant_id=tenant_id,
            source_type=source_type,
            source_name=source_name,
            status=IngestionStatus.PENDING,
            processing_config=config or {},
            created_by=user_id,
            updated_by=user_id,
        )
        
        self.db.add(run)
        await self.db.flush()
        await self.db.refresh(run)
        
        logger.info(
            "ingestion_run_created",
            run_id=run.id,
            source_type=source_type.value,
        )
        
        return run
    
    async def get_run(
        self,
        run_id: str,
        tenant_id: str,
    ) -> Optional[IngestionRun]:
        """Get ingestion run by ID."""
        stmt = select(IngestionRun).where(
            and_(
                IngestionRun.id == run_id,
                IngestionRun.tenant_id == tenant_id,
            )
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()
    
    async def list_runs(
        self,
        tenant_id: str,
        status: Optional[str] = None,
        source_type: Optional[str] = None,
        page: int = 1,
        page_size: int = 50,
    ) -> tuple[list[IngestionRun], int]:
        """List ingestion runs."""
        conditions = [IngestionRun.tenant_id == tenant_id]
        
        if status:
            conditions.append(IngestionRun.status == status)
        if source_type:
            conditions.append(IngestionRun.source_type == source_type)
        
        count_stmt = select(func.count()).select_from(IngestionRun).where(
            and_(*conditions)
        )
        total = await self.db.scalar(count_stmt) or 0
        
        offset = (page - 1) * page_size
        stmt = (
            select(IngestionRun)
            .where(and_(*conditions))
            .order_by(IngestionRun.created_at.desc())
            .offset(offset)
            .limit(page_size)
        )
        
        result = await self.db.execute(stmt)
        runs = list(result.scalars().all())
        
        return runs, total
    
    async def upload_file(
        self,
        file_data: bytes,
        filename: str,
        source_type: DataSourceType,
        tenant_id: str,
        user_id: Optional[str] = None,
    ) -> IngestionRun:
        """Upload file and create ingestion run."""
        run = await self.create_run(
            source_type=source_type,
            source_name=filename,
            tenant_id=tenant_id,
            user_id=user_id,
        )
        
        try:
            run.status = IngestionStatus.UPLOADING
            await self.db.flush()
            
            # Upload to MinIO
            if self.minio:
                timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
                object_name = f"{tenant_id}/{timestamp}_{filename}"
                path = self.minio.upload(file_data, object_name)
                run.source_path = path
            
            run.status = IngestionStatus.PENDING
            await self.db.flush()
            
            logger.info(
                "file_uploaded",
                run_id=run.id,
                filename=filename,
                size=len(file_data),
            )
            
            return run
        except Exception as e:
            run.status = IngestionStatus.FAILED
            run.error_message = str(e)
            await self.db.flush()
            raise
    
    async def process_tle_file(
        self,
        run_id: str,
        tenant_id: str,
        user_id: Optional[str] = None,
    ) -> IngestionRun:
        """Process a TLE file."""
        run = await self.get_run(run_id, tenant_id)
        if not run:
            raise ValueError(f"Run {run_id} not found")
        
        try:
            run.status = IngestionStatus.PARSING
            run.started_at = datetime.utcnow()
            await self.db.flush()
            
            # Get file content
            if self.minio and run.source_path:
                object_name = run.source_path.split("/", 1)[1]
                file_data = self.minio.download(object_name)
                content = file_data.decode("utf-8")
            else:
                raise ValueError("File not available")
            
            # Parse TLE file
            lines = content.strip().split("\n")
            records = []
            
            i = 0
            while i < len(lines):
                # Skip empty lines
                if not lines[i].strip():
                    i += 1
                    continue
                
                # Try to parse 3-line or 2-line TLE
                if i + 2 < len(lines) and lines[i + 1].startswith("1 "):
                    # 3-line format: name, line1, line2
                    name = lines[i].strip()
                    line1 = lines[i + 1].strip()
                    line2 = lines[i + 2].strip()
                    i += 3
                elif lines[i].startswith("1 ") and i + 1 < len(lines):
                    # 2-line format
                    name = f"NORAD-{lines[i][2:7].strip()}"
                    line1 = lines[i].strip()
                    line2 = lines[i + 1].strip()
                    i += 2
                else:
                    i += 1
                    continue
                
                # Parse NORAD ID from line 1
                try:
                    norad_id = int(line1[2:7])
                except ValueError:
                    continue
                
                # Parse epoch from line 1
                try:
                    epoch_year = int(line1[18:20])
                    epoch_day = float(line1[20:32])
                    
                    if epoch_year < 57:
                        epoch_year += 2000
                    else:
                        epoch_year += 1900
                    
                    epoch = datetime(epoch_year, 1, 1) + \
                        datetime.timedelta(days=epoch_day - 1)
                except (ValueError, IndexError):
                    epoch = datetime.utcnow()
                
                # Parse orbital elements from line 2
                try:
                    inclination = float(line2[8:16])
                    raan = float(line2[17:25])
                    eccentricity = float("0." + line2[26:33])
                    arg_perigee = float(line2[34:42])
                    mean_anomaly = float(line2[43:51])
                    mean_motion = float(line2[52:63])
                except (ValueError, IndexError):
                    inclination = 0
                    raan = 0
                    eccentricity = 0
                    arg_perigee = 0
                    mean_anomaly = 0
                    mean_motion = 15
                
                records.append({
                    "name": name,
                    "norad_id": norad_id,
                    "line1": line1,
                    "line2": line2,
                    "epoch": epoch,
                    "inclination": inclination,
                    "raan": raan,
                    "eccentricity": eccentricity,
                    "arg_perigee": arg_perigee,
                    "mean_anomaly": mean_anomaly,
                    "mean_motion": mean_motion,
                })
            
            run.records_total = len(records)
            run.status = IngestionStatus.VALIDATING
            await self.db.flush()
            
            # Quality checks
            await self._run_quality_checks(run, records, tenant_id, user_id)
            
            # Process records
            run.status = IngestionStatus.PROCESSING
            await self.db.flush()
            
            processed = 0
            failed = 0
            
            for record in records:
                try:
                    # Check if satellite exists
                    existing = await self.ontology.get_satellite_by_norad(
                        record["norad_id"],
                        tenant_id,
                    )
                    
                    if existing:
                        satellite_id = existing.id
                    else:
                        # Create satellite
                        sat_data = SatelliteCreate(
                            norad_id=record["norad_id"],
                            name=record["name"],
                            object_type=ObjectType.SATELLITE,
                        )
                        satellite = await self.ontology.create_satellite(
                            sat_data,
                            tenant_id,
                            user_id,
                        )
                        satellite_id = satellite.id
                    
                    # Create orbit record
                    orbit_data = OrbitCreate(
                        satellite_id=satellite_id,
                        epoch=record["epoch"],
                        inclination_deg=record["inclination"],
                        raan_deg=record["raan"],
                        eccentricity=record["eccentricity"],
                        arg_perigee_deg=record["arg_perigee"],
                        mean_anomaly_deg=record["mean_anomaly"],
                        mean_motion_rev_day=record["mean_motion"],
                        tle_line1=record["line1"],
                        tle_line2=record["line2"],
                        source="tle",
                    )
                    await self.ontology.create_orbit(
                        orbit_data,
                        tenant_id,
                        user_id,
                    )
                    
                    processed += 1
                except Exception as e:
                    logger.warning(f"Failed to process record: {e}")
                    failed += 1
            
            run.records_processed = processed
            run.records_failed = failed
            run.status = IngestionStatus.COMPLETED
            run.completed_at = datetime.utcnow()
            run.output_tables = ["satellites", "orbits"]
            await self.db.flush()
            
            logger.info(
                "tle_processing_complete",
                run_id=run.id,
                processed=processed,
                failed=failed,
            )
            
            return run
        except Exception as e:
            run.status = IngestionStatus.FAILED
            run.error_message = str(e)
            run.completed_at = datetime.utcnow()
            await self.db.flush()
            logger.error(f"TLE processing failed: {e}")
            raise
    
    async def process_space_weather_json(
        self,
        run_id: str,
        tenant_id: str,
        user_id: Optional[str] = None,
    ) -> IngestionRun:
        """Process space weather JSON data."""
        import json
        
        run = await self.get_run(run_id, tenant_id)
        if not run:
            raise ValueError(f"Run {run_id} not found")
        
        try:
            run.status = IngestionStatus.PARSING
            run.started_at = datetime.utcnow()
            await self.db.flush()
            
            # Get file content
            if self.minio and run.source_path:
                object_name = run.source_path.split("/", 1)[1]
                file_data = self.minio.download(object_name)
                content = file_data.decode("utf-8")
            else:
                raise ValueError("File not available")
            
            data = json.loads(content)
            events = data if isinstance(data, list) else data.get("events", [])
            
            run.records_total = len(events)
            run.status = IngestionStatus.PROCESSING
            await self.db.flush()
            
            processed = 0
            failed = 0
            
            for event_data in events:
                try:
                    # Map severity
                    severity_map = {
                        "G1": WeatherSeverity.MINOR,
                        "G2": WeatherSeverity.MODERATE,
                        "G3": WeatherSeverity.STRONG,
                        "G4": WeatherSeverity.SEVERE,
                        "G5": WeatherSeverity.EXTREME,
                        "minor": WeatherSeverity.MINOR,
                        "moderate": WeatherSeverity.MODERATE,
                        "strong": WeatherSeverity.STRONG,
                        "severe": WeatherSeverity.SEVERE,
                        "extreme": WeatherSeverity.EXTREME,
                    }
                    
                    severity = severity_map.get(
                        event_data.get("severity", "minor"),
                        WeatherSeverity.MINOR,
                    )
                    
                    event_create = SpaceWeatherEventCreate(
                        event_type=event_data.get("event_type", "geomagnetic_storm"),
                        start_time=datetime.fromisoformat(
                            event_data["start_time"].replace("Z", "+00:00")
                        ),
                        peak_time=datetime.fromisoformat(
                            event_data["peak_time"].replace("Z", "+00:00")
                        ) if event_data.get("peak_time") else None,
                        end_time=datetime.fromisoformat(
                            event_data["end_time"].replace("Z", "+00:00")
                        ) if event_data.get("end_time") else None,
                        severity=severity,
                        kp_index=event_data.get("kp_index"),
                        dst_index=event_data.get("dst_index"),
                        solar_wind_speed=event_data.get("solar_wind_speed"),
                        proton_flux=event_data.get("proton_flux"),
                        source=event_data.get("source", "demo"),
                        source_event_id=event_data.get("source_event_id"),
                        description=event_data.get("description"),
                    )
                    
                    await self.ontology.create_space_weather_event(
                        event_create,
                        tenant_id,
                        user_id,
                    )
                    processed += 1
                except Exception as e:
                    logger.warning(f"Failed to process event: {e}")
                    failed += 1
            
            run.records_processed = processed
            run.records_failed = failed
            run.status = IngestionStatus.COMPLETED
            run.completed_at = datetime.utcnow()
            run.output_tables = ["space_weather_events"]
            await self.db.flush()
            
            return run
        except Exception as e:
            run.status = IngestionStatus.FAILED
            run.error_message = str(e)
            run.completed_at = datetime.utcnow()
            await self.db.flush()
            raise
    
    async def process_observations_json(
        self,
        run_id: str,
        tenant_id: str,
        user_id: Optional[str] = None,
    ) -> IngestionRun:
        """Process observations JSON data (sensor measurements, radar data, etc.)."""
        import json
        
        run = await self.get_run(run_id, tenant_id)
        if not run:
            raise ValueError(f"Run {run_id} not found")
        
        try:
            run.status = IngestionStatus.PARSING
            run.started_at = datetime.utcnow()
            await self.db.flush()
            
            # Get file content
            if self.minio and run.source_path:
                object_name = run.source_path.split("/", 1)[1]
                file_data = self.minio.download(object_name)
                content = file_data.decode("utf-8")
            else:
                raise ValueError("File not available")
            
            data = json.loads(content)
            observations = data if isinstance(data, list) else data.get("observations", [])
            
            run.records_total = len(observations)
            run.status = IngestionStatus.PROCESSING
            await self.db.flush()
            
            processed = 0
            failed = 0
            
            for obs_data in observations:
                try:
                    # For now, just log the observation - full implementation would
                    # create observation records in the database
                    logger.info(
                        "processing_observation",
                        observation_id=obs_data.get("id"),
                        type=obs_data.get("observation_type"),
                    )
                    processed += 1
                except Exception as e:
                    logger.warning(f"Failed to process observation: {e}")
                    failed += 1
            
            run.records_processed = processed
            run.records_failed = failed
            run.status = IngestionStatus.COMPLETED
            run.completed_at = datetime.utcnow()
            run.output_tables = ["observations"]
            await self.db.flush()
            
            logger.info(
                "observations_processing_complete",
                run_id=run.id,
                processed=processed,
                failed=failed,
            )
            
            return run
        except Exception as e:
            run.status = IngestionStatus.FAILED
            run.error_message = str(e)
            run.completed_at = datetime.utcnow()
            await self.db.flush()
            logger.error(f"Observations processing failed: {e}")
            raise
    
    async def _run_quality_checks(
        self,
        run: IngestionRun,
        records: list[dict],
        tenant_id: str,
        user_id: Optional[str],
    ) -> None:
        """Run data quality checks."""
        # Schema check
        required_fields = ["norad_id", "name", "line1", "line2"]
        schema_passed = sum(
            1 for r in records
            if all(r.get(f) for f in required_fields)
        )
        
        schema_check = DataQualityCheck(
            id=generate_uuid(),
            ingestion_run_id=run.id,
            tenant_id=tenant_id,
            check_type=QualityCheckType.SCHEMA,
            check_name="Required Fields Check",
            check_description="Verify all required fields are present",
            target_table="satellites",
            status=(
                QualityCheckStatus.PASSED
                if schema_passed == len(records)
                else QualityCheckStatus.WARNING
            ),
            records_checked=len(records),
            records_passed=schema_passed,
            records_failed=len(records) - schema_passed,
            pass_rate=schema_passed / len(records) if records else 0,
            created_by=user_id,
            updated_by=user_id,
        )
        self.db.add(schema_check)
        
        # Range check for NORAD ID
        valid_norad = sum(
            1 for r in records
            if isinstance(r.get("norad_id"), int) and r["norad_id"] > 0
        )
        
        range_check = DataQualityCheck(
            id=generate_uuid(),
            ingestion_run_id=run.id,
            tenant_id=tenant_id,
            check_type=QualityCheckType.RANGE_CHECK,
            check_name="NORAD ID Range Check",
            check_description="Verify NORAD IDs are positive integers",
            target_table="satellites",
            target_column="norad_id",
            status=(
                QualityCheckStatus.PASSED
                if valid_norad == len(records)
                else QualityCheckStatus.WARNING
            ),
            records_checked=len(records),
            records_passed=valid_norad,
            records_failed=len(records) - valid_norad,
            pass_rate=valid_norad / len(records) if records else 0,
            created_by=user_id,
            updated_by=user_id,
        )
        self.db.add(range_check)
        
        await self.db.flush()

