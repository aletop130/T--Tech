"""Reference database of military platform specifications."""
from typing import Optional

# Keyed by "entity_type" or "entity_type/subtype"
PLATFORM_DB: dict[str, dict] = {
    # ── DRONES / UAV ──
    "drone/recon": {
        "model": "MQ-9 Reaper",
        "specs": [
            {"key": "Model", "value": "MQ-9 Reaper (General Atomics)"},
            {"key": "Type", "value": "MALE UAV — ISR/Strike"},
            {"key": "Wingspan", "value": "20", "unit": "m"},
            {"key": "Endurance", "value": "27", "unit": "h"},
            {"key": "Ceiling", "value": "15,240", "unit": "m (FL500)"},
            {"key": "Max Speed", "value": "482", "unit": "km/h"},
            {"key": "Payload", "value": "1,700", "unit": "kg"},
            {"key": "Sensors", "value": "MTS-B EO/IR, Lynx SAR"},
            {"key": "Armament", "value": "4× AGM-114 Hellfire, 2× GBU-12"},
            {"key": "Data Link", "value": "Ku-band SATCOM, C-band LOS"},
        ],
    },
    "drone/attack": {
        "model": "MQ-1C Gray Eagle",
        "specs": [
            {"key": "Model", "value": "MQ-1C Gray Eagle"},
            {"key": "Type", "value": "MALE UAV — Multi-role"},
            {"key": "Endurance", "value": "25", "unit": "h"},
            {"key": "Ceiling", "value": "8,850", "unit": "m"},
            {"key": "Armament", "value": "4× AGM-114 Hellfire"},
        ],
    },
    "drone": {
        "model": "Generic UAV",
        "specs": [
            {"key": "Type", "value": "Unmanned Aerial Vehicle"},
            {"key": "Endurance", "value": "8-24", "unit": "h (est.)"},
        ],
    },
    # ── AIRCRAFT ──
    "aircraft/fighter": {
        "model": "F-35A Lightning II",
        "specs": [
            {"key": "Model", "value": "F-35A Lightning II"},
            {"key": "Type", "value": "5th Gen Stealth Fighter"},
            {"key": "Max Speed", "value": "Mach 1.6"},
            {"key": "Combat Radius", "value": "1,093", "unit": "km"},
            {"key": "Sensors", "value": "AN/APG-81 AESA, DAS, EOTS"},
        ],
    },
    "aircraft/bomber": {
        "model": "B-2 Spirit",
        "specs": [
            {"key": "Model", "value": "B-2A Spirit"},
            {"key": "Type", "value": "Stealth Strategic Bomber"},
            {"key": "Range", "value": "11,100", "unit": "km"},
            {"key": "Payload", "value": "23,000", "unit": "kg"},
        ],
    },
    "aircraft": {
        "model": "Generic Aircraft",
        "specs": [
            {"key": "Type", "value": "Fixed Wing Aircraft"},
        ],
    },
    # ── SHIPS ──
    "ship/destroyer": {
        "model": "Arleigh Burke DDG",
        "specs": [
            {"key": "Model", "value": "Arleigh Burke-class DDG-51"},
            {"key": "Displacement", "value": "9,200", "unit": "tons"},
            {"key": "Speed", "value": "30+", "unit": "knots"},
            {"key": "Armament", "value": "96× VLS, Mk 45 5in, CIWS"},
            {"key": "Sensors", "value": "AN/SPY-1D AEGIS"},
        ],
    },
    "ship/carrier": {
        "model": "Nimitz-class CVN",
        "specs": [
            {"key": "Model", "value": "Nimitz-class CVN"},
            {"key": "Displacement", "value": "100,000", "unit": "tons"},
            {"key": "Air Wing", "value": "60-90 aircraft"},
        ],
    },
    "ship/frigate": {
        "model": "FREMM Frigate",
        "specs": [
            {"key": "Model", "value": "FREMM-class"},
            {"key": "Displacement", "value": "6,700", "unit": "tons"},
            {"key": "Armament", "value": "16× VLS Aster, 76mm OTO Melara"},
        ],
    },
    "ship": {
        "model": "Generic Vessel",
        "specs": [{"key": "Type", "value": "Surface Ship"}],
    },
    # ── GROUND ──
    "tank": {
        "model": "Generic MBT",
        "specs": [
            {"key": "Type", "value": "Main Battle Tank"},
            {"key": "Armament", "value": "120mm main gun (est.)"},
        ],
    },
    "satellite": {
        "model": "Generic Satellite",
        "specs": [{"key": "Type", "value": "Artificial Satellite"}],
    },
    "ground_station": {
        "model": "Ground Station",
        "specs": [
            {"key": "Type", "value": "Fixed Ground Installation"},
            {"key": "Function", "value": "C2 / Tracking / Comms"},
        ],
    },
    "base": {
        "model": "Operating Base",
        "specs": [{"key": "Type", "value": "Fixed Installation"}],
    },
    "missile": {
        "model": "Guided Munition",
        "specs": [{"key": "Type", "value": "Guided Missile"}],
    },
    "vehicle": {
        "model": "Generic Vehicle",
        "specs": [{"key": "Type", "value": "Ground Vehicle"}],
    },
}


def get_platform_specs(
    entity_type: str, subtype: Optional[str] = None
) -> list[dict]:
    """Look up specs for an entity type, trying type/subtype first."""
    t = entity_type.lower()
    s = (subtype or "").lower()
    if s:
        key = f"{t}/{s}"
        if key in PLATFORM_DB:
            return PLATFORM_DB[key]["specs"]
    if t in PLATFORM_DB:
        return PLATFORM_DB[t]["specs"]
    return [{"key": "Type", "value": entity_type}]


def get_platform_model(
    entity_type: str, subtype: Optional[str] = None
) -> str:
    """Get the model name for display."""
    t = entity_type.lower()
    s = (subtype or "").lower()
    if s and f"{t}/{s}" in PLATFORM_DB:
        return PLATFORM_DB[f"{t}/{s}"]["model"]
    if t in PLATFORM_DB:
        return PLATFORM_DB[t]["model"]
    return entity_type
