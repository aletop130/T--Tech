"""Schema validation tests."""
import pytest
from pydantic import ValidationError

from app.schemas.ontology import SatelliteCreate, GroundStationCreate
from app.schemas.incidents import IncidentCreate
from app.schemas.ai import ConjunctionAnalystResponse, CourseOfAction
from app.db.models.ontology import ObjectType
from app.db.models.incidents import IncidentType, IncidentSeverity


def test_satellite_create_valid():
    """Test valid satellite creation schema."""
    sat = SatelliteCreate(
        norad_id=25544,
        name="ISS (ZARYA)",
        object_type=ObjectType.SATELLITE,
    )
    assert sat.norad_id == 25544
    assert sat.name == "ISS (ZARYA)"


def test_satellite_create_invalid_norad():
    """Test satellite creation with invalid NORAD ID."""
    with pytest.raises(ValidationError):
        SatelliteCreate(
            norad_id=-1,  # Invalid
            name="Test",
        )


def test_ground_station_create_valid():
    """Test valid ground station creation."""
    gs = GroundStationCreate(
        name="White Sands",
        latitude=32.38,
        longitude=-106.48,
    )
    assert gs.name == "White Sands"
    assert gs.latitude == 32.38


def test_ground_station_invalid_latitude():
    """Test ground station with invalid latitude."""
    with pytest.raises(ValidationError):
        GroundStationCreate(
            name="Test",
            latitude=100,  # Invalid (>90)
            longitude=0,
        )


def test_incident_create_valid():
    """Test valid incident creation."""
    incident = IncidentCreate(
        title="Test Incident",
        incident_type=IncidentType.CONJUNCTION,
        severity=IncidentSeverity.HIGH,
    )
    assert incident.title == "Test Incident"


def test_conjunction_analyst_response():
    """Test AI agent response validation."""
    response = ConjunctionAnalystResponse(
        conjunction_event_id="test-123",
        severity="high",
        risk_explanation="Test explanation",
        primary_object_assessment="Primary assessment",
        secondary_object_assessment="Secondary assessment",
        recommended_action="Monitor",
        courses_of_action=[
            CourseOfAction(
                action_type="monitor",
                description="Continue monitoring",
                confidence=0.8,
            ),
        ],
        confidence=0.75,
        request_id="req-456",
    )
    assert response.severity == "high"
    assert len(response.courses_of_action) == 1

