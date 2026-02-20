"""Cesium action schemas for function calling."""
from datetime import datetime
from typing import Any, Literal, Optional
from pydantic import Field, BaseModel


class CesiumSetClockPayload(BaseModel):
    start: datetime
    stop: datetime
    multiplier: float = 1.0
    current: Optional[datetime] = None


class CesiumLoadCzmlPayload(BaseModel):
    layerId: str
    data: list[dict[str, Any]]
    options: Optional[dict[str, Any]] = None


class CesiumAddEntityPayload(BaseModel):
    entityType: Literal['satellite', 'ground_station', 'point', 'polygon', 'polyline']
    name: str
    position: dict[str, float]
    properties: Optional[dict[str, Any]] = None


class CesiumFlyToPayload(BaseModel):
    entityId: Optional[str] = None
    longitude: Optional[float] = None
    latitude: Optional[float] = None
    altitude: Optional[float] = None
    heading: Optional[float] = None
    pitch: Optional[float] = None
    roll: Optional[float] = None
    duration: float = 2.0


class CesiumTogglePayload(BaseModel):
    showOrbits: Optional[bool] = None
    showCoverage: Optional[bool] = None
    showConjunctions: Optional[bool] = None
    showLabels: Optional[bool] = None


class CesiumRemoveLayerPayload(BaseModel):
    layerId: str


class CesiumSetSelectedPayload(BaseModel):
    entityId: Optional[str] = None


class CesiumAction(BaseModel):
    type: Literal[
        'cesium.setClock',
        'cesium.loadCzml',
        'cesium.addEntity',
        'cesium.flyTo',
        'cesium.flyToCountry',
        'cesium.searchLocation',
        'cesium.toggle',
        'cesium.removeLayer',
        'cesium.setSelected',
        'cesium.showManeuverOptions',
        'cesium.highlightManeuver',
        'cesium.showConjunctionLine',
        'cesium.showRiskHeatmap',
        'cesium.showThreatRadius',
        'simulation.addSatellite',
        'simulation.addGroundStation',
        'simulation.addVehicle',
        'simulation.showCoverage',
        'simulation.analyzeCoverage',
        'simulation.removeEntity',
    ]
    payload: dict[str, Any]


