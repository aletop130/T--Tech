"""Ingestion API endpoints."""
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, Query, Path, UploadFile, File, Form

from app.api.deps import get_current_user, get_ingestion_service
from app.core.security import TokenData
from app.core.exceptions import NotFoundError
from app.services.ingestion import IngestionService
from app.db.models.ingestion import DataSourceType
from app.schemas.common import PaginatedResponse
from app.schemas.ingestion import (
    IngestionRunResponse,
    IngestionRunDetail,
    UploadResponse,
    IngestionStats,
)

router = APIRouter()


@router.get("/runs", response_model=PaginatedResponse[IngestionRunResponse])
async def list_ingestion_runs(
    user: Annotated[TokenData, Depends(get_current_user)],
    service: Annotated[IngestionService, Depends(get_ingestion_service)],
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    status: Optional[str] = Query(None),
    source_type: Optional[str] = Query(None),
):
    """List ingestion runs."""
    runs, total = await service.list_runs(
        tenant_id=user.tenant_id,
        status=status,
        source_type=source_type,
        page=page,
        page_size=page_size,
    )
    
    return PaginatedResponse(
        items=runs,
        total=total,
        page=page,
        page_size=page_size,
        pages=(total + page_size - 1) // page_size,
    )


@router.get("/runs/{run_id}", response_model=IngestionRunDetail)
async def get_ingestion_run(
    run_id: Annotated[str, Path()],
    user: Annotated[TokenData, Depends(get_current_user)],
    service: Annotated[IngestionService, Depends(get_ingestion_service)],
):
    """Get ingestion run by ID with quality checks."""
    run = await service.get_run(run_id, user.tenant_id)
    if not run:
        raise NotFoundError("IngestionRun", run_id)
    return run


@router.post("/upload/tle", response_model=UploadResponse, status_code=201)
async def upload_tle_file(
    file: Annotated[UploadFile, File()],
    user: Annotated[TokenData, Depends(get_current_user)],
    service: Annotated[IngestionService, Depends(get_ingestion_service)],
):
    """Upload and process a TLE file."""
    content = await file.read()
    
    run = await service.upload_file(
        file_data=content,
        filename=file.filename or "tle_upload.txt",
        source_type=DataSourceType.TLE_FILE,
        tenant_id=user.tenant_id,
        user_id=user.sub,
    )
    
    return UploadResponse(
        run_id=run.id,
        filename=file.filename or "tle_upload.txt",
        file_size=len(content),
        minio_path=run.source_path or "",
        status=run.status,
    )


@router.post("/process/tle/{run_id}", response_model=IngestionRunResponse)
async def process_tle_file(
    run_id: Annotated[str, Path()],
    user: Annotated[TokenData, Depends(get_current_user)],
    service: Annotated[IngestionService, Depends(get_ingestion_service)],
):
    """Process an uploaded TLE file."""
    return await service.process_tle_file(
        run_id=run_id,
        tenant_id=user.tenant_id,
        user_id=user.sub,
    )


@router.post(
    "/upload/space-weather",
    response_model=UploadResponse,
    status_code=201
)
async def upload_space_weather_file(
    file: Annotated[UploadFile, File()],
    user: Annotated[TokenData, Depends(get_current_user)],
    service: Annotated[IngestionService, Depends(get_ingestion_service)],
):
    """Upload space weather JSON data."""
    content = await file.read()
    
    run = await service.upload_file(
        file_data=content,
        filename=file.filename or "space_weather.json",
        source_type=DataSourceType.SPACE_WEATHER_JSON,
        tenant_id=user.tenant_id,
        user_id=user.sub,
    )
    
    return UploadResponse(
        run_id=run.id,
        filename=file.filename or "space_weather.json",
        file_size=len(content),
        minio_path=run.source_path or "",
        status=run.status,
    )


@router.post(
    "/process/space-weather/{run_id}",
    response_model=IngestionRunResponse
)
async def process_space_weather_file(
    run_id: Annotated[str, Path()],
    user: Annotated[TokenData, Depends(get_current_user)],
    service: Annotated[IngestionService, Depends(get_ingestion_service)],
):
    """Process uploaded space weather data."""
    return await service.process_space_weather_json(
        run_id=run_id,
        tenant_id=user.tenant_id,
        user_id=user.sub,
    )

