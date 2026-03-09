'use client';

import { useEffect, useRef, useState } from 'react';
import { getCesium, type CesiumModule } from '@/lib/cesium/loader';
import type { DebrisObject } from '@/lib/types/debris';

/**
 * Cesium layer that renders space debris as a PointPrimitiveCollection.
 * Uses point primitives instead of sphere geometries to avoid
 * massive Float64Array allocations that crash the browser.
 */
interface DebrisInstancedLayerProps {
  viewer: InstanceType<CesiumModule['Viewer']> | null;
  debris: DebrisObject[];
  maxDisplayObjects?: number;
  refreshIntervalMs?: number;
  simTimeRef?: React.RefObject<number>;
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

  useEffect(() => {
    getCesium().then(setCesium);
  }, []);

  useEffect(() => {
    if (!viewer || !Cesium) return;
    if (!showDebris) {
      if (cleanupRef.current) {
        cleanupRef.current();
        cleanupRef.current = null;
      }
      return;
    }

    if (cleanupRef.current) {
      cleanupRef.current();
      cleanupRef.current = null;
    }

    if (!viewer.scene || !viewer.scene.primitives) {
      const interval = setInterval(() => {
        if (viewer?.scene?.primitives) {
          clearInterval(interval);
        }
      }, 50);
      cleanupRef.current = () => clearInterval(interval);
      return;
    }

    const limited = debris.slice(0, maxDisplayObjects);
    const color = Cesium.Color.fromCssColorString('#f59e0b').withAlpha(0.9);

    const pointCollection = new Cesium.PointPrimitiveCollection();

    for (const obj of limited) {
      const position = Cesium.Cartesian3.fromDegrees(
        obj.lon,
        obj.lat,
        ((obj as any).altKm ?? (obj as any).alt_km ?? 0) * 1000
      );
      pointCollection.add({
        position,
        pixelSize: 4,
        color,
        scaleByDistance: new Cesium.NearFarScalar(1e6, 1.5, 1e8, 0.5),
      });
    }

    viewer.scene.primitives.add(pointCollection);

    cleanupRef.current = () => {
      if (!viewer.isDestroyed()) {
        viewer.scene.primitives.remove(pointCollection);
      }
    };
  }, [viewer, Cesium, debris, maxDisplayObjects, showDebris]);

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
