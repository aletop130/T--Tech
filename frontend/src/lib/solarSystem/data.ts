/**
 * Solar System Data
 * High-quality planetary data for Cesium visualization
 * Includes all 8 planets + Pluto + major moons
 */

export type CelestialBodyType = 'star' | 'planet' | 'dwarf_planet' | 'moon';

export interface CelestialBody {
  id: string;
  name: string;
  type: CelestialBodyType;
  parent?: string; // For moons - parent body ID
  radiusKm: number;
  distanceAU?: number; // From Sun (AU) - for planets
  distanceKm?: number; // For moons - distance from parent
  orbitalPeriodDays: number;
  texture: string;
  textureNight?: string; // For Earth
  textureClouds?: string; // For Earth/Venus
  textureRing?: string; // For Saturn
  color: string; // CSS color fallback
  description: string;
  hasAtmosphere: boolean;
  moons?: string[]; // IDs of moons (for planets)
}

// Major moons only - Earth and Mars moons
export const MAJOR_MOONS: CelestialBody[] = [
  // Earth's Moon
  {
    id: 'moon',
    name: 'Moon',
    type: 'moon',
    parent: 'earth',
    radiusKm: 1737.4,
    distanceKm: 384400,
    orbitalPeriodDays: 27.3,
    texture: '/textures/planets/moon.jpg',
    color: '#C0C0C0',
    description: 'Earth\'s only natural satellite',
    hasAtmosphere: false,
  },
  // Mars moons
  {
    id: 'phobos',
    name: 'Phobos',
    type: 'moon',
    parent: 'mars',
    radiusKm: 11.2,
    distanceKm: 9376,
    orbitalPeriodDays: 0.32,
    texture: '/textures/planets/phobos.jpg',
    color: '#8B7355',
    description: 'Larger and inner moon of Mars',
    hasAtmosphere: false,
  },
  {
    id: 'deimos',
    name: 'Deimos',
    type: 'moon',
    parent: 'mars',
    radiusKm: 6.2,
    distanceKm: 23463,
    orbitalPeriodDays: 1.26,
    texture: '/textures/planets/deimos.jpg',
    color: '#8B7355',
    description: 'Smaller and outer moon of Mars',
    hasAtmosphere: false,
  },
];

// Minimal solar system - Earth and Mars only
export const PLANETS: CelestialBody[] = [
  {
    id: 'earth',
    name: 'Earth',
    type: 'planet',
    radiusKm: 6371,
    distanceAU: 1.0,
    orbitalPeriodDays: 365.25,
    texture: '/textures/planets/earth_daymap.jpg',
    textureNight: '/textures/planets/earth_nightmap.jpg',
    textureClouds: '/textures/planets/earth_clouds.jpg',
    color: '#2233FF',
    description: 'Our home planet, the only known world with life',
    hasAtmosphere: true,
    moons: ['moon'],
  },
  {
    id: 'mars',
    name: 'Mars',
    type: 'planet',
    radiusKm: 3389.5,
    distanceAU: 1.52,
    orbitalPeriodDays: 687,
    texture: '/textures/planets/mars.jpg',
    color: '#FF4500',
    description: 'The Red Planet, target for human exploration',
    hasAtmosphere: true,
    moons: ['phobos', 'deimos'],
  },
];

// Combine all celestial bodies
export const CELESTIAL_BODIES: CelestialBody[] = [...PLANETS, ...MAJOR_MOONS];

// Helper functions
export function getBodyById(id: string): CelestialBody | undefined {
  return CELESTIAL_BODIES.find(body => body.id === id);
}

export function getMoonsOfPlanet(planetId: string): CelestialBody[] {
  return MAJOR_MOONS.filter(moon => moon.parent === planetId);
}

export function getPlanetById(id: string): CelestialBody | undefined {
  return PLANETS.find(planet => planet.id === id);
}

// Scale constants for visualization
export const SCALE = {
  // Scale planet radii so they're visible but proportional
  PLANET_RADIUS_SCALE: 0.005, // km to scene units (increased from 0.0005)
  
  // Distance scaling - logarithmic to fit all planets in view
  DISTANCE_SCALE_FACTOR: 500000, // Base scale (reduced for tighter view)
  DISTANCE_LOG_MULTIPLIER: 2000000, // For outer planets (reduced)
  
  // Sun size adjustment (would be too big at real scale)
  SUN_SCALE_FACTOR: 0.05, // Smaller sun so planets are visible
  
  // Minimum visible size for any body (ensure planets don't disappear)
  MIN_VISIBLE_RADIUS: 10000, // scene units
  
  // Moon distance scaling
  MOON_DISTANCE_SCALE: 2, // Exaggerate moon distances for visibility
};

/**
 * Calculate scaled distance from Sun for visualization
 * Uses logarithmic scaling for outer planets to fit in view
 */
export function calculateScaledDistance(distanceAU: number): number {
  if (distanceAU <= 0) return 0;
  
  // Use a power scale to compress outer planet distances
  // This keeps inner planets at reasonable distances while fitting outer planets in view
  const scaledAU = Math.pow(distanceAU, 0.7); // Compress with power < 1
  
  // Base distance unit: scaled AU * scale factor
  return scaledAU * SCALE.DISTANCE_SCALE_FACTOR;
}

/**
 * Calculate scaled radius for visualization
 */
export function calculateScaledRadius(radiusKm: number, isSun: boolean = false): number {
  // Apply radius scale
  let scaled = radiusKm * SCALE.PLANET_RADIUS_SCALE;
  
  // Sun gets special treatment to not overwhelm the view
  if (isSun) {
    scaled *= SCALE.SUN_SCALE_FACTOR;
  }
  
  // Ensure minimum visibility (important for small bodies like Mercury, Pluto)
  // But allow the Sun to be larger
  if (isSun) {
    return Math.max(scaled, SCALE.MIN_VISIBLE_RADIUS * 5);
  }
  
  return Math.max(scaled, SCALE.MIN_VISIBLE_RADIUS * 0.5);
}

/**
 * Calculate moon position relative to parent planet
 */
export function calculateMoonPosition(
  moonDistanceKm: number,
  time: number,
  orbitalPeriodDays: number
): { x: number; y: number; z: number } {
  const angle = (time / (orbitalPeriodDays * 24 * 60 * 60 * 1000)) * 2 * Math.PI;
  const scaledDistance = moonDistanceKm * SCALE.PLANET_RADIUS_SCALE * SCALE.MOON_DISTANCE_SCALE;
  
  return {
    x: Math.cos(angle) * scaledDistance,
    y: 0,
    z: Math.sin(angle) * scaledDistance,
  };
}
