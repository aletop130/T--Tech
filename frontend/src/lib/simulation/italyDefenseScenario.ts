import * as Cesium from 'cesium';
import type { SimulatedSatelliteData, GroundUnitData, SimulationEvent } from './scenarioData';

// ── Italy Missile Defense Scenario ──────────────────────────────────────────
// Duration: 900 seconds (15 min sim time) at 15x speed = 60 seconds real-time
// Phase: Iranian ballistic missile attack on Italy with NATO/Italian defense

// ── Types ───────────────────────────────────────────────────────────────────

export interface DefenseBase {
  id: string;
  name: string;
  position: { lon: number; lat: number };
  operator: string;
  defenseRadius: number;       // meters - coverage dome radius
  interceptRange: number;      // meters - max intercept engagement range
  interceptSpeed: number;      // m/s - interceptor missile speed
  interceptProbability: number; // base probability 0-1
  defenseAssets: string;
  groundUnits: GroundUnitData[];
}

export interface MissileData {
  id: string;
  name: string;
  type: string;
  origin: { lon: number; lat: number };
  target: { lon: number; lat: number };
  targetBaseId: string;
  launchTime: number;   // seconds from sim start
  flightDuration: number; // seconds
  apogeeAlt: number;    // meters
  warhead: string;
}

export interface MissileState {
  id: string;
  data: MissileData;
  status: 'waiting' | 'inflight' | 'intercepted' | 'impact';
  progress: number;          // 0-1 along trajectory
  currentPosition: Cesium.Cartesian3 | null;
  trajectoryPoints: Cesium.Cartesian3[];
  interceptTime?: number;
}

export interface InterceptorState {
  id: string;
  baseId: string;
  targetMissileId: string;
  launchTime: number;
  interceptTime: number;     // predicted contact time
  startPosition: Cesium.Cartesian3;
  interceptPosition: Cesium.Cartesian3;
  status: 'inflight' | 'hit' | 'miss';
  progress: number;
}

export interface DefenseBaseState {
  id: string;
  base: DefenseBase;
  status: 'ready' | 'engaged' | 'firing' | 'damaged';
  activeInterceptors: number;
  engagedMissiles: string[];
}

export interface SatelliteDefenseData extends SimulatedSatelliteData {
  coverageConeAngle: number; // radians half-angle
  orbitType: 'GEO' | 'LEO' | 'MEO';
  disruptionWindow?: { start: number; end: number };
  role: string;
}

export interface DefenseScore {
  launched: number;
  intercepted: number;
  missed: number;
  basesHit: number;
  asatLaunched: number;
  asatIntercepted: number;
  asatHit: number;
  satellitesDestroyed: number;
  ewAttacksCountered: number;
  cyberAttacksDetected: number;
}

// ── ASAT Kinetic Kill Vehicles ────────────────────────────────────────────

export interface ASATMissileData {
  id: string;
  name: string;
  origin: { lon: number; lat: number };
  targetSatelliteId: string;
  launchTime: number;
  flightDuration: number;
  apogeeAlt: number;
  interceptProbability: number;
}

export interface ASATMissileState {
  id: string;
  data: ASATMissileData;
  status: 'waiting' | 'inflight' | 'intercepted' | 'hit_satellite' | 'evaded';
  progress: number;
  currentPosition: Cesium.Cartesian3 | null;
  trajectoryPoints: Cesium.Cartesian3[];
}

// ── Co-Orbital Hostile Satellites ─────────────────────────────────────────

export interface HostileSatelliteData {
  id: string;
  name: string;
  type: 'inspector' | 'killer';
  initialPosition: { lon: number; lat: number; alt: number };
  targetSatelliteId: string;
  activationTime: number;
  approachDuration: number;
  dangerRadius: number;
  orbitType: 'LEO' | 'MEO' | 'GEO';
}

export interface HostileSatelliteState {
  id: string;
  data: HostileSatelliteData;
  status: 'dormant' | 'maneuvering' | 'proximate' | 'neutralized' | 'evaded';
  currentPosition: Cesium.Cartesian3;
  distanceToTarget: number;
  detectedAt: number | null;
}

// ── Electronic Warfare Events ─────────────────────────────────────────────

export interface EWAttackEvent {
  id: string;
  targetSatelliteId: string;
  type: 'jamming' | 'spoofing' | 'dazzling';
  startTime: number;
  endTime: number;
  degradationCurve: { time: number; effectiveness: number }[];
  countermeasureDelay: number;
}

// ── Cyber Attack Events ───────────────────────────────────────────────────

export interface CyberAttackEvent {
  id: string;
  targetSatelliteId: string;
  type: 'command_link_intrusion' | 'data_exfiltration';
  startTime: number;
  duration: number;
  detectionDelay: number;
  restorationDelay: number;
  description: string;
}

// ── Extended Satellite State ──────────────────────────────────────────────

export type SatelliteThreatStatus = 'nominal' | 'ew_degraded' | 'cyber_compromised' | 'destroyed' | 'evading';

export interface SatelliteDefenseState extends SatelliteDefenseData {
  currentPosition: Cesium.Cartesian3;
  effectivenessMultiplier: number; // 0-1
  threatStatus: SatelliteThreatStatus;
  activeThreats: string[];
  isDestroyed: boolean;
}

