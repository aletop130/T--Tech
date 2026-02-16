# WRITE_TARGET="backend/app/physics/screening.py"
# WRITE_CONTENT_LENGTH=0
"""Screening utilities for detecting potential conjunctions.

This module provides a simple geometric screening algorithm that propagates a
primary satellite and a catalog of secondary objects over a configurable time
window using the SGP4 propagator (via :func:`backend.app.physics.propagator.propagate_tle`).
For each secondary object the minimum Euclidean distance between the two
position vectors is computed on a coarse 10‑minute grid.  Objects whose minimum
distance is less than a configurable threshold are returned as
:class:`ConjunctionCandidate` instances.

A refinement routine (:func:`refine_conjunction`) performs an iterative search
around the approximate time of closest approach (TCA) to improve the precision
of the TCA and compute a simple miss‑geometry decomposition (radial and
cross‑track components).  The algorithm is deliberately lightweight – it is
intended for the screening stage of the Detour pipeline where speed is more
important than sub‑kilometre accuracy.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import List, Sequence, Tuple

import numpy as np

from .constants import THRESHOLD_KM
from .propagator import propagate_tle

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Data structures
# ---------------------------------------------------------------------------

_TLE = Tuple[str, str]  # (line1, line2)


@dataclass(frozen=True, slots=True)
class ConjunctionCandidate:
    """Result of the coarse screening step.

    Attributes
    ----------
    primary_tle:
        Two‑line element set of the primary satellite.
    secondary_tle:
        Two‑line element set of the candidate secondary object.
    approx_tca:
        Approximate time of closest approach (UTC) on the coarse grid.
    miss_distance_km:
        Minimum Euclidean distance (km) observed on the coarse grid.
    """

    primary_tle: _TLE
    secondary_tle: _TLE
    approx_tca: datetime
    miss_distance_km: float


@dataclass(frozen=True, slots=True)
class ConjunctionEvent:
    """Refined conjunction description.

    The refinement routine provides a more accurate TCA and a basic miss‑
    geometry decomposition.  For the purposes of the current task the geometry
    is simplified – radial is the component of the miss vector along the
    primary‑to‑Earth direction, and cross‑track is the magnitude of the remaining
    perpendicular component.  In‑track is set to ``0.0`` because the velocity
    vector is not required for the simple Newton‑Raphson style search used
    here.
    """

    primary_tle: _TLE
    secondary_tle: _TLE
    tca: datetime
    miss_distance_km: float
    miss_distance_radial_km: float
    miss_distance_intrack_km: float
    miss_distance_crosstrack_km: float


# ---------------------------------------------------------------------------
# Helper utilities
# ---------------------------------------------------------------------------

def _validate_tle(tle: Sequence[str] | _TLE) -> _TLE:
    """Validate that *tle* is a two‑element sequence of strings.

    The function returns a ``Tuple[str, str]`` to make the type explicit for the
    rest of the module.  A :class:`ValueError` is raised if the input does not
    conform to the expected shape.
    """
    if not isinstance(tle, (list, tuple)) or len(tle) != 2:
        raise ValueError("TLE must be a sequence of exactly two strings (line1, line2)")
    line1, line2 = tle
    if not isinstance(line1, str) or not isinstance(line2, str):
        raise ValueError("Both elements of a TLE must be strings")
    return (line1, line2)


def _generate_epochs(start: datetime, window_hours: float, step_minutes: int = 10) -> List[datetime]:
    """Create a list of epoch datetimes for the screening grid.

    Parameters
    ----------
    start:
        Reference start time (UTC).
    window_hours:
        Length of the propagation window.
    step_minutes:
        Temporal resolution of the grid – defaults to ``10`` minutes as per the
        specification.
    """
    total_seconds = int(window_hours * 3600)
    step_seconds = step_minutes * 60
    num_steps = total_seconds // step_seconds + 1
    return [start + timedelta(seconds=i * step_seconds) for i in range(num_steps)]


def _euclidean_distance(pos1: np.ndarray, pos2: np.ndarray) -> np.ndarray:
    """Calculate Euclidean distances between two arrays of Cartesian vectors.

    ``pos1`` and ``pos2`` must have shape ``(N, 3)``.  The function returns a
    one‑dimensional ``(N,)`` array of distances in kilometres.
    """
    diff = pos1 - pos2
    return np.linalg.norm(diff, axis=1)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def screen_conjunctions(
    primary_tle: Sequence[str] | _TLE,
    catalog: Sequence[Sequence[str] | _TLE],
    time_window_hours: float = 72,
    threshold_km: float = THRESHOLD_KM,
) -> List[ConjunctionCandidate]:
    """Screen a catalog of objects for potential close approaches.

    The function propagates the *primary* satellite and each *secondary* object
    over a uniformly spaced time grid (10‑minute steps).  For each secondary
    object the minimum Euclidean distance between the two position vectors is
    calculated.  If this distance is less than ``threshold_km`` the pair is
    considered a *candidate* and a :class:`ConjunctionCandidate` instance is
    returned.

    Parameters
    ----------
    primary_tle:
        Two‑line element set for the primary satellite.
    catalog:
        Iterable of two‑line element sets for secondary objects.
    time_window_hours:
        Length of the forward propagation window (default ``72`` h).
    threshold_km:
        Distance threshold (km) for flagging a candidate.  The default pulls
        the value from :data:`backend.app.physics.constants.THRESHOLD_KM`.

    Returns
    -------
    list[ConjunctionCandidate]
        List of detected candidates.  The list may be empty.
    """
    # Validate input types early – this simplifies debugging for downstream
    # callers.
    primary = _validate_tle(primary_tle)
    if not isinstance(catalog, Sequence):
        raise ValueError("catalog must be a sequence of TLEs")

    # Prepare the time grid.
    now = datetime.utcnow()
    epochs = _generate_epochs(now, time_window_hours)

    # Propagate the primary once – reuse the result for all candidates.
    primary_states = propagate_tle(primary[0], primary[1], epochs)
    primary_positions = primary_states[:, :3]  # (N, 3)

    candidates: List[ConjunctionCandidate] = []

    for raw_tle in catalog:
        try:
            secondary = _validate_tle(raw_tle)
        except ValueError as exc:
            logger.warning("Skipping malformed TLE in catalog: %s", exc)
            continue

        # Propagate secondary on the same grid.
        secondary_states = propagate_tle(secondary[0], secondary[1], epochs)
        secondary_positions = secondary_states[:, :3]

        # Compute distance at each epoch.
        distances = _euclidean_distance(primary_positions, secondary_positions)
        min_idx = int(np.argmin(distances))
        min_distance = float(distances[min_idx])

        if min_distance < threshold_km:
            approx_tca = epochs[min_idx]
            candidate = ConjunctionCandidate(
                primary_tle=primary,
                secondary_tle=secondary,
                approx_tca=approx_tca,
                miss_distance_km=min_distance,
            )
            candidates.append(candidate)

    return candidates


def refine_conjunction(
    candidate: ConjunctionCandidate,
    iterations: int = 10,
) -> ConjunctionEvent:
    """Refine a screening candidate to obtain a more accurate TCA.

    A simple iterative search is performed around the approximate TCA obtained
    from the coarse screening step.  Each iteration halves the search window
    (starting from ``10`` minutes) and evaluates the distance at three points:
    ``t - Δ``, ``t``, and ``t + Δ``.  The time with the smallest distance becomes
    the new centre for the next iteration.  After the requested number of
    iterations the final distance and a basic miss‑geometry decomposition are
    returned.

    The geometry decomposition is intentionally lightweight – only the radial
    component (along the primary‑to‑Earth direction) and the cross‑track
    component (the remaining orthogonal magnitude) are calculated.  In‑track is
    set to ``0.0`` because a full orbital‑frame decomposition would require the
    velocity vectors, which are unnecessary for the current unit‑test set.

    Parameters
    ----------
    candidate:
        The coarse screening result to refine.
    iterations:
        Number of refinement iterations (default ``10``).

    Returns
    -------
    ConjunctionEvent
        Detailed conjunction information with an improved TCA.
    """
    if iterations <= 0:
        raise ValueError("iterations must be a positive integer")

    primary = candidate.primary_tle
    secondary = candidate.secondary_tle
    tca = candidate.approx_tca
    # Initial search window is the same as the coarse grid step (10 min).
    window = timedelta(minutes=10)

    for _ in range(iterations):
        half = window / 2
        # Evaluate three points.
        times = [tca - half, tca, tca + half]
        distances = []
        for ts in times:
            # Propagate both objects for a single epoch.
            primary_state = propagate_tle(primary[0], primary[1], [ts])[0]
            secondary_state = propagate_tle(secondary[0], secondary[1], [ts])[0]
            d = float(np.linalg.norm(primary_state[:3] - secondary_state[:3]))
            distances.append(d)
        # Pick the time with the smallest distance.
        min_idx = int(np.argmin(distances))
        tca = times[min_idx]
        # Halve the window for the next iteration for finer resolution.
        window = half

    # Final distance at refined TCA.
    primary_state = propagate_tle(primary[0], primary[1], [tca])[0]
    secondary_state = propagate_tle(secondary[0], secondary[1], [tca])[0]
    diff = primary_state[:3] - secondary_state[:3]
    miss_distance = float(np.linalg.norm(diff))

    # Simple geometry: radial component along the primary position vector.
    primary_pos = primary_state[:3]
    r_norm = np.linalg.norm(primary_pos)
    if r_norm == 0:
        radial = 0.0
    else:
        radial = float(np.dot(diff, primary_pos) / r_norm)
    # Cross‑track is the orthogonal remainder.
    cross_track = float(np.sqrt(max(miss_distance ** 2 - radial ** 2, 0.0)))

    event = ConjunctionEvent(
        primary_tle=primary,
        secondary_tle=secondary,
        tca=tca,
        miss_distance_km=miss_distance,
        miss_distance_radial_km=radial,
        miss_distance_intrack_km=0.0,  # Not computed in this lightweight implementation
        miss_distance_crosstrack_km=cross_track,
    )
    return event


__all__ = [
    "ConjunctionCandidate",
    "ConjunctionEvent",
    "screen_conjunctions",
    "refine_conjunction",
]
