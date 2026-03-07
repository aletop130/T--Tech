'use client';

import { useEffect, useRef, useState } from 'react';
import { getCesium, type CesiumModule } from '@/lib/cesium/loader';
import { Satellite } from '@/lib/api';

// Same palette as map/page.tsx — kept in sync
const GROUP_COLORS = [
  '#06b6d4', '#f97316', '#a855f7', '#22c55e', '#ec4899',
  '#eab308', '#3b82f6', '#ef4444', '#14b8a6', '#f59e0b',
  '#8b5cf6', '#10b981', '#e879f9', '#0ea5e9', '#84cc16',
];

function hexToColor(Cesium: CesiumModule, hex: string, alpha = 1): InstanceType<CesiumModule['Color']> {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  return new Cesium.Color(r, g, b, alpha);
}

interface SatelliteLayerProps {
  viewer: InstanceType<CesiumModule['Viewer']> | null;
  satellites: Satellite[];
  orbits: Array<{
    satellite_id: string;
    positions: Array<{ lat: number; lon: number; alt: number; time: string }>;
  }>;
  showOrbits?: boolean;
  hiddenSatelliteIds?: Set<string>;
  hiddenOrbitIds?: Set<string>;
  hiddenGroups?: Set<string>;
  hiddenGroupOrbits?: Set<string>;
}

export function SatelliteLayer({
  viewer,
  satellites,
  orbits,
  showOrbits = true,
  hiddenSatelliteIds,
  hiddenOrbitIds,
  hiddenGroups,
  hiddenGroupOrbits,
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
      return;
    }

    const currentEntities = new Set<string>();

    // Build group → index map for color assignment
    const groupIndexMap = new Map<string, number>();
    let nextIdx = 0;
    satellites.forEach((sat) => {
      const group = sat.tags?.[0] || 'Uncategorized';
      if (!groupIndexMap.has(group)) {
        groupIndexMap.set(group, nextIdx++);
      }
    });

    satellites.forEach((sat) => {
      const group = sat.tags?.[0] || 'Uncategorized';

      // Skip if entire group is hidden
      if (hiddenGroups?.has(group)) return;
      // Skip if individual satellite is hidden
      if (hiddenSatelliteIds?.has(sat.id)) return;

      const orbit = orbits.find((o) => o.satellite_id === sat.id);

      if (orbit && orbit.positions.length > 0) {
        const positions = orbit.positions.map((pos) =>
          Cesium.Cartesian3.fromDegrees(pos.lon, pos.lat, pos.alt * 1000)
        );

        const colorIdx = groupIndexMap.get(group) ?? 0;
        const colorHex = GROUP_COLORS[colorIdx % GROUP_COLORS.length];
        const pointColor = hexToColor(Cesium, colorHex);
        const orbitColor = hexToColor(Cesium, colorHex, 0.6);

        const satelliteId = `satellite-${sat.id}`;
        const orbitId = `orbit-${sat.id}`;

        // Show orbit if globally enabled AND not hidden per-satellite or per-group
        const shouldShowOrbit = showOrbits
          && !hiddenOrbitIds?.has(sat.id)
          && !hiddenGroupOrbits?.has(group);

        if (shouldShowOrbit && positions.length > 1) {
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
  }, [viewer, satellites, orbits, showOrbits, Cesium, viewerReady, hiddenSatelliteIds, hiddenOrbitIds, hiddenGroups, hiddenGroupOrbits]);

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
