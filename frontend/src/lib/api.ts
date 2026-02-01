const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
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
  created_at: string;
  updated_at: string;
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

  private async fetch<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const headers = {
      'Content-Type': 'application/json',
      'X-Tenant-ID': this.tenantId,
      ...options.headers,
    };

    const response = await fetch(url, { ...options, headers });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.detail || `API error: ${response.status}`);
    }

    return response.json();
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

    return this.fetch(`/api/v1/ontology/satellites?${searchParams}`);
  }

  async getSatellite(id: string): Promise<Satellite> {
    return this.fetch(`/api/v1/ontology/satellites/${id}`);
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
    return this.fetch(`/api/v1/ontology/ground-stations?${searchParams}`);
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
    return this.fetch(`/api/v1/incidents?${searchParams}`);
  }

  async getIncident(id: string): Promise<Incident> {
    return this.fetch(`/api/v1/incidents/${id}`);
  }

  async getIncidentStats(): Promise<IncidentStats> {
    return this.fetch('/api/v1/incidents/stats');
  }

  async updateIncidentStatus(
    id: string,
    status: string,
    comment?: string
  ): Promise<Incident> {
    return this.fetch(`/api/v1/incidents/${id}/status`, {
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
    return this.fetch(`/api/v1/ontology/conjunctions?${searchParams}`);
  }

  async getConjunction(id: string): Promise<ConjunctionEvent> {
    return this.fetch(`/api/v1/ontology/conjunctions/${id}`);
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
    return this.fetch(`/api/v1/ontology/space-weather?${searchParams}`);
  }

  // Search
  async search(query: string, types?: string[]): Promise<SearchResult[]> {
    const searchParams = new URLSearchParams({ q: query });
    if (types?.length) searchParams.set('types', types.join(','));
    return this.fetch(`/api/v1/search?${searchParams}`);
  }

  // AI
  async chat(messages: Array<{ role: string; content: string }>, contextIds?: string[]) {
    return this.fetch('/api/v1/ai/chat', {
      method: 'POST',
      body: JSON.stringify({
        messages,
        context_object_ids: contextIds || [],
      }),
    });
  }

  async analyzeConjunction(eventId: string) {
    return this.fetch('/api/v1/ai/agents/conjunction-analyst', {
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
    return this.fetch('/api/v1/analytics/conjunction/run', {
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
    return this.fetch(`/api/v1/analytics/space-weather/impact?${searchParams}`);
  }

  // Create Incident
  async createIncident(data: {
    title: string;
    description?: string;
    incident_type: string;
    severity: string;
    related_object_ids?: string[];
  }): Promise<Incident> {
    return this.fetch('/api/v1/incidents', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // Upload TLE
  async uploadTLE(file: File): Promise<{ run_id: string; filename: string }> {
    const formData = new FormData();
    formData.append('file', file);

    const url = `${this.baseUrl}/api/v1/ingestion/upload/tle`;
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
}

export const api = new ApiClient();

