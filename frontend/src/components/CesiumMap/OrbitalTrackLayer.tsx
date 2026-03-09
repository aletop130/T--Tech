// WRITE_TARGET="frontend/src/components/CesiumMap/OrbitalTrackLayer.tsx"
// WRITE_CONTENT_LENGTH=0

'use client';

import { useEffect, useRef, useState } from 'react';
import { getCesium, type CesiumModule } from '@/lib/cesium/loader';
import type { OrbitTrackState } from '@/lib/types/debris';

/**
 * Props for the orbital track visualiser.
 */
interface OrbitalTrackLayerProps {
  /** Cesium Viewer instance (or null while loading) */
  viewer: InstanceType<CesiumModule['Viewer']> | null;
  /** Pre‑computed orbit positions as Cesium Cartesian3 objects */
  orbitTrack: OrbitTrackState;
  /** Fraction of the orbit to show as a visible trail – defaults to 0.20 (20 %) */
  trailFraction?: number;
  /** Minimum number of points to display regardless of fraction – defaults to 10 */
  minTrailPoints?: number;
  /** Override colour (CSS hex string). If omitted the colour depends on `isManual`. */
  color?: string;
  /** Width of the polyline in pixels – defaults to 2 */
  lineWidth?: number;
  /** Whether the track belongs to a manually‑controlled object – influences default colour */
  isManual?: boolean;
  /** Timestamp (ms since epoch) when a maneuver started – triggers colour animation */
  maneuverStartMs?: number;
}

/**
 * Cesium layer that draws a coloured orbit polyline. It supports a small "maneuver"
 * animation that briefly flashes the line red.
 */
