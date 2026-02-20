import * as Cesium from 'cesium';

// Operation Guardian Angel - Fixed SAR Scenario
// Duration: 4 hours (14400 seconds) at 120x speed = 2 minutes real-time

export interface SimulationEntity {
  id: string;
  type: 'satellite' | 'ground_unit' | 'location';
  name: string;
  category?: string;
}

export interface SimulatedSatelliteData {
  id: string;
  name: string;
  type: 'recon' | 'comms' | 'debris';
  initialPosition: Cesium.Cartesian3;
  status: 'online' | 'degraded' | 'maneuvering' | 'offline';
  fuelPercent: number;
  maneuvers: {
    time: number; // seconds from start
    type: 'evasive_burn' | 'avoidance_burn' | 'station_keeping';
    deltaV: { radial: number; tangential: number; normal: number };
    duration: number;
  }[];
  affiliation?: 'allied' | 'hostile' | 'neutral';
  tleLine1?: string;
  tleLine2?: string;
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
// 4 hours of simulated mission time compressed into 2 minutes of real time
// Scale factor: 14400 seconds sim / 120 seconds real = 120x speed
export const GUARDIAN_ANGEL_SCENARIO = {
  duration: 14400, // 4 hours of mission time
  timeAcceleration: 120, // 120x speed - 4 hours in 2 minutes real time
  
  // Step duration in seconds (real time between steps - narrative pauses)
  stepDuration: 15, // ~15 seconds between narrative checkpoints
  
  // Key events where simulation should pause for dashboard description
  // Cinematic timing for clear action beats
  keyEvents: [0, 1440, 2160, 2880, 3600, 7200, 7920, 10080, 14400] as number[],
  
  // Satellites - Cinematic positioning for SAR mission
  satellites: [
    {
      id: 'reconsat-1',
      name: 'ReconSat-1',
      type: 'recon' as const,
      initialPosition: Cesium.Cartesian3.fromDegrees(14.5, 31.5, 400000),
      status: 'online' as const,
      fuelPercent: 100,
      affiliation: 'allied' as const,
      tleLine1: '1 90001U 24001A   26019.50000000  .00000000  00000-0  00000-0 0    05',
      tleLine2: '2 90001  45.0000  90.0000 0001000   0.0000  0.0000 15.50000000    02',
      maneuvers: [
        {
          time: 2160, // 36 minutes - evasive burn after cyber attack
          type: 'evasive_burn' as const,
          deltaV: { radial: 0, tangential: 2.3, normal: 0 },
          duration: 480, // 8 minutes
        },
        {
          time: 3600, // 1 hour - avoidance burn for collision threat
          type: 'avoidance_burn' as const,
          deltaV: { radial: 0.5, tangential: 0, normal: 1.2 },
          duration: 240, // 4 minutes
        },
      ],
    },
    {
      id: 'comsat-2',
      name: 'ComSat-2',
      type: 'comms' as const,
      initialPosition: Cesium.Cartesian3.fromDegrees(16.0, 32.0, 380000),
      status: 'online' as const,
      fuelPercent: 100,
      affiliation: 'hostile' as const,
      tleLine1: '1 90002U 24002A   26019.50000000  .00000000  00000-0  00000-0 0    05',
      tleLine2: '2 90002  35.0000 100.0000 0000500   0.0000 180.0000 16.00000000    02',
      maneuvers: [],
    },
    {
      id: 'debris-alpha',
      name: 'Debris-Alpha',
      type: 'debris' as const,
      initialPosition: Cesium.Cartesian3.fromDegrees(20.0, 35.0, 380000),
      status: 'online' as const,
      fuelPercent: 100,
      affiliation: 'hostile' as const,
      tleLine1: '1 90003U 24003A   26019.50000000  .00000000  00000-0  00000-0 0    05',
      tleLine2: '2 90003  50.0000 120.0000 0002000   0.0000  90.0000 15.80000000    02',
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
      status: 'moving' as const,
      movements: [
        { time: 0, position: Cesium.Cartesian3.fromDegrees(14.32, 31.84, 0), heading: 0, speed: 0 }, // Waiting at location
        { time: 10080, position: Cesium.Cartesian3.fromDegrees(14.32, 31.84, 50), heading: 225, speed: 0 }, // Board helicopter (lifted up)
        { time: 12960, position: Cesium.Cartesian3.fromDegrees(14.0, 31.6, 100), heading: 225, speed: 50 }, // Flying back with helicopter
        { time: 14400, position: Cesium.Cartesian3.fromDegrees(14.0, 31.6, 50), heading: 225, speed: 0 }, // Landed at HMS Defender
      ],
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
        { time: 5760, position: Cesium.Cartesian3.fromDegrees(14.0, 31.6, 100), heading: 45, speed: 50 }, // Launch at 1h 36m
        { time: 8640, position: Cesium.Cartesian3.fromDegrees(14.32, 31.84, 50), heading: 45, speed: 0 }, // Landing at 2h 24m
        { time: 10080, position: Cesium.Cartesian3.fromDegrees(14.32, 31.84, 50), heading: 225, speed: 50 }, // Takeoff at 2h 48m
        { time: 12960, position: Cesium.Cartesian3.fromDegrees(14.0, 31.6, 100), heading: 225, speed: 50 }, // Return at 3h 36m
        { time: 14400, position: Cesium.Cartesian3.fromDegrees(14.0, 31.6, 50), heading: 225, speed: 0 }, // Landed at 4h
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
        { time: 8640, position: Cesium.Cartesian3.fromDegrees(14.33, 31.83, 0), heading: 90, speed: 5 }, // 2h 24m
        { time: 9360, position: Cesium.Cartesian3.fromDegrees(14.33, 31.83, 0), heading: 0, speed: 0 }, // Eliminated at 2h 36m
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
  
  // Scripted events - CINEMATIC Search and Rescue scenario
  events: [
    {
      time: 0,
      type: 'mission_start',
      description: 'Operation Guardian Angel initiated - SAR mission to locate and extract isolated team',
      cameraAction: { mode: 'theater', duration: 5 },
    },
    {
      time: 1440, // 24 minutes - CYBER ATTACK
      type: 'cyber_attack',
      targetId: 'reconsat-1',
      description: 'Enemy ground station attempting to jam ReconSat-1 communications',
      cameraAction: { mode: 'theater', duration: 15 },
    },
    {
      time: 2160, // 36 minutes - EVASIVE BURN STARTS
      type: 'maneuver_start',
      targetId: 'reconsat-1',
      description: 'ReconSat-1 initiating evasive orbital burn - Delta-V: 2.3 m/s',
      cameraAction: { mode: 'maneuver_track', targetId: 'reconsat-1', duration: 12 },
    },
    {
      time: 2880, // 48 minutes - DEBRIS APPEARS
      type: 'debris_contact',
      targetId: 'debris-alpha',
      description: 'Debris detected on intercept trajectory - Collision threat imminent',
      cameraAction: { mode: 'threat_wide', duration: 15 },
    },
    {
      time: 3600, // 1 hour - AVOIDANCE MANEUVER
      type: 'collision_avoidance',
      targetId: 'reconsat-1',
      description: 'Executing avoidance maneuver - Increasing separation from hostile contact',
      cameraAction: { mode: 'maneuver_track', targetId: 'reconsat-1', duration: 10 },
    },
    {
      time: 7200, // 2 hours - GROUND OPS TRANSITION
      type: 'ground_ops_start',
      description: 'Helicopter launched for extraction - Transitioning to ground operations',
      cameraAction: { mode: 'transition_to_ground', targetId: 'seahawk-1', duration: 12 },
    },
    {
      time: 7920, // 2h 12m - TARGET LOCATION
      type: 'target_location',
      targetId: 'phantom-6',
      description: 'Visual contact established with Phantom-6 team - Proceeding to extraction',
      cameraAction: { mode: 'ground', targetId: 'phantom-6', duration: 15 },
    },
    {
      time: 10080, // 2h 48m - EXTRACTION
      type: 'extraction',
      targetId: 'phantom-6',
      description: 'Team boarding helicopter - Extraction in progress',
      cameraAction: { mode: 'ground', targetId: 'phantom-6', duration: 10 },
    },
    {
      time: 14400, // 4h - MISSION COMPLETE
      type: 'mission_complete',
      description: 'Operation Guardian Angel complete - All personnel recovered safely',
      cameraAction: { mode: 'theater', duration: 5 },
    },
  ] as SimulationEvent[],
  
  // Camera sequence - CINEMATIC
  // Fixed orbital view over theater, smooth tracking during action
  cameraSequence: [
    { time: 0, mode: 'theater' as const, duration: 2160 }, // 0-36m: Fixed theater view, slight satellite drift
    { time: 2160, mode: 'maneuver_track' as const, targetId: 'reconsat-1', duration: 720 }, // 36m-48m: Track evasive burn
    { time: 2880, mode: 'threat_wide' as const, duration: 720 }, // 48m-1h: Wide shot showing hostile approach
    { time: 3600, mode: 'maneuver_track' as const, targetId: 'reconsat-1', duration: 3600 }, // 1h-2h: Track avoidance burn
    { time: 7200, mode: 'transition_to_ground' as const, targetId: 'seahawk-1', duration: 720 }, // 2h-2h12m: Fly down transition
    { time: 7920, mode: 'ground' as const, targetId: 'seahawk-1', duration: 6480 }, // 2h12m-4h: Ground operations
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
