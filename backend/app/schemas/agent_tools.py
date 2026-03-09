"""
JSON Schema tool definitions for the AEGIS autonomous agent system.

Each tool follows the OpenAI function-calling format so the backing LLM
can decide which tool to invoke, fill in arguments, and the agent runtime
can validate + dispatch the call.

Three categories are exported:
    AGENT_DATA_TOOLS     – 10 tools for querying satellites, debris,
                           conjunctions, threats, weather, etc.
    AGENT_PHYSICS_TOOLS  – 4 tools for orbit propagation, conjunction
                           risk computation, coverage analysis, and
                           maneuver cost estimation.
    AGENT_CONTROL_TOOLS  – 5 tools for orchestrating the agent's
                           pacing, narration, overlays, scene mood,
                           and pre-built scenario playback.

ALL_AGENT_TOOLS is the union of all three lists.
"""

# ---------------------------------------------------------------------------
# Data Query Tools
# ---------------------------------------------------------------------------

AGENT_DATA_TOOLS: list[dict] = [
    # 1 ── query_satellites
    {
        "type": "function",
        "function": {
            "name": "query_satellites",
            "description": (
                "Search the AEGIS catalogue for tracked space objects. "
                "Use this when the user asks about satellites, rocket bodies, "
                "debris pieces, or any resident space object. You can filter "
                "by a free-text search term (name, NORAD ID fragment, "
                "international designator), by object type, or by active "
                "status. Returns a paginated list of matching objects with "
                "their basic orbital parameters and metadata."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "search": {
                        "type": "string",
                        "description": (
                            "Free-text search term. Matches against object "
                            "name, NORAD catalogue number, or international "
                            "designator. Example: 'ISS', '25544', 'Starlink'."
                        ),
                    },
                    "object_type": {
                        "type": "string",
                        "enum": ["PAYLOAD", "ROCKET_BODY", "DEBRIS", "UNKNOWN"],
                        "description": (
                            "Filter by the classification of the space object. "
                            "PAYLOAD = operational or defunct satellites, "
                            "ROCKET_BODY = spent upper stages, "
                            "DEBRIS = fragments from breakups or collisions, "
                            "UNKNOWN = unclassified objects."
                        ),
                    },
                    "is_active": {
                        "type": "boolean",
                        "description": (
                            "If true, return only objects that are currently "
                            "operational (transmitting, maneuvering). If false, "
                            "return only defunct objects. Omit to return both."
                        ),
                    },
                    "limit": {
                        "type": "integer",
                        "description": (
                            "Maximum number of results to return. "
                            "Defaults to 20 if omitted."
                        ),
                        "default": 20,
                    },
                },
                "required": [],
            },
        },
    },
    # 2 ── query_satellite_detail
    {
        "type": "function",
        "function": {
            "name": "query_satellite_detail",
            "description": (
                "Retrieve the full detail record for a single space object, "
                "including its latest TLE, orbital elements, physical "
                "characteristics, owner/operator, mission purpose, and "
                "current status. Use this after identifying a satellite of "
                "interest via query_satellites, or when the user asks for "
                "specifics about one object by NORAD ID or name."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "satellite_id": {
                        "type": "string",
                        "description": (
                            "The unique identifier of the satellite — "
                            "typically its NORAD catalogue number as a string, "
                            "e.g. '25544' for the ISS."
                        ),
                    },
                },
                "required": ["satellite_id"],
            },
        },
    },
    # 3 ── query_conjunctions
    {
        "type": "function",
        "function": {
            "name": "query_conjunctions",
            "description": (
                "Retrieve upcoming conjunction (close-approach) events "
                "tracked by AEGIS. Conjunctions are predicted encounters "
                "where two objects will pass within a dangerous miss "
                "distance. You can filter by a specific satellite or by "
                "risk level. Use this when the user asks about collision "
                "risks, close approaches, or conjunction data messages (CDMs)."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "satellite_id": {
                        "type": "string",
                        "description": (
                            "Filter conjunctions to only those involving "
                            "this satellite (NORAD ID). Omit to see all "
                            "tracked conjunctions."
                        ),
                    },
                    "risk_level": {
                        "type": "string",
                        "enum": ["low", "medium", "high", "critical"],
                        "description": (
                            "Filter by assessed risk level. "
                            "low = miss distance > 1 km, "
                            "medium = 200 m – 1 km, "
                            "high = 50 m – 200 m, "
                            "critical = < 50 m or probability of collision "
                            "> 1e-4."
                        ),
                    },
                    "limit": {
                        "type": "integer",
                        "description": (
                            "Maximum number of conjunction events to return. "
                            "Defaults to 10."
                        ),
                        "default": 10,
                    },
                },
                "required": [],
            },
        },
    },
    # 4 ── query_debris
    {
        "type": "function",
        "function": {
            "name": "query_debris",
            "description": (
                "Query the tracked debris population within a specified "
                "altitude band. Useful for understanding debris density in "
                "particular orbital regimes (e.g. LEO congestion at 700-900 km, "
                "or the GEO belt near 35 786 km). Returns debris objects "
                "with basic orbital parameters and origin information."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "altitude_min": {
                        "type": "number",
                        "description": (
                            "Lower bound of the altitude band in kilometres "
                            "above mean sea level. Example: 700."
                        ),
                    },
                    "altitude_max": {
                        "type": "number",
                        "description": (
                            "Upper bound of the altitude band in kilometres "
                            "above mean sea level. Example: 900."
                        ),
                    },
                    "limit": {
                        "type": "integer",
                        "description": (
                            "Maximum number of debris objects to return. "
                            "Defaults to 50."
                        ),
                        "default": 50,
                    },
                },
                "required": [],
            },
        },
    },
    # 5 ── query_threats
    {
        "type": "function",
        "function": {
            "name": "query_threats",
            "description": (
                "Retrieve the current threat feed maintained by AEGIS. "
                "Threats are anomalous behaviours or situations that may "
                "indicate adversarial activity, unexpected orbital changes, "
                "or suspicious proximity operations. Filter by threat type "
                "to focus on a specific category of concern."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "threat_type": {
                        "type": "string",
                        "enum": [
                            "proximity",
                            "signal",
                            "anomaly",
                            "orbital_similarity",
                            "geo_loiter",
                        ],
                        "description": (
                            "Filter by threat category. "
                            "proximity = another object manoeuvring "
                            "unusually close to a high-value asset; "
                            "signal = unexpected RF emissions or jamming; "
                            "anomaly = unexplained orbit changes or attitude "
                            "shifts; "
                            "orbital_similarity = objects placed into "
                            "suspiciously similar orbits (potential shadowing); "
                            "geo_loiter = objects loitering near GEO slots "
                            "without a declared mission."
                        ),
                    },
                },
                "required": [],
            },
        },
    },
    # 6 ── query_ground_stations
    {
        "type": "function",
        "function": {
            "name": "query_ground_stations",
            "description": (
                "Search for ground stations in the AEGIS network. Ground "
                "stations provide tracking, telemetry, and command "
                "capabilities. Use this when the user asks about ground "
                "infrastructure, tracking coverage, or communication links "
                "with a satellite."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "search": {
                        "type": "string",
                        "description": (
                            "Free-text search against station name, "
                            "location, or network affiliation. "
                            "Example: 'Fucino', 'SSN', 'Alaska'."
                        ),
                    },
                    "limit": {
                        "type": "integer",
                        "description": (
                            "Maximum number of ground stations to return. "
                            "Defaults to 20."
                        ),
                        "default": 20,
                    },
                },
                "required": [],
            },
        },
    },
    # 7 ── query_incidents
    {
        "type": "function",
        "function": {
            "name": "query_incidents",
            "description": (
                "Retrieve logged space-domain incidents. An incident is a "
                "confirmed or under-investigation event such as a breakup, "
                "collision, near-miss that triggered a manoeuvre, or "
                "deliberate interference. Use this when the user asks about "
                "past or ongoing incidents, or wants an operational status "
                "overview."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "status": {
                        "type": "string",
                        "description": (
                            "Filter by incident lifecycle status, e.g. "
                            "'open', 'investigating', 'resolved', 'closed'."
                        ),
                    },
                    "severity": {
                        "type": "string",
                        "description": (
                            "Filter by severity label, e.g. 'low', "
                            "'medium', 'high', 'critical'."
                        ),
                    },
                    "limit": {
                        "type": "integer",
                        "description": (
                            "Maximum number of incidents to return. "
                            "Defaults to 10."
                        ),
                        "default": 10,
                    },
                },
                "required": [],
            },
        },
    },
    # 8 ── query_space_weather
    {
        "type": "function",
        "function": {
            "name": "query_space_weather",
            "description": (
                "Fetch the latest space-weather bulletins ingested by AEGIS. "
                "Includes solar flux (F10.7), geomagnetic indices (Kp, Dst), "
                "solar-wind speed, and any active storm or flare warnings. "
                "Use this when the user asks about solar activity, radiation "
                "risk, drag effects on LEO objects, or GPS/comms disruption "
                "likelihood."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "limit": {
                        "type": "integer",
                        "description": (
                            "Number of most-recent bulletins to return. "
                            "Defaults to 5."
                        ),
                        "default": 5,
                    },
                },
                "required": [],
            },
        },
    },
    # 9 ── query_proximity_alerts
    {
        "type": "function",
        "function": {
            "name": "query_proximity_alerts",
            "description": (
                "Retrieve real-time proximity alerts — notifications raised "
                "when a tracked object enters a keep-out zone around a "
                "protected asset. Unlike conjunctions (which are predicted "
                "future events), proximity alerts are near-real-time "
                "detections. Use this when the user asks 'what is close to "
                "X right now?' or wants live situational awareness."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "limit": {
                        "type": "integer",
                        "description": (
                            "Maximum number of alerts to return. "
                            "Defaults to 10."
                        ),
                        "default": 10,
                    },
                },
                "required": [],
            },
        },
    },
    # 10 ── get_scene_state
    {
        "type": "function",
        "function": {
            "name": "get_scene_state",
            "description": (
                "Return the current state of the 3-D Cesium globe scene: "
                "camera position and orientation, simulation clock time, "
                "list of currently visible entity layers, and any active "
                "overlays. Use this to understand what the user is currently "
                "looking at before deciding how to adjust the view or which "
                "data to highlight."
            ),
            "parameters": {
                "type": "object",
                "properties": {},
                "required": [],
            },
        },
    },
]


