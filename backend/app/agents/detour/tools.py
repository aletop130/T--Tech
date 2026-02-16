# -*- coding: utf-8 -*-
"""LangGraph tool definitions for the Detour agents.

This module provides a set of functions that are exposed as LangGraph tools
(`@tool` decorator) and used by the different nodes of the Detour pipeline.
Each tool performs a specific operation – screening, risk assessment, maneuver
proposal, validation and execution – and returns a JSON‑serialisable dictionary
matching the schema expected by the corresponding LLM prompts (see
`prompts.py`).

The implementations are deliberately lightweight but functional: they query the
database for the necessary information, delegate the heavy lifting to the
physics utilities in ``app.physics`` and update persistent state through the
``DetourStateManager`` service.
"""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Any, Dict, List, Tuple

from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

# LangGraph tool decorator – imported lazily to avoid import errors during test
# collection if LangGraph is not installed. The library guarantees that the
# ``tool`` symbol exists when the package is available.
try:
    from langgraph.prebuilt import tool  # type: ignore
except Exception:  # pragma: no cover
    # Fallback stub – the decorator becomes a no‑op if the import fails. This
    # allows the module to be imported in environments where LangGraph is not
    # present (e.g., unit tests that only exercise utility logic).
    def tool(func):  # type: ignore
        return func

from app.core.logging import get_logger
from app.db.models.ontology import ConjunctionEvent, Orbit, Satellite
from app.db.models.detour import (
    DetourConjunctionAnalysis,
    DetourManeuverPlan,
    DetourManeuverStatus,
    DetourSatelliteState,
)
from app.db.models.detour import DetourAnalysisStatus
from app.physics.screening import (
    ConjunctionCandidate,
    ConjunctionEvent as ScreeningConjunctionEvent,
    screen_conjunctions,
    refine_conjunction,
)
from app.physics.risk import assess_risk_level
from app.physics.maneuver import (
    ManeuverOption,
    SatelliteState,
    propose_in_plane_maneuvers,
    propose_out_of_plane_maneuvers,
    optimize_maneuver_timing,
)
from app.services.detour.state_manager import DetourStateManager

logger = get_logger(__name__)

# ---------------------------------------------------------------------------
# Helper utilities
# ---------------------------------------------------------------------------

async def _get_latest_orbit(db: AsyncSession, satellite_id: str) -> Orbit | None:
    """Return the most recent ``Orbit`` record for *satellite_id*.

    The function orders by ``epoch`` descending and returns the first row. If
    the satellite has no orbit records, ``None`` is returned.
    """
    stmt = (
        select(Orbit)
        .where(Orbit.satellite_id == satellite_id)
        .order_by(desc(Orbit.epoch))
        .limit(1)
    )
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


# ---------------------------------------------------------------------------
# Tool definitions
# ---------------------------------------------------------------------------

