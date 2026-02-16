# WRITE_TARGET="backend/app/physics/risk.py"
# WRITE_CONTENT_LENGTH=0
'''Collision risk calculation utilities for the Detour system.

This module implements the Chan (1997) analytical formulation for the probability
of collision between two space objects, a simple risk‑level assessment helper,
and a utility to estimate the maximum conjunction time based on relative
position and velocity.

All functions are pure and type‑annotated.  They raise ``ValueError`` for
invalid inputs.
'''

from __future__ import annotations

import math
from typing import Sequence, Tuple

import numpy as np

from .propagator import StateVector
try:
    from ..schemas.operations import CollisionRiskLevel
except Exception:  # pragma: no cover
    from enum import Enum
    class CollisionRiskLevel(str, Enum):
        LOW = 'low'
        MEDIUM = 'medium'
        HIGH = 'high'
        CRITICAL = 'critical'

__all__ = [
    'calculate_collision_probability_chan',
    'assess_risk_level',
    'calculate_maximum_conjunction_time',
]

def _validate_covariance_matrix(cov: np.ndarray) -> np.ndarray:
    '''Validate that *cov* is a ``3×3`` numeric covariance matrix.

    Parameters
    ----------
    cov:
        Array‑like object representing the covariance matrix.

    Returns
    -------
    np.ndarray
        The validated ``(3, 3)`` ``float`` array.

    Raises
    ------
    ValueError
        If the shape is not ``(3, 3)`` or if the matrix contains non‑finite
        values.
    '''
    arr = np.asarray(cov, dtype=float)
    if arr.shape != (3, 3):
        raise ValueError('Covariance matrix must be 3×3')
    if not np.isfinite(arr).all():
        raise ValueError('Covariance matrix must contain only finite numbers')
    return arr

def calculate_collision_probability_chan(
    primary_cov: Sequence[Sequence[float]] | np.ndarray,
    secondary_cov: Sequence[Sequence[float]] | np.ndarray,
    miss_distance: float,
    combined_radius: float,
) -> float:
    '''Calculate collision probability using the Chan 1997 formulation.

    The implementation follows the reference Java code from the Orekit
    ``Chan1997`` class.  It works in the 2‑D encounter plane and assumes that the
    miss distance lies along the *x* axis (``ym = 0``).  The relative covariance
    in the encounter plane is approximated by the sum of the primary and
    secondary 3‑D covariance matrices, from which the standard deviations
    ``sigma_x`` and ``sigma_y`` are extracted.

    Parameters
    ----------
    primary_cov, secondary_cov:
        3×3 covariance matrices (position only) of the two objects.
    miss_distance:
        Miss distance at the time of closest approach (km).
    combined_radius:
        Sum of the two object radii (km).

    Returns
    -------
    float
        Collision probability ``Pc`` in the range ``[0, 1]``.
    '''
    # Validate inputs
    C1 = _validate_covariance_matrix(primary_cov)
    C2 = _validate_covariance_matrix(secondary_cov)
    if miss_distance < 0:
        raise ValueError('miss_distance must be non‑negative')
    if combined_radius <= 0:
        raise ValueError('combined_radius must be positive')

    # Combined covariance in the encounter plane (axes 0 and 1)
    C = C1 + C2
    sigma_x = math.sqrt(C[0, 0])
    sigma_y = math.sqrt(C[1, 1])
    if sigma_x <= 0 or sigma_y <= 0:
        raise ValueError('Standard deviations extracted from covariance must be positive')

    xm = float(miss_distance)
    ym = 0.0
    radius = float(combined_radius)

    u = radius * radius / (sigma_x * sigma_y)
    v = (xm * xm) / (sigma_x * sigma_x) + (ym * ym) / (sigma_y * sigma_y)

    if u <= 0.01 or v <= 1:
        M = 3
    elif (0.01 < u <= 1) or (1 < v <= 9):
        M = 10
    elif (1 < u <= 25) or (9 < v <= 25):
        M = 20
    else:
        M = 60

    t = 1.0
    s = 1.0
    sum_series = 1.0
    exp_minus_v_half = math.exp(-0.5 * v)
    exp_minus_uv_half = math.exp(-0.5 * (u + v))
    value = exp_minus_v_half * t - exp_minus_uv_half * t * sum_series

    for i in range(1, M):
        t = (v * 0.5) / i * t
        s = (u * 0.5) / i * s
        sum_series = sum_series + s
        value = (
            value
            + exp_minus_v_half * t
            - exp_minus_uv_half * t * sum_series
        )

    prob = max(0.0, min(1.0, value))
    return prob

def assess_risk_level(
    collision_prob: float,
    miss_distance_km: float,
    object_sizes: Sequence[float] | Tuple[float, float],
) -> CollisionRiskLevel:
    '''Return a ``CollisionRiskLevel`` based on probability and geometry.

    The logic combines a probability‑based tiering with a deterministic check:
    if the miss distance is less than or equal to the combined object radius the
    situation is classified as *critical* regardless of the calculated probability.

    Parameters
    ----------
    collision_prob:
        Collision probability ``Pc`` (0 ≤ Pc ≤ 1).
    miss_distance_km:
        Miss distance at TCA (km).
    object_sizes:
        Iterable with the radii of the two objects (km).  Only the sum is used.

    Returns
    -------
    CollisionRiskLevel
        One of ``LOW``, ``MEDIUM``, ``HIGH`` or ``CRITICAL``.
    '''
    if not (0.0 <= collision_prob <= 1.0):
        raise ValueError('collision_prob must be between 0 and 1')
    if miss_distance_km < 0:
        raise ValueError('miss_distance_km must be non‑negative')
    if len(object_sizes) != 2:
        raise ValueError('object_sizes must contain exactly two radii')
    combined_radius = float(object_sizes[0]) + float(object_sizes[1])

    if miss_distance_km <= combined_radius:
        return CollisionRiskLevel.CRITICAL
    if collision_prob >= 1e-4:
        return CollisionRiskLevel.CRITICAL
    if collision_prob >= 1e-5:
        return CollisionRiskLevel.HIGH
    if collision_prob >= 1e-7:
        return CollisionRiskLevel.MEDIUM
    return CollisionRiskLevel.LOW

def calculate_maximum_conjunction_time(
    primary_state: StateVector,
    secondary_state: StateVector,
    threshold_km: float = 10.0,
) -> float:
    '''Estimate the time (seconds) until the two objects exceed ``threshold_km``.

    A simple linear approximation is used: the relative position and velocity are
    assumed constant over the short‑term interval of interest.  If the objects
    are already farther apart than ``threshold_km`` the function returns ``0.0``.
    If the relative speed is zero the objects will never change their separation
    and the function returns ``math.inf``.

    Parameters
    ----------
    primary_state, secondary_state:
        ``StateVector`` instances for the two objects.
    threshold_km:
        Distance (km) defining the outer bound of a conjunction.

    Returns
    -------
    float
        Maximum time (seconds) the conjunction can last before the separation
        exceeds ``threshold_km``.
    '''
    if threshold_km <= 0:
        raise ValueError('threshold_km must be positive')
    rel_pos = primary_state.position - secondary_state.position
    rel_vel = primary_state.velocity - secondary_state.velocity
    distance = float(np.linalg.norm(rel_pos))
    speed = float(np.linalg.norm(rel_vel))

    if distance >= threshold_km:
        return 0.0
    if speed == 0.0:
        return math.inf

    time_to_threshold = (threshold_km - distance) / speed
    return max(0.0, time_to_threshold)
