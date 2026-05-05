/**
 * MIL-STD-2525D / APP-6D Symbol Generator
 * Generates data-URI SVG icons for military standard symbology.
 * Frame shapes by affiliation, fill colors, function icons.
 */

const cache = new Map<string, string>();

type Affiliation = 'friendly' | 'hostile' | 'neutral' | 'unknown';
type Dimension = 'space' | 'air' | 'ground' | 'sea';
type Status = 'present' | 'anticipated' | 'destroyed';

// --------------- FRAME COLORS ---------------

const FRAME_FILL: Record<Affiliation, string> = {
  friendly: '#80e0ff',
  hostile: '#ff8080',
  neutral: '#aaffaa',
  unknown: '#ffff80',
};

const FRAME_STROKE: Record<Affiliation, string> = {
  friendly: '#006b8a',
  hostile: '#c80000',
  neutral: '#008a00',
  unknown: '#c8c800',
};

// --------------- FRAME SHAPES (40×40 viewBox) ---------------

function friendlyFrame(fill: string, stroke: string, dash: string): string {
  // Rectangle with rounded corners
  return `<rect x="4" y="8" width="32" height="24" rx="2" fill="${fill}" stroke="${stroke}" stroke-width="2" ${dash}/>`;
}

function hostileFrame(fill: string, stroke: string, dash: string): string {
  // Diamond
  return `<polygon points="20,2 38,20 20,38 2,20" fill="${fill}" stroke="${stroke}" stroke-width="2" ${dash}/>`;
}

function neutralFrame(fill: string, stroke: string, dash: string): string {
  // Square
  return `<rect x="4" y="4" width="32" height="32" fill="${fill}" stroke="${stroke}" stroke-width="2" ${dash}/>`;
}

function unknownFrame(fill: string, stroke: string, dash: string): string {
  // Quatrefoil / cloverleaf shape (simplified as rounded rect)
  return `<rect x="4" y="4" width="32" height="32" rx="8" fill="${fill}" stroke="${stroke}" stroke-width="2" ${dash}/>`;
}

const FRAME_BUILDERS: Record<Affiliation, (fill: string, stroke: string, dash: string) => string> = {
  friendly: friendlyFrame,
  hostile: hostileFrame,
  neutral: neutralFrame,
  unknown: unknownFrame,
};

// --------------- DIMENSION MODIFIERS ---------------

// Air: hat on top
function airModifier(): string {
  return `<path d="M14,8 L20,2 L26,8" fill="none" stroke="inherit" stroke-width="1.5"/>`;
}

// Space: top arch
function spaceModifier(): string {
  return `<path d="M10,8 Q20,-2 30,8" fill="none" stroke="inherit" stroke-width="1.5"/>`;
}

// Sea: flat bottom line
function seaModifier(): string {
  return `<line x1="8" y1="36" x2="32" y2="36" stroke="inherit" stroke-width="2"/>`;
}

// Ground: flat top bar
function groundModifier(): string {
  return `<line x1="8" y1="4" x2="32" y2="4" stroke="inherit" stroke-width="2"/>`;
}

const DIM_MODIFIERS: Record<Dimension, () => string> = {
  air: airModifier,
  space: spaceModifier,
  sea: seaModifier,
  ground: groundModifier,
};

// --------------- FUNCTION ICONS ---------------

const FUNCTION_ICONS: Record<string, string> = {
  // Air
  fighter: `<path d="M20,12 L20,28 M14,18 L26,18 M16,26 L24,26" stroke="#000" stroke-width="1.5" fill="none"/>`,
  bomber: `<path d="M20,10 L20,30 M12,16 L28,16 M12,24 L28,24" stroke="#000" stroke-width="1.5" fill="none"/>`,
  helicopter: `<circle cx="20" cy="20" r="4" fill="none" stroke="#000" stroke-width="1.5"/><path d="M12,20 L28,20" stroke="#000" stroke-width="1.5"/>`,
  uav: `<path d="M20,14 L20,26 M14,20 L26,20" stroke="#000" stroke-width="2" fill="none"/><circle cx="20" cy="20" r="2" fill="#000"/>`,
  transport: `<path d="M14,14 L14,26 L26,26 L26,14 Z M14,20 L26,20" stroke="#000" stroke-width="1.2" fill="none"/>`,
  // Ground
  infantry: `<path d="M12,12 L28,28 M28,12 L12,28" stroke="#000" stroke-width="2" fill="none"/>`,
  armor: `<ellipse cx="20" cy="20" rx="8" ry="6" fill="none" stroke="#000" stroke-width="1.5"/>`,
  artillery: `<circle cx="20" cy="20" r="5" fill="#000" opacity="0.8"/>`,
  vehicle_ground: `<rect x="13" y="15" width="14" height="10" rx="2" fill="none" stroke="#000" stroke-width="1.5"/>`,
  base_icon: `<polygon points="20,12 28,18 28,28 12,28 12,18" fill="none" stroke="#000" stroke-width="1.5"/>`,
  // Sea
  surface: `<path d="M12,20 Q16,14 20,20 Q24,26 28,20" stroke="#000" stroke-width="1.5" fill="none"/>`,
  submarine: `<path d="M12,18 L28,18 M12,22 L28,22" stroke="#000" stroke-width="1.5" fill="none"/><circle cx="20" cy="20" r="3" fill="none" stroke="#000" stroke-width="1"/>`,
  carrier: `<path d="M12,18 L28,18 L28,24 L12,24 Z M16,14 L24,14" stroke="#000" stroke-width="1.2" fill="none"/>`,
  // Space
  satellite_icon: `<rect x="17" y="17" width="6" height="6" fill="#000" opacity="0.7"/><rect x="10" y="18" width="5" height="4" fill="#000" opacity="0.5"/><rect x="25" y="18" width="5" height="4" fill="#000" opacity="0.5"/>`,
  // Weapon
  missile_icon: `<polygon points="20,10 23,16 23,28 20,30 17,28 17,16" fill="#000" opacity="0.7"/>`,
  // Station
  station_icon: `<path d="M14,22 Q20,10 26,22" stroke="#000" stroke-width="1.5" fill="none"/><line x1="20" y1="22" x2="20" y2="28" stroke="#000" stroke-width="1.5"/>`,
  // Generic
  unknown_func: `<text x="20" y="24" text-anchor="middle" font-size="14" font-weight="bold" fill="#000" opacity="0.5">?</text>`,
};

