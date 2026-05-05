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

// ── Aircraft: realistic plane silhouette ────────────────────────────────────
function aircraft(c: string): string {
  return svg(32, 32, `
    <g transform="translate(2,2) scale(0.228)">
      <path d="M16.63,105.75c0.01-4.03,2.3-7.97,6.03-12.38L1.09,79.73c-1.36-0.59-1.33-1.42-0.54-2.4l4.57-3.9
        c0.83-0.51,1.71-0.73,2.66-0.47l26.62,4.5l22.18-24.02L4.8,18.41c-1.31-0.77-1.42-1.64-0.07-2.65l7.47-5.96l67.5,18.97L99.64,7.45
        c6.69-5.79,13.19-8.38,18.18-7.15c2.75,0.68,3.72,1.5,4.57,4.08c1.65,5.06-0.91,11.86-6.96,18.86L94.11,43.18l18.97,67.5
        l-5.96,7.47c-1.01,1.34-1.88,1.23-2.65-0.07L69.43,66.31L45.41,88.48l4.5,26.62c0.26,0.94,0.05,1.82-0.47,2.66l-3.9,4.57
        c-0.97,0.79-1.81,0.82-2.4-0.54l-13.64-21.57c-4.43,3.74-8.37,6.03-12.42,6.03C16.71,106.24,16.63,106.11,16.63,105.75z"
        fill="${c}" stroke="${S}" stroke-width="4" fill-rule="evenodd" clip-rule="evenodd"/>
    </g>
  `);
}

