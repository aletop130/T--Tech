WRITE_TARGET="/root/T--Tech/backend/app/monitoring.py"
WRITE_CONTENT_LENGTH=173
"""Prometheus metrics for Detour subsystem.

Provides counters and a summary for tracking analyses and maneuver execution.
"""

from prometheus_client import Counter, Summary

# Total number of detour analyses triggered
DETOUR_ANALYSES_TOTAL = Counter(
    "detour_analyses_total",
    "Total number of detour analyses triggered",
)

# Duration of detour analysis pipelines (seconds)
DETOUR_ANALYSIS_DURATION_SECONDS = Summary(
    "detour_analysis_duration_seconds",
    "Duration of detour analysis pipeline execution in seconds",
)

# Total number of detour maneuvers executed
DETOUR_MANEUVERS_EXECUTED_TOTAL = Counter(
    "detour_maneuvers_executed_total",
    "Total number of detour maneuver executions",
)
