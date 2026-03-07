import { useEffect, useRef, useState } from 'react';
import { getCesium, type CesiumModule } from '@/lib/cesium/loader';
import type { SatelliteDefenseState } from '@/lib/simulation/italyDefenseScenario';

interface SatelliteCoverageConeLayerProps {
  viewer: InstanceType<CesiumModule['Viewer']> | null;
  satellites: SatelliteDefenseState[];
  simulationTime: number;
}

export function SatelliteCoverageConeLayer({
  viewer,
  satellites,
  simulationTime,
}: SatelliteCoverageConeLayerProps) {
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

    satellites.forEach(sat => {
      const pos = sat.currentPosition;
      if (!pos) return;

      // Don't render cone for destroyed satellites
      if (sat.isDestroyed) return;

      // Compute ground footprint radius from altitude and cone angle
      const carto = Cesium.Cartographic.fromCartesian(pos);
      const alt = carto.height;
      const footprintRadius = alt * Math.tan(sat.coverageConeAngle);
      const clampedRadius = Math.min(footprintRadius, 4000000);

      const eff = sat.effectivenessMultiplier;
      const isCyberCompromised = sat.threatStatus === 'cyber_compromised';

      // Color gradient based on effectiveness:
      // >=0.8 green, 0.5-0.8 yellow, 0.3-0.5 orange+pulse, <0.3 red+fast pulse
      let footprintColor: InstanceType<CesiumModule['Color']>;
      let outlineColor: InstanceType<CesiumModule['Color']>;
      let lineColor: InstanceType<CesiumModule['Color']>;
      let labelColor: InstanceType<CesiumModule['Color']>;

      if (eff >= 0.8) {
        footprintColor = Cesium.Color.LIME.withAlpha(0.04);
        outlineColor = Cesium.Color.LIME.withAlpha(0.25);
        lineColor = Cesium.Color.LIME.withAlpha(0.08);
        labelColor = Cesium.Color.LIME.withAlpha(0.7);
      } else if (eff >= 0.5) {
        const pulse = 0.04 + 0.02 * Math.sin(simulationTime * 3);
        footprintColor = Cesium.Color.YELLOW.withAlpha(pulse);
        outlineColor = Cesium.Color.YELLOW.withAlpha(0.4);
        lineColor = Cesium.Color.YELLOW.withAlpha(0.1);
        labelColor = Cesium.Color.YELLOW;
      } else if (eff >= 0.3) {
        const pulse = 0.05 + 0.04 * Math.sin(simulationTime * 5);
        footprintColor = Cesium.Color.ORANGE.withAlpha(pulse);
        outlineColor = Cesium.Color.ORANGE.withAlpha(0.5);
        lineColor = Cesium.Color.ORANGE.withAlpha(0.12);
        labelColor = Cesium.Color.ORANGE;
      } else {
        const pulse = 0.05 + 0.05 * Math.sin(simulationTime * 8);
        footprintColor = Cesium.Color.RED.withAlpha(pulse);
        outlineColor = Cesium.Color.RED.withAlpha(0.6);
        lineColor = Cesium.Color.RED.withAlpha(0.15);
        labelColor = Cesium.Color.RED;
      }

      // Flicker effect for cyber_compromised
      if (isCyberCompromised) {
        const flicker = Math.random() > 0.3; // random flicker
        if (!flicker) {
          footprintColor = Cesium.Color.CYAN.withAlpha(0.02);
          outlineColor = Cesium.Color.CYAN.withAlpha(0.3);
        }
      }

      // Ground footprint ellipse
      const footprintId = `coverage-footprint-${sat.id}`;
      const groundLon = Cesium.Math.toDegrees(carto.longitude);
      const groundLat = Cesium.Math.toDegrees(carto.latitude);
      const groundPos = Cesium.Cartesian3.fromDegrees(groundLon, groundLat, 0);

      viewer.entities.add({
        id: footprintId,
        position: groundPos,
        ellipse: {
          semiMajorAxis: clampedRadius,
          semiMinorAxis: clampedRadius,
          material: new Cesium.ColorMaterialProperty(footprintColor),
          outline: true,
          outlineColor: outlineColor,
          outlineWidth: 2,
          height: 0,
        },
      });
      entitiesRef.current.add(footprintId);

      // Cone lines from satellite to footprint edge (4 cardinal directions)
      const coneAngles = [0, 90, 180, 270];
      coneAngles.forEach((angle, idx) => {
        const lineId = `coverage-cone-${sat.id}-${idx}`;
        const rad = (angle * Math.PI) / 180;
        const edgeLon = groundLon + (clampedRadius / 111320) * Math.cos(rad);
        const edgeLat = groundLat + (clampedRadius / 110540) * Math.sin(rad);
        const edgePos = Cesium.Cartesian3.fromDegrees(edgeLon, edgeLat, 0);

        viewer.entities.add({
          id: lineId,
          polyline: {
            positions: [pos, edgePos],
            width: 1,
            material: lineColor,
          },
        });
        entitiesRef.current.add(lineId);
      });

      // Satellite role label with effectiveness % and threat info
      const labelId = `coverage-label-${sat.id}`;
      const effPercent = Math.round(eff * 100);
      let statusStr = '';
      if (sat.activeThreats.length > 0) {
        statusStr = ` [${sat.activeThreats[0]}]`;
      } else if (eff < 1.0) {
        statusStr = eff >= 0.8 ? '' : ' [DEGRADED]';
      }

      viewer.entities.add({
        id: labelId,
        position: groundPos,
        label: {
          text: `${sat.name}${statusStr}\n${sat.role} | ${effPercent}%`,
          font: '10px monospace',
          fillColor: labelColor,
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 2,
          verticalOrigin: Cesium.VerticalOrigin.CENTER,
          horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
          scaleByDistance: new Cesium.NearFarScalar(500000, 1.0, 5000000, 0.3),
        },
      });
      entitiesRef.current.add(labelId);
    });

    return () => {
      if (viewer && viewer.entities) {
        entitiesRef.current.forEach(id => {
          try { viewer.entities.removeById(id); } catch {}
        });
      }
      entitiesRef.current.clear();
    };
  }, [viewer, satellites, simulationTime, Cesium]);

  return null;
}