// ── Drone: military UAV silhouette (top-down) ──────────────────────────────
function drone(c: string): string {
  return svg(32, 32, `
    <g transform="translate(16,16) scale(0.0028,-0.0028) translate(-4900,-4900)">
      <path d="M4805 7897 c-140 -66 -265 -303 -321 -612 -21 -115 -30 -440 -15
-560 6 -49 22 -175 35 -280 14 -104 32 -273 40 -375 16 -186 43 -886 35 -894
-5 -5 -263 -16 -2224 -96 -1454 -59 -1373 -55 -1410 -71 -162 -70 -169 -290
-12 -371 42 -21 24 -20 2442 -117 550 -23 1046 -43 1103 -47 l102 -6 -2 -671
-3 -672 -532 -5 -531 -5 -43 -30 c-136 -96 -110 -313 44 -369 23 -9 206 -36
407 -61 419 -53 653 -84 655 -88 1 -1 10 -60 20 -130 9 -71 32 -181 51 -245
18 -64 31 -118 29 -121 -3 -2 -76 -8 -162 -13 -476 -25 -463 -81 26 -108 169
-9 208 -14 230 -29 72 -50 161 -54 240 -11 51 28 61 30 241 40 248 13 390 33
390 55 0 22 -133 42 -353 53 -86 5 -159 11 -162 13 -2 3 11 58 30 124 19 65
42 176 52 246 l17 128 30 5 c17 3 245 32 506 65 261 34 492 65 513 71 20 6 54
25 74 43 103 91 96 253 -16 332 l-43 30 -531 5 -532 5 -3 671 -2 672 122 6
c148 8 516 23 1818 76 1747 71 1665 67 1707 89 73 37 113 102 113 181 0 81
-53 163 -125 190 -16 7 -122 16 -235 21 -289 13 -3354 139 -3381 139 l-22 0 7
268 c11 424 42 826 89 1127 29 191 31 569 3 720 -27 150 -61 259 -116 371 -82
170 -189 264 -300 264 -26 0 -66 -10 -95 -23z" fill="${c}" stroke="${S}" stroke-width="180"/>
    </g>
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

// ── Fighter: F-22 silhouette (top-down) ────────────────────────────────────
function fighter(c: string): string {
  return svg(32, 32, `
    <g transform="translate(16,16) scale(0.0145,-0.0145) translate(-1000,-1000)">
      <path d="M987 1878 c-33 -85 -44 -141 -57 -283 l-11 -120 -44 -45 -44 -45 -19
-144 c-19 -144 -19 -145 -55 -175 -19 -17 -126 -114 -236 -216 l-201 -184 0
-57 c0 -54 1 -57 47 -96 36 -29 82 -51 187 -89 76 -27 141 -55 144 -62 3 -8
-26 -44 -67 -86 l-72 -73 3 -63 3 -64 75 -22 c41 -13 80 -23 86 -23 5 -1 45
31 87 70 66 61 77 75 77 104 0 54 8 66 36 53 17 -8 31 -8 48 0 25 11 25 10 28
-41 2 -38 7 -52 18 -52 11 0 16 14 18 52 3 51 3 52 28 41 17 -8 31 -8 48 0 28
13 36 1 36 -53 0 -29 11 -43 77 -104 42 -39 82 -71 87 -70 6 0 45 10 86 23
l75 22 2 64 3 65 -81 69 c-45 39 -79 75 -77 83 2 10 60 35 156 68 118 42 162
62 197 92 42 36 44 40 45 93 l0 55 -197 182 c-109 99 -216 198 -239 219 l-41
39 -17 140 -18 140 -44 45 -43 45 -11 125 c-6 69 -16 143 -21 165 -16 62 -60
175 -69 175 -4 0 -19 -28 -33 -62z" fill="${c}" stroke="${S}" stroke-width="40"/>
    </g>
  `);
}

// ── Bomber: B-2 silhouette (top-down) ──────────────────────────────────────
function bomber(c: string): string {
  return svg(32, 32, `
    <g transform="translate(16,16) scale(0.014,-0.014) translate(-1000,-1100)">
      <path d="M585 1109 c-220 -116 -419 -220 -442 -232 l-43 -22 92 -73 c57 -45
95 -69 102 -64 6 5 63 36 127 70 l117 62 101 -81 100 -80 61 35 c34 20 66 36
71 36 6 0 37 -19 70 -41 l59 -42 59 42 c33 22 64 41 70 41 5 0 37 -16 71 -36
l61 -36 100 81 100 82 129 -70 130 -69 89 71 c50 39 89 72 88 73 -13 12 -892
464 -900 463 -7 0 -192 -95 -412 -210z" fill="${c}" stroke="${S}" stroke-width="30"/>
    </g>
  `);
}

// ── Submarine: top-down hull silhouette ─────────────────────────────────────
function submarine(c: string): string {
  return svg(32, 32, `
    <g transform="translate(16,16) scale(0.0055,-0.0055) translate(-2560,-2560)">
      <path d="M3527 4064 c-4 -4 -7 -164 -7 -356 l0 -348 -105 0 c-186 0 -205 -19
-205 -198 0 -140 -10 -170 -64 -196 -31 -14 -118 -16 -888 -16 -809 0 -859 -1
-977 -20 -120 -20 -281 -58 -426 -100 l-70 -21 -40 46 -40 45 -168 0 -168 0 7
-22 c19 -59 43 -163 38 -167 -2 -3 -72 -24 -155 -47 -83 -24 -153 -45 -155
-47 -3 -2 -9 -18 -13 -35 l-9 -31 139 -33 c77 -18 144 -35 150 -39 9 -5 -1
-64 -27 -151 -5 -17 8 -18 177 -18 l181 0 40 40 40 40 132 -24 c419 -78 373
-76 2186 -76 1547 0 1628 1 1685 18 82 25 168 69 214 109 125 106 71 288 -119
402 -30 18 -79 50 -109 71 -103 75 -139 84 -373 88 l-208 4 -29 35 c-16 19
-53 76 -82 126 -67 114 -112 165 -166 189 l-43 19 -2 217 c-3 185 -5 217 -18
217 -13 0 -15 -31 -18 -212 l-2 -213 -135 0 -135 0 -2 352 c-3 335 -6 376 -31
352z" fill="${c}" stroke="${S}" stroke-width="80"/>
    </g>
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
  | 'base' | 'weapon' | 'fighter' | 'bomber' | 'submarine'
  | 'default';

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
  fighter,
  bomber,
  submarine,
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
  fighter:         { w: 32, h: 32 },
  bomber:          { w: 32, h: 32 },
  submarine:       { w: 32, h: 32 },
  default:         { w: 20, h: 20 },
};

// --------------- STATUS RING INDICATORS ---------------

export type EntityStatus = 'moving' | 'stationary' | 'hostile_active' | 'damaged';

const STATUS_RING_COLORS: Record<EntityStatus, { color: string; dasharray: string; opacity: string }> = {
  moving:         { color: '#22d3ee', dasharray: '', opacity: '0.6' },
  stationary:     { color: '#555555', dasharray: '', opacity: '0.3' },
  hostile_active: { color: '#ef4444', dasharray: '3 2', opacity: '0.7' },
  damaged:        { color: '#f97316', dasharray: '2 3 1 3', opacity: '0.6' },
};

/**
 * Get an entity icon with a status ring indicator around it.
 * The ring is drawn as a circle around the base icon.
 */
export function getEntityIconWithStatus(
  type: EntityIconType,
  color: string,
  status: EntityStatus,
): string {
  const key = `${type}-${color}-${status}`;
  let result = cache.get(key);
  if (result) return result;

  const gen = GENERATORS[type] ?? GENERATORS.default;
  const size = ICON_SIZES[type] ?? { w: 20, h: 20 };
  // We create a larger SVG that wraps the base icon with a status ring
  const pad = 6;
  const outerW = size.w + pad * 2;
  const outerH = size.h + pad * 2;
  const cx = outerW / 2;
  const cy = outerH / 2;
  const r = Math.max(cx, cy) - 2;
  const ring = STATUS_RING_COLORS[status];

  // Get the inner SVG content by regenerating (strip the outer svg tags)
  const innerSvg = gen(color);
  const match = innerSvg.match(/viewBox="[^"]*">([\s\S]*)<\/svg>/);
  const innerContent = match ? match[1] : '';

  const fullSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${outerW}" height="${outerH}" viewBox="0 0 ${outerW} ${outerH}">
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${ring.color}" stroke-width="1.5" opacity="${ring.opacity}" ${ring.dasharray ? `stroke-dasharray="${ring.dasharray}"` : ''}/>
    <g transform="translate(${pad},${pad})">
      <svg width="${size.w}" height="${size.h}" viewBox="0 0 ${size.w} ${size.h}">${innerContent}</svg>
    </g>
  </svg>`;

  result = `data:image/svg+xml,${encodeURIComponent(fullSvg)}`;
  cache.set(key, result);
  return result;
}

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
  // Sea — submarine gets its own icon
  if (t === 'submarine' || s === 'submarine') return 'submarine';
  if (actorClass === 'sea' || t === 'ship' || t === 'vessel' || t === 'destroyer' || t === 'carrier' || t === 'frigate') return 'ship';
  // Air — fighter and bomber get dedicated icons
  if (s === 'bomber' || t === 'bomber' || s === 'b-2' || s === 'b-52' || s === 'b-1') return 'bomber';
  if (s === 'fighter' || t === 'fighter' || s === 'f-22' || s === 'f-35' || s === 'f-16' || s === 'f-15' || s === 'su-35' || s === 'su-57' || s === 'mig-29' || s === 'eurofighter' || s === 'rafale') return 'fighter';
  if (s === 'drone' || t === 'drone' || t === 'uav') return 'drone';
  if (actorClass === 'airborne' || t === 'aircraft' || t === 'jet' || t === 'helicopter') return 'aircraft';
  if (s === 'tank' || t === 'tank' || t === 'apc' || t === 'artillery') return 'tank';
  if (actorClass === 'weapon' || t === 'missile' || t === 'torpedo') return 'weapon';
  if (actorClass === 'mobile_ground' || t === 'vehicle' || t === 'truck' || t === 'jeep' || t === 'convoy') return 'vehicle';

  return 'default';
}
