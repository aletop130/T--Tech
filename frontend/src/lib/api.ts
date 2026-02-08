// Use relative URL to leverage Next.js API rewrites in development
// This avoids CORS and network resolution issues
const API_BASE = typeof window !== 'undefined' 
  ? '' // Browser: use relative URLs (goes through Next.js rewrites)
  : (process.env.NEXT_PUBLIC_API_URL || 'http://backend:8000'); // Server: use direct backend URL

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
}

export interface SpaceWeatherEvent {
  id: string;
  event_type: string;
  severity: string;
  start_time: string;
  kp_index?: number;
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

class ApiClient {
  private baseUrl: string;
  private tenantId: string;

  constructor() {
    this.baseUrl = API_BASE;
    this.tenantId = 'default';
  }

  private async _fetch<T>(
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

  async getSatellite(id: string): Promise<Satellite> {
    return this._fetch(`/api/v1/ontology/satellites/${id}`);
  }

  async getSatellitesWithOrbits(): Promise<SatelliteDetail[]> {
    return this._fetch('/api/v1/ontology/satellites/with-orbits');
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

  async chatStream(messages: Array<{ role: string; content: string }>, sceneState?: Record<string, unknown>) {
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
