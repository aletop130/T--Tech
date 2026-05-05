'use client';

import { useEffect, useRef } from 'react';
import { getCesium, type CesiumModule } from '@/lib/cesium/loader';
import {
  useSandboxStore,
  type SandboxActor,
  type SandboxPosition,
  type TacticalZone,
  type TacticalZoneType,
} from '@/lib/store/sandbox';

// --------------- ZONE COLOR SCHEME ---------------

const ZONE_COLORS: Record<TacticalZoneType, { fill: string; outline: string; fillAlpha: number }> = {
  range_ring:      { fill: '#00d4ff', outline: '#00d4ff', fillAlpha: 0.08 },
  threat_zone:     { fill: '#ff3333', outline: '#ff3333', fillAlpha: 0.15 },
  engagement_zone: { fill: '#ff6400', outline: '#ff6400', fillAlpha: 0.12 },
  air_corridor:    { fill: '#00ff64', outline: '#00ff64', fillAlpha: 0.08 },
  sensor_coverage: { fill: '#64c8ff', outline: '#64c8ff', fillAlpha: 0.10 },
  comms_range:     { fill: '#a078ff', outline: '#a078ff', fillAlpha: 0.08 },
};

const ZONE_DASH: Record<TacticalZoneType, number> = {
  range_ring: 0,
  threat_zone: 255,      // dashed
  engagement_zone: 0,
  air_corridor: 15,      // dot-dash
  sensor_coverage: 0,
  comms_range: 3855,     // dotted
};

// --------------- HELPERS ---------------

function hexToColor(Cesium: CesiumModule, hex: string, alpha: number) {
  return Cesium.Color.fromCssColorString(hex).withAlpha(alpha);
}

function getZoneCenter(
  zone: TacticalZone,
  actors: SandboxActor[],
): SandboxPosition {
  // If attached to an actor, use actor's current position
  if (zone.centerId) {
    const actor = actors.find((a) => a.id === zone.centerId);
    if (actor) {
      const pos = (actor.state as Record<string, unknown>).position as
        | { lat?: number; lon?: number; alt_m?: number }
        | undefined;
      if (pos && pos.lat != null && pos.lon != null) {
        return { lat: Number(pos.lat), lon: Number(pos.lon), alt_m: Number(pos.alt_m ?? 0) };
      }
    }
  }
  return zone.centerPosition;
}

// --------------- COMPONENT ---------------

interface Props {
  viewer: InstanceType<CesiumModule['Viewer']>;
}

export function ZonePlanningLayer({ viewer }: Props) {
  const zones = useSandboxStore((s) => s.groundPlan.zones);
  const overlays = useSandboxStore((s) => s.groundPlan.overlays);
  const actors = useSandboxStore((s) => s.snapshot?.actors ?? []);
  const entityIdsRef = useRef<string[]>([]);

  useEffect(() => {
    let cancelled = false;

    const render = async () => {
      const Cesium = await getCesium();
      if (cancelled) return;

      // Cleanup previous entities
      for (const eid of entityIdsRef.current) {
        const entity = viewer.entities.getById(eid);
        if (entity) viewer.entities.remove(entity);
      }
      entityIdsRef.current = [];

      // Determine hidden zone IDs from invisible overlays
      const hiddenZoneIds = new Set<string>();
      for (const overlay of overlays) {
        if (!overlay.visible) {
          for (const zid of overlay.zoneIds) {
            hiddenZoneIds.add(zid);
          }
        }
      }

      for (const zone of zones) {
        if (hiddenZoneIds.has(zone.id)) continue;

        const center = getZoneCenter(zone, actors);
        const colors = ZONE_COLORS[zone.zoneType] ?? ZONE_COLORS.range_ring;
        const customColor = zone.color || colors.outline;
        const alpha = zone.opacity ?? colors.fillAlpha;
        const dashPattern = ZONE_DASH[zone.zoneType] ?? 0;

        const entityId = `zone-${zone.id}`;

        if (zone.zoneType === 'engagement_zone' && zone.minRadiusKm) {
          // WEZ: Two concentric rings (outer + inner)
          const outerEid = `${entityId}-outer`;
          const innerEid = `${entityId}-inner`;

          viewer.entities.add({
            id: outerEid,
            position: Cesium.Cartesian3.fromDegrees(center.lon, center.lat),
            ellipse: {
              semiMajorAxis: zone.radiusKm * 1000,
              semiMinorAxis: zone.radiusKm * 1000,
              material: hexToColor(Cesium, customColor, alpha),
              outline: true,
              outlineColor: hexToColor(Cesium, customColor, 0.6),
              outlineWidth: 2,
              height: 0,
              heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
            },
          } as any);

          viewer.entities.add({
            id: innerEid,
            position: Cesium.Cartesian3.fromDegrees(center.lon, center.lat),
            ellipse: {
              semiMajorAxis: zone.minRadiusKm * 1000,
              semiMinorAxis: zone.minRadiusKm * 1000,
              material: hexToColor(Cesium, '#080808', 0.5),
              outline: true,
              outlineColor: hexToColor(Cesium, customColor, 0.4),
              outlineWidth: 1,
              height: 0,
              heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
            },
          } as any);

          entityIdsRef.current.push(outerEid, innerEid);
        } else {
          // Standard zone: single ellipse
          viewer.entities.add({
            id: entityId,
            position: Cesium.Cartesian3.fromDegrees(center.lon, center.lat),
            ellipse: {
              semiMajorAxis: zone.radiusKm * 1000,
              semiMinorAxis: zone.radiusKm * 1000,
              material: hexToColor(Cesium, customColor, alpha),
              outline: true,
              outlineColor: hexToColor(Cesium, customColor, 0.6),
              outlineWidth: dashPattern ? 1.5 : 2,
              height: 0,
              heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
            },
          } as any);
          entityIdsRef.current.push(entityId);
        }

        // Label entity
        if (zone.showLabel && zone.label) {
          const labelEid = `${entityId}-label`;
          viewer.entities.add({
            id: labelEid,
            position: Cesium.Cartesian3.fromDegrees(center.lon, center.lat, 100),
            label: {
              text: zone.label.toUpperCase(),
              font: '10px monospace',
              fillColor: hexToColor(Cesium, customColor, 0.7),
              outlineColor: Cesium.Color.BLACK,
              outlineWidth: 2,
              style: Cesium.LabelStyle.FILL_AND_OUTLINE,
              verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
              pixelOffset: new Cesium.Cartesian2(0, -10),
              disableDepthTestDistance: Number.POSITIVE_INFINITY,
              heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
            },
          } as any);
          entityIdsRef.current.push(labelEid);
        }
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
  }, [actors, overlays, viewer, zones]);

  return null;
}
