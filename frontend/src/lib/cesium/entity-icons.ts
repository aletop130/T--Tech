/**
 * SVG icon generators for Cesium map entities.
 * Each returns a data-URI suitable for Cesium billboard `image`.
 * Icons are cached by (type, color) to avoid regeneration.
 */

const cache = new Map<string, string>();

function svg(width: number, height: number, body: string): string {
  return `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${body}</svg>`
  )}`;
}

const S = '#000'; // stroke color
const SW = '1.5'; // stroke width

// ── Satellite: body + solar panels + antenna ────────────────────────────────
function satellite(c: string): string {
  return svg(32, 32, `
    <rect x="12" y="12" width="8" height="8" fill="${c}" stroke="${S}" stroke-width="${SW}" rx="1"/>
    <rect x="1" y="13" width="9" height="6" fill="${c}" stroke="${S}" stroke-width="${SW}" rx="0.5" opacity="0.85"/>
    <rect x="22" y="13" width="9" height="6" fill="${c}" stroke="${S}" stroke-width="${SW}" rx="0.5" opacity="0.85"/>
    <line x1="16" y1="12" x2="16" y2="6" stroke="${c}" stroke-width="1.5"/>
    <circle cx="16" cy="5" r="2" fill="${c}" stroke="${S}" stroke-width="1"/>
  `);
}

// ── Debris: angular shard ───────────────────────────────────────────────────
function debris(c: string): string {
  return svg(20, 20, `
    <polygon points="10,1 17,7 14,14 6,18 3,10 7,5" fill="${c}" stroke="${S}" stroke-width="${SW}" opacity="0.9"/>
    <line x1="8" y1="6" x2="12" y2="12" stroke="${S}" stroke-width="0.8" opacity="0.5"/>
  `);
}

// ── Ground Station: parabolic dish ──────────────────────────────────────────
function groundStation(c: string): string {
  return svg(32, 32, `
    <path d="M6,14 Q16,2 26,14" fill="none" stroke="${c}" stroke-width="2.5" stroke-linecap="round"/>
    <line x1="16" y1="14" x2="16" y2="26" stroke="${c}" stroke-width="2"/>
    <line x1="9" y1="26" x2="23" y2="26" stroke="${c}" stroke-width="2" stroke-linecap="round"/>
    <circle cx="16" cy="12" r="2.5" fill="${c}" stroke="${S}" stroke-width="1"/>
    <line x1="16" y1="14" x2="10" y2="22" stroke="${c}" stroke-width="1.5" opacity="0.6"/>
    <line x1="16" y1="14" x2="22" y2="22" stroke="${c}" stroke-width="1.5" opacity="0.6"/>
  `);
}

// ── Ship: top-down hull with bow ────────────────────────────────────────────
function ship(c: string): string {
  return svg(32, 32, `
    <path d="M16,3 L24,14 L22,27 Q16,31 10,27 L8,14 Z" fill="${c}" stroke="${S}" stroke-width="${SW}" stroke-linejoin="round"/>
    <line x1="16" y1="8" x2="16" y2="24" stroke="${S}" stroke-width="1" opacity="0.4"/>
    <line x1="10" y1="16" x2="22" y2="16" stroke="${S}" stroke-width="1" opacity="0.3"/>
  `);
}

// ── Aircraft: top-down delta wing ───────────────────────────────────────────
function aircraft(c: string): string {
  return svg(32, 32, `
    <polygon points="16,2 28,22 24,24 16,20 8,24 4,22" fill="${c}" stroke="${S}" stroke-width="${SW}" stroke-linejoin="round"/>
    <polygon points="13,22 16,20 19,22 18,28 14,28" fill="${c}" stroke="${S}" stroke-width="1" stroke-linejoin="round"/>
    <line x1="16" y1="4" x2="16" y2="18" stroke="${S}" stroke-width="0.8" opacity="0.3"/>
  `);
}

// ── Drone: quadcopter from above ────────────────────────────────────────────
function drone(c: string): string {
  return svg(28, 28, `
    <line x1="6" y1="6" x2="22" y2="22" stroke="${c}" stroke-width="2"/>
    <line x1="22" y1="6" x2="6" y2="22" stroke="${c}" stroke-width="2"/>
    <circle cx="14" cy="14" r="3" fill="${c}" stroke="${S}" stroke-width="${SW}"/>
    <circle cx="6" cy="6" r="3.5" fill="${c}" stroke="${S}" stroke-width="1" opacity="0.7"/>
    <circle cx="22" cy="6" r="3.5" fill="${c}" stroke="${S}" stroke-width="1" opacity="0.7"/>
    <circle cx="6" cy="22" r="3.5" fill="${c}" stroke="${S}" stroke-width="1" opacity="0.7"/>
    <circle cx="22" cy="22" r="3.5" fill="${c}" stroke="${S}" stroke-width="1" opacity="0.7"/>
  `);
}

// ── Tank: top-down with turret + barrel ──────────────────────────────────────
function tank(c: string): string {
  return svg(32, 32, `
    <rect x="7" y="5" width="18" height="24" rx="3" fill="${c}" stroke="${S}" stroke-width="${SW}"/>
    <rect x="4" y="7" width="4" height="18" rx="1" fill="${c}" stroke="${S}" stroke-width="1" opacity="0.7"/>
    <rect x="24" y="7" width="4" height="18" rx="1" fill="${c}" stroke="${S}" stroke-width="1" opacity="0.7"/>
    <circle cx="16" cy="18" r="5" fill="${c}" stroke="${S}" stroke-width="${SW}"/>
    <line x1="16" y1="13" x2="16" y2="3" stroke="${c}" stroke-width="2.5" stroke-linecap="round"/>
  `);
}

// ── Ground Vehicle: truck/jeep top-down ─────────────────────────────────────
function vehicle(c: string): string {
  return svg(28, 28, `
    <rect x="7" y="3" width="14" height="22" rx="3" fill="${c}" stroke="${S}" stroke-width="${SW}"/>
    <rect x="4" y="5" width="4" height="6" rx="1" fill="${c}" stroke="${S}" stroke-width="1" opacity="0.7"/>
    <rect x="20" y="5" width="4" height="6" rx="1" fill="${c}" stroke="${S}" stroke-width="1" opacity="0.7"/>
    <rect x="4" y="17" width="4" height="6" rx="1" fill="${c}" stroke="${S}" stroke-width="1" opacity="0.7"/>
    <rect x="20" y="17" width="4" height="6" rx="1" fill="${c}" stroke="${S}" stroke-width="1" opacity="0.7"/>
    <rect x="9" y="4" width="10" height="5" rx="1" fill="${S}" opacity="0.25"/>
  `);
}

// ── Base / defended zone ────────────────────────────────────────────────────
function base(c: string): string {
  return svg(32, 32, `
    <polygon points="16,3 28,12 24,28 8,28 4,12" fill="${c}" stroke="${S}" stroke-width="${SW}" stroke-linejoin="round"/>
    <rect x="12" y="16" width="8" height="12" fill="${S}" opacity="0.25" rx="1"/>
    <circle cx="16" cy="11" r="3" fill="${S}" opacity="0.2"/>
  `);
}

// ── Missile / weapon ────────────────────────────────────────────────────────
function weapon(c: string): string {
  return svg(24, 24, `
    <polygon points="12,1 15,8 15,18 18,22 6,22 9,18 9,8" fill="${c}" stroke="${S}" stroke-width="${SW}" stroke-linejoin="round"/>
    <polygon points="9,18 3,22 9,20" fill="${c}" stroke="${S}" stroke-width="1"/>
    <polygon points="15,18 21,22 15,20" fill="${c}" stroke="${S}" stroke-width="1"/>
  `);
}

// ── Default: diamond ────────────────────────────────────────────────────────
function defaultIcon(c: string): string {
  return svg(20, 20, `
    <polygon points="10,2 18,10 10,18 2,10" fill="${c}" stroke="${S}" stroke-width="${SW}"/>
  `);
}

// ── Public API ──────────────────────────────────────────────────────────────

export type EntityIconType =
  | 'satellite' | 'debris' | 'ground_station' | 'ship'
  | 'aircraft' | 'drone' | 'tank' | 'vehicle'
  | 'base' | 'weapon' | 'default';

const GENERATORS: Record<EntityIconType, (color: string) => string> = {
  satellite,
  debris,
  ground_station: groundStation,
  ship,
  aircraft,
  drone,
  tank,
  vehicle,
  base,
  weapon,
  default: defaultIcon,
};

/**
 * Get a data-URI icon for a given entity type and color.
 * Results are cached — safe to call on every render.
 */
export function getEntityIcon(type: EntityIconType, color: string): string {
  const key = `${type}-${color}`;
  let result = cache.get(key);
  if (!result) {
    const gen = GENERATORS[type] ?? GENERATORS.default;
    result = gen(color);
    cache.set(key, result);
  }
  return result;
}

/** Icon pixel dimensions for billboard sizing. */
export const ICON_SIZES: Record<EntityIconType, { w: number; h: number }> = {
  satellite:       { w: 32, h: 32 },
  debris:          { w: 20, h: 20 },
  ground_station:  { w: 32, h: 32 },
  ship:            { w: 32, h: 32 },
  aircraft:        { w: 32, h: 32 },
  drone:           { w: 28, h: 28 },
  tank:            { w: 32, h: 32 },
  vehicle:         { w: 28, h: 28 },
  base:            { w: 32, h: 32 },
  weapon:          { w: 24, h: 24 },
  default:         { w: 20, h: 20 },
};

/**
 * Infer the best icon type for a sandbox actor based on its class/type/subtype.
 */
export function inferActorIcon(
  actorClass: string,
  actorType: string,
  subtype?: string | null,
): EntityIconType {
  const t = actorType.toLowerCase();
  const s = (subtype ?? '').toLowerCase();

  if (actorClass === 'orbital' || t === 'satellite') return 'satellite';
  if (t === 'ground_station' || t === 'radar') return 'ground_station';
  if (t === 'defended_zone' || t === 'base' || t === 'hq') return 'base';
  if (actorClass === 'sea' || t === 'ship' || t === 'vessel' || t === 'destroyer' || t === 'carrier' || t === 'frigate' || t === 'submarine') return 'ship';
  if (s === 'drone' || t === 'drone' || t === 'uav') return 'drone';
  if (actorClass === 'airborne' || t === 'aircraft' || t === 'jet' || t === 'fighter' || t === 'bomber' || t === 'helicopter') return 'aircraft';
  if (s === 'tank' || t === 'tank' || t === 'apc' || t === 'artillery') return 'tank';
  if (actorClass === 'weapon' || t === 'missile' || t === 'torpedo') return 'weapon';
  if (actorClass === 'mobile_ground' || t === 'vehicle' || t === 'truck' || t === 'jeep' || t === 'convoy') return 'vehicle';

  return 'default';
}
