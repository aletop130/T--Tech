import { useEffect, useRef, useState } from 'react';
import { getCesium, type CesiumModule } from '@/lib/cesium/loader';

function isAlliedSatellite(satellite: SimulatedSatellite): boolean {
  // Use affiliation field if available
  if (satellite.affiliation) {
    return satellite.affiliation === 'allied';
  }
  // Fall back to name-based detection
  const lowerName = satellite.name.toLowerCase();
  return (
    lowerName.includes('guardian') ||
    lowerName.includes('deepwatch') ||
    lowerName.includes('terrascan') ||
    lowerName.includes('starfinder') ||
    lowerName.includes('celestial') ||
    lowerName.includes('windwatcher') ||
    lowerName.includes('commlink') ||
    lowerName.includes('weathereye') ||
    lowerName.includes('navbeacon') ||
    lowerName.includes('eyeinsky') ||
    lowerName.includes('reconsat')
    // Note: comsat is now handled by affiliation field
  );
}

interface SimulatedSatellite {
  id: string;
  name: string;
  type: 'recon' | 'comms' | 'debris';
  position: InstanceType<CesiumModule['Cartesian3']>;
  status: 'online' | 'degraded' | 'maneuvering' | 'offline';
  fuelPercent: number;
  affiliation?: 'allied' | 'hostile' | 'neutral';
}

interface SimulatedSatelliteLayerProps {
  viewer: InstanceType<CesiumModule['Viewer']> | null;
  satellites: SimulatedSatellite[];
  showManeuvers?: boolean;
  showDataLinks?: boolean;
  showOrbits?: boolean;
  simulationTime?: number;
}

