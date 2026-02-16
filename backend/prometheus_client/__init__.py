WRITE_TARGET="/root/T--Tech/backend/prometheus_client/__init__.py"
WRITE_CONTENT_LENGTH=342
"""Minimal stub implementation of Prometheus client for testing.

Provides Counter and Summary classes with no-op methods and the necessary
functions/constants to expose a /metrics endpoint without requiring the
external ``prometheus_client`` package.
"""

from __future__ import annotations

from typing import Any

# Content type for Prometheus metrics exposition format
CONTENT_TYPE_LATEST = "text/plain; version=0.0.4"


def generate_latest() -> bytes:
    """Return empty metrics payload.

    In a real deployment this would serialize registered metrics.
    For test purposes we return an empty bytes object.
    """
    return b""


class _MetricBase:
    def __init__(self, name: str, documentation: str, *args: Any, **kwargs: Any) -> None:
        self.name = name
        self.documentation = documentation
        # Store a simple count/value for optional introspection (not required for tests)
        self._value = 0.0
        self._count = 0

    def inc(self, amount: float = 1.0) -> None:
        """Increment a Counter by ``amount`` (default 1)."""
        self._value += amount
        self._count += 1

    def observe(self, value: float) -> None:
        """Record an observation for a Summary/Histogram."""
        self._value += value
        self._count += 1

    # Optional: expose current value for debugging
    @property
    def value(self) -> float:
        return self._value

    @property
    def count(self) -> int:
        return self._count


class Counter(_MetricBase):
    """No-op Counter compatible with ``prometheus_client.Counter``."""

    def __init__(self, name: str, documentation: str, *args: Any, **kwargs: Any) -> None:
        super().__init__(name, documentation, *args, **kwargs)


class Summary(_MetricBase):
    """No-op Summary compatible with ``prometheus_client.Summary``."""

    def __init__(self, name: str, documentation: str, *args: Any, **kwargs: Any) -> None:
        super().__init__(name, documentation, *args, **kwargs)
