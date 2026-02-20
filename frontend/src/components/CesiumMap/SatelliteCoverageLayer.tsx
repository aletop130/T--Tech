'use client';

import { useEffect, useRef, useState } from 'react';
import { getCesium, type CesiumModule } from '@/lib/cesium/loader';
import { useSimulationStore, type Faction } from '@/lib/store/simulation';

interface SatelliteCoverageLayerProps {
  viewer: InstanceType<CesiumModule['Viewer']> | null;
}

const FACTION_COLORS: Record<Faction, { fill: string; outline: string }> = {
  allied: { fill: 'rgba(0, 100, 255, 0.2)', outline: 'rgba(0, 150, 255, 0.8)' },
  hostile: { fill: 'rgba(255, 50, 50, 0.2)', outline: 'rgba(255, 100, 100, 0.8)' },
  neutral: { fill: 'rgba(150, 150, 150, 0.2)', outline: 'rgba(200, 200, 200, 0.8)' },
  unknown: { fill: 'rgba(255, 165, 0, 0.2)', outline: 'rgba(255, 200, 100, 0.8)' },
};

export function SatelliteCoverageLayer({ viewer }: SatelliteCoverageLayerProps) {
  const [Cesium, setCesium] = useState<CesiumModule | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  const satellites = useSimulationStore((state) => state.satellites);
  const visibleCoverages = useSimulationStore((state) => state.visibleCoverages);

  useEffect(() => {
    getCesium().then(setCesium);
  }, []);

  useEffect(() => {
    if (!viewer || !Cesium) return;

    if (cleanupRef.current) {
      cleanupRef.current();
      cleanupRef.current = null;
    }

    const currentEntities = new Set<string>();

    satellites.forEach((satellite) => {
      if (!visibleCoverages.has(satellite.id)) return;
      if (!satellite.footprintRadiusKm) return;

      const colors = FACTION_COLORS[satellite.faction] || FACTION_COLORS.neutral;
      const fillColor = Cesium.Color.fromCssColorString(colors.fill);
      const outlineColor = Cesium.Color.fromCssColorString(colors.outline);

      const radius = satellite.footprintRadiusKm * 1000;

      const parentEntity = viewer.entities.getById(`satellite-${satellite.id}`);
      
      if (parentEntity && parentEntity.position) {
        const coverageEntity = viewer.entities.add({
          id: `coverage-${satellite.id}`,
          name: `${satellite.name} Coverage`,
          position: parentEntity.position,
          ellipse: {
            semiMajorAxis: radius,
            semiMinorAxis: radius,
            material: fillColor,
            outline: true,
            outlineColor: outlineColor,
            outlineWidth: 2,
            height: 0,
          },
          description: `
            <div style="font-family: 'IBM Plex Sans', sans-serif;">
              <h3>${satellite.name} Coverage</h3>
              <p><strong>Radius:</strong> ${satellite.footprintRadiusKm.toFixed(0)} km</p>
              <p><strong>Area:</strong> ${satellite.footprintAreaKm2?.toFixed(0) || 'N/A'} km²</p>
              <p><strong>Altitude:</strong> ${satellite.altitudeKm.toFixed(0)} km</p>
              <p><strong>Faction:</strong> ${satellite.faction}</p>
            </div>
          `,
        });
        
        if (coverageEntity) currentEntities.add(`coverage-${satellite.id}`);
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
  }, [viewer, Cesium, satellites, visibleCoverages]);

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
