"""Ground track and sensor footprint computation service."""

from __future__ import annotations

import math
from datetime import datetime, timedelta
from typing import Optional

from skyfield.api import EarthSatellite, load

from app.core.logging import get_logger
from skyfield.api import wgs84

from app.schemas.ground_track import (
    GroundTrackPoint, GroundTrack, SensorFootprint,
    SatellitePass, PassPredictions,
)

logger = get_logger(__name__)

_TSF = load.timescale()


def compute_ground_track(
    norad_id: int,
    satellite_name: str,
    tle_line1: str,
    tle_line2: str,
    duration_minutes: int = 90,
    interval_seconds: int = 60,
) -> GroundTrack:
    """Compute sub-satellite ground track points over a time window.

    Uses SGP4 via skyfield to propagate the TLE, then converts each
    ECI position to geodetic lat/lon/alt.
    """
    sat = EarthSatellite(tle_line1, tle_line2, name=satellite_name, ts=_TSF)
    start = datetime.utcnow()
    total_seconds = duration_minutes * 60

    points: list[GroundTrackPoint] = []
    offset = 0
    while offset <= total_seconds:
        dt = start + timedelta(seconds=offset)
        t = _TSF.utc(dt.year, dt.month, dt.day, dt.hour, dt.minute,
                      dt.second + dt.microsecond / 1_000_000)
        subpoint = sat.at(t).subpoint()
        points.append(GroundTrackPoint(
            time_offset_s=float(offset),
            latitude=subpoint.latitude.degrees,
            longitude=subpoint.longitude.degrees,
            altitude_km=subpoint.elevation.km,
        ))
        offset += interval_seconds

    return GroundTrack(
        norad_id=norad_id,
        satellite_name=satellite_name,
        duration_minutes=duration_minutes,
        interval_seconds=interval_seconds,
        points=points,
    )


def compute_sensor_footprint(
    norad_id: int,
    tle_line1: str,
    tle_line2: str,
    fov_deg: float = 30.0,
) -> SensorFootprint:
    """Compute the current sensor footprint on the ground.

    The footprint radius on the surface is approximated as:
        radius_km = altitude_km * tan(fov_deg / 2)
    This is the nadir-pointing conical FOV projection.
    """
    sat = EarthSatellite(tle_line1, tle_line2, name="footprint", ts=_TSF)
    now = datetime.utcnow()
    t = _TSF.utc(now.year, now.month, now.day, now.hour, now.minute,
                  now.second + now.microsecond / 1_000_000)
    subpoint = sat.at(t).subpoint()

    alt_km = subpoint.elevation.km
    half_fov_rad = math.radians(fov_deg / 2.0)
    radius_km = alt_km * math.tan(half_fov_rad)

    return SensorFootprint(
        norad_id=norad_id,
        center_lat=subpoint.latitude.degrees,
        center_lon=subpoint.longitude.degrees,
        radius_km=radius_km,
        altitude_km=alt_km,
        fov_deg=fov_deg,
    )


def compute_pass_predictions(
    norad_id: int,
    satellite_name: str,
    tle_line1: str,
    tle_line2: str,
    observer_lat: float,
    observer_lon: float,
    hours: int = 24,
    min_elevation_deg: float = 5.0,
) -> PassPredictions:
    """Predict satellite passes over a ground observer location.

    Scans forward in time at 30-second steps to find intervals where
    the satellite is above the minimum elevation angle. Groups these
    into individual passes with rise/culmination/set times.
    """
    sat = EarthSatellite(tle_line1, tle_line2, name=satellite_name, ts=_TSF)
    observer = wgs84.latlon(observer_lat, observer_lon)

    start = datetime.utcnow()
    step_seconds = 30
    total_seconds = hours * 3600

    # Scan for above-horizon intervals
    passes: list[SatellitePass] = []
    in_pass = False
    pass_start: datetime | None = None
    max_el = 0.0
    max_el_time: datetime | None = None

    offset = 0
    while offset <= total_seconds:
        dt = start + timedelta(seconds=offset)
        t = _TSF.utc(dt.year, dt.month, dt.day, dt.hour, dt.minute,
                      dt.second + dt.microsecond / 1_000_000)
        difference = sat - observer
        topocentric = difference.at(t)
        alt_deg, _, _ = topocentric.altaz()
        el = alt_deg.degrees

        if el >= min_elevation_deg:
            if not in_pass:
                in_pass = True
                pass_start = dt
                max_el = el
                max_el_time = dt
            elif el > max_el:
                max_el = el
                max_el_time = dt
        else:
            if in_pass:
                # Pass ended
                passes.append(SatellitePass(
                    rise_time=pass_start.isoformat() + "Z",
                    culmination_time=max_el_time.isoformat() + "Z",
                    set_time=dt.isoformat() + "Z",
                    max_elevation_deg=round(max_el, 2),
                    duration_seconds=(dt - pass_start).total_seconds(),
                ))
                in_pass = False
                pass_start = None
                max_el = 0.0
                max_el_time = None

        offset += step_seconds

    # If still in a pass at the end of the window, close it
    if in_pass and pass_start and max_el_time:
        end_dt = start + timedelta(seconds=total_seconds)
        passes.append(SatellitePass(
            rise_time=pass_start.isoformat() + "Z",
            culmination_time=max_el_time.isoformat() + "Z",
            set_time=end_dt.isoformat() + "Z",
            max_elevation_deg=round(max_el, 2),
            duration_seconds=(end_dt - pass_start).total_seconds(),
        ))

    return PassPredictions(
        norad_id=norad_id,
        satellite_name=satellite_name,
        observer_lat=observer_lat,
        observer_lon=observer_lon,
        passes=passes,
    )
