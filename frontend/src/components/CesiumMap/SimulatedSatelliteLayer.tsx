import { useEffect, useRef } from 'react';
import * as Cesium from 'cesium';

function isAlliedByName(name: string): boolean {
  const lowerName = name.toLowerCase();
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
    lowerName.includes('reconsat') ||
    lowerName.includes('comsat')
  );
}

interface SimulatedSatellite {
  id: string;
  name: string;
  type: 'recon' | 'comms';
  position: Cesium.Cartesian3;
  status: 'online' | 'degraded' | 'maneuvering' | 'offline';
  fuelPercent: number;
  orbit?: {
    preManeuver?: Cesium.Entity;
    postManeuver?: Cesium.Entity;
    burnPosition?: Cesium.Cartesian3;
    deltaVDirection?: Cesium.Cartesian3;
  };
}

interface SimulatedSatelliteLayerProps {
  viewer: Cesium.Viewer | null;
  satellites: SimulatedSatellite[];
  showManeuvers?: boolean;
  showDataLinks?: boolean;
  showOrbits?: boolean;
}

// Helper to generate orbital path points around Earth
function generateOrbitPositions(centerLat: number, centerLon: number, altitudeMeters: number, numPoints = 64): Cesium.Cartesian3[] {
  const positions: Cesium.Cartesian3[] = [];
  const earthRadius = 6371000; // Earth radius in meters
  const orbitRadius = earthRadius + altitudeMeters;
  
  for (let i = 0; i <= numPoints; i++) {
    const angle = (i / numPoints) * 2 * Math.PI;
    // Slightly shift longitude to create orbital motion effect
    const lon = centerLon + (Math.cos(angle) * 5);
    const lat = centerLat + (Math.sin(angle) * 2);
    positions.push(Cesium.Cartesian3.fromDegrees(lon, lat, altitudeMeters));
  }
  return positions;
}

