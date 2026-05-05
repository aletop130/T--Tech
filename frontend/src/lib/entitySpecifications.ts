import type { EntitySpecEntry } from '@/lib/store/entityIntel';

// --------------- PLATFORM DATABASE ---------------
// Reference specifications for known military platforms.
// Keyed by "entityType/subtype" or just "entityType".

interface PlatformSpec {
  model: string;
  specs: EntitySpecEntry[];
}

const PLATFORM_DB: Record<string, PlatformSpec> = {
  // ── DRONES / UAV ──
  'drone/recon': {
    model: 'MQ-9 Reaper',
    specs: [
      { key: 'Model', value: 'MQ-9 Reaper (General Atomics)' },
      { key: 'Type', value: 'MALE UAV — ISR/Strike' },
      { key: 'Wingspan', value: '20', unit: 'm' },
      { key: 'Endurance', value: '27', unit: 'h' },
      { key: 'Ceiling', value: '15,240', unit: 'm (FL500)' },
      { key: 'Max Speed', value: '482', unit: 'km/h' },
      { key: 'Payload', value: '1,700', unit: 'kg' },
      { key: 'Sensors', value: 'MTS-B EO/IR, Lynx SAR, AN/DAS-1 MTS-B' },
      { key: 'Armament', value: '4× AGM-114 Hellfire, 2× GBU-12 Paveway II' },
      { key: 'Data Link', value: 'Ku-band SATCOM, C-band LOS' },
      { key: 'Range', value: '1,850', unit: 'km' },
    ],
  },
  'drone/attack': {
    model: 'MQ-1C Gray Eagle',
    specs: [
      { key: 'Model', value: 'MQ-1C Gray Eagle (General Atomics)' },
      { key: 'Type', value: 'MALE UAV — Multi-role' },
      { key: 'Wingspan', value: '17', unit: 'm' },
      { key: 'Endurance', value: '25', unit: 'h' },
      { key: 'Ceiling', value: '8,850', unit: 'm' },
      { key: 'Max Speed', value: '280', unit: 'km/h' },
      { key: 'Payload', value: '488', unit: 'kg' },
      { key: 'Armament', value: '4× AGM-114 Hellfire / GBU-44 Viper Strike' },
      { key: 'Data Link', value: 'TCDL, Ku-band SATCOM' },
    ],
  },
  drone: {
    model: 'Generic UAV',
    specs: [
      { key: 'Model', value: 'UAV — Classification Pending' },
      { key: 'Type', value: 'Unmanned Aerial Vehicle' },
      { key: 'Endurance', value: '8-24', unit: 'h (estimated)' },
      { key: 'Ceiling', value: '5,000-15,000', unit: 'm' },
      { key: 'Data Link', value: 'LOS / SATCOM' },
    ],
  },

  // ── AIRCRAFT ──
  'aircraft/fighter': {
    model: 'F-35A Lightning II',
    specs: [
      { key: 'Model', value: 'F-35A Lightning II (Lockheed Martin)' },
      { key: 'Type', value: '5th Gen Multirole Stealth Fighter' },
      { key: 'Wingspan', value: '10.7', unit: 'm' },
      { key: 'Max Speed', value: 'Mach 1.6 (1,960 km/h)' },
      { key: 'Combat Radius', value: '1,093', unit: 'km' },
      { key: 'Ceiling', value: '15,240', unit: 'm' },
      { key: 'Armament', value: 'GAU-22/A 25mm, AIM-120 AMRAAM, AIM-9X, JDAM, SDB' },
      { key: 'Sensors', value: 'AN/APG-81 AESA, AN/AAQ-37 DAS, EOTS' },
      { key: 'Crew', value: '1' },
    ],
  },
  'aircraft/bomber': {
    model: 'B-2 Spirit',
    specs: [
      { key: 'Model', value: 'B-2A Spirit (Northrop Grumman)' },
      { key: 'Type', value: 'Stealth Strategic Bomber' },
      { key: 'Wingspan', value: '52.4', unit: 'm' },
      { key: 'Max Speed', value: '1,010', unit: 'km/h' },
      { key: 'Range', value: '11,100', unit: 'km' },
      { key: 'Ceiling', value: '15,200', unit: 'm' },
      { key: 'Payload', value: '23,000', unit: 'kg' },
      { key: 'Crew', value: '2' },
    ],
  },
  'aircraft/helicopter': {
    model: 'AH-64E Apache',
    specs: [
      { key: 'Model', value: 'AH-64E Apache Guardian (Boeing)' },
      { key: 'Type', value: 'Attack Helicopter' },
      { key: 'Max Speed', value: '293', unit: 'km/h' },
      { key: 'Range', value: '476', unit: 'km' },
      { key: 'Ceiling', value: '6,400', unit: 'm' },
      { key: 'Armament', value: 'M230 30mm, 16× AGM-114 Hellfire, Hydra 70 rockets' },
      { key: 'Sensors', value: 'AN/APG-78 Longbow FCR, TADS/PNVS' },
      { key: 'Crew', value: '2' },
    ],
  },
  aircraft: {
    model: 'Generic Aircraft',
    specs: [
      { key: 'Model', value: 'Aircraft — Classification Pending' },
      { key: 'Type', value: 'Fixed Wing Aircraft' },
      { key: 'Max Speed', value: '800-2,000', unit: 'km/h (estimated)' },
      { key: 'Ceiling', value: '10,000-18,000', unit: 'm' },
    ],
  },

  // ── SHIPS ──
  'ship/destroyer': {
    model: 'Arleigh Burke DDG',
    specs: [
      { key: 'Model', value: 'Arleigh Burke-class (DDG-51)' },
      { key: 'Type', value: 'Guided Missile Destroyer' },
      { key: 'Displacement', value: '9,200', unit: 'tons' },
      { key: 'Length', value: '155', unit: 'm' },
      { key: 'Speed', value: '30+', unit: 'knots' },
      { key: 'Range', value: '4,400', unit: 'nm' },
      { key: 'Armament', value: '96× VLS (SM-2/3/6, TLAM, ESSM), Mk 45 5"/54, Phalanx CIWS' },
      { key: 'Sensors', value: 'AN/SPY-1D AEGIS, AN/SQS-53C sonar' },
      { key: 'Crew', value: '329' },
    ],
  },
  'ship/carrier': {
    model: 'Nimitz-class CVN',
    specs: [
      { key: 'Model', value: 'Nimitz-class (CVN)' },
      { key: 'Type', value: 'Nuclear Aircraft Carrier' },
      { key: 'Displacement', value: '100,000', unit: 'tons' },
      { key: 'Length', value: '332.8', unit: 'm' },
      { key: 'Speed', value: '30+', unit: 'knots' },
      { key: 'Air Wing', value: '60-90 aircraft' },
      { key: 'Crew', value: '5,680' },
    ],
  },
  'ship/frigate': {
    model: 'FREMM Frigate',
    specs: [
      { key: 'Model', value: 'FREMM-class (Fincantieri/Naval Group)' },
      { key: 'Type', value: 'Multi-purpose Frigate' },
      { key: 'Displacement', value: '6,700', unit: 'tons' },
      { key: 'Length', value: '144', unit: 'm' },
      { key: 'Speed', value: '27', unit: 'knots' },
      { key: 'Armament', value: '16× VLS (Aster 15/30), 76mm OTO Melara, torpedo tubes' },
      { key: 'Sensors', value: 'Herakles MFR, CAPTAS-4 towed sonar' },
      { key: 'Crew', value: '108' },
    ],
  },
  'ship/submarine': {
    model: 'Virginia-class SSN',
    specs: [
      { key: 'Model', value: 'Virginia-class (SSN-774)' },
      { key: 'Type', value: 'Nuclear Attack Submarine' },
      { key: 'Displacement', value: '7,900', unit: 'tons (submerged)' },
      { key: 'Length', value: '114.8', unit: 'm' },
      { key: 'Speed', value: '25+', unit: 'knots (submerged)' },
      { key: 'Depth', value: '240+', unit: 'm' },
      { key: 'Armament', value: '12× VLS (TLAM), 4× 533mm torpedo tubes, Mk 48 ADCAP' },
      { key: 'Crew', value: '132' },
    ],
  },
  ship: {
    model: 'Generic Vessel',
    specs: [
      { key: 'Model', value: 'Vessel — Classification Pending' },
      { key: 'Type', value: 'Surface Ship' },
      { key: 'Speed', value: '15-30', unit: 'knots (estimated)' },
    ],
  },

  // ── GROUND ──
  'tank/mbt': {
    model: 'M1A2 Abrams',
    specs: [
      { key: 'Model', value: 'M1A2 SEPv3 Abrams (General Dynamics)' },
      { key: 'Type', value: 'Main Battle Tank' },
      { key: 'Weight', value: '66.8', unit: 'tons' },
      { key: 'Max Speed', value: '67', unit: 'km/h' },
      { key: 'Range', value: '426', unit: 'km' },
      { key: 'Armament', value: 'M256 120mm smoothbore, M240 7.62mm, M2 .50 cal' },
      { key: 'Armor', value: 'Chobham composite + DU mesh' },
      { key: 'Crew', value: '4' },
    ],
  },
  tank: {
    model: 'Generic MBT',
    specs: [
      { key: 'Model', value: 'Main Battle Tank — Classification Pending' },
      { key: 'Type', value: 'Armored Fighting Vehicle' },
      { key: 'Max Speed', value: '50-70', unit: 'km/h' },
      { key: 'Armament', value: '120mm main gun (estimated)' },
    ],
  },

  // ── MISSILES ──
  missile: {
    model: 'Generic Missile',
    specs: [
      { key: 'Model', value: 'Missile — Classification Pending' },
      { key: 'Type', value: 'Guided Munition' },
      { key: 'Speed', value: 'Mach 0.8-5.0 (estimated)' },
    ],
  },

  // ── SATELLITES ──
  satellite: {
    model: 'Generic Satellite',
    specs: [
      { key: 'Type', value: 'Artificial Satellite' },
      { key: 'Orbit', value: 'Determined by TLE' },
    ],
  },

  // ── GROUND STATION ──
  ground_station: {
    model: 'Ground Station',
    specs: [
      { key: 'Type', value: 'Fixed Ground Installation' },
      { key: 'Function', value: 'C2 / Tracking / Communications' },
    ],
  },

  // ── BASE ──
  base: {
    model: 'Operating Base',
    specs: [
      { key: 'Type', value: 'Fixed Installation' },
      { key: 'Function', value: 'Force Projection / Logistics' },
    ],
  },

  // ── VEHICLE ──
  vehicle: {
    model: 'Generic Vehicle',
    specs: [
      { key: 'Type', value: 'Ground Vehicle' },
      { key: 'Max Speed', value: '60-100', unit: 'km/h' },
    ],
  },
};

// --------------- PUBLIC API ---------------

/**
 * Look up specifications for an entity.
 * Tries "type/subtype" first, then falls back to "type" only.
 */
export function getEntitySpecifications(
  entityType: string,
  subtype?: string | null,
): EntitySpecEntry[] {
  const t = entityType.toLowerCase();
  const s = (subtype ?? '').toLowerCase();

  // Try specific match first
  if (s) {
    const key = `${t}/${s}`;
    if (PLATFORM_DB[key]) return PLATFORM_DB[key].specs;
  }

  // Fall back to type-only
  if (PLATFORM_DB[t]) return PLATFORM_DB[t].specs;

  // Generic fallback
  return [{ key: 'Type', value: entityType }, { key: 'Classification', value: 'Pending' }];
}

/**
 * Get the platform model name for display.
 */
export function getPlatformModel(
  entityType: string,
  subtype?: string | null,
): string {
  const t = entityType.toLowerCase();
  const s = (subtype ?? '').toLowerCase();
  if (s && PLATFORM_DB[`${t}/${s}`]) return PLATFORM_DB[`${t}/${s}`].model;
  if (PLATFORM_DB[t]) return PLATFORM_DB[t].model;
  return entityType;
}
