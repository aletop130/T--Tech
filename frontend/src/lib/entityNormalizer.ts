import type {
  SandboxActor,
  SandboxFaction,
  SandboxPosition,
} from '@/lib/store/sandbox';
import type {
  UnifiedEntity,
  EntityDomain,
  EntitySource,
} from '@/lib/store/entityIntel';
import type {
  AircraftPosition,
  GroundStation,
  PositionReport,
  SatelliteDetail,
  VesselPosition,
} from '@/lib/api';

// --------------- HELPERS ---------------

function actorDomain(actorClass: string): EntityDomain {
  switch (actorClass) {
    case 'orbital':
      return 'space';
    case 'air':
      return 'air';
    case 'sea':
      return 'maritime';
    case 'fixed_ground':
    case 'mobile_ground':
      return 'ground';
    default:
      return 'tactical';
  }
}

function pos(p: unknown): { lat: number; lon: number; alt_m: number } | null {
  if (!p || typeof p !== 'object') return null;
  const o = p as Record<string, unknown>;
  const lat = Number(o.lat ?? o.latitude ?? 0);
  const lon = Number(o.lon ?? o.longitude ?? 0);
  const alt = Number(o.alt_m ?? o.altitude_m ?? 0);
  if (!isFinite(lat) || !isFinite(lon)) return null;
  return { lat, lon, alt_m: alt };
}

// --------------- NORMALIZERS ---------------

export function normalizeSandboxActor(actor: SandboxActor): UnifiedEntity {
  const state = actor.state as Record<string, unknown>;
  return {
    id: actor.id,
    name: actor.label,
    entityType: actor.actor_type,
    subtype: actor.subtype,
    domain: actorDomain(actor.actor_class),
    source: 'sandbox_actor',
    faction: actor.faction,
    position: pos(state.position),
    velocity:
      state.speed_ms != null
        ? {
            speed_ms: Number(state.speed_ms ?? 0),
            heading_deg: Number(state.heading_deg ?? 0),
          }
        : null,
    lastUpdated: actor.updated_at,
    rawData: actor,
  };
}

export function normalizeLiveSatellite(sat: SatelliteDetail): UnifiedEntity {
  return {
    id: String(sat.id),
    name: sat.name,
    entityType: 'satellite',
    subtype: sat.object_type ?? null,
    domain: 'space',
    source: 'live_satellite',
    faction: (sat as unknown as Record<string, unknown>).faction as SandboxFaction ?? 'unknown',
    position: null,
    velocity: null,
    lastUpdated: sat.updated_at ?? new Date().toISOString(),
    rawData: sat,
  };
}

export function normalizeLiveStation(station: GroundStation): UnifiedEntity {
  return {
    id: String(station.id),
    name: station.name,
    entityType: 'ground_station',
    domain: 'ground',
    source: 'live_station',
    faction: 'allied',
    position: {
      lat: station.latitude,
      lon: station.longitude,
      alt_m: station.elevation_m ?? 0,
    },
    velocity: null,
    lastUpdated: new Date().toISOString(),
    rawData: station,
  };
}

export function normalizeLiveVehicle(v: PositionReport): UnifiedEntity {
  const vr = v as unknown as Record<string, unknown>;
  return {
    id: String(vr.id ?? vr.entity_id ?? ''),
    name: String(vr.entity_id ?? vr.name ?? 'Vehicle'),
    entityType: 'vehicle',
    domain: 'ground',
    source: 'live_vehicle',
    faction: 'neutral',
    position: {
      lat: Number(vr.latitude ?? 0),
      lon: Number(vr.longitude ?? 0),
      alt_m: 0,
    },
    velocity: null,
    lastUpdated: String(vr.timestamp ?? new Date().toISOString()),
    rawData: v,
  };
}

export function normalizeLiveAircraft(ac: AircraftPosition): UnifiedEntity {
  return {
    id: ac.icao24,
    name: ac.callsign?.trim() || ac.icao24,
    entityType: 'aircraft',
    domain: 'air',
    source: 'live_aircraft',
    faction: 'unknown',
    position:
      ac.latitude != null && ac.longitude != null
        ? { lat: ac.latitude, lon: ac.longitude, alt_m: ac.altitude_m ?? 0 }
        : null,
    velocity:
      ac.speed_ms != null
        ? { speed_ms: ac.speed_ms, heading_deg: ac.heading_deg ?? 0 }
        : null,
    lastUpdated: ac.last_seen ?? new Date().toISOString(),
    rawData: ac,
  };
}

export function normalizeLiveVessel(v: VesselPosition): UnifiedEntity {
  return {
    id: String(v.mmsi),
    name: v.name?.trim() || String(v.mmsi),
    entityType: 'ship',
    subtype: v.ship_type != null ? String(v.ship_type) : null,
    domain: 'maritime',
    source: 'live_vessel',
    faction: 'unknown',
    position:
      v.latitude != null && v.longitude != null
        ? { lat: v.latitude, lon: v.longitude, alt_m: 0 }
        : null,
    velocity:
      v.speed_knots != null
        ? { speed_ms: v.speed_knots * 0.51444, heading_deg: v.heading_deg ?? v.course ?? 0 }
        : null,
    lastUpdated: v.last_seen ?? new Date().toISOString(),
    rawData: v,
  };
}
