# -*- coding: utf-8 -*-
"""Additional coverage tests for physics helper modules.

These tests ensure that simple utility functions and stub implementations are exercised
so that coverage for the physics package exceeds the required 90% per module.
"""

import math
import numpy as np

from app.physics.constants import km_to_m, m_to_km, deg_to_rad, rad_to_deg
from app.physics.frames import eci_to_ecef
from app.physics.utils import degrees_to_radians

def test_km_to_m_and_m_to_km():
    # Test conversion both directions with a few typical values
    for km in [0.0, 1.23, 1000.0, -5.5]:
        meters = km_to_m(km)
        assert meters == km * 1000.0
        assert m_to_km(meters) == km

def test_deg_to_rad_and_rad_to_deg():
    # Verify round‑trip conversion between degrees and radians
    for deg in [0.0, 45.0, 90.0, 180.0, -30.0, 360.0]:
        rad = deg_to_rad(deg)
        # Use math.isclose for floating‑point tolerance
        assert math.isclose(rad, deg * (math.pi / 180.0), rel_tol=1e-12)
        assert math.isclose(rad_to_deg(rad), deg, rel_tol=1e-12)

def test_eci_to_ecef_stub():
    # The stub should return the inputs unchanged
    pos = np.array([7000.0, -1200.0, 300.0])
    vel = np.array([0.0, 7.5, 0.0])
    epoch = None  # epoch is ignored in the stub
    pos_out, vel_out = eci_to_ecef(pos, vel, epoch)
    assert np.array_equal(pos_out, pos)
    assert np.array_equal(vel_out, vel)

def test_degrees_to_radians_util():
    # Verify that the utility matches the standard conversion
    for deg in [0, 30, 45, 60, 90, 180]:
        rad = degrees_to_radians(float(deg))
        expected = deg * math.pi / 180.0
        assert math.isclose(rad, expected, rel_tol=1e-12)
