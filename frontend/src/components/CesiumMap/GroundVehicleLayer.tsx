'use client';

import { useEffect, useRef, useState } from 'react';
import { getCesium, type CesiumModule } from '@/lib/cesium/loader';
import { PositionReport } from '@/lib/api';
import { getEntityIcon } from '@/lib/cesium/entity-icons';

interface GroundVehicleLayerProps {
  viewer: InstanceType<CesiumModule['Viewer']> | null;
  vehicles: PositionReport[];
  show?: boolean;
}

export function GroundVehicleLayer({
  viewer,
  vehicles,
  show = true,
}: GroundVehicleLayerProps) {
  const cleanupRef = useRef<(() => void) | null>(null);
  const [Cesium, setCesium] = useState<CesiumModule | null>(null);

  useEffect(() => {
    getCesium().then(setCesium);
  }, []);

  useEffect(() => {
    if (!viewer || !Cesium || !viewer.entities) return;

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

    vehicles.forEach((vehicle) => {
      const position = Cesium.Cartesian3.fromDegrees(
        vehicle.longitude,
        vehicle.latitude,
        (vehicle.altitude_m || 0)
      );

      const vehicleEntity = viewer.entities.add({
        id: `vehicle-${vehicle.entity_id}`,
        name: vehicle.entity_id,
        position: position,
        billboard: {
          image: getEntityIcon('vehicle', '#f97316'),
          width: 16,
          height: 16,
          heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
        label: {
          text: vehicle.entity_id,
          font: '10px Google Sans',
          fillColor: Cesium.Color.ORANGE,
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 2,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
          pixelOffset: new Cesium.Cartesian2(0, -15),
          show: show,
        },
        description: `
          <div style="font-family: 'Google Sans', sans-serif;">
            <h3>${vehicle.entity_id}</h3>
            <p><strong>Type:</strong> Ground Vehicle</p>
            <p><strong>Position:</strong> ${vehicle.latitude.toFixed(4)}°, ${vehicle.longitude.toFixed(4)}°</p>
            <p><strong>Altitude:</strong> ${vehicle.altitude_m?.toFixed(1) || 0} m</p>
            <p><strong>Heading:</strong> ${vehicle.heading_deg?.toFixed(1) || 'N/A'}°</p>
            <p><strong>Speed:</strong> ${vehicle.velocity_magnitude_ms?.toFixed(1) || 0} m/s</p>
            <p><strong>Time:</strong> ${new Date(vehicle.report_time).toLocaleString()}</p>
          </div>
        `,
      });
      if (vehicleEntity) currentEntities.add(`vehicle-${vehicle.entity_id}`);

      if (vehicle.heading_deg !== undefined && vehicle.heading_deg !== null) {
        const headingRad = Cesium.Math.toRadians(vehicle.heading_deg);
        const arrowLength = 500;
        const endPosition = Cesium.Cartesian3.fromDegrees(
          vehicle.longitude + Math.sin(headingRad) * 0.01,
          vehicle.latitude + Math.cos(headingRad) * 0.01,
          (vehicle.altitude_m || 0)
        );

        const arrowEntity = viewer.entities.add({
          id: `vehicle-arrow-${vehicle.entity_id}`,
          name: `${vehicle.entity_id} Heading`,
          polyline: {
            positions: [position, endPosition],
            width: 3,
            material: Cesium.Color.ORANGE.withAlpha(0.8),
          },
        });
        if (arrowEntity) currentEntities.add(`vehicle-arrow-${vehicle.entity_id}`);
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
  }, [viewer, vehicles, show, Cesium]);

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
