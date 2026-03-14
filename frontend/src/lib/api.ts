import type {
  ProximityThreat,
  SignalThreat,
  AnomalyThreat,
  OrbitalSimilarityThreat,
  GeoLoiterThreat,
  RiskSnapshot,
  FleetRiskCurrent,
  AdversaryCatalogEntry,
  IntelligenceReport,
} from '@/types/threats';

import { getApiBase } from '@/lib/utils';

// Use relative URL to leverage Next.js API rewrites in browser
const API_BASE = getApiBase();

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
}

export interface Orbit {
  id: string;
  satellite_id: string;
  epoch: string;
  semi_major_axis_km?: number;
  eccentricity?: number;
  inclination_deg?: number;
  raan_deg?: number;
  arg_perigee_deg?: number;
  mean_anomaly_deg?: number;
  mean_motion_rev_day?: number;
  tle_line1?: string;
  tle_line2?: string;
  orbit_type?: string;
  period_minutes?: number;
  apogee_km?: number;
  perigee_km?: number;
  source: string;
  created_at: string;
  updated_at: string;
}

export interface Satellite {
  id: string;
  norad_id: number;
  name: string;
  object_type: string;
  is_active: boolean;
  country?: string;
  operator?: string;
  classification: string;
  tags: string[];
  faction?: 'allied' | 'enemy' | 'neutral';
  created_at: string;
  updated_at: string;
}

export interface SatelliteDetail extends Satellite {
  latest_orbit?: Orbit;
  relations: Array<{
    id: string;
    source_type: string;
    source_id: string;
    relation_type: string;
    target_type: string;
    target_id: string;
  }>;
}

export interface GroundStation {
  id: string;
  name: string;
  code?: string;
  latitude: number;
  longitude: number;
  is_operational: boolean;
  country?: string;
  organization?: string;
  elevation_m?: number;
}

export interface Incident {
  id: string;
  title: string;
  description?: string;
  incident_type: string;
  severity: string;
  status: string;
  detected_at: string;
  assigned_to?: string;
  priority: number;
  affected_assets?: Array<{ id: string; type: string; name?: string }>;
}

export interface ConjunctionEvent {
  id: string;
  primary_object_id: string;
  secondary_object_id: string;
  tca: string;
  miss_distance_km: number;
  risk_level: string;
  risk_score?: number;
  is_actionable: boolean;
  object1_name?: string;
  object2_name?: string;
  collision_probability?: number;
}

export interface Position3D {
  x: number;
  y: number;
  z: number;
}

export interface SatelliteInfo {
  id: string;
  name: string;
  norad_id: number;
  country?: string;
  operator?: string;
  is_active: boolean;
}

export interface ProximityEvent {
  id: string;
  primary_satellite_id: string;
  secondary_satellite_id: string;
  primary_satellite?: SatelliteInfo;
  secondary_satellite?: SatelliteInfo;
  start_time: string;
  end_time?: string;
  last_updated: string;
  min_distance_km: number;
  current_distance_km?: number;
  approach_velocity_kms?: number;
  tca?: string;
  predicted_tca?: string;
  alert_level: 'info' | 'warning' | 'critical';
  status: 'active' | 'monitoring' | 'resolved' | 'escalated';
  is_hostile: boolean;
  threat_score?: number;
  threat_assessment?: string;
  warning_threshold_km: number;
  critical_threshold_km: number;
  primary_position?: Position3D;
  secondary_position?: Position3D;
  relative_velocity?: Position3D;
  incident_id?: string;
  scenario_id?: string;
  is_simulated: boolean;
  created_at: string;
  updated_at: string;
}

export interface ProximityAlert {
  event_id: string;
  primary_satellite_id?: string;
  secondary_satellite_id?: string;
  primary_satellite_name: string;
  secondary_satellite_name: string;
  distance_km: number;
  alert_level: 'info' | 'warning' | 'critical';
  is_hostile: boolean;
  threat_score?: number;
  timestamp: string;
  predicted_tca?: string;
}

export interface ProximityConfig {
  warning_threshold_km: number;
  critical_threshold_km: number;
  check_interval_seconds: number;
  prediction_horizon_hours: number;
  enable_auto_incident_creation: boolean;
}

export interface SpaceWeatherEvent {
  id: string;
  event_type: string;
  severity: string;
  start_time: string;
  kp_index?: number;
}

// Reentry Tracker types
export interface ReentryPrediction {
  norad_id: number;
  name: string;
  object_type: string;
  predicted_epoch: string;
  window_hours: number;
  latitude_range: number[] | null;
  longitude_range: number[] | null;
  risk_level: string;
  countdown_seconds: number;
  source: string;
}

export interface ReentryHistoryEntry {
  norad_id: number;
  name: string;
  object_type: string;
  actual_epoch: string;
  was_controlled: boolean;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
}

// Space Weather (NOAA SWPC live data)
export interface SpaceWeatherCurrentResponse {
  kp_index: number;
  f10_7: number | null;
  solar_wind_speed: number | null;
  storm_level: 'none' | 'minor' | 'moderate' | 'strong' | 'severe' | 'extreme';
  timestamp: string;
  xray_class: string | null;
  proton_flux_10mev: number | null;
  dst_index: number | null;
}

export interface SolarWindData {
  speed_km_s: number | null;
  density_n_cm3: number | null;
  bz_gsm_nt: number | null;
  temperature_k: number | null;
}

export interface DragImpactSatellite {
  norad_id: number;
  name: string;
  altitude_km: number;
  estimated_drag_increase_pct: number;
}

export interface NOAAAlert {
  product_id: string;
  issue_datetime: string | null;
  message: string;
}

export interface ParsedAlert {
  product_id: string;
  alert_type: string;
  title: string;
  description: string;
  noaa_scale: string | null;
  issued: string | null;
  valid_from: string | null;
  valid_to: string | null;
  serial: string | null;
}

export interface KpTrendPoint {
  kp: number;
  time: string;
}

export interface SpaceWeatherImpactResponse {
  current_conditions: SpaceWeatherCurrentResponse;
  affected_satellites: DragImpactSatellite[];
  alert_level: 'green' | 'yellow' | 'orange' | 'red';
  active_alerts: NOAAAlert[];
  total_affected: number;
  kp_trend_24h?: KpTrendPoint[];
  solar_wind: SolarWindData | null;
  parsed_alerts: ParsedAlert[];
}

export interface SystemImpact {
  system: string;
  status: string;
  detail: string;
  color: string;
}

export interface SatelliteWeatherAnalysis {
  norad_id: number;
  name: string;
  altitude_km: number | null;
  inclination_deg: number | null;
  orbit_type: string | null;
  drag_increase_pct: number;
  drag_risk: string;
  projected_decay_m_day: number | null;
  impacts: SystemImpact[];
  vulnerability_score: number;
  vulnerability_level: string;
  recommendations: string[];
  current_kp: number;
  current_storm: string;
}

export interface IncidentStats {
  total: number;
  by_status: Record<string, number>;
  by_severity: Record<string, number>;
  open_count: number;
  critical_count: number;
}

export interface SearchResult {
  type: string;
  id: string;
  name: string;
  norad_id?: number;
}

export interface TransmitterInfo {
  uuid?: string;
  description: string;
  alive: boolean;
  uplink_low?: number;
  uplink_high?: number;
  downlink_low?: number;
  downlink_high?: number;
  mode?: string;
  baud?: number;
  type?: string;
  service?: string;
  status?: string;
}

export interface OrbitProfileInfo {
  epoch?: string;
  inclination_deg?: number;
  raan_deg?: number;
  eccentricity?: number;
  arg_perigee_deg?: number;
  mean_anomaly_deg?: number;
  mean_motion_rev_day?: number;
  period_minutes?: number;
  apogee_km?: number;
  perigee_km?: number;
  orbit_type?: string;
  tle_line1?: string;
  tle_line2?: string;
}

