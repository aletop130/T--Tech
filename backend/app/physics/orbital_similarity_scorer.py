"""Bayesian orbital similarity scoring.

Detects co-orbital shadowing: a foreign satellite deliberately mirrors the
orbital plane of an allied asset (matched inclination + altitude).

Divergence metric (lower = more similar orbits):
    d_inc  = |inc_a - inc_b| / 90.0         (normalised; 0-2 for LEO)
    d_alt  = |alt_a - alt_b| / 500.0        (normalised; 500 km reference spread)
    divergence = sqrt(d_inc^2 + d_alt^2)

Ported from ORBITAL SHIELD orbital_similarity_scorer.py.
"""

from __future__ import annotations

import math

from app.physics.bayesian_scorer import ADVERSARIAL_COUNTRIES

# Orbital-similarity-specific priors (separate from proximity scorer)
PRIOR_ADVERSARIAL = 0.05
PRIOR_BENIGN = 0.0000005

# Log-normal parameters for orbital divergence score
BENIGN_MU = -1.0
BENIGN_SIGMA = 1.0

THREAT_MU = -3.0
THREAT_SIGMA = 0.8

# Divergence below this is flagged as suspiciously similar
SIMILARITY_THRESHOLD = 0.15


def _lognormal_pdf(x: float, mu: float, sigma: float) -> float:
    """Evaluate log-normal PDF at x (x must be > 0)."""
    if x <= 0:
        return 0.0
    log_x = math.log(x)
    exponent = -((log_x - mu) ** 2) / (2 * sigma ** 2)
    return (1.0 / (x * sigma * math.sqrt(2 * math.pi))) * math.exp(exponent)


def orbital_divergence(
    altitude_km_a: float,
    inclination_deg_a: float,
    altitude_km_b: float,
    inclination_deg_b: float,
) -> float:
    """Normalised orbital divergence metric — lower means more similar orbits."""
    d_inc = abs(inclination_deg_a - inclination_deg_b) / 90.0
    d_alt = abs(altitude_km_a - altitude_km_b) / 500.0
    return math.sqrt(d_inc ** 2 + d_alt ** 2)


def likelihood_ratio(divergence: float) -> float:
    """LR = P(divergence | shadowing) / P(divergence | benign)."""
    if divergence <= 0:
        return float("inf")
    threat_pdf = _lognormal_pdf(divergence, THREAT_MU, THREAT_SIGMA)
    benign_pdf = _lognormal_pdf(divergence, BENIGN_MU, BENIGN_SIGMA)
    return threat_pdf / max(benign_pdf, 1e-12)


def score_orbital_similarity(
    altitude_km_a: float,
    inclination_deg_a: float,
    altitude_km_b: float,
    inclination_deg_b: float,
    country_code: str,
    rcs_size: str = "",
) -> tuple[float, float]:
    """Full Bayesian orbital similarity score.

    Returns (divergence_score, posterior_probability) where:
        divergence_score — raw metric (lower = more similar)
        posterior        — P(intentional shadowing | divergence, country)
    """
    base_prior = PRIOR_ADVERSARIAL if country_code in ADVERSARIAL_COUNTRIES else PRIOR_BENIGN
    if rcs_size == "SMALL":
        base_prior = min(base_prior * 1.5, 1.0)

    div = orbital_divergence(altitude_km_a, inclination_deg_a, altitude_km_b, inclination_deg_b)
    lr = likelihood_ratio(div)

    if base_prior <= 0:
        return div, 0.0
    if base_prior >= 1:
        return div, 1.0
    if math.isinf(lr):
        return div, 1.0

    num = lr * base_prior
    den = num + (1.0 - base_prior)
    posterior = max(0.0, min(1.0, num / den)) if den > 0 else 0.0
    return div, posterior
