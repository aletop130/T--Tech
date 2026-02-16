export interface Satellite {
  id: string;
  norad_id: number;
  name: string;
  faction?: string;
}

/**
 * Checks if a satellite is classified as allied based on its name.
 * Allied satellites are friendly forces - displayed in BLUE.
 */
export function isAlliedSatellite(sat: Satellite): boolean {
  const name = sat.name?.toLowerCase() || '';
  return (
    name.includes('guardian') ||
    name.includes('deepwatch') ||
    name.includes('terrascan') ||
    name.includes('starfinder') ||
    name.includes('celestial') ||
    name.includes('windwatcher') ||
    name.includes('commlink') ||
    name.includes('weathereye') ||
    name.includes('navbeacon') ||
    name.includes('eyeinsky') ||
    name.includes('reconsat') ||
    name.includes('comsat') ||
    sat.faction === 'allied'
  );
}

/**
 * Checks if a satellite is classified as enemy based on its name.
 *Enemy satellites are unknown/hostile forces - displayed in RED.
 */
export function isEnemySatellite(sat: Satellite): boolean {
  const name = sat.name?.toLowerCase() || '';
  return (
    name.includes('unknown') ||
    name.includes('hostile') ||
    name.includes('suspect') ||
    name.includes('tracked') ||
    name.includes('unidentified') ||
    name.includes('contact')
  );
}
