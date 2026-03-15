'use client';

import { useEffect, useRef, useState } from 'react';

import { getCesium, type CesiumModule } from '@/lib/cesium/loader';
import type { SandboxActor } from '@/lib/store/sandbox';
import { getEntityIcon, inferActorIcon } from '@/lib/cesium/entity-icons';

const FACTION_COLORS: Record<string, string> = {
  allied: '#22d3ee',
  hostile: '#ef4444',
  neutral: '#fbbf24',
  unknown: '#a1a1aa',
};

function actorColor(actor: SandboxActor): string {
  if (typeof actor.visual_config.color === 'string') return actor.visual_config.color;
  return FACTION_COLORS[actor.faction] ?? '#fbbf24';
}

function actorPointSize(actor: SandboxActor, isSelected: boolean): number {
  const baseSize = actor.subtype === 'drone' ? 8 : 10;
  return isSelected ? baseSize + 4 : baseSize;
}

interface SandboxActorLayerProps {
  viewer: InstanceType<CesiumModule['Viewer']> | null;
  actors: SandboxActor[];
  selectedActorId?: string | null;
  onSelectActor?: (actorId: string | null) => void;
  selectionEnabled?: boolean;
}

export function SandboxActorLayer({
  viewer,
  actors,
  selectedActorId,
  onSelectActor,
  selectionEnabled = true,
}: SandboxActorLayerProps) {
  const cleanupRef = useRef<(() => void) | null>(null);
  const [Cesium, setCesium] = useState<CesiumModule | null>(null);

  useEffect(() => {
    getCesium().then(setCesium);
  }, []);

  // Click-to-select handler
  useEffect(() => {
    if (!viewer || !Cesium || !onSelectActor || !selectionEnabled) return;

    const handler = new Cesium.ScreenSpaceEventHandler(viewer.canvas);
    handler.setInputAction((movement: { position?: { x: number; y: number } }) => {
      if (!movement.position) return;
      const picked = viewer.scene.pick(new Cesium.Cartesian2(movement.position.x, movement.position.y));
      if (Cesium.defined(picked) && picked.id?.properties) {
        const aid = picked.id.properties.sandboxActorId;
        if (aid) {
          const value = typeof aid.getValue === 'function' ? aid.getValue() : aid;
          if (typeof value === 'string') {
            onSelectActor(value);
            return;
          }
        }
      }
      // Clicked empty space -> deselect
      onSelectActor(null);
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

    return () => { handler.destroy(); };
  }, [Cesium, viewer, onSelectActor, selectionEnabled]);

  // Render entities
  useEffect(() => {
    if (!viewer || !Cesium || !viewer.entities) return;

    cleanupRef.current?.();
    const entityIds = new Set<string>();

    actors.forEach((actor) => {
      const actorId = `sandbox-actor-${actor.id}`;
      const position = actor.state.position as { lat?: number; lon?: number; alt_m?: number } | undefined;
      const lat = position?.lat ?? 0;
      const lon = position?.lon ?? 0;
      const alt = position?.alt_m ?? 0;
      const cssColor = actorColor(actor);
      const color = Cesium.Color.fromCssColorString(cssColor);
      const isSelected = actor.id === selectedActorId;

      const iconType = inferActorIcon(actor.actor_class, actor.actor_type, actor.subtype);
      const iconSize = isSelected ? 32 : 24;
      viewer.entities.add({
        id: actorId,
        name: actor.label,
        position: Cesium.Cartesian3.fromDegrees(lon, lat, alt),
        billboard: {
          image: getEntityIcon(iconType, cssColor),
          width: iconSize,
          height: iconSize,
          heightReference:
            actor.actor_class === 'orbital'
              ? Cesium.HeightReference.NONE
              : Cesium.HeightReference.CLAMP_TO_GROUND,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
        label: {
          text: actor.label,
          font: isSelected ? 'bold 13px Google Sans' : '12px Google Sans',
          fillColor: color,
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 3,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
          pixelOffset: new Cesium.Cartesian2(0, -18),
        },
        properties: {
          sandboxActorId: actor.id,
          actorType: actor.actor_type,
        },
      });
      entityIds.add(actorId);

      // Coverage circle for stations/defended zones
      if (actor.actor_type === 'defended_zone' || actor.actor_type === 'ground_station') {
        const radiusKm = Number(actor.capabilities.coverage_radius_km ?? 0);
        if (radiusKm > 0) {
          const coverageId = `${actorId}-coverage`;
          viewer.entities.add({
            id: coverageId,
            position: Cesium.Cartesian3.fromDegrees(lon, lat, 0),
            ellipse: {
              semiMajorAxis: radiusKm * 1000,
              semiMinorAxis: radiusKm * 1000,
              material: color.withAlpha(0.12),
              outline: true,
              outlineColor: color.withAlpha(0.75),
              height: 0,
            },
          });
          entityIds.add(coverageId);
        }
      }

      // Behavior target line (move_to / approach_target)
      const behavior = actor.behavior as Record<string, unknown>;
      const target = behavior.target as { lat?: number; lon?: number; alt_m?: number } | undefined;
      if ((behavior.type === 'move_to' || behavior.type === 'approach_target') && target?.lat != null && target?.lon != null) {
        const lineId = `${actorId}-target-line`;
        viewer.entities.add({
          id: lineId,
          polyline: {
            positions: [
              Cesium.Cartesian3.fromDegrees(lon, lat, alt),
              Cesium.Cartesian3.fromDegrees(target.lon, target.lat, target.alt_m ?? alt),
            ],
            width: 2,
            material: new Cesium.PolylineDashMaterialProperty({
              color: color.withAlpha(0.6),
              dashLength: 12,
            }),
            clampToGround: actor.actor_class !== 'orbital',
          },
        });
        entityIds.add(lineId);
      }

      // Patrol waypoints
      const waypoints = behavior.waypoints as Array<{ lat: number; lon: number; alt_m?: number }> | undefined;
      if ((behavior.type === 'patrol_loop' || behavior.type === 'follow_waypoints') && waypoints && waypoints.length > 1) {
        const waypointPositions = waypoints.map((w) =>
          Cesium.Cartesian3.fromDegrees(w.lon, w.lat, w.alt_m ?? 0),
        );
        if (behavior.type === 'patrol_loop') {
          waypointPositions.push(waypointPositions[0]);
        }
        const routeId = `${actorId}-route`;
        viewer.entities.add({
          id: routeId,
          polyline: {
            positions: waypointPositions,
            width: 2,
            material: new Cesium.PolylineDashMaterialProperty({
              color: color.withAlpha(0.5),
              dashLength: 8,
            }),
            clampToGround: actor.actor_class !== 'orbital',
          },
        });
        entityIds.add(routeId);
      }
    });

    cleanupRef.current = () => {
      entityIds.forEach((id) => {
        const entity = viewer.entities.getById(id);
        if (entity) viewer.entities.remove(entity);
      });
    };

    return () => {
      cleanupRef.current?.();
      cleanupRef.current = null;
    };
  }, [Cesium, actors, selectedActorId, viewer]);

  return null;
}
