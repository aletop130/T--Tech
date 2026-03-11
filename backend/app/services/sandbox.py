"""Sandbox service for isolated scenario authoring and runtime state."""
from __future__ import annotations

import asyncio
import json
import math
import random
import re
from collections import OrderedDict
from copy import deepcopy
from typing import Any, Optional

import httpx
from openai import AsyncOpenAI
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError, ValidationError
from app.core.logging import get_logger
from app.db.models.ontology import ConjunctionEvent, GroundStation, Orbit, Satellite
from app.db.models.operations import PositionReport
from app.db.models.sandbox import (
    SandboxActor,
    SandboxCommand,
    SandboxScenarioItem,
    SandboxSession,
)
from sqlalchemy import func as sa_func

from app.schemas.sandbox import (
    SandboxActorCreate,
    SandboxActorUpdate,
    SandboxChatRequest,
    SandboxChatResponse,
    SandboxCommandRead,
    SandboxImportRequest,
    SandboxScenarioItemCreate,
    SandboxScenarioItemRead,
    SandboxSessionControlRequest,
    SandboxSessionCreate,
    SandboxSessionRead,
    SandboxSessionSnapshot,
    SandboxSessionSummary,
    SandboxTickRequest,
    SandboxActorRead,
    SandboxTLEImportRequest,
)

logger = get_logger(__name__)

EARTH_RADIUS_M = 6_371_000.0
SIDEREAL_DAY_SECONDS = 86_164.0

# --------------- GEOCODING (Nominatim / OSM + fallbacks) ---------------
# Nominatim struggles with: water bodies, vague regions, ambiguous short names.
# We keep a small fallback table for those, and use Nominatim for everything else
# with a viewbox bias so "Athens" → Greece, not Georgia USA.

_GEOCODE_FALLBACK: dict[str, tuple[float, float]] = {
    # ---- Water bodies & coasts (Nominatim can't geocode these) ----
    "adriatic sea": (43.0, 15.5),
    "adriatic": (43.0, 15.5),
    "ionian sea": (38.5, 19.8),
    "aegean sea": (38.5, 25.0),
    "aegean": (38.5, 25.0),
    "mediterranean sea": (35.0, 18.0),
    "mediterranean": (35.0, 18.0),
    "black sea": (43.0, 35.0),
    "red sea": (20.0, 38.5),
    "persian gulf": (26.0, 52.0),
    "strait of otranto": (40.3, 19.0),
    "strait of hormuz": (26.5, 56.3),
    "suez canal": (30.4, 32.3),
    "english channel": (50.2, -1.0),
    "north sea": (56.0, 3.0),
    "baltic sea": (58.0, 20.0),
    "atlantic ocean": (35.0, -40.0),
    "atlantic": (35.0, -40.0),
    "pacific ocean": (0.0, -160.0),
    "pacific": (0.0, -160.0),
    "indian ocean": (-10.0, 75.0),
    "arctic ocean": (85.0, 0.0),
    "south china sea": (12.0, 113.0),
    "east china sea": (30.0, 126.0),
    "sea of japan": (40.0, 135.0),
    "arabian sea": (15.0, 65.0),
    "bay of bengal": (15.0, 87.0),
    "gulf of mexico": (25.0, -90.0),
    "caribbean sea": (15.0, -75.0),
    "albanian coast": (40.5, 19.5),
    "italian coast": (41.0, 14.0),
    "greek coast": (38.0, 23.5),
    "turkish coast": (37.0, 28.0),
    "croatian coast": (43.5, 15.5),
    # ---- Vague regions (Nominatim returns garbage for these) ----
    "central europe": (48.5, 14.0),
    "balkans": (43.0, 20.0),
    "the balkans": (43.0, 20.0),
    "northern italy": (45.5, 11.0),
    "southern italy": (39.5, 16.0),
    "eastern europe": (50.0, 25.0),
    "western europe": (48.0, 5.0),
    "middle east": (29.0, 44.0),
    "north africa": (30.0, 10.0),
    "east africa": (0.0, 37.0),
    "horn of africa": (8.0, 48.0),
    "southeast asia": (10.0, 110.0),
    "east asia": (35.0, 120.0),
    "south asia": (20.0, 78.0),
    # ---- Ambiguous short names (Nominatim picks wrong country) ----
    "nis": (43.3209, 21.8958),  # Niš, Serbia — not Nice, France
    "nis serbia": (43.3209, 21.8958),
    "split": (43.5081, 16.4402),  # Split, Croatia
}

# LRU cache — avoids repeat network calls during a session
_GEOCODE_CACHE_MAX = 512
_geocode_cache: OrderedDict[str, Optional[tuple[float, float]]] = OrderedDict()

_nominatim_client: Optional[httpx.AsyncClient] = None


def _get_nominatim_client() -> httpx.AsyncClient:
    global _nominatim_client
    if _nominatim_client is None:
        _nominatim_client = httpx.AsyncClient(
            base_url="https://nominatim.openstreetmap.org",
            timeout=5.0,
            headers={"User-Agent": "SDA-Sandbox/1.0 (space-domain-awareness-sandbox)"},
        )
    return _nominatim_client


async def _geocode(place_name: str) -> Optional[tuple[float, float]]:
    """Resolve a place name to (lat, lon).

    Lookup order:
      1. Fallback table (water bodies, vague regions, ambiguous names)
      2. LRU cache
      3. Nominatim API with viewbox bias toward the Old World
    """
    key = place_name.strip().lower()
    key = re.sub(r"^(the|a|an)\s+", "", key)
    key = re.sub(r"[.,;!?]+$", "", key).strip()
    if not key:
        return None

    # 1. Fallback table
    if key in _GEOCODE_FALLBACK:
        return _GEOCODE_FALLBACK[key]

    # 2. LRU cache
    if key in _geocode_cache:
        _geocode_cache.move_to_end(key)
        return _geocode_cache[key]

    # 3. Nominatim API
    # viewbox biases results toward Europe/Middle East/Africa/Asia (-30,72 to 180,-60)
    # bounded=0 means results outside the box are still returned, just ranked lower.
    try:
        client = _get_nominatim_client()
        resp = await client.get(
            "/search",
            params={
                "q": key,
                "format": "json",
                "limit": 1,
                "addressdetails": 0,
                "viewbox": "-30,72,180,-60",
                "bounded": 0,
            },
        )
        resp.raise_for_status()
        results = resp.json()
        if results and len(results) > 0:
            lat = float(results[0]["lat"])
            lon = float(results[0]["lon"])
            coords: Optional[tuple[float, float]] = (lat, lon)
        else:
            coords = None
    except Exception:
        logger.warning("geocode_failed", place=key)
        coords = None

    # Store in cache
    _geocode_cache[key] = coords
    if len(_geocode_cache) > _GEOCODE_CACHE_MAX:
        _geocode_cache.popitem(last=False)

    return coords


# Location extraction regex — matches "in/at/near/over/from/off/around X" patterns
_LOCATION_PATTERN = re.compile(
    r"\b(?:in|at|near|over|from|off|around|off\s+the\s+coast\s+of)\s+"
    r"(?P<place>[A-Z][A-Za-z\s'-]{1,40}?)(?=\s*(?:,|\.|$|off\b|with|heading|speed|doing|moving|then|and\s|at\s+\d|altitude|radius))",
    re.IGNORECASE,
)

# "to/toward/towards PLACE" for move targets
_MOVE_TARGET_PATTERN = re.compile(
    r"\b(?:to|toward|towards)\s+(?P<place>[A-Z][A-Za-z\s'-]{1,40}?)(?=\s*(?:,|\.|$|with|then|and\s|at\s+\d))",
    re.IGNORECASE,
)


async def _extract_location_from_prompt(prompt: str) -> Optional[tuple[float, float]]:
    """Try to find a geocodable place name in the prompt."""
    for match in _LOCATION_PATTERN.finditer(prompt):
        place = match.group("place").strip()
        coords = await _geocode(place)
        if coords:
            return coords
    return None


async def _extract_move_target_from_prompt(prompt: str) -> Optional[tuple[str, float, float]]:
    """Extract a place-name move target. Returns (place_name, lat, lon) or None."""
    for match in _MOVE_TARGET_PATTERN.finditer(prompt):
        place = match.group("place").strip()
        coords = await _geocode(place)
        if coords:
            return (place, coords[0], coords[1])
    return None


# --------------- LLM-POWERED CHAT COMPILER ---------------

from app.core.config import settings  # noqa: E402

_SANDBOX_SYSTEM_PROMPT = """\
You are the Sandbox command interpreter for a Space Domain Awareness platform.
The user describes a military/space scenario in natural language.
Your job: extract EVERY action from their message and call the appropriate tools.
One action = one tool call. If the user asks for 5 things, make 5 tool calls.

Rules:
- Always infer a faction from context. Default to "allied" if the user says "our" / "friendly". Default to "neutral" if ambiguous.
- For actor labels: if the user gives a name, use it. Otherwise generate a short descriptive name.
- Location must be a place name (city, country, base name, sea, region). The system geocodes it.
- For satellites, if the user mentions an altitude or orbit, set altitude_km. Otherwise default to 400.
- For aircraft default speed_ms=250, ships default speed_ms=15, ground vehicles default speed_ms=20, missiles default speed_ms=800.
- "tracking station" or "station" → actor_type "ground_station".
- "defended zone" or "defense zone" → actor_type "defended_zone".
- "drone" → actor_type "aircraft".
- "convoy" → actor_type "ground_vehicle".

Movement & heading:
- "heading south/north/east/west" or "approaching from X toward Y" means the actor is MOVING.
  You MUST emit a move_actor call AFTER the create_actor call.
  For headings: "heading south" from Belgrade → move_actor to a city south (e.g. Thessaloniki).
  For "approaching from X toward Y": create at X, then move_actor to Y.
- "move X to Y" → move_actor(actor_label="X", destination="Y").
- If you create something AND it should be moving, do BOTH: create_actor + move_actor.

Patrol:
- "patrolling between X and Y" or "patrol from X to Y to Z" → patrol_actor after creating.
  patrol_actor needs the actor label and a list of waypoint place-names.
  Example: "ship patrolling between Dubrovnik and Bari" → create_actor + patrol_actor(waypoints=["Dubrovnik", "Bari"]).

Deletion:
- "remove the drone" or "delete Alpha-1" → delete_actor(actor_label=...).
- Match actor labels case-insensitively. Partial matches are OK.

Rename / describe:
- "name this scenario Mediterranean Exercise" → rename_session(name="Mediterranean Exercise").
- "describe this as a fleet readiness drill" → rename_session(description="A fleet readiness drill").

Runtime control:
- "start" / "run" / "play" → control_simulation(action="start").
- "set speed to Nx" → control_simulation(action="set_speed", speed_multiplier=N).
- "start at 5x speed" or "start at 5x" → TWO calls: control_simulation(action="start") AND control_simulation(action="set_speed", speed_multiplier=5).
- "pause" → control_simulation(action="pause").
- "resume" → control_simulation(action="resume").

Multiple actors:
- "2 aircraft" or "3 ships" → create that many with numbered labels.
- IMPORTANT: give each one a DIFFERENT nearby location so they don't stack.
  Example: "3 ships in the Adriatic" → one near Dubrovnik, one near Bari, one near Split.

Respond with tool calls ONLY. Do not add text. Every user intent = a tool call.
"""