// ── Scenario Timeline Phases ────────────────────────────────────────────────

export type SimPhase =
  | 'ALERT'
  | 'EARLY_WARNING'
  | 'LAUNCH'
  | 'DISRUPTION'
  | 'ENGAGEMENT'
  | 'BATTLE'
  | 'BDA';

export function getPhaseForTime(t: number): SimPhase {
  if (t < 60)  return 'ALERT';
  if (t < 120) return 'EARLY_WARNING';
  if (t < 180) return 'LAUNCH';
  if (t < 240) return 'DISRUPTION';
  if (t < 300) return 'ENGAGEMENT';
  if (t < 780) return 'BATTLE';
  return 'BDA';
}

export const PHASE_LABELS: Record<SimPhase, string> = {
  ALERT: 'DEFENSE ALERT',
  EARLY_WARNING: 'EARLY WARNING',
  LAUNCH: 'MISSILE LAUNCH',
  DISRUPTION: 'MULTI-DOMAIN DISRUPTION',
  ENGAGEMENT: 'DEFENSE ENGAGEMENT',
  BATTLE: 'ACTIVE DEFENSE',
  BDA: 'BATTLE DAMAGE ASSESSMENT',
};

// ── 8 Real NATO / Italian Bases ─────────────────────────────────────────────

export const DEFENSE_BASES: DefenseBase[] = [
  {
    id: 'aviano',
    name: 'Aviano AB',
    position: { lon: 12.60, lat: 46.03 },
    operator: 'USAF',
    defenseRadius: 180000,
    interceptRange: 160000,
    interceptSpeed: 2800,
    interceptProbability: 0.88,
    defenseAssets: 'F-16, Patriot PAC-3',
    groundUnits: [
      { id: 'aviano-radar', name: 'Aviano AN/MPQ-65', sidc: 'SFGPI-----*****', initialPosition: Cesium.Cartesian3.fromDegrees(12.60, 46.03, 0), affiliation: 'friendly', status: 'static' },
      { id: 'aviano-sam', name: 'Patriot Battery Alpha', sidc: 'SFGPUCDSM-*****', initialPosition: Cesium.Cartesian3.fromDegrees(12.58, 46.02, 0), affiliation: 'friendly', status: 'static' },
    ],
  },
  {
    id: 'gioia',
    name: 'Gioia del Colle',
    position: { lon: 16.93, lat: 40.77 },
    operator: 'Italian AF',
    defenseRadius: 160000,
    interceptRange: 140000,
    interceptSpeed: 2600,
    interceptProbability: 0.82,
    defenseAssets: 'Eurofighter, SAMP/T',
    groundUnits: [
      { id: 'gioia-radar', name: 'Gioia SAMP/T Radar', sidc: 'SFGPI-----*****', initialPosition: Cesium.Cartesian3.fromDegrees(16.93, 40.77, 0), affiliation: 'friendly', status: 'static' },
      { id: 'gioia-sam', name: 'SAMP/T Battery', sidc: 'SFGPUCDSM-*****', initialPosition: Cesium.Cartesian3.fromDegrees(16.91, 40.76, 0), affiliation: 'friendly', status: 'static' },
    ],
  },
  {
    id: 'sigonella',
    name: 'NAS Sigonella',
    position: { lon: 14.92, lat: 37.40 },
    operator: 'US Navy',
    defenseRadius: 150000,
    interceptRange: 130000,
    interceptSpeed: 2500,
    interceptProbability: 0.80,
    defenseAssets: 'P-8A, radar',
    groundUnits: [
      { id: 'sigonella-radar', name: 'Sigonella SPY-1', sidc: 'SFGPI-----*****', initialPosition: Cesium.Cartesian3.fromDegrees(14.92, 37.40, 0), affiliation: 'friendly', status: 'static' },
      { id: 'sigonella-cmd', name: 'Sigonella Command', sidc: 'SFGPI-----*****', initialPosition: Cesium.Cartesian3.fromDegrees(14.94, 37.41, 0), affiliation: 'friendly', status: 'static' },
    ],
  },
  {
    id: 'amendola',
    name: 'Amendola AB',
    position: { lon: 15.72, lat: 41.54 },
    operator: 'Italian AF',
    defenseRadius: 140000,
    interceptRange: 120000,
    interceptSpeed: 2600,
    interceptProbability: 0.85,
    defenseAssets: 'F-35A',
    groundUnits: [
      { id: 'amendola-radar', name: 'Amendola Radar', sidc: 'SFGPI-----*****', initialPosition: Cesium.Cartesian3.fromDegrees(15.72, 41.54, 0), affiliation: 'friendly', status: 'static' },
    ],
  },
  {
    id: 'decimomannu',
    name: 'Decimomannu AB',
    position: { lon: 8.97, lat: 39.35 },
    operator: 'NATO',
    defenseRadius: 160000,
    interceptRange: 140000,
    interceptSpeed: 2600,
    interceptProbability: 0.80,
    defenseAssets: 'Training, SAMP/T',
    groundUnits: [
      { id: 'decimo-sam', name: 'SAMP/T Battery Bravo', sidc: 'SFGPUCDSM-*****', initialPosition: Cesium.Cartesian3.fromDegrees(8.97, 39.35, 0), affiliation: 'friendly', status: 'static' },
    ],
  },
  {
    id: 'pratica',
    name: 'Pratica di Mare',
    position: { lon: 12.45, lat: 41.65 },
    operator: 'Italian AF HQ',
    defenseRadius: 200000,
    interceptRange: 180000,
    interceptSpeed: 2800,
    interceptProbability: 0.90,
    defenseAssets: 'Command, radar',
    groundUnits: [
      { id: 'pratica-cmd', name: 'AF HQ Command', sidc: 'SFGPI-----*****', initialPosition: Cesium.Cartesian3.fromDegrees(12.45, 41.65, 0), affiliation: 'friendly', status: 'static' },
      { id: 'pratica-radar', name: 'Pratica THAAD Radar', sidc: 'SFGPI-----*****', initialPosition: Cesium.Cartesian3.fromDegrees(12.43, 41.64, 0), affiliation: 'friendly', status: 'static' },
    ],
  },
  {
    id: 'ghedi',
    name: 'Ghedi AB',
    position: { lon: 10.28, lat: 45.43 },
    operator: 'Italian AF',
    defenseRadius: 160000,
    interceptRange: 140000,
    interceptSpeed: 2600,
    interceptProbability: 0.84,
    defenseAssets: 'Tornado, nuclear-capable',
    groundUnits: [
      { id: 'ghedi-sam', name: 'Ghedi SAM Battery', sidc: 'SFGPUCDSM-*****', initialPosition: Cesium.Cartesian3.fromDegrees(10.28, 45.43, 0), affiliation: 'friendly', status: 'static' },
    ],
  },
  {
    id: 'darby',
    name: 'Camp Darby',
    position: { lon: 10.37, lat: 43.68 },
    operator: 'US Army',
    defenseRadius: 150000,
    interceptRange: 130000,
    interceptSpeed: 2800,
    interceptProbability: 0.86,
    defenseAssets: 'Logistics, Patriot',
    groundUnits: [
      { id: 'darby-patriot', name: 'Patriot Battery Bravo', sidc: 'SFGPUCDSM-*****', initialPosition: Cesium.Cartesian3.fromDegrees(10.37, 43.68, 0), affiliation: 'friendly', status: 'static' },
    ],
  },
];