@tool
async def screen_conjunctions_tool(
    satellite_id: str,
    time_window_hours: float = 72,
    threshold_km: float = 5.0,
    db: AsyncSession | None = None,
) -> Dict[str, Any]:
    """Screen the catalogue for potential conjunctions.

    Parameters
    ----------
    satellite_id:
        Identifier of the primary satellite to be screened.
    time_window_hours:
        Forward propagation window (default 72 h).
    threshold_km:
        Distance threshold for flagging a candidate (default 5 km).
    db:
        Async SQLAlchemy session. Must be supplied by the caller (the LangGraph
        runtime injects the session when constructing the graph).

    Returns
    -------
    dict
        JSON‑serialisable payload matching the ``SCOUT_PROMPT`` schema.
    """
    if db is None:
        raise ValueError("Database session is required for screening tool")

    # Primary satellite TLE
    primary_orbit = await _get_latest_orbit(db, satellite_id)
    if not primary_orbit or not primary_orbit.tle_line1 or not primary_orbit.tle_line2:
        raise ValueError(f"No TLE available for satellite {satellite_id}")
    primary_tle: Tuple[str, str] = (primary_orbit.tle_line1, primary_orbit.tle_line2)

    # Build catalogue of secondary objects (all other satellites with a TLE)
    stmt = (
        select(Orbit)
        .where(
            Orbit.tle_line1.is_not(None),
            Orbit.tle_line2.is_not(None),
            Orbit.satellite_id != satellite_id,
        )
        .order_by(desc(Orbit.epoch))
    )
    result = await db.execute(stmt)
    orbits: List[Orbit] = result.scalars().all()

    # Keep the latest orbit for each secondary satellite
    latest_by_sat: Dict[str, Orbit] = {}
    for o in orbits:
        if o.satellite_id not in latest_by_sat:
            latest_by_sat[o.satellite_id] = o

    catalog: List[Tuple[str, str]] = []
    tle_to_satellite: Dict[Tuple[str, str], str] = {}
    for sat_id, o in latest_by_sat.items():
        tle = (o.tle_line1, o.tle_line2)
        catalog.append(tle)
        tle_to_satellite[tle] = sat_id

    candidates: List[ConjunctionCandidate] = screen_conjunctions(
        primary_tle, catalog, time_window_hours, threshold_km
    )

    screening_results: List[Dict[str, Any]] = []
    priority_queue: List[str] = []
    for cand in candidates:
        sec_sat_id = tle_to_satellite.get(cand.secondary_tle)
        screening_results.append(
            {
                "primary_satellite_id": satellite_id,
                "secondary_satellite_id": sec_sat_id,
                "approx_tca": cand.approx_tca.isoformat(),
                "miss_distance_km": cand.miss_distance_km,
            }
        )
        if sec_sat_id:
            priority_queue.append(sec_sat_id)

    return {
        "screening_results": screening_results,
        "threats_identified": len(candidates),
        "priority_queue": priority_queue,
        "notes": f"Screened {len(catalog)} objects over {time_window_hours} h window.",
    }


@tool
async def assess_risk_tool(
    conjunction_event_id: str,
    db: AsyncSession | None = None,
) -> Dict[str, Any]:
    """Assess collision risk for a given conjunction event.

    The function returns the fields required by the ``ANALYST_PROMPT`` schema.
    """
    if db is None:
        raise ValueError("Database session is required for risk assessment tool")

    stmt = select(ConjunctionEvent).where(ConjunctionEvent.id == conjunction_event_id)
    result = await db.execute(stmt)
    conj = result.scalar_one_or_none()
    if not conj:
        raise ValueError(f"Conjunction event {conjunction_event_id} not found")

    # Use stored values; if they are missing, fall back to safe defaults.
    collision_probability = conj.collision_probability or 0.0
    risk_level = conj.risk_level
    miss_distance_km = conj.miss_distance_km

    # Optionally compute a risk level using the helper – the ORM already stores
    # a risk level, but the function mirrors the LLM expectation.
    risk_assessment = {
        "collision_probability": collision_probability,
        "risk_level": risk_level,
        "risk_factors": [],  # Placeholder – could be expanded later
        "recommended_action": "maneuver" if risk_level in ("high", "critical") else "monitor",
    }
    return risk_assessment


