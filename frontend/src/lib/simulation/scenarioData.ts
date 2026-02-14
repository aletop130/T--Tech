import * as Cesium from 'cesium';

// Operation Guardian Angel - Fixed SAR Scenario
// Duration: 5 minutes (300 seconds) at 10x speed = 30 seconds real-time

export interface SimulationEntity {
  id: string;
  type: 'satellite' | 'ground_unit' | 'location';
  name: string;
  category?: string;
}

export interface SimulatedSatelliteData {
  id: string;
  name: string;
  type: 'recon' | 'comms';
  initialPosition: Cesium.Cartesian3;
  status: 'online' | 'degraded' | 'maneuvering' | 'offline';
  fuelPercent: number;
  maneuvers: {
    time: number; // seconds from start
    type: 'evasive_burn' | 'avoidance_burn' | 'station_keeping';
    deltaV: { radial: number; tangential: number; normal: number };
    duration: number;
  }[];
}

export interface GroundUnitData {
  id: string;
  name: string;
  sidc: string;
  initialPosition: Cesium.Cartesian3;
  affiliation: 'friendly' | 'hostile' | 'neutral';
  status: 'static' | 'moving';
  movements?: {
    time: number;
    position: Cesium.Cartesian3;
    heading: number;
    speed: number;
  }[];
}

export interface SimulationEvent {
  time: number;
  type: string;
  targetId?: string;
  description: string;
  cameraAction?: {
    mode: 'satellite' | 'ground' | 'split';
    targetId?: string;
    duration: number;
  };
}

// Scenario configuration
export const GUARDIAN_ANGEL_SCENARIO = {
  duration: 300, // 5 minutes
  timeAcceleration: 0.5, // 0.5x speed - slower for better step control
  
  // Step duration in seconds (real time between steps)
  stepDuration: 30,
  
  // Key events where simulation should pause for dashboard description
  keyEvents: [0, 30, 60, 120, 180, 210, 270, 300] as number[],
  
  // Satellites
  satellites: [
    {
      id: 'reconsat-1',
      name: 'ReconSat-1',
      type: 'recon' as const,
      initialPosition: Cesium.Cartesian3.fromDegrees(14.5, 31.5, 400000),
      status: 'online' as const,
      fuelPercent: 100,
      maneuvers: [
        {
          time: 45,
          type: 'evasive_burn' as const,
          deltaV: { radial: 0, tangential: 2.3, normal: 0 },
          duration: 10,
        },
        {
          time: 120,
          type: 'avoidance_burn' as const,
          deltaV: { radial: 0.5, tangential: 0, normal: 1.2 },
          duration: 5,
        },
      ],
    },
    {
      id: 'comsat-2',
      name: 'ComSat-2',
      type: 'comms' as const,
      initialPosition: Cesium.Cartesian3.fromDegrees(16.0, 32.0, 420000),
      status: 'online' as const,
      fuelPercent: 100,
      maneuvers: [],
    },
  ] as SimulatedSatelliteData[],
  
  // Ground units
  groundUnits: [
    // Friendly forces
    {
      id: 'phantom-6',
      name: 'Phantom-6',
      sidc: 'SFGPUCVF--*****', // SAR team
      initialPosition: Cesium.Cartesian3.fromDegrees(14.32, 31.84, 0),
      affiliation: 'friendly' as const,
      status: 'static' as const,
    },
    {
      id: 'hms-defender',
      name: 'HMS Defender',
      sidc: 'SFAPW-----*****', // Ship
      initialPosition: Cesium.Cartesian3.fromDegrees(14.0, 31.6, 0),
      affiliation: 'friendly' as const,
      status: 'static' as const,
    },
    {
      id: 'seahawk-1',
      name: 'MH-60 Seahawk',
      sidc: 'SFAPMH----*****', // Helicopter
      initialPosition: Cesium.Cartesian3.fromDegrees(14.0, 31.6, 100),
      affiliation: 'friendly' as const,
      status: 'moving' as const,
      movements: [
        { time: 120, position: Cesium.Cartesian3.fromDegrees(14.0, 31.6, 100), heading: 45, speed: 50 },
        { time: 180, position: Cesium.Cartesian3.fromDegrees(14.32, 31.84, 50), heading: 45, speed: 0 }, // Landing at extraction point
        { time: 210, position: Cesium.Cartesian3.fromDegrees(14.32, 31.84, 50), heading: 225, speed: 50 }, // Takeoff with team
        { time: 270, position: Cesium.Cartesian3.fromDegrees(14.0, 31.6, 100), heading: 225, speed: 50 }, // Return to HMS Defender
        { time: 300, position: Cesium.Cartesian3.fromDegrees(14.0, 31.6, 50), heading: 225, speed: 0 }, // Landed on HMS Defender
      ],
    },
    
    // Enemy forces (shown as red)
    {
      id: 'enemy-base',
      name: 'Enemy Base',
      sidc: 'SHGPI-----*****', // Installation
      initialPosition: Cesium.Cartesian3.fromDegrees(14.4, 31.9, 0),
      affiliation: 'hostile' as const,
      status: 'static' as const,
    },
    // Ceccano Base - Italian friendly installation
    {
      id: 'ceccano-base',
      name: 'Ceccano Base',
      sidc: 'SFGPI-----*****', // Friendly Installation
      initialPosition: Cesium.Cartesian3.fromDegrees(13.35, 41.5, 0),
      affiliation: 'friendly' as const,
      status: 'static' as const,
    },
    {
      id: 'enemy-patrol-1',
      name: 'Enemy Patrol A',
      sidc: 'SHGPU-----*****', // Infantry
      initialPosition: Cesium.Cartesian3.fromDegrees(14.35, 31.82, 0),
      affiliation: 'hostile' as const,
      status: 'moving' as const,
      movements: [
        { time: 0, position: Cesium.Cartesian3.fromDegrees(14.35, 31.82, 0), heading: 90, speed: 5 },
        { time: 180, position: Cesium.Cartesian3.fromDegrees(14.33, 31.83, 0), heading: 90, speed: 5 },
        { time: 195, position: Cesium.Cartesian3.fromDegrees(14.33, 31.83, 0), heading: 0, speed: 0 }, // Eliminated
      ],
    },
    {
      id: 'enemy-patrol-2',
      name: 'Enemy Patrol B',
      sidc: 'SHGPU-----*****',
      initialPosition: Cesium.Cartesian3.fromDegrees(14.38, 31.85, 0),
      affiliation: 'hostile' as const,
      status: 'static' as const,
    },
    {
      id: 'enemy-patrol-3',
      name: 'Enemy Patrol C',
      sidc: 'SHGPU-----*****',
      initialPosition: Cesium.Cartesian3.fromDegrees(14.36, 31.87, 0),
      affiliation: 'hostile' as const,
      status: 'static' as const,
    },
  ] as GroundUnitData[],
  
  // Scripted events - Search and Rescue scenario
  events: [
    {
      time: 0,
      type: 'mission_start',
      description: 'Operation Guardian Angel initiated - SAR mission to locate and extract isolated team',
      cameraAction: { mode: 'satellite', targetId: 'reconsat-1', duration: 5 },
    },
    {
      time: 30,
      type: 'cyber_attack',
      targetId: 'reconsat-1',
      description: 'Enemy ground station attempting to jam satellite communications',
      cameraAction: { mode: 'satellite', targetId: 'reconsat-1', duration: 15 },
    },
    {
      time: 60,
      type: 'collision_threat',
      targetId: 'reconsat-1',
      description: 'Hostile satellite on intercept course - evasive maneuvers in progress',
      cameraAction: { mode: 'satellite', targetId: 'reconsat-1', duration: 15 },
    },
    {
      time: 120,
      type: 'ground_ops_start',
      description: 'Helicopter launched for extraction - proceeding to last known position',
      cameraAction: { mode: 'ground', targetId: 'seahawk-1', duration: 10 },
    },
    {
      time: 180,
      type: 'target_location',
      targetId: 'phantom-6',
      description: 'Visual contact established with isolated team - proceeding to extraction point',
      cameraAction: { mode: 'ground', targetId: 'phantom-6', duration: 15 },
    },
    {
      time: 210,
      type: 'extraction',
      targetId: 'phantom-6',
      description: 'Team boarding helicopter - extraction in progress',
      cameraAction: { mode: 'ground', targetId: 'phantom-6', duration: 10 },
    },
    {
      time: 270,
      type: 'evacuation',
      description: 'Team extracted successfully - returning to HMS Defender',
      cameraAction: { mode: 'split', duration: 10 },
    },
    {
      time: 300,
      type: 'mission_complete',
      description: 'Operation Guardian Angel complete - all personnel recovered safely',
      cameraAction: { mode: 'satellite', duration: 5 },
    },
  ] as SimulationEvent[],
  
  // Camera sequence
  cameraSequence: [
    { time: 0, mode: 'satellite' as const, targetId: 'reconsat-1', duration: 30 },
    { time: 30, mode: 'satellite' as const, targetId: 'reconsat-1', duration: 90 },
    { time: 120, mode: 'ground' as const, targetId: 'seahawk-1', duration: 90 },
    { time: 210, mode: 'ground' as const, targetId: 'phantom-6', duration: 60 },
    { time: 270, mode: 'split' as const, duration: 30 },
  ],
};

