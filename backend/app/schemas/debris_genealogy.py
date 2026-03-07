"""Debris Genealogy Pydantic schemas."""
from datetime import datetime
from typing import Optional

from pydantic import Field

from app.schemas.common import BaseSchema


class FragmentationEvent(BaseSchema):
    """A known fragmentation event that produced debris."""
    id: str
    name: str
    event_type: str = Field(..., description="ASAT, collision, explosion, anomaly")
    date: str = Field(..., description="Date of event (YYYY-MM-DD)")
    parent_object_name: str
    parent_norad_id: Optional[int] = None
    parent_intdes: str = Field(..., description="International designator prefix")
    fragment_count: int = Field(0, description="Known tracked fragment count")
    orbit_regime: str = Field("LEO", description="LEO, MEO, GEO")
    description: str = ""


class FragmentInfo(BaseSchema):
    """A single debris fragment from a fragmentation event."""
    norad_id: int
    name: str
    intdes: str
    object_type: str = "DEB"
    rcs_size: Optional[str] = None
    launch_year: Optional[int] = None


class FragmentationEventDetail(FragmentationEvent):
    """Fragmentation event with its fragment list."""
    fragments: list[FragmentInfo] = Field(default_factory=list)


class DebrisLineage(BaseSchema):
    """Lineage information for a single debris object."""
    norad_id: int
    name: str
    intdes: str
    parent_event: Optional[FragmentationEvent] = None
    parent_object_name: Optional[str] = None
    siblings_count: int = 0
