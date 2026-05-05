'use client';

import { useEffect, useRef } from 'react';
import { getCesium, type CesiumModule } from '@/lib/cesium/loader';
import type { SandboxActor, SandboxPosition } from '@/lib/store/sandbox';

// --------------- CONNECTION TYPES ---------------

interface ConnectionLine {
  id: string;
  fromPos: SandboxPosition;
  toPos: SandboxPosition;
  type: 'command' | 'sensor' | 'data_feed';
  color: string;
  dashPattern: number;
  width: number;
}

const LINE_STYLES = {
  command:   { color: '#00d4ff', dashPattern: 0, width: 1.5 },      // solid cyan
  sensor:    { color: '#fbbf24', dashPattern: 255, width: 1 },       // dashed yellow
  data_feed: { color: '#22c55e', dashPattern: 3855, width: 1 },      // dotted green
};

// --------------- HELPERS ---------------

function getActorPos(actor: SandboxActor): SandboxPosition | null {
  const state = actor.state as Record<string, unknown>;
  const pos = state.position as { lat?: number; lon?: number; alt_m?: number } | undefined;
  if (!pos || pos.lat == null || pos.lon == null) return null;
  return { lat: Number(pos.lat), lon: Number(pos.lon), alt_m: Number(pos.alt_m ?? 0) };
}

function deriveConnections(actors: SandboxActor[]): ConnectionLine[] {
  const lines: ConnectionLine[] = [];
  const bases = actors.filter((a) => a.actor_type === 'base' || a.actor_type === 'hq');
  const stations = actors.filter((a) => a.actor_type === 'ground_station');

  for (const actor of actors) {
    const pos = getActorPos(actor);
    if (!pos) continue;

    // Command links: bases/HQs → same-faction units
    if (actor.actor_type !== 'base' && actor.actor_type !== 'hq' && actor.actor_type !== 'ground_station') {
      for (const base of bases) {
        if (base.faction !== actor.faction) continue;
        const basePos = getActorPos(base);
        if (!basePos) continue;
        lines.push({
          id: `cmd-${base.id}-${actor.id}`,
          fromPos: basePos,
          toPos: pos,
          type: 'command',
          ...LINE_STYLES.command,
        });
      }
    }

    // Data feed: stations → same-faction satellites
    if (actor.actor_class === 'orbital') {
      for (const station of stations) {
        if (station.faction !== actor.faction) continue;
        const stationPos = getActorPos(station);
        if (!stationPos) continue;
        lines.push({
          id: `data-${station.id}-${actor.id}`,
          fromPos: stationPos,
          toPos: pos,
          type: 'data_feed',
          ...LINE_STYLES.data_feed,
        });
      }
    }

    // Sensor line: approaching target — find nearest hostile
    const behavior = actor.behavior as Record<string, unknown>;
    if (behavior.type === 'approach_target' && behavior.target) {
      const target = behavior.target as { lat?: number; lon?: number; alt_m?: number };
      if (target.lat != null && target.lon != null) {
        lines.push({
          id: `sensor-${actor.id}`,
          fromPos: pos,
          toPos: { lat: Number(target.lat), lon: Number(target.lon), alt_m: Number(target.alt_m ?? 0) },
          type: 'sensor',
          ...LINE_STYLES.sensor,
        });
      }
    }
  }

  return lines;
}

// --------------- COMPONENT ---------------

interface Props {
  viewer: InstanceType<CesiumModule['Viewer']>;
  actors: SandboxActor[];
}

export function ConnectionLinesLayer({ viewer, actors }: Props) {
  const entityIdsRef = useRef<string[]>([]);

  useEffect(() => {
    let cancelled = false;

    const render = async () => {
      const Cesium = await getCesium();
      if (cancelled) return;

      // Cleanup
      for (const eid of entityIdsRef.current) {
        const entity = viewer.entities.getById(eid);
        if (entity) viewer.entities.remove(entity);
      }
      entityIdsRef.current = [];

      const lines = deriveConnections(actors);

      for (const line of lines) {
        const from = Cesium.Cartesian3.fromDegrees(line.fromPos.lon, line.fromPos.lat, Math.max(line.fromPos.alt_m, 50));
        const to = Cesium.Cartesian3.fromDegrees(line.toPos.lon, line.toPos.lat, Math.max(line.toPos.alt_m, 50));

        viewer.entities.add({
          id: `connline-${line.id}`,
          polyline: {
            positions: [from, to],
            width: line.width,
            material: line.dashPattern
              ? new Cesium.PolylineDashMaterialProperty({
                  color: Cesium.Color.fromCssColorString(line.color).withAlpha(0.4),
                  dashPattern: line.dashPattern,
                })
              : Cesium.Color.fromCssColorString(line.color).withAlpha(0.3),
            clampToGround: false,
          },
        } as any);
        entityIdsRef.current.push(`connline-${line.id}`);
      }
    };

    void render();

    return () => {
      cancelled = true;
      for (const eid of entityIdsRef.current) {
        const entity = viewer.entities.getById(eid);
        if (entity) viewer.entities.remove(entity);
      }
      entityIdsRef.current = [];
    };
  }, [actors, viewer]);

  return null;
}