// Helper to interpolate position based on time
export function interpolatePosition(
  unit: GroundUnitData,
  currentTime: number
): Cesium.Cartesian3 {
  if (!unit.movements || unit.movements.length === 0) {
    return unit.initialPosition;
  }

  // Find the relevant movement segments
  const sortedMovements = [...unit.movements].sort((a, b) => a.time - b.time);
  
  // Before first movement
  if (currentTime <= sortedMovements[0].time) {
    return sortedMovements[0].position;
  }
  
  // After last movement
  const lastMovement = sortedMovements[sortedMovements.length - 1];
  if (currentTime >= lastMovement.time) {
    return lastMovement.position;
  }
  
  // Find current segment
  for (let i = 0; i < sortedMovements.length - 1; i++) {
    const current = sortedMovements[i];
    const next = sortedMovements[i + 1];
    
    if (currentTime >= current.time && currentTime <= next.time) {
      // Interpolate
      const t = (currentTime - current.time) / (next.time - current.time);
      return Cesium.Cartesian3.lerp(current.position, next.position, t, new Cesium.Cartesian3());
    }
  }
  
  return unit.initialPosition;
}

// Helper to get satellite status at specific time
export function getSatelliteStatus(
  satellite: SimulatedSatelliteData,
  currentTime: number
): 'online' | 'degraded' | 'maneuvering' | 'offline' {
  // Check if currently maneuvering
  const activeManeuver = satellite.maneuvers.find(
    m => currentTime >= m.time && currentTime <= m.time + m.duration
  );
  
  if (activeManeuver) {
    return 'maneuvering';
  }
  
  // For now, just return the base status (events will modify this)
  return satellite.status;
}
