'use client';

import { useEffect } from 'react';
import * as Cesium from 'cesium';
import { GroundStation } from '@/lib/api';

interface GroundStationLayerProps {
  viewer: Cesium.Viewer | null;
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
  useEffect(() => {
    if (!viewer || stations.length === 0) return;

    stations.forEach((station) => {
      const position = Cesium.Cartesian3.fromDegrees(
        station.longitude,
        station.latitude,
        0
      );

      // Create ground station point
      viewer.entities.add({
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

      // Create coverage circle
      if (showCoverage && station.is_operational) {
        viewer.entities.add({
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
      }
    });

    return () => {
      // Cleanup entities on unmount
      stations.forEach((station) => {
        viewer.entities.removeById(`station-${station.id}`);
        viewer.entities.removeById(`coverage-${station.id}`);
      });
    };
  }, [viewer, stations, showCoverage, coverageRadiusKm]);

  return null;
}