@tool
async def propose_maneuvers_tool(
    conjunction_event_id: str,
    delta_v_budget: float = 0.5,
    db: AsyncSession | None = None,
) -> Dict[str, Any]:
    """Generate maneuver options for a conjunction event.

    The function pulls the primary satellite's physical state, builds a
    ``ScreeningConjunctionEvent`` compatible with the physics utilities and
    returns a payload matching the ``PLANNER_PROMPT`` schema.
    """
    if db is None:
        raise ValueError("Database session is required for maneuver proposal tool")

    # Fetch the conjunction event
    stmt = select(ConjunctionEvent).where(ConjunctionEvent.id == conjunction_event_id)
    result = await db.execute(stmt)
    conj = result.scalar_one_or_none()
    if not conj:
        raise ValueError(f"Conjunction event {conjunction_event_id} not found")

    # Retrieve primary satellite mass (fallback to 500 kg if unknown)
    sat_stmt = select(Satellite).where(Satellite.id == conj.primary_object_id)
    sat_res = await db.execute(sat_stmt)
    sat = sat_res.scalar_one_or_none()
    mass_kg = float(sat.mass_kg) if sat and sat.mass_kg else 500.0

    # Retrieve Detour satellite state for fuel & Δv budget (tenant handling is
    # simplified – we use the default tenant for now).
    state_manager = DetourStateManager(db)
    sat_state: DetourSatelliteState | None = await state_manager.get_satellite_state(
        conj.primary_object_id, tenant_id="default"
    )
    fuel_remaining = sat_state.fuel_remaining_kg if sat_state else None
    delta_v_budget_m_s = sat_state.delta_v_budget_m_s if sat_state else None

    primary_state = SatelliteState(
        satellite_id=conj.primary_object_id,
        mass_kg=mass_kg,
        fuel_remaining_kg=fuel_remaining or 0.0,
        delta_v_budget_m_s=delta_v_budget_m_s or (delta_v_budget * 1000.0),
    )

    # Build a screening‑compatible ConjunctionEvent (TLEs are not required for the
    # maneuver heuristics, so we use empty strings).
    screening_event = ScreeningConjunctionEvent(
        primary_tle=("", ""),
        secondary_tle=("", ""),
        tca=conj.tca,
        miss_distance_km=conj.miss_distance_km,
        miss_distance_radial_km=conj.miss_distance_radial_km or 0.0,
        miss_distance_intrack_km=conj.miss_distance_intrack_km or 0.0,
        miss_distance_crosstrack_km=conj.miss_distance_crosstrack_km or 0.0,
    )

    in_plane = propose_in_plane_maneuvers(primary_state, screening_event, delta_v_budget)
    out_of_plane = propose_out_of_plane_maneuvers(primary_state, screening_event, delta_v_budget)
    all_options: List[ManeuverOption] = in_plane + out_of_plane

    recommended = optimize_maneuver_timing(all_options, screening_event)

    # Serialise ``ManeuverOption`` instances to plain dictionaries – this is
    # required for JSON transport to the LLM.
    options_serialised = [
        {
            "maneuver_id": opt.maneuver_id,
            "type": opt.type,
            "delta_v_m_s": opt.delta_v_m_s,
            "fuel_cost_kg": opt.fuel_cost_kg,
            "execution_time": opt.execution_time.isoformat(),
            "expected_miss_distance_km": opt.expected_miss_distance_km,
            "risk_reduction_percent": opt.risk_reduction_percent,
            "pros": opt.pros,
            "cons": opt.cons,
        }
        for opt in all_options
    ]

    return {
        "maneuver_options": options_serialised,
        "recommended_option": recommended.maneuver_id,
        "confidence": 0.9,
    }


@tool
async def validate_maneuver_tool(
    maneuver_plan_id: str,
    db: AsyncSession | None = None,
) -> Dict[str, Any]:
    """Validate a proposed maneuver plan against satellite resources.

    The function checks fuel availability and Δv budget. If both constraints are
    satisfied the plan is auto‑approved; otherwise manual review is required.
    """
    if db is None:
        raise ValueError("Database session is required for maneuver validation tool")

    stmt = select(DetourManeuverPlan).where(DetourManeuverPlan.id == maneuver_plan_id)
    result = await db.execute(stmt)
    plan = result.scalar_one_or_none()
    if not plan:
        raise ValueError(f"Maneuver plan {maneuver_plan_id} not found")

    # Resolve the associated analysis to locate the primary satellite.
    analysis_stmt = select(DetourConjunctionAnalysis).where(
        DetourConjunctionAnalysis.id == plan.conjunction_analysis_id
    )
    analysis_res = await db.execute(analysis_stmt)
    analysis = analysis_res.scalar_one_or_none()

    concerns: List[str] = []
    approved = True

    if analysis:
        satellite_id = analysis.conjunction_event.primary_object_id
        state_manager = DetourStateManager(db)
        sat_state = await state_manager.get_satellite_state(satellite_id, tenant_id="default")
        if sat_state:
            # Fuel check
            if plan.fuel_cost_kg is not None and sat_state.fuel_remaining_kg is not None:
                if plan.fuel_cost_kg > sat_state.fuel_remaining_kg:
                    concerns.append("Insufficient fuel for the maneuver")
                    approved = False
            # Δv budget check
            if plan.delta_v_m_s is not None and sat_state.delta_v_budget_m_s is not None:
                if plan.delta_v_m_s > sat_state.delta_v_budget_m_s:
                    concerns.append("Δv requirement exceeds remaining budget")
                    approved = False
        else:
            concerns.append("Satellite state not found")
            approved = False
    else:
        concerns.append("Conjunction analysis not found for maneuver plan")
        approved = False

    approval_level = "auto" if approved else "manual_review_required"
    return {
        "approved": approved,
        "approval_level": approval_level,
        "concerns": concerns,
        "modifications_required": [],
        "final_recommendation": "Proceed with execution" if approved else "Review required",
        "confidence": 0.95 if approved else 0.5,
    }


