import { useEffect, useRef, useState } from 'react';
import { getCesium, type CesiumModule } from '@/lib/cesium/loader';
import type { ASATMissileState } from '@/lib/simulation/italyDefenseScenario';

interface ASATTrajectoryLayerProps {
  viewer: InstanceType<CesiumModule['Viewer']> | null;
  asatMissiles: ASATMissileState[];
  simulationTime: number;
}

export function ASATTrajectoryLayer({
  viewer,
  asatMissiles,
  simulationTime,
}: ASATTrajectoryLayerProps) {
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

    asatMissiles.forEach(a => {
      if (a.status === 'waiting') return;

      const isActive = a.status === 'inflight';
      const isEvaded = a.status === 'evaded';
      const isIntercepted = a.status === 'intercepted';
      const isHit = a.status === 'hit_satellite';

      // Full trajectory arc (magenta/purple)
      const arcId = `asat-arc-${a.id}`;
      viewer.entities.add({
        id: arcId,
        polyline: {
          positions: a.trajectoryPoints,
          width: 2,
          material: new Cesium.PolylineGlowMaterialProperty({
            glowPower: 0.15,
            color: (isEvaded || isIntercepted)
              ? Cesium.Color.GRAY.withAlpha(0.3)
              : Cesium.Color.MAGENTA.withAlpha(0.25),
          }),
        },
      });
      entitiesRef.current.add(arcId);

      // Trail (portion traveled so far)
      if (isActive && a.progress > 0) {
        const trailId = `asat-trail-${a.id}`;
        const trailEnd = Math.ceil(a.progress * (a.trajectoryPoints.length - 1));
        const trailPoints = a.trajectoryPoints.slice(0, trailEnd + 1);

        if (trailPoints.length >= 2) {
          viewer.entities.add({
            id: trailId,
            polyline: {
              positions: trailPoints,
              width: 4,
              material: new Cesium.PolylineGlowMaterialProperty({
                glowPower: 0.35,
                color: Cesium.Color.MAGENTA,
              }),
            },
          });
          entitiesRef.current.add(trailId);
        }
      }

      // ASAT head (active)
      if (isActive && a.currentPosition) {
        const headId = `asat-head-${a.id}`;
        viewer.entities.add({
          id: headId,
          position: a.currentPosition,
          point: {
            pixelSize: 10,
            color: Cesium.Color.MAGENTA,
            outlineColor: Cesium.Color.FUCHSIA,
            outlineWidth: 3,
          },
          label: {
            text: `ASAT: ${a.data.name}`,
            font: 'bold 11px monospace',
            fillColor: Cesium.Color.MAGENTA,
            outlineColor: Cesium.Color.BLACK,
            outlineWidth: 2,
            verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
            pixelOffset: new Cesium.Cartesian2(0, -15),
            scaleByDistance: new Cesium.NearFarScalar(200000, 1.0, 5000000, 0.2),
          },
        });
        entitiesRef.current.add(headId);
      }

      // Evaded / intercepted - show at end of trajectory
      if ((isEvaded || isIntercepted) && a.trajectoryPoints.length > 0) {
        const endPos = a.trajectoryPoints[a.trajectoryPoints.length - 1];
        const resolveId = `asat-resolve-${a.id}`;
        viewer.entities.add({
          id: resolveId,
          position: endPos,
          point: {
            pixelSize: 16,
            color: isEvaded ? Cesium.Color.LIME : Cesium.Color.ORANGE,
            outlineColor: isEvaded ? Cesium.Color.GREEN : Cesium.Color.RED,
            outlineWidth: 3,
          },
          label: {
            text: isEvaded ? 'SPACE INTERCEPT' : 'EVADED',
            font: 'bold 12px monospace',
            fillColor: isEvaded ? Cesium.Color.LIME : Cesium.Color.YELLOW,
            outlineColor: Cesium.Color.BLACK,
            outlineWidth: 2,
            verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
            pixelOffset: new Cesium.Cartesian2(0, -25),
            scaleByDistance: new Cesium.NearFarScalar(200000, 1.0, 8000000, 0.3),
          },
        });
        entitiesRef.current.add(resolveId);

        // Small explosion effect
        const explId = `asat-explosion-${a.id}`;
        const explosionSize = 15000 + Math.random() * 10000;
        viewer.entities.add({
          id: explId,
          position: endPos,
          ellipsoid: {
            radii: new Cesium.Cartesian3(explosionSize, explosionSize, explosionSize),
            material: new Cesium.ColorMaterialProperty(
              isEvaded ? Cesium.Color.LIME.withAlpha(0.4) : Cesium.Color.ORANGE.withAlpha(0.5)
            ),
          },
        });
        entitiesRef.current.add(explId);
      }

      // Hit satellite - show destruction
      if (isHit && a.trajectoryPoints.length > 0) {
        const endPos = a.trajectoryPoints[a.trajectoryPoints.length - 1];
        const hitId = `asat-hit-${a.id}`;
        viewer.entities.add({
          id: hitId,
          position: endPos,
          point: {
            pixelSize: 24,
            color: Cesium.Color.DARKRED,
            outlineColor: Cesium.Color.RED,
            outlineWidth: 4,
          },
          label: {
            text: 'SATELLITE DESTROYED',
            font: 'bold 14px monospace',
            fillColor: Cesium.Color.RED,
            outlineColor: Cesium.Color.BLACK,
            outlineWidth: 3,
            verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
            pixelOffset: new Cesium.Cartesian2(0, -35),
            scaleByDistance: new Cesium.NearFarScalar(200000, 1.0, 8000000, 0.3),
          },
        });
        entitiesRef.current.add(hitId);
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
  }, [viewer, asatMissiles, simulationTime, Cesium]);

  return null;
}
