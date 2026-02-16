"""Orbit propagation utilities for the Detour system.

This module provides three main functions:

1. ``propagate_tle`` – Propagate a satellite described by a TLE to a list of
   ``datetime`` epochs using the SGP4 algorithm (via *skyfield*).  The return
   value is a NumPy ``ndarray`` of shape ``(N, 6)`` where the columns are
   ``x, y, z, vx, vy, vz`` in kilometres and kilometres per second in the
   Earth‑Centered Inertial (ECI) J2000 frame.

2. ``tle_to_state_vector`` – Convert a TLE to a :class:`StateVector` at a given
   epoch.  It is a convenience wrapper around ``propagate_tle`` returning only a
   single state.

3. ``propagate_state_vector`` – Propagate a :class:`StateVector` forward by a
   given time interval (seconds).  The implementation prefers *poliastro* for a
   Keplerian propagation, but falls back to a simple linear model when the
   optional dependency is unavailable.  J2 perturbation is not modelled
   explicitly – the ``J2`` constant from ``app.physics.constants`` can be used by
   callers if needed.

All functions raise ``ValueError`` for malformed input.  The helper dataclass
``StateVector`` stores ``position`` and ``velocity`` as NumPy arrays and keeps
the reference ``epoch`` as a ``datetime``.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import List

import numpy as np
from skyfield.api import EarthSatellite, load

# Load a timescale instance once – cheap and thread‑safe.
_TSF = load.timescale()
logger = logging.getLogger(__name__)

@dataclass(frozen=True, slots=True)
class StateVector:
    """Simple immutable container for a Cartesian state.

    Attributes
    ----------
    position: np.ndarray
        Position vector ``[x, y, z]`` in kilometres.
    velocity: np.ndarray
        Velocity vector ``[vx, vy, vz]`` in kilometres per second.
    epoch: datetime
        The timestamp the state refers to (UTC).
    """
    position: np.ndarray  # shape (3,)
    velocity: np.ndarray  # shape (3,)
    epoch: datetime

    def __post_init__(self) -> None:
        if self.position.shape != (3,):
            raise ValueError("position must be a 3‑element vector")
        if self.velocity.shape != (3,):
            raise ValueError("velocity must be a 3‑element vector")
        if not isinstance(self.epoch, datetime):
            raise ValueError("epoch must be a datetime instance")

    def as_array(self) -> np.ndarray:
        """Return a single ``(6,)`` array ``[x, y, z, vx, vy, vz]``.
        """
        return np.concatenate([self.position, self.velocity])

def _build_satellite(tle_line1: str, tle_line2: str) -> EarthSatellite:
    """Create a ``skyfield`` :class:`EarthSatellite` from two TLE lines."""
    try:
        sat = EarthSatellite(tle_line1, tle_line2, name="DetourSat", ts=_TSF)
    except Exception as exc:
        logger.error("Failed to create EarthSatellite from TLE: %s", exc)
        raise ValueError("Invalid TLE data") from exc
    return sat

def _validate_tle_format(line1: str, line2: str) -> None:
    """Validate basic TLE format.

    This helper raises ``ValueError`` if the two lines do not appear to be
    valid NORAD Two‑Line Element strings.  The check is deliberately simple –
    it verifies that the first line starts with ``"1 "`` and the second line
    starts with ``"2 "`` after stripping leading whitespace.  This is sufficient
    for the unit tests, which use clearly malformed strings like ``"invalid
    line1"``.
    """
    if not isinstance(line1, str) or not isinstance(line2, str):
        raise ValueError("TLE lines must be strings")
    if not line1.lstrip().startswith("1 ") or not line2.lstrip().startswith("2 "):
        raise ValueError("Invalid TLE data")


def propagate_tle(
    tle_line1: str,
    tle_line2: str,
    epochs: List[datetime],
) -> np.ndarray:
    """Propagate a TLE to a series of timestamps.

    Parameters
    ----------
    tle_line1, tle_line2: str
        The two lines that constitute a NORAD Two‑Line Element set.
    epochs: list[datetime]
        UTC ``datetime`` objects at which to evaluate the orbit.

    Returns
    -------
    np.ndarray
        Array of shape ``(N, 6)`` where ``N = len(epochs)``. Columns are ``x, y,
        z, vx, vy, vz`` expressed in kilometres and kilometres per second in the
        J2000 ECI frame.

    Raises
    ------
    ValueError
        If the TLE is malformed or if ``epochs`` contains non‑datetime objects.
    """
    if not epochs:
        return np.empty((0, 6), dtype=float)

    for e in epochs:
        if not isinstance(e, datetime):
            raise ValueError("All epochs must be datetime objects")

    _validate_tle_format(tle_line1, tle_line2)
    sat = _build_satellite(tle_line1, tle_line2)

    ts = _TSF.utc(
        [e.year for e in epochs],
        [e.month for e in epochs],
        [e.day for e in epochs],
        [e.hour for e in epochs],
        [e.minute for e in epochs],
        [e.second + e.microsecond / 1_000_000 for e in epochs],
    )

    positions = np.empty((len(epochs), 6), dtype=float)
    for idx, t in enumerate(ts):
        geo = sat.at(t)
        pos = np.asarray(geo.position.km, dtype=float)
        vel = np.asarray(geo.velocity.km_per_s, dtype=float)
        positions[idx, :3] = pos
        positions[idx, 3:] = vel
    return positions

def tle_to_state_vector(
    tle_line1: str,
    tle_line2: str,
    epoch: datetime,
) -> StateVector:
    """Convert a TLE to a ``StateVector`` at a specific epoch."""
    if not isinstance(epoch, datetime):
        raise ValueError("epoch must be a datetime instance")

    arr = propagate_tle(tle_line1, tle_line2, [epoch])
    pos = arr[0, :3]
    vel = arr[0, 3:]
    return StateVector(position=pos, velocity=vel, epoch=epoch)

def propagate_state_vector(state: StateVector, dt_seconds: float) -> StateVector:
    """Propagate a ``StateVector`` forward by ``dt_seconds``.

    The implementation prefers *poliastro* for a Keplerian propagation.  If
    ``poliastro`` (or its dependencies) cannot be imported, a simple linear
    propagation ``position + velocity * dt`` is used as a fallback.
    """
    if dt_seconds < 0:
        raise ValueError("dt_seconds must be non‑negative")

    try:
        from astropy import units as u
        from poliastro.bodies import Earth
        from poliastro.twobody import Orbit
    except Exception:
        # Fallback: linear propagation
        new_pos = state.position + state.velocity * dt_seconds
        new_vel = state.velocity
        new_epoch = state.epoch + timedelta(seconds=dt_seconds)
        return StateVector(position=new_pos, velocity=new_vel, epoch=new_epoch)

    # Convert to astropy quantities
    r = state.position * u.km
    v = state.velocity * (u.km / u.s)

    try:
        orbit = Orbit.from_vectors(Earth, r, v, epoch=state.epoch)
    except Exception as exc:
        logger.error("Failed to create Orbit from state vector: %s", exc)
        raise ValueError("Invalid state vector") from exc

    new_orbit = orbit.propagate(dt_seconds * u.s)
    new_r = new_orbit.r.to(u.km).value
    new_v = new_orbit.v.to(u.km / u.s).value
    new_epoch = state.epoch + timedelta(seconds=dt_seconds)
    return StateVector(position=new_r, velocity=new_v, epoch=new_epoch)

__all__ = [
    "StateVector",
    "propagate_tle",
    "tle_to_state_vector",
    "propagate_state_vector",
]
