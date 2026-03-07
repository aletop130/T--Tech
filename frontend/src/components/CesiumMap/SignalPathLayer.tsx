'use client';

import { useEffect, useRef } from 'react';
import type { SignalThreat } from '@/types/threats';

interface SignalPathLayerProps {
  viewer: any; // Cesium.Viewer
  threats: SignalThreat[];
}

/**
 * CesiumJS layer that visualizes signal interception paths.
 * Shows dashed lines representing compromised communication links.
 */
export function SignalPathLayer({ viewer, threats }: SignalPathLayerProps) {
  const entitiesRef = useRef<any[]>([]);

  useEffect(() => {
    if (!viewer || !viewer.entities) return;

    for (const entity of entitiesRef.current) {
      try {
        viewer.entities.remove(entity);
      } catch {
        // cleanup
      }
    }
    entitiesRef.current = [];

    const Cesium = (window as any).Cesium;
    if (!Cesium) return;

    for (const threat of threats) {
      const pos = threat.position;
      if (pos.lat === 0 && pos.lon === 0) continue;

      const color =
        threat.severity === 'threatened'
          ? Cesium.Color.ORANGE.withAlpha(0.7)
          : Cesium.Color.YELLOW.withAlpha(0.5);

      // Signal threat indicator at interceptor position
      const entity = viewer.entities.add({
        position: Cesium.Cartesian3.fromDegrees(pos.lon, pos.lat, pos.altKm * 1000),
        billboard: {
          image: 'data:image/svg+xml,' + encodeURIComponent(
            `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="8" fill="none" stroke="${threat.severity === 'threatened' ? '#ff8c00' : '#ffd700'}" stroke-width="2" stroke-dasharray="4,2"/>
              <circle cx="12" cy="12" r="3" fill="${threat.severity === 'threatened' ? '#ff8c00' : '#ffd700'}"/>
            </svg>`
          ),
          width: 20,
          height: 20,
          scaleByDistance: new Cesium.NearFarScalar(1e6, 1.0, 1e8, 0.3),
        },
        label: {
          text: `SIG ${(threat.interceptionProbability * 100).toFixed(0)}%`,
          font: '9px monospace',
          fillColor: color,
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 1,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
          pixelOffset: new Cesium.Cartesian2(0, -15),
          scaleByDistance: new Cesium.NearFarScalar(1e6, 1.0, 1e8, 0.3),
          distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 3e7),
        },
      });

      entitiesRef.current.push(entity);
    }

    return () => {
      for (const entity of entitiesRef.current) {
        try {
          viewer.entities.remove(entity);
        } catch {
          // cleanup
        }
      }
      entitiesRef.current = [];
    };
  }, [viewer, threats]);

  return null;
}
