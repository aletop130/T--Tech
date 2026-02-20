"""SDA-specific configuration adapter for vendored Detour agents."""

from app.core.config import settings
from app.vendors.detour_upstream.agents.config import LLMConfig


def build_sda_default_config() -> LLMConfig:
    """Build an LLMConfig aligned with SDA defaults (Regolo first)."""
    return LLMConfig(
        base_url=settings.REGOLO_BASE_URL,
        api_key=settings.REGOLO_API_KEY or "not-needed",
        model=settings.REGOLO_MODEL,
        temperature=getattr(settings, "DETOUR_REGOLO_TEMPERATURE", 0.2),
        max_tokens=getattr(settings, "REGOLO_MAX_TOKENS", 2048),
    )