@tool
async def execute_maneuver_tool(
    maneuver_plan_id: str,
    user_id: str = "system",
    db: AsyncSession | None = None,
) -> Dict[str, Any]:
    """Mark a maneuver plan as executed and update satellite state.

    The function performs three steps:
    1. Transition the ``DetourManeuverPlan`` status to ``EXECUTED`` and set the
       execution timestamp.
    2. Debit the satellite's remaining fuel and Δv budget via the
       ``DetourStateManager``.
    3. Return a short execution summary.
    """
    if db is None:
        raise ValueError("Database session is required for maneuver execution tool")

    stmt = select(DetourManeuverPlan).where(DetourManeuverPlan.id == maneuver_plan_id)
    result = await db.execute(stmt)
    plan = result.scalar_one_or_none()
    if not plan:
        raise ValueError(f"Maneuver plan {maneuver_plan_id} not found")

    # Update plan status
    plan.status = DetourManeuverStatus.EXECUTED
    plan.executed_at = datetime.utcnow()
    plan.approved_by = user_id
    await db.flush()

    # Retrieve the related analysis to find the primary satellite.
    analysis_stmt = select(DetourConjunctionAnalysis).where(
        DetourConjunctionAnalysis.id == plan.conjunction_analysis_id
    )
    analysis_res = await db.execute(analysis_stmt)
    analysis = analysis_res.scalar_one_or_none()

    if analysis:
        satellite_id = analysis.conjunction_event.primary_object_id
        state_manager = DetourStateManager(db)
        sat_state = await state_manager.get_satellite_state(
            satellite_id, tenant_id="default"
        )
        if sat_state:
            # Update fuel if available
            if plan.fuel_cost_kg is not None and sat_state.fuel_remaining_kg is not None:
                new_fuel = max(sat_state.fuel_remaining_kg - plan.fuel_cost_kg, 0.0)
                await state_manager.update_satellite_state(
                    satellite_id,
                    tenant_id="default",
                    updates={"fuel_remaining_kg": new_fuel},
                )
            # Update Δv budget if available
            if plan.delta_v_m_s is not None and sat_state.delta_v_budget_m_s is not None:
                new_budget = max(sat_state.delta_v_budget_m_s - plan.delta_v_m_s, 0.0)
                await state_manager.update_satellite_state(
                    satellite_id,
                    tenant_id="default",
                    updates={"delta_v_budget_m_s": new_budget},
                )

    await db.refresh(plan)

    return {
        "maneuver_plan_id": maneuver_plan_id,
        "status": plan.status.value,
        "executed_at": plan.executed_at.isoformat() if plan.executed_at else None,
        "message": "Maneuver executed successfully",
    }


__all__ = [
    "screen_conjunctions_tool",
    "assess_risk_tool",
    "propose_maneuvers_tool",
    "validate_maneuver_tool",
    "execute_maneuver_tool",
]
