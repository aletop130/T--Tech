'use client';

import { useEffect, useRef, useState } from 'react';
import { getCesium, type CesiumModule } from '@/lib/cesium/loader';
import { Satellite } from '@/lib/api';

interface SatelliteLayerProps {
  viewer: InstanceType<CesiumModule['Viewer']> | null;
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
  const [Cesium, setCesium] = useState<CesiumModule | null>(null);
  const [viewerReady, setViewerReady] = useState(false);

  useEffect(() => {
    getCesium().then(setCesium);
  }, []);

  // Track viewer readiness - when entities becomes available, trigger re-render
  useEffect(() => {
    if (!viewer || viewer.isDestroyed()) return;
    
    if (viewer.entities) {
      setViewerReady(true);
      return;
    }

    // Wait for entities to become available
    const interval = setInterval(() => {
      if (viewer.isDestroyed()) {
        clearInterval(interval);
        return;
      }
      if (viewer.entities) {
        setViewerReady(true);
        clearInterval(interval);
      }
    }, 50);

    return () => clearInterval(interval);
  }, [viewer]);

  useEffect(() => {
    if (!viewer || !Cesium || viewer.isDestroyed()) return;

    if (cleanupRef.current) {
      cleanupRef.current();
      cleanupRef.current = null;
    }

    if (!viewer.entities) {
      // Viewer not ready yet, wait for viewerReady state to trigger re-run
      return;
    }

    const currentEntities = new Set<string>();

    // Helper functions to identify satellite types
    const isAlliedSat = (sat: Satellite) => {
      const name = sat.name?.toLowerCase() || '';
      return name.includes('guardian') || name.includes('deepwatch') || name.includes('terrascan') ||
             name.includes('starfinder') || name.includes('celestial') || name.includes('windwatcher') ||
             name.includes('commlink') || name.includes('weathereye') || name.includes('navbeacon') ||
             name.includes('eyeinsky') || sat.faction === 'allied';
    };

    const isEnemySat = (sat: Satellite) => {
      const name = sat.name?.toLowerCase() || '';
      return name.includes('unknown') || name.includes('hostile') || name.includes('suspect') ||
             name.includes('tracked') || name.includes('unidentified') || name.includes('contact') ||
             sat.faction === 'enemy';
    };

    satellites.forEach((sat) => {
      const orbit = orbits.find((o) => o.satellite_id === sat.id);

      if (orbit && orbit.positions.length > 0) {
        // Skip satellites that are neither allied nor enemy (treat as debris)
        const isAllied = isAlliedSat(sat);
        const isEnemy = isEnemySat(sat);
        if (!isAllied && !isEnemy) return;

        const positions = orbit.positions.map((pos) =>
          Cesium.Cartesian3.fromDegrees(pos.lon, pos.lat, pos.alt * 1000)
        );
        
        const pointColor = isEnemy ? Cesium.Color.RED : Cesium.Color.DODGERBLUE;
        const orbitColor = isEnemy ? Cesium.Color.RED.withAlpha(0.6) : Cesium.Color.DODGERBLUE.withAlpha(0.6);
        
        const satelliteId = `satellite-${sat.id}`;
        const orbitId = `orbit-${sat.id}`;

        if (showOrbits && positions.length > 1) {
          const entity = viewer.entities.add({
            id: orbitId,
            name: `${sat.name} Orbit`,
            polyline: {
              positions: positions,
              width: 2,
              material: new Cesium.PolylineGlowMaterialProperty({
                glowPower: 0.2,
                color: orbitColor,
              }),
              clampToGround: false,
            },
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
            color: pointColor,
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
      if (viewer && !viewer.isDestroyed() && viewer.entities) {
        currentEntities.forEach((id) => {
          try {
            const entity = viewer.entities.getById(id);
            if (entity) viewer.entities.remove(entity);
          } catch {}
        });
      }
      currentEntities.clear();
    };
  }, [viewer, satellites, orbits, showOrbits, Cesium, viewerReady]);

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
