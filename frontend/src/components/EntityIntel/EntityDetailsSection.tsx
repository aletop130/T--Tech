'use client';

import type { UnifiedEntity } from '@/lib/store/entityIntel';
import type { SandboxActor } from '@/lib/store/sandbox';

function Row({ label, value }: { label: string; value: string | number | null | undefined }) {
  if (value == null || value === '') return null;
  return (
    <div className="flex items-baseline justify-between gap-2 py-0.5">
      <span className="font-code text-[9px] uppercase tracking-wider text-zinc-600">{label}</span>
      <span className="font-code text-[11px] tabular-nums text-zinc-200">{value}</span>
    </div>
  );
}

interface Props {
  entity: UnifiedEntity;
}

export function EntityDetailsSection({ entity }: Props) {
  const pos = entity.position;
  const vel = entity.velocity;

  // Extract extra info from sandbox actors
  const isSandbox = entity.source === 'sandbox_actor';
  const actor = isSandbox ? (entity.rawData as SandboxActor) : null;
  const behavior = actor?.behavior as Record<string, unknown> | undefined;
  const capabilities = actor?.capabilities as Record<string, unknown> | undefined;

  return (
    <div className="space-y-0.5 px-3 py-2">
      {/* Position */}
      {pos && (
        <>
          <Row label="Latitude" value={pos.lat.toFixed(5) + '°'} />
          <Row label="Longitude" value={pos.lon.toFixed(5) + '°'} />
          <Row
            label="Altitude"
            value={
              pos.alt_m > 10_000
                ? (pos.alt_m / 1000).toFixed(1) + ' km'
                : pos.alt_m.toFixed(0) + ' m'
            }
          />
        </>
      )}

      {/* Velocity */}
      {vel && (
        <>
          <Row
            label="Speed"
            value={
              vel.speed_ms > 100
                ? (vel.speed_ms * 3.6).toFixed(0) + ' km/h'
                : vel.speed_ms.toFixed(1) + ' m/s'
            }
          />
          <Row label="Heading" value={vel.heading_deg.toFixed(1) + '°'} />
        </>
      )}

      {/* Sandbox-specific */}
      {behavior && (
        <Row
          label="Behavior"
          value={String(behavior.type ?? 'hold').replace('_', ' ').toUpperCase()}
        />
      )}
      {capabilities?.coverage_radius_km != null && (
        <Row
          label="Coverage"
          value={Number(capabilities.coverage_radius_km).toFixed(0) + ' km'}
        />
      )}

      {/* Source-specific extras */}
      {entity.source === 'live_aircraft' && (
        <>
          <Row label="ICAO24" value={(entity.rawData as Record<string, unknown>).icao24 as string} />
          <Row label="Callsign" value={(entity.rawData as Record<string, unknown>).callsign as string} />
        </>
      )}
      {entity.source === 'live_vessel' && (
        <>
          <Row label="MMSI" value={String((entity.rawData as Record<string, unknown>).mmsi)} />
          <Row label="Destination" value={(entity.rawData as Record<string, unknown>).destination as string} />
          <Row label="Ship Type" value={(entity.rawData as Record<string, unknown>).ship_type as string} />
        </>
      )}
    </div>
  );
}
