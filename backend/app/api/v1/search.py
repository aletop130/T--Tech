"""Search API endpoints."""
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel

from app.api.deps import get_current_user, get_ontology_service
from app.core.security import TokenData
from app.services.ontology import OntologyService

router = APIRouter()


class SearchResult(BaseModel):
    """Search result item."""
    type: str
    id: str
    name: str
    norad_id: Optional[int] = None
    code: Optional[str] = None


@router.get("", response_model=list[SearchResult])
async def global_search(
    q: Annotated[str, Query(min_length=1)],
    user: Annotated[TokenData, Depends(get_current_user)],
    service: Annotated[OntologyService, Depends(get_ontology_service)],
    types: Optional[str] = Query(None, description="Comma-separated entity types"),
    limit: int = Query(20, ge=1, le=100),
):
    """Global search across all entity types."""
    entity_types = types.split(",") if types else None
    
    results = await service.global_search(
        tenant_id=user.tenant_id,
        query=q,
        entity_types=entity_types,
        limit=limit,
    )
    
    return [SearchResult(**r) for r in results]

