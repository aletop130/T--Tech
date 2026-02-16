# -*- coding: utf-8 -*-
"""Unit tests for the collision risk calculation utilities.
"""

import pytest
import numpy as np
from math import isclose

from app.physics.risk import (
    calculate_collision_probability_chan,
    assess_risk_level,
    calculate_maximum_conjunction_time,
    CollisionRiskLevel,
)
from app.physics.propagator import StateVector
from datetime import datetime, timedelta


def test_calculate_collision_probability_valid():
    # Simple diagonal covariance matrices (positive values)
    cov = np.diag([0.01, 0.01, 0.01])
    prob = calculate_collision_probability_chan(cov, cov, miss_distance=0.1, combined_radius=0.2)
    assert 0.0 <= prob <= 1.0
    # Probability should increase as miss distance decreases (rough sanity check)
    prob_close = calculate_collision_probability_chan(cov, cov, miss_distance=0.01, combined_radius=0.2)
    assert prob_close >= prob


def test_calculate_collision_probability_invalid_inputs():
    cov = np.diag([0.01, 0.01, 0.01])
    with pytest.raises(ValueError):
        calculate_collision_probability_chan(cov, cov, miss_distance=-0.1, combined_radius=0.2)
    with pytest.raises(ValueError):
        calculate_collision_probability_chan(cov, cov, miss_distance=0.1, combined_radius=0.0)
    # Invalid shape
    bad_cov = np.zeros((2, 2))
    with pytest.raises(ValueError):
        calculate_collision_probability_chan(bad_cov, cov, miss_distance=0.1, combined_radius=0.2)


def test_assess_risk_level_classification():
    # Helper: object sizes (radii) 1 km each
    sizes = (1.0, 1.0)
    # Critical due to miss distance <= combined radius
    assert assess_risk_level(0.0, miss_distance_km=1.5, object_sizes=sizes) == CollisionRiskLevel.CRITICAL
    # Critical due to high probability
    assert assess_risk_level(1e-3, miss_distance_km=10.0, object_sizes=sizes) == CollisionRiskLevel.CRITICAL
    # High
    assert assess_risk_level(5e-6, miss_distance_km=10.0, object_sizes=sizes) == CollisionRiskLevel.HIGH
    # Medium
    assert assess_risk_level(5e-8, miss_distance_km=10.0, object_sizes=sizes) == CollisionRiskLevel.MEDIUM
    # Low
    assert assess_risk_level(1e-9, miss_distance_km=10.0, object_sizes=sizes) == CollisionRiskLevel.LOW
    # Invalid probability
    with pytest.raises(ValueError):
        assess_risk_level(-0.1, miss_distance_km=10.0, object_sizes=sizes)
    # Invalid miss distance
    with pytest.raises(ValueError):
        assess_risk_level(0.0, miss_distance_km=-5.0, object_sizes=sizes)
    # Invalid object sizes length
    with pytest.raises(ValueError):
        assess_risk_level(0.0, miss_distance_km=10.0, object_sizes=(1.0,))


def test_calculate_maximum_conjunction_time_cases():
    epoch = datetime.utcnow()
    # Objects already beyond threshold
    sv1 = StateVector(position=np.array([0.0, 0.0, 0.0]), velocity=np.array([0.0, 0.0, 0.0]), epoch=epoch)
    sv2 = StateVector(position=np.array([20.0, 0.0, 0.0]), velocity=np.array([0.0, 0.0, 0.0]), epoch=epoch)
    assert calculate_maximum_conjunction_time(sv1, sv2, threshold_km=10.0) == 0.0

    # Zero relative speed – objects will stay within threshold forever
    sv1 = StateVector(position=np.array([0.0, 0.0, 0.0]), velocity=np.array([0.0, 0.0, 0.0]), epoch=epoch)
    sv2 = StateVector(position=np.array([5.0, 0.0, 0.0]), velocity=np.array([0.0, 0.0, 0.0]), epoch=epoch)
    assert calculate_maximum_conjunction_time(sv1, sv2, threshold_km=10.0) == float('inf')

    # Normal case – relative speed moves them apart
    sv1 = StateVector(position=np.array([0.0, 0.0, 0.0]), velocity=np.array([0.0, 1.0, 0.0]), epoch=epoch)
    sv2 = StateVector(position=np.array([5.0, 0.0, 0.0]), velocity=np.array([0.0, 0.0, 0.0]), epoch=epoch)
    # Distance starts at 5 km, closing speed = 1 km/s, threshold 10 km -> time = (10-5)/1 = 5 s
    t = calculate_maximum_conjunction_time(sv1, sv2, threshold_km=10.0)
    assert isclose(t, 5.0, rel_tol=1e-3)