// --------------- FUNCTION ID MAPPING ---------------

function mapFunctionId(functionId: string, dimension: Dimension): string {
  const f = functionId.toLowerCase();
  // Direct match
  if (FUNCTION_ICONS[f]) return f;
  // Alias mapping
  if (f === 'drone' || f === 'uav' || f === 'recon') return 'uav';
  if (f === 'jet' || f === 'fighter' || f === 'aircraft') return 'fighter';
  if (f === 'helicopter' || f === 'helo') return 'helicopter';
  if (f === 'tank' || f === 'apc' || f === 'mbt') return 'armor';
  if (f === 'ship' || f === 'vessel' || f === 'destroyer' || f === 'frigate') return 'surface';
  if (f === 'satellite') return 'satellite_icon';
  if (f === 'missile' || f === 'torpedo' || f === 'weapon') return 'missile_icon';
  if (f === 'ground_station' || f === 'radar' || f === 'tracking') return 'station_icon';
  if (f === 'base' || f === 'hq' || f === 'defended_zone') return 'base_icon';
  if (f === 'convoy' || f === 'truck' || f === 'vehicle' || f === 'ground_vehicle') return 'vehicle_ground';
  // Dimension-based fallback
  if (dimension === 'air') return 'fighter';
  if (dimension === 'sea') return 'surface';
  if (dimension === 'space') return 'satellite_icon';
  if (dimension === 'ground') return 'infantry';
  return 'unknown_func';
}

// --------------- STATUS MODIFIER ---------------

function statusDecoration(status: Status): string {
  if (status === 'destroyed') {
    return `<path d="M6,6 L34,34 M34,6 L6,34" stroke="#c80000" stroke-width="3" opacity="0.6"/>`;
  }
  return '';
}

function statusDash(status: Status): string {
  if (status === 'anticipated') return 'stroke-dasharray="4 3"';
  return '';
}

// --------------- PUBLIC API ---------------

/**
 * Generate a MIL-STD-2525D military symbol as a data-URI SVG.
 */
export function generateMilSymbol(
  affiliation: Affiliation,
  dimension: Dimension,
  functionId: string,
  status: Status = 'present',
): string {
  const key = `milsym-${affiliation}-${dimension}-${functionId}-${status}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const fill = FRAME_FILL[affiliation];
  const stroke = FRAME_STROKE[affiliation];
  const dash = statusDash(status);
  const frame = FRAME_BUILDERS[affiliation](fill, stroke, dash);
  const funcKey = mapFunctionId(functionId, dimension);
  const funcIcon = FUNCTION_ICONS[funcKey] ?? FUNCTION_ICONS.unknown_func;
  const statusDeco = statusDecoration(status);

  const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40">
    ${frame}
    <g stroke="${stroke}">${DIM_MODIFIERS[dimension]?.() ?? ''}</g>
    ${funcIcon}
    ${statusDeco}
  </svg>`;

  const result = `data:image/svg+xml,${encodeURIComponent(svgContent)}`;
  cache.set(key, result);
  return result;
}

/**
 * Infer affiliation from faction string.
 */
export function factionToAffiliation(faction: string): Affiliation {
  switch (faction) {
    case 'allied': return 'friendly';
    case 'hostile': return 'hostile';
    case 'neutral': return 'neutral';
    default: return 'unknown';
  }
}

/**
 * Infer dimension from actor class.
 */
export function actorClassToDimension(actorClass: string): Dimension {
  switch (actorClass) {
    case 'orbital': return 'space';
    case 'air': return 'air';
    case 'sea': return 'sea';
    case 'fixed_ground':
    case 'mobile_ground':
      return 'ground';
    case 'weapon': return 'air';
    case 'effect': return 'ground';
    default: return 'ground';
  }
}
