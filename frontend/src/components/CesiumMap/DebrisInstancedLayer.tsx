'use client';

import { useEffect, useRef, useState } from 'react';
import { getCesium, type CesiumModule } from '@/lib/cesium/loader';
import type { DebrisObject } from '@/lib/types/debris';

/**
 * Cesium layer that renders space debris as a large number of small spheres.
 * It uses a Cesium Primitive built from GeometryInstance objects for performance.
 * The component is deliberately lightweight – it does not implement the full
 * drift animation described in the spec, but provides a solid foundation for
 * future extensions.
 */
interface DebrisInstancedLayerProps {
  /** Cesium Viewer instance (or null while loading) */
  viewer: InstanceType<CesiumModule['Viewer']> | null;
  /** Array of debris objects */
  debris: DebrisObject[];
  /** Maximum number of debris objects to display – defaults to 2500 */
  maxDisplayObjects?: number;
  /** Refresh interval in ms – not currently used but kept for API compatibility */
  refreshIntervalMs?: number;
  /** Optional reference to the simulation time – future drift animation can read this */
  simTimeRef?: React.RefObject<number>;
  /** Show or hide the debris layer */
  showDebris?: boolean;
}

export function DebrisInstancedLayer({
  viewer,
  debris,
  maxDisplayObjects = 2500,
  refreshIntervalMs = 15000,
  simTimeRef,
  showDebris = true,
}: DebrisInstancedLayerProps) {
  const cleanupRef = useRef<(() => void) | null>(null);
  const [Cesium, setCesium] = useState<CesiumModule | null>(null);

  // Load Cesium module once
  useEffect(() => {
    getCesium().then(setCesium);
  }, []);

  // Main effect – create / update primitive when inputs change
  useEffect(() => {
    if (!viewer || !Cesium) return;
    if (!showDebris) {
      // If the layer should be hidden, clean up any existing primitive and exit
      if (cleanupRef.current) {
        cleanupRef.current();
        cleanupRef.current = null;
      }
      return;
    }

    // Clean previous primitive if present
    if (cleanupRef.current) {
      cleanupRef.current();
      cleanupRef.current = null;
    }

    // Guard against missing scene primitives collection
    if (!viewer.scene || !viewer.scene.primitives) {
      const interval = setInterval(() => {
        if (viewer?.scene?.primitives) {
          clearInterval(interval);
        }
      }, 50);
      cleanupRef.current = () => clearInterval(interval);
      return;
    }

    // Limit number of displayed debris objects
    const limited = debris.slice(0, maxDisplayObjects);

    // Pre‑compute geometry instances – small orange spheres
    const geometryInstances: any[] = limited.map((obj) => {
      // Convert geodetic coordinates to Cartesian3 (meters)
      const position = Cesium.Cartesian3.fromDegrees(
        obj.lon,
        obj.lat,
        (obj.altKm ?? 0) * 1000
      );
      const modelMatrix = Cesium.Matrix4.fromTranslation(position);
      const sphereGeometry = new Cesium.SphereGeometry({
        radius: 100,
        stackPartitions: 3,
        slicePartitions: 3,
      });
      const color = Cesium.Color.fromCssColorString('#f59e0b').withAlpha(0.9);
      return new Cesium.GeometryInstance({
        geometry: sphereGeometry,
        modelMatrix,
        attributes: {
          color: Cesium.ColorGeometryInstanceAttribute.fromColor(color),
        },
      });
    });

    // Create the primitive using a per‑instance color appearance (transparent)
    const primitive = new Cesium.Primitive({
      geometryInstances,
      appearance: new Cesium.PerInstanceColorAppearance({
        translucent: true,
        closed: true,
      }),
    });

    viewer.scene.primitives.add(primitive);

    // Store cleanup function to remove the primitive later
    cleanupRef.current = () => {
      if (!viewer.isDestroyed()) {
        viewer.scene.primitives.remove(primitive);
      }
    };
  }, [viewer, Cesium, debris, maxDisplayObjects, showDebris]);

  // Cleanup on component unmount
  useEffect(() => {
    return () => {
      if (cleanupRef.current) {
        cleanupRef.current();
        cleanupRef.current = null;
      }
    };
  }, []);

  // The component does not render any React DOM – it solely interacts with Cesium.
  return null;
}
