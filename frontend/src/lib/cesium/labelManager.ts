/**
 * Label collision avoidance utility for Cesium entities.
 * Manages label visibility based on distance and priority.
 */

import type { CesiumModule } from '@/lib/cesium/loader';

export interface LabelConfig {
  /** Show labels only beyond this distance (meters) */
  nearDistance: number;
  /** Near distance scale factor */
  nearValue: number;
  /** Show labels only within this distance (meters) */
  farDistance: number;
  /** Far distance scale factor */
  farValue: number;
}

const DEFAULT_GROUND: LabelConfig = {
  nearDistance: 500,
  nearValue: 1.0,
  farDistance: 500_000,
  farValue: 0.0,
};

const DEFAULT_ORBITAL: LabelConfig = {
  nearDistance: 100_000,
  nearValue: 1.0,
  farDistance: 10_000_000,
  farValue: 0.3,
};

export function getLabelConfig(actorClass: string): LabelConfig {
  if (actorClass === 'orbital') return DEFAULT_ORBITAL;
  return DEFAULT_GROUND;
}

/**
 * Create a Cesium NearFarScalar for label translucency.
 * Labels fade out at extreme distances to reduce clutter.
 */
export function createLabelScalar(
  Cesium: CesiumModule,
  config: LabelConfig = DEFAULT_GROUND,
): InstanceType<CesiumModule['NearFarScalar']> {
  return new Cesium.NearFarScalar(
    config.nearDistance,
    config.nearValue,
    config.farDistance,
    config.farValue,
  );
}

/**
 * Create a DistanceDisplayCondition to hide entities at inappropriate zoom levels.
 */
export function createDistanceCondition(
  Cesium: CesiumModule,
  near: number = 0,
  far: number = 2_000_000,
): InstanceType<CesiumModule['DistanceDisplayCondition']> {
  return new Cesium.DistanceDisplayCondition(near, far);
}

/**
 * Determine label priority (higher = more important, shown first).
 */
export function getLabelPriority(
  faction: string,
  actorType: string,
): number {
  // Hostile entities get highest priority
  let priority = 0;
  if (faction === 'hostile') priority += 100;
  else if (faction === 'allied') priority += 50;

  // HQ/bases are important
  if (actorType === 'base' || actorType === 'hq') priority += 30;
  // Active movers
  if (actorType === 'aircraft' || actorType === 'missile') priority += 20;
  // Satellites
  if (actorType === 'satellite') priority += 10;

  return priority;
}