// ── Satellites ──────────────────────────────────────────────────────────────

export const DEFENSE_SATELLITES: SatelliteDefenseData[] = [
  {
    id: 'sbirs-geo-1',
    name: 'SBIRS GEO-5',
    type: 'recon' as const,
    orbitType: 'GEO',
    role: 'Early Warning IR',
    coverageConeAngle: 0.15,
    initialPosition: Cesium.Cartesian3.fromDegrees(25.0, 0.0, 35786000),
    status: 'online' as const,
    fuelPercent: 98,
    affiliation: 'allied' as const,
    tleLine1: '1 90101U 24101A   26061.50000000  .00000000  00000-0  00000-0 0    05',
    tleLine2: '2 90101   0.0500  25.0000 0001000   0.0000   0.0000  1.00274000    02',
    maneuvers: [],
  },
  {
    id: 'sbirs-geo-2',
    name: 'SBIRS GEO-6',
    type: 'recon' as const,
    orbitType: 'GEO',
    role: 'Early Warning IR',
    coverageConeAngle: 0.15,
    initialPosition: Cesium.Cartesian3.fromDegrees(42.0, 0.0, 35786000),
    status: 'online' as const,
    fuelPercent: 96,
    affiliation: 'allied' as const,
    tleLine1: '1 90102U 24102A   26061.50000000  .00000000  00000-0  00000-0 0    05',
    tleLine2: '2 90102   0.0500  42.0000 0001000   0.0000   0.0000  1.00274000    02',
    maneuvers: [],
  },
  {
    id: 'milstar-3',
    name: 'MILSTAR-3',
    type: 'comms' as const,
    orbitType: 'GEO',
    role: 'Secure Comms Relay',
    coverageConeAngle: 0.12,
    initialPosition: Cesium.Cartesian3.fromDegrees(15.0, 0.0, 35786000),
    status: 'online' as const,
    fuelPercent: 94,
    affiliation: 'allied' as const,
    tleLine1: '1 90103U 24103A   26061.50000000  .00000000  00000-0  00000-0 0    05',
    tleLine2: '2 90103   0.0500  15.0000 0001000   0.0000   0.0000  1.00274000    02',
    maneuvers: [],
    disruptionWindow: { start: 180, end: 420 },
  },
  {
    id: 'leo-recon-1',
    name: 'NROL-44 Recon',
    type: 'recon' as const,
    orbitType: 'LEO',
    role: 'Tactical Imaging',
    coverageConeAngle: 0.35,
    initialPosition: Cesium.Cartesian3.fromDegrees(12.0, 38.0, 500000),
    status: 'online' as const,
    fuelPercent: 91,
    affiliation: 'allied' as const,
    tleLine1: '1 90104U 24104A   26061.50000000  .00000000  00000-0  50000-4 0    05',
    tleLine2: '2 90104  51.6000  80.0000 0005000  90.0000 270.0000 15.50000000    02',
    maneuvers: [],
  },
  {
    id: 'leo-recon-2',
    name: 'Cosmo-SkyMed 4',
    type: 'recon' as const,
    orbitType: 'LEO',
    role: 'SAR Imaging',
    coverageConeAngle: 0.30,
    initialPosition: Cesium.Cartesian3.fromDegrees(20.0, 42.0, 620000),
    status: 'online' as const,
    fuelPercent: 88,
    affiliation: 'allied' as const,
    tleLine1: '1 90105U 24105A   26061.50000000  .00000000  00000-0  50000-4 0    05',
    tleLine2: '2 90105  97.8000 120.0000 0002000  45.0000 315.0000 14.80000000    02',
    maneuvers: [],
  },
  {
    id: 'meo-nav-1',
    name: 'Galileo-FOC 24',
    type: 'comms' as const,
    orbitType: 'MEO',
    role: 'PNT / Navigation',
    coverageConeAngle: 0.22,
    initialPosition: Cesium.Cartesian3.fromDegrees(10.0, 30.0, 23222000),
    status: 'online' as const,
    fuelPercent: 95,
    affiliation: 'allied' as const,
    tleLine1: '1 90106U 24106A   26061.50000000  .00000000  00000-0  00000-0 0    05',
    tleLine2: '2 90106  56.0000  50.0000 0001000   0.0000   0.0000  1.70000000    02',
    maneuvers: [],
  },
];

