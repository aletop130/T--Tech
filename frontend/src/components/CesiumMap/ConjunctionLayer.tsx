'use client';

import { useEffect, useRef } from 'react';
import * as Cesium from 'cesium';
import { ConjunctionEvent } from '@/lib/api';

interface ConjunctionLayerProps {
  viewer: Cesium.Viewer | null;
  conjunctions: ConjunctionEvent[];
  satellitePositions: Map<string, Cesium.Cartesian3>;
}

export function ConjunctionLayer({
  viewer,
  conjunctions,
  satellitePositions,
}: ConjunctionLayerProps) {
  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!viewer) return;

    if (cleanupRef.current) {
      cleanupRef.current();
      cleanupRef.current = null;
    }

    if (!viewer.entities) {
      const interval = setInterval(() => {
        if (viewer.entities) {
          clearInterval(interval);
        }
      }, 50);

      cleanupRef.current = () => clearInterval(interval);
      return;
    }

    const currentEntities = new Set<string>();

    conjunctions.forEach((conj) => {
      const pos1 = satellitePositions.get(conj.primary_object_id);
      const pos2 = satellitePositions.get(conj.secondary_object_id);

      if (pos1 && pos2) {
        const conjEntity = viewer.entities.add({
          id: `conjunction-${conj.id}`,
          name: `Conjunction: ${conj.id}`,
          polyline: {
            positions: [pos1, pos2],
            width: 3,
            material: new Cesium.PolylineGlowMaterialProperty({
              glowPower: 0.5,
              color:
                conj.risk_level === 'high' || conj.risk_level === 'critical'
                  ? Cesium.Color.RED
                  : Cesium.Color.ORANGE,
            }),
            clampToGround: false,
          },
          description: `
            <div style="font-family: 'IBM Plex Sans', sans-serif;">
              <h3>Conjunction Alert</h3>
              <p><strong>Risk Level:</strong> ${conj.risk_level}</p>
              <p><strong>Miss Distance:</strong> ${conj.miss_distance_km.toFixed(2)} km</p>
              <p><strong>TCA:</strong> ${new Date(conj.tca).toLocaleString()}</p>
              ${conj.risk_score ? `<p><strong>Risk Score:</strong> ${conj.risk_score.toFixed(2)}</p>` : ''}
              <p><strong>Actionable:</strong> ${conj.is_actionable ? 'Yes' : 'No'}</p>
            </div>
          `,
        });
        if (conjEntity) currentEntities.add(`conjunction-${conj.id}`);

        const midpoint = Cesium.Cartesian3.midpoint(pos1, pos2, new Cesium.Cartesian3());
        const labelEntity = viewer.entities.add({
          id: `conjunction-label-${conj.id}`,
          position: midpoint,
          label: {
            text: `⚠ ${conj.risk_level.toUpperCase()}`,
            font: '14px IBM Plex Sans',
            fillColor: Cesium.Color.RED,
            outlineColor: Cesium.Color.WHITE,
            outlineWidth: 3,
            style: Cesium.LabelStyle.FILL_AND_OUTLINE,
            verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
            pixelOffset: new Cesium.Cartesian2(0, -10),
          },
        });
        if (labelEntity) currentEntities.add(`conjunction-label-${conj.id}`);
      }
    });

    cleanupRef.current = () => {
      if (viewer && viewer.entities) {
        currentEntities.forEach((id) => {
          try {
            const entity = viewer.entities.getById(id);
            if (entity) viewer.entities.remove(entity);
          } catch {}
        });
      }
      currentEntities.clear();
    };
  }, [viewer, conjunctions, satellitePositions]);

  useEffect(() => {
    return () => {
      if (cleanupRef.current) {
        cleanupRef.current();
        cleanupRef.current = null;
      }
    };
  }, []);

  return null;
}
