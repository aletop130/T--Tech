import { ApiClient } from '@/lib/api';
import type { 
  Faction, 
  SimulationSatellite, 
  SimulationGroundStation, 
  SimulationVehicle,
  CoverageAnalysis 
} from '@/lib/store/simulation';

export interface SimulationActionResponse {
  action_type: string;
  entity_id?: string;
  payload: Record<string, unknown>;
  message?: string;
}

export interface FootprintResponse {
  satellite_id: string;
  satellite_name: string;
  altitude_km: number;
  footprint_radius_km: number;
  footprint_area_km2: number;
  min_elevation_deg: number;
  polygon: Array<{ lat: number; lon: number }>;
}

export interface CoverageAnalysisResponse {
  faction: string | null;
  total_satellites: number;
  total_grid_points: number;
  covered_points: number;
  coverage_percent: number;
  overlap_points: number;
  overlap_percent: number;
  gap_points: number;
  gap_percent: number;
}

class SimulationApiClient extends ApiClient {
  async addSatellite(data: {
    name: string;
    altitude_km: number;
    inclination_deg?: number;
    raan_deg?: number;
    faction?: Faction;
  }): Promise<SimulationActionResponse> {
    return this.post<SimulationActionResponse>('/simulation/satellites', data);
  }

  async addGroundStation(data: {
    name: string;
    latitude: number;
    longitude: number;
    altitude_m?: number;
    coverage_radius_km?: number;
    faction?: Faction;
  }): Promise<SimulationActionResponse> {
    return this.post<SimulationActionResponse>('/simulation/ground-stations', data);
  }

  async addVehicle(data: {
    name: string;
    entity_type: 'ground_vehicle' | 'aircraft' | 'ship';
    latitude: number;
    longitude: number;
    altitude_m?: number;
    heading_deg?: number;
    velocity_ms?: number;
    faction?: Faction;
  }): Promise<SimulationActionResponse> {
    return this.post<SimulationActionResponse>('/simulation/vehicles', data);
  }

  async showSatelliteCoverage(data: {
    satellite_id: string;
    show?: boolean;
    min_elevation_deg?: number;
  }): Promise<FootprintResponse> {
    return this.post<FootprintResponse>('/simulation/coverage/show', data);
  }

  async analyzeCoverage(data: {
    faction?: Faction;
    region_bounds?: [number, number, number, number];
    grid_resolution_deg?: number;
  }): Promise<CoverageAnalysisResponse> {
    return this.post<CoverageAnalysisResponse>('/simulation/coverage/analyze', data);
  }

  async removeEntity(entityType: string, entityId: string): Promise<void> {
    await this.delete<void>(`/simulation/entities/${entityType}/${entityId}`);
  }
}

export const simulationApi = new SimulationApiClient();
