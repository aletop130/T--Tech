'use client';

import { useEffect, useRef } from 'react';
import * as Cesium from 'cesium';
import { Satellite } from '@/lib/api';

interface SatelliteLayerProps {
  viewer: Cesium.Viewer | null;
  satellites: Satellite[];
  orbits: Array<{
    satellite_id: string;
    positions: Array<{ lat: number; lon: number; alt: number; time: string }>;
  }>;
  showOrbits?: boolean;
}

export function SatelliteLayer({
  viewer,
  satellites,
  orbits,
  showOrbits = true,
}: SatelliteLayerProps) {
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

    satellites.forEach((sat) => {
      const orbit = orbits.find((o) => o.satellite_id === sat.id);

      if (orbit && orbit.positions.length > 0) {
        const positions = orbit.positions.map((pos) =>
          Cesium.Cartesian3.fromDegrees(pos.lon, pos.lat, pos.alt * 1000)
        );

        const satelliteId = `satellite-${sat.id}`;
        const orbitId = `orbit-${sat.id}`;

        if (showOrbits && positions.length > 1) {
          const entity = viewer.entities.add({
            id: orbitId,
            name: `${sat.name} Orbit`,
            polyline: {
              positions: new Cesium.ConstantProperty(positions),
              width: 2,
              material: new Cesium.PolylineGlowMaterialProperty({
                glowPower: 0.2,
                color: Cesium.Color.CYAN.withAlpha(0.6),
              }),
              clampToGround: false,
            } as Cesium.PolylineGraphics,
          });
          if (entity) currentEntities.add(orbitId);
        }

        const currentPos = positions[0];
        const satEntity = viewer.entities.add({
          id: satelliteId,
          name: sat.name,
          position: currentPos,
          point: {
            pixelSize: 8,
            color: Cesium.Color.YELLOW,
            outlineColor: Cesium.Color.WHITE,
            outlineWidth: 2,
            heightReference: Cesium.HeightReference.NONE,
          },
          label: {
            text: sat.name,
            font: '12px IBM Plex Sans',
            fillColor: Cesium.Color.WHITE,
            outlineColor: Cesium.Color.BLACK,
            outlineWidth: 2,
            style: Cesium.LabelStyle.FILL_AND_OUTLINE,
            verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
            pixelOffset: new Cesium.Cartesian2(0, -20),
            show: false,
          },
          description: `
            <div style="font-family: 'IBM Plex Sans', sans-serif;">
              <h3>${sat.name}</h3>
              <p><strong>NORAD ID:</strong> ${sat.norad_id}</p>
              <p><strong>Type:</strong> ${sat.object_type}</p>
              <p><strong>Country:</strong> ${sat.country || 'N/A'}</p>
              <p><strong>Operator:</strong> ${sat.operator || 'N/A'}</p>
              <p><strong>Status:</strong> ${sat.is_active ? 'Active' : 'Inactive'}</p>
            </div>
          `,
        });
        if (satEntity) currentEntities.add(satelliteId);
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
  }, [viewer, satellites, orbits, showOrbits]);

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
