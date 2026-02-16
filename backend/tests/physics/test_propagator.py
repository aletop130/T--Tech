# -*- coding: utf-8 -*-
"""Unit tests for the orbit propagator module.

These tests cover valid usage, error handling and edge cases for the
functions in ``app.physics.propagator``.
"""

import math
from datetime import datetime, timedelta
import numpy as np
import pytest

from app.physics.propagator import (
    StateVector,
    propagate_tle,
    tle_to_state_vector,
    propagate_state_vector,
)

# A known good TLE for the International Space Station (ISS)
ISS_TLE_LINE1 = "1 25544U 98067A   23247.51725687  .00023758  00000+0  42285-3 0  9992"
ISS_TLE_LINE2 = "2 25544  51.6425 172.3982 0004770  32.6683 192.7105 15.50399772384408"


def test_state_vector_validation():
    """StateVector should reject invalid shapes and types."""
    # Wrong position shape
    with pytest.raises(ValueError):
        StateVector(position=np.zeros((2,)), velocity=np.zeros(3), epoch=datetime.utcnow())
    # Wrong velocity shape
    with pytest.raises(ValueError):
        StateVector(position=np.zeros(3), velocity=np.zeros((2,)), epoch=datetime.utcnow())
    # Wrong epoch type
    with pytest.raises(ValueError):
        StateVector(position=np.zeros(3), velocity=np.zeros(3), epoch="not-a-datetime")


def test_propagate_tle_basic():
    """Propagate a known TLE over two epochs and verify output shape."""
    now = datetime.utcnow()
    epochs = [now, now + timedelta(minutes=10)]
    result = propagate_tle(ISS_TLE_LINE1, ISS_TLE_LINE2, epochs)
    assert isinstance(result, np.ndarray)
    assert result.shape == (2, 6)
    # All values should be finite numbers
    assert np.isfinite(result).all()


def test_propagate_tle_empty_epochs():
    result = propagate_tle(ISS_TLE_LINE1, ISS_TLE_LINE2, [])
    assert isinstance(result, np.ndarray)
    assert result.shape == (0, 6)


def test_propagate_tle_invalid_tle():
    with pytest.raises(ValueError):
        propagate_tle("invalid line1", "invalid line2", [datetime.utcnow()])


def test_tle_to_state_vector():
    epoch = datetime.utcnow()
    sv = tle_to_state_vector(ISS_TLE_LINE1, ISS_TLE_LINE2, epoch)
    assert isinstance(sv, StateVector)
    # Position and velocity vectors are length‑3 arrays
    assert sv.position.shape == (3,)
    assert sv.velocity.shape == (3,)
    assert sv.epoch == epoch


def test_propagate_state_vector_positive_dt():
    # Use a simple circular orbit state (approximate values)
    pos = np.array([7000.0, 0.0, 0.0])  # km
    vel = np.array([0.0, 7.5, 0.0])    # km/s
    sv = StateVector(position=pos, velocity=vel, epoch=datetime.utcnow())
    new_sv = propagate_state_vector(sv, dt_seconds=60)
    assert isinstance(new_sv, StateVector)
    # Propagation should change the position (or at least not be identical)
    assert not np.allclose(new_sv.position, sv.position)
    assert new_sv.epoch == sv.epoch + timedelta(seconds=60)


def test_propagate_state_vector_negative_dt():
    pos = np.array([7000.0, 0.0, 0.0])
    vel = np.array([0.0, 7.5, 0.0])
    sv = StateVector(position=pos, velocity=vel, epoch=datetime.utcnow())
    with pytest.raises(ValueError):
        propagate_state_vector(sv, dt_seconds=-10)
