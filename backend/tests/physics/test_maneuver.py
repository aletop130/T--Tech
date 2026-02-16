# -*- coding: utf-8 -*-
"""Unit tests for maneuver calculation utilities.
"""

import pytest
from datetime import datetime, timedelta
import numpy as np

from app.physics.maneuver import (
    OrbitElements,
    SatelliteState,
    ManeuverOption,
    calculate_raan_precession_rate,
    propose_in_plane_maneuvers,
    propose_out_of_plane_maneuvers,
    optimize_maneuver_timing,
    calculate_delta_v_cost,
)
from app.physics.screening import ConjunctionEvent

# Simple ISS-like TLE for constructing ConjunctionEvent objects in screening tests.
ISS_TLE_LINE1 = "1 25544U 98067A   23247.51725687  .00023758  00000+0  42285-3 0  9992"
ISS_TLE_LINE2 = "2 25544  51.6425 172.3982 0004770  32.6683 192.7105 15.50399772384408"


def test_calculate_raan_precession_rate_basic():
    orbit = OrbitElements(semi_major_axis_km=7000.0, eccentricity=0.001, inclination_rad=0.5)
    rate = calculate_raan_precession_rate(orbit)
    assert isinstance(rate, float)
    # For a prograde orbit the rate should be negative (westward drift)
    assert rate < 0


def test_calculate_raan_precession_rate_invalid_inputs():
    with pytest.raises(ValueError):
        calculate_raan_precession_rate(OrbitElements(semi_major_axis_km=-1, eccentricity=0.0, inclination_rad=0.0))
    with pytest.raises(ValueError):
        calculate_raan_precession_rate(OrbitElements(semi_major_axis_km=7000, eccentricity=1.0, inclination_rad=0.0))
    with pytest.raises(ValueError):
        calculate_raan_precession_rate(OrbitElements(semi_major_axis_km=7000, eccentricity=-0.1, inclination_rad=0.0))


def test_propose_in_plane_maneuvers_output():
    primary_state = SatelliteState(
        satellite_id="sat-1",
        mass_kg=1000.0,
        fuel_remaining_kg=500.0,
        delta_v_budget_m_s=0.5,
    )
    # Create a simple ConjunctionEvent with a small miss distance.
    event = ConjunctionEvent(
        primary_tle=(ISS_TLE_LINE1, ISS_TLE_LINE2),
        secondary_tle=(ISS_TLE_LINE1, ISS_TLE_LINE2),
        tca=datetime.utcnow(),
        miss_distance_km=1.0,
        miss_distance_radial_km=0.0,
        miss_distance_intrack_km=0.0,
        miss_distance_crosstrack_km=1.0,
    )
    options = propose_in_plane_maneuvers(primary_state, event, delta_v_budget=0.5)
    assert isinstance(options, list)
    assert len(options) == 2
    for opt in options:
        assert isinstance(opt, ManeuverOption)
        assert opt.type == "in_plane"
        # delta_v_m_s should be positive and correspond to the fraction of budget
        assert opt.delta_v_m_s > 0
        # Expected miss distance should be greater than the base miss distance
        assert opt.expected_miss_distance_km > event.miss_distance_km
        # Risk reduction percent must be between 0 and 100
        assert 0.0 <= opt.risk_reduction_percent <= 100.0
        # Fuel cost should be a positive number less than satellite mass
        assert 0.0 < opt.fuel_cost_kg < primary_state.mass_kg


def test_propose_out_of_plane_maneuvers_output():
    primary_state = SatelliteState(
        satellite_id="sat-2",
        mass_kg=800.0,
        fuel_remaining_kg=300.0,
        delta_v_budget_m_s=0.5,
    )
    event = ConjunctionEvent(
        primary_tle=(ISS_TLE_LINE1, ISS_TLE_LINE2),
        secondary_tle=(ISS_TLE_LINE1, ISS_TLE_LINE2),
        tca=datetime.utcnow(),
        miss_distance_km=2.0,
        miss_distance_radial_km=0.0,
        miss_distance_intrack_km=0.0,
        miss_distance_crosstrack_km=2.0,
    )
    options = propose_out_of_plane_maneuvers(primary_state, event, delta_v_budget=0.5)
    assert isinstance(options, list)
    assert len(options) == 1
    opt = options[0]
    assert opt.type == "out_of_plane"
    # delta_v_m_s should match the full budget (converted to m/s)
    assert opt.delta_v_m_s == 0.5 * 1000.0
    assert opt.fuel_cost_kg > 0


def test_optimize_maneuver_timing_selects_best():
    # Create two options with distinct risk reduction percentages.
    opt1 = ManeuverOption(
        maneuver_id="1",
        type="in_plane",
        delta_v_m_s=300.0,
        fuel_cost_kg=10.0,
        execution_time=datetime.utcnow(),
        expected_miss_distance_km=5.0,
        risk_reduction_percent=30.0,
        pros=[],
        cons=[],
    )
    opt2 = ManeuverOption(
        maneuver_id="2",
        type="out_of_plane",
        delta_v_m_s=200.0,
        fuel_cost_kg=8.0,
        execution_time=datetime.utcnow(),
        expected_miss_distance_km=6.0,
        risk_reduction_percent=60.0,
        pros=[],
        cons=[],
    )
    # Dummy conjunction event (not used by the optimizer)
    dummy_event = ConjunctionEvent(
        primary_tle=(ISS_TLE_LINE1, ISS_TLE_LINE2),
        secondary_tle=(ISS_TLE_LINE1, ISS_TLE_LINE2),
        tca=datetime.utcnow(),
        miss_distance_km=1.0,
        miss_distance_radial_km=0.0,
        miss_distance_intrack_km=0.0,
        miss_distance_crosstrack_km=1.0,
    )
    best = optimize_maneuver_timing([opt1, opt2], dummy_event)
    assert best == opt2


def test_optimize_maneuver_timing_no_options():
    dummy_event = ConjunctionEvent(
        primary_tle=(ISS_TLE_LINE1, ISS_TLE_LINE2),
        secondary_tle=(ISS_TLE_LINE1, ISS_TLE_LINE2),
        tca=datetime.utcnow(),
        miss_distance_km=1.0,
        miss_distance_radial_km=0.0,
        miss_distance_intrack_km=0.0,
        miss_distance_crosstrack_km=1.0,
    )
    with pytest.raises(ValueError):
        optimize_maneuver_timing([], dummy_event)


def test_calculate_delta_v_cost_matches_estimate():
    primary_state = SatelliteState(
        satellite_id="sat-3",
        mass_kg=1200.0,
        fuel_remaining_kg=600.0,
        delta_v_budget_m_s=0.5,
    )
    opt = ManeuverOption(
        maneuver_id="opt",
        type="in_plane",
        delta_v_m_s=250.0,  # 0.25 km/s
        fuel_cost_kg=0.0,    # placeholder, will be recomputed
        execution_time=datetime.utcnow(),
        expected_miss_distance_km=3.0,
        risk_reduction_percent=40.0,
        pros=[],
        cons=[],
    )
    fuel = calculate_delta_v_cost(opt, primary_state)
    # Fuel cost should be positive and less than the total mass.
    assert fuel > 0
    assert fuel < primary_state.mass_kg
