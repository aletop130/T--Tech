import type { CesiumModule } from '@/lib/cesium/loader';

export interface DebrisObject {
  noradId: number;
  lat: number;
  lon: number;
  altKm: number;
}

export interface DebrisResponse {
  timeUtc: string;
  objects: DebrisObject[];
}

export interface OrbitPoint {
  tUtc: string;
  lat: number;
  lon: number;
  altKm: number;
}

export interface OrbitResponse {
  noradId: number;
  timeStartUtc: string;
  stepSec: number;
  points: OrbitPoint[];
}

/**
 * Orbit track state used by the Cesium visualisation components.
 * `points` are Cesium Cartesian3 positions.
 */
export interface OrbitTrackState {
  points: InstanceType<CesiumModule['Cartesian3']>[];
  timeStartMs: number;
  stepSec: number;
}
