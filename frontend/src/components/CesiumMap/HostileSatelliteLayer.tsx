import { useEffect, useRef, useState } from 'react';
import { getCesium, type CesiumModule } from '@/lib/cesium/loader';
import type { HostileSatelliteState, SatelliteDefenseState } from '@/lib/simulation/italyDefenseScenario';

interface HostileSatelliteLayerProps {
  viewer: InstanceType<CesiumModule['Viewer']> | null;
  hostileSatellites: HostileSatelliteState[];
  satellites: SatelliteDefenseState[];
  simulationTime: number;
}

export function HostileSatelliteLayer({
  viewer,
  hostileSatellites,
  satellites,
  simulationTime,
}: HostileSatelliteLayerProps) {
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

    hostileSatellites.forEach(h => {
      if (h.status === 'dormant') return;

      const isDanger = h.status === 'proximate';
      const isManeuvering = h.status === 'maneuvering';
      const isResolved = h.status === 'neutralized' || h.status === 'evaded';

      // Determine color based on status
      let pointColor: InstanceType<CesiumModule['Color']>;
      let outlineColor: InstanceType<CesiumModule['Color']>;
      let labelColor: InstanceType<CesiumModule['Color']>;
      let pixelSize: number;

      if (isResolved) {
        pointColor = Cesium.Color.GRAY;
        outlineColor = Cesium.Color.DARKGRAY;
        labelColor = Cesium.Color.GRAY;
        pixelSize = 8;
      } else if (isDanger) {
        // Red pulsing for danger
        const pulse = 10 + 6 * Math.sin(simulationTime * 6);
        pointColor = Cesium.Color.RED;
        outlineColor = Cesium.Color.ORANGERED;
        labelColor = Cesium.Color.RED;
        pixelSize = pulse;
      } else if (isManeuvering) {
        // Orange when approaching
        const pulse = 8 + 3 * Math.sin(simulationTime * 4);
        pointColor = Cesium.Color.ORANGE;
        outlineColor = Cesium.Color.DARKORANGE;
        labelColor = Cesium.Color.ORANGE;
        pixelSize = pulse;
      } else {
        pointColor = Cesium.Color.YELLOW;
        outlineColor = Cesium.Color.GOLD;
        labelColor = Cesium.Color.YELLOW;
        pixelSize = 8;
      }

      // Hostile satellite point marker
      const markerId = `hostile-sat-${h.id}`;
      const statusLabel = isResolved ? (h.status === 'neutralized' ? 'NEUTRALIZED' : 'EVADED') :
        isDanger ? 'DANGER' : 'TRACKING';
      const typeLabel = h.data.type === 'killer' ? 'KILLER' : 'INSPECTOR';

      viewer.entities.add({
        id: markerId,
        position: h.currentPosition,
        point: {
          pixelSize,
          color: pointColor,
          outlineColor,
          outlineWidth: 3,
        },
        label: {
          text: `${h.data.name}\n[${typeLabel}] ${statusLabel}`,
          font: 'bold 10px monospace',
          fillColor: labelColor,
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 2,
          verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
          pixelOffset: new Cesium.Cartesian2(0, -18),
          scaleByDistance: new Cesium.NearFarScalar(200000, 1.0, 8000000, 0.25),
        },
      });
      entitiesRef.current.add(markerId);

      // Proximity warning polyline to target allied satellite
      if (!isResolved) {
        const targetSat = satellites.find(s => s.id === h.data.targetSatelliteId);
        if (targetSat && targetSat.currentPosition) {
          const lineId = `hostile-line-${h.id}`;
          const lineColor = isDanger
            ? Cesium.Color.RED.withAlpha(0.6 + 0.3 * Math.sin(simulationTime * 5))
            : Cesium.Color.ORANGE.withAlpha(0.3);

          viewer.entities.add({
            id: lineId,
            polyline: {
              positions: [h.currentPosition, targetSat.currentPosition],
              width: isDanger ? 3 : 1.5,
              material: new Cesium.PolylineDashMaterialProperty({
                color: lineColor,
                dashLength: isDanger ? 8 : 16,
              }),
            },
          });
          entitiesRef.current.add(lineId);

          // Distance label at midpoint
          if (h.distanceToTarget < Infinity) {
            const midpoint = Cesium.Cartesian3.lerp(
              h.currentPosition, targetSat.currentPosition, 0.5, new Cesium.Cartesian3()
            );
            const distLabelId = `hostile-dist-${h.id}`;
            const distKm = Math.round(h.distanceToTarget / 1000);
            viewer.entities.add({
              id: distLabelId,
              position: midpoint,
              label: {
                text: `${distKm} km`,
                font: '9px monospace',
                fillColor: isDanger ? Cesium.Color.RED : Cesium.Color.ORANGE,
                outlineColor: Cesium.Color.BLACK,
                outlineWidth: 2,
                verticalOrigin: Cesium.VerticalOrigin.CENTER,
                horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
                scaleByDistance: new Cesium.NearFarScalar(200000, 1.0, 8000000, 0.2),
              },
            });
            entitiesRef.current.add(distLabelId);
          }
        }
      }
    });

    return () => {
      if (viewer && viewer.entities) {
        entitiesRef.current.forEach(id => {
          try { viewer.entities.removeById(id); } catch {}
        });
      }
      entitiesRef.current.clear();
    };
  }, [viewer, hostileSatellites, satellites, simulationTime, Cesium]);

  return null;
}
