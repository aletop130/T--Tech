"""Satellite footprint calculations for coverage area visualization.

Provides functions to calculate the ground footprint (coverage area) of a satellite
based on its altitude and minimum elevation angle for communication.
"""

import math
from dataclasses import dataclass
from typing import List, Tuple

from app.physics.constants import R_EARTH, deg_to_rad, rad_to_deg


@dataclass
class FootprintResult:
    """Result of satellite footprint calculation."""
    radius_km: float
    area_km2: float
    swath_width_km: float
    central_angle_deg: float
    earth_central_angle_deg: float


@dataclass
class CoveragePoint:
    """A point on the coverage polygon."""
    latitude: float
    longitude: float


def calculate_satellite_footprint(
    altitude_km: float,
    min_elevation_deg: float = 10.0,
) -> FootprintResult:
    """Calculate satellite ground footprint based on altitude and minimum elevation.
    
    Uses spherical Earth geometry to compute the coverage radius on Earth's surface.
    
    Args:
        altitude_km: Satellite altitude above Earth's surface in kilometers.
        min_elevation_deg: Minimum elevation angle for ground station visibility
            in degrees. Default is 10 degrees (typical for LEO satellites).
    
    Returns:
        FootprintResult with radius, area, and geometric parameters.
    
    Reference:
        https://en.wikipedia.org/wiki/Satellite_foothprint
    """
    R = R_EARTH / 1000.0  # Earth radius in km
    h = altitude_km
    eta = deg_to_rad(min_elevation_deg)
    
    central_angle = math.asin(
        (R / (R + h)) * math.cos(eta)
    ) - eta
    
    radius_km = R * central_angle
    
    area_km2 = 2 * math.pi * R**2 * (1 - math.cos(central_angle))
    
    swath_width_km = 2 * radius_km
    
    earth_central_angle_deg = rad_to_deg(central_angle)
    
    return FootprintResult(
        radius_km=radius_km,
        area_km2=area_km2,
        swath_width_km=swath_width_km,
        central_angle_deg=rad_to_deg(
            math.pi / 2 - eta - central_angle
        ),
        earth_central_angle_deg=earth_central_angle_deg,
    )


def get_footprint_polygon(
    satellite_lat: float,
    satellite_lon: float,
    footprint_radius_km: float,
    num_points: int = 36,
) -> List[CoveragePoint]:
    """Generate polygon points for satellite footprint visualization.
    
    Creates a circular polygon centered on the satellite's sub-satellite point
    (ground track position) with the specified radius.
    
    Args:
        satellite_lat: Satellite latitude (sub-satellite point) in degrees.
        satellite_lon: Satellite longitude (sub-satellite point) in degrees.
        footprint_radius_km: Radius of the footprint in kilometers.
        num_points: Number of points to generate for the polygon. Default 36.
    
    Returns:
        List of CoveragePoint forming the footprint boundary.
    """
    points: List[CoveragePoint] = []
    
    R = R_EARTH / 1000.0  # Earth radius in km
    
    angular_radius = footprint_radius_km / R
    
    lat_rad = deg_to_rad(satellite_lat)
    lon_rad = deg_to_rad(satellite_lon)
    
    for i in range(num_points):
        angle = 2 * math.pi * i / num_points
        
        point_lat_rad = math.asin(
            math.sin(lat_rad) * math.cos(angular_radius) +
            math.cos(lat_rad) * math.sin(angular_radius) * math.cos(angle)
        )
        
        point_lon_rad = lon_rad + math.atan2(
            math.sin(angle) * math.sin(angular_radius) * math.cos(lat_rad),
            math.cos(angular_radius) - math.sin(lat_rad) * math.sin(point_lat_rad)
        )
        
        point_lon_rad = ((point_lon_rad + math.pi) % (2 * math.pi)) - math.pi
        
        points.append(CoveragePoint(
            latitude=rad_to_deg(point_lat_rad),
            longitude=rad_to_deg(point_lon_rad),
        ))
    
    return points


def calculate_elevation_mask(
    altitude_km: float,
    distance_km: float,
) -> float:
    """Calculate elevation angle to satellite from a ground point.
    
    Args:
        altitude_km: Satellite altitude in km.
        distance_km: Ground distance from sub-satellite point in km.
    
    Returns:
        Elevation angle in degrees.
    """
    R = R_EARTH / 1000.0
    r = R + altitude_km
    
    gamma = distance_km / R
    
    elevation_rad = math.atan(
        (math.cos(gamma) - R / r) / math.sin(gamma)
    )
    
    return rad_to_deg(elevation_rad)


