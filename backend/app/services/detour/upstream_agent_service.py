"""Adapter service for vendored upstream Detour agent pipeline.

This service executes the imported keanucz/detour multi-agent pipeline and
persists execution state into SDA's DetourAgentSession model.
"""

from __future__ import annotations

import asyncio
from datetime import datetime, timedelta
from typing import Any, AsyncGenerator, Dict, Optional

from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.exceptions import NotFoundError, SDAException
from app.core.logging import get_logger
from app.db.base import async_session_factory, generate_uuid
from app.db.models.detour import DetourAgentSession, DetourAgentSessionStatus
from app.db.models.ontology import ConjunctionEvent, Orbit, Satellite
from app.monitoring import DETOUR_ANALYSES_TOTAL
from app.physics.propagator import tle_to_state_vector
from app.vendors.detour_upstream.agents.config import LLMConfig
from app.vendors.detour_upstream.agents.config_adapter import build_sda_default_config
from app.vendors.detour_upstream.agents.graph import stream_avoidance_pipeline
from app.vendors.detour_upstream.api.demo_data import load_demo_data
from app.vendors.detour_upstream.api.state import (
    OrbitalObject,
    get_catalog,
    get_cdm_inbox,
    get_satellite,
    reset_state,
    set_satellite,
)
from app.vendors.detour_upstream.engine.models.active_satellite import (
    Satellite as UpstreamSatellite,
    SatelliteConfig,
)
from app.vendors.detour_upstream.tools.screening import screen_conjunctions

logger = get_logger(__name__)


