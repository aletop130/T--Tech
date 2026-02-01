'use client';

import { useEffect } from 'react';
import { Entity } from 'resium';
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
  useEffect(() => {
    if (!viewer || satellites.length === 0) return;

    // Create satellite entities
    satellites.forEach((sat) => {
      const orbit = orbits.find((o) => o.satellite_id === sat.id);
      
      if (orbit && orbit.positions.length > 0) {
        const positions = orbit.positions.map((pos) =>
          Cesium.Cartesian3.fromDegrees(pos.lon, pos.lat, pos.alt * 1000)
        );

        // Create orbit polyline
        if (showOrbits && positions.length > 1) {
          viewer.entities.add({
            id: `orbit-${sat.id}`,
            name: `${sat.name} Orbit`,
            polyline: {
              positions: positions,
              width: 2,
              material: new Cesium.PolylineGlowMaterialProperty({
                glowPower: 0.2,
                color: Cesium.Color.CYAN.withAlpha(0.6),
              }),
              clampToGround: false,
            },
          });
        }

        // Create satellite point at current position
        const currentPos = positions[0];
        viewer.entities.add({
          id: `satellite-${sat.id}`,
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
            show: false, // Show on hover/click
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
      }
    });

    return () => {
      // Cleanup entities on unmount
      satellites.forEach((sat) => {
        viewer.entities.removeById(`satellite-${sat.id}`);
        viewer.entities.removeById(`orbit-${sat.id}`);
      });
    };
  }, [viewer, satellites, orbits, showOrbits]);

  return null;
}