def is_point_in_footprint(
    point_lat: float,
    point_lon: float,
    satellite_lat: float,
    satellite_lon: float,
    footprint_radius_km: float,
) -> bool:
    """Check if a ground point is within satellite footprint.
    
    Uses Haversine formula for great-circle distance calculation.
    
    Args:
        point_lat: Point latitude in degrees.
        point_lon: Point longitude in degrees.
        satellite_lat: Satellite latitude in degrees.
        satellite_lon: Satellite longitude in degrees.
        footprint_radius_km: Footprint radius in km.
    
    Returns:
        True if point is within footprint, False otherwise.
    """
    distance = haversine_distance_km(
        point_lat, point_lon,
        satellite_lat, satellite_lon,
    )
    
    return distance <= footprint_radius_km


def haversine_distance_km(
    lat1: float,
    lon1: float,
    lat2: float,
    lon2: float,
) -> float:
    """Calculate great-circle distance between two points using Haversine formula.
    
    Args:
        lat1, lon1: First point coordinates in degrees.
        lat2, lon2: Second point coordinates in degrees.
    
    Returns:
        Distance in kilometers.
    """
    R = R_EARTH / 1000.0
    
    lat1_rad = deg_to_rad(lat1)
    lat2_rad = deg_to_rad(lat2)
    delta_lat = deg_to_rad(lat2 - lat1)
    delta_lon = deg_to_rad(lon2 - lon1)
    
    a = (
        math.sin(delta_lat / 2) ** 2 +
        math.cos(lat1_rad) * math.cos(lat2_rad) *
        math.sin(delta_lon / 2) ** 2
    )
    
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    
    return R * c


def analyze_combined_coverage(
    satellites: List[Tuple[float, float, float]],
    region_bounds: Tuple[float, float, float, float],
    grid_resolution_deg: float = 1.0,
) -> dict:
    """Analyze combined coverage from multiple satellites over a region.
    
    Args:
        satellites: List of (latitude, longitude, altitude_km) for each satellite.
        region_bounds: (min_lat, max_lat, min_lon, max_lon) for the region.
        grid_resolution_deg: Grid resolution for analysis in degrees.
    
    Returns:
        Dict with coverage statistics including gaps and overlap areas.
    """
    min_lat, max_lat, min_lon, max_lon = region_bounds
    
    footprints = []
    for sat_lat, sat_lon, alt_km in satellites:
        footprint = calculate_satellite_footprint(alt_km)
        footprints.append({
            'lat': sat_lat,
            'lon': sat_lon,
            'radius_km': footprint.radius_km,
        })
    
    covered_points = set()
    multi_coverage_points = set()
    
    lat_step = grid_resolution_deg
    lon_step = grid_resolution_deg
    
    lat = min_lat
    while lat <= max_lat:
        lon = min_lon
        while lon <= max_lon:
            coverage_count = 0
            for fp in footprints:
                if is_point_in_footprint(lat, lon, fp['lat'], fp['lon'], fp['radius_km']):
                    coverage_count += 1
            
            if coverage_count > 0:
                covered_points.add((round(lat, 2), round(lon, 2)))
                if coverage_count > 1:
                    multi_coverage_points.add((round(lat, 2), round(lon, 2)))
            
            lon += lon_step
        lat += lat_step
    
    total_grid_points = int(
        ((max_lat - min_lat) / grid_resolution_deg + 1) *
        ((max_lon - min_lon) / grid_resolution_deg + 1)
    )
    
    return {
        'total_points': total_grid_points,
        'covered_points': len(covered_points),
        'coverage_percent': len(covered_points) / total_grid_points * 100 if total_grid_points > 0 else 0,
        'overlap_points': len(multi_coverage_points),
        'overlap_percent': len(multi_coverage_points) / total_grid_points * 100 if total_grid_points > 0 else 0,
        'gap_points': total_grid_points - len(covered_points),
        'gap_percent': (1 - len(covered_points) / total_grid_points) * 100 if total_grid_points > 0 else 100,
    }


__all__ = [
    "FootprintResult",
    "CoveragePoint",
    "calculate_satellite_footprint",
    "get_footprint_polygon",
    "calculate_elevation_mask",
    "is_point_in_footprint",
    "haversine_distance_km",
    "analyze_combined_coverage",
]
