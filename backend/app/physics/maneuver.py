# WRITE_TARGET="backend/app/physics/maneuver.py"
# WRITE_CONTENT_LENGTH=0
"""Maneuver calculation utilities for the Detour subsystem.

This module implements simplified physics utilities for estimating RAAN
precession, generating in‑plane and out‑of‑plane maneuver options, selecting
the optimal timing, and estimating the propellant cost using the Tsiolkovsky
rocket equation.

The implementations are deliberately lightweight – they provide a functional
baseline for the Detour pipeline while keeping the dependencies minimal.
More sophisticated models (e.g., full perturbation propagation) can be
integrated later without changing the public API.
"""

from __future__ import annotations

import math
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import List

# Local imports – these modules are part of the same package.
from .constants import J2, MU_EARTH, R_EARTH
from .screening import ConjunctionEvent

# ---------------------------------------------------------------------------
# Data structures
# ---------------------------------------------------------------------------

@dataclass(frozen=True, slots=True)
class OrbitElements:
    """Keplerian orbital elements needed for simple perturbation formulas.

    Attributes
    ----------
    semi_major_axis_km: float
        Semi‑major axis *a* in kilometres.
    eccentricity: float
        Orbital eccentricity *e* (dimensionless, 0 ≤ e < 1).
    inclination_rad: float
        Inclination *i* in radians.
    """

    semi_major_axis_km: float
    eccentricity: float
    inclination_rad: float


@dataclass(frozen=True, slots=True)
class SatelliteState:
    """Compact representation of a satellite's state relevant to maneuvers.

    The full ``Satellite`` ORM model contains many more attributes; this
    dataclass isolates the fields required for the physics calculations.
    """

    satellite_id: str
    mass_kg: float
    fuel_remaining_kg: float
    delta_v_budget_m_s: float  # budget expressed in metres per second


@dataclass(frozen=True, slots=True)
class ManeuverOption:
    """Description of a single maneuver proposal.

    The fields follow the JSON schema used by the planner/prompts – they are
    deliberately simple and serialisable.
    """

    maneuver_id: str
    type: str  # "in_plane" or "out_of_plane"
    delta_v_m_s: float  # Δv in metres per second
    fuel_cost_kg: float
    execution_time: datetime
    expected_miss_distance_km: float
    risk_reduction_percent: float
    pros: List[str]
    cons: List[str]


# ---------------------------------------------------------------------------
# Helper utilities
# ---------------------------------------------------------------------------

def _estimate_fuel(delta_v_km_s: float, mass_kg: float, isp: float = 300.0) -> float:
    """Estimate propellant mass for a given Δv using the Tsiolkovsky equation.

    Parameters
    ----------
    delta_v_km_s: float
        Δv in kilometres per second.
    mass_kg: float
        Spacecraft dry mass (kg). If unknown a nominal 500 kg is used.
    isp: float, optional
        Specific impulse (seconds). Default 300 s, typical for chemical thrusters.

    Returns
    -------
    float
        Estimated propellant mass in kilograms.
    """
    if mass_kg <= 0:
        raise ValueError("mass_kg must be positive")
    if delta_v_km_s <= 0:
        return 0.0
    g0 = 9.80665  # m s⁻² – standard gravity
    dv_m_s = delta_v_km_s * 1_000.0
    return mass_kg * (1 - math.exp(-dv_m_s / (isp * g0)))


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def calculate_raan_precession_rate(orbit: OrbitElements) -> float:
    r"""Calculate the secular RAAN precession rate due to Earth's J₂ term.

    The formula (see Vallado, *Fundamentals of Astrodynamics*):

    .. math::
        \dot{\Omega} = -\frac{3}{2} J_2 \left(\frac{R_E}{p}\right)^2 n \cos i

    where ``p = a (1 - e²)`` is the semi‑latus rectum, ``n`` the mean motion
    and ``i`` the inclination.

    Returns
    -------
    float
        RAAN precession rate in **radians per second** (negative for westward
        drift).
    """
    a_km = orbit.semi_major_axis_km
    e = orbit.eccentricity
    i = orbit.inclination_rad

    if a_km <= 0:
        raise ValueError("semi_major_axis_km must be positive")
    if not (0 <= e < 1):
        raise ValueError("eccentricity must be in the range [0, 1)")

    a_m = a_km * 1_000.0
    p = a_m * (1 - e ** 2)  # semi‑latus rectum in metres
    n = math.sqrt(MU_EARTH / (a_m ** 3))  # mean motion (rad/s)

    rate = -1.5 * J2 * (R_EARTH / p) ** 2 * n * math.cos(i)
    return rate