// ── Incoming Missiles ───────────────────────────────────────────────────────

const IRAN_LAUNCH_REGION = { lon: 51.4, lat: 35.7 }; // Tehran area
const ISFAHAN_REGION = { lon: 51.7, lat: 32.7 };

export const INCOMING_MISSILES: MissileData[] = [
  {
    id: 'shahab-1',
    name: 'Shahab-3 Alpha',
    type: 'Shahab-3',
    origin: IRAN_LAUNCH_REGION,
    target: { lon: 12.45, lat: 41.65 },
    targetBaseId: 'pratica',
    launchTime: 120,
    flightDuration: 540,
    apogeeAlt: 350000,
    warhead: 'HE-Frag',
  },
  {
    id: 'shahab-2',
    name: 'Shahab-3 Bravo',
    type: 'Shahab-3',
    origin: { lon: 51.0, lat: 35.5 },
    target: { lon: 14.92, lat: 37.40 },
    targetBaseId: 'sigonella',
    launchTime: 150,
    flightDuration: 520,
    apogeeAlt: 340000,
    warhead: 'HE-Frag',
  },
  {
    id: 'shahab-3',
    name: 'Emad-1',
    type: 'Emad',
    origin: ISFAHAN_REGION,
    target: { lon: 12.60, lat: 46.03 },
    targetBaseId: 'aviano',
    launchTime: 200,
    flightDuration: 580,
    apogeeAlt: 370000,
    warhead: 'HE-Frag',
  },
  {
    id: 'shahab-4',
    name: 'Shahab-3 Charlie',
    type: 'Shahab-3',
    origin: IRAN_LAUNCH_REGION,
    target: { lon: 16.93, lat: 40.77 },
    targetBaseId: 'gioia',
    launchTime: 260,
    flightDuration: 530,
    apogeeAlt: 345000,
    warhead: 'HE-Frag',
  },
  {
    id: 'shahab-5',
    name: 'Emad-2',
    type: 'Emad',
    origin: { lon: 52.0, lat: 33.0 },
    target: { lon: 15.72, lat: 41.54 },
    targetBaseId: 'amendola',
    launchTime: 320,
    flightDuration: 540,
    apogeeAlt: 355000,
    warhead: 'HE-Frag',
  },
  {
    id: 'shahab-6',
    name: 'Shahab-3 Delta',
    type: 'Shahab-3',
    origin: IRAN_LAUNCH_REGION,
    target: { lon: 10.28, lat: 45.43 },
    targetBaseId: 'ghedi',
    launchTime: 380,
    flightDuration: 570,
    apogeeAlt: 360000,
    warhead: 'HE-Frag',
  },
  {
    id: 'shahab-7',
    name: 'Khorramshahr',
    type: 'Khorramshahr',
    origin: { lon: 51.5, lat: 34.0 },
    target: { lon: 10.37, lat: 43.68 },
    targetBaseId: 'darby',
    launchTime: 440,
    flightDuration: 560,
    apogeeAlt: 365000,
    warhead: 'HE-Frag',
  },
  {
    id: 'shahab-8',
    name: 'Shahab-3 Echo',
    type: 'Shahab-3',
    origin: ISFAHAN_REGION,
    target: { lon: 8.97, lat: 39.35 },
    targetBaseId: 'decimomannu',
    launchTime: 500,
    flightDuration: 550,
    apogeeAlt: 350000,
    warhead: 'HE-Frag',
  },
];

// ── ASAT Missiles ─────────────────────────────────────────────────────────

const ISFAHAN_ASAT_REGION = { lon: 51.7, lat: 32.7 };

