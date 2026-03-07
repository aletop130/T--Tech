"""Fleet risk aggregation service.

Computes per-satellite risk from all threat detection modes:
proximity, signal, anomaly, orbital similarity, and geo-loiter.
"""

from __future__ import annotations

import time
from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession

from app.services.threat_detection import ThreatDetectionService
from app.core.logging import get_logger

logger = get_logger(__name__)


class FleetRiskService:
    """Aggregates risk from all threat modes per satellite."""

    def __init__(self, db: AsyncSession):
        self.db = db
        self.threat_service = ThreatDetectionService(db)

    async def compute_current_risk(self, tenant_id: str) -> dict:
        """Compute current risk for all satellites in the fleet."""
        # Gather all threat types in parallel-ish sequence
        proximity = await self.threat_service.detect_proximity_threats(tenant_id)
        signal = await self.threat_service.detect_signal_threats(tenant_id)
        anomaly = await self.threat_service.detect_anomaly_threats(tenant_id)
        orbital = await self.threat_service.detect_orbital_similarity(tenant_id)
        geo_loiter = await self.threat_service.detect_geo_loiter(tenant_id)

        # Aggregate risk per satellite
        risk_map: dict[str, dict] = {}

        # Proximity threats contribute to both foreign and target satellites
        for t in proximity:
            target_id = t.get("targetAssetId", "")
            if target_id:
                entry = risk_map.setdefault(target_id, {"risk": 0.0, "name": t.get("targetAssetName", ""), "components": {}})
                conf = t.get("confidence", 0)
                entry["components"]["proximity"] = max(entry["components"].get("proximity", 0), conf)
                entry["risk"] = max(entry["risk"], conf)

        for t in signal:
            target_id = t.get("targetLinkAssetId", "")
            if target_id:
                entry = risk_map.setdefault(target_id, {"risk": 0.0, "name": t.get("targetLinkAssetName", ""), "components": {}})
                prob = t.get("interceptionProbability", 0)
                entry["components"]["signal"] = max(entry["components"].get("signal", 0), prob)
                entry["risk"] = max(entry["risk"], prob)

        for t in anomaly:
            sat_id = t.get("satelliteId", "")
            if sat_id:
                entry = risk_map.setdefault(sat_id, {"risk": 0.0, "name": t.get("satelliteName", ""), "components": {}})
                conf = t.get("confidence", 0)
                entry["components"]["anomaly"] = max(entry["components"].get("anomaly", 0), conf)
                entry["risk"] = max(entry["risk"], conf)

        for t in orbital:
            target_id = t.get("targetAssetId", "")
            if target_id:
                entry = risk_map.setdefault(target_id, {"risk": 0.0, "name": t.get("targetAssetName", ""), "components": {}})
                conf = t.get("confidence", 0)
                entry["components"]["orbital_similarity"] = max(entry["components"].get("orbital_similarity", 0), conf)
                entry["risk"] = max(entry["risk"], conf)

        for t in geo_loiter:
            sat_id = t.get("satelliteId", "")
            if sat_id:
                entry = risk_map.setdefault(sat_id, {"risk": 0.0, "name": t.get("satelliteName", ""), "components": {}})
                score = t.get("threatScore", 0)
                entry["components"]["geo_loiter"] = max(entry["components"].get("geo_loiter", 0), score)
                entry["risk"] = max(entry["risk"], score)

        now = time.time()
        satellites = []
        for sat_id, data in risk_map.items():
            satellites.append({
                "satellite_id": sat_id,
                "satellite_name": data.get("name", sat_id),
                "risk_score": round(data["risk"], 4),
                "timestamp": now,
                "components": {k: round(v, 4) for k, v in data["components"].items()},
            })

        satellites.sort(key=lambda s: -s["risk_score"])

        return {
            "satellites": satellites,
            "computed_at": now,
        }

    async def get_satellite_timeline(
        self,
        tenant_id: str,
        satellite_id: str,
    ) -> dict:
        """Get risk timeline for a specific satellite.

        Currently returns current snapshot; time-series from DB can be added.
        """
        current = await self.compute_current_risk(tenant_id)
        sat_data = next(
            (s for s in current["satellites"] if s["satellite_id"] == satellite_id),
            None,
        )

        return {
            "satellite_id": satellite_id,
            "satellite_name": "",
            "snapshots": [sat_data] if sat_data else [],
            "current_risk": sat_data["risk_score"] if sat_data else 0.0,
        }
