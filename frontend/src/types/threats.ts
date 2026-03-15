/**
 * Type definitions for all threat-related data structures.
 * Ported from ORBITAL SHIELD types, adapted for Horus.
 */

export interface Position3D {
  lat: number;
  lon: number;
  altKm: number;
}

export interface OrbitSummary {
  altitudeKm: number;
  inclinationDeg: number;
  periodMin: number;
  velocityKms: number;
}

// --- Proximity Threats ---

export interface ProximityThreat {
  id: string;
  foreignSatId: string;
  foreignSatName: string;
  targetAssetId: string;
  targetAssetName: string;
  severity: 'nominal' | 'watched' | 'threatened';
  missDistanceKm: number;
  approachVelocityKms: number;
  tcaTime: number;
  tcaInMinutes: number;
  primaryPosition: Position3D;
  secondaryPosition: Position3D;
  approachPattern: string;
  sunHidingDetected: boolean;
  confidence: number;
}

// --- Signal Threats ---

export interface SignalThreat {
  id: string;
  interceptorId: string;
  interceptorName: string;
  targetLinkAssetId: string;
  targetLinkAssetName: string;
  groundStationName: string;
  severity: 'nominal' | 'watched' | 'threatened';
  interceptionProbability: number;
  signalPathAngleDeg: number;
  commWindowsAtRisk: number;
  totalCommWindows: number;
  tcaTime: number;
  tcaInMinutes: number;
  position: Position3D;
  confidence: number;
}

// --- Anomaly Threats ---

export interface AnomalyThreat {
  id: string;
  satelliteId: string;
  satelliteName: string;
  severity: 'nominal' | 'watched' | 'threatened';
  anomalyType: string;
  baselineDeviation: number;
  description: string;
  detectedAt: number;
  confidence: number;
  position: Position3D;
}

// --- Orbital Similarity Threats ---

export interface OrbitalSimilarityThreat {
  id: string;
  foreignSatId: string;
  foreignSatName: string;
  targetAssetId: string;
  targetAssetName: string;
  severity: 'nominal' | 'watched' | 'threatened';
  inclinationDiffDeg: number;
  altitudeDiffKm: number;
  divergenceScore: number;
  pattern: string;
  confidence: number;
  position: Position3D;
  foreignOrbit: OrbitSummary;
  targetOrbit: OrbitSummary;
}

// --- Geo-Loiter Threats ---

export interface GeoLoiterThreat {
  id: string;
  satelliteId: string;
  satelliteName: string;
  noradId: number;
  countryCode: string;
  orbitType: string;
  subsatelliteLonDeg: number;
  subsatelliteLatDeg: number;
  altitudeKm: number;
  dwellFractionOverUs: number;
  severity: 'nominal' | 'watched' | 'threatened';
  threatScore: number;
  description: string;
  confidence: number;
  position: Position3D;
  detectedAt: number;
}

// --- Threat Response ---

export interface ResponseOption {
  action: string;
  description: string;
  risk_level: string;
  confidence: number;
  delta_v_ms: number;
  time_to_execute_min: number;
  pros: string[];
  cons: string[];
}

export interface ThreatResponseDecision {
  satellite_id: string;
  satellite_name: string;
  threat_satellite_id: string;
  threat_satellite_name: string;
  threat_summary: string;
  threat_score: number;
  risk_level: string;
  options_evaluated: ResponseOption[];
  recommended_action: string;
  recommended_action_index: number;
  reasoning: string;
  escalation_required: boolean;
  time_sensitivity: string;
  intelligence_summary: string;
}

// --- Adversary ---

export interface AdversaryCatalogEntry {
  satellite_id: string;
  name: string;
  norad_id: number;
  country: string;
  operator?: string;
  object_type: string;
  altitude_km: number;
  inclination_deg: number;
  faction: string;
  tags: string[];
}

export interface IntelligenceReport {
  satellite_id: string;
  satellite_name: string;
  country: string;
  risk_assessment: string;
  historical_precedents: string[];
  capabilities: string[];
  recent_maneuvers: string[];
  threat_level: string;
  summary: string;
}

// --- Fleet Risk ---

export interface RiskSnapshot {
  satellite_id: string;
  satellite_name?: string;
  risk_score: number;
  risk_level?: string;
  dominant_threat?: string;
  timestamp: number;
  components: Record<string, number>;
}

export interface FleetRiskSummary {
  total: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
  average_risk: number;
}

export interface FleetRiskCurrent {
  satellites: RiskSnapshot[];
  computed_at: number;
  summary?: FleetRiskSummary;
}

// --- Comms ---

export interface IridiumGateway {
  name: string;
  location: string;
  lat: number;
  lon: number;
  region: string;
  status: string;
}

export interface ParsedIntent {
  command_type: string;
  target_satellite_id: string;
  target_satellite_name: string;
  parameters: Record<string, unknown>;
  urgency: string;
  summary: string;
}

export interface CommsTranscription {
  transcription_id: string;
  timestamp: number;
  human_input: string;
  parsed_intent: ParsedIntent;
  at_commands: {
    commands: Array<{ command: string; description: string; expected_response: string }>;
    total_commands: number;
    estimated_duration_ms: number;
  };
  sbd_payload: {
    protocol_revision: number;
    overall_message_length: number;
    imei: string;
    mt_payload_hex: string;
    mt_payload_human_readable: string;
    total_bytes: number;
  };
  gateway_routing: {
    selected_gateway: IridiumGateway;
    routing_reason: string;
    satellite_position: { lat: number; lon: number; altKm: number };
    signal_hops: number;
    estimated_latency_ms: number;
  };
  agent_reasoning: string;
  status: string;
}