export const ASAT_MISSILES: ASATMissileData[] = [
  {
    id: 'asat-1',
    name: 'Noor ASAT-1',
    origin: ISFAHAN_ASAT_REGION,
    targetSatelliteId: 'leo-recon-1', // NROL-44 (LEO 500km)
    launchTime: 140,
    flightDuration: 420,
    apogeeAlt: 550000,
    interceptProbability: 0.55,
  },
  {
    id: 'asat-2',
    name: 'Noor ASAT-2',
    origin: { lon: 52.0, lat: 33.0 },
    targetSatelliteId: 'leo-recon-2', // Cosmo-SkyMed 4 (LEO 620km)
    launchTime: 170,
    flightDuration: 450,
    apogeeAlt: 680000,
    interceptProbability: 0.50,
  },
  {
    id: 'asat-3',
    name: 'Noor ASAT-3',
    origin: ISFAHAN_ASAT_REGION,
    targetSatelliteId: 'meo-nav-1', // Galileo (MEO)
    launchTime: 250,
    flightDuration: 600,
    apogeeAlt: 900000,
    interceptProbability: 0.35,
  },
];

// ── Hostile Co-Orbital Satellites ─────────────────────────────────────────

export const HOSTILE_SATELLITES: HostileSatelliteData[] = [
  {
    id: 'cosmos-2558',
    name: 'Cosmos-2558',
    type: 'inspector',
    initialPosition: { lon: 18.0, lat: 40.0, alt: 520000 },
    targetSatelliteId: 'leo-recon-1', // NROL-44
    activationTime: 80,
    approachDuration: 360, // 6 min
    dangerRadius: 50000,
    orbitType: 'LEO',
  },
  {
    id: 'shijian-21',
    name: 'Shijian-21',
    type: 'killer',
    initialPosition: { lon: 10.0, lat: -2.0, alt: 35786000 },
    targetSatelliteId: 'milstar-3', // MILSTAR-3
    activationTime: 100,
    approachDuration: 480, // 8 min
    dangerRadius: 80000,
    orbitType: 'GEO',
  },
  {
    id: 'kosmos-2542',
    name: 'Kosmos-2542',
    type: 'inspector',
    initialPosition: { lon: 25.0, lat: 44.0, alt: 640000 },
    targetSatelliteId: 'leo-recon-2', // Cosmo-SkyMed 4
    activationTime: 120,
    approachDuration: 300, // 5 min
    dangerRadius: 50000,
    orbitType: 'LEO',
  },
];

// ── Electronic Warfare Attacks ────────────────────────────────────────────

export const EW_ATTACKS: EWAttackEvent[] = [
  {
    id: 'ew-jam-milstar',
    targetSatelliteId: 'milstar-3',
    type: 'jamming',
    startTime: 180,
    endTime: 420,
    degradationCurve: [
      { time: 180, effectiveness: 1.0 },
      { time: 210, effectiveness: 0.7 },
      { time: 260, effectiveness: 0.45 },
      { time: 320, effectiveness: 0.30 },
      { time: 380, effectiveness: 0.35 },
      { time: 420, effectiveness: 0.70 },
    ],
    countermeasureDelay: 60,
  },
  {
    id: 'ew-spoof-galileo',
    targetSatelliteId: 'meo-nav-1',
    type: 'spoofing',
    startTime: 240,
    endTime: 500,
    degradationCurve: [
      { time: 240, effectiveness: 1.0 },
      { time: 280, effectiveness: 0.75 },
      { time: 340, effectiveness: 0.50 },
      { time: 400, effectiveness: 0.40 },
      { time: 460, effectiveness: 0.55 },
      { time: 500, effectiveness: 0.80 },
    ],
    countermeasureDelay: 45,
  },
  {
    id: 'ew-dazzle-sbirs',
    targetSatelliteId: 'sbirs-geo-1',
    type: 'dazzling',
    startTime: 320,
    endTime: 480,
    degradationCurve: [
      { time: 320, effectiveness: 1.0 },
      { time: 350, effectiveness: 0.75 },
      { time: 380, effectiveness: 0.60 },
      { time: 420, effectiveness: 0.65 },
      { time: 450, effectiveness: 0.80 },
      { time: 480, effectiveness: 0.95 },
    ],
    countermeasureDelay: 30,
  },
];

// ── Cyber Attacks ─────────────────────────────────────────────────────────

export const CYBER_ATTACKS: CyberAttackEvent[] = [
  {
    id: 'cyber-nrol44',
    targetSatelliteId: 'leo-recon-1',
    type: 'command_link_intrusion',
    startTime: 220,
    duration: 90,
    detectionDelay: 20,
    restorationDelay: 30,
    description: 'Command link intrusion attempt on NROL-44 uplink channel',
  },
  {
    id: 'cyber-milstar',
    targetSatelliteId: 'milstar-3',
    type: 'data_exfiltration',
    startTime: 280,
    duration: 120,
    detectionDelay: 30,
    restorationDelay: 40,
    description: 'Data exfiltration attempt on MILSTAR-3 encrypted comms relay',
  },
];

// ── Trajectory Mathematics ──────────────────────────────────────────────────

