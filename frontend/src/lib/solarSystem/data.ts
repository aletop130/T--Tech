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

// Major moons only - the most significant ones
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
  // Jupiter's Galilean moons
  {
    id: 'io',
    name: 'Io',
    type: 'moon',
    parent: 'jupiter',
    radiusKm: 1821.6,
    distanceKm: 421700,
    orbitalPeriodDays: 1.77,
    texture: '/textures/planets/io.jpg',
    color: '#FFFF99',
    description: 'Most volcanically active body in the solar system',
    hasAtmosphere: false,
  },
  {
    id: 'europa',
    name: 'Europa',
    type: 'moon',
    parent: 'jupiter',
    radiusKm: 1560.8,
    distanceKm: 671034,
    orbitalPeriodDays: 3.55,
    texture: '/textures/planets/europa.jpg',
    color: '#F0F8FF',
    description: 'Ice-covered moon with subsurface ocean',
    hasAtmosphere: false,
  },
  {
    id: 'ganymede',
    name: 'Ganymede',
    type: 'moon',
    parent: 'jupiter',
    radiusKm: 2634.1,
    distanceKm: 1070412,
    orbitalPeriodDays: 7.15,
    texture: '/textures/planets/ganymede.jpg',
    color: '#A0A0A0',
    description: 'Largest moon in the solar system',
    hasAtmosphere: false,
  },
  {
    id: 'callisto',
    name: 'Callisto',
    type: 'moon',
    parent: 'jupiter',
    radiusKm: 2410.3,
    distanceKm: 1882709,
    orbitalPeriodDays: 16.69,
    texture: '/textures/planets/callisto.jpg',
    color: '#696969',
    description: 'Heavily cratered outer Galilean moon',
    hasAtmosphere: false,
  },
  // Saturn's major moons
  {
    id: 'titan',
    name: 'Titan',
    type: 'moon',
    parent: 'saturn',
    radiusKm: 2574.7,
    distanceKm: 1221870,
    orbitalPeriodDays: 15.95,
    texture: '/textures/planets/titan.jpg',
    color: '#DAA520',
    description: 'Only moon with dense atmosphere',
    hasAtmosphere: true,
  },
  {
    id: 'enceladus',
    name: 'Enceladus',
    type: 'moon',
    parent: 'saturn',
    radiusKm: 252.1,
    distanceKm: 238020,
    orbitalPeriodDays: 1.37,
    texture: '/textures/planets/enceladus.jpg',
    color: '#F0F8FF',
    description: 'Active ice geysers on south pole',
    hasAtmosphere: false,
  },
  // Neptune's moon
  {
    id: 'triton',
    name: 'Triton',
    type: 'moon',
    parent: 'neptune',
    radiusKm: 1353.4,
    distanceKm: 354759,
    orbitalPeriodDays: 5.88,
    texture: '/textures/planets/triton.jpg',
    color: '#E0E0E0',
    description: 'Largest moon of Neptune, retrograde orbit',
    hasAtmosphere: true,
  },
  // Pluto's moon
  {
    id: 'charon',
    name: 'Charon',
    type: 'moon',
    parent: 'pluto',
    radiusKm: 606,
    distanceKm: 19591,
    orbitalPeriodDays: 6.39,
    texture: '/textures/planets/charon.jpg',
    color: '#808080',
    description: 'Largest moon relative to its planet',
    hasAtmosphere: false,
  },
];

// All planets + Pluto
export const PLANETS: CelestialBody[] = [
  {
    id: 'sun',
    name: 'Sun',
    type: 'star',
    radiusKm: 696340,
    distanceAU: 0,
    orbitalPeriodDays: 0,
    texture: '/textures/planets/sun.jpg',
    color: '#FDB813',
    description: 'The star at the center of our solar system',
    hasAtmosphere: true,
    moons: [],
  },
  {
    id: 'mercury',
    name: 'Mercury',
    type: 'planet',
    radiusKm: 2439.7,
    distanceAU: 0.39,
    orbitalPeriodDays: 88,
    texture: '/textures/planets/mercury.jpg',
    color: '#8C8C8C',
    description: 'Smallest planet, closest to the Sun',
    hasAtmosphere: false,
    moons: [],
  },
  {
    id: 'venus',
    name: 'Venus',
    type: 'planet',
    radiusKm: 6051.8,
    distanceAU: 0.72,
    orbitalPeriodDays: 225,
    texture: '/textures/planets/venus_surface.jpg',
    textureClouds: '/textures/planets/venus_atmosphere.jpg',
    color: '#E6E6B8',
    description: 'Hottest planet with thick toxic atmosphere',
    hasAtmosphere: true,
    moons: [],
  },
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
  {
    id: 'jupiter',
    name: 'Jupiter',
    type: 'planet',
    radiusKm: 69911,
    distanceAU: 5.2,
    orbitalPeriodDays: 4333,
    texture: '/textures/planets/jupiter.jpg',
    color: '#D4A373',
    description: 'Largest planet, gas giant with Great Red Spot',
    hasAtmosphere: true,
    moons: ['io', 'europa', 'ganymede', 'callisto'],
  },
  {
    id: 'saturn',
    name: 'Saturn',
    type: 'planet',
    radiusKm: 58232,
    distanceAU: 9.58,
    orbitalPeriodDays: 10759,
    texture: '/textures/planets/saturn.jpg',
    textureRing: '/textures/planets/saturn_ring_alpha.png',
    color: '#F4D03F',
    description: 'Famous for its spectacular ring system',
    hasAtmosphere: true,
    moons: ['titan', 'enceladus'],
  },
  {
    id: 'uranus',
    name: 'Uranus',
    type: 'planet',
    radiusKm: 25362,
    distanceAU: 19.22,
    orbitalPeriodDays: 30687,
    texture: '/textures/planets/uranus.jpg',
    color: '#4FD0E7',
    description: 'Ice giant tilted on its side',
    hasAtmosphere: true,
    moons: [],
  },
  {
    id: 'neptune',
    name: 'Neptune',
    type: 'planet',
    radiusKm: 24622,
    distanceAU: 30.05,
    orbitalPeriodDays: 60190,
    texture: '/textures/planets/neptune.jpg',
    color: '#4169E1',
    description: 'Windiest planet, deep blue ice giant',
    hasAtmosphere: true,
    moons: ['triton'],
  },
  {
    id: 'pluto',
    name: 'Pluto',
    type: 'dwarf_planet',
    radiusKm: 1188.3,
    distanceAU: 39.48,
    orbitalPeriodDays: 90520,
    texture: '/textures/planets/pluto.jpg',
    color: '#D2B48C',
    description: 'Dwarf planet in the Kuiper Belt',
    hasAtmosphere: true,
    moons: ['charon'],
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