export function OrbitalTrackLayer({
  viewer,
  orbitTrack,
  trailFraction = 0.2,
  minTrailPoints = 10,
  color,
  lineWidth = 2,
  isManual = false,
  maneuverStartMs,
}: OrbitalTrackLayerProps) {
  const cleanupRef = useRef<(() => void) | null>(null);
  const [Cesium, setCesium] = useState<CesiumModule | null>(null);
  const entityRef = useRef<any>(null);

  // Load Cesium once
  useEffect(() => {
    getCesium().then(setCesium);
  }, []);

  // Helper to compute the colour to use when no maneuver is active
  const baseColor = (() => {
    if (color) return Cesium?.Color?.fromCssColorString?.(color);
    return isManual
      ? Cesium?.Color?.fromCssColorString('#10b981') // green for manual
      : Cesium?.Color?.fromCssColorString('#7dd3fc'); // cyan for auto
  })();

// Main entity creation / update effect
useEffect(() => {
  if (!viewer || !Cesium) return;

  // Remove any previous entity / listener
  if (cleanupRef.current) {
    cleanupRef.current();
    cleanupRef.current = null;
  }

  // Wait for viewer.entities to be ready (as before)
  if (!viewer.entities) {
    const interval = setInterval(() => {
      if (viewer?.isDestroyed?.()) {
        clearInterval(interval);
        return;
      }
      if (viewer?.entities) {
        clearInterval(interval);
      }
    }, 50);
    cleanupRef.current = () => clearInterval(interval);
    return;
  }

  const points = orbitTrack.points;
  if (!points || points.length === 0) return;

  // Determine how many points to show based on fraction and minimum
  const trailCount = Math.max(
    minTrailPoints,
    Math.floor(points.length * trailFraction)
  );

  // Compute the current simulation index using Cesium clock if available.
  // Fallback to the start of the track if the clock is missing (e.g., during tests).
  const stepMs = orbitTrack.stepSec * 1000;
  const totalPoints = points.length;

  let baseIdx = 0; // default to first point
  if (viewer.clock && typeof viewer.clock.currentTime !== "undefined") {
    const simMs = Cesium.JulianDate.toDate(viewer.clock.currentTime).getTime();
    const elapsed = simMs - orbitTrack.timeStartMs;
    const idxFloat = elapsed / stepMs;
    baseIdx = Math.floor(idxFloat);
    // Normalize to valid range [0, totalPoints-1]
    baseIdx = ((baseIdx % totalPoints) + totalPoints) % totalPoints;
  }

  // Determine start index so that we have points behind and ahead of the current point.
  // We allocate half of the trail to points behind the satellite and the rest ahead.
  const half = Math.floor(trailCount / 2);
  const behind = half; // points behind current idx
  const ahead = trailCount - behind; // include current point in ahead side
  let startIdx = baseIdx - behind;
  // Normalize startIdx to be within [0, totalPoints)
  startIdx = ((startIdx % totalPoints) + totalPoints) % totalPoints;

  // Gather the visible points, wrapping around the array if needed.
  // Filter out adjacent near-duplicate points to avoid Cesium's
  // EllipsoidGeodesic minimum-granularity error.
  const visiblePoints: any[] = [];
  for (let i = 0; i < trailCount; i++) {
    const idx = (startIdx + i) % totalPoints;
    const pt = points[idx];
    if (visiblePoints.length > 0) {
      const prev = visiblePoints[visiblePoints.length - 1];
      const dx = pt.x - prev.x;
      const dy = pt.y - prev.y;
      const dz = pt.z - prev.z;
      const distSq = dx * dx + dy * dy + dz * dz;
      if (distSq < 100000) continue; // skip if < ~316 m apart to reduce triangulation artifacts
    }
    visiblePoints.push(new Cesium.Cartesian3(pt.x, pt.y, pt.z));
  }

  const polylineColor = (baseColor ?? Cesium.Color.WHITE).withAlpha(0.12);

  // Unique ID – we can use the start time of the track to keep it stable
  const entityId = `orbit-track-${orbitTrack.timeStartMs}`;
  const entity = viewer.entities.add({
    id: entityId,
    polyline: {
      positions: visiblePoints,
      width: lineWidth,
      arcType: Cesium.ArcType.NONE,
      material: new Cesium.ColorMaterialProperty(polylineColor),
      clampToGround: false,
    },
  });
  entityRef.current = entity;

  // Register a tick handler to update the visible segment as time progresses.
  // Only rebuild geometry when the discrete orbital index changes to avoid
  // flooding the Cesium geometry worker with allocations (causes OOM).
  let lastTrailStart = -1;
  const updateTrail = () => {
      if (!viewer || !Cesium) return;
      if (!viewer.clock || typeof viewer.clock.currentTime === "undefined") return;
      const simMs = Cesium.JulianDate.toDate(viewer.clock.currentTime).getTime();
      const elapsed = simMs - orbitTrack.timeStartMs;
      const idxFloat = elapsed / stepMs;
      let idx = Math.floor(idxFloat);
      idx = ((idx % totalPoints) + totalPoints) % totalPoints;
      const start = ((idx - behind) % totalPoints + totalPoints) % totalPoints;
      if (start === lastTrailStart) return; // index unchanged, skip rebuild
      lastTrailStart = start;
      const newPoints: any[] = [];
      for (let i = 0; i < trailCount; i++) {
        const ptIdx = (start + i) % totalPoints;
        const pt = points[ptIdx];
        if (newPoints.length > 0) {
          const prev = newPoints[newPoints.length - 1];
          const dx = pt.x - prev.x;
          const dy = pt.y - prev.y;
          const dz = pt.z - prev.z;
          if (dx * dx + dy * dy + dz * dz < 100000) continue;
        }
        newPoints.push(new Cesium.Cartesian3(pt.x, pt.y, pt.z));
      }
      if (entityRef.current && entityRef.current.polyline) {
        entityRef.current.polyline.positions = newPoints;
      }
    };

  // Initial update
  updateTrail();

  // Attach listener
  if (viewer.clock && viewer.clock.onTick) {
        viewer.clock.onTick.addEventListener(updateTrail);
      }

  // Store cleanup to remove the entity and listener later
  cleanupRef.current = () => {
    if (viewer.clock && viewer.clock.onTick) {
      viewer.clock.onTick.removeEventListener(updateTrail);
    }
    if (!viewer.isDestroyed() && viewer.entities) {
      const e = viewer.entities.getById(entityId);
      if (e) viewer.entities.remove(e);
    }
  };
}, [viewer, Cesium, orbitTrack, trailFraction, minTrailPoints, color, lineWidth, isManual]);

  // Maneuver colour animation – runs while a manoeuvre window is active
  useEffect(() => {
    if (!viewer || !Cesium || !entityRef.current) return;
    if (maneuverStartMs === undefined) return;

    let animationHandle: number | null = null;
    const base = baseColor ?? Cesium.Color.WHITE;

    const update = () => {
      const now = Date.now();
      const elapsed = now - maneuverStartMs;

      // Determine colour based on the elapsed time (0‑3.5 s window)
      let col = base;
      if (elapsed >= 0 && elapsed <= 300) {
        // Ramp to red
        col = Cesium.Color.lerp(base, Cesium.Color.RED, elapsed / 300, new Cesium.Color())!;
      } else if (elapsed > 300 && elapsed <= 2500) {
        col = Cesium.Color.RED;
      } else if (elapsed > 2500 && elapsed <= 3500) {
        // Fade back to base colour
        const t = (elapsed - 2500) / 1000;
        col = Cesium.Color.lerp(Cesium.Color.RED, base, t, new Cesium.Color())!;
      } else {
        // Outside animation window – ensure base colour is restored and stop animating
        col = base;
        if (entityRef.current?.polyline) {
          entityRef.current.polyline.material = base.withAlpha(0.12);
        }
        return; // stop the loop
      }

      // Apply colour to the polyline material
      if (entityRef.current?.polyline) {
        entityRef.current.polyline.material = col.withAlpha(0.25);
      }

      animationHandle = requestAnimationFrame(update);
    };

    animationHandle = requestAnimationFrame(update);

    return () => {
      if (animationHandle !== null) cancelAnimationFrame(animationHandle);
    };
  }, [viewer, Cesium, maneuverStartMs, color, isManual]);

  // Cleanup on component unmount
  useEffect(() => {
    return () => {
      if (cleanupRef.current) {
        cleanupRef.current();
        cleanupRef.current = null;
      }
    };
  }, []);

  // This component does not render any DOM nodes – it works purely with Cesium.
  return null;
}
