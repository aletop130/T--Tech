/**
 * Solar System Layer for Cesium - Complete Refactor
 * Centered on Sun, properly navigable with working camera and info box
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import * as Cesium from 'cesium';
import { PLANETS, MAJOR_MOONS, calculateScaledDistance, calculateScaledRadius } from '@/lib/solarSystem/data';

export interface SolarSystemLayerProps {
  viewer: Cesium.Viewer | null;
  showOrbits: boolean;
  showLabels: boolean;
  focusedBody: string | null;
  onBodyClick?: (bodyId: string) => void;
  simulationTime?: number;
}

// Simple color materials as fallback
const BODY_COLORS: Record<string, string> = {
  sun: '#FDB813',
  mercury: '#8C8C8C',
  venus: '#E6E6B8',
  earth: '#2233FF',
  mars: '#FF4500',
  jupiter: '#D4A373',
  saturn: '#F4D03F',
  uranus: '#4FD0E7',
  neptune: '#4169E1',
  pluto: '#D2B48C',
};

export function SolarSystemLayer({
  viewer,
  showOrbits,
  showLabels,
  focusedBody,
  onBodyClick,
}: SolarSystemLayerProps) {
  const planetEntitiesRef = useRef<Map<string, Cesium.Entity>>(new Map());
  const orbitEntitiesRef = useRef<Cesium.Entity[]>([]);
  const isSetupRef = useRef(false);
  const [isReady, setIsReady] = useState(false);
  const currentBodyRef = useRef<string | null>(null);

  // Create a simple colored ellipsoid material
  const createBodyMaterial = useCallback((bodyId: string): Cesium.Color => {
    const colorHex = BODY_COLORS[bodyId] || '#FFFFFF';
    return Cesium.Color.fromCssColorString(colorHex);
  }, []);

  // Calculate view distance based on planet size and type
  const getViewDistance = useCallback((bodyId: string, radius: number): number => {
    // Sun: 4x radius
    if (bodyId === 'sun') {
      return radius * 4;
    }
    
    // Pluto: 4x radius
    if (bodyId === 'pluto') {
      return radius * 4;
    }
    
    // Inner planets (Mercury, Venus, Earth, Mars): 3-5x radius
    const innerPlanets = ['mercury', 'venus', 'earth', 'mars'];
    if (innerPlanets.includes(bodyId)) {
      return radius * 4;
    }
    
    // Outer planets (Jupiter, Saturn, Uranus, Neptune): 5-8x radius
    const outerPlanets = ['jupiter', 'saturn', 'uranus', 'neptune'];
    if (outerPlanets.includes(bodyId)) {
      // Larger planets get a bit more distance
      if (bodyId === 'jupiter' || bodyId === 'saturn') {
        return radius * 6;
      }
      return radius * 5;
    }
    
    // Default
    return radius * 5;
  }, []);

  // Calculate camera position for viewing a body
  // Returns position at viewDistance from the body, looking at it from a good angle
  const calculateCameraPosition = useCallback((
    bodyPosition: Cesium.Cartesian3,
    bodyId: string,
    bodyRadius: number
  ): { position: Cesium.Cartesian3; heading: number; pitch: number } => {
    const viewDistance = getViewDistance(bodyId, bodyRadius);
    
    // Direction from Sun to body (for planets other than Sun)
    // For Sun, use a default direction
    let direction: Cesium.Cartesian3;
    
    if (bodyId === 'sun') {
      // View Sun from positive Z, slight angle
      direction = new Cesium.Cartesian3(0.3, 0.5, 1.0);
    } else {
      // For planets, view from direction toward the Sun (opposite side from Sun)
      // This shows the lit side
      direction = Cesium.Cartesian3.negate(bodyPosition, new Cesium.Cartesian3());
    }
    
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
  }, [getViewDistance]);

  // Initialize solar system
  useEffect(() => {
    if (!viewer || isSetupRef.current) return;
    
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

    // Get maximum distance for camera positioning
    const maxDistance = calculateScaledDistance(39.48); // Pluto
    console.log('[SolarSystem] Max distance:', maxDistance);

    // Create Sun at origin
    const sunRadius = calculateScaledRadius(696340, true);
    console.log('[SolarSystem] Sun radius:', sunRadius);
    
    const sun = viewer.entities.add({
      position: Cesium.Cartesian3.ZERO,
      name: 'Sun',
      ellipsoid: {
        radii: new Cesium.Cartesian3(sunRadius, sunRadius, sunRadius),
        material: createBodyMaterial('sun'),
        outlineColor: Cesium.Color.YELLOW,
        outlineWidth: 2,
      },
      label: showLabels ? {
        text: 'Sun',
        font: 'bold 16px sans-serif',
        fillColor: Cesium.Color.YELLOW,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 3,
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        pixelOffset: new Cesium.Cartesian2(0, -sunRadius - 50),
        showBackground: true,
        backgroundColor: Cesium.Color.BLACK.withAlpha(0.7),
      } : undefined,
    });
    planetEntitiesRef.current.set('sun', sun);

    // Create planets
    const nonSunPlanets = PLANETS.filter(p => p.id !== 'sun');
    nonSunPlanets.forEach((planet, index) => {
      if (!planet.distanceAU) return;
      
      const distance = calculateScaledDistance(planet.distanceAU);
      const radius = calculateScaledRadius(planet.radiusKm);
      
      // Spread planets evenly in a circle around the Sun
      const angle = (index / nonSunPlanets.length) * Math.PI * 2;
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
        const orbitPositions: Cesium.Cartesian3[] = [];
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
  }, [viewer, showOrbits, showLabels, createBodyMaterial]);

  // Handle camera navigation to planets
  useEffect(() => {
    if (!viewer || !isReady) return;

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
    const radius = body ? calculateScaledRadius(body.radiusKm, body.id === 'sun') : 500000;
    
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
  }, [viewer, focusedBody, isReady, calculateCameraPosition]);

  // Handle planet clicks
  useEffect(() => {
    if (!viewer || !onBodyClick) return;

    const handler = new Cesium.ScreenSpaceEventHandler(viewer.canvas);
    
    handler.setInputAction((click: Cesium.ScreenSpaceEventHandler.PositionedEvent) => {
      const pickedObject = viewer.scene.pick(click.position);
      
      if (Cesium.defined(pickedObject) && pickedObject.id instanceof Cesium.Entity) {
        const entity = pickedObject.id as Cesium.Entity;
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
  }, [viewer, onBodyClick]);

  return null;
}
