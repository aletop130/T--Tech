# -*- coding: utf-8 -*-
"""LangGraph node implementations for the Detour pipeline.

Each node receives the shared ``DetourGraphState`` dictionary and a ``config``
object (typically a ``RunnableConfig`` from LangGraph) containing runtime
dependencies such as the async database session.  Nodes are async functions –
they may perform I/O, call LangGraph tools defined in ``tools.py`` and update the
state in‑place.

The implementation follows the high‑level behaviour described in
``docs/DETOUR_IMPLEMENTATION_PLAN.txt``.  Errors are caught, logged and added to
``state["errors"]`` so that the pipeline can continue or abort gracefully.

All nodes emit simple event dictionaries that are appended to ``state["events"]``.
These events are later transformed into Server‑Sent Events (SSE) for the
frontend.
"""

from __future__ import annotations

import datetime
from typing import Any, Dict

# Application imports – absolute to avoid ambiguity inside the FastAPI process.
from app.core.logging import get_logger
from app.services.detour.state_manager import DetourStateManager
from app.agents.detour.state import DetourGraphState

# LangGraph tools that encapsulate the heavy‑lifting physics/SQL logic.
from .tools import (
    screen_conjunctions_tool,
    assess_risk_tool,
    propose_maneuvers_tool,
)

logger = get_logger(__name__)

# ---------------------------------------------------------------------------
# Helper utilities
# ---------------------------------------------------------------------------

def _add_event(state: DetourGraphState, event_type: str, payload: Dict[str, Any] | None = None) -> None:
    """Append an event to ``state["events"]`` with a timestamp.

    The event schema is intentionally lightweight – the ``payload`` can contain
    any node‑specific data.  The ``type`` field is used by the frontend to render
    human‑readable messages.
    """
    if payload is None:
        payload = {}
    event = {
        "timestamp": datetime.datetime.utcnow().isoformat() + "Z",
        "type": event_type,
        "payload": payload,
    }
    # ``events`` is guaranteed to exist in the initial graph state.
    state.setdefault("events", []).append(event)


# ---------------------------------------------------------------------------
# Node implementations
# ---------------------------------------------------------------------------

async def scout_node(state: DetourGraphState, config: Dict[str, Any]) -> DetourGraphState:
    """Scout node – perform the initial conjunction screening.

    Parameters
    ----------
    state:
        The shared ``DetourGraphState`` dictionary.
    config:
        Runtime configuration. Expected keys:
        * ``db`` – an :class:`sqlalchemy.ext.asyncio.AsyncSession` instance.
        * (optional) ``time_window_hours`` and ``threshold_km`` to override defaults.
    """
    logger.info(
        "Scout node starting screening",
        session_id=state.get("session_id"),
        satellite_id=state.get("satellite_id"),
    )
    _add_event(state, "scout_started", {"satellite_id": state.get("satellite_id")})

    db = config.get("db")
    if db is None:
        error_msg = "Database session not provided to scout_node"
        logger.error(error_msg, session_id=state.get("session_id"))
        state.setdefault("errors", []).append(error_msg)
        return state

    # Optional overrides – fallback to the values required by the spec.
    time_window = config.get("time_window_hours", 72)
    threshold = config.get("threshold_km", 5.0)

    try:
        screening_output = await screen_conjunctions_tool(
            satellite_id=state["satellite_id"],
            time_window_hours=time_window,
            threshold_km=threshold,
            db=db,
        )
        # Store the raw list of screening result dictionaries.
        state["screening_results"] = screening_output.get("screening_results", [])
        # Preserve the full output for downstream SSE/Cesium orchestration.
        state["scout_output"] = screening_output
        # Record number of threats for downstream nodes (not part of the schema).
        threats = screening_output.get("threats_identified", 0)
        logger.info(
            "Scout node completed screening",
            session_id=state.get("session_id"),
            threats=threats,
        )
        _add_event(state, "scout_completed", {"threats_identified": threats})
    except Exception as exc:  # pragma: no cover – defensive programming
        msg = f"Scout screening failed: {exc}"
        logger.exception(msg, session_id=state.get("session_id"))
        state.setdefault("errors", []).append(msg)
        _add_event(state, "scout_error", {"error": str(exc)})

    state["current_agent"] = "scout"
    return state


async def analyst_node(state: DetourGraphState, config: Dict[str, Any]) -> DetourGraphState:
    """Analyst node – assess collision probability and risk level.

    The node uses the ``assess_risk_tool`` which reads the ``ConjunctionEvent``
    identified by the previous steps.  The tool returns a dictionary matching the
    ``ANALYST_PROMPT`` schema which is stored in ``state["risk_assessment"]``.
    """
    logger.info(
        "Analyst node starting risk assessment",
        session_id=state.get("session_id"),
        conjunction_event_id=state.get("conjunction_event_id"),
    )
    _add_event(state, "analyst_started", {"conjunction_event_id": state.get("conjunction_event_id")})

    db = config.get("db")
    if db is None:
        error_msg = "Database session not provided to analyst_node"
        logger.error(error_msg, session_id=state.get("session_id"))
        state.setdefault("errors", []).append(error_msg)
        return state

    try:
        risk_output = await assess_risk_tool(conjunction_event_id=state["conjunction_event_id"], db=db)
        state["risk_assessment"] = risk_output
        state["analyst_output"] = risk_output
        logger.info(
            "Analyst node completed risk assessment",
            session_id=state.get("session_id"),
            risk_level=risk_output.get("risk_level"),
        )
        _add_event(state, "analyst_completed", {"risk_level": risk_output.get("risk_level")})
    except Exception as exc:  # pragma: no cover
        msg = f"Risk assessment failed: {exc}"
        logger.exception(msg, session_id=state.get("session_id"))
        state.setdefault("errors", []).append(msg)
        _add_event(state, "analyst_error", {"error": str(exc)})

    state["current_agent"] = "analyst"
    return state


