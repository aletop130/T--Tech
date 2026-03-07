"""Bayesian threat scoring for proximity threats.

Computes P(threat | min_separation) using:
- Benign distribution: LogNormal(mu=5.063, sigma=1.369) — fitted from 500 non-adversarial sats
- Threat distribution: LogNormal(mu=3.5, sigma=1.2) — expert-informed inspector standoff distances
- Prior: configurable, defaults 0.9 for adversarial countries, 0.00005 for others
- 1.5x multiplier for SMALL RCS

Ported from ORBITAL SHIELD bayesian_scorer.py, adapted to use SDA config.
"""

from __future__ import annotations

import math

from app.core.config import settings

# Pre-fitted benign distribution parameters (from threat_assessment pipeline)
BENIGN_MU = 5.063
BENIGN_SIGMA = 1.369

# Expert-informed threat distribution
THREAT_MU = 3.5
THREAT_SIGMA = 1.2

ADVERSARIAL_COUNTRIES = frozenset(settings.ADVERSARIAL_COUNTRIES)


def _lognormal_pdf(x: float, mu: float, sigma: float) -> float:
    """Evaluate log-normal PDF at x."""
    if x <= 0:
        return 0.0
    log_x = math.log(x)
    exponent = -((log_x - mu) ** 2) / (2 * sigma ** 2)
    return (1.0 / (x * sigma * math.sqrt(2 * math.pi))) * math.exp(exponent)


def likelihood_ratio(min_sep_km: float) -> float:
    """Compute LR = P(x|threat) / P(x|benign)."""
    if min_sep_km <= 0:
        return 0.0
    threat_pdf = _lognormal_pdf(min_sep_km, THREAT_MU, THREAT_SIGMA)
    benign_pdf = _lognormal_pdf(min_sep_km, BENIGN_MU, BENIGN_SIGMA)
    return threat_pdf / max(benign_pdf, 1e-12)


def compute_prior(
    country_code: str,
    rcs_size: str = "",
    prior_adversarial: float | None = None,
    prior_benign: float | None = None,
) -> float:
    """Compute prior P(threat) from country and RCS.

    Uses config defaults if overrides not provided.
    """
    if prior_adversarial is None:
        prior_adversarial = settings.BAYESIAN_PRIOR_ADVERSARIAL
    if prior_benign is None:
        prior_benign = settings.BAYESIAN_PRIOR_BENIGN

    base = prior_adversarial if country_code in ADVERSARIAL_COUNTRIES else prior_benign
    if rcs_size == "SMALL":
        base = min(base * settings.SMALL_RCS_MULTIPLIER, 1.0)
    return base


def compute_posterior(prior: float, lr: float) -> float:
    """Bayesian update: P(threat|x) = LR*prior / (LR*prior + 1-prior)."""
    if prior <= 0:
        return 0.0
    if prior >= 1:
        return 1.0
    num = lr * prior
    den = num + (1.0 - prior)
    if den == 0:
        return 0.0
    return max(0.0, min(1.0, num / den))


def score_satellite(
    min_sep_km: float,
    country_code: str,
    rcs_size: str = "",
    prior_adversarial: float | None = None,
    prior_benign: float | None = None,
) -> float:
    """Full Bayesian threat score for one satellite. Returns posterior probability."""
    prior = compute_prior(country_code, rcs_size, prior_adversarial, prior_benign)
    lr = likelihood_ratio(min_sep_km)
    return compute_posterior(prior, lr)
