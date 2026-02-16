# WRITE_TARGET="backend/app/physics/constants.py"
# WRITE_CONTENT_LENGTH=0
"""Physics constants and conversion utilities for the Detour system.

All constants are defined with type hints using `typing.Final` to indicate that
their values are immutable. Conversion functions are provided for common unit
transformations required by the orbital mechanics modules.
"""

import math
from typing import Final

# Gravitational parameter of Earth (μ = GM) in m³/s²
MU_EARTH: Final[float] = 3.986004418e14

# Mean Earth radius in meters (WGS84)
R_EARTH: Final[float] = 6378137.0

# Earth's second zonal harmonic coefficient (J2)
J2: Final[float] = 0.00108263

# Earth's rotation rate in rad/s
OMEGA_EARTH: Final[float] = 7.2921158553e-5

# Screening constants (kilometers)
THRESHOLD_KM: Final[float] = 5.0
RADIUS_KM: Final[float] = 10.0

# Conversion functions
def km_to_m(km: float) -> float:
    """Convert kilometres to metres.

    Args:
        km: Distance in kilometres.
    Returns:
        Distance in metres.
    """
    return km * 1000.0


def m_to_km(m: float) -> float:
    """Convert metres to kilometres.

    Args:
        m: Distance in metres.
    Returns:
        Distance in kilometres.
    """
    return m / 1000.0


def deg_to_rad(deg: float) -> float:
    """Convert degrees to radians.

    Args:
        deg: Angle in degrees.
    Returns:
        Angle in radians.
    """
    return deg * (math.pi / 180.0)


def rad_to_deg(rad: float) -> float:
    """Convert radians to degrees.

    Args:
        rad: Angle in radians.
    Returns:
        Angle in degrees.
    """
    return rad * (180.0 / math.pi)

__all__ = [
    "MU_EARTH",
    "R_EARTH",
    "J2",
    "OMEGA_EARTH",
    "THRESHOLD_KM",
    "RADIUS_KM",
    "km_to_m",
    "m_to_km",
    "deg_to_rad",
    "rad_to_deg",
]