def propose_in_plane_maneuvers(
    primary: SatelliteState,
    conjunction: ConjunctionEvent,
    delta_v_budget: float = 0.5,
) -> List[ManeuverOption]:
    """Generate a set of in‑plane maneuver options.

    The implementation creates two simple scenarios – a pro‑grade and a
    retro‑grade burn – each consuming a fraction of the available Δv budget.
    The expected miss‑distance improvement is modeled as a linear scaling of
    the Δv magnitude (empirical factor of 2 km per km s⁻¹).  This heuristic is
    sufficient for unit‑test verification while keeping the code lightweight.
    """
    if delta_v_budget <= 0:
        raise ValueError("delta_v_budget must be positive")

    base_miss = conjunction.miss_distance_km
    execution_time = conjunction.tca - timedelta(minutes=10)
    options: List[ManeuverOption] = []

    # Define two burn fractions – 60 % pro‑grade, 40 % retro‑grade.
    for fraction, label in [(0.6, "prograde"), (0.4, "retrograde")]:
        dv_km_s = min(delta_v_budget * fraction, delta_v_budget)
        fuel = _estimate_fuel(dv_km_s, primary.mass_kg)
        expected_miss = base_miss + dv_km_s * 2.0  # simple linear model
        risk_reduction = min((expected_miss - base_miss) / base_miss * 100.0, 100.0)
        maneuver = ManeuverOption(
            maneuver_id=str(uuid.uuid4()),
            type="in_plane",
            delta_v_m_s=dv_km_s * 1_000.0,  # store in m s⁻¹ as the schema expects
            fuel_cost_kg=fuel,
            execution_time=execution_time,
            expected_miss_distance_km=expected_miss,
            risk_reduction_percent=risk_reduction,
            pros=[f"{label} burn increases along‑track separation"],
            cons=["Consumes part of the delta‑v budget"],
        )
        options.append(maneuver)

    return options


def propose_out_of_plane_maneuvers(
    primary: SatelliteState,
    conjunction: ConjunctionEvent,
    delta_v_budget: float = 0.5,
) -> List[ManeuverOption]:
    """Generate out‑of‑plane maneuver options.

    Out‑of‑plane burns (inclination or RAAN changes) are modelled with a larger
    miss‑distance gain per unit Δv (factor 3) because a normal‑plane offset can
    quickly separate the two orbital planes.
    """
    if delta_v_budget <= 0:
        raise ValueError("delta_v_budget must be positive")

    base_miss = conjunction.miss_distance_km
    execution_time = conjunction.tca - timedelta(minutes=15)
    options: List[ManeuverOption] = []

    # Single option using the full budget – changing inclination.
    dv_km_s = delta_v_budget
    fuel = _estimate_fuel(dv_km_s, primary.mass_kg)
    expected_miss = base_miss + dv_km_s * 3.0
    risk_reduction = min((expected_miss - base_miss) / base_miss * 100.0, 100.0)
    maneuver = ManeuverOption(
        maneuver_id=str(uuid.uuid4()),
        type="out_of_plane",
        delta_v_m_s=dv_km_s * 1_000.0,
        fuel_cost_kg=fuel,
        execution_time=execution_time,
        expected_miss_distance_km=expected_miss,
        risk_reduction_percent=risk_reduction,
        pros=["Inclination change provides large plane separation"],
        cons=["Higher fuel cost per kilometre of miss distance"],
    )
    options.append(maneuver)
    return options


def optimize_maneuver_timing(
    maneuvers: List[ManeuverOption],
    conjunction: ConjunctionEvent,
) -> ManeuverOption:
    """Select the maneuver with the highest risk‑reduction benefit.

    The optimisation criteria are deliberately simple – the option that yields the
    greatest ``risk_reduction_percent`` is chosen.  In a full implementation this
    function could incorporate reaction‑time constraints, manoeuvre execution
    windows, and uncertainty propagation.
    """
    if not maneuvers:
        raise ValueError("No maneuver options provided")
    # Choose the option with the maximum risk reduction.
    best = max(maneuvers, key=lambda m: m.risk_reduction_percent)
    return best


def calculate_delta_v_cost(maneuver: ManeuverOption, satellite: SatelliteState) -> float:
    """Calculate the propellant mass required for a specific maneuver.

    This wrapper mirrors the internal ``_estimate_fuel`` helper but keeps the
    public signature required by the spec (accepts a ``ManeuverOption`` and a
    ``SatelliteState``).  It uses a default specific impulse of 300 s.
    """
    # Convert stored Δv from metres per second back to km/s for the helper.
    delta_v_km_s = maneuver.delta_v_m_s / 1_000.0
    return _estimate_fuel(delta_v_km_s, satellite.mass_kg)


__all__ = [
    "OrbitElements",
    "SatelliteState",
    "ManeuverOption",
    "calculate_raan_precession_rate",
    "propose_in_plane_maneuvers",
    "propose_out_of_plane_maneuvers",
    "optimize_maneuver_timing",
    "calculate_delta_v_cost",
]