# ---------------------------------------------------------------------------
# Physics / Computation Tools
# ---------------------------------------------------------------------------

AGENT_PHYSICS_TOOLS: list[dict] = [
    # 1 ── propagate_orbit
    {
        "type": "function",
        "function": {
            "name": "propagate_orbit",
            "description": (
                "Numerically propagate a satellite's orbit forward in time "
                "using its latest TLE or state vector. Returns a sampled "
                "ephemeris (time-tagged position/velocity vectors) that can "
                "be used to visualise the predicted ground track, compute "
                "future access windows over ground stations, or feed into "
                "conjunction screening. Use this when the user asks 'where "
                "will satellite X be in N hours?' or wants a predicted "
                "trajectory."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "satellite_id": {
                        "type": "string",
                        "description": (
                            "NORAD catalogue number (as a string) of the "
                            "satellite to propagate."
                        ),
                    },
                    "hours_ahead": {
                        "type": "number",
                        "description": (
                            "How many hours into the future to propagate. "
                            "Defaults to 24. Reasonable range is 1–168 "
                            "(one week)."
                        ),
                        "default": 24,
                    },
                },
                "required": ["satellite_id"],
            },
        },
    },
    # 2 ── compute_conjunction_risk
    {
        "type": "function",
        "function": {
            "name": "compute_conjunction_risk",
            "description": (
                "Compute a detailed conjunction risk assessment between two "
                "specific space objects. Propagates both orbits, finds the "
                "time of closest approach (TCA), estimates the miss distance "
                "and collision probability using positional covariance data. "
                "Use this when the user asks 'how close will A and B get?' "
                "or 'what is the collision probability between these two "
                "objects?'"
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "satellite_a_id": {
                        "type": "string",
                        "description": (
                            "NORAD catalogue number of the first object."
                        ),
                    },
                    "satellite_b_id": {
                        "type": "string",
                        "description": (
                            "NORAD catalogue number of the second object."
                        ),
                    },
                },
                "required": ["satellite_a_id", "satellite_b_id"],
            },
        },
    },
    # 3 ── compute_coverage
    {
        "type": "function",
        "function": {
            "name": "compute_coverage",
            "description": (
                "Compute the ground-coverage footprint for a set of "
                "satellites over a given geographic region. Returns coverage "
                "statistics such as revisit time, percentage of area covered, "
                "and gap analysis. Use this when the user asks about "
                "observation or communication coverage for a constellation "
                "or a subset of satellites over a region of interest."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "satellite_ids": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": (
                            "List of NORAD catalogue numbers (as strings) "
                            "for the satellites to include in the coverage "
                            "computation."
                        ),
                    },
                    "region_bounds": {
                        "type": "array",
                        "items": {"type": "number"},
                        "description": (
                            "Geographic bounding box as [south_lat, west_lon, "
                            "north_lat, east_lon] in decimal degrees. "
                            "Example: [35.0, 6.0, 47.0, 19.0] for Italy. "
                            "Omit to use the full globe."
                        ),
                    },
                },
                "required": ["satellite_ids"],
            },
        },
    },
    # 4 ── estimate_maneuver_cost
    {
        "type": "function",
        "function": {
            "name": "estimate_maneuver_cost",
            "description": (
                "Estimate the propellant (delta-v) cost for a satellite to "
                "perform a collision-avoidance or orbit-adjustment manoeuvre. "
                "If delta_v_m_s is provided, the tool calculates the "
                "resulting orbit change and fuel expenditure. If omitted, "
                "the tool estimates the minimum delta-v needed to clear the "
                "nearest predicted conjunction. Use this when the user asks "
                "'how much fuel would it cost to avoid the collision?' or "
                "'what delta-v is needed?'"
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "satellite_id": {
                        "type": "string",
                        "description": (
                            "NORAD catalogue number of the satellite that "
                            "would perform the manoeuvre."
                        ),
                    },
                    "delta_v_m_s": {
                        "type": "number",
                        "description": (
                            "Desired delta-v magnitude in metres per second. "
                            "If omitted, the tool will compute the minimum "
                            "delta-v required to mitigate the most imminent "
                            "conjunction risk for this satellite."
                        ),
                    },
                },
                "required": ["satellite_id"],
            },
        },
    },
]