CESIUM_FUNCTION_DEFINITIONS = [
    {
        "type": "function",
        "function": {
            "name": "cesium_set_clock",
            "description": "Set the Cesium clock to control time simulation. Use this for time-based simulations.",
            "parameters": {
                "type": "object",
                "properties": {
                    "start": {
                        "type": "string",
                        "description": "Start time in ISO 8601 format (e.g., 2024-01-15T00:00:00Z)"
                    },
                    "stop": {
                        "type": "string",
                        "description": "Stop time in ISO 8601 format (e.g., 2024-01-15T12:00:00Z)"
                    },
                    "multiplier": {
                        "type": "number",
                        "description": "Time multiplier (1.0 = real-time, 60 = 1 minute per second, 3600 = 1 hour per second)",
                        "default": 1.0
                    },
                    "current": {
                        "type": "string",
                        "description": "Current time in ISO 8601 format (optional, defaults to start)"
                    }
                },
                "required": ["start", "stop"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "cesium_load_czml",
            "description": "Load CZML data source into Cesium. Use for displaying satellite trajectories, orbits, or time-dynamic data.",
            "parameters": {
                "type": "object",
                "properties": {
                    "layerId": {
                        "type": "string",
                        "description": "Unique identifier for the CZML layer"
                    },
                    "data": {
                        "type": "array",
                        "description": "CZML data array containing time-dynamic objects"
                    },
                    "options": {
                        "type": "object",
                        "description": "Additional CZML loading options"
                    }
                },
                "required": ["layerId", "data"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "cesium_add_entity",
            "description": "Add a new entity to the Cesium scene. Use for displaying points of interest, satellites, or ground stations.",
            "parameters": {
                "type": "object",
                "properties": {
                    "entityType": {
                        "type": "string",
                        "enum": ["satellite", "ground_station", "point", "polygon", "polyline"],
                        "description": "Type of entity to add"
                    },
                    "name": {
                        "type": "string",
                        "description": "Display name for the entity"
                    },
                    "position": {
                        "type": "object",
                        "properties": {
                            "longitude": {"type": "number"},
                            "latitude": {"type": "number"},
                            "altitude": {"type": "number", "default": 0}
                        },
                        "description": "Entity position in WGS84 coordinates"
                    },
                    "properties": {
                        "type": "object",
                        "description": "Additional entity properties (color, size, description, etc.)"
                    }
                },
                "required": ["entityType", "name", "position"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "cesium_fly_to",
            "description": "Smoothly animate the camera to a target location. Use for focusing on satellites, ground stations, or regions of interest.",
            "parameters": {
                "type": "object",
                "properties": {
                    "entityId": {
                        "type": "string",
                        "description": "ID of an existing entity to fly to (mutually exclusive with coordinates)"
                    },
                    "longitude": {
                        "type": "number",
                        "description": "Target longitude in degrees (-180 to 180)"
                    },
                    "latitude": {
                        "type": "number",
                        "description": "Target latitude in degrees (-90 to 90)"
                    },
                    "altitude": {
                        "type": "number",
                        "description": "Camera altitude in meters",
                        "default": 10000
                    },
                    "heading": {
                        "type": "number",
                        "description": "Camera heading in degrees (0-360)",
                        "default": 0
                    },
                    "pitch": {
                        "type": "number",
                        "description": "Camera pitch in degrees (-90 to 90)",
                        "default": -45
                    },
                    "roll": {
                        "type": "number",
                        "description": "Camera roll in degrees",
                        "default": 0
                    },
                    "duration": {
                        "type": "number",
                        "description": "Animation duration in seconds",
                        "default": 2.0
                    }
                }
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "cesium_toggle",
            "description": "Toggle visibility of map layers. Use to show/hide orbits, coverage areas, conjunctions, or labels.",
            "parameters": {
                "type": "object",
                "properties": {
                    "showOrbits": {
                        "type": "boolean",
                        "description": "Show/hide satellite orbit lines"
                    },
                    "showCoverage": {
                        "type": "boolean",
                        "description": "Show/hide ground station coverage areas"
                    },
                    "showConjunctions": {
                        "type": "boolean",
                        "description": "Show/hide conjunction visualization"
                    },
                    "showLabels": {
                        "type": "boolean",
                        "description": "Show/hide entity labels"
                    }
                }
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "cesium_remove_layer",
            "description": "Remove a CZML layer from the Cesium scene. Use to clean up loaded data.",
            "parameters": {
                "type": "object",
                "properties": {
                    "layerId": {
                        "type": "string",
                        "description": "ID of the layer to remove"
                    }
                },
                "required": ["layerId"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "cesium_set_selected",
            "description": "Set the selected entity in Cesium. The selected entity displays its properties in the info box.",
            "parameters": {
                "type": "object",
                "properties": {
                    "entityId": {
                        "type": "string",
                        "description": "ID of entity to select, or null to clear selection"
                    }
                },
                "required": ["entityId"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "cesium_fly_to_country",
            "description": "Fly the camera to a specific country or region. Use when user asks to view a country like 'show me Italy', 'fly to Nigeria', 'view United States', etc.",
            "parameters": {
                "type": "object",
                "properties": {
                    "country": {
                        "type": "string",
                        "enum": ["Italy", "Nigeria", "United States", "USA", "France", "Germany", "Spain", "United Kingdom", "UK", "China", "Japan", "India", "Brazil", "Russia", "Australia", "Canada", "Mexico", "South Africa", "Egypt", "Kenya", "Argentina", "Chile", "Indonesia", "Thailand", "Turkey", "Saudi Arabia", "UAE"],
                        "description": "Country name to fly to"
                    },
                    "altitude": {
                        "type": "number",
                        "description": "Camera altitude in meters",
                        "default": 5000000
                    },
                    "duration": {
                        "type": "number",
                        "description": "Animation duration in seconds",
                        "default": 2.0
                    }
                },
                "required": ["country"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "cesium_search_location",
            "description": "Search for and fly to any location on Earth using the Cesium built-in geocoder. Use for cities, landmarks, addresses, or any place name. Examples: 'Rome', 'Eiffel Tower', 'New York', 'Mount Everest', 'Via del Corso 1, Roma'.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "Location name, address, or place to search for. Can be a city, landmark, country, or full address."
                    },
                    "altitude": {
                        "type": "number",
                        "description": "Camera altitude in meters after flying to location",
                        "default": 50000
                    },
                    "duration": {
                        "type": "number",
                        "description": "Animation duration in seconds",
                        "default": 2.0
                    }
                },
                "required": ["query"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "cesium_show_maneuver_options",
            "description": "Display maneuver options for a satellite to avoid collision. Shows labels with delta-v requirements for each option. Use when user asks about maneuver options, how to avoid collision, or evasive actions.",
            "parameters": {
                "type": "object",
                "properties": {
                    "satellite_id": {
                        "type": "string",
                        "description": "UUID of the satellite (not NORAD ID)"
                    },
                    "maneuvers": {
                        "type": "array",
                        "description": "List of maneuver options",
                        "items": {
                            "type": "object",
                            "properties": {
                                "id": {"type": "string", "description": "Unique maneuver ID"},
                                "type": {"type": "string", "description": "Maneuver type (e.g., delta_v_posigrade, delta_v_retrograde, plane_change)"},
                                "delta_v_m_s": {"type": "number", "description": "Delta-v in m/s"},
                                "description": {"type": "string", "description": "Human-readable description"}
                            }
                        }
                    },
                    "recommended_id": {
                        "type": "string",
                        "description": "ID of the recommended maneuver"
                    }
                },
                "required": ["satellite_id", "maneuvers"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "cesium_highlight_maneuver",
            "description": "Highlight the recommended or selected maneuver on the map. Use when user asks which maneuver is recommended, best, or suggested.",
            "parameters": {
                "type": "object",
                "properties": {
                    "satellite_id": {
                        "type": "string",
                        "description": "UUID of the satellite"
                    },
                    "maneuver_id": {
                        "type": "string",
                        "description": "ID of the maneuver to highlight"
                    },
                    "color": {
                        "type": "string",
                        "description": "Highlight color in hex (default: #00FF00)",
                        "default": "#00FF00"
                    }
                },
                "required": ["satellite_id", "maneuver_id"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "cesium_show_conjunction_line",
            "description": "Draw a glowing line between two satellites in conjunction. Use when visualizing collision risk or conjunction events.",
            "parameters": {
                "type": "object",
                "properties": {
                    "satellite_a_id": {
                        "type": "string",
                        "description": "UUID of primary satellite"
                    },
                    "satellite_b_id": {
                        "type": "string",
                        "description": "UUID of secondary satellite/debris"
                    },
                    "color": {
                        "type": "string",
                        "description": "Line color in hex (default: #FF1744)",
                        "default": "#FF1744"
                    },
                    "label": {
                        "type": "string",
                        "description": "Label to show on the line"
                    }
                },
                "required": ["satellite_a_id", "satellite_b_id"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "cesium_show_risk_heatmap",
            "description": "Display a colored risk heatmap around a satellite. Use when user asks about risk area, risk heatmap, or danger zone.",
            "parameters": {
                "type": "object",
                "properties": {
                    "satellite_id": {
                        "type": "string",
                        "description": "UUID of the satellite"
                    },
                    "risk_level": {
                        "type": "string",
                        "enum": ["low", "medium", "high", "critical"],
                        "description": "Risk level determining the color"
                    },
                    "probability": {
                        "type": "number",
                        "description": "Collision probability (0-1)"
                    }
                },
                "required": ["satellite_id", "risk_level"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "cesium_show_threat_radius",
            "description": "Display a threat radius circle around a satellite. Use when visualizing threat area, danger radius, or keep-out zone.",
            "parameters": {
                "type": "object",
                "properties": {
                    "satellite_id": {
                        "type": "string",
                        "description": "UUID of the satellite"
                    },
                    "radius_km": {
                        "type": "number",
                        "description": "Radius in kilometers (default: 5)",
                        "default": 5.0
                    },
                    "color": {
                        "type": "string",
                        "description": "Circle color in hex (default: #FF5722)",
                        "default": "#FF5722"
                    }
                },
                "required": ["satellite_id"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "simulation_add_satellite",
            "description": "Add a satellite to the simulation with orbital parameters. Use when user asks to add, create, or place a satellite in the simulation.",
            "parameters": {
                "type": "object",
                "properties": {
                    "name": {
                        "type": "string",
                        "description": "Satellite name (e.g., 'Guardian-1', 'Recon-Sat')"
                    },
                    "altitude_km": {
                        "type": "number",
                        "description": "Orbital altitude in kilometers (LEO: 160-2000, MEO: 2000-35786, GEO: 35786)"
                    },
                    "inclination_deg": {
                        "type": "number",
                        "description": "Orbital inclination in degrees (0-180)",
                        "default": 0
                    },
                    "faction": {
                        "type": "string",
                        "enum": ["allied", "hostile", "neutral", "unknown"],
                        "description": "Faction affiliation (allied=blue, hostile=red)",
                        "default": "neutral"
                    },
                    "raan_deg": {
                        "type": "number",
                        "description": "Right Ascension of Ascending Node in degrees",
                        "default": 0
                    }
                },
                "required": ["name", "altitude_km"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "simulation_add_ground_station",
            "description": "Add a ground station or base to the simulation. Use when user asks to add a base, ground station, or command center.",
            "parameters": {
                "type": "object",
                "properties": {
                    "name": {
                        "type": "string",
                        "description": "Station name (e.g., 'Alpha Base', 'Command Center North')"
                    },
                    "latitude": {
                        "type": "number",
                        "description": "Latitude in degrees (-90 to 90)"
                    },
                    "longitude": {
                        "type": "number",
                        "description": "Longitude in degrees (-180 to 180)"
                    },
                    "coverage_radius_km": {
                        "type": "number",
                        "description": "Coverage radius in kilometers",
                        "default": 2000
                    },
                    "faction": {
                        "type": "string",
                        "enum": ["allied", "hostile", "neutral", "unknown"],
                        "description": "Faction affiliation",
                        "default": "neutral"
                    }
                },
                "required": ["name", "latitude", "longitude"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "simulation_add_vehicle",
            "description": "Add a vehicle (ground, air, or sea) to the simulation. Use when user asks to add a tank, aircraft, ship, or vehicle.",
            "parameters": {
                "type": "object",
                "properties": {
                    "name": {
                        "type": "string",
                        "description": "Vehicle name/callsign (e.g., 'Alpha-1', 'Eagle-2')"
                    },
                    "entity_type": {
                        "type": "string",
                        "enum": ["ground_vehicle", "aircraft", "ship"],
                        "description": "Type of vehicle"
                    },
                    "latitude": {
                        "type": "number",
                        "description": "Latitude in degrees"
                    },
                    "longitude": {
                        "type": "number",
                        "description": "Longitude in degrees"
                    },
                    "heading_deg": {
                        "type": "number",
                        "description": "Heading/direction in degrees (0-360)",
                        "default": 0
                    },
                    "faction": {
                        "type": "string",
                        "enum": ["allied", "hostile", "neutral", "unknown"],
                        "description": "Faction affiliation",
                        "default": "neutral"
                    }
                },
                "required": ["name", "entity_type", "latitude", "longitude"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "simulation_show_coverage",
            "description": "Show or hide satellite coverage area (footprint). Use when user asks to show, display, or visualize satellite coverage.",
            "parameters": {
                "type": "object",
                "properties": {
                    "satellite_id": {
                        "type": "string",
                        "description": "UUID of the satellite"
                    },
                    "show": {
                        "type": "boolean",
                        "description": "Show (true) or hide (false) the coverage",
                        "default": True
                    },
                    "min_elevation_deg": {
                        "type": "number",
                        "description": "Minimum elevation angle in degrees",
                        "default": 10.0
                    }
                },
                "required": ["satellite_id"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "simulation_analyze_coverage",
            "description": "Analyze combined coverage for allied satellites. Shows gaps, overlaps, and coverage percentage. Use when user asks to analyze coverage, find gaps, or check allied coverage.",
            "parameters": {
                "type": "object",
                "properties": {
                    "faction": {
                        "type": "string",
                        "enum": ["allied", "hostile", "neutral", "unknown"],
                        "description": "Filter by faction (default: allied)",
                        "default": "allied"
                    },
                    "region_bounds": {
                        "type": "array",
                        "items": {"type": "number"},
                        "description": "Region bounds as [min_lat, max_lat, min_lon, max_lon]"
                    }
                }
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "simulation_remove_entity",
            "description": "Remove an entity from the simulation. Use when user asks to remove, delete, or clear a satellite, station, or vehicle.",
            "parameters": {
                "type": "object",
                "properties": {
                    "entity_type": {
                        "type": "string",
                        "enum": ["satellite", "ground_station", "ground_vehicle", "aircraft", "ship"],
                        "description": "Type of entity to remove"
                    },
                    "entity_id": {
                        "type": "string",
                        "description": "ID of the entity to remove"
                    }
                },
                "required": ["entity_type", "entity_id"]
            }
        }
    }
]