export function SimulatedSatelliteLayer({
  viewer,
  satellites,
  showManeuvers = true,
  showDataLinks = true,
  showOrbits = true,
  simulationTime = 0,
}: SimulatedSatelliteLayerProps) {
  const entitiesRef = useRef<Set<string>>(new Set());
  const cleanupRef = useRef<(() => void) | null>(null);
  const [Cesium, setCesium] = useState<CesiumModule | null>(null);

  useEffect(() => {
    getCesium().then(setCesium);
  }, []);

  useEffect(() => {
    if (!viewer || !Cesium || !viewer.entities) return;

    // Get all entity IDs for current satellites (without suffixes)
    const currentSatIds = new Set(satellites.map(s => `sim-sat-${s.id}`));

    // Clean up entities that are no longer in the satellites list
    entitiesRef.current.forEach(id => {
      // Extract base satellite ID from entity ID
      const baseId = id.replace(/-wing1|-wing2|-status|-label|-plume|-trajectory|-deltaV|-distance|-distLabel$/, '');
      if (!currentSatIds.has(baseId)) {
        viewer.entities.removeById(id);
        entitiesRef.current.delete(id);
      }
    });

    satellites.forEach((satellite) => {
      const entityId = `sim-sat-${satellite.id}`;
      const isAllied = isAlliedSatellite(satellite);
      
      // Skip if main entity already exists - use CallbackProperty for dynamic updates
      if (entitiesRef.current.has(entityId)) {
        return;
      }

      // Main satellite body - use CallbackProperty for dynamic position updates
      viewer.entities.add({
        id: entityId,
        position: new Cesium.CallbackProperty(() => {
          return satellite.position;
        }, false) as any,
        box: {
          dimensions: new Cesium.Cartesian3(3000, 1500, 1500),
          material: isAllied ? Cesium.Color.DODGERBLUE : Cesium.Color.CRIMSON,
          outline: true,
          outlineColor: Cesium.Color.WHITE,
          outlineWidth: 2,
        },
      });
      entitiesRef.current.add(entityId);

      // Solar panel 1
      const wing1Id = `sim-sat-${satellite.id}-wing1`;
      viewer.entities.add({
        id: wing1Id,
        position: new Cesium.CallbackProperty(() => {
          const pos = satellite.position;
          return new Cesium.Cartesian3(pos.x + 5000, pos.y, pos.z);
        }, false) as any,
        box: {
          dimensions: new Cesium.Cartesian3(800, 10000, 150),
          material: satellite.status === 'maneuvering' 
            ? Cesium.Color.ORANGE.withAlpha(0.8)
            : Cesium.Color.DARKBLUE.withAlpha(0.9),
          outline: true,
          outlineColor: Cesium.Color.SILVER,
        },
      });
      entitiesRef.current.add(wing1Id);

      // Solar panel 2
      const wing2Id = `sim-sat-${satellite.id}-wing2`;
      viewer.entities.add({
        id: wing2Id,
position: new Cesium.CallbackProperty(() => {
            const pos = satellite.position;
            return new Cesium.Cartesian3(pos.x - 5000, pos.y, pos.z);
          }, false) as any,
        box: {
          dimensions: new Cesium.Cartesian3(800, 10000, 150),
          material: satellite.status === 'maneuvering'
            ? Cesium.Color.ORANGE.withAlpha(0.8)
            : Cesium.Color.DARKBLUE.withAlpha(0.9),
          outline: true,
          outlineColor: Cesium.Color.SILVER,
        },
      });
      entitiesRef.current.add(wing2Id);

      // Status indicator
      const statusId = `sim-sat-${satellite.id}-status`;
      viewer.entities.add({
        id: statusId,
position: new Cesium.CallbackProperty(() => {
            const pos = satellite.position;
            return new Cesium.Cartesian3(pos.x, pos.y + 1000, pos.z);
          }, false) as any,
        point: {
          pixelSize: satellite.status === 'maneuvering' ? 20 : 12,
          color: (() => {
            switch (satellite.status) {
              case 'online': return Cesium.Color.LIME;
              case 'degraded': return Cesium.Color.ORANGE;
              case 'maneuvering': return Cesium.Color.YELLOW;
              case 'offline': return Cesium.Color.RED;
              default: return Cesium.Color.WHITE;
            }
          })(),
          outlineColor: Cesium.Color.WHITE,
          outlineWidth: 2,
        },
      });
      entitiesRef.current.add(statusId);

      // Label
      const labelId = `sim-sat-${satellite.id}-label`;
      viewer.entities.add({
        id: labelId,
position: new Cesium.CallbackProperty(() => {
            const pos = satellite.position;
            return new Cesium.Cartesian3(pos.x, pos.y, pos.z + 2500);
          }, false) as any,
        label: {
          text: satellite.name,
          font: 'bold 16px monospace',
          fillColor: isAllied ? Cesium.Color.CYAN : Cesium.Color.RED,
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 3,
          verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
          pixelOffset: new Cesium.Cartesian2(0, -10),
        },
      });
      entitiesRef.current.add(labelId);

      // CINEMATIC: Maneuver effects
      if (satellite.status === 'maneuvering') {
        // Thruster plume
        const plumeId = `sim-sat-${satellite.id}-plume`;
        viewer.entities.add({
          id: plumeId,
          position: new Cesium.CallbackProperty(() => {
            const pos = satellite.position;
            return new Cesium.Cartesian3(pos.x - 2000, pos.y, pos.z);
          }, false) as any,
          ellipsoid: {
            radii: new Cesium.Cartesian3(500, 800, 500),
            material: new Cesium.ColorMaterialProperty(
              new Cesium.CallbackProperty(() => {
                const alpha = 0.5 + 0.3 * Math.sin((simulationTime * 10) / 100);
                return Cesium.Color.ORANGE.withAlpha(alpha);
              }, false) as any
            ),
          },
        });
        entitiesRef.current.add(plumeId);

        // Trajectory change indicator
        const trajectoryId = `sim-sat-${satellite.id}-trajectory`;
        const currentPos = satellite.position;
        const futurePos = new Cesium.Cartesian3(
          currentPos.x + 50000,
          currentPos.y + 20000,
          currentPos.z
        );
        viewer.entities.add({
          id: trajectoryId,
          polyline: {
            positions: [currentPos, futurePos],
            width: 4,
            material: new Cesium.PolylineGlowMaterialProperty({
              glowPower: 0.3,
              color: Cesium.Color.MAGENTA,
            }),
          },
        });
        entitiesRef.current.add(trajectoryId);

        // Delta-V label
        const deltaVId = `sim-sat-${satellite.id}-deltav`;
        viewer.entities.add({
          id: deltaVId,
          position: new Cesium.CallbackProperty(() => {
            const pos = satellite.position;
            return new Cesium.Cartesian3(pos.x, pos.y, pos.z + 5000);
          }, false) as any,
          label: {
            text: 'ΔV BURN ACTIVE',
            font: 'bold 14px monospace',
            fillColor: Cesium.Color.YELLOW,
            outlineColor: Cesium.Color.RED,
            outlineWidth: 2,
            verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
          },
        });
        entitiesRef.current.add(deltaVId);
      }

      // CINEMATIC: Distance line to hostile satellite (only during threat)
      if (satellite.id === 'reconsat-1' && simulationTime >= 2880 && simulationTime < 3600) {
        const hostileSat = satellites.find(s => s.id === 'hostile-sat');
        if (hostileSat) {
          const distanceId = `sim-sat-distance-line`;
          const midPoint = Cesium.Cartesian3.midpoint(
            satellite.position,
            hostileSat.position,
            new Cesium.Cartesian3()
          );
          
          viewer.entities.add({
            id: distanceId,
            polyline: {
              positions: [satellite.position, hostileSat.position],
              width: 3,
              material: Cesium.Color.RED.withAlpha(0.6),
            },
          });
          entitiesRef.current.add(distanceId);

          // Distance label
          const distLabelId = `sim-sat-distance-label`;
          const distance = Cesium.Cartesian3.distance(satellite.position, hostileSat.position) / 1000;
          viewer.entities.add({
            id: distLabelId,
            position: midPoint,
            label: {
              text: `CLOSEST APPROACH: ${distance.toFixed(1)} km`,
              font: 'bold 12px monospace',
              fillColor: Cesium.Color.RED,
              outlineColor: Cesium.Color.BLACK,
              outlineWidth: 2,
              verticalOrigin: Cesium.VerticalOrigin.CENTER,
            },
          });
          entitiesRef.current.add(distLabelId);
        }
      }
    });

    // Cleanup function to remove all tracked entities when component unmounts
    cleanupRef.current = () => {
      entitiesRef.current.forEach((id) => {
        viewer.entities.removeById(id);
      });
      entitiesRef.current.clear();
    };

    return () => {
      if (cleanupRef.current) {
        cleanupRef.current();
      }
    };
  }, [viewer, satellites, simulationTime, Cesium]);

  return null;
}
