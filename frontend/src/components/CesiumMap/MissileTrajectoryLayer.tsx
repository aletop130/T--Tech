import { useEffect, useRef, useState } from 'react';
import { getCesium, type CesiumModule } from '@/lib/cesium/loader';
import type { MissileState, InterceptorState } from '@/lib/simulation/italyDefenseScenario';

interface MissileTrajectoryLayerProps {
  viewer: InstanceType<CesiumModule['Viewer']> | null;
  missiles: MissileState[];
  interceptors: InterceptorState[];
  simulationTime: number;
}

export function MissileTrajectoryLayer({
  viewer,
  missiles,
  interceptors,
  simulationTime,
}: MissileTrajectoryLayerProps) {
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

    // ── Render missiles ──────────────────────────────────────────────────

    missiles.forEach(m => {
      if (m.status === 'waiting') return;

      const isActive = m.status === 'inflight';
      const isIntercepted = m.status === 'intercepted';
      const isImpact = m.status === 'impact';

      // Full trajectory arc (faded)
      const arcId = `missile-arc-${m.id}`;
      viewer.entities.add({
        id: arcId,
        polyline: {
          positions: m.trajectoryPoints,
          width: 2,
          material: new Cesium.PolylineGlowMaterialProperty({
            glowPower: 0.15,
            color: isIntercepted
              ? Cesium.Color.GRAY.withAlpha(0.3)
              : Cesium.Color.RED.withAlpha(0.25),
          }),
        },
      });
      entitiesRef.current.add(arcId);

      // Trail (portion traveled so far)
      if (isActive && m.progress > 0) {
        const trailId = `missile-trail-${m.id}`;
        const trailEnd = Math.ceil(m.progress * (m.trajectoryPoints.length - 1));
        const trailPoints = m.trajectoryPoints.slice(0, trailEnd + 1);

        if (trailPoints.length >= 2) {
          viewer.entities.add({
            id: trailId,
            polyline: {
              positions: trailPoints,
              width: 4,
              material: new Cesium.PolylineGlowMaterialProperty({
                glowPower: 0.3,
                color: Cesium.Color.ORANGERED,
              }),
            },
          });
          entitiesRef.current.add(trailId);
        }
      }

      // Missile head
      if (isActive && m.currentPosition) {
        const headId = `missile-head-${m.id}`;
        viewer.entities.add({
          id: headId,
          position: m.currentPosition,
          point: {
            pixelSize: 10,
            color: Cesium.Color.RED,
            outlineColor: Cesium.Color.ORANGERED,
            outlineWidth: 3,
          },
          label: {
            text: m.data.name,
            font: 'bold 11px monospace',
            fillColor: Cesium.Color.RED,
            outlineColor: Cesium.Color.BLACK,
            outlineWidth: 2,
            verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
            pixelOffset: new Cesium.Cartesian2(0, -15),
            scaleByDistance: new Cesium.NearFarScalar(200000, 1.0, 5000000, 0.2),
          },
        });
        entitiesRef.current.add(headId);
      }

      // Intercept explosion
      if (isIntercepted && m.currentPosition) {
        const explId = `missile-explosion-${m.id}`;
        const explosionSize = 25000 + Math.random() * 15000;
        viewer.entities.add({
          id: explId,
          position: m.currentPosition,
          ellipsoid: {
            radii: new Cesium.Cartesian3(explosionSize, explosionSize, explosionSize),
            material: new Cesium.ColorMaterialProperty(
              Cesium.Color.ORANGE.withAlpha(0.6)
            ),
          },
          point: {
            pixelSize: 20,
            color: Cesium.Color.YELLOW,
            outlineColor: Cesium.Color.ORANGE,
            outlineWidth: 4,
          },
          label: {
            text: 'INTERCEPTED',
            font: 'bold 12px monospace',
            fillColor: Cesium.Color.LIME,
            outlineColor: Cesium.Color.BLACK,
            outlineWidth: 2,
            verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
            pixelOffset: new Cesium.Cartesian2(0, -30),
            scaleByDistance: new Cesium.NearFarScalar(200000, 1.0, 5000000, 0.3),
          },
        });
        entitiesRef.current.add(explId);
      }

      // Impact explosion
      if (isImpact) {
        const impactPos = m.trajectoryPoints[m.trajectoryPoints.length - 1];
        const impactId = `missile-impact-${m.id}`;
        viewer.entities.add({
          id: impactId,
          position: impactPos,
          ellipsoid: {
            radii: new Cesium.Cartesian3(50000, 50000, 30000),
            material: new Cesium.ColorMaterialProperty(
              Cesium.Color.DARKRED.withAlpha(0.5)
            ),
          },
          point: {
            pixelSize: 24,
            color: Cesium.Color.DARKRED,
            outlineColor: Cesium.Color.RED,
            outlineWidth: 4,
          },
          label: {
            text: 'IMPACT',
            font: 'bold 14px monospace',
            fillColor: Cesium.Color.RED,
            outlineColor: Cesium.Color.BLACK,
            outlineWidth: 3,
            verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
            pixelOffset: new Cesium.Cartesian2(0, -35),
            scaleByDistance: new Cesium.NearFarScalar(200000, 1.0, 5000000, 0.3),
          },
        });
        entitiesRef.current.add(impactId);
      }
    });

    // ── Render interceptors ─────────────────────────────────────────────

    interceptors.forEach(intc => {
      if (simulationTime < intc.launchTime) return;

      const isHit = intc.status === 'hit';
      const isMiss = intc.status === 'miss';
      const isActive = intc.status === 'inflight';

      // Interceptor trail
      const currentPos = Cesium.Cartesian3.lerp(
        intc.startPosition,
        intc.interceptPosition,
        Math.min(1, intc.progress),
        new Cesium.Cartesian3()
      );

      const trailId = `interceptor-trail-${intc.id}`;
      viewer.entities.add({
        id: trailId,
        polyline: {
          positions: [intc.startPosition, currentPos],
          width: 3,
          material: new Cesium.PolylineGlowMaterialProperty({
            glowPower: 0.25,
            color: isHit
              ? Cesium.Color.LIME.withAlpha(0.5)
              : isMiss
                ? Cesium.Color.GRAY.withAlpha(0.3)
                : Cesium.Color.SPRINGGREEN,
          }),
        },
      });
      entitiesRef.current.add(trailId);

      // Interceptor head
      if (isActive) {
        const headId = `interceptor-head-${intc.id}`;
        viewer.entities.add({
          id: headId,
          position: currentPos,
          point: {
            pixelSize: 8,
            color: Cesium.Color.WHITE,
            outlineColor: Cesium.Color.SPRINGGREEN,
            outlineWidth: 2,
          },
        });
        entitiesRef.current.add(headId);
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
  }, [viewer, missiles, interceptors, simulationTime, Cesium]);

  return null;
}
