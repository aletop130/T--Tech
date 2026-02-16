'use client';

import { useEffect, useRef, useState } from 'react';
import { getCesium, type CesiumModule } from '@/lib/cesium/loader';
import { GroundStation } from '@/lib/api';

interface GroundStationLayerProps {
  viewer: InstanceType<CesiumModule['Viewer']> | null;
  stations: GroundStation[];
  showCoverage?: boolean;
  coverageRadiusKm?: number;
}

export function GroundStationLayer({
  viewer,
  stations,
  showCoverage = true,
  coverageRadiusKm = 2000,
}: GroundStationLayerProps) {
  const cleanupRef = useRef<(() => void) | null>(null);
  const [Cesium, setCesium] = useState<CesiumModule | null>(null);

  useEffect(() => {
    getCesium().then(setCesium);
  }, []);

  useEffect(() => {
    if (!viewer || !Cesium) return;

    if (cleanupRef.current) {
      cleanupRef.current();
      cleanupRef.current = null;
    }

    if (!viewer?.entities) {
      const interval = setInterval(() => {
        if (viewer?.entities) {
          clearInterval(interval);
        }
      }, 50);

      cleanupRef.current = () => clearInterval(interval);
      return;
    }

    const currentEntities = new Set<string>();

    stations.forEach((station) => {
      const position = Cesium.Cartesian3.fromDegrees(
        station.longitude,
        station.latitude,
        0
      );

      const stationEntity = viewer.entities.add({
        id: `station-${station.id}`,
        name: station.name,
        position: position,
        point: {
          pixelSize: 10,
          color: station.is_operational
            ? Cesium.Color.GREEN
            : Cesium.Color.RED,
          outlineColor: Cesium.Color.WHITE,
          outlineWidth: 2,
          heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
        },
        label: {
          text: station.name,
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
            <h3>${station.name}</h3>
            <p><strong>Code:</strong> ${station.code || 'N/A'}</p>
            <p><strong>Location:</strong> ${station.latitude.toFixed(4)}°, ${station.longitude.toFixed(4)}°</p>
            <p><strong>Status:</strong> ${station.is_operational ? 'Operational' : 'Offline'}</p>
            <p><strong>Organization:</strong> ${station.organization || 'N/A'}</p>
            <p><strong>Country:</strong> ${station.country || 'N/A'}</p>
          </div>
        `,
      });
      if (stationEntity) currentEntities.add(`station-${station.id}`);

      if (showCoverage && station.is_operational) {
        const coverageEntity = viewer.entities.add({
          id: `coverage-${station.id}`,
          name: `${station.name} Coverage`,
          position: position,
          ellipse: {
            semiMajorAxis: coverageRadiusKm * 1000,
            semiMinorAxis: coverageRadiusKm * 1000,
            material: Cesium.Color.BLUE.withAlpha(0.1),
            outline: true,
            outlineColor: Cesium.Color.BLUE.withAlpha(0.5),
            height: 0,
          },
        });
        if (coverageEntity) currentEntities.add(`coverage-${station.id}`);
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
  }, [viewer, stations, showCoverage, coverageRadiusKm, Cesium]);

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
