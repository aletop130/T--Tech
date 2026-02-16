# -*- coding: utf-8 -*-
"""LangGraph pipeline definition for the Detour system.

This module builds the deterministic state graph that orchestrates the Detour
pipeline.  It wires together the node implementations defined in
``backend/app/agents/detour/nodes.py`` and provides helper functions for running
the graph either as a single blocking call or as an asynchronous stream of
intermediate events.

The graph follows a simple linear flow:

```
START → scout → analyst → planner → safety → ops_brief → END
```

More complex conditional routing (risk‑level branches, iteration limits, etc.)
can be added later using ``add_conditional_edges``.  For now the nodes contain
their own internal guards (e.g. ``planner_node`` skips low‑risk cases) so a linear
pipeline is sufficient for the current test suite.
"""

from __future__ import annotations

from typing import AsyncGenerator, Dict, Any

from langgraph.graph import StateGraph, START, END

from .nodes import (
    scout_node,
    analyst_node,
    planner_node,
    safety_node,
    ops_brief_node,
)
from .state import DetourGraphState
from app.services.detour.state_manager import DetourStateManager

__all__ = [
    "build_detour_graph",
    "run_detour_pipeline",
    "stream_detour_pipeline",
]


def build_detour_graph() -> StateGraph[DetourGraphState]:
    """Construct the Detour :class:`~langgraph.graph.StateGraph`.

    The graph uses :class:`DetourGraphState` as its state schema and connects the
    five core nodes in the order required by the specification.  Each edge is a
    direct transition; conditional logic (e.g. skipping the planner for low risk)
    is handled inside the node implementation.
    """
    graph = StateGraph(state_schema=DetourGraphState)

    # Register nodes
    graph.add_node("scout", scout_node)
    graph.add_node("analyst", analyst_node)
    graph.add_node("planner", planner_node)
    graph.add_node("safety", safety_node)
    graph.add_node("ops_brief", ops_brief_node)

    # Define execution order
    graph.add_edge(START, "scout")
    graph.add_edge("scout", "analyst")
    graph.add_edge("analyst", "planner")
    graph.add_edge("planner", "safety")
    graph.add_edge("safety", "ops_brief")
    graph.add_edge("ops_brief", END)

    return graph


async def run_detour_pipeline(
    session_id: str,
    satellite_id: str,
    conjunction_event_id: str,
    tenant_id: str,
    state_manager: DetourStateManager,
) -> DetourGraphState:
    """Execute the full Detour pipeline and return the final state.

    Parameters
    ----------
    session_id:
        Unique identifier for the analysis session.
    satellite_id:
        Identifier of the primary satellite.
    conjunction_event_id:
        Identifier of the ``ConjunctionEvent`` that triggered the workflow.
    tenant_id:
        Multi‑tenant isolation identifier.
    state_manager:
        An instance of :class:`DetourStateManager` providing the async DB session.

    Returns
    -------
    DetourGraphState
        The complete state after the ``ops_brief`` node has finished.
    """
    graph = build_detour_graph()
    # Initialise the shared state with required fields and sensible defaults.
    state: DetourGraphState = {
        "session_id": session_id,
        "tenant_id": tenant_id,
        "satellite_id": satellite_id,
        "conjunction_event_id": conjunction_event_id,
        "satellite_state": None,
        "conjunction_data": None,
        "screening_results": [],
        "risk_assessment": None,
        "maneuver_options": [],
        "safety_review": None,
        "ops_brief": None,
        "current_agent": "",
        "events": [],
        "errors": [],
        "completed": False,
    }

    # ``config`` is passed to every node; we only need to expose the DB session.
    config: Dict[str, Any] = {"db": state_manager.db}

    # Execute nodes sequentially.
    for node_fn in (scout_node, analyst_node, planner_node, safety_node, ops_brief_node):
        state = await node_fn(state, config)  # type: ignore[arg-type]

    return state


async def stream_detour_pipeline(
    session_id: str,
    satellite_id: str,
    conjunction_event_id: str,
    tenant_id: str,
    state_manager: DetourStateManager,
) -> AsyncGenerator[Dict[str, Any], None]:
    """Stream intermediate graph updates as an async generator.

    The generator yields the partial state dictionary after each node finishes.
    Consumers (e.g. the API layer) can transform these dictionaries into SSE
    payloads for the frontend.
    """
    # Initialise the shared state
    state: DetourGraphState = {
        "session_id": session_id,
        "tenant_id": tenant_id,
        "satellite_id": satellite_id,
        "conjunction_event_id": conjunction_event_id,
        "satellite_state": None,
        "conjunction_data": None,
        "screening_results": [],
        "risk_assessment": None,
        "maneuver_options": [],
        "safety_review": None,
        "ops_brief": None,
        "current_agent": "",
        "events": [],
        "errors": [],
        "completed": False,
    }

    config: Dict[str, Any] = {"db": state_manager.db}

    # Execute nodes sequentially, yielding the state after each step.
    for node_fn in (scout_node, analyst_node, planner_node, safety_node, ops_brief_node):
        state = await node_fn(state, config)  # type: ignore[arg-type]
        yield state
