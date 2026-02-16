# -*- coding: utf-8 -*-
"""Unit tests for the screening utilities.

The tests verify that the coarse screening correctly identifies a threat when
the primary and secondary objects share the same orbit and that the refinement
routine improves the conjunction geometry.
"""

import pytest
from datetime import datetime, timedelta
import numpy as np

from app.physics.screening import (
    ConjunctionCandidate,
    ConjunctionEvent,
    screen_conjunctions,
    refine_conjunction,
)

# Simple ISS TLE (same as used in other tests)
ISS_TLE_LINE1 = "1 25544U 98067A   23247.51725687  .00023758  00000+0  42285-3 0  9992"
ISS_TLE_LINE2 = "2 25544  51.6425 172.3982 0004770  32.6683 192.7105 15.50399772384408"


def test_screen_conjunctions_no_threat():
    """Screening should return an empty list when objects are far apart.

    The primary is the ISS; the secondary is a GEO satellite with a very high
    semi‑major axis, ensuring the distance never falls below the default
    threshold.
    """
    # GEO satellite TLE (approximate, not physically accurate – the point is distance)
    GEO_TLE_LINE1 = "1 99999U 21001A   23247.00000000  .00000000  00000-0  00000-0 0  9991"
    GEO_TLE_LINE2 = "2 99999   0.0000   0.0000  0.0000   0.0000   0.0000  1.00000000    00"
    candidates = screen_conjunctions(
        primary_tle=(ISS_TLE_LINE1, ISS_TLE_LINE2),
        catalog=[(GEO_TLE_LINE1, GEO_TLE_LINE2)],
        time_window_hours=1,  # short window for speed
        threshold_km=5.0,
    )
    assert isinstance(candidates, list)
    assert len(candidates) == 0


def test_screen_conjunctions_detects_threat_and_refines():
    """When the primary and secondary TLE are identical a threat is detected.

    The refinement routine should return a ``ConjunctionEvent`` with a miss
    distance close to zero.
    """
    # Use the same TLE for primary and secondary – distance will be zero.
    candidates = screen_conjunctions(
        primary_tle=(ISS_TLE_LINE1, ISS_TLE_LINE2),
        catalog=[(ISS_TLE_LINE1, ISS_TLE_LINE2)],
        time_window_hours=1,
        threshold_km=5.0,
    )
    assert len(candidates) == 1
    candidate = candidates[0]
    assert isinstance(candidate, ConjunctionCandidate)
    # Ensure the reported miss distance is small (zero or near zero)
    assert candidate.miss_distance_km <= 0.001

    # Refine the candidate – the result should have a miss distance very close to 0.
    event = refine_conjunction(candidate, iterations=5)
    assert isinstance(event, ConjunctionEvent)
    # Miss distance after refinement should be essentially zero.
    assert event.miss_distance_km < 1e-3
    # Radial and cross‑track components should also be near zero.
    assert abs(event.miss_distance_radial_km) < 1e-3
    assert abs(event.miss_distance_crosstrack_km) < 1e-3


def test_refine_conjunction_invalid_iterations():
    candidate = ConjunctionCandidate(
        primary_tle=(ISS_TLE_LINE1, ISS_TLE_LINE2),
        secondary_tle=(ISS_TLE_LINE1, ISS_TLE_LINE2),
        approx_tca=datetime.utcnow(),
        miss_distance_km=0.0,
    )
    with pytest.raises(ValueError):
        refine_conjunction(candidate, iterations=0)