SANDBOX_TOOLS: list[dict[str, Any]] = [
    {
        "type": "function",
        "function": {
            "name": "create_actor",
            "description": "Create a new actor in the sandbox at a location.",
            "parameters": {
                "type": "object",
                "properties": {
                    "actor_type": {
                        "type": "string",
                        "enum": [
                            "base", "ground_station", "defended_zone",
                            "ground_vehicle", "aircraft", "ship",
                            "satellite", "missile", "interceptor", "sensor",
                        ],
                    },
                    "label": {"type": "string", "description": "Name for the actor"},
                    "faction": {
                        "type": "string",
                        "enum": ["allied", "hostile", "neutral", "unknown"],
                        "default": "neutral",
                    },
                    "location": {
                        "type": "string",
                        "description": "Place name for position (e.g. 'Rome', 'Adriatic Sea', 'Camp Bondsteel')",
                    },
                    "speed_ms": {"type": "number", "description": "Speed in m/s"},
                    "heading_deg": {"type": "number", "description": "Heading in degrees 0-360"},
                    "altitude_km": {"type": "number", "description": "Altitude in km (for satellites)"},
                    "coverage_radius_km": {"type": "number", "description": "Radius in km (for stations/zones)"},
                },
                "required": ["actor_type", "label", "location"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "move_actor",
            "description": "Move an existing actor to a new destination.",
            "parameters": {
                "type": "object",
                "properties": {
                    "actor_label": {"type": "string", "description": "Name of the actor to move"},
                    "destination": {"type": "string", "description": "Place name for the destination"},
                    "speed_ms": {"type": "number", "description": "Override speed in m/s"},
                },
                "required": ["actor_label", "destination"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "control_simulation",
            "description": "Control the sandbox simulation (start, pause, resume, reset, set_speed).",
            "parameters": {
                "type": "object",
                "properties": {
                    "action": {
                        "type": "string",
                        "enum": ["start", "pause", "resume", "reset", "set_speed"],
                    },
                    "speed_multiplier": {"type": "number", "description": "Speed multiplier (e.g. 10 for 10x)"},
                },
                "required": ["action"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "hold_actor",
            "description": "Stop an actor and hold its current position.",
            "parameters": {
                "type": "object",
                "properties": {
                    "actor_label": {"type": "string", "description": "Name of the actor to hold"},
                },
                "required": ["actor_label"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "patrol_actor",
            "description": "Set an actor to patrol between waypoints in a loop.",
            "parameters": {
                "type": "object",
                "properties": {
                    "actor_label": {"type": "string", "description": "Name of the actor to patrol"},
                    "waypoints": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "List of place names to patrol between (minimum 2)",
                    },
                    "speed_ms": {"type": "number", "description": "Override speed in m/s"},
                },
                "required": ["actor_label", "waypoints"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "delete_actor",
            "description": "Remove an actor from the sandbox.",
            "parameters": {
                "type": "object",
                "properties": {
                    "actor_label": {"type": "string", "description": "Name of the actor to delete"},
                },
                "required": ["actor_label"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "rename_session",
            "description": "Rename the sandbox session or set its description.",
            "parameters": {
                "type": "object",
                "properties": {
                    "name": {"type": "string", "description": "New session name"},
                    "description": {"type": "string", "description": "Session description"},
                },
            },
        },
    },
]

# Map actor_type from tool call → (actor_class, actor_type) for the DB
_TOOL_ACTOR_CLASS_MAP: dict[str, tuple[str, str]] = {
    "base": ("fixed_ground", "base"),
    "ground_station": ("effect", "ground_station"),
    "defended_zone": ("effect", "defended_zone"),
    "ground_vehicle": ("mobile_ground", "ground_vehicle"),
    "aircraft": ("air", "aircraft"),
    "ship": ("sea", "ship"),
    "satellite": ("orbital", "satellite"),
    "missile": ("weapon", "missile"),
    "interceptor": ("weapon", "interceptor"),
    "sensor": ("effect", "sensor"),
}

_llm_client: Optional[AsyncOpenAI] = None


def _get_sandbox_llm_client() -> Optional[AsyncOpenAI]:
    global _llm_client
    if not settings.REGOLO_API_KEY:
        return None
    if _llm_client is None:
        _llm_client = AsyncOpenAI(
            api_key=settings.REGOLO_API_KEY,
            base_url=settings.REGOLO_BASE_URL,
        )
    return _llm_client


ACTOR_TYPE_MAP: dict[str, tuple[str, str]] = {
    "satellite": ("orbital", "satellite"),
    "base": ("fixed_ground", "base"),
    "ground station": ("fixed_ground", "ground_station"),
    "station": ("fixed_ground", "ground_station"),
    "vehicle": ("mobile_ground", "ground_vehicle"),
    "ground vehicle": ("mobile_ground", "ground_vehicle"),
    "convoy": ("mobile_ground", "ground_vehicle"),
    "aircraft": ("air", "aircraft"),
    "drone": ("air", "aircraft"),
    "ship": ("sea", "ship"),
    "vessel": ("sea", "ship"),
    "missile": ("weapon", "missile"),
    "interceptor": ("weapon", "interceptor"),
    "sensor": ("effect", "sensor"),
    "radar": ("effect", "sensor"),
    "zone": ("effect", "defended_zone"),
    "defended zone": ("effect", "defended_zone"),
    "threat": ("effect", "threat"),
}


class SandboxService:
    """Application service for sandbox sessions and actors."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def create_session(
        self,
        tenant_id: str,
        user_id: str,
        data: SandboxSessionCreate,
    ) -> SandboxSessionSnapshot:
        name = (data.name or "").strip() or "Untitled Sandbox"
        session = SandboxSession(
            tenant_id=tenant_id,
            user_id=user_id,
            name=name,
            description=data.description,
            status="draft",
            is_saved=data.is_saved,
            initial_prompt=data.initial_prompt,
            created_by=user_id,
            updated_by=user_id,
        )
        self.db.add(session)
        await self.db.flush()

        if data.initial_prompt:
            await self._log_command(
                session=session,
                command_type="session_created",
                source="system",
                summary=f"Created sandbox from prompt: {data.initial_prompt}",
                payload={"initial_prompt": data.initial_prompt},
                user_id=user_id,
            )

        logger.info(
            "sandbox_session_created",
            tenant_id=tenant_id,
            user_id=user_id,
            session_id=session.id,
        )
        return await self.get_snapshot(session.id, tenant_id, user_id)

    async def get_snapshot(
        self,
        session_id: str,
        tenant_id: str,
        user_id: str,
    ) -> SandboxSessionSnapshot:
        session = await self._get_session(session_id, tenant_id, user_id)
        actors = await self._list_actors(session.id, tenant_id)
        items = await self._list_scenario_items(session.id, tenant_id)
        commands = await self._list_commands(session.id, tenant_id)
        return self._build_snapshot(session, actors, items, commands)

    async def list_sessions(
        self,
        tenant_id: str,
        user_id: str,
    ) -> list[SandboxSessionSummary]:
        """Return lightweight summaries for all sessions belonging to this user."""
        actor_count_sq = (
            select(
                SandboxActor.session_id,
                sa_func.count(SandboxActor.id).label("cnt"),
            )
            .where(SandboxActor.tenant_id == tenant_id)
            .group_by(SandboxActor.session_id)
            .subquery()
        )

        rows = (
            await self.db.execute(
                select(SandboxSession, sa_func.coalesce(actor_count_sq.c.cnt, 0).label("actor_count"))
                .outerjoin(actor_count_sq, SandboxSession.id == actor_count_sq.c.session_id)
                .where(
                    SandboxSession.tenant_id == tenant_id,
                    SandboxSession.user_id == user_id,
                )
                .order_by(SandboxSession.updated_at.desc())
            )
        ).all()

        return [
            SandboxSessionSummary(
                id=row.SandboxSession.id,
                name=row.SandboxSession.name,
                description=row.SandboxSession.description,
                status=row.SandboxSession.status,
                is_saved=row.SandboxSession.is_saved,
                actor_count=row.actor_count,
                created_at=row.SandboxSession.created_at,
                updated_at=row.SandboxSession.updated_at,
            )
            for row in rows
        ]

    async def create_actor(
        self,
        session_id: str,
        tenant_id: str,
        user_id: str,
        data: SandboxActorCreate,
        source: str = "manual",
    ) -> SandboxSessionSnapshot:
        session = await self._get_session(session_id, tenant_id, user_id)
        actor = self._build_actor_model(session, data, user_id)
        self.db.add(actor)
        await self.db.flush()
        await self._log_command(
            session=session,
            command_type="actor_created",
            source=source,
            summary=f"Created {actor.actor_type} '{actor.label}'",
            payload={"actor_id": actor.id, "actor_type": actor.actor_type, "label": actor.label},
            user_id=user_id,
        )
        return await self.get_snapshot(session_id, tenant_id, user_id)

    async def update_actor(
        self,
        session_id: str,
        actor_id: str,
        tenant_id: str,
        user_id: str,
        data: SandboxActorUpdate,
    ) -> SandboxSessionSnapshot:
        session = await self._get_session(session_id, tenant_id, user_id)
        actor = await self._get_actor(session_id, actor_id, tenant_id)

        if data.label is not None:
            actor.label = data.label
        if data.subtype is not None:
            actor.subtype = data.subtype
        if data.faction is not None:
            actor.faction = data.faction
        if data.visual_config is not None:
            actor.visual_config = deepcopy(data.visual_config)
        if data.capabilities is not None:
            actor.capabilities = deepcopy(data.capabilities)
        if data.behavior is not None:
            actor.behavior = deepcopy(data.behavior)
        if data.state is not None:
            normalized_state = self._normalize_actor_state(
                actor.actor_class,
                actor.actor_type,
                data.state,
                actor.behavior,
            )
            actor.state = normalized_state
            actor.initial_state = deepcopy(normalized_state)

        actor.updated_by = user_id
        await self.db.flush()

        await self._log_command(
            session=session,
            command_type="actor_updated",
            source="manual",
            summary=f"Updated actor '{actor.label}'",
            payload={"actor_id": actor.id},
            user_id=user_id,
        )
        return await self.get_snapshot(session_id, tenant_id, user_id)

    async def delete_actor(
        self,
        session_id: str,
        actor_id: str,
        tenant_id: str,
        user_id: str,
    ) -> SandboxSessionSnapshot:
        session = await self._get_session(session_id, tenant_id, user_id)
        actor = await self._get_actor(session_id, actor_id, tenant_id)
        label = actor.label
        await self.db.delete(actor)
        await self.db.flush()

        await self._log_command(
            session=session,
            command_type="actor_deleted",
            source="manual",
            summary=f"Deleted actor '{label}'",
            payload={"actor_id": actor_id, "label": label},
            user_id=user_id,
        )
        return await self.get_snapshot(session_id, tenant_id, user_id)

    async def create_scenario_item(
        self,
        session_id: str,
        tenant_id: str,
        user_id: str,
        data: SandboxScenarioItemCreate,
        source: str = "manual",
    ) -> SandboxSessionSnapshot:
        session = await self._get_session(session_id, tenant_id, user_id)
        item = SandboxScenarioItem(
            session_id=session.id,
            tenant_id=tenant_id,
            item_type=data.item_type,
            label=data.label,
            source_type=data.source_type,
            source_id=data.source_id,
            payload=deepcopy(data.payload),
            created_by=user_id,
            updated_by=user_id,
        )
        self.db.add(item)
        await self.db.flush()
        await self._log_command(
            session=session,
            command_type="scenario_item_created",
            source=source,
            summary=f"Added {item.item_type} '{item.label}'",
            payload={"item_id": item.id, "item_type": item.item_type},
            user_id=user_id,
        )
        return await self.get_snapshot(session_id, tenant_id, user_id)

    async def control_session(
        self,
        session_id: str,
        tenant_id: str,
        user_id: str,
        request: SandboxSessionControlRequest,
    ) -> SandboxSessionSnapshot:
        session = await self._get_session(session_id, tenant_id, user_id)
        summary = ""

        if request.action == "start":
            session.status = "running"
            summary = "Started sandbox runtime"
        elif request.action == "pause":
            session.status = "paused"
            summary = "Paused sandbox runtime"
        elif request.action == "resume":
            session.status = "running"
            summary = "Resumed sandbox runtime"
        elif request.action == "set_speed":
            if request.time_multiplier is None:
                raise ValidationError("time_multiplier is required for set_speed")
            session.time_multiplier = request.time_multiplier
            summary = f"Set sandbox speed to {request.time_multiplier}x"
        elif request.action == "reset":
            session.status = "draft"
            session.current_time_seconds = 0.0
            actors = await self._list_actors(session.id, tenant_id)
            for actor in actors:
                actor.state = deepcopy(actor.initial_state)
                actor.updated_by = user_id
            summary = "Reset sandbox runtime"

        session.updated_by = user_id
        await self.db.flush()

        await self._log_command(
            session=session,
            command_type=f"session_{request.action}",
            source="system",
            summary=summary,
            payload=request.model_dump(exclude_none=True),
            user_id=user_id,
        )
        return await self.get_snapshot(session_id, tenant_id, user_id)

    async def tick_session(
        self,
        session_id: str,
        tenant_id: str,
        user_id: str,
        request: SandboxTickRequest,
    ) -> SandboxSessionSnapshot:
        session = await self._get_session(session_id, tenant_id, user_id)
        if session.status != "running":
            return await self.get_snapshot(session_id, tenant_id, user_id)

        effective_delta = request.delta_seconds * session.time_multiplier
        session.current_time_seconds += effective_delta
        session.updated_by = user_id

        actors = await self._list_actors(session.id, tenant_id)
        for actor in actors:
            actor.state = self._advance_actor_state(
                actor=actor,
                state=deepcopy(actor.state),
                delta_seconds=effective_delta,
                session_time_seconds=session.current_time_seconds,
                all_actors=actors,
            )
            actor.updated_by = user_id

        await self.db.flush()
        return await self.get_snapshot(session_id, tenant_id, user_id)

    async def import_live_object(
        self,
        session_id: str,
        tenant_id: str,
        user_id: str,
        request: SandboxImportRequest,
    ) -> SandboxSessionSnapshot:
        session = await self._get_session(session_id, tenant_id, user_id)

        if request.source_type == "satellite":
            satellite = await self.db.scalar(
                select(Satellite).where(
                    Satellite.id == request.source_id,
                    Satellite.tenant_id == tenant_id,
                )
            )
            if not satellite:
                raise NotFoundError("Satellite", request.source_id)

            orbit = await self.db.scalar(
                select(Orbit)
                .where(
                    Orbit.satellite_id == satellite.id,
                    Orbit.tenant_id == tenant_id,
                )
                .order_by(Orbit.epoch.desc())
            )
            actor_data = self._build_live_satellite_actor(satellite, orbit)
            if request.drop_position and actor_data.state.get("orbit", {}).get("mode") != "simplified":
                actor_data.state["position"] = request.drop_position.model_dump()
            actor = self._build_actor_model(session, actor_data, user_id)
            self.db.add(actor)
            await self.db.flush()
            await self._log_command(
                session=session,
                command_type="live_import",
                source="import",
                summary=f"Imported live satellite '{satellite.name}' into sandbox",
                payload={"source_type": "satellite", "source_id": satellite.id, "actor_id": actor.id},
                user_id=user_id,
            )
            return await self.get_snapshot(session_id, tenant_id, user_id)

        if request.source_type == "ground_station":
            station = await self.db.scalar(
                select(GroundStation).where(
                    GroundStation.id == request.source_id,
                    GroundStation.tenant_id == tenant_id,
                )
            )
            if not station:
                raise NotFoundError("GroundStation", request.source_id)

            actor_data = SandboxActorCreate(
                actor_class="fixed_ground",
                actor_type="ground_station",
                label=station.name,
                faction=(station.faction or "neutral"),
                provenance="live_cloned",
                state={
                    "position": request.drop_position.model_dump() if request.drop_position else {
                        "lat": station.latitude,
                        "lon": station.longitude,
                        "alt_m": station.altitude_m or 0,
                    }
                },
                capabilities={"organization": station.organization, "country": station.country},
                source_ref={"source_type": "ground_station", "source_id": station.id},
            )
            actor = self._build_actor_model(session, actor_data, user_id)
            self.db.add(actor)
            await self.db.flush()
            await self._log_command(
                session=session,
                command_type="live_import",
                source="import",
                summary=f"Imported ground station '{station.name}' into sandbox",
                payload={"source_type": "ground_station", "source_id": station.id, "actor_id": actor.id},
                user_id=user_id,
            )
            return await self.get_snapshot(session_id, tenant_id, user_id)

        if request.source_type == "ground_vehicle":
            report = await self.db.scalar(
                select(PositionReport)
                .where(
                    PositionReport.tenant_id == tenant_id,
                    or_(
                        PositionReport.id == request.source_id,
                        PositionReport.entity_id == request.source_id,
                    ),
                )
                .order_by(PositionReport.report_time.desc())
            )
            if not report:
                raise NotFoundError("PositionReport", request.source_id)

            actor_data = SandboxActorCreate(
                actor_class="mobile_ground",
                actor_type="ground_vehicle",
                label=report.entity_id,
                faction="neutral",
                provenance="live_cloned",
                state={
                    "position": request.drop_position.model_dump() if request.drop_position else {
                        "lat": report.latitude,
                        "lon": report.longitude,
                        "alt_m": report.altitude_m or 0,
                    },
                    "heading_deg": report.heading_deg or 0,
                    "speed_ms": report.velocity_magnitude_ms or 0,
                },
                source_ref={"source_type": "ground_vehicle", "source_id": report.id, "entity_id": report.entity_id},
            )
            actor = self._build_actor_model(session, actor_data, user_id)
            self.db.add(actor)
            await self.db.flush()
            await self._log_command(
                session=session,
                command_type="live_import",
                source="import",
                summary=f"Imported ground vehicle '{report.entity_id}' into sandbox",
                payload={"source_type": "ground_vehicle", "source_id": report.id, "actor_id": actor.id},
                user_id=user_id,
            )
            return await self.get_snapshot(session_id, tenant_id, user_id)

        conjunction = await self.db.scalar(
            select(ConjunctionEvent).where(
                ConjunctionEvent.id == request.source_id,
                ConjunctionEvent.tenant_id == tenant_id,
            )
        )
        if not conjunction:
            raise NotFoundError("ConjunctionEvent", request.source_id)

        item = SandboxScenarioItem(
            session_id=session.id,
            tenant_id=tenant_id,
            item_type="event",
            label=f"Conjunction {conjunction.id}",
            source_type="conjunction",
            source_id=conjunction.id,
            payload={
                "primary_object_id": conjunction.primary_object_id,
                "secondary_object_id": conjunction.secondary_object_id,
                "tca": conjunction.tca.isoformat() if conjunction.tca else None,
                "miss_distance_km": conjunction.miss_distance_km,
                "risk_level": conjunction.risk_level,
                "is_actionable": conjunction.is_actionable,
            },
            created_by=user_id,
            updated_by=user_id,
        )
        self.db.add(item)
        await self.db.flush()
        await self._log_command(
            session=session,
            command_type="live_import",
            source="import",
            summary=f"Imported conjunction '{conjunction.id}' as scenario event",
            payload={"source_type": "conjunction", "source_id": conjunction.id, "item_id": item.id},
            user_id=user_id,
        )
        return await self.get_snapshot(session_id, tenant_id, user_id)

    async def import_tle(
        self,
        session_id: str,
        tenant_id: str,
        user_id: str,
        request: SandboxTLEImportRequest,
    ) -> SandboxSessionSnapshot:
        """Import a satellite actor from raw TLE text."""
        session = await self._get_session(session_id, tenant_id, user_id)

        lines = [line.strip() for line in request.tle_text.strip().splitlines() if line.strip()]
        line1 = None
        line2 = None
        name_line = None
        for line in lines:
            if line.startswith("1 "):
                line1 = line
            elif line.startswith("2 "):
                line2 = line
            elif line1 is None and line2 is None:
                name_line = line

        if not line1 or not line2:
            raise ValidationError("TLE text must contain two lines starting with '1 ' and '2 '")

        # Parse orbital elements from TLE line 2
        # Cols 8-16: inclination, 17-25: RAAN, 43-51: mean anomaly, 52-63: mean motion
        try:
            inclination_deg = float(line2[8:16].strip())
            raan_deg = float(line2[17:25].strip())
            mean_anomaly_deg = float(line2[43:51].strip())
            mean_motion = float(line2[52:63].strip())
        except (ValueError, IndexError) as exc:
            raise ValidationError(f"Failed to parse TLE orbital elements: {exc}")

        if mean_motion <= 0:
            raise ValidationError("TLE mean motion must be positive")

        # Calculate altitude from mean motion (rev/day) via Kepler's 3rd law
        mu = 3.986004418e14  # Earth GM in m³/s²
        period_seconds = 86_400.0 / mean_motion
        semi_major_axis_m = (mu * (period_seconds / (2.0 * math.pi)) ** 2) ** (1.0 / 3.0)
        altitude_km = (semi_major_axis_m / 1000.0) - 6371.0
        altitude_km = max(160.0, altitude_km)

        # Determine label
        label = request.label or (name_line.strip() if name_line else None) or "TLE Satellite"

        actor_data = SandboxActorCreate(
            actor_class="orbital",
            actor_type="satellite",
            label=label,
            faction=request.faction,
            provenance="agent",
            state={
                "position": {"lat": 0.0, "lon": 0.0, "alt_m": altitude_km * 1000.0},
                "orbit": {
                    "mode": "simplified",
                    "altitude_km": altitude_km,
                    "inclination_deg": inclination_deg,
                    "raan_deg": raan_deg,
                    "anomaly_deg": mean_anomaly_deg,
                },
            },
            behavior={"type": "orbit_keep"},
            source_ref={"source_type": "tle", "tle_line1": line1, "tle_line2": line2},
        )
        actor = self._build_actor_model(session, actor_data, user_id)
        self.db.add(actor)
        await self.db.flush()
        await self._log_command(
            session=session,
            command_type="tle_import",
            source="import",
            summary=f"Imported satellite '{label}' from TLE",
            payload={"actor_id": actor.id, "label": label},
            user_id=user_id,
        )
        return await self.get_snapshot(session_id, tenant_id, user_id)

    async def compile_chat_prompt(
        self,
        session_id: str,
        tenant_id: str,
        user_id: str,
        request: SandboxChatRequest,
    ) -> SandboxChatResponse:
        """Compile a natural-language prompt into sandbox commands via LLM function calling.

        The LLM reads the full prompt and emits one tool_call per action it identifies.
        All tool calls are executed sequentially, then a combined response is returned.
        Falls back to simple regex matching when no LLM client is available.
        """
        session = await self._get_session(session_id, tenant_id, user_id)
        prompt = request.prompt.strip()

        # ---- TLE import is always regex (contains raw TLE data, not NLP) ----
        tle_match = re.search(r"(?:from\s+)?TLE[:\s]+(.+)", prompt, flags=re.IGNORECASE | re.DOTALL)
        if tle_match:
            tle_text = tle_match.group(1).strip()
            pre_tle = prompt[:tle_match.start()].strip()
            label_match = re.search(r"(?:named|called)\s+([A-Za-z0-9 _-]+)", pre_tle, flags=re.IGNORECASE)
            label = label_match.group(1).strip() if label_match else None
            faction = self._extract_faction(prompt.lower())
            snapshot = await self.import_tle(
                session_id=session_id, tenant_id=tenant_id, user_id=user_id,
                request=SandboxTLEImportRequest(tle_text=tle_text, label=label, faction=faction),  # type: ignore[arg-type]
            )
            imported_label = snapshot.actors[-1].label if snapshot.actors else "satellite"
            return SandboxChatResponse(
                message=f"Imported satellite '{imported_label}' from TLE data.",
                applied_commands=["import_tle"],
                snapshot=snapshot,
            )

        # ---- LLM-powered multi-command compilation ----
        client = _get_sandbox_llm_client()
        if client:
            return await self._compile_via_llm(
                client=client,
                session=session,
                session_id=session_id,
                tenant_id=tenant_id,
                user_id=user_id,
                prompt=prompt,
            )

        # ---- Fallback: regex single-command (no LLM key configured) ----
        return await self._compile_via_regex(
            session=session,
            session_id=session_id,
            tenant_id=tenant_id,
            user_id=user_id,
            prompt=prompt,
        )

    # ------------------------------------------------------------------ #
    #  LLM-powered compiler                                               #
    # ------------------------------------------------------------------ #

    async def _compile_via_llm(
        self,
        client: AsyncOpenAI,
        session: SandboxSession,
        session_id: str,
        tenant_id: str,
        user_id: str,
        prompt: str,
    ) -> SandboxChatResponse:
        """Send the prompt to the LLM, execute every tool_call it returns."""
        # Build context: list current actors so the LLM can reference them for moves
        actor_rows = await self._list_actors(session_id, tenant_id)
        actor_summary = ", ".join(f"'{a.label}' ({a.actor_type}, {a.faction})" for a in actor_rows)
        context_msg = f"Current actors in sandbox: [{actor_summary or 'none'}]"

        messages = [
            {"role": "system", "content": _SANDBOX_SYSTEM_PROMPT},
            {"role": "user", "content": f"{context_msg}\n\nUser request: {prompt}"},
        ]

        try:
            response = await client.chat.completions.create(
                model=settings.REGOLO_MODEL,
                messages=messages,
                tools=SANDBOX_TOOLS,
                tool_choice="auto",
                max_tokens=2048,
                temperature=0.1,
            )
        except Exception as e:
            logger.warning("sandbox_llm_call_failed", error=str(e))
            # Fall back to regex
            return await self._compile_via_regex(
                session=session, session_id=session_id,
                tenant_id=tenant_id, user_id=user_id, prompt=prompt,
            )

        choice = response.choices[0] if response.choices else None
        if not choice or not choice.message:
            return await self._compile_via_regex(
                session=session, session_id=session_id,
                tenant_id=tenant_id, user_id=user_id, prompt=prompt,
            )

        tool_calls = choice.message.tool_calls or []
        if not tool_calls:
            # LLM returned text instead of tool calls — use it as the response
            text = choice.message.content or ""
            if text:
                snapshot = await self.get_snapshot(session_id, tenant_id, user_id)
                return SandboxChatResponse(message=text, snapshot=snapshot)
            return await self._compile_via_regex(
                session=session, session_id=session_id,
                tenant_id=tenant_id, user_id=user_id, prompt=prompt,
            )

        # Pre-geocode all locations concurrently to avoid serial network calls
        all_locations: list[str] = []
        for tc in tool_calls:
            try:
                args = json.loads(tc.function.arguments or "{}")
            except json.JSONDecodeError:
                continue
            if tc.function.name == "create_actor" and args.get("location"):
                all_locations.append(args["location"])
            if tc.function.name == "move_actor" and args.get("destination"):
                all_locations.append(args["destination"])
            if tc.function.name == "patrol_actor":
                all_locations.extend(args.get("waypoints", []))
        if all_locations:
            await asyncio.gather(*[_geocode(loc) for loc in all_locations])

        # Execute each tool call (geocode results now in cache)
        applied_commands: list[str] = []
        messages_parts: list[str] = []
        errors: list[str] = []

        for tc in tool_calls:
            func_name = tc.function.name
            try:
                func_args = json.loads(tc.function.arguments or "{}")
            except json.JSONDecodeError:
                func_args = {}

            try:
                if func_name == "create_actor":
                    result = await self._exec_create_actor(
                        session=session, session_id=session_id,
                        tenant_id=tenant_id, user_id=user_id, args=func_args,
                    )
                    applied_commands.append(f"create:{result}")
                    messages_parts.append(f"Created {result}.")

                elif func_name == "move_actor":
                    result = await self._exec_move_actor(
                        session=session, session_id=session_id,
                        tenant_id=tenant_id, user_id=user_id, args=func_args,
                    )
                    applied_commands.append(f"move:{result}")
                    messages_parts.append(f"Moving {result}.")

                elif func_name == "control_simulation":
                    result = await self._exec_control(
                        session_id=session_id, tenant_id=tenant_id,
                        user_id=user_id, args=func_args,
                    )
                    applied_commands.append(result)
                    messages_parts.append(f"Simulation: {result}.")

                elif func_name == "hold_actor":
                    result = await self._exec_hold_actor(
                        session=session, session_id=session_id,
                        tenant_id=tenant_id, user_id=user_id, args=func_args,
                    )
                    applied_commands.append(f"hold:{result}")
                    messages_parts.append(f"{result} holding position.")

                elif func_name == "patrol_actor":
                    result = await self._exec_patrol_actor(
                        session=session, session_id=session_id,
                        tenant_id=tenant_id, user_id=user_id, args=func_args,
                    )
                    applied_commands.append(f"patrol:{result}")
                    messages_parts.append(f"{result} patrolling.")

                elif func_name == "delete_actor":
                    result = await self._exec_delete_actor(
                        session=session, session_id=session_id,
                        tenant_id=tenant_id, user_id=user_id, args=func_args,
                    )
                    applied_commands.append(f"delete:{result}")
                    messages_parts.append(f"Removed {result}.")

                elif func_name == "rename_session":
                    result = await self._exec_rename_session(
                        session=session, user_id=user_id, args=func_args,
                    )
                    applied_commands.append(f"rename:{result}")
                    messages_parts.append(f"Session: {result}.")

                else:
                    errors.append(f"Unknown function: {func_name}")

            except Exception as e:
                err_msg = str(e)
                logger.warning("sandbox_tool_exec_failed", func=func_name, error=err_msg)
                errors.append(f"{func_name}: {err_msg}")

        snapshot = await self.get_snapshot(session_id, tenant_id, user_id)
        message = " ".join(messages_parts)
        if errors:
            message += " Errors: " + "; ".join(errors)
        if not message:
            message = "Done."

        return SandboxChatResponse(
            message=message,
            applied_commands=applied_commands,
            snapshot=snapshot,
        )

    async def _exec_create_actor(
        self, session: SandboxSession, session_id: str,
        tenant_id: str, user_id: str, args: dict,
    ) -> str:
        """Execute a create_actor tool call. Returns a description string."""
        actor_type = args.get("actor_type", "base")
        label = args.get("label", "Unnamed")
        faction = args.get("faction", "neutral")
        location_name = args.get("location", "")
        speed_ms = args.get("speed_ms")
        heading_deg = args.get("heading_deg")
        altitude_km = args.get("altitude_km")
        coverage_km = args.get("coverage_radius_km")

        # Resolve class
        class_info = _TOOL_ACTOR_CLASS_MAP.get(actor_type, ("fixed_ground", actor_type))
        actor_class, db_actor_type = class_info

        # Geocode location + add small random spread (~0.3° ≈ 30km) to prevent stacking
        coords = await _geocode(location_name) if location_name else None
        lat, lon = coords if coords else (0.0, 0.0)
        lat += random.uniform(-0.3, 0.3)
        lon += random.uniform(-0.3, 0.3)

        # Build state
        state: dict[str, Any] = {}
        behavior: dict[str, Any] = {"type": "hold"}
        capabilities: dict[str, Any] = {}

        if actor_class == "orbital":
            alt_km = altitude_km or 400.0
            orbit = {
                "mode": "simplified",
                "altitude_km": alt_km,
                "inclination_deg": 45.0,
                "raan_deg": 0.0,
                "anomaly_deg": 0.0,
            }
            o_lat, o_lon = self._orbit_to_lat_lon(45.0, 0.0, 0.0, 0)
            state = {
                "position": {"lat": o_lat, "lon": o_lon, "alt_m": alt_km * 1000.0},
                "orbit": orbit,
            }
            behavior = {"type": "orbit_keep"}
        else:
            default_alt = 8500.0 if actor_class == "air" else 0.0
            state = {"position": {"lat": lat, "lon": lon, "alt_m": default_alt}}
            if speed_ms is not None:
                state["speed_ms"] = speed_ms
            elif actor_class == "air":
                state["speed_ms"] = 250.0
            elif actor_class == "sea":
                state["speed_ms"] = 15.0
            elif actor_class == "mobile_ground":
                state["speed_ms"] = 20.0
            if heading_deg is not None:
                state["heading_deg"] = heading_deg

        if coverage_km and actor_class == "effect":
            capabilities["coverage_radius_km"] = coverage_km

        data = SandboxActorCreate(
            actor_class=actor_class,  # type: ignore[arg-type]
            actor_type=db_actor_type,
            faction=faction,  # type: ignore[arg-type]
            label=label,
            state=state,
            behavior=behavior,
            capabilities=capabilities,
            provenance="agent",
        )
        await self.create_actor(
            session_id=session_id, tenant_id=tenant_id,
            user_id=user_id, data=data, source="chat",
        )
        loc_desc = location_name or f"{lat:.2f}, {lon:.2f}"
        return f"{faction} {db_actor_type} '{label}' at {loc_desc}"

    async def _exec_move_actor(
        self, session: SandboxSession, session_id: str,
        tenant_id: str, user_id: str, args: dict,
    ) -> str:
        """Execute a move_actor tool call."""
        actor_label = args.get("actor_label", "")
        destination = args.get("destination", "")
        speed_override = args.get("speed_ms")

        actor = await self._find_actor_by_label(session.id, tenant_id, actor_label)
        coords = await _geocode(destination) if destination else None
        if not coords:
            raise ValidationError(f"Could not geocode destination '{destination}'")

        target = {
            "lat": coords[0],
            "lon": coords[1],
            "alt_m": actor.state.get("position", {}).get("alt_m", 0),
        }
        speed_ms = speed_override or actor.state.get("speed_ms", 250)
        actor.behavior = {"type": "move_to", "target": target, "speed_ms": speed_ms}
        actor.updated_by = user_id
        await self.db.flush()
        await self._log_command(
            session=session,
            command_type="actor_behavior_updated",
            source="chat",
            summary=f"Move '{actor.label}' to {destination}",
            payload={"actor_id": actor.id, "behavior": actor.behavior},
            user_id=user_id,
        )
        return f"'{actor.label}' to {destination}"

    async def _exec_control(
        self, session_id: str, tenant_id: str, user_id: str, args: dict,
    ) -> str:
        """Execute a control_simulation tool call."""
        action = args.get("action", "start")
        multiplier = args.get("speed_multiplier")

        if action == "set_speed" and multiplier:
            await self.control_session(
                session_id, tenant_id, user_id,
                SandboxSessionControlRequest(action="set_speed", time_multiplier=multiplier),
            )
            return f"speed:{multiplier:g}x"
        else:
            await self.control_session(
                session_id, tenant_id, user_id,
                SandboxSessionControlRequest(action=action),  # type: ignore[arg-type]
            )
            return action

    async def _exec_hold_actor(
        self, session: SandboxSession, session_id: str,
        tenant_id: str, user_id: str, args: dict,
    ) -> str:
        """Execute a hold_actor tool call."""
        actor_label = args.get("actor_label", "")
        actor = await self._find_actor_by_label(session.id, tenant_id, actor_label)
        actor.behavior = {"type": "hold"}
        actor.updated_by = user_id
        await self.db.flush()
        await self._log_command(
            session=session,
            command_type="actor_behavior_updated",
            source="chat",
            summary=f"Set '{actor.label}' to hold position",
            payload={"actor_id": actor.id, "behavior": actor.behavior},
            user_id=user_id,
        )
        return actor.label

    async def _exec_patrol_actor(
        self, session: SandboxSession, session_id: str,
        tenant_id: str, user_id: str, args: dict,
    ) -> str:
        """Execute a patrol_actor tool call — geocode waypoints concurrently."""
        actor_label = args.get("actor_label", "")
        waypoint_names: list[str] = args.get("waypoints", [])
        speed_override = args.get("speed_ms")

        if len(waypoint_names) < 2:
            raise ValidationError("patrol_actor requires at least 2 waypoints")

        actor = await self._find_actor_by_label(session.id, tenant_id, actor_label)

        # Geocode all waypoints concurrently
        geo_results = await asyncio.gather(*[_geocode(wp) for wp in waypoint_names])
        waypoints: list[dict[str, Any]] = []
        for i, coords in enumerate(geo_results):
            if not coords:
                raise ValidationError(f"Could not geocode waypoint '{waypoint_names[i]}'")
            waypoints.append({
                "lat": coords[0], "lon": coords[1],
                "alt_m": actor.state.get("position", {}).get("alt_m", 0),
            })

        speed_ms = speed_override or actor.state.get("speed_ms", 250)
        actor.behavior = {
            "type": "patrol_loop",
            "waypoints": waypoints,
            "speed_ms": speed_ms,
            "current_waypoint_index": 0,
        }
        actor.updated_by = user_id
        await self.db.flush()
        route_desc = " → ".join(waypoint_names)
        await self._log_command(
            session=session,
            command_type="actor_behavior_updated",
            source="chat",
            summary=f"Patrol '{actor.label}': {route_desc}",
            payload={"actor_id": actor.id, "behavior": actor.behavior},
            user_id=user_id,
        )
        return f"'{actor.label}' ({route_desc})"

    async def _exec_delete_actor(
        self, session: SandboxSession, session_id: str,
        tenant_id: str, user_id: str, args: dict,
    ) -> str:
        """Execute a delete_actor tool call."""
        actor_label = args.get("actor_label", "")
        actor = await self._find_actor_by_label(session.id, tenant_id, actor_label)
        label = actor.label
        await self.db.delete(actor)
        await self.db.flush()
        await self._log_command(
            session=session,
            command_type="actor_deleted",
            source="chat",
            summary=f"Deleted actor '{label}'",
            payload={"actor_id": actor.id, "label": label},
            user_id=user_id,
        )
        return label

    async def _exec_rename_session(
        self, session: SandboxSession, user_id: str, args: dict,
    ) -> str:
        """Execute a rename_session tool call."""
        new_name = args.get("name")
        new_desc = args.get("description")
        parts: list[str] = []
        if new_name:
            session.name = new_name
            parts.append(f"renamed to '{new_name}'")
        if new_desc:
            session.description = new_desc
            parts.append(f"description set")
        session.updated_by = user_id
        await self.db.flush()
        return ", ".join(parts) if parts else "no changes"

    # ------------------------------------------------------------------ #
    #  Regex fallback compiler (no LLM key)                                #
    # ------------------------------------------------------------------ #

    async def _compile_via_regex(
        self,
        session: SandboxSession,
        session_id: str,
        tenant_id: str,
        user_id: str,
        prompt: str,
    ) -> SandboxChatResponse:
        """Simple single-command regex fallback when no LLM is available."""
        prompt_lower = prompt.lower()

        # Runtime controls
        for pattern, action, msg in [
            (r"\b(start|run|play)\b", "start", "Sandbox runtime started."),
            (r"\b(pause|hold runtime)\b", "pause", "Sandbox runtime paused."),
            (r"\b(resume|continue)\b", "resume", "Sandbox runtime resumed."),
            (r"\b(reset)\b", "reset", "Sandbox runtime reset."),
        ]:
            if re.search(pattern, prompt_lower):
                snapshot = await self.control_session(
                    session_id, tenant_id, user_id,
                    SandboxSessionControlRequest(action=action),  # type: ignore[arg-type]
                )
                return SandboxChatResponse(message=msg, applied_commands=[action], snapshot=snapshot)

        # Actor creation
        create_request = await self._infer_actor_create_request(prompt)
        if create_request:
            snapshot = await self.create_actor(
                session_id=session_id, tenant_id=tenant_id,
                user_id=user_id, data=create_request, source="chat",
            )
            return SandboxChatResponse(
                message=f"Created {create_request.actor_type} '{create_request.label}'.",
                applied_commands=[f"create:{create_request.actor_type}"],
                snapshot=snapshot,
            )

        # Speed
        speed_match = re.search(r"\b(?:set\s+)?speed(?:\s+to)?\s+(\d+(?:\.\d+)?)x?\b", prompt_lower)
        if speed_match:
            multiplier = float(speed_match.group(1))
            snapshot = await self.control_session(
                session_id, tenant_id, user_id,
                SandboxSessionControlRequest(action="set_speed", time_multiplier=multiplier),
            )
            return SandboxChatResponse(
                message=f"Speed set to {multiplier:g}x.",
                applied_commands=[f"set_speed:{multiplier:g}"],
                snapshot=snapshot,
            )

        # Move (NL)
        nl_move = re.search(
            r"\b(?:move|send|relocate)\s+(?P<label>.+?)\s+(?:to|toward|towards)\s+(?P<place>[A-Za-z][A-Za-z\s'-]+)",
            prompt, flags=re.IGNORECASE,
        )
        if nl_move:
            place = nl_move.group("place").strip()
            geo = await _geocode(place)
            if geo:
                actor = await self._find_actor_by_label(session.id, tenant_id, nl_move.group("label").strip())
                target = {"lat": geo[0], "lon": geo[1], "alt_m": actor.state.get("position", {}).get("alt_m", 0)}
                actor.behavior = {"type": "move_to", "target": target, "speed_ms": actor.state.get("speed_ms", 250)}
                actor.updated_by = user_id
                await self.db.flush()
                snapshot = await self.get_snapshot(session_id, tenant_id, user_id)
                return SandboxChatResponse(
                    message=f"{actor.label} moving to {place}.",
                    applied_commands=[f"move:{actor.label}"],
                    snapshot=snapshot,
                )

        # Hold
        hold_match = re.search(r"\b(?:hold|stop)\s+(?P<label>.+)", prompt, flags=re.IGNORECASE)
        if hold_match:
            actor = await self._find_actor_by_label(session.id, tenant_id, hold_match.group("label"))
            actor.behavior = {"type": "hold"}
            actor.updated_by = user_id
            await self.db.flush()
            snapshot = await self.get_snapshot(session_id, tenant_id, user_id)
            return SandboxChatResponse(
                message=f"{actor.label} holding position.",
                applied_commands=[f"hold:{actor.label}"],
                snapshot=snapshot,
            )

        # Delete
        delete_match = re.search(r"\b(?:remove|delete|destroy)\s+(?P<label>.+)", prompt, flags=re.IGNORECASE)
        if delete_match:
            actor = await self._find_actor_by_label(session.id, tenant_id, delete_match.group("label").strip())
            label = actor.label
            await self.db.delete(actor)
            await self.db.flush()
            await self._log_command(
                session=session, command_type="actor_deleted", source="chat",
                summary=f"Deleted actor '{label}'",
                payload={"actor_id": actor.id, "label": label}, user_id=user_id,
            )
            snapshot = await self.get_snapshot(session_id, tenant_id, user_id)
            return SandboxChatResponse(
                message=f"Removed {label}.",
                applied_commands=[f"delete:{label}"],
                snapshot=snapshot,
            )

        snapshot = await self.get_snapshot(session_id, tenant_id, user_id)
        return SandboxChatResponse(
            message="Describe what you want: create actors, move them, patrol, delete, or control the simulation. Example: 'Create allied base in Rome, a hostile aircraft near Belgrade, and start at 5x speed'",
            snapshot=snapshot,
        )

    async def _get_session(
        self,
        session_id: str,
        tenant_id: str,
        user_id: str,
    ) -> SandboxSession:
        session = await self.db.scalar(
            select(SandboxSession).where(
                SandboxSession.id == session_id,
                SandboxSession.tenant_id == tenant_id,
                SandboxSession.user_id == user_id,
            )
        )
        if not session:
            raise NotFoundError("SandboxSession", session_id)
        return session

    async def _get_actor(
        self,
        session_id: str,
        actor_id: str,
        tenant_id: str,
    ) -> SandboxActor:
        actor = await self.db.scalar(
            select(SandboxActor).where(
                SandboxActor.id == actor_id,
                SandboxActor.session_id == session_id,
                SandboxActor.tenant_id == tenant_id,
            )
        )
        if not actor:
            raise NotFoundError("SandboxActor", actor_id)
        return actor

    async def _find_actor_by_label(
        self,
        session_id: str,
        tenant_id: str,
        label: str,
    ) -> SandboxActor:
        cleaned = label.strip().strip("\"'")
        actor = await self.db.scalar(
            select(SandboxActor).where(
                SandboxActor.session_id == session_id,
                SandboxActor.tenant_id == tenant_id,
                SandboxActor.label.ilike(cleaned),
            )
        )
        if actor:
            return actor

        actors = await self._list_actors(session_id, tenant_id)
        lowered = cleaned.lower()
        for candidate in actors:
            if candidate.label.lower() == lowered or lowered in candidate.label.lower():
                return candidate
        raise NotFoundError("SandboxActor", cleaned)

    async def _list_actors(self, session_id: str, tenant_id: str) -> list[SandboxActor]:
        result = await self.db.scalars(
            select(SandboxActor)
            .where(
                SandboxActor.session_id == session_id,
                SandboxActor.tenant_id == tenant_id,
            )
            .order_by(SandboxActor.created_at.asc())
        )
        return list(result.all())

    async def _list_scenario_items(
        self,
        session_id: str,
        tenant_id: str,
    ) -> list[SandboxScenarioItem]:
        result = await self.db.scalars(
            select(SandboxScenarioItem)
            .where(
                SandboxScenarioItem.session_id == session_id,
                SandboxScenarioItem.tenant_id == tenant_id,
            )
            .order_by(SandboxScenarioItem.created_at.asc())
        )
        return list(result.all())

    async def _list_commands(self, session_id: str, tenant_id: str) -> list[SandboxCommand]:
        result = await self.db.scalars(
            select(SandboxCommand)
            .where(
                SandboxCommand.session_id == session_id,
                SandboxCommand.tenant_id == tenant_id,
            )
            .order_by(SandboxCommand.created_at.asc())
        )
        return list(result.all())

    def _build_snapshot(
        self,
        session: SandboxSession,
        actors: list[SandboxActor],
        items: list[SandboxScenarioItem],
        commands: list[SandboxCommand],
    ) -> SandboxSessionSnapshot:
        return SandboxSessionSnapshot(
            session=SandboxSessionRead.model_validate(session),
            actors=[SandboxActorRead.model_validate(actor) for actor in actors],
            scenario_items=[SandboxScenarioItemRead.model_validate(item) for item in items],
            commands=[SandboxCommandRead.model_validate(command) for command in commands],
        )

    async def _log_command(
        self,
        session: SandboxSession,
        command_type: str,
        source: str,
        summary: str,
        payload: dict[str, Any],
        user_id: str,
    ) -> None:
        command = SandboxCommand(
            session_id=session.id,
            tenant_id=session.tenant_id,
            command_type=command_type,
            source=source,
            summary=summary,
            payload=deepcopy(payload),
            created_by=user_id,
            updated_by=user_id,
        )
        self.db.add(command)
        await self.db.flush()

    def _build_actor_model(
        self,
        session: SandboxSession,
        data: SandboxActorCreate,
        user_id: str,
    ) -> SandboxActor:
        behavior = deepcopy(data.behavior) or {"type": "hold"}
        state = self._normalize_actor_state(data.actor_class, data.actor_type, data.state, behavior)
        visual_config = self._build_visual_config(data.actor_type, data.faction, data.visual_config)
        return SandboxActor(
            session_id=session.id,
            tenant_id=session.tenant_id,
            actor_class=data.actor_class,
            actor_type=data.actor_type,
            subtype=data.subtype,
            faction=data.faction,
            label=data.label,
            provenance=data.provenance,
            visual_config=visual_config,
            state=state,
            initial_state=deepcopy(state),
            capabilities=deepcopy(data.capabilities),
            behavior=behavior,
            source_ref=deepcopy(data.source_ref),
            created_by=user_id,
            updated_by=user_id,
        )

    def _normalize_actor_state(
        self,
        actor_class: str,
        actor_type: str,
        state: dict[str, Any],
        behavior: dict[str, Any],
    ) -> dict[str, Any]:
        normalized = deepcopy(state)

        position = deepcopy(normalized.get("position", {}))
        position.setdefault("lat", 0.0)
        position.setdefault("lon", 0.0)
        position.setdefault("alt_m", 0.0)
        position["lat"] = self._clamp_lat(float(position["lat"]))
        position["lon"] = self._normalize_lon(float(position["lon"]))
        position["alt_m"] = max(0.0, float(position["alt_m"]))
        normalized["position"] = position

        if "heading_deg" in normalized:
            normalized["heading_deg"] = float(normalized["heading_deg"]) % 360.0
        if "speed_ms" in normalized:
            normalized["speed_ms"] = max(0.0, float(normalized["speed_ms"]))

        if actor_class == "orbital":
            orbit = deepcopy(normalized.get("orbit", {}))
            mode = orbit.get("mode")
            if mode == "simplified":
                orbit.setdefault("altitude_km", max(160.0, position["alt_m"] / 1000.0 or 500.0))
                orbit.setdefault("inclination_deg", 45.0)
                orbit.setdefault("raan_deg", 0.0)
                orbit.setdefault("anomaly_deg", 0.0)
                orbit["altitude_km"] = max(160.0, float(orbit["altitude_km"]))
                orbit["inclination_deg"] = min(180.0, max(0.0, float(orbit["inclination_deg"])))
                orbit["raan_deg"] = float(orbit["raan_deg"]) % 360.0
                orbit["anomaly_deg"] = float(orbit["anomaly_deg"]) % 360.0
                lat, lon = self._orbit_to_lat_lon(
                    inclination_deg=orbit["inclination_deg"],
                    raan_deg=orbit["raan_deg"],
                    anomaly_deg=orbit["anomaly_deg"],
                    session_time_seconds=0,
                )
                normalized["position"] = {
                    "lat": lat,
                    "lon": lon,
                    "alt_m": orbit["altitude_km"] * 1000.0,
                }
            elif mode != "pseudo":
                orbit["mode"] = "pseudo"
            normalized["orbit"] = orbit

        if behavior.get("type") == "move_to":
            target = deepcopy(behavior.get("target", {}))
            if "lat" in target and "lon" in target:
                target["lat"] = self._clamp_lat(float(target["lat"]))
                target["lon"] = self._normalize_lon(float(target["lon"]))
                target["alt_m"] = max(0.0, float(target.get("alt_m", position["alt_m"])))
                behavior["target"] = target

        if actor_type in {"ground_vehicle", "aircraft", "ship"}:
            normalized.setdefault("heading_deg", 0.0)
            normalized.setdefault("speed_ms", 0.0)

        return normalized

    def _build_live_satellite_actor(
        self,
        satellite: Satellite,
        orbit: Optional[Orbit],
    ) -> SandboxActorCreate:
        orbit_state: dict[str, Any] = {"mode": "pseudo"}
        state: dict[str, Any] = {"position": {"lat": 0.0, "lon": 0.0, "alt_m": 500_000.0}}
        behavior: dict[str, Any] = {"type": "hold"}

        if orbit and orbit.apogee_km:
            anomaly_deg = orbit.mean_anomaly_deg or 0.0
            inclination_deg = orbit.inclination_deg or 0.0
            raan_deg = orbit.raan_deg or 0.0
            lat, lon = self._orbit_to_lat_lon(
                inclination_deg=inclination_deg,
                raan_deg=raan_deg,
                anomaly_deg=anomaly_deg,
                session_time_seconds=0,
            )
            orbit_state = {
                "mode": "simplified",
                "altitude_km": orbit.apogee_km,
                "inclination_deg": inclination_deg,
                "raan_deg": raan_deg,
                "anomaly_deg": anomaly_deg,
            }
            state = {
                "position": {"lat": lat, "lon": lon, "alt_m": orbit.apogee_km * 1000.0},
                "orbit": orbit_state,
            }
            behavior = {"type": "orbit_keep"}

        return SandboxActorCreate(
            actor_class="orbital",
            actor_type="satellite",
            label=satellite.name,
            faction=(satellite.faction or "neutral"),
            provenance="live_cloned",
            state=state,
            capabilities={
                "norad_id": satellite.norad_id,
                "country": satellite.country,
                "operator": satellite.operator,
                "tags": satellite.tags or [],
            },
            behavior=behavior,
            source_ref={
                "source_type": "satellite",
                "source_id": satellite.id,
                "norad_id": satellite.norad_id,
            },
        )

    def _advance_actor_state(
        self,
        actor: SandboxActor,
        state: dict[str, Any],
        delta_seconds: float,
        session_time_seconds: float,
        all_actors: list | None = None,
    ) -> dict[str, Any]:
        behavior = actor.behavior or {}
        behavior_type = behavior.get("type", "hold")

        if actor.actor_class == "orbital":
            orbit = state.get("orbit", {})
            if orbit.get("mode") == "simplified":
                altitude_km = float(orbit.get("altitude_km", max(160.0, state["position"]["alt_m"] / 1000.0)))
                period_seconds = self._orbital_period_seconds(altitude_km)
                anomaly_delta = (360.0 * delta_seconds) / period_seconds if period_seconds > 0 else 0.0
                orbit["anomaly_deg"] = (float(orbit.get("anomaly_deg", 0.0)) + anomaly_delta) % 360.0
                lat, lon = self._orbit_to_lat_lon(
                    inclination_deg=float(orbit.get("inclination_deg", 0.0)),
                    raan_deg=float(orbit.get("raan_deg", 0.0)),
                    anomaly_deg=float(orbit.get("anomaly_deg", 0.0)),
                    session_time_seconds=session_time_seconds,
                )
                state["orbit"] = orbit
                state["position"] = {
                    "lat": lat,
                    "lon": lon,
                    "alt_m": altitude_km * 1000.0,
                }
                return state

        if behavior_type == "move_to":
            target = behavior.get("target") or {}
            if "lat" not in target or "lon" not in target:
                return state
            current = state.get("position", {})
            speed_ms = float(behavior.get("speed_ms") or state.get("speed_ms") or 250.0)
            next_position, arrived, heading_deg = self._step_towards(
                current=current,
                target=target,
                speed_ms=speed_ms,
                delta_seconds=delta_seconds,
            )
            state["position"] = next_position
            state["speed_ms"] = speed_ms
            state["heading_deg"] = heading_deg
            if arrived:
                actor.behavior = {"type": "hold"}
            return state

        if behavior_type == "patrol_loop":
            waypoints = behavior.get("waypoints") or []
            if not waypoints:
                return state
            idx = int(behavior.get("current_waypoint_index", 0)) % len(waypoints)
            target = waypoints[idx]
            current = state.get("position", {})
            speed_ms = float(behavior.get("speed_ms") or state.get("speed_ms") or 250.0)
            next_position, arrived, heading_deg = self._step_towards(
                current=current,
                target=target,
                speed_ms=speed_ms,
                delta_seconds=delta_seconds,
            )
            state["position"] = next_position
            state["speed_ms"] = speed_ms
            state["heading_deg"] = heading_deg
            if arrived:
                behavior["current_waypoint_index"] = (idx + 1) % len(waypoints)
                actor.behavior = deepcopy(behavior)
            return state

        if behavior_type == "follow_waypoints":
            waypoints = behavior.get("waypoints") or []
            if not waypoints:
                return state
            idx = int(behavior.get("current_waypoint_index", 0))
            if idx >= len(waypoints):
                actor.behavior = {"type": "hold"}
                return state
            target = waypoints[idx]
            current = state.get("position", {})
            speed_ms = float(behavior.get("speed_ms") or state.get("speed_ms") or 250.0)
            next_position, arrived, heading_deg = self._step_towards(
                current=current,
                target=target,
                speed_ms=speed_ms,
                delta_seconds=delta_seconds,
            )
            state["position"] = next_position
            state["speed_ms"] = speed_ms
            state["heading_deg"] = heading_deg
            if arrived:
                next_idx = idx + 1
                if next_idx >= len(waypoints):
                    actor.behavior = {"type": "hold"}
                else:
                    behavior["current_waypoint_index"] = next_idx
                    actor.behavior = deepcopy(behavior)
            return state

        if behavior_type == "approach_target":
            target_actor_id = behavior.get("target_actor_id")
            if not target_actor_id or not all_actors:
                return state
            target_actor = None
            for a in all_actors:
                if a.id == target_actor_id:
                    target_actor = a
                    break
            if not target_actor:
                return state
            target_state = target_actor.state if isinstance(target_actor.state, dict) else {}
            target_pos = target_state.get("position", {})
            if "lat" not in target_pos or "lon" not in target_pos:
                return state
            current = state.get("position", {})
            speed_ms = float(behavior.get("speed_ms") or state.get("speed_ms") or 250.0)
            next_position, arrived, heading_deg = self._step_towards(
                current=current,
                target=target_pos,
                speed_ms=speed_ms,
                delta_seconds=delta_seconds,
            )
            state["position"] = next_position
            state["speed_ms"] = speed_ms
            state["heading_deg"] = heading_deg
            return state

        if behavior_type == "hold":
            return state

        return state

    async def _infer_actor_create_request(self, prompt: str) -> Optional[SandboxActorCreate]:
        lower = prompt.lower()
        if not re.search(r"\b(create|add|spawn|place)\b", lower):
            return None

        actor_class: Optional[str] = None
        actor_type: Optional[str] = None
        matched_phrase = ""
        for phrase, actor_info in sorted(ACTOR_TYPE_MAP.items(), key=lambda item: len(item[0]), reverse=True):
            if phrase in lower:
                actor_class, actor_type = actor_info
                matched_phrase = phrase
                break

        if not actor_class or not actor_type:
            return None

        faction = self._extract_faction(lower)
        label = self._extract_label(prompt, actor_type, faction, matched_phrase)
        coordinates = self._extract_coordinates(prompt)
        altitude_value = self._extract_altitude(prompt)
        speed_value = self._extract_speed(prompt)
        heading_value = self._extract_heading(prompt)
        inclination_value = self._extract_named_float(prompt, "inclination")
        raan_value = self._extract_named_float(prompt, "raan")
        anomaly_value = self._extract_named_float(prompt, "anomaly")

        # Fallback: geocode a place name if no explicit lat/lon
        if not coordinates:
            geo = await _extract_location_from_prompt(prompt)
            if geo:
                coordinates = {"lat": geo[0], "lon": geo[1]}

        if actor_type != "satellite" and not coordinates:
            raise ValidationError(
                "Could not determine location. Use a place name (e.g. 'in Rome') "
                "or coordinates (e.g. '41.9, 12.5')."
            )

        state: dict[str, Any] = {}
        behavior: dict[str, Any] = {"type": "hold"}
        capabilities: dict[str, Any] = {}

        if actor_type == "satellite":
            if altitude_value:
                orbit = {
                    "mode": "simplified",
                    "altitude_km": altitude_value["km"],
                    "inclination_deg": inclination_value if inclination_value is not None else 45.0,
                    "raan_deg": raan_value if raan_value is not None else 0.0,
                    "anomaly_deg": anomaly_value if anomaly_value is not None else 0.0,
                }
                lat, lon = self._orbit_to_lat_lon(
                    inclination_deg=float(orbit["inclination_deg"]),
                    raan_deg=float(orbit["raan_deg"]),
                    anomaly_deg=float(orbit["anomaly_deg"]),
                    session_time_seconds=0,
                )
                state = {
                    "position": {"lat": lat, "lon": lon, "alt_m": orbit["altitude_km"] * 1000.0},
                    "orbit": orbit,
                }
                behavior = {"type": "orbit_keep"}
            elif coordinates:
                state = {
                    "position": {
                        "lat": coordinates["lat"],
                        "lon": coordinates["lon"],
                        "alt_m": altitude_value["m"] if altitude_value else 500_000.0,
                    },
                    "orbit": {"mode": "pseudo"},
                }
                capabilities["orbital_mode"] = "pseudo"
            else:
                raise ValidationError(
                    "Satellite creation requires either orbital altitude or explicit coordinates"
                )
        else:
            state = {
                "position": {
                    "lat": coordinates["lat"],
                    "lon": coordinates["lon"],
                    "alt_m": altitude_value["m"] if altitude_value else 0.0,
                }
            }
            if heading_value is not None:
                state["heading_deg"] = heading_value
            if speed_value is not None:
                state["speed_ms"] = speed_value

        return SandboxActorCreate(
            actor_class=actor_class,  # type: ignore[arg-type]
            actor_type=actor_type,
            faction=faction,  # type: ignore[arg-type]
            label=label,
            state=state,
            behavior=behavior,
            capabilities=capabilities,
            provenance="agent",
        )

    def _extract_faction(self, lower: str) -> str:
        if "hostile" in lower or "enemy" in lower or "adversary" in lower:
            return "hostile"
        if "allied" in lower or "friendly" in lower:
            return "allied"
        if "unknown" in lower:
            return "unknown"
        return "neutral"

    def _extract_label(
        self,
        prompt: str,
        actor_type: str,
        faction: str,
        matched_phrase: str,
    ) -> str:
        quoted = re.search(r'"([^"]+)"', prompt)
        if quoted:
            return quoted.group(1).strip()

        named_match = re.search(
            r"\b(?:named|called)\s+([A-Za-z0-9 _-]+?)(?=\s+(?:at|with|heading|speed)\b|$)",
            prompt,
            flags=re.IGNORECASE,
        )
        if named_match:
            return named_match.group(1).strip().rstrip(".")

        pretty_type = actor_type.replace("_", " ")
        pretty_phrase = matched_phrase.strip()
        return f"{faction.title()} {pretty_phrase or pretty_type}".strip()

    def _extract_coordinates(self, prompt: str) -> Optional[dict[str, float]]:
        match = re.search(
            r"(?P<lat>-?\d+(?:\.\d+)?)\s*,\s*(?P<lon>-?\d+(?:\.\d+)?)",
            prompt,
        )
        if not match:
            return None
        return {
            "lat": self._clamp_lat(float(match.group("lat"))),
            "lon": self._normalize_lon(float(match.group("lon"))),
        }

    def _extract_altitude(self, prompt: str) -> Optional[dict[str, float]]:
        match = re.search(
            r"(?P<value>\d+(?:\.\d+)?)\s*(?P<unit>km|kilometers|kilometres|m|meters|metres)\b(?:\s*(?:altitude|high|orbit|orbita))?",
            prompt,
            flags=re.IGNORECASE,
        )
        if not match:
            return None
        value = float(match.group("value"))
        unit = match.group("unit").lower()
        if unit.startswith("k"):
            return {"km": value, "m": value * 1000.0}
        return {"km": value / 1000.0, "m": value}

    def _extract_speed(self, prompt: str) -> Optional[float]:
        # Try explicit unit first
        match = re.search(
            r"(?P<value>\d+(?:\.\d+)?)\s*(?P<unit>m/s|km/h|kph|knots)\b",
            prompt,
            flags=re.IGNORECASE,
        )
        if match:
            value = float(match.group("value"))
            unit = match.group("unit").lower()
            if unit == "m/s":
                return value
            if unit in {"km/h", "kph"}:
                return value / 3.6
            return value * 0.514444
        # Bare number after "speed" keyword — assume m/s
        bare = re.search(
            r"\bspeed\s+(?:of\s+)?(\d+(?:\.\d+)?)\b",
            prompt,
            flags=re.IGNORECASE,
        )
        if bare:
            return float(bare.group(1))
        return None

    def _extract_heading(self, prompt: str) -> Optional[float]:
        match = re.search(
            r"(?:heading|course)\s*(?:of|to)?\s*(\d+(?:\.\d+)?)",
            prompt,
            flags=re.IGNORECASE,
        )
        if not match:
            return None
        return float(match.group(1)) % 360.0

    def _extract_named_float(self, prompt: str, field: str) -> Optional[float]:
        match = re.search(
            rf"{field}\s*(?:of|to)?\s*(-?\d+(?:\.\d+)?)",
            prompt,
            flags=re.IGNORECASE,
        )
        if not match:
            return None
        return float(match.group(1))

    def _build_visual_config(
        self,
        actor_type: str,
        faction: str,
        visual_config: dict[str, Any],
    ) -> dict[str, Any]:
        config = deepcopy(visual_config)
        config.setdefault(
            "color",
            {
                "allied": "#38bdf8",
                "hostile": "#fb7185",
                "neutral": "#fbbf24",
                "unknown": "#c084fc",
            }.get(faction, "#fbbf24"),
        )
        config.setdefault("icon", actor_type)
        return config

    def _step_towards(
        self,
        current: dict[str, Any],
        target: dict[str, Any],
        speed_ms: float,
        delta_seconds: float,
    ) -> tuple[dict[str, float], bool, float]:
        current_lat = math.radians(float(current.get("lat", 0.0)))
        current_lon = math.radians(float(current.get("lon", 0.0)))
        target_lat = math.radians(float(target.get("lat", 0.0)))
        target_lon = math.radians(float(target.get("lon", 0.0)))
        distance_m = self._great_circle_distance(current_lat, current_lon, target_lat, target_lon)
        step_distance = max(0.0, speed_ms * delta_seconds)

        heading_deg = self._bearing_degrees(current_lat, current_lon, target_lat, target_lon)
        if distance_m <= step_distance or distance_m <= 1.0:
            return (
                {
                    "lat": self._clamp_lat(float(target.get("lat", 0.0))),
                    "lon": self._normalize_lon(float(target.get("lon", 0.0))),
                    "alt_m": max(0.0, float(target.get("alt_m", current.get("alt_m", 0.0)))),
                },
                True,
                heading_deg,
            )

        angular_distance = step_distance / EARTH_RADIUS_M
        theta = math.radians(heading_deg)
        next_lat = math.asin(
            math.sin(current_lat) * math.cos(angular_distance)
            + math.cos(current_lat) * math.sin(angular_distance) * math.cos(theta)
        )
        next_lon = current_lon + math.atan2(
            math.sin(theta) * math.sin(angular_distance) * math.cos(current_lat),
            math.cos(angular_distance) - math.sin(current_lat) * math.sin(next_lat),
        )

        return (
            {
                "lat": self._clamp_lat(math.degrees(next_lat)),
                "lon": self._normalize_lon(math.degrees(next_lon)),
                "alt_m": max(0.0, float(current.get("alt_m", 0.0))),
            },
            False,
            heading_deg,
        )

    def _great_circle_distance(
        self,
        lat1: float,
        lon1: float,
        lat2: float,
        lon2: float,
    ) -> float:
        dlat = lat2 - lat1
        dlon = lon2 - lon1
        a = (
            math.sin(dlat / 2) ** 2
            + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
        )
        return 2 * EARTH_RADIUS_M * math.asin(min(1.0, math.sqrt(a)))

    def _bearing_degrees(self, lat1: float, lon1: float, lat2: float, lon2: float) -> float:
        y = math.sin(lon2 - lon1) * math.cos(lat2)
        x = (
            math.cos(lat1) * math.sin(lat2)
            - math.sin(lat1) * math.cos(lat2) * math.cos(lon2 - lon1)
        )
        return (math.degrees(math.atan2(y, x)) + 360.0) % 360.0

    def _orbital_period_seconds(self, altitude_km: float) -> float:
        semi_major_axis_m = (6_371.0 + altitude_km) * 1000.0
        mu = 3.986004418e14
        return 2 * math.pi * math.sqrt((semi_major_axis_m ** 3) / mu)

    def _orbit_to_lat_lon(
        self,
        inclination_deg: float,
        raan_deg: float,
        anomaly_deg: float,
        session_time_seconds: float,
    ) -> tuple[float, float]:
        inclination = math.radians(inclination_deg)
        raan = math.radians(raan_deg)
        anomaly = math.radians(anomaly_deg)
        lat = math.asin(math.sin(inclination) * math.sin(anomaly))
        lon = math.atan2(math.cos(inclination) * math.sin(anomaly), math.cos(anomaly)) + raan
        earth_rotation = (session_time_seconds / SIDEREAL_DAY_SECONDS) * 2 * math.pi
        lon -= earth_rotation
        return self._clamp_lat(math.degrees(lat)), self._normalize_lon(math.degrees(lon))

    def _clamp_lat(self, value: float) -> float:
        return max(-90.0, min(90.0, value))

    def _normalize_lon(self, value: float) -> float:
        normalized = ((value + 180.0) % 360.0) - 180.0
        return 180.0 if normalized == -180.0 else normalized
