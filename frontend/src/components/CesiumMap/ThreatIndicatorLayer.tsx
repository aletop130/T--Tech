'use client';

import { useEffect, useRef } from 'react';
import type { ProximityThreat } from '@/types/threats';

interface ThreatIndicatorLayerProps {
  viewer: any; // Cesium.Viewer
  threats: ProximityThreat[];
}

/**
 * CesiumJS layer that renders threat indicators on the 3D globe.
 * Shows lines between threat pairs with color-coded severity.
 */
export function ThreatIndicatorLayer({ viewer, threats }: ThreatIndicatorLayerProps) {
  const entitiesRef = useRef<any[]>([]);

  useEffect(() => {
    if (!viewer || !viewer.entities) return;

    // Remove previous entities
    for (const entity of entitiesRef.current) {
      try {
        viewer.entities.remove(entity);
      } catch {
        // entity may already be removed
      }
    }
    entitiesRef.current = [];

    const Cesium = (window as any).Cesium;
    if (!Cesium) return;

    for (const threat of threats) {
      const color =
        threat.severity === 'threatened'
          ? Cesium.Color.RED.withAlpha(0.8)
          : threat.severity === 'watched'
          ? Cesium.Color.YELLOW.withAlpha(0.6)
          : Cesium.Color.GREEN.withAlpha(0.4);

      const primary = threat.primaryPosition;
      const secondary = threat.secondaryPosition;

      if (primary.lat === 0 && primary.lon === 0) continue;

      // Threat line between satellites
      const lineEntity = viewer.entities.add({
        polyline: {
          positions: Cesium.Cartesian3.fromDegreesArrayHeights([
            primary.lon, primary.lat, primary.altKm * 1000,
            secondary.lon, secondary.lat, secondary.altKm * 1000,
          ]),
          width: threat.severity === 'threatened' ? 3 : 2,
          material: new Cesium.PolylineGlowMaterialProperty({
            glowPower: 0.3,
            color: color,
          }),
        },
      });

      // Threat label on primary (foreign) satellite
      const labelEntity = viewer.entities.add({
        position: Cesium.Cartesian3.fromDegrees(
          primary.lon,
          primary.lat,
          primary.altKm * 1000 + 50000
        ),
        label: {
          text: `${threat.foreignSatName}\n${threat.missDistanceKm.toFixed(1)} km`,
          font: '10px monospace',
          fillColor: color,
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 2,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
          pixelOffset: new Cesium.Cartesian2(0, -10),
          scaleByDistance: new Cesium.NearFarScalar(1e6, 1.0, 1e8, 0.3),
          distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 5e7),
        },
      });

      entitiesRef.current.push(lineEntity, labelEntity);
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
