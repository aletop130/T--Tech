import { useEffect, useRef, useState } from 'react';
import { getCesium, type CesiumModule } from '@/lib/cesium/loader';
import type { DefenseBaseState } from '@/lib/simulation/italyDefenseScenario';

interface DefenseDomeLayerProps {
  viewer: InstanceType<CesiumModule['Viewer']> | null;
  bases: DefenseBaseState[];
  simulationTime: number;
}

export function DefenseDomeLayer({ viewer, bases, simulationTime }: DefenseDomeLayerProps) {
  const entitiesRef = useRef<Set<string>>(new Set());
  const [Cesium, setCesium] = useState<CesiumModule | null>(null);

  useEffect(() => {
    getCesium().then(setCesium);
  }, []);

  useEffect(() => {
    if (!viewer || !Cesium || !viewer.entities) return;

    // Clean up old entities
    entitiesRef.current.forEach(id => {
      viewer.entities.removeById(id);
    });
    entitiesRef.current.clear();

    bases.forEach(bs => {
      const { base, status } = bs;
      const basePos = Cesium.Cartesian3.fromDegrees(base.position.lon, base.position.lat, 0);

      const isEngaged = status === 'firing' || status === 'engaged';
      const isDamaged = status === 'damaged';

      // Ground ring (ellipse)
      const ringId = `defense-ring-${base.id}`;
      const ringColor = isDamaged
        ? Cesium.Color.RED.withAlpha(0.3)
        : isEngaged
          ? Cesium.Color.RED.withAlpha(0.15)
          : Cesium.Color.CYAN.withAlpha(0.08);

      const ringOutlineColor = isDamaged
        ? Cesium.Color.RED
        : isEngaged
          ? Cesium.Color.ORANGE
          : Cesium.Color.CYAN.withAlpha(0.4);

      viewer.entities.add({
        id: ringId,
        position: basePos,
        ellipse: {
          semiMajorAxis: base.defenseRadius,
          semiMinorAxis: base.defenseRadius,
          material: new Cesium.ColorMaterialProperty(
            new Cesium.CallbackProperty(() => {
              if (isDamaged) return Cesium.Color.RED.withAlpha(0.2);
              if (isEngaged) {
                const pulse = 0.08 + 0.07 * Math.sin(simulationTime * 4);
                return Cesium.Color.RED.withAlpha(pulse);
              }
              return Cesium.Color.CYAN.withAlpha(0.04);
            }, false) as any
          ),
          outline: true,
          outlineColor: ringOutlineColor,
          outlineWidth: 2,
          height: 0,
        },
      });
      entitiesRef.current.add(ringId);

      // Dome hemisphere (ellipsoid raised above ground)
      const domeId = `defense-dome-${base.id}`;
      const domeHeight = base.defenseRadius * 0.4;
      const domeCenterPos = Cesium.Cartesian3.fromDegrees(
        base.position.lon,
        base.position.lat,
        domeHeight / 2
      );

      viewer.entities.add({
        id: domeId,
        position: domeCenterPos,
        ellipsoid: {
          radii: new Cesium.Cartesian3(base.defenseRadius, base.defenseRadius, domeHeight),
          material: new Cesium.ColorMaterialProperty(
            new Cesium.CallbackProperty(() => {
              if (isDamaged) return Cesium.Color.RED.withAlpha(0.06);
              if (isEngaged) {
                const pulse = 0.04 + 0.04 * Math.sin(simulationTime * 5);
                return Cesium.Color.RED.withAlpha(pulse);
              }
              return Cesium.Color.CYAN.withAlpha(0.03);
            }, false) as any
          ),
          outline: true,
          outlineColor: new Cesium.CallbackProperty(() => {
            if (isDamaged) return Cesium.Color.RED.withAlpha(0.4);
            if (isEngaged) return Cesium.Color.ORANGE.withAlpha(0.5);
            return Cesium.Color.CYAN.withAlpha(0.15);
          }, false) as any,
          outlineWidth: 1,
        },
      });
      entitiesRef.current.add(domeId);

      // Base marker point
      const markerId = `defense-marker-${base.id}`;
      const markerColor = isDamaged
        ? Cesium.Color.RED
        : isEngaged
          ? Cesium.Color.ORANGE
          : Cesium.Color.CYAN;

      viewer.entities.add({
        id: markerId,
        position: basePos,
        point: {
          pixelSize: 14,
          color: markerColor,
          outlineColor: Cesium.Color.WHITE,
          outlineWidth: 2,
        },
        label: {
          text: `${base.name}\n${base.operator}`,
          font: 'bold 12px monospace',
          fillColor: Cesium.Color.WHITE,
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 3,
          verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
          pixelOffset: new Cesium.Cartesian2(0, -20),
          show: true,
          scaleByDistance: new Cesium.NearFarScalar(100000, 1.0, 3000000, 0.3),
        },
      });
      entitiesRef.current.add(markerId);

      // Status label
      const statusId = `defense-status-${base.id}`;
      const statusText = isDamaged ? 'DAMAGED' : isEngaged ? 'ENGAGING' : 'READY';
      const statusColor = isDamaged
        ? Cesium.Color.RED
        : isEngaged
          ? Cesium.Color.ORANGE
          : Cesium.Color.LIME;

      viewer.entities.add({
        id: statusId,
        position: basePos,
        label: {
          text: statusText,
          font: 'bold 10px monospace',
          fillColor: statusColor,
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 2,
          verticalOrigin: Cesium.VerticalOrigin.TOP,
          pixelOffset: new Cesium.Cartesian2(0, 10),
          scaleByDistance: new Cesium.NearFarScalar(100000, 1.0, 3000000, 0.3),
        },
      });
      entitiesRef.current.add(statusId);
    });

    return () => {
      if (viewer && viewer.entities) {
        entitiesRef.current.forEach(id => {
          try { viewer.entities.removeById(id); } catch {}
        });
      }
      entitiesRef.current.clear();
    };
  }, [viewer, bases, simulationTime, Cesium]);

  return null;
}
