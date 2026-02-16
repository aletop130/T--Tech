'use client';

import { useEffect, useRef, useState } from 'react';
import { getCesium, type CesiumModule } from '@/lib/cesium/loader';
import { PositionReport } from '@/lib/api';

interface MilitaryVehicleLayerProps {
  viewer: InstanceType<CesiumModule['Viewer']> | null;
  vehicles: PositionReport[];
  show?: boolean;
}

export function MilitaryVehicleLayer({
  viewer,
  vehicles,
  show = true,
}: MilitaryVehicleLayerProps) {
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

    vehicles.forEach((vehicle) => {
      const position = Cesium.Cartesian3.fromDegrees(
        vehicle.longitude,
        vehicle.latitude,
        (vehicle.altitude_m || 0)
      );

      const headingRad = Cesium.Math.toRadians(vehicle.heading_deg || 0);
      const vehicleType = determineVehicleType(vehicle.entity_id);
      const vehicleConfig = getVehicleConfig(vehicleType);

      const bodyEntity = viewer.entities.add({
        id: `vehicle-body-${vehicle.entity_id}`,
        name: vehicle.entity_id,
        position: position,
        box: {
          dimensions: new Cesium.Cartesian3(
            vehicleConfig.width,
            vehicleConfig.length,
            vehicleConfig.height
          ),
          material: Cesium.Color.fromCssColorString(vehicleConfig.color),
          outline: true,
          outlineColor: Cesium.Color.BLACK.withAlpha(0.5),
        },
        description: `
          <div style="font-family: 'IBM Plex Sans', sans-serif;">
            <h3>${vehicle.entity_id}</h3>
            <p><strong>Type:</strong> ${vehicleConfig.name}</p>
            <p><strong>Position:</strong> ${vehicle.latitude.toFixed(4)}°, ${vehicle.longitude.toFixed(4)}°</p>
            <p><strong>Heading:</strong> ${vehicle.heading_deg?.toFixed(1) || 'N/A'}°</p>
            <p><strong>Speed:</strong> ${vehicle.velocity_magnitude_ms?.toFixed(1) || 0} m/s</p>
            <p><strong>Time:</strong> ${new Date(vehicle.report_time).toLocaleString()}</p>
          </div>
        `,
      });
      currentEntities.add(`vehicle-body-${vehicle.entity_id}`);

      const turretEntity = viewer.entities.add({
        id: `vehicle-turret-${vehicle.entity_id}`,
        name: `${vehicle.entity_id} Turret`,
        position: Cesium.Cartesian3.fromDegrees(
          vehicle.longitude,
          vehicle.latitude,
          (vehicle.altitude_m || 0) + 5 + vehicleConfig.height * 0.5
        ),
        ellipsoid: {
          radii: new Cesium.Cartesian3(
            vehicleConfig.width * 0.35,
            vehicleConfig.width * 0.35,
            vehicleConfig.height * 0.4
          ),
          material: Cesium.Color.fromCssColorString(vehicleConfig.color).brighten(0.2, new Cesium.Color()),
        },
      });
      currentEntities.add(`vehicle-turret-${vehicle.entity_id}`);

      const barrelEntity = viewer.entities.add({
        id: `vehicle-barrel-${vehicle.entity_id}`,
        name: `${vehicle.entity_id} Barrel`,
        position: Cesium.Cartesian3.fromDegrees(
          vehicle.longitude + Math.sin(headingRad) * (vehicleConfig.length * 0.4),
          vehicle.latitude + Math.cos(headingRad) * (vehicleConfig.length * 0.4),
          (vehicle.altitude_m || 0) + 5 + vehicleConfig.height * 0.5
        ),
        cylinder: {
          length: vehicleConfig.length * 0.8,
          topRadius: 0.3,
          bottomRadius: 0.4,
          material: Cesium.Color.DARKGRAY,
        },
      });
      currentEntities.add(`vehicle-barrel-${vehicle.entity_id}`);

      const labelEntity = viewer.entities.add({
        id: `vehicle-label-${vehicle.entity_id}`,
        name: `${vehicle.entity_id} Label`,
        position: Cesium.Cartesian3.fromDegrees(
          vehicle.longitude,
          vehicle.latitude,
          (vehicle.altitude_m || 0) + 5 + vehicleConfig.height + 10
        ),
        label: {
          text: vehicle.entity_id,
          font: 'bold 12px IBM Plex Sans',
          fillColor: getFactionColor(Cesium, vehicle.entity_id),
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 2,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
          pixelOffset: new Cesium.Cartesian2(0, -10),
          show: show,
          scaleByDistance: new Cesium.NearFarScalar(1000, 1.5, 50000, 0.5),
        },
      });
      currentEntities.add(`vehicle-label-${vehicle.entity_id}`);

      if (vehicle.heading_deg !== undefined && vehicle.heading_deg !== null) {
        const arrowEnd = Cesium.Cartesian3.fromDegrees(
          vehicle.longitude + Math.sin(headingRad) * 0.02,
          vehicle.latitude + Math.cos(headingRad) * 0.02,
          (vehicle.altitude_m || 0) + 5
        );

        const arrowEntity = viewer.entities.add({
          id: `vehicle-arrow-${vehicle.entity_id}`,
          name: `${vehicle.entity_id} Direction`,
          polyline: {
            positions: [position, arrowEnd],
            width: 4,
            material: getFactionColor(Cesium, vehicle.entity_id).withAlpha(0.9),
          },
        });
        currentEntities.add(`vehicle-arrow-${vehicle.entity_id}`);
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

function determineVehicleType(entityId: string): string {
  const lowerId = entityId.toLowerCase();
  if (lowerId.includes('tank') || lowerId.includes('panzer') || lowerId.includes('alpha')) {
    return 'tank';
  } else if (lowerId.includes('apc') || lowerId.includes('beta')) {
    return 'apc';
  } else if (lowerId.includes('jeep') || lowerId.includes('scout') || lowerId.includes('gamma')) {
    return 'jeep';
  } else if (lowerId.includes('truck') || lowerId.includes('logistics')) {
    return 'truck';
  } else if (lowerId.includes('artillery') || lowerId.includes('spg')) {
    return 'artillery';
  }
  return 'jeep';
}

interface VehicleConfig {
  name: string;
  width: number;
  length: number;
  height: number;
  color: string;
}

function getVehicleConfig(type: string): VehicleConfig {
  const configs: Record<string, VehicleConfig> = {
    tank: {
      name: 'MBT - Main Battle Tank',
      width: 3.5,
      length: 7.5,
      height: 2.5,
      color: '#4A5D23',
    },
    apc: {
      name: 'APC - Armored Personnel Carrier',
      width: 3.0,
      length: 6.5,
      height: 2.2,
      color: '#556B2F',
    },
    jeep: {
      name: 'LUV - Light Utility Vehicle',
      width: 2.0,
      length: 4.0,
      height: 1.5,
      color: '#3D5C3D',
    },
    truck: {
      name: 'LOG - Logistics Truck',
      width: 2.5,
      length: 6.0,
      height: 2.0,
      color: '#708090',
    },
    artillery: {
      name: 'SPA - Self-Propelled Artillery',
      width: 3.2,
      length: 7.0,
      height: 2.8,
      color: '#5C4033',
    },
  };
  return configs[type] || configs.jeep;
}

function getFactionColor(Cesium: CesiumModule, entityId: string): any {
  const lowerId = entityId.toLowerCase();
  if (lowerId.includes('alpha') || lowerId.includes('friendly') || lowerId.includes('friend')) {
    return Cesium.Color.LIMEGREEN;
  } else if (lowerId.includes('beta') || lowerId.includes('enemy') || lowerId.includes('hostile')) {
    return Cesium.Color.RED;
  } else if (lowerId.includes('gamma') || lowerId.includes('neutral')) {
    return Cesium.Color.YELLOW;
  }
  return Cesium.Color.CYAN;
}