export interface SatelliteProfile {
  norad_id: number;
  name: string;
  international_designator?: string;
  country?: string;
  operator?: string;
  object_type?: string;
  purpose?: string;
  is_active: boolean;
  launch_date?: string;
  mass_kg?: number;
  rcs_m2?: number;
  faction?: string;
  orbit?: OrbitProfileInfo;
  transmitters: TransmitterInfo[];
  sources: string[];
}

export class ApiClient {
  private baseUrl: string;
  private tenantId: string;

  constructor() {
    this.baseUrl = API_BASE;
    this.tenantId = 'default';
  }

  protected async _fetch<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const baseUrl = this.baseUrl;
    if (baseUrl === undefined || baseUrl === null) {
      throw new Error('API base URL not configured. Set NEXT_PUBLIC_API_URL environment variable.');
    }
    const url = `${baseUrl}${endpoint}`;
    const headers = {
      'Content-Type': 'application/json',
      'X-Tenant-ID': this.tenantId,
      ...options.headers,
    };

    try {
      const response = await fetch(url, { ...options, headers });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.detail || `API error: ${response.status} - ${response.statusText}`);
      }

      return response.json();
    } catch (error) {
      if (error instanceof TypeError && error.message === 'Failed to fetch') {
        throw new Error(`Unable to connect to API at ${baseUrl}. Please ensure the backend service is running.`);
      }
      throw error;
    }
  }

  async get<T>(endpoint: string): Promise<T> {
    return this._fetch<T>(endpoint, { method: 'GET' });
  }

  async post<T>(endpoint: string, data?: unknown): Promise<T> {
    return this._fetch<T>(endpoint, {
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  async put<T>(endpoint: string, data?: unknown): Promise<T> {
    return this._fetch<T>(endpoint, {
      method: 'PUT',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  async delete<T>(endpoint: string): Promise<T> {
    return this._fetch<T>(endpoint, { method: 'DELETE' });
  }

  // Satellites
  async getSatellites(params?: {
    page?: number;
    page_size?: number;
    search?: string;
    is_active?: boolean;
  }): Promise<PaginatedResponse<Satellite>> {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.set('page', params.page.toString());
    if (params?.page_size) searchParams.set('page_size', params.page_size.toString());
    if (params?.search) searchParams.set('search', params.search);
    if (params?.is_active !== undefined) searchParams.set('is_active', params.is_active.toString());

    return this._fetch(`/api/v1/ontology/satellites?${searchParams}`);
  }

  async getSatellite(id: string): Promise<SatelliteDetail> {
    return this._fetch(`/api/v1/ontology/satellites/${id}`);
  }

  async getSatellitesWithOrbits(): Promise<SatelliteDetail[]> {
    return this._fetch('/api/v1/ontology/satellites/with-orbits');
  }

  async deleteSatellite(id: string): Promise<void> {
    await this._fetch(`/api/v1/ontology/satellites/${id}`, { method: 'DELETE' });
  }

  async batchDeleteSatellites(satelliteIds: string[]): Promise<{ deleted: number; errors: string[] }> {
    return this._fetch('/api/v1/ontology/satellites/batch-delete', {
      method: 'POST',
      body: JSON.stringify({ satellite_ids: satelliteIds }),
    });
  }

  // Ground Stations
  async getGroundStations(params?: {
    page?: number;
    page_size?: number;
    is_operational?: boolean;
  }): Promise<PaginatedResponse<GroundStation>> {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.set('page', params.page.toString());
    if (params?.page_size) searchParams.set('page_size', params.page_size.toString());
    if (params?.is_operational !== undefined) {
      searchParams.set('is_operational', params.is_operational.toString());
    }
    return this._fetch(`/api/v1/ontology/ground-stations?${searchParams}`);
  }

  // Incidents
  async getIncidents(params?: {
    page?: number;
    page_size?: number;
    status?: string;
    severity?: string;
  }): Promise<PaginatedResponse<Incident>> {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.set('page', params.page.toString());
    if (params?.page_size) searchParams.set('page_size', params.page_size.toString());
    if (params?.status) searchParams.set('status', params.status);
    if (params?.severity) searchParams.set('severity', params.severity);
    return this._fetch(`/api/v1/incidents?${searchParams}`);
  }

  async getIncident(id: string): Promise<Incident> {
    return this._fetch(`/api/v1/incidents/${id}`);
  }

  async getIncidentStats(): Promise<IncidentStats> {
    return this._fetch('/api/v1/incidents/stats');
  }

  async updateIncidentStatus(
    id: string,
    status: string,
    comment?: string
  ): Promise<Incident> {
    return this._fetch(`/api/v1/incidents/${id}/status`, {
      method: 'POST',
      body: JSON.stringify({ status, comment }),
    });
  }

  // Cyber Incidents
  async getCyberIncidents(params?: {
    page?: number;
    page_size?: number;
    severity?: string;
    status?: string;
  }): Promise<PaginatedResponse<Incident>> {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.set('page', params.page.toString());
    if (params?.page_size) searchParams.set('page_size', params.page_size.toString());
    if (params?.severity) searchParams.set('severity', params.severity);
    if (params?.status) searchParams.set('status', params.status);
    return this._fetch(`/api/v1/incidents/cyber?${searchParams}`);
  }

  // Maneuver Incidents
  async getManeuverIncidents(params?: {
    page?: number;
    page_size?: number;
    severity?: string;
    status?: string;
  }): Promise<PaginatedResponse<Incident>> {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.set('page', params.page.toString());
    if (params?.page_size) searchParams.set('page_size', params.page_size.toString());
    if (params?.severity) searchParams.set('severity', params.severity);
    if (params?.status) searchParams.set('status', params.status);
    return this._fetch(`/api/v1/incidents/maneuvers?${searchParams}`);
  }

  // Conjunctions
  async getConjunctions(params?: {
    page?: number;
    page_size?: number;
    risk_level?: string;
    is_actionable?: boolean;
  }): Promise<PaginatedResponse<ConjunctionEvent>> {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.set('page', params.page.toString());
    if (params?.page_size) searchParams.set('page_size', params.page_size.toString());
    if (params?.risk_level) searchParams.set('risk_level', params.risk_level);
    if (params?.is_actionable !== undefined) {
      searchParams.set('is_actionable', params.is_actionable.toString());
    }
    return this._fetch(`/api/v1/ontology/conjunctions?${searchParams}`);
  }

  async getConjunction(id: string): Promise<ConjunctionEvent> {
    return this._fetch(`/api/v1/ontology/conjunctions/${id}`);
  }

  // Space Weather
  async getSpaceWeatherEvents(params?: {
    page?: number;
    page_size?: number;
    severity?: string;
  }): Promise<PaginatedResponse<SpaceWeatherEvent>> {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.set('page', params.page.toString());
    if (params?.page_size) searchParams.set('page_size', params.page_size.toString());
    if (params?.severity) searchParams.set('severity', params.severity);
    return this._fetch(`/api/v1/ontology/space-weather?${searchParams}`);
  }

  // Search
  async search(query: string, types?: string[]): Promise<SearchResult[]> {
    const searchParams = new URLSearchParams({ q: query });
    if (types?.length) searchParams.set('types', types.join(','));
    return this._fetch(`/api/v1/search?${searchParams}`);
  }

  // AI
  async chat(messages: Array<{ role: string; content: string }>, contextIds?: string[]) {
    return this._fetch('/api/v1/ai/chat', {
      method: 'POST',
      body: JSON.stringify({
        messages,
        context_object_ids: contextIds || [],
      }),
    });
  }

  async chatStream(
    messages: Array<{ role: string; content: string }>,
    sceneState?: Record<string, unknown>,
    sessionId?: string
  ) {
    const url = `${this.baseUrl || ''}/api/v1/ai/chat/stream`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Tenant-ID': this.tenantId,
      },
      body: JSON.stringify({
        messages,
        sceneState: sceneState || {},
        session_id: sessionId,
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.detail || `API error: ${response.status}`);
    }

    return response.body;
  }

  async chatExecute(messages: Array<{ role: string; content: string }>, sceneState?: Record<string, unknown>) {
    return this._fetch('/api/v1/ai/chat/execute', {
      method: 'POST',
      body: JSON.stringify({
        messages,
        sceneState: sceneState || {},
      }),
    });
  }

  async analyzeConjunction(eventId: string) {
    return this._fetch('/api/v1/ai/agents/conjunction-analyst', {
      method: 'POST',
      body: JSON.stringify({ conjunction_event_id: eventId }),
    });
  }

  // Conjunction Analysis
  async runConjunctionAnalysis(params: {
    satellite_ids?: string[];
    time_window_hours: number;
    min_distance_km?: number;
  }) {
    return this._fetch('/api/v1/analytics/conjunction/run', {
      method: 'POST',
      body: JSON.stringify({
        satellite_ids: params.satellite_ids || [],
        time_window_hours: params.time_window_hours,
        min_distance_km: params.min_distance_km,
      }),
    });
  }

  // Space Weather Impact
  async getSpaceWeatherImpact(hours: number = 24): Promise<{
    current_kp?: number;
    alerts: SpaceWeatherEvent[];
    affected_satellites: number;
    affected_stations: number;
    impact_score: number;
    forecast: Array<{
      time: string;
      kp_index: number;
      severity: string;
    }>;
  }> {
    const searchParams = new URLSearchParams();
    searchParams.set('hours', hours.toString());
    return this._fetch(`/api/v1/analytics/space-weather/impact?${searchParams}`);
  }

  // Create Incident
  async createIncident(data: {
    title: string;
    description?: string;
    incident_type: string;
    severity: string;
    related_object_ids?: string[];
  }): Promise<Incident> {
    return this._fetch('/api/v1/incidents', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // Assign Incident
  async assignIncident(
    id: string,
    assigned_to: string
  ): Promise<Incident> {
    return this._fetch(`/api/v1/incidents/${id}/assign`, {
      method: 'POST',
      body: JSON.stringify({ assigned_to }),
    });
  }

  // Add Comment to Incident
  async addComment(
    incidentId: string,
    content: string
  ): Promise<{ id: string; content: string; created_at: string }> {
    return this._fetch(`/api/v1/incidents/${incidentId}/comments`, {
      method: 'POST',
      body: JSON.stringify({ content }),
    });
  }

  // Deduplicate Incidents
  async deduplicateIncidents(): Promise<{ duplicates_found: number; removed_count: number }> {
    return this._fetch('/api/v1/incidents/deduplicate', {
      method: 'POST',
    });
  }

  // Upload TLE
  async uploadTLE(file: File): Promise<{ run_id: string; filename: string }> {
    const formData = new FormData();
    formData.append('file', file);

    const url = `${this.baseUrl || ''}/api/v1/ingestion/upload/tle`;
    const headers = {
      'X-Tenant-ID': this.tenantId,
    };

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.detail || `API error: ${response.status}`);
    }

    return response.json();
  }

  // CelesTrack Integration
  async fetchFromCelesTrack(noradIds: number[]): Promise<{
    success: boolean;
    message: string;
    satellites_created: number;
    satellites_updated: number;
    satellite_ids: string[];
    errors: string[];
  }> {
    return this._fetch('/api/v1/ontology/satellites/fetch-celestrack', {
      method: 'POST',
      body: JSON.stringify({ norad_ids: noradIds }),
    });
  }

  async fetchFamousSatellites(): Promise<{
    success: boolean;
    message: string;
    satellites_created: number;
    satellites_updated: number;
    satellite_ids: string[];
    errors: string[];
  }> {
    return this._fetch('/api/v1/ontology/satellites/fetch-famous', {
      method: 'POST',
    });
  }

  async fetchAlliedSatellites(): Promise<{
    success: boolean;
    message: string;
    satellites_created: number;
    satellites_updated: number;
    satellite_ids: string[];
    errors: string[];
  }> {
    return this._fetch('/api/v1/ontology/satellites/fetch-allied', {
      method: 'POST',
    });
  }

  async fetchEnemySatellites(): Promise<{
    success: boolean;
    message: string;
    satellites_created: number;
    satellites_updated: number;
    satellite_ids: string[];
    errors: string[];
  }> {
    return this._fetch('/api/v1/ontology/satellites/fetch-enemy', {
      method: 'POST',
    });
  }

  // CelesTrak Browser API
  async getCelestrakGroups(): Promise<{ categories: Record<string, Record<string, string>> }> {
    return this._fetch('/api/v1/ontology/satellites/celestrak-groups');
  }

  async previewCelestrakGroup(group: string): Promise<{ group: string; count: number; satellites: Array<{ norad_id: number; name: string }> }> {
    return this._fetch('/api/v1/ontology/satellites/preview-group', {
      method: 'POST',
      body: JSON.stringify({ group }),
    });
  }

  async fetchCelestrakGroup(group: string): Promise<{
    success: boolean;
    message: string;
    satellites_created: number;
    satellites_updated: number;
    satellite_ids: string[];
    errors: string[];
  }> {
    return this._fetch('/api/v1/ontology/satellites/fetch-group', {
      method: 'POST',
      body: JSON.stringify({ group }),
    });
  }

  async searchCelestrak(name: string): Promise<{ group: string; count: number; satellites: Array<{ norad_id: number; name: string }> }> {
    return this._fetch('/api/v1/ontology/satellites/search-celestrak', {
      method: 'POST',
      body: JSON.stringify({ name }),
    });
  }

  // Celestrak Debris Import
  async fetchCelestrakDebris(): Promise<{ status: string; imported: number }> {
    return this._fetch('/api/v1/ontology/debris/fetch-celestrak', { method: 'POST' });
  }

  // Generate Synthetic Debris
  async generateDebris(count: number): Promise<{ status: string; created: number }> {
    return this._fetch('/api/v1/ontology/debris/generate', {
      method: 'POST',
      body: JSON.stringify({ count }),
    });
  }

  async hideAlliedSatellites(): Promise<{
    success: boolean;
    message: string;
    hidden_count: number;
  }> {
    return this._fetch('/api/v1/ontology/satellites/hide-allied', {
      method: 'POST',
    });
  }

  async hideEnemySatellites(): Promise<{
    success: boolean;
    message: string;
    hidden_count: number;
  }> {
    return this._fetch('/api/v1/ontology/satellites/hide-enemy', {
      method: 'POST',
    });
  }

  async showAlliedSatellites(): Promise<{
    success: boolean;
    message: string;
    shown_count: number;
  }> {
    return this._fetch('/api/v1/ontology/satellites/show-allied', {
      method: 'POST',
    });
  }

  async showEnemySatellites(): Promise<{
    success: boolean;
    message: string;
    shown_count: number;
  }> {
    return this._fetch('/api/v1/ontology/satellites/show-enemy', {
      method: 'POST',
    });
  }

  async refreshTLE(satelliteId: string): Promise<{
    success: boolean;
    message: string;
    satellite_id?: string;
    norad_id?: number;
    orbit_id?: string;
    epoch?: string;
  }> {
    return this._fetch(`/api/v1/ontology/satellites/${satelliteId}/refresh-tle`, {
      method: 'POST',
    });
  }

  // Operations - Routes
  async getRoutes(params?: {
    entity_id?: string;
    status?: string;
    page?: number;
    page_size?: number;
  }): Promise<PaginatedResponse<RoutePlan>> {
    const searchParams = new URLSearchParams();
    if (params?.entity_id) searchParams.set('entity_id', params.entity_id);
    if (params?.status) searchParams.set('status', params.status);
    if (params?.page) searchParams.set('page', params.page.toString());
    if (params?.page_size) searchParams.set('page_size', params.page_size.toString());
    return this._fetch(`/api/v1/operations/routes?${searchParams}`);
  }

  async getRoute(id: string): Promise<RoutePlan> {
    return this._fetch(`/api/v1/operations/routes/${id}`);
  }

  async createRoute(data: RoutePlanCreate): Promise<RoutePlan> {
    return this._fetch('/api/v1/operations/routes', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateRoute(id: string, data: RoutePlanUpdate): Promise<RoutePlan> {
    return this._fetch(`/api/v1/operations/routes/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteRoute(id: string): Promise<void> {
    await this._fetch(`/api/v1/operations/routes/${id}`, {
      method: 'DELETE',
    });
  }

  async getRouteTrajectory(routeId: string): Promise<TrajectoryResponse> {
    return this._fetch(`/api/v1/operations/routes/${routeId}/trajectory`);
  }

  // Operations - Formations
  async getFormations(params?: {
    is_active?: boolean;
    page?: number;
    page_size?: number;
  }): Promise<PaginatedResponse<Formation>> {
    const searchParams = new URLSearchParams();
    if (params?.is_active !== undefined) searchParams.set('is_active', params.is_active.toString());
    if (params?.page) searchParams.set('page', params.page.toString());
    if (params?.page_size) searchParams.set('page_size', params.page_size.toString());
    return this._fetch(`/api/v1/operations/formations?${searchParams}`);
  }

  async getFormation(id: string): Promise<Formation> {
    return this._fetch(`/api/v1/operations/formations/${id}`);
  }

  async createFormation(data: FormationCreate): Promise<Formation> {
    return this._fetch('/api/v1/operations/formations', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async activateFormation(id: string): Promise<Formation> {
    return this._fetch(`/api/v1/operations/formations/${id}/activate`, {
      method: 'POST',
    });
  }

  // Operations - Operations
  async getOperations(params?: {
    status?: string;
    operation_type?: string;
    page?: number;
    page_size?: number;
  }): Promise<PaginatedResponse<Operation>> {
    const searchParams = new URLSearchParams();
    if (params?.status) searchParams.set('status', params.status);
    if (params?.operation_type) searchParams.set('operation_type', params.operation_type);
    if (params?.page) searchParams.set('page', params.page.toString());
    if (params?.page_size) searchParams.set('page_size', params.page_size.toString());
    return this._fetch(`/api/v1/operations/operations?${searchParams}`);
  }

  async getOperation(id: string): Promise<OperationDetail> {
    return this._fetch(`/api/v1/operations/operations/${id}`);
  }

  async createOperation(data: OperationCreate): Promise<Operation> {
    return this._fetch('/api/v1/operations/operations', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async dispatchOperation(operationId: string, dispatchTime?: string): Promise<OperationDispatchResponse> {
    return this._fetch(`/api/v1/operations/operations/${operationId}/dispatch`, {
      method: 'POST',
      body: JSON.stringify({ operation_id: operationId, dispatch_time: dispatchTime }),
    });
  }

  async updateOperationStatus(operationId: string, status: string): Promise<Operation> {
    return this._fetch(`/api/v1/operations/operations/${operationId}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status }),
    });
  }

  // Collisions
  async detectCollisions(entityIds: string[]): Promise<CollisionAlert[]> {
    return this._fetch('/api/v1/operations/collisions/detect', {
      method: 'POST',
      body: JSON.stringify(entityIds),
    });
  }

  async getActiveCollisions(): Promise<{ items: CollisionAlert[]; total: number; active_count: number }> {
    return this._fetch('/api/v1/operations/collisions/active');
  }

  async generateAvoidanceManeuver(request: AvoidanceManeuverRequest): Promise<AvoidanceManeuverResponse> {
    return this._fetch('/api/v1/operations/collisions/avoidance', {
      method: 'POST',
      body: JSON.stringify(request),
    });
  }

  // Position Reports
  async reportPosition(data: PositionReportCreate): Promise<PositionReport> {
    return this._fetch('/api/v1/operations/positions', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getLatestPosition(entityId: string): Promise<PositionReport> {
    return this._fetch(`/api/v1/operations/positions/${entityId}/latest`);
  }

  async getPositionHistory(
    entityId: string,
    startTime: string,
    endTime: string
  ): Promise<{ items: PositionReport[]; total: number }> {
    const searchParams = new URLSearchParams();
    searchParams.set('start_time', startTime);
    searchParams.set('end_time', endTime);
    return this._fetch(`/api/v1/operations/positions/${entityId}/history?${searchParams}`);
  }

  async getGroundVehicles(): Promise<{ items: PositionReport[]; total: number }> {
    return this._fetch('/api/v1/operations/positions/ground-vehicles');
  }

  // Proximity Detection
  async runProximityDetection(satelliteIds?: string[]): Promise<{
    run_id: string;
    timestamp: string;
    satellites_checked: number;
    pairs_checked: number;
    events_detected: number;
    events_created: number;
    events_updated: number;
    duration_ms: number;
  }> {
    return this._fetch('/api/v1/proximity/detect', {
      method: 'POST',
      body: JSON.stringify({ satellite_ids: satelliteIds }),
    });
  }

  async getProximityEvents(params?: {
    alert_level?: string;
    status?: string;
    is_hostile?: boolean;
    satellite_id?: string;
    scenario_id?: string;
    page?: number;
    page_size?: number;
  }): Promise<PaginatedResponse<ProximityEvent>> {
    const searchParams = new URLSearchParams();
    if (params?.alert_level) searchParams.set('alert_level', params.alert_level);
    if (params?.status) searchParams.set('status', params.status);
    if (params?.is_hostile !== undefined) searchParams.set('is_hostile', params.is_hostile.toString());
    if (params?.satellite_id) searchParams.set('satellite_id', params.satellite_id);
    if (params?.scenario_id) searchParams.set('scenario_id', params.scenario_id);
    if (params?.page) searchParams.set('page', params.page.toString());
    if (params?.page_size) searchParams.set('page_size', params.page_size.toString());
    return this._fetch(`/api/v1/proximity/events?${searchParams}`);
  }

  async getProximityEvent(id: string): Promise<ProximityEvent> {
    return this._fetch(`/api/v1/proximity/events/${id}`);
  }

  async getActiveProximityAlerts(): Promise<ProximityAlert[]> {
    return this._fetch('/api/v1/proximity/alerts/active');
  }

  async getProximityConfig(): Promise<ProximityConfig> {
    return this._fetch('/api/v1/proximity/config');
  }

  async updateProximityConfig(config: ProximityConfig): Promise<ProximityConfig> {
    return this._fetch('/api/v1/proximity/config', {
      method: 'POST',
      body: JSON.stringify(config),
    });
  }

  // ========== Admin Endpoints ==========
  async clearCache(): Promise<{ success: boolean; message: string }> {
    return this._fetch('/api/v1/admin/cache/clear', {
      method: 'POST',
    });
  }

  async runDatabaseVacuum(): Promise<{ success: boolean; message: string }> {
    return this._fetch('/api/v1/admin/database/vacuum', {
      method: 'POST',
    });
  }

  async exportAuditLogs(params?: {
    start_date?: string;
    end_date?: string;
    format?: 'csv' | 'json';
  }): Promise<Blob> {
    const searchParams = new URLSearchParams();
    if (params?.start_date) searchParams.set('start_date', params.start_date);
    if (params?.end_date) searchParams.set('end_date', params.end_date);
    if (params?.format) searchParams.set('format', params.format);

    const url = `${this.baseUrl || ''}/api/v1/admin/audit/export?${searchParams}`;
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'X-Tenant-ID': this.tenantId,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to export audit logs: ${response.status}`);
    }

    return response.blob();
  }

  async getSystemReport(): Promise<{
    timestamp: string;
    tenant_id: string;
    database: { status: string; satellites_total: number; satellites_active: number };
    incidents: { total: number; open: number; critical: number };
    redis: { status: string };
    system: Record<string, unknown>;
  }> {
    return this._fetch('/api/v1/admin/system/report');
  }

  async getAdminStats(): Promise<{
    satellites: number;
    open_incidents: number;
    incidents_24h: number;
    audit_logs_24h: number;
  }> {
    return this._fetch('/api/v1/admin/stats');
  }

  // ========== Threat Detection Endpoints ==========
  async getProximityThreats(): Promise<ProximityThreat[]> {
    return this._fetch('/api/v1/threats/proximity');
  }

  async getSignalThreats(): Promise<SignalThreat[]> {
    return this._fetch('/api/v1/threats/signal');
  }

  async getAnomalyThreats(): Promise<AnomalyThreat[]> {
    return this._fetch('/api/v1/threats/anomaly');
  }

  async getOrbitalSimilarityThreats(): Promise<OrbitalSimilarityThreat[]> {
    return this._fetch('/api/v1/threats/orbital-similarity');
  }

  async getGeoLoiterThreats(): Promise<GeoLoiterThreat[]> {
    return this._fetch('/api/v1/threats/geo-us-loiter');
  }

  // ========== Fleet Risk Endpoints ==========
  async getFleetRiskCurrent(): Promise<FleetRiskCurrent> {
    return this._fetch('/api/v1/fleet-risk/current');
  }

  async getFleetRiskTimeline(satId: string): Promise<{ satellite_id: string; satellite_name: string; snapshots: RiskSnapshot[]; current_risk: number }> {
    return this._fetch(`/api/v1/fleet-risk/timeline/${satId}`);
  }

  // ========== Adversary Tracking Endpoints ==========
  async getAdversaryCatalog(): Promise<AdversaryCatalogEntry[]> {
    return this._fetch('/api/v1/adversary/catalog');
  }

  async getAdversaryIntelligence(satId: string): Promise<IntelligenceReport> {
    return this._fetch(`/api/v1/adversary/${satId}/intelligence`);
  }

  async chatAboutAdversary(satId: string, message: string): Promise<{ reply: string }> {
    return this._fetch(`/api/v1/adversary/${satId}/chat`, {
      method: 'POST',
      body: JSON.stringify({ message, satellite_id: satId }),
    });
  }

  async getAdversaryManeuvers(satId: string): Promise<{ norad_id: number; satellite_name: string; maneuvers: Array<{ id: string; maneuver_type: string; detection_time: string; delta_a_km: number; estimated_delta_v_ms: number; confidence: number }>; total: number }> {
    return this._fetch(`/api/v1/adversary/${satId}/maneuvers`);
  }

  // ========== Satellite Profile Endpoints ==========
  async getSatelliteProfile(noradId: number): Promise<SatelliteProfile> {
    return this._fetch(`/api/v1/satellite-profile/${noradId}`);
  }

  // ========== Comms Endpoints ==========
  async commsChat(messages: Array<{ role: string; content: string }>): Promise<{ reply: string; command_ready?: boolean }> {
    return this._fetch('/api/v1/comms/chat', {
      method: 'POST',
      body: JSON.stringify({ messages }),
    });
  }

  async commsSend(message: string, targetSatId?: string): Promise<unknown> {
    return this._fetch('/api/v1/comms/send', {
      method: 'POST',
      body: JSON.stringify({ message, target_satellite_id: targetSatId }),
    });
  }

  // ========== Response Endpoints ==========
  async evaluateResponse(params: {
    threat_id: string;
    threat_type: string;
    threat_score: number;
    satellite_id: string;
  }): Promise<unknown> {
    return this._fetch('/api/v1/response/evaluate', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  }

  // ========== Reentry Tracker Endpoints ==========
  async getActiveReentries(): Promise<ReentryPrediction[]> {
    return this._fetch('/api/v1/reentry/active');
  }

  async getReentryHistory(): Promise<ReentryHistoryEntry[]> {
    return this._fetch('/api/v1/reentry/history');
  }

  // ========== Space Weather (NOAA SWPC) Endpoints ==========
  async getSpaceWeatherCurrent(): Promise<SpaceWeatherCurrentResponse> {
    return this._fetch('/api/v1/space-weather/current');
  }

  async getSpaceWeatherImpactLive(): Promise<SpaceWeatherImpactResponse> {
    return this._fetch('/api/v1/space-weather/impact');
  }

  async getSpaceWeatherSatelliteAnalysis(noradId: number): Promise<SatelliteWeatherAnalysis> {
    return this._fetch(`/api/v1/space-weather/satellite/${noradId}`);
  }

  // ========== Timeline Endpoints ==========
  async getTimelineEvents(params: {
    date: string;
    event_types?: string;
  }): Promise<{
    date: string;
    events: Array<{
      id: string;
      type: string;
      title: string;
      time: string;
      severity?: string;
      details?: string;
    }>;
    count: number;
  }> {
    const searchParams = new URLSearchParams({ date: params.date });
    if (params.event_types) searchParams.set('event_types', params.event_types);
    return this._fetch(`/api/v1/timeline/events?${searchParams}`);
  }

  async getTimelineEventsRange(params: {
    start_date: string;
    end_date: string;
  }): Promise<{
    start_date: string;
    end_date: string;
    events: Array<{
      id: string;
      type: string;
      title: string;
      time: string;
      severity?: string;
      details?: string;
    }>;
    count: number;
  }> {
    const searchParams = new URLSearchParams({
      start_date: params.start_date,
      end_date: params.end_date,
    });
    return this._fetch(`/api/v1/timeline/events/range?${searchParams}`);
  }

  async getTimelineSummary(params?: {
    days?: number;
  }): Promise<{
    period: { start: string; end: string };
    incidents: { total: number; by_severity: Record<string, number> };
    conjunctions: { total: number; by_risk: Record<string, number> };
  }> {
    const searchParams = new URLSearchParams();
    if (params?.days) searchParams.set('days', params.days.toString());
    return this._fetch(`/api/v1/timeline/summary?${searchParams}`);
  }

  // ========== Ingestion Endpoints ==========
  async uploadSpaceWeather(file: File): Promise<{ run_id: string; filename: string }> {
    const formData = new FormData();
    formData.append('file', file);

    const url = `${this.baseUrl || ''}/api/v1/ingestion/upload/space-weather`;
    const headers = { 'X-Tenant-ID': this.tenantId };

    const response = await fetch(url, { method: 'POST', headers, body: formData });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.detail || `API error: ${response.status}`);
    }
    return response.json();
  }

  async uploadObservations(file: File): Promise<{ run_id: string; filename: string }> {
    const formData = new FormData();
    formData.append('file', file);

    const url = `${this.baseUrl || ''}/api/v1/ingestion/upload/observations`;
    const headers = { 'X-Tenant-ID': this.tenantId };

    const response = await fetch(url, { method: 'POST', headers, body: formData });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.detail || `API error: ${response.status}`);
    }
    return response.json();
  }

  // ========== RF Spectrum Endpoints ==========
  async getRFSatelliteProfile(noradId: number): Promise<RFSatelliteProfile> {
    return this._fetch(`/api/v1/rf-spectrum/satellite/${noradId}`);
  }

  async searchRFTransmitters(params?: {
    band?: string;
    mode?: string;
    alive_only?: boolean;
  }): Promise<RFTransmitterSearchResult> {
    const searchParams = new URLSearchParams();
    if (params?.band) searchParams.set('band', params.band);
    if (params?.mode) searchParams.set('mode', params.mode);
    if (params?.alive_only !== undefined) searchParams.set('alive_only', params.alive_only.toString());
    return this._fetch(`/api/v1/rf-spectrum/search?${searchParams}`);
  }

  async getRFBandSummary(): Promise<RFBandSummary[]> {
    return this._fetch('/api/v1/rf-spectrum/bands');
  }

  async getRFOperationalDashboard(): Promise<RFOperationalDashboard> {
    return this._fetch('/api/v1/rf-spectrum/operational-dashboard');
  }

  // ========== Launch Correlation Endpoints ==========
  async getRecentLaunchCorrelations(): Promise<LaunchCorrelationResponse> {
    return this._fetch('/api/v1/launch-correlation/recent');
  }

  async getUncorrelatedObjects(): Promise<UncorrelatedObjectsResponse> {
    return this._fetch('/api/v1/launch-correlation/uncorrelated');
  }

  async getUpcomingLaunches(): Promise<UpcomingLaunchesResponse> {
    return this._fetch('/api/v1/launch-correlation/upcoming');
  }

  async getLaunchDetail(launchId: string): Promise<LaunchCorrelation> {
    return this._fetch(`/api/v1/launch-correlation/launch/${launchId}`);
  }

  // ========== Maneuver Detection Endpoints ==========
  async getRecentManeuvers(limit: number = 50): Promise<RecentManeuversResponse> {
    return this._fetch(`/api/v1/maneuver-detection/recent?limit=${limit}`);
  }

  async getSatelliteManeuverHistory(noradId: number): Promise<ManeuverHistoryResponse> {
    return this._fetch(`/api/v1/maneuver-detection/satellite/${noradId}/history`);
  }

  async analyzeManeuvers(noradIds: number[]): Promise<AnalyzeManeuversResponse> {
    return this._fetch('/api/v1/maneuver-detection/analyze', {
      method: 'POST',
      body: JSON.stringify({ norad_ids: noradIds }),
    });
  }

  // ========== Ground Track & Footprint Endpoints ==========
  async getGroundTrack(noradId: number, durationMinutes = 90, intervalSeconds = 60): Promise<GroundTrackResponse> {
    const params = new URLSearchParams({
      duration_minutes: durationMinutes.toString(),
      interval_seconds: intervalSeconds.toString(),
    });
    return this._fetch(`/api/v1/ground-track/${noradId}?${params}`);
  }

  async getSensorFootprint(noradId: number, fovDeg = 30): Promise<SensorFootprintResponse> {
    const params = new URLSearchParams({ fov_deg: fovDeg.toString() });
    return this._fetch(`/api/v1/ground-track/${noradId}/footprint?${params}`);
  }

  async getPassPredictions(noradId: number, lat: number, lon: number, hours = 24): Promise<PassPredictionsResponse> {
    const params = new URLSearchParams({
      lat: lat.toString(),
      lon: lon.toString(),
      hours: hours.toString(),
    });
    return this._fetch(`/api/v1/ground-track/${noradId}/passes?${params}`);
  }

  // ========== Debris Genealogy Endpoints ==========
  async getFragmentationEvents(): Promise<FragmentationEvent[]> {
    return this._fetch('/api/v1/debris-genealogy/events');
  }

  async getFragmentationEventDetail(eventId: string): Promise<FragmentationEventDetail> {
    return this._fetch(`/api/v1/debris-genealogy/event/${eventId}`);
  }

  async getDebrisLineage(noradId: number): Promise<DebrisLineage> {
    return this._fetch(`/api/v1/debris-genealogy/object/${noradId}/lineage`);
  }

  // ========== Country Dashboard Endpoints ==========
  async getCountryDashboardSummary(): Promise<CountryDashboardSummary> {
    return this._fetch('/api/v1/country-dashboard/summary');
  }

  async getCountryDetail(countryCode: string): Promise<CountryDashboardDetail> {
    return this._fetch(`/api/v1/country-dashboard/country/${countryCode}`);
  }

  async getTopOperators(limit?: number): Promise<TopOperatorsResponse> {
    const searchParams = new URLSearchParams();
    if (limit) searchParams.set('limit', limit.toString());
    return this._fetch(`/api/v1/country-dashboard/operators?${searchParams}`);
  }

  // ========== Collision Heatmap Endpoints ==========
  async getCollisionHeatmap(): Promise<CollisionHeatmapResponse> {
    return this._fetch('/api/v1/collision-heatmap');
  }

  async getCollisionEvents(params?: {
    page?: number;
    page_size?: number;
    altitude_min?: number;
    altitude_max?: number;
  }): Promise<CollisionEventsResponse> {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.set('page', params.page.toString());
    if (params?.page_size) searchParams.set('page_size', params.page_size.toString());
    if (params?.altitude_min !== undefined) searchParams.set('altitude_min', params.altitude_min.toString());
    if (params?.altitude_max !== undefined) searchParams.set('altitude_max', params.altitude_max.toString());
    return this._fetch(`/api/v1/collision-heatmap/events?${searchParams}`);
  }

  async getHealth(): Promise<{ status: string; version: string; timestamp: string; services: Record<string, string> }> {
    return this._fetch('/health');
  }
}

export const api = new ApiClient();

// Operations Interfaces
export type OperationType = 
  | 'transit' | 'patrol' | 'intercept' | 'strike' | 'reconnaissance'
  | 'support' | 'debris_avoidance' | 'station_keeping' | 'formation' | 'coordinated_maneuver';

export type OperationStatus = 
  | 'planned' | 'scheduled' | 'active' | 'in_progress' | 'completed' | 'cancelled' | 'failed';

export type FormationType = 'v_shape' | 'line' | 'diamond' | 'echelon' | 'circle' | 'custom';

export type ManeuverType = 
  | 'orbit_insertion' | 'orbit_change' | 'station_keeping' | 'debris_avoidance'
  | 'collision_avoidance' | 'formation_join' | 'formation_leave' | 'coordinated_burn'
  | 'rendezvous' | 'dispersal';

export type ManeuverStatus = 'planned' | 'scheduled' | 'executing' | 'completed' | 'cancelled' | 'failed';

export type EntityType = 
  | 'satellite' | 'aircraft' | 'ship' | 'ground_vehicle' | 'ground_station'
  | 'ballistic_missile' | 'debris' | 'simulated';

export type TaskStatus = 'pending' | 'queued' | 'assigned' | 'in_progress' | 'completed' | 'failed' | 'cancelled';

export type CollisionRiskLevel = 'low' | 'medium' | 'high' | 'critical';

export interface Waypoint {
  id: string;
  route_plan_id: string;
  sequence_order: number;
  name?: string;
  position_lat: number;
  position_lon: number;
  position_alt_km?: number;
  arrival_time?: string;
  departure_time?: string;
  earliest_arrival?: string;
  latest_arrival?: string;
  hold_duration_sec?: number;
  dwell_time_sec?: number;
  maneuver_type?: string;
  maneuver_params: Record<string, unknown>;
  velocity_x?: number;
  velocity_y?: number;
  velocity_z?: number;
  constraints: unknown[];
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface Maneuver {
  id: string;
  route_plan_id: string;
  waypoint_id?: string;
  entity_id: string;
  maneuver_type: ManeuverType;
  burn_time: string;
  burn_duration_sec?: number;
  delta_v_x?: number;
  delta_v_y?: number;
  delta_v_z?: number;
  total_delta_v_ms?: number;
  fuel_consumed_kg?: number;
  mass_before_kg?: number;
  mass_after_kg?: number;
  status: ManeuverStatus;
  reference_frame: string;
  thrust_n?: number;
  isp_s?: number;
  created_at: string;
  updated_at: string;
}

export interface RoutePlan {
  id: string;
  entity_id: string;
  entity_type: EntityType;
  name: string;
  description?: string;
  mission_type: string;
  start_time: string;
  end_time?: string;
  origin_lat?: number;
  origin_lon?: number;
  origin_alt_km?: number;
  destination_lat?: number;
  destination_lon?: number;
  destination_alt_km?: number;
  priority: number;
  is_recurring: boolean;
  recurrence_pattern?: Record<string, unknown>;
  trajectory_data?: Record<string, unknown>;
  constraints: unknown[];
  objectives: string[];
  status: string;
  planned_by?: string;
  approval_status: string;
  approved_by?: string;
  approved_at?: string;
  actual_start_time?: string;
  actual_end_time?: string;
  created_at: string;
  updated_at: string;
  waypoints: Waypoint[];
  maneuvers: Maneuver[];
}

export interface FormationMember {
  id: string;
  formation_id: string;
  entity_id: string;
  entity_type: EntityType;
  slot_position: number;
  slot_name?: string;
  relative_x_m: number;
  relative_y_m: number;
  relative_z_m: number;
  relative_vx_ms: number;
  relative_vy_ms: number;
  relative_vz_ms: number;
  time_offset_sec: number;
  is_optional: boolean;
  created_at: string;
  updated_at: string;
}

export interface Formation {
  id: string;
  name: string;
  formation_type: FormationType;
  description?: string;
  leader_entity_id?: string;
  spacing_meters: number;
  altitude_separation_m?: number;
  time_offset_sec: number;
  is_active: boolean;
  activation_time?: string;
  deactivation_time?: string;
  formation_data?: Record<string, unknown>;
  slot_assignments: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  members: FormationMember[];
}

export interface Task {
  id: string;
  operation_id: string;
  route_plan_id?: string;
  task_type: string;
  name: string;
  description?: string;
  assigned_entity_id?: string;
  assigned_team?: string;
  scheduled_start?: string;
  scheduled_end?: string;
  actual_start?: string;
  actual_end?: string;
  status: TaskStatus;
  priority: number;
  dependencies: string[];
  prerequisites: string[];
  task_parameters: Record<string, unknown>;
  execution_result?: Record<string, unknown>;
  status_updates: unknown[];
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface Operation {
  id: string;
  name: string;
  operation_type: OperationType;
  description?: string;
  start_time: string;
  end_time?: string;
  participating_entities: string[];
  entity_count: number;
  formation_id?: string;
  coordination_rules: Record<string, unknown>;
  command_chain: string[];
  communication_plan?: Record<string, unknown>;
  priority: number;
  classification: string;
  objectives: string[];
  success_criteria: string[];
  risk_assessment?: Record<string, unknown>;
  timeline_data?: Record<string, unknown>;
  status_reports: unknown[];
  status: OperationStatus;
  actual_start_time?: string;
  actual_end_time?: string;
  created_at: string;
  updated_at: string;
  route_plans: RoutePlan[];
  tasks: Task[];
}

export interface OperationDetail extends Operation {
  formation?: Formation;
}

export interface CollisionAlert {
  id: string;
  entity_a_id: string;
  entity_a_type: EntityType;
  entity_b_id: string;
  entity_b_type: EntityType;
  detection_time: string;
  predicted_collision_time: string;
  miss_distance_km: number;
  miss_distance_radial_km?: number;
  miss_distance_intrack_km?: number;
  miss_distance_crosstrack_km?: number;
  probability?: number;
  risk_level: CollisionRiskLevel;
  entity_a_radius_m?: number;
  entity_b_radius_m?: number;
  combined_radius_m?: number;
  avoidance_maneuver_proposed: boolean;
  avoidance_route_id?: string;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface PositionReport {
  id: string;
  entity_id: string;
  entity_type: EntityType;
  report_time: string;
  timestamp?: string;
  latitude: number;
  longitude: number;
  altitude_m?: number;
  velocity_x?: number;
  velocity_y?: number;
  velocity_z?: number;
  velocity_magnitude_ms?: number;
  heading_deg?: number;
  pitch_deg?: number;
  roll_deg?: number;
  accuracy_m?: number;
  data_source?: string;
  sensor_id?: string;
  is_simulated: boolean;
  created_at: string;
  source?: string;
}

export interface TrajectoryPoint {
  time: string;
  latitude: number;
  longitude: number;
  altitude_km: number;
  velocity_x?: number;
  velocity_y?: number;
  velocity_z?: number;
}

export interface TrajectoryResponse {
  entity_id: string;
  entity_type: EntityType;
  trajectory: TrajectoryPoint[];
  start_time: string;
  end_time: string;
}

export interface AvoidanceManeuverRequest {
  entity_id: string;
  target_collision_id: string;
  avoidance_type: string;
  prefer_altitude_change: boolean;
  min_altitude_km?: number;
  max_delta_v_ms?: number;
}

export interface AvoidanceManeuverResponse {
  maneuver_id: string;
  route_plan_id: string;
  estimated_delta_v_ms: number;
  estimated_fuel_kg: number;
  new_trajectory: TrajectoryPoint[];
  maneuver_sequence: Maneuver[];
}

export interface OperationDispatchRequest {
  operation_id: string;
  dispatch_time?: string;
}

export interface OperationDispatchResponse {
  operation_id: string;
  status: string;
  dispatched_at: string;
  participating_entities: string[];
  timeline_events: unknown[];
}

export interface RoutePlanCreate {
  entity_id: string;
  entity_type: EntityType;
  name: string;
  description?: string;
  mission_type: string;
  start_time: string;
  end_time?: string;
  origin_lat?: number;
  origin_lon?: number;
  origin_alt_km?: number;
  destination_lat?: number;
  destination_lon?: number;
  destination_alt_km?: number;
  priority?: number;
  is_recurring?: boolean;
  recurrence_pattern?: Record<string, unknown>;
  trajectory_data?: Record<string, unknown>;
  constraints?: unknown[];
  objectives?: string[];
  waypoints?: Waypoint[];
  maneuvers?: Maneuver[];
}

export interface RoutePlanUpdate {
  name?: string;
  description?: string;
  mission_type?: string;
  start_time?: string;
  end_time?: string;
  origin_lat?: number;
  origin_lon?: number;
  origin_alt_km?: number;
  destination_lat?: number;
  destination_lon?: number;
  destination_alt_km?: number;
  priority?: number;
  is_recurring?: boolean;
  recurrence_pattern?: Record<string, unknown>;
  trajectory_data?: Record<string, unknown>;
  constraints?: unknown[];
  objectives?: string[];
  status?: string;
}

export interface FormationCreate {
  name: string;
  formation_type: FormationType;
  description?: string;
  leader_entity_id?: string;
  spacing_meters?: number;
  altitude_separation_m?: number;
  time_offset_sec?: number;
  formation_data?: Record<string, unknown>;
  slot_assignments?: Record<string, unknown>;
  members?: FormationMember[];
}

export interface FormationUpdate {
  name?: string;
  formation_type?: FormationType;
  description?: string;
  leader_entity_id?: string;
  spacing_meters?: number;
  altitude_separation_m?: number;
  time_offset_sec?: number;
  is_active?: boolean;
  formation_data?: Record<string, unknown>;
  slot_assignments?: Record<string, unknown>;
}

export interface OperationCreate {
  name: string;
  operation_type: OperationType;
  description?: string;
  start_time: string;
  end_time?: string;
  participating_entities?: string[];
  formation_id?: string;
  coordination_rules?: Record<string, unknown>;
  command_chain?: string[];
  communication_plan?: Record<string, unknown>;
  priority?: number;
  classification?: string;
  objectives?: string[];
  success_criteria?: string[];
  route_plans?: RoutePlanCreate[];
  tasks?: unknown[];
}

export interface PositionReportCreate {
  entity_id: string;
  entity_type: EntityType;
  report_time: string;
  latitude: number;
  longitude: number;
  altitude_m?: number;
  velocity_x?: number;
  velocity_y?: number;
  velocity_z?: number;
  velocity_magnitude_ms?: number;
  heading_deg?: number;
  pitch_deg?: number;
  roll_deg?: number;
  accuracy_m?: number;
  data_source?: string;
  sensor_id?: string;
  is_simulated?: boolean;
}


// ============== Ground Station and Sensor Interfaces ==============

export interface GroundStation {
  id: string;
  name: string;
  code?: string;
  latitude: number;
  longitude: number;
  altitude_m: number;
  antenna_count: number;
  frequency_bands: string[];
  is_operational: boolean;
  status_message?: string;
  organization?: string;
  country?: string;
  description?: string;
}

export interface Sensor {
  id: string;
  name: string;
  code?: string;
  sensor_type: 'RADAR' | 'OPTICAL' | 'LASER';
  latitude?: number;
  longitude?: number;
  altitude_m?: number;
  min_elevation_deg: number;
  max_range_km?: number;
  accuracy_m?: number;
  fov_deg?: number;
  is_operational: boolean;
  organization?: string;
  country?: string;
  ground_station_id?: string;
  description?: string;
}

export interface SatelliteConnection {
  satellite_id: string;
  target_id: string;
  target_type: 'ground_station' | 'sensor' | 'satellite';
  connection_type: 'TRACKS' | 'COVERAGE' | 'CONJUNCTION' | 'COMMUNICATION';
  confidence: number;
  metadata: {
    elevation_deg?: number;
    distance_km?: number;
    ground_station_name?: string;
    sensor_name?: string;
    sensor_type?: string;
    other_satellite_id?: string;
    other_satellite_name?: string;
    miss_distance_km?: number;
    risk_level?: string;
  };
}

// ============== RF Spectrum Interfaces ==============

export interface RFTransmitter {
  uuid: string;
  norad_cat_id: number | null;
  description: string;
  alive: boolean;
  type: string;
  uplink_low: number | null;
  uplink_high: number | null;
  downlink_low: number | null;
  downlink_high: number | null;
  mode: string | null;
  baud: number | null;
  status: string;
  band: string;
}

export interface RFBandSummary {
  band_name: string;
  frequency_range: string;
  satellite_count: number;
  transmitter_count: number;
}

export interface RFSatelliteProfile {
  norad_id: number;
  satellite_name: string;
  transmitters: RFTransmitter[];
}

export interface RFTransmitterSearchResult {
  transmitters: RFTransmitter[];
  total: number;
  band_filter: string | null;
  mode_filter: string | null;
}

// RF Operational Dashboard types
export interface BandOperationalStatus {
  band_name: string;
  frequency_range: string;
  status: 'operational' | 'degraded' | 'blackout';
  degradation_pct: number;
  reason: string;
  satellite_count: number;
  transmitter_count: number;
  vulnerability: string;
  alternative_band: string | null;
}

export interface ScintillationRegion {
  region: 'polar' | 'equatorial' | 'mid_latitude';
  s4_index: number;
  severity: 'none' | 'weak' | 'moderate' | 'strong';
  affected_bands: string[];
}

export interface BandForecastPoint {
  hours_ahead: number;
  status: 'operational' | 'degraded' | 'blackout';
  degradation_pct: number;
  confidence: number;
}

export interface BandForecast {
  band_name: string;
  points: BandForecastPoint[];
}

export interface FrequencyAlternative {
  degraded_band: string;
  alternative_band: string;
  reason: string;
  link_margin_impact: 'minimal' | 'moderate' | 'significant';
}

export interface SpaceWeatherStrip {
  kp_index: number;
  f10_7: number | null;
  xray_flux: number | null;
  xray_class: string | null;
  proton_flux: number | null;
  storm_level: string;
  alert_level: 'green' | 'yellow' | 'orange' | 'red';
  hf_blackout: boolean;
  polar_cap_absorption: boolean;
  timestamp: string;
}

export interface RFOperationalDashboard {
  space_weather: SpaceWeatherStrip;
  band_status: BandOperationalStatus[];
  scintillation: ScintillationRegion[];
  forecasts: BandForecast[];
  alternatives: FrequencyAlternative[];
  overall_status: 'nominal' | 'degraded' | 'critical';
}

// ========== Launch Correlation Interfaces ==========

export interface LaunchInfo {
  id: string;
  name: string;
  net: string | null;
  pad_name: string | null;
  pad_country: string | null;
  rocket_name: string | null;
  mission_name: string | null;
  mission_orbit: string | null;
  status: string | null;
}

export interface CorrelatedObject {
  norad_id: number;
  name: string;
  correlation_confidence: number;
  epoch: string | null;
  orbit_type: string | null;
}

export interface LaunchCorrelation {
  launch: LaunchInfo;
  correlated_objects: CorrelatedObject[];
  total_correlated: number;
}

export interface UncorrelatedObject {
  norad_id: number;
  name: string;
  epoch: string | null;
  orbit_params: Record<string, unknown>;
  possible_launches: LaunchInfo[];
}

export interface LaunchCorrelationResponse {
  launches: LaunchCorrelation[];
  total_launches: number;
  total_correlated_objects: number;
  cached_at: string | null;
}

export interface UncorrelatedObjectsResponse {
  objects: UncorrelatedObject[];
  total: number;
}

export interface UpcomingLaunchesResponse {
  launches: LaunchInfo[];
  total: number;
}

// Maneuver Detection types
export type DetectedManeuverType =
  | 'station-keeping'
  | 'orbit-raise'
  | 'orbit-lower'
  | 'plane-change'
  | 'deorbit'
  | 'unknown';

export interface OrbitalSnapshot {
  epoch: string;
  semi_major_axis_km: number;
  eccentricity: number;
  inclination_deg: number;
  raan_deg: number;
  arg_perigee_deg: number;
  mean_anomaly_deg: number;
  mean_motion_rev_day: number;
}

export interface DetectedManeuver {
  id: string;
  norad_id: number;
  satellite_name: string;
  detection_time: string;
  maneuver_type: DetectedManeuverType;
  delta_a_km: number;
  delta_i_deg: number;
  delta_e: number;
  estimated_delta_v_ms: number;
  confidence: number;
  before?: OrbitalSnapshot;
  after?: OrbitalSnapshot;
}

export interface RecentManeuversResponse {
  maneuvers: DetectedManeuver[];
  total: number;
  last_scan: string | null;
}

export interface ManeuverHistoryResponse {
  norad_id: number;
  satellite_name: string;
  maneuvers: DetectedManeuver[];
  total: number;
}

export interface AnalyzeManeuversResponse {
  analyzed: number;
  maneuvers: DetectedManeuver[];
  total: number;
}

// ========== Ground Track & Footprint Types ==========

export interface GroundTrackPoint {
  time_offset_s: number;
  latitude: number;
  longitude: number;
  altitude_km: number;
}

export interface GroundTrackResponse {
  norad_id: number;
  satellite_name: string;
  duration_minutes: number;
  interval_seconds: number;
  points: GroundTrackPoint[];
}

export interface SensorFootprintResponse {
  norad_id: number;
  center_lat: number;
  center_lon: number;
  radius_km: number;
  altitude_km: number;
  fov_deg: number;
}

export interface SatellitePassEntry {
  rise_time: string;
  culmination_time: string;
  set_time: string;
  max_elevation_deg: number;
  duration_seconds: number;
}

export interface PassPredictionsResponse {
  norad_id: number;
  satellite_name: string;
  observer_lat: number;
  observer_lon: number;
  passes: SatellitePassEntry[];
}

// ========== Debris Genealogy Types ==========

export interface FragmentationEvent {
  id: string;
  name: string;
  event_type: string;
  date: string;
  parent_object_name: string;
  parent_norad_id: number | null;
  parent_intdes: string;
  fragment_count: number;
  orbit_regime: string;
  description: string;
}

export interface FragmentInfo {
  norad_id: number;
  name: string;
  intdes: string;
  object_type: string;
  rcs_size: string | null;
  launch_year: number | null;
}

export interface FragmentationEventDetail extends FragmentationEvent {
  fragments: FragmentInfo[];
}

export interface DebrisLineage {
  norad_id: number;
  name: string;
  intdes: string;
  parent_event: FragmentationEvent | null;
  parent_object_name: string | null;
  siblings_count: number;
}

// Country Dashboard Interfaces
export interface CountrySummary {
  country_code: string;
  country_name: string;
  total_objects: number;
  payloads: number;
  rocket_bodies: number;
  debris: number;
  leo: number;
  meo: number;
  geo: number;
  heo: number;
}

export interface OperatorSummary {
  operator_name: string;
  country: string;
  satellite_count: number;
  primary_purpose: string;
}

export interface OrbitDistribution {
  leo: number;
  meo: number;
  geo: number;
  heo: number;
}

export interface CountryDashboardSummary {
  total_objects: number;
  total_countries: number;
  total_payloads: number;
  total_rocket_bodies: number;
  total_debris: number;
  top_countries: CountrySummary[];
  orbit_distribution: OrbitDistribution;
  all_countries: CountrySummary[];
}

export interface CountryDashboardDetail {
  summary: CountrySummary;
  top_operators: OperatorSummary[];
  orbit_distribution: OrbitDistribution;
}

export interface TopOperatorsResponse {
  operators: OperatorSummary[];
  total: number;
}

// ========== Collision Heatmap Types ==========
export interface CollisionHeatmapBand {
  altitude_min_km: number;
  altitude_max_km: number;
  event_count: number;
  risk_score: number;
}

export interface ConjunctionPairData {
  sat1_name: string;
  sat1_norad: number;
  sat2_name: string;
  sat2_norad: number;
  min_range_km: number;
  tca: string | null;
  relative_velocity_km_s: number | null;
  max_probability: number | null;
  altitude_km: number | null;
}

export interface CollisionHeatmapResponse {
  bands: CollisionHeatmapBand[];
  total_events: number;
  last_updated: string;
}

export interface CollisionEventsResponse {
  items: ConjunctionPairData[];
  total: number;
  page: number;
  page_size: number;
}
