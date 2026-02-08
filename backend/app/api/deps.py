"""API dependencies."""
from typing import Annotated, Optional

from fastapi import Depends, Header, HTTPException, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.base import get_db
from app.core.security import decode_token, TokenData
from app.services.audit import AuditService
from app.services.ontology import OntologyService
from app.services.incidents import IncidentService
from app.services.analytics import ConjunctionAnalyzer, SpaceWeatherAnalyzer
from app.services.ingestion import IngestionService
from app.services.ai import AIService


security = HTTPBearer(auto_error=False)


async def get_current_user(
    credentials: Annotated[
        Optional[HTTPAuthorizationCredentials],
        Depends(security)
    ],
    x_tenant_id: Annotated[str, Header(alias="X-Tenant-ID")] = "default",
) -> TokenData:
    """Get current user from token or use default for demo."""
    if credentials:
        token_data = decode_token(credentials.credentials)
        if token_data:
            return token_data
    
    # Default user for demo
    return TokenData(
        sub="demo-user",
        tenant_id=x_tenant_id,
        roles=["admin", "analyst"],
    )


async def get_audit_service(
    db: Annotated[AsyncSession, Depends(get_db)],
) -> AuditService:
    """Get audit service instance."""
    return AuditService(db)


async def get_ontology_service(
    db: Annotated[AsyncSession, Depends(get_db)],
    audit: Annotated[AuditService, Depends(get_audit_service)],
) -> OntologyService:
    """Get ontology service instance."""
    return OntologyService(db, audit)


async def get_incident_service(
    db: Annotated[AsyncSession, Depends(get_db)],
    audit: Annotated[AuditService, Depends(get_audit_service)],
) -> IncidentService:
    """Get incident service instance."""
    return IncidentService(db, audit)


async def get_conjunction_analyzer(
    db: Annotated[AsyncSession, Depends(get_db)],
    audit: Annotated[AuditService, Depends(get_audit_service)],
) -> ConjunctionAnalyzer:
    """Get conjunction analyzer instance."""
    return ConjunctionAnalyzer(db, audit)


async def get_space_weather_analyzer(
    db: Annotated[AsyncSession, Depends(get_db)],
) -> SpaceWeatherAnalyzer:
    """Get space weather analyzer instance."""
    return SpaceWeatherAnalyzer(db)


async def get_ingestion_service(
    db: Annotated[AsyncSession, Depends(get_db)],
    audit: Annotated[AuditService, Depends(get_audit_service)],
    ontology: Annotated[OntologyService, Depends(get_ontology_service)],
) -> IngestionService:
    """Get ingestion service instance."""
    return IngestionService(db, audit, ontology)


async def get_ai_service(
    db: Annotated[AsyncSession, Depends(get_db)],
    ontology: Annotated[OntologyService, Depends(get_ontology_service)],
) -> AIService:
    """Get AI service instance."""
    return AIService(db, ontology)

