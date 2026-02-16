/**
 * Solar System Layer for Cesium - Complete Refactor
 * Centered on Sun, properly navigable with working camera and info box
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { getCesium, type CesiumModule } from '@/lib/cesium/loader';
import { PLANETS, calculateScaledDistance, calculateScaledRadius } from '@/lib/solarSystem/data';

export interface SolarSystemLayerProps {
  viewer: InstanceType<CesiumModule['Viewer']> | null;
  showOrbits: boolean;
  showLabels: boolean;
  focusedBody: string | null;
  onBodyClick?: (bodyId: string) => void;
  simulationTime?: number;
}

// Simple color materials as fallback
const BODY_COLORS: Record<string, string> = {
  earth: '#2233FF',
  mars: '#FF4500',
};

export function SolarSystemLayer({
  viewer,
  showOrbits,
  showLabels,
  focusedBody,
  onBodyClick,
}: SolarSystemLayerProps) {
  const planetEntitiesRef = useRef<Map<string, InstanceType<CesiumModule['Entity']>>>(new Map());
  const orbitEntitiesRef = useRef<InstanceType<CesiumModule['Entity']>[]>([]);
  const isSetupRef = useRef(false);
  const [isReady, setIsReady] = useState(false);
  const [Cesium, setCesium] = useState<CesiumModule | null>(null);
  const currentBodyRef = useRef<string | null>(null);

  useEffect(() => {
    getCesium().then(setCesium);
  }, []);

  // Create a simple colored ellipsoid material
  const createBodyMaterial = useCallback((bodyId: string): any => {
    if (!Cesium) return undefined as any;
    const colorHex = BODY_COLORS[bodyId] || '#FFFFFF';
    return Cesium.Color.fromCssColorString(colorHex);
  }, [Cesium]);

  // Calculate view distance based on planet size
  const getViewDistance = useCallback((bodyId: string, radius: number): number => {
    // Earth and Mars: 4x radius
    if (bodyId === 'earth' || bodyId === 'mars') {
      return radius * 4;
    }
    
    // Default
    return radius * 5;
  }, []);

  // Calculate camera position for viewing a body
  // Returns position at viewDistance from the body, looking at it from a good angle
  const calculateCameraPosition = useCallback((
    bodyPosition: InstanceType<CesiumModule['Cartesian3']>,
    bodyId: string,
    bodyRadius: number
  ): { position: InstanceType<CesiumModule['Cartesian3']>; heading: number; pitch: number } => {
    if (!Cesium) {
      // Return placeholder position when Cesium is not loaded
      const placeholder: any = { x: 0, y: 0, z: 0 };
      return { position: placeholder as any, heading: 0, pitch: 0 };
    }
    const viewDistance = getViewDistance(bodyId, bodyRadius);
    
    // For planets, view from direction toward the origin (opposite side from center)
    // This shows the lit side
    let direction = Cesium.Cartesian3.negate(bodyPosition, new Cesium.Cartesian3());
    
    // Normalize the direction
    direction = Cesium.Cartesian3.normalize(direction, new Cesium.Cartesian3());
    
    // Add some "up" component to get a better view angle
    const up = new Cesium.Cartesian3(0, 1, 0);
    const right = Cesium.Cartesian3.cross(direction, up, new Cesium.Cartesian3());
    Cesium.Cartesian3.normalize(right, right);
    
    // Create viewing direction with slight elevation
    const viewDirection = Cesium.Cartesian3.clone(direction);
    viewDirection.y += 0.3; // Add 30% up component
    Cesium.Cartesian3.normalize(viewDirection, viewDirection);
    
    // Calculate camera position: body position + (viewDirection * viewDistance)
    const offset = Cesium.Cartesian3.multiplyByScalar(viewDirection, viewDistance, new Cesium.Cartesian3());
    const cameraPosition = Cesium.Cartesian3.add(bodyPosition, offset, new Cesium.Cartesian3());
    
    // Calculate heading and pitch to look at the body
    const dx = bodyPosition.x - cameraPosition.x;
    const dy = bodyPosition.y - cameraPosition.y;
    const dz = bodyPosition.z - cameraPosition.z;
    
    const heading = Math.atan2(dx, dz);
    const horizontalDist = Math.sqrt(dx * dx + dz * dz);
    const pitch = -Math.atan2(dy, horizontalDist);
    
    return {
      position: cameraPosition,
      heading: heading,
      pitch: pitch,
    };
  }, [Cesium, getViewDistance]);

  // Initialize solar system
  useEffect(() => {
    if (!viewer || !Cesium || isSetupRef.current) return;
    if (!viewer?.entities) return;

    console.log('[SolarSystem] Initializing...');
    isSetupRef.current = true;

    // Hide Earth globe and atmosphere
    viewer.scene.globe.show = false;
    if (viewer.scene.skyAtmosphere) {
      viewer.scene.skyAtmosphere.show = false;
    }
    viewer.scene.backgroundColor = Cesium.Color.BLACK;

    // Clear any existing entities
    planetEntitiesRef.current.forEach(entity => {
      if (viewer?.entities.contains(entity)) {
        viewer?.entities.remove(entity);
      }
    });
    orbitEntitiesRef.current.forEach(entity => {
      if (viewer?.entities.contains(entity)) {
        viewer?.entities.remove(entity);
      }
    });
    planetEntitiesRef.current.clear();
    orbitEntitiesRef.current = [];

    // Get maximum distance for camera positioning (Mars is the furthest at 1.52 AU)
    const maxDistance = calculateScaledDistance(1.52);
    console.log('[SolarSystem] Max distance:', maxDistance);

    // Filter out the sun for positioning
    const nonSunPlanets = PLANETS.filter(p => p.id !== 'sun');

    // Create planets
    PLANETS.forEach((planet, index) => {
      if (!planet.distanceAU) return;
      
      const distance = calculateScaledDistance(planet.distanceAU);
      const radius = calculateScaledRadius(planet.radiusKm);
      
      // Find index among non-sun planets for angle calculation
      const nonSunIndex = nonSunPlanets.findIndex(p => p.id === planet.id);
      const angle = (nonSunIndex >= 0 ? nonSunIndex : 0 / nonSunPlanets.length) * Math.PI * 2;
      const x = Math.cos(angle) * distance;
      const z = Math.sin(angle) * distance;
      const position = new Cesium.Cartesian3(x, 0, z);

      console.log(`[SolarSystem] ${planet.name}: distance=${distance}, radius=${radius}, pos=(${x.toFixed(0)}, 0, ${z.toFixed(0)})`);

      // Create planet entity with color material
      const planetEntity = viewer.entities.add({
        position: position,
        name: planet.name,
        ellipsoid: {
          radii: new Cesium.Cartesian3(radius, radius, radius),
          material: createBodyMaterial(planet.id),
          outlineColor: Cesium.Color.WHITE.withAlpha(0.3),
          outlineWidth: 1,
        },
        label: showLabels ? {
          text: planet.name,
          font: 'bold 14px sans-serif',
          fillColor: Cesium.Color.WHITE,
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 2,
          verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
          pixelOffset: new Cesium.Cartesian2(0, -radius - 30),
          showBackground: true,
          backgroundColor: Cesium.Color.BLACK.withAlpha(0.7),
        } : undefined,
      });
      
      planetEntitiesRef.current.set(planet.id, planetEntity);

      // Create orbit path
      if (showOrbits) {
        const orbitPositions: InstanceType<CesiumModule['Cartesian3']>[] = [];
        for (let i = 0; i <= 128; i++) {
          const orbitAngle = (i / 128) * Math.PI * 2;
          orbitPositions.push(new Cesium.Cartesian3(
            Math.cos(orbitAngle) * distance,
            0,
            Math.sin(orbitAngle) * distance
          ));
        }
        
        const orbit = viewer.entities.add({
          polyline: {
            positions: orbitPositions,
            width: 2,
            material: Cesium.Color.fromCssColorString(planet.color).withAlpha(0.3),
            clampToGround: false,
          },
        });
        orbitEntitiesRef.current.push(orbit);
      }
    });

    console.log('[SolarSystem] Created', planetEntitiesRef.current.size, 'bodies');

    // Set initial camera view - overview showing all planets
    // Position camera directly above and back to center the view properly
    const overviewDistance = maxDistance * 3.0; // Far enough to see everything
    
    viewer.camera.setView({
      destination: new Cesium.Cartesian3(0, -overviewDistance * 0.5, overviewDistance),
      orientation: {
        heading: Cesium.Math.toRadians(0), // Look toward +X (toward planets)
        pitch: Cesium.Math.toRadians(-45), // 45-degree downward angle for better view
        roll: 0,
      },
    });

    setIsReady(true);
    console.log('[SolarSystem] Setup complete with overview camera');

    return () => {
      console.log('[SolarSystem] Cleaning up...');
      
      planetEntitiesRef.current.forEach(entity => {
        if (viewer.entities.contains(entity)) {
          viewer.entities.remove(entity);
        }
      });
      orbitEntitiesRef.current.forEach(entity => {
        if (viewer.entities.contains(entity)) {
          viewer.entities.remove(entity);
        }
      });
      
      planetEntitiesRef.current.clear();
      orbitEntitiesRef.current = [];
      
      viewer.scene.globe.show = true;
      if (viewer.scene.skyAtmosphere) {
        viewer.scene.skyAtmosphere.show = true;
      }
      isSetupRef.current = false;
      currentBodyRef.current = null;
      setIsReady(false);
    };
  }, [viewer, showOrbits, showLabels, createBodyMaterial, Cesium]);

  // Handle camera navigation to planets
  useEffect(() => {
    if (!viewer || !isReady || !Cesium) return;

    // Reset to overview when focusedBody is null
    if (!focusedBody) {
      if (currentBodyRef.current !== null) {
        const maxDistance = calculateScaledDistance(39.48);
        const overviewDistance = maxDistance * 3.0;
        
        viewer.camera.flyTo({
          destination: new Cesium.Cartesian3(0, -overviewDistance * 0.5, overviewDistance),
          orientation: {
            heading: Cesium.Math.toRadians(0),
            pitch: Cesium.Math.toRadians(-45),
            roll: 0,
          },
          duration: 1.5,
        });
        currentBodyRef.current = null;
      }
      return;
    }

    const entity = planetEntitiesRef.current.get(focusedBody);
    if (!entity) {
      console.warn('[SolarSystem] Entity not found:', focusedBody);
      return;
    }

    console.log('[SolarSystem] Focusing on:', focusedBody);

    // Get entity position
    const position = entity.position?.getValue(viewer.clock.currentTime);
    if (!position) {
      console.warn('[SolarSystem] No position for:', focusedBody);
      return;
    }

    // Get body info for radius calculation
    const body = PLANETS.find(b => b.id === focusedBody);
    const radius = body ? calculateScaledRadius(body.radiusKm) : 500000;
    
    console.log(`[SolarSystem] Body: ${body?.name}, Radius: ${radius}`);

    // Calculate camera position using proper vector math
    const cameraData = calculateCameraPosition(position, focusedBody, radius);
    
    console.log('[SolarSystem] Flying to:', {
      destination: `(${cameraData.position.x.toFixed(0)}, ${cameraData.position.y.toFixed(0)}, ${cameraData.position.z.toFixed(0)})`,
      heading: Cesium.Math.toDegrees(cameraData.heading).toFixed(1),
      pitch: Cesium.Math.toDegrees(cameraData.pitch).toFixed(1),
    });

    viewer.camera.flyTo({
      destination: cameraData.position,
      orientation: {
        heading: cameraData.heading,
        pitch: cameraData.pitch,
        roll: 0,
      },
      duration: 2,
    });

    currentBodyRef.current = focusedBody;
  }, [viewer, focusedBody, isReady, calculateCameraPosition, Cesium]);

  // Handle planet clicks
  useEffect(() => {
    if (!viewer || !onBodyClick || !Cesium) return;

    const handler = new Cesium.ScreenSpaceEventHandler(viewer.canvas);
    
    handler.setInputAction((click: any) => {
      const pickedObject = viewer.scene.pick(click.position);
      
      if (Cesium.defined(pickedObject) && pickedObject.id instanceof Cesium.Entity) {
        const entity = pickedObject.id as any;
        if (entity.name) {
          const planet = PLANETS.find(p => p.name === entity.name);
          if (planet) {
            console.log('[SolarSystem] Clicked on:', planet.id);
            onBodyClick(planet.id);
          }
        }
      }
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

    return () => {
      handler.destroy();
    };
  }, [viewer, onBodyClick, Cesium]);

  return null;
}