# ---------------------------------------------------------------------------
# Orchestration / Control Tools
# ---------------------------------------------------------------------------

AGENT_CONTROL_TOOLS: list[dict] = [
    # 1 ── agent_wait
    {
        "type": "function",
        "function": {
            "name": "agent_wait",
            "description": (
                "Pause the agent's execution for a specified number of "
                "seconds. This is used for dramatic pacing during briefings "
                "or scenario playback — for example, pausing after revealing "
                "a threat so the user can absorb the information before the "
                "next step. Always provide a reason so the runtime can log "
                "why the pause occurred."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "seconds": {
                        "type": "number",
                        "description": (
                            "Duration of the pause in seconds. Keep this "
                            "short (1–15) to avoid frustrating the user."
                        ),
                    },
                    "reason": {
                        "type": "string",
                        "description": (
                            "Human-readable explanation for the pause, "
                            "e.g. 'Letting the user read the threat card' "
                            "or 'Waiting for orbit propagation visual to "
                            "complete'."
                        ),
                    },
                },
                "required": ["seconds", "reason"],
            },
        },
    },
    # 2 ── agent_narrate
    {
        "type": "function",
        "function": {
            "name": "agent_narrate",
            "description": (
                "Display a narration message to the user in the AEGIS "
                "interface. Use this to explain what is happening, provide "
                "analysis, or guide the user through a scenario. The style "
                "parameter controls the visual presentation — choose "
                "'warning' for alerts, 'dramatic' for high-tension moments, "
                "'briefing' for structured military-style status updates, "
                "and 'info' for general commentary."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "text": {
                        "type": "string",
                        "description": (
                            "The narration text to display. Supports "
                            "Markdown formatting. Keep it concise — aim for "
                            "1–3 sentences per narration step."
                        ),
                    },
                    "style": {
                        "type": "string",
                        "enum": ["info", "warning", "dramatic", "briefing"],
                        "description": (
                            "Visual style of the narration card. "
                            "info = neutral blue, "
                            "warning = amber alert banner, "
                            "dramatic = red pulsing border with emphasis, "
                            "briefing = structured panel with heading bar. "
                            "Defaults to 'info' if omitted."
                        ),
                        "default": "info",
                    },
                },
                "required": ["text"],
            },
        },
    },
    # 3 ── clear_all_overlays
    {
        "type": "function",
        "function": {
            "name": "clear_all_overlays",
            "description": (
                "Remove all agent-created overlays from the 3-D scene: "
                "narration cards, highlight rings, trajectory ribbons, "
                "threat indicators, and coverage heat-maps. Use this to "
                "reset the view to a clean state before starting a new "
                "analysis or scenario, or when the user asks to clear "
                "the screen."
            ),
            "parameters": {
                "type": "object",
                "properties": {},
                "required": [],
            },
        },
    },
    # 4 ── set_scene_mood
    {
        "type": "function",
        "function": {
            "name": "set_scene_mood",
            "description": (
                "Change the overall visual mood of the AEGIS 3-D scene. "
                "This adjusts lighting, background colour, post-processing "
                "effects, and UI chrome to match the operational context. "
                "Use 'alert' when showing threats or critical conjunctions, "
                "'dramatic' for cinematic scenario playback, 'briefing' for "
                "structured presentations, and 'normal' to restore the "
                "default appearance."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "mood": {
                        "type": "string",
                        "enum": ["normal", "alert", "dramatic", "briefing"],
                        "description": (
                            "The visual mood to apply. "
                            "normal = standard daytime globe, "
                            "alert = dark background with amber highlights, "
                            "dramatic = deep-space dark with cinematic bloom, "
                            "briefing = muted tones with information panels."
                        ),
                    },
                },
                "required": ["mood"],
            },
        },
    },
    # 5 ── run_scenario
    {
        "type": "function",
        "function": {
            "name": "run_scenario",
            "description": (
                "Launch a pre-built, multi-step scenario that combines data "
                "queries, physics computations, camera movements, overlays, "
                "and narration into a choreographed presentation. Use this "
                "when the user requests a demo, a tour, or a specific "
                "scripted briefing. The scenario runs asynchronously and "
                "the agent should not issue other commands until the "
                "scenario completes."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "scenario_id": {
                        "type": "string",
                        "enum": [
                            "threat_landscape",
                            "constellation_tour",
                            "critical_conjunction",
                            "defense_demo",
                            "full_briefing",
                        ],
                        "description": (
                            "Identifier of the scenario to execute. "
                            "threat_landscape = survey all active threats "
                            "and highlight them on the globe; "
                            "constellation_tour = fly through major "
                            "constellations (Starlink, OneWeb, etc.) with "
                            "statistics; "
                            "critical_conjunction = deep-dive on the "
                            "highest-risk upcoming conjunction with "
                            "probability analysis; "
                            "defense_demo = demonstrate the Italy defense "
                            "simulation including ASAT engagement and "
                            "debris propagation; "
                            "full_briefing = comprehensive operational "
                            "briefing covering threats, weather, "
                            "conjunctions, and recommendations."
                        ),
                    },
                },
                "required": ["scenario_id"],
            },
        },
    },
]


# ---------------------------------------------------------------------------
# Unified export
# ---------------------------------------------------------------------------

ALL_AGENT_TOOLS: list[dict] = (
    AGENT_DATA_TOOLS + AGENT_PHYSICS_TOOLS + AGENT_CONTROL_TOOLS
)