export function SimulatedSatelliteLayer({
  viewer,
  satellites,
  showManeuvers = true,
  showDataLinks = true,
  showOrbits = true,
}: SimulatedSatelliteLayerProps) {
  const entitiesRef = useRef<Set<string>>(new Set());
  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!viewer) return;

    const createdEntities: string[] = [];

    // Clean up ALL existing simulated satellite entities first
    const allIds = viewer.entities.values.map(e => e.id);
    allIds.forEach(id => {
      if (typeof id === 'string' && id.startsWith('sim-sat-')) {
        viewer.entities.removeById(id);
      }
    });

    satellites.forEach((satellite) => {
      const entityId = `sim-sat-${satellite.id}`;
      
      // Remove existing entities with this satellite's ID prefix (backup cleanup)
      const existingIds = viewer.entities.values.map(e => e.id).filter(id => 
        typeof id === 'string' && id.startsWith(entityId)
      );
      existingIds.forEach(id => viewer.entities.removeById(id));

      // Create main satellite body (box with solar panels)
      const bodyEntity = viewer.entities.add({
        id: entityId,
        position: satellite.position,
        box: {
          dimensions: new Cesium.Cartesian3(4000, 2000, 2000), // 4m x 2m x 2m
          material: isAlliedByName(satellite.name) ? Cesium.Color.BLUE : Cesium.Color.RED,
          outline: true,
          outlineColor: Cesium.Color.LIGHTGRAY,
          outlineWidth: 2,
        },
      });

      // Draw orbit path if enabled
      if (showOrbits) {
        const cartographic = Cesium.Cartographic.fromCartesian(satellite.position);
        const lat = Cesium.Math.toDegrees(cartographic.latitude);
        const lon = Cesium.Math.toDegrees(cartographic.longitude);
        const alt = cartographic.height;
        
        const orbitPositions = generateOrbitPositions(lat, lon, alt);
        const orbitColor = isAlliedByName(satellite.name) 
          ? Cesium.Color.DODGERBLUE.withAlpha(0.4) 
          : Cesium.Color.RED.withAlpha(0.4);
        
        const orbitId = `sim-sat-${satellite.id}-orbit`;
        viewer.entities.add({
          id: orbitId,
          polyline: {
            positions: orbitPositions,
            width: 2,
            material: new Cesium.PolylineGlowMaterialProperty({
              glowPower: 0.2,
              color: orbitColor,
            }),
          },
        });
        createdEntities.push(orbitId);
      }

      // Add a small point to indicate faction (optional visual aid)
      const factionId = `${entityId}-faction`;
      viewer.entities.add({
        id: factionId,
        position: satellite.position,
        point: {
          pixelSize: 5,
          color: isAlliedByName(satellite.name) ? Cesium.Color.BLUE : Cesium.Color.RED,
        },
      });
      createdEntities.push(factionId);
      createdEntities.push(entityId);

      // Solar panel 1
      const wing1Id = `sim-sat-${satellite.id}-wing1`;
      const wing1 = viewer.entities.add({
        id: wing1Id,
        position: new Cesium.CallbackProperty(() => {
          const pos = satellite.position;
          return new Cesium.Cartesian3(pos.x + 6000, pos.y, pos.z);
        }, false) as unknown as Cesium.PositionProperty,
        box: {
          dimensions: new Cesium.Cartesian3(1000, 12000, 200), // 12m panel
          material: new Cesium.ColorMaterialProperty(
            new Cesium.CallbackProperty(() => {
              // Solar panels change color based on status
              switch (satellite.status) {
                case 'online':
                  return Cesium.Color.DARKBLUE.withAlpha(0.9);
                case 'degraded':
                  return Cesium.Color.DARKBLUE.withAlpha(0.5);
                case 'maneuvering':
                  return Cesium.Color.ORANGE.withAlpha(0.8);
                case 'offline':
                  return Cesium.Color.BLACK.withAlpha(0.5);
                default:
                  return Cesium.Color.DARKBLUE.withAlpha(0.9);
              }
            }, false)
          ),
          outline: true,
          outlineColor: Cesium.Color.SILVER,
          outlineWidth: 1,
        },
      });
      createdEntities.push(wing1Id);

      // Solar panel 2
      const wing2Id = `sim-sat-${satellite.id}-wing2`;
      const wing2 = viewer.entities.add({
        id: wing2Id,
        position: new Cesium.CallbackProperty(() => {
          const pos = satellite.position;
          return new Cesium.Cartesian3(pos.x - 6000, pos.y, pos.z);
        }, false) as unknown as Cesium.PositionProperty,
        box: {
          dimensions: new Cesium.Cartesian3(1000, 12000, 200),
          material: new Cesium.ColorMaterialProperty(
            new Cesium.CallbackProperty(() => {
              switch (satellite.status) {
                case 'online':
                  return Cesium.Color.DARKBLUE.withAlpha(0.9);
                case 'degraded':
                  return Cesium.Color.DARKBLUE.withAlpha(0.5);
                case 'maneuvering':
                  return Cesium.Color.ORANGE.withAlpha(0.8);
                case 'offline':
                  return Cesium.Color.BLACK.withAlpha(0.5);
                default:
                  return Cesium.Color.DARKBLUE.withAlpha(0.9);
              }
            }, false)
          ),
          outline: true,
          outlineColor: Cesium.Color.SILVER,
          outlineWidth: 1,
        },
      });
      createdEntities.push(wing2Id);

      // Antenna dish
      const antennaId = `sim-sat-${satellite.id}-antenna`;
      const antenna = viewer.entities.add({
        id: antennaId,
        position: new Cesium.CallbackProperty(() => {
          const pos = satellite.position;
          return new Cesium.Cartesian3(pos.x, pos.y, pos.z + 1500);
        }, false) as unknown as Cesium.PositionProperty,
        ellipsoid: {
          radii: new Cesium.Cartesian3(800, 800, 300),
          material: Cesium.Color.GOLD,
          outline: true,
          outlineColor: Cesium.Color.DARKGOLDENROD,
          outlineWidth: 2,
        },
      });
      createdEntities.push(antennaId);

      // Status indicator (glowing point)
      const statusId = `sim-sat-${satellite.id}-status`;
      const statusLight = viewer.entities.add({
        id: statusId,
        position: new Cesium.CallbackProperty(() => {
          const pos = satellite.position;
          return new Cesium.Cartesian3(pos.x, pos.y + 1200, pos.z);
        }, false) as unknown as Cesium.PositionProperty,
        point: {
          pixelSize: new Cesium.CallbackProperty(() => {
            // Pulsing effect for maneuvering satellites
            if (satellite.status === 'maneuvering') {
              const seconds = Date.now() / 1000;
              return 15 + Math.sin(seconds * 8) * 8;
            }
            return 12;
          }, false) as unknown as Cesium.PositionProperty,
          color: new Cesium.ColorMaterialProperty(
            new Cesium.CallbackProperty(() => {
              switch (satellite.status) {
                case 'online':
                  return Cesium.Color.LIME;
                case 'degraded':
                  return Cesium.Color.ORANGE;
                case 'maneuvering':
                  return Cesium.Color.YELLOW;
                case 'offline':
                  return Cesium.Color.RED;
                default:
                  return Cesium.Color.WHITE;
              }
            }, false)
          ),
          outlineColor: Cesium.Color.WHITE,
          outlineWidth: 2,
        },
      });
      createdEntities.push(statusId);

      // Label
      const labelId = `sim-sat-${satellite.id}-label`;
      const label = viewer.entities.add({
        id: labelId,
        position: new Cesium.CallbackProperty(() => {
          const pos = satellite.position;
          return new Cesium.Cartesian3(pos.x, pos.y, pos.z + 3000);
        }, false) as unknown as Cesium.PositionProperty,
        label: {
          text: satellite.name,
          font: 'bold 14px monospace',
          fillColor: Cesium.Color.CYAN,
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 3,
          verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
          pixelOffset: new Cesium.Cartesian2(0, -10),
        },
      });
      createdEntities.push(labelId);

      // Maneuver visualization
      if (showManeuvers && satellite.orbit) {
        // Pre-maneuver trajectory (faded)
        if (satellite.orbit.preManeuver) {
          const prePathId = `sim-sat-${satellite.id}-pre-maneuver`;
          viewer.entities.add({
            id: prePathId,
            polyline: {
              positions: satellite.orbit.preManeuver.polyline?.positions,
              width: 2,
              material: new Cesium.PolylineDashMaterialProperty({
                color: Cesium.Color.CYAN.withAlpha(0.4),
              }),
            },
          });
          createdEntities.push(prePathId);
        }

        // Post-maneuver trajectory (bright)
        if (satellite.orbit.postManeuver) {
          const postPathId = `sim-sat-${satellite.id}-post-maneuver`;
          viewer.entities.add({
            id: postPathId,
            polyline: {
              positions: satellite.orbit.postManeuver.polyline?.positions,
              width: 3,
              material: new Cesium.PolylineGlowMaterialProperty({
                glowPower: 0.3,
                color: Cesium.Color.MAGENTA,
              }),
            },
          });
          createdEntities.push(postPathId);
        }

        // Burn indicator
        if (satellite.orbit.burnPosition && satellite.status === 'maneuvering') {
          const burnId = `sim-sat-${satellite.id}-burn`;
          viewer.entities.add({
            id: burnId,
            position: satellite.orbit.burnPosition,
            point: {
              pixelSize: new Cesium.CallbackProperty(() => {
                const seconds = Date.now() / 1000;
                return 20 + Math.sin(seconds * 10) * 10;
              }, false) as unknown as Cesium.PositionProperty,
              color: Cesium.Color.ORANGE,
              outlineColor: Cesium.Color.RED,
              outlineWidth: 3,
            },
          });
          createdEntities.push(burnId);

          // Delta-V arrow
          if (satellite.orbit.deltaVDirection) {
            const arrowId = `sim-sat-${satellite.id}-deltav`;
            const endPoint = Cesium.Cartesian3.add(
              satellite.orbit.burnPosition,
              Cesium.Cartesian3.multiplyByScalar(
                satellite.orbit.deltaVDirection,
                15000,
                new Cesium.Cartesian3()
              ),
              new Cesium.Cartesian3()
            );
            viewer.entities.add({
              id: arrowId,
              polyline: {
                positions: [satellite.orbit.burnPosition, endPoint],
                width: 4,
                material: Cesium.Color.RED,
              },
            });
            createdEntities.push(arrowId);
          }
        }
      }
    });

    entitiesRef.current = new Set(createdEntities);

    cleanupRef.current = () => {
      createdEntities.forEach((id) => {
        const entity = viewer.entities.getById(id);
        if (entity) {
          viewer.entities.remove(entity);
        }
      });
    };

    return () => {
      if (cleanupRef.current) {
        cleanupRef.current();
      }
    };
  }, [viewer, satellites, showManeuvers, showDataLinks, showOrbits]);

  return null;
}