// Spherical linear interpolation for great-circle ground track
function slerp(
  lonA: number, latA: number,
  lonB: number, latB: number,
  t: number
): { lon: number; lat: number } {
  const toRad = Math.PI / 180;
  const toDeg = 180 / Math.PI;

  const lat1 = latA * toRad;
  const lon1 = lonA * toRad;
  const lat2 = latB * toRad;
  const lon2 = lonB * toRad;

  const d = Math.acos(
    Math.sin(lat1) * Math.sin(lat2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.cos(lon2 - lon1)
  );

  if (d < 1e-6) return { lon: lonA, lat: latA };

  const a = Math.sin((1 - t) * d) / Math.sin(d);
  const b = Math.sin(t * d) / Math.sin(d);

  const x = a * Math.cos(lat1) * Math.cos(lon1) + b * Math.cos(lat2) * Math.cos(lon2);
  const y = a * Math.cos(lat1) * Math.sin(lon1) + b * Math.cos(lat2) * Math.sin(lon2);
  const z = a * Math.sin(lat1) + b * Math.sin(lat2);

  return {
    lat: Math.atan2(z, Math.sqrt(x * x + y * y)) * toDeg,
    lon: Math.atan2(y, x) * toDeg,
  };
}

// Parabolic altitude profile: peak at midpoint
function parabolicAlt(t: number, apogee: number): number {
  return 4 * apogee * t * (1 - t);
}

// Pre-compute trajectory sample points for a missile
export function computeMissileTrajectory(missile: MissileData, numSamples: number = 60): Cesium.Cartesian3[] {
  const points: Cesium.Cartesian3[] = [];
  for (let i = 0; i <= numSamples; i++) {
    const t = i / numSamples;
    const ground = slerp(
      missile.origin.lon, missile.origin.lat,
      missile.target.lon, missile.target.lat,
      t
    );
    const alt = parabolicAlt(t, missile.apogeeAlt);
    points.push(Cesium.Cartesian3.fromDegrees(ground.lon, ground.lat, alt));
  }
  return points;
}

// Get position along pre-computed trajectory at progress t (0-1)
export function getMissilePosition(trajectory: Cesium.Cartesian3[], progress: number): Cesium.Cartesian3 {
  const clampedT = Math.max(0, Math.min(1, progress));
  const index = clampedT * (trajectory.length - 1);
  const lower = Math.floor(index);
  const upper = Math.min(lower + 1, trajectory.length - 1);
  const frac = index - lower;
  return Cesium.Cartesian3.lerp(trajectory[lower], trajectory[upper], frac, new Cesium.Cartesian3());
}

// ── ASAT Trajectory Mathematics ─────────────────────────────────────────

// ASAT trajectory: ground track follows slerp but altitude rises monotonically
// to satellite orbit altitude using sin(t * PI/2) profile (not parabolic)
export function computeASATTrajectory(
  asat: ASATMissileData,
  targetPosition: Cesium.Cartesian3,
  numSamples: number = 60
): Cesium.Cartesian3[] {
  const targetCarto = Cesium.Cartographic.fromCartesian(targetPosition);
  const targetLon = Cesium.Math.toDegrees(targetCarto.longitude);
  const targetLat = Cesium.Math.toDegrees(targetCarto.latitude);
  const targetAlt = targetCarto.height;

  const points: Cesium.Cartesian3[] = [];
  for (let i = 0; i <= numSamples; i++) {
    const t = i / numSamples;
    const ground = slerp(
      asat.origin.lon, asat.origin.lat,
      targetLon, targetLat,
      t
    );
    // Monotonically rising altitude profile: sin(t * PI/2) goes 0 → 1
    const alt = targetAlt * Math.sin(t * Math.PI / 2);
    points.push(Cesium.Cartesian3.fromDegrees(ground.lon, ground.lat, alt));
  }
  return points;
}

// ── Interception Logic ──────────────────────────────────────────────────────

const REACTION_DELAY = 15; // seconds after missile enters intercept range
const INTERCEPT_CONTACT_DISTANCE = 5000; // meters

export function computeInterceptPoint(
  missileTrajectory: Cesium.Cartesian3[],
  missileProgress: number,
  missileDuration: number,
  basePosition: Cesium.Cartesian3,
  interceptSpeed: number,
): { interceptProgress: number; interceptPosition: Cesium.Cartesian3; flightTime: number } | null {
  // Search ahead along the trajectory for an intercept point
  for (let step = 0; step < 30; step++) {
    const futureProgress = Math.min(1, missileProgress + (step + 1) * 0.02);
    const futurePos = getMissilePosition(missileTrajectory, futureProgress);
    const distance = Cesium.Cartesian3.distance(basePosition, futurePos);
    const timeToReach = distance / interceptSpeed;
    const missileTimeToReach = (futureProgress - missileProgress) * missileDuration;

    if (timeToReach <= missileTimeToReach + 5) {
      return {
        interceptProgress: futureProgress,
        interceptPosition: futurePos,
        flightTime: timeToReach,
      };
    }
  }
  return null;
}

// ── Camera Sequence ─────────────────────────────────────────────────────────

export const CAMERA_SEQUENCE = [
  { time: 0,   mode: 'italy_overview' as const,     duration: 120 },
  { time: 60,  mode: 'satellite_view' as const,     duration: 60 },
  { time: 120, mode: 'launch_origin' as const,      duration: 80 },
  { time: 200, mode: 'tracking_wide' as const,      duration: 200 },
  { time: 400, mode: 'interception_close' as const, duration: 380 },
  { time: 780, mode: 'italy_overview' as const,     duration: 120 },
];

// ── Key Events (pause points) ───────────────────────────────────────────────

export const KEY_EVENTS = [0, 60, 120, 140, 180, 300, 440, 540, 780, 900] as number[];

// ── Narrative Script ────────────────────────────────────────────────────────

export interface NarrativeEvent {
  time: number;
  message: string;
  priority: 'info' | 'warning' | 'success' | 'critical';
  speaker: string;
  icon?: string;
}

export const NARRATIVE_SCRIPT: NarrativeEvent[] = [
  {
    time: 0,
    message: 'Operation Scudo d\'Italia initiated. NATO integrated air defense network activating across 8 Italian military installations. All defense systems coming online.',
    priority: 'info',
    speaker: 'Mission Control',
    icon: 'shield',
  },
  {
    time: 60,
    message: 'SBIRS GEO-5 detecting infrared bloom signature from Iranian plateau. Multiple launch plumes confirmed. Classification: Shahab-3 class ballistic missiles. Tracking initiated.',
    priority: 'warning',
    speaker: 'SBIRS Detection AI',
    icon: 'eye-open',
  },
  {
    time: 80,
    message: 'SPACE SURVEILLANCE ALERT: Cosmos-2558 (Russian inspector satellite) initiating unauthorized orbital maneuver toward NROL-44. Trajectory analysis indicates close approach within 50km. Classifying as potential co-orbital threat.',
    priority: 'warning',
    speaker: 'Space Surveillance AI',
    icon: 'eye-open',
  },
  {
    time: 100,
    message: 'SECOND CO-ORBITAL THREAT: Shijian-21 (Chinese killer satellite) detected maneuvering in GEO belt toward MILSTAR-3 comms relay. Approach vector consistent with rendezvous-proximity operations. Space defense protocols activated.',
    priority: 'warning',
    speaker: 'Space Surveillance AI',
    icon: 'satellite',
  },
  {
    time: 120,
    message: 'CONFIRMED: First missile launch detected. Shahab-3 Alpha on ballistic trajectory toward Italian peninsula. Kosmos-2542 also maneuvering toward Cosmo-SkyMed 4. Multi-domain attack in progress.',
    priority: 'critical',
    speaker: 'Threat Assessment AI',
    icon: 'warning-sign',
  },
  {
    time: 140,
    message: 'ASAT LAUNCH DETECTED! Noor ASAT-1 rising from Isfahan region on direct-ascent trajectory toward NROL-44 at 500km orbit. Space Defense Command tracking. This is a kinetic kill vehicle - first use in theater.',
    priority: 'critical',
    speaker: 'Space Defense AI',
    icon: 'arrow-top-right',
  },
  {
    time: 150,
    message: 'Second ballistic missile launch confirmed - Shahab-3 Bravo targeting Sigonella. Simultaneously tracking ASAT-1 ascent. Multi-layer attack coordinating ground and space strikes.',
    priority: 'critical',
    speaker: 'Threat Assessment AI',
    icon: 'warning-sign',
  },
  {
    time: 170,
    message: 'SECOND ASAT LAUNCH: Noor ASAT-2 detected rising from eastern Iran, targeting Cosmo-SkyMed 4 SAR imaging satellite at 620km. Enemy attempting to blind our reconnaissance capability.',
    priority: 'critical',
    speaker: 'Space Defense AI',
    icon: 'arrow-top-right',
  },
  {
    time: 180,
    message: 'ELECTRONIC WARFARE: MILSTAR-3 comms relay under heavy jamming attack. Signal-to-noise ratio dropping rapidly. Secure comms relay degrading - switching defense coordination to backup frequency.',
    priority: 'warning',
    speaker: 'EW Defense AI',
    icon: 'offline',
  },
  {
    time: 220,
    message: 'CYBER INTRUSION DETECTED: Unauthorized access attempt on NROL-44 command uplink channel. Cyber defense AI isolating compromised link. Satellite switching to autonomous mode pending verification.',
    priority: 'warning',
    speaker: 'Cyber Defense AI',
    icon: 'lock',
  },
  {
    time: 240,
    message: 'GPS SPOOFING ATTACK: Galileo FOC-24 navigation signal being spoofed. False position data injected into PNT stream. Precision-guided munitions switching to inertial backup. Navigation accuracy degrading.',
    priority: 'warning',
    speaker: 'EW Defense AI',
    icon: 'locate',
  },
  {
    time: 250,
    message: 'THIRD ASAT LAUNCH: Noor ASAT-3 targeting Galileo navigation satellite at MEO. Enemy conducting full-spectrum anti-satellite campaign. Space defense modifier dropping below 70%.',
    priority: 'critical',
    speaker: 'Space Defense AI',
    icon: 'arrow-top-right',
  },
  {
    time: 260,
    message: 'Tracking 4 ballistic missiles, 3 ASAT threats, 3 co-orbital hostile satellites simultaneously. Defense coordination degraded by MILSTAR jamming. Ground interceptor accuracy reduced.',
    priority: 'info',
    speaker: 'Defense Coordination AI',
    icon: 'locate',
  },
  {
    time: 280,
    message: 'CYBER ATTACK: Data exfiltration attempt detected on MILSTAR-3 encrypted relay. Dual-layer attack - electronic jamming combined with cyber intrusion. Activating hardened backup protocols.',
    priority: 'warning',
    speaker: 'Cyber Defense AI',
    icon: 'lock',
  },
  {
    time: 320,
    message: 'IR DAZZLING: SBIRS GEO-5 early warning sensor under laser dazzling attack. Infrared detection capability temporarily degraded. Switching to secondary sensor array - hardened optics engaging.',
    priority: 'warning',
    speaker: 'EW Defense AI',
    icon: 'flash',
  },
  {
    time: 340,
    message: 'First ground interceptor away! Pratica di Mare engaging Shahab-3 Alpha. Defense effectiveness reduced to 72% due to satellite degradation. SAMP/T compensating with local radar.',
    priority: 'success',
    speaker: 'Mission Control',
    icon: 'arrow-top-right',
  },
  {
    time: 380,
    message: 'SPACE INTERCEPT: NROL-44 executing emergency evasive maneuver - ASAT-1 passing within 2km but MISS CONFIRMED. Space debris field generated. Satellite maintaining orbit.',
    priority: 'success',
    speaker: 'Space Defense AI',
    icon: 'tick-circle',
  },
  {
    time: 400,
    message: 'Ground intercept confirmed! Shahab-3 Alpha destroyed at 85km altitude. EW countermeasures partially restoring MILSTAR-3 - jamming effectiveness decreasing.',
    priority: 'success',
    speaker: 'Defense Coordination AI',
    icon: 'tick-circle',
  },
  {
    time: 440,
    message: 'PROXIMITY ALERT: Cosmos-2558 within 30km of NROL-44. Shijian-21 closing on MILSTAR-3. Multiple co-orbital threats at danger range. Space defense at critical threshold.',
    priority: 'critical',
    speaker: 'Space Surveillance AI',
    icon: 'warning-sign',
  },
  {
    time: 500,
    message: 'ASAT-2 trajectory diverging - Cosmo-SkyMed 4 evasive burn successful. Cyber intrusion on NROL-44 contained and purged. Satellite command links re-secured.',
    priority: 'success',
    speaker: 'Space Defense AI',
    icon: 'tick-circle',
  },
  {
    time: 550,
    message: 'Co-orbital threats being resolved: Cosmos-2558 fuel depleted, drifting away. Shijian-21 neutralized by directed energy countermeasure. Kosmos-2542 retreating. Space domain stabilizing.',
    priority: 'success',
    speaker: 'Space Defense AI',
    icon: 'shield',
  },
  {
    time: 650,
    message: 'Ground defense reporting 6 of 8 missiles neutralized. Satellite constellation recovering - defense modifier climbing back above 80%. Two missiles in terminal phase.',
    priority: 'warning',
    speaker: 'Threat Assessment AI',
    icon: 'target',
  },
  {
    time: 700,
    message: 'ALL SPACE THREATS RESOLVED: EW jamming ceased, cyber attacks contained, ASAT threats neutralized/evaded. Satellite constellation at 90% effectiveness. Full defense capability restored.',
    priority: 'success',
    speaker: 'Space Defense AI',
    icon: 'satellite',
  },
  {
    time: 780,
    message: 'All ground and space threats neutralized. Multi-domain battle damage assessment commencing. Italian airspace and orbital environment declared secure.',
    priority: 'success',
    speaker: 'Mission Control',
    icon: 'shield',
  },
  {
    time: 900,
    message: 'Operation Scudo d\'Italia complete. Ground: 7/8 missiles intercepted. Space: 0 satellites destroyed, 3 ASAT evaded/intercepted, 3 co-orbital threats neutralized, 3 EW attacks countered, 2 cyber attacks contained. Full-spectrum defense validated.',
    priority: 'success',
    speaker: 'Mission Control',
    icon: 'tick',
  },
];

// ── Scenario Configuration ──────────────────────────────────────────────────

export const ITALY_DEFENSE_SCENARIO = {
  name: 'Operation Scudo d\'Italia',
  duration: 900,           // 15 minutes sim time
  timeAcceleration: 15,    // 15x speed -> 60 seconds real-time
  stepDuration: 60,
  keyEvents: KEY_EVENTS,
  bases: DEFENSE_BASES,
  satellites: DEFENSE_SATELLITES,
  missiles: INCOMING_MISSILES,
  asatMissiles: ASAT_MISSILES,
  hostileSatellites: HOSTILE_SATELLITES,
  ewAttacks: EW_ATTACKS,
  cyberAttacks: CYBER_ATTACKS,
  cameraSequence: CAMERA_SEQUENCE,
  narrativeScript: NARRATIVE_SCRIPT,
};

// Collect all ground units from all bases
export function getAllGroundUnits(): GroundUnitData[] {
  return DEFENSE_BASES.flatMap(base => base.groundUnits);
}
