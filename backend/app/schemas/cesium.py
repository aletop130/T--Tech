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
    }
]
