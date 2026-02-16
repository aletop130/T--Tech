"""API dependencies."""
from typing import Annotated, Optional

from fastapi import Depends, Header, HTTPException, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.base import get_db
try:
    from app.core.security import decode_token, TokenData
except ImportError:  # pragma: no cover
    def decode_token(token: str):
        return None
    class TokenData:
        sub: str = ''
        tenant_id: str = ''
        roles: list[str] = []
from app.services.audit import AuditService
from app.services.ontology import OntologyService
from app.services.incidents import IncidentService
from app.services.analytics import ConjunctionAnalyzer, SpaceWeatherAnalyzer
from app.services.ingestion import IngestionService
try:
    from app.services.ai import AIService
except ImportError:  # pragma: no cover
    class AIService:
        pass


security = HTTPBearer(auto_error=False)


async def get_tenant_id(
    x_tenant_id: Annotated[str, Header(alias="X-Tenant-ID")] = "default",
) -> str:
    """Get tenant ID from header."""
    return x_tenant_id


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


async def get_operations_service(
    db: Annotated[AsyncSession, Depends(get_db)],
    audit: Annotated[AuditService, Depends(get_audit_service)],
):
    """Get operations service instance."""
    from app.services.operations import (
        RoutePlanningService, FormationService,
        CollisionDetectionService, OperationService,
        PositionTrackingService, CommunicationService
    )
    return RoutePlanningService(db, audit)


async def get_route_planning_service(
    db: Annotated[AsyncSession, Depends(get_db)],
    audit: Annotated[AuditService, Depends(get_audit_service)],
):
    """Get route planning service instance."""
    from app.services.operations import RoutePlanningService
    return RoutePlanningService(db, audit)


async def get_formation_service(
    db: Annotated[AsyncSession, Depends(get_db)],
    audit: Annotated[AuditService, Depends(get_audit_service)],
):
    """Get formation service instance."""
    from app.services.operations import FormationService
    return FormationService(db, audit)


async def get_collision_detection_service(
    db: Annotated[AsyncSession, Depends(get_db)],
    audit: Annotated[AuditService, Depends(get_audit_service)],
):
    """Get collision detection service instance."""
    from app.services.operations import CollisionDetectionService
    return CollisionDetectionService(db, audit)


async def get_operation_service(
    db: Annotated[AsyncSession, Depends(get_db)],
    audit: Annotated[AuditService, Depends(get_audit_service)],
):
    """Get operation service instance."""
    from app.services.operations import OperationService
    return OperationService(db, audit)


async def get_position_tracking_service(
    db: Annotated[AsyncSession, Depends(get_db)],
    audit: Annotated[AuditService, Depends(get_audit_service)],
):
    """Get position tracking service instance."""
    from app.services.operations import PositionTrackingService
    return PositionTrackingService(db, audit)


async def get_communication_service(
    db: Annotated[AsyncSession, Depends(get_db)],
    audit: Annotated[AuditService, Depends(get_audit_service)],
):
    """Get communication service instance."""
    from app.services.operations import CommunicationService
    return CommunicationService(db, audit)