async def planner_node(state: DetourGraphState, config: Dict[str, Any]) -> DetourGraphState:
    """Planner node – generate and optimise maneuver options.

    The planner is executed only when the risk level is ``medium`` or higher.
    It invokes ``propose_maneuvers_tool`` which returns a list of maneuver
    dictionaries and a recommended option identifier.  The raw list is stored in
    ``state["maneuver_options"]``.
    """
    logger.info(
        "Planner node invoked",
        session_id=state.get("session_id"),
    )
    _add_event(state, "planner_started")

    risk_info = state.get("risk_assessment") or {}
    risk_level = risk_info.get("risk_level", "low").lower()
    # Proceed only for medium/high/critical risk.
    if risk_level not in {"medium", "high", "critical"}:
        logger.info(
            "Planner node skipped due to low risk",
            session_id=state.get("session_id"),
            risk_level=risk_level,
        )
        _add_event(state, "planner_skipped", {"reason": "low_risk"})
        state["current_agent"] = "planner"
        return state

    db = config.get("db")
    if db is None:
        error_msg = "Database session not provided to planner_node"
        logger.error(error_msg, session_id=state.get("session_id"))
        state.setdefault("errors", []).append(error_msg)
        return state

    try:
        # ``delta_v_budget`` could be configurable – use the spec default.
        delta_v_budget = config.get("delta_v_budget", 0.5)
        maneuver_output = await propose_maneuvers_tool(
            conjunction_event_id=state["conjunction_event_id"],
            delta_v_budget=delta_v_budget,
            db=db,
        )
        # Store the list of maneuver dictionaries.
        state["maneuver_options"] = maneuver_output.get("maneuver_options", [])
        state["planner_output"] = maneuver_output
        logger.info(
            "Planner node generated maneuver options",
            session_id=state.get("session_id"),
            count=len(state["maneuver_options"]),
        )
        _add_event(state, "planner_completed", {"options_count": len(state["maneuver_options"])})
    except Exception as exc:  # pragma: no cover
        msg = f"Maneuver planning failed: {exc}"
        logger.exception(msg, session_id=state.get("session_id"))
        state.setdefault("errors", []).append(msg)
        _add_event(state, "planner_error", {"error": str(exc)})

    state["current_agent"] = "planner"
    return state


async def safety_node(state: DetourGraphState, config: Dict[str, Any]) -> DetourGraphState:
    """Safety node – validate the proposed maneuver plan.

    For the purposes of this early implementation the node performs a very
    simple deterministic check: if at least one maneuver option exists the plan
    is marked as approved, otherwise it is rejected.  A full implementation would
    invoke ``validate_maneuver_tool`` for a concrete plan ID.
    """
    logger.info(
        "Safety node evaluating maneuver plan",
        session_id=state.get("session_id"),
    )
    _add_event(state, "safety_started")

    options = state.get("maneuver_options", [])
    approved = bool(options)
    safety_review = {
        "approved": approved,
        "approval_level": "auto" if approved else "manual_review_required",
        "concerns": [] if approved else ["No viable maneuver options found"],
        "modifications_required": [],
        "final_recommendation": "Proceed with execution" if approved else "Review required",
        "confidence": 0.95 if approved else 0.5,
    }
    state["safety_review"] = safety_review
    state["safety_output"] = safety_review
    logger.info(
        "Safety node completed review",
        session_id=state.get("session_id"),
        approved=approved,
    )
    _add_event(state, "safety_completed", {"approved": approved})

    state["current_agent"] = "safety"
    return state


async def ops_brief_node(state: DetourGraphState, config: Dict[str, Any]) -> DetourGraphState:
    """Ops‑brief node – generate a concise operational summary.

    The node builds a human‑readable brief using information already present in
    the state (risk level, selected maneuver, etc.).  The generated structure
    matches the ``OPS_BRIEF_PROMPT`` schema and is stored under ``state["ops_brief"]``.
    ``state["completed"]`` is set to ``True`` to signal the end of the pipeline.
    """
    logger.info(
        "Ops brief node generating summary",
        session_id=state.get("session_id"),
    )
    _add_event(state, "ops_brief_started")

    risk = (state.get("risk_assessment") or {}).get("risk_level", "unknown")
    safety = (state.get("safety_review") or {}).get("approved", False)
    # Choose a recommended action based on safety review.
    recommended_action = "execute maneuver" if safety else "monitor"

    brief = {
        "situation_summary": f"Conjunction {state.get('conjunction_event_id')} assessed with risk level '{risk}'.",
        "recommended_action": recommended_action,
        "timeline": {
            "decision_deadline": (datetime.datetime.utcnow() + datetime.timedelta(hours=1)).isoformat() + "Z",
            "execution_window": "TBD",
            "tca": "TBD",
        },
        "next_steps": ["Validate safety report", "Prepare maneuver parameters"] if safety else ["Continue monitoring"],
        "contingencies": ["Abort if fuel falls below threshold"] if safety else [],
        "confidence": 0.9,
    }
    state["ops_brief"] = brief
    state["ops_brief_output"] = brief
    state["completed"] = True
    logger.info(
        "Ops brief node completed",
        session_id=state.get("session_id"),
    )
    _add_event(state, "ops_brief_completed", {"brief": brief})

    state["current_agent"] = "ops_brief"
    return state


__all__ = [
    "scout_node",
    "analyst_node",
    "planner_node",
    "safety_node",
    "ops_brief_node",
]