class UpstreamDetourAgentService:
    """Run and track vendored upstream Detour agent sessions."""

    _demo_lock = asyncio.Lock()
    _active_tasks: set[asyncio.Task[Any]] = set()

    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    @staticmethod
    def _status_value(session: DetourAgentSession) -> str:
        status = session.status
        return status.value if hasattr(status, "value") else str(status)

    @staticmethod
    def _build_llm_config() -> LLMConfig:
        return build_sda_default_config()

    @staticmethod
    def _build_prompt(
        conjunction: ConjunctionEvent,
        primary: Optional[Satellite],
        secondary: Optional[Satellite],
    ) -> str:
        primary_name = primary.name if primary else conjunction.primary_object_id
        secondary_name = secondary.name if secondary else conjunction.secondary_object_id
        primary_norad = primary.norad_id if primary else "unknown"
        secondary_norad = secondary.norad_id if secondary else "unknown"
        tca = conjunction.tca.isoformat() if conjunction.tca else "unknown"
        miss = conjunction.miss_distance_km
        risk = conjunction.risk_level
        return (
            "Analyze conjunction risk and provide an operator brief.\n"
            f"Conjunction ID: {conjunction.id}\n"
            f"Primary object: {primary_name} (SDA ID {conjunction.primary_object_id}, NORAD {primary_norad})\n"
            f"Secondary object: {secondary_name} (SDA ID {conjunction.secondary_object_id}, NORAD {secondary_norad})\n"
            f"TCA: {tca}\n"
            f"Miss distance (km): {miss}\n"
            f"Risk level: {risk}\n"
            "When a tool requires object identifiers, use the integer NORAD IDs above and not the SDA UUIDs.\n"
            "Use the available tools to assess threats and suggest avoidance actions.\n"
            "Be concise and operational."
        )

    @staticmethod
    def _update_output_from_event(output_data: Dict[str, Any], event: Dict[str, Any]) -> None:
        event_type = event.get("type")
        if event_type != "agent_output":
            return
        agent = str(event.get("agent", ""))
        content = event.get("content")
        if not isinstance(content, str):
            return
        if agent == "ops_brief":
            output_data["ops_brief"] = content
            return
        if agent in {"scout", "analyst", "planner", "safety"}:
            output_data[f"{agent}_output"] = content

    @staticmethod
    def _build_upstream_satellite(runtime_state: Dict[str, Any]) -> UpstreamSatellite:
        return UpstreamSatellite(
            position=runtime_state["position_m"],
            velocity=runtime_state["velocity_m_s"],
            config=SatelliteConfig(
                name=runtime_state["name"],
                norad_id=int(runtime_state["norad_id"]),
            ),
        )

    @staticmethod
    def _upsert_catalog_object(runtime_state: Dict[str, Any]) -> None:
        catalog = get_catalog()
        catalog.add(
            OrbitalObject(
                norad_id=int(runtime_state["norad_id"]),
                name=str(runtime_state["name"]),
                position=runtime_state["position_m"],
                velocity=runtime_state["velocity_m_s"],
                object_type=str(runtime_state.get("object_type") or "satellite"),
            )
        )

    async def _prepare_runtime_context(
        self,
        primary_satellite_id: str,
        secondary_satellite_id: str | None = None,
        conjunction: ConjunctionEvent | None = None,
    ) -> Dict[str, Any]:
        primary_runtime = await self._resolve_requested_satellite_state(primary_satellite_id)
        secondary_runtime = (
            await self._resolve_requested_satellite_state(secondary_satellite_id)
            if secondary_satellite_id
            else None
        )

        async with self._demo_lock:
            reset_state()
            if primary_runtime:
                set_satellite(self._build_upstream_satellite(primary_runtime))

            loop = asyncio.get_running_loop()
            await loop.run_in_executor(None, load_demo_data)
            logger.info(
                "detour_upstream_demo_data_loaded",
                primary_satellite_id=primary_satellite_id,
                secondary_satellite_id=secondary_satellite_id,
            )

            if primary_runtime:
                self._upsert_catalog_object(primary_runtime)
            if secondary_runtime:
                self._upsert_catalog_object(secondary_runtime)

            inbox = get_cdm_inbox()
            inbox.clear()
            if conjunction and primary_runtime and secondary_runtime:
                inbox.add(
                    {
                        "cdm_id": f"SDA-CDM-{conjunction.id}",
                        "primary_id": int(primary_runtime["norad_id"]),
                        "primary_name": primary_runtime["name"],
                        "secondary_id": int(secondary_runtime["norad_id"]),
                        "secondary_name": secondary_runtime["name"],
                        "tca_offset_sec": (
                            max(0.0, (conjunction.tca - datetime.utcnow()).total_seconds())
                            if conjunction.tca
                            else 0.0
                        ),
                        "miss_distance_m": round(float(conjunction.miss_distance_km) * 1000.0, 1),
                        "risk_level": conjunction.risk_level,
                        "collision_probability": conjunction.collision_probability,
                        "processed": False,
                        "timestamp": datetime.utcnow().timestamp(),
                    }
                )

        return {
            "primary_runtime": primary_runtime,
            "secondary_runtime": secondary_runtime,
        }

    async def trigger_conjunction_analysis(self, conjunction_event_id: str, tenant_id: str) -> str:
        conjunction = await self.db.get(ConjunctionEvent, conjunction_event_id)
        if not conjunction or conjunction.tenant_id != tenant_id:
            raise NotFoundError(
                resource_type="ConjunctionEvent",
                resource_id=conjunction_event_id,
                detail="Conjunction event not found",
            )

        primary = await self.db.get(Satellite, conjunction.primary_object_id)
        secondary = await self.db.get(Satellite, conjunction.secondary_object_id)
        prompt = self._build_prompt(conjunction, primary, secondary)
        runtime_context = await self._prepare_runtime_context(
            conjunction.primary_object_id,
            conjunction.secondary_object_id,
            conjunction=conjunction,
        )

        session_id = generate_uuid()
        session = DetourAgentSession(
            id=session_id,
            tenant_id=tenant_id,
            session_type="detour_upstream_pipeline",
            status=DetourAgentSessionStatus.ACTIVE,
            input_data={
                "conjunction_event_id": conjunction_event_id,
                "prompt": prompt,
                "provider": "detour_upstream",
                "primary_norad_id": primary.norad_id if primary else None,
                "secondary_norad_id": secondary.norad_id if secondary else None,
                "runtime_context": {
                    "primary_ready": bool(runtime_context.get("primary_runtime")),
                    "secondary_ready": bool(runtime_context.get("secondary_runtime")),
                    "primary_orbit_id": (
                        runtime_context["primary_runtime"]["orbit_id"]
                        if runtime_context.get("primary_runtime")
                        else None
                    ),
                    "secondary_orbit_id": (
                        runtime_context["secondary_runtime"]["orbit_id"]
                        if runtime_context.get("secondary_runtime")
                        else None
                    ),
                },
            },
            output_data={},
            events=[],
            started_at=datetime.utcnow(),
        )
        self.db.add(session)
        await self.db.commit()
        DETOUR_ANALYSES_TOTAL.inc()

        # During SQLite in-memory tests, avoid spawning long-lived background
        # tasks that depend on external LLM connectivity.
        bind_url = str(getattr(self.db.bind, "url", ""))
        if "sqlite" in bind_url:
            session.events = [
                {
                    "type": "agent_start",
                    "agent": "detour",
                    "message": "Background pipeline disabled in SQLite test mode",
                    "timestamp": datetime.utcnow().timestamp(),
                }
            ]
            await self.db.commit()
            return session_id

        session_factory = self._session_factory()
        task = asyncio.create_task(self._run_pipeline_session(session_factory, session_id, prompt))
        self._active_tasks.add(task)
        task.add_done_callback(self._active_tasks.discard)

        logger.info(
            "detour_upstream_session_started",
            session_id=session_id,
            conjunction_event_id=conjunction_event_id,
            tenant_id=tenant_id,
        )
        return session_id

    @classmethod
    async def _run_pipeline_session(
        cls,
        session_factory: async_sessionmaker[AsyncSession],
        session_id: str,
        prompt: str,
    ) -> None:
        config = cls._build_llm_config()
        events: list[dict[str, Any]] = []
        output_data: dict[str, Any] = {}
        saw_error_event = False

        async with session_factory() as db:
            session = await db.get(DetourAgentSession, session_id)
            if not session:
                return

            try:
                async for event in stream_avoidance_pipeline(prompt, config=config, mode="multi"):
                    if not isinstance(event, dict):
                        continue
                    events.append(event)
                    cls._update_output_from_event(output_data, event)
                    if event.get("type") == "error":
                        saw_error_event = True

                    # Persist periodically so /status can stream progress.
                    if len(events) % 4 == 0 or event.get("type") in {"pipeline_complete", "error"}:
                        session.events = list(events)
                        session.output_data = dict(output_data)
                        await db.commit()

                session.events = list(events)
                session.output_data = dict(output_data)
                session.status = (
                    DetourAgentSessionStatus.FAILED
                    if saw_error_event
                    else DetourAgentSessionStatus.COMPLETED
                )
                session.completed_at = datetime.utcnow()
                await db.commit()
            except Exception as exc:  # pragma: no cover
                logger.exception("detour_upstream_pipeline_failed", session_id=session_id)
                events.append(
                    {
                        "type": "error",
                        "message": str(exc),
                        "timestamp": datetime.utcnow().timestamp(),
                    }
                )
                session.events = list(events)
                session.output_data = {**output_data, "error": str(exc)}
                session.status = DetourAgentSessionStatus.FAILED
                session.completed_at = datetime.utcnow()
                await db.commit()

    async def get_analysis_status(self, session_id: str) -> Dict[str, Any]:
        session = await self.db.get(DetourAgentSession, session_id)
        if not session:
            raise NotFoundError(
                resource_type="DetourAgentSession",
                resource_id=session_id,
                detail="Detour analysis session not found",
            )
        return {
            "session_id": session.id,
            "status": self._status_value(session),
            "started_at": session.started_at.isoformat() if session.started_at else None,
            "completed_at": session.completed_at.isoformat() if session.completed_at else None,
            "events": session.events or [],
        }

    async def get_analysis_results(self, session_id: str) -> Dict[str, Any]:
        session = await self.db.get(DetourAgentSession, session_id)
        if not session:
            raise NotFoundError(
                resource_type="DetourAgentSession",
                resource_id=session_id,
                detail="Detour analysis session not found",
            )
        if session.status != DetourAgentSessionStatus.COMPLETED:
            raise SDAException(
                status_code=400,
                error_type="analysis-not-complete",
                title="Analysis Not Complete",
                detail="Requested analysis results but session is not completed",
            )
        return {
            "session_id": session.id,
            "status": self._status_value(session),
            "output_data": session.output_data or {},
        }

    async def stream_analysis_status(self, session_id: str) -> AsyncGenerator[Dict[str, Any], None]:
        seen_events = 0
        session_factory = self._session_factory()
        while True:
            async with session_factory() as db:
                session = await db.get(DetourAgentSession, session_id)
                if not session:
                    yield {
                        "type": "error",
                        "session_id": session_id,
                        "message": "Session not found",
                    }
                    return

                status = self._status_value(session)
                events = session.events or []
                while seen_events < len(events):
                    event = events[seen_events]
                    seen_events += 1
                    yield {
                        "session_id": session_id,
                        "status": status,
                        "event": event,
                    }

                if status in {"completed", "failed", "cancelled"}:
                    yield {
                        "session_id": session_id,
                        "status": status,
                        "done": True,
                        "output_data": session.output_data or {},
                    }
                    return
            await asyncio.sleep(0.8)

    async def _resolve_requested_satellite_state(self, satellite_id: str) -> Optional[Dict[str, Any]]:
        satellite = await self.db.get(Satellite, satellite_id)
        if not satellite:
            return None

        stmt = (
            select(Orbit)
            .where(Orbit.satellite_id == satellite_id)
            .order_by(desc(Orbit.epoch))
            .limit(1)
        )
        result = await self.db.execute(stmt)
        orbit = result.scalar_one_or_none()
        if not orbit or not orbit.tle_line1 or not orbit.tle_line2:
            return None

        try:
            state = tle_to_state_vector(
                orbit.tle_line1,
                orbit.tle_line2,
                datetime.utcnow(),
            )
        except Exception:
            logger.warning(
                "detour_screening_tle_resolution_failed",
                satellite_id=satellite_id,
                orbit_id=getattr(orbit, "id", None),
            )
            return None

        return {
            "satellite_id": satellite.id,
            "position_m": state.position * 1000.0,
            "velocity_m_s": state.velocity * 1000.0,
            "name": satellite.name,
            "norad_id": satellite.norad_id,
            "orbit_id": orbit.id,
            "object_type": satellite.object_type,
        }

    async def run_manual_screening(
        self,
        satellite_id: str,
        time_window_hours: float = 72,
        threshold_km: float = 5.0,
    ) -> Dict[str, Any]:
        await self._prepare_runtime_context(satellite_id)
        sat = get_satellite()
        catalog = get_catalog()
        debris = [obj.to_dict() for obj in catalog.list_debris()]
        requested_satellite = await self._resolve_requested_satellite_state(satellite_id)
        primary_position = (
            requested_satellite["position_m"] if requested_satellite else sat.position
        )
        primary_velocity = (
            requested_satellite["velocity_m_s"] if requested_satellite else sat.velocity
        )

        events = screen_conjunctions(
            primary_pos=primary_position,
            primary_vel=primary_velocity,
            debris_list=debris,
            lookahead_sec=float(time_window_hours) * 3600,
            threshold_km=float(threshold_km),
        )
        now = datetime.utcnow()
        candidates = []
        for idx, event in enumerate(events):
            tca = now + timedelta(seconds=float(event.get("tca_offset_sec", 0)))
            candidates.append(
                {
                    "candidate_id": f"{satellite_id}:{event.get('secondary_id', 'unknown')}:{idx}",
                    "satellite_id": str(event.get("secondary_id", "")),
                    "satellite_name": str(event.get("secondary_name", "Unknown object")),
                    "satellite_norad_id": event.get("secondary_id"),
                    "tca": tca.isoformat(),
                    "miss_distance_km": float(event.get("miss_distance_m", 0.0)) / 1000.0,
                    "collision_probability": event.get("probability_estimate"),
                    "risk_level": event.get("risk_level"),
                }
            )
        return {
            "candidates": candidates,
            "generated_at": now.isoformat(),
            "metadata": {
                "source": "detour_upstream",
                "requested_satellite_id": satellite_id,
                "screened_satellite_name": (
                    requested_satellite["name"] if requested_satellite else sat.name
                ),
                "screened_satellite_norad_id": (
                    requested_satellite["norad_id"] if requested_satellite else sat.norad_id
                ),
                "screened_with_requested_satellite": bool(requested_satellite),
                "screened_orbit_id": (
                    requested_satellite["orbit_id"] if requested_satellite else None
                ),
            },
        }
    def _session_factory(self) -> async_sessionmaker[AsyncSession]:
        bind = self.db.bind
        if bind is None:
            return async_session_factory
        return async_sessionmaker(
            bind=bind,
            class_=AsyncSession,
            expire_on_commit=False,
            autocommit=False,
            autoflush=False,
        )
