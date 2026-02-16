'use client';

import { useEffect, useRef, useState } from 'react';
import { getCesium, type CesiumModule } from '@/lib/cesium/loader';
import type { OrbitTrackState } from '@/lib/types/debris';

/**
 * Props for the moving satellite marker visualiser.
 */
interface MovingSatelliteMarkerProps {
  /** Cesium Viewer instance (or null while loading) */
  viewer: InstanceType<CesiumModule['Viewer']> | null;
  /** Pre‑computed orbit positions as Cesium Cartesian3 objects */
  orbitTrack: OrbitTrackState;
  /** Whether the satellite is manually controlled – influences colour */
  isManual?: boolean;
  /** Timestamp (ms since epoch) when a maneuver started – triggers colour/size animation */
  maneuverStartMs?: number;
  /** Damping factor for smooth movement – default 0.08 */
  damping?: number;
}

/**
 * Cesium layer that renders a single moving satellite marker.
 * It animates along the supplied orbit using linear interpolation (lerp)
 * and applies a small damping factor for smooth motion.
 * During a maneuver the marker flashes red and briefly enlarges.
 */
export function MovingSatelliteMarker({
  viewer,
  orbitTrack,
  isManual = false,
  maneuverStartMs,
  damping = 0.08,
}: MovingSatelliteMarkerProps) {
  const cleanupRef = useRef<(() => void) | null>(null);
  const tickHandlerRef = useRef<((clock: any) => void) | null>(null);
  const animationHandleRef = useRef<number | null>(null);
  const entityRef = useRef<any>(null);
  const [Cesium, setCesium] = useState<CesiumModule | null>(null);

  // Load Cesium module once
  useEffect(() => {
    getCesium().then(setCesium);
  }, []);

  // Create the Cesium entity (point) – recreate when viewer, Cesium or track changes
  useEffect(() => {
    if (!viewer || !Cesium) return;

    // Remove any previous entity
    if (cleanupRef.current) {
      cleanupRef.current();
      cleanupRef.current = null;
    }

    const baseColor = isManual
      ? Cesium.Color.fromCssColorString('#10b981') // green for manual control
      : Cesium.Color.fromCssColorString('#22d3ee'); // cyan for auto

    const entityId = `moving-sat-${orbitTrack.timeStartMs}`;
    const startPos = orbitTrack.points?.[0] ?? new Cesium.Cartesian3(0, 0, 0);

    const entity = viewer.entities.add({
      id: entityId,
      position: startPos,
      point: {
        pixelSize: 12,
        color: baseColor,
        outlineColor: Cesium.Color.WHITE,
        outlineWidth: 2,
      },
    });

    entityRef.current = entity;

    // Cleanup function to remove the entity
    cleanupRef.current = () => {
      if (!viewer.isDestroyed() && viewer.entities) {
        const e = viewer.entities.getById(entityId);
        if (e) viewer.entities.remove(e);
      }
    };
  }, [viewer, Cesium, orbitTrack, isManual]);

  // Animation loop – update position on each Cesium tick
  useEffect(() => {
    if (!viewer || !Cesium || !entityRef.current) return;
    const points = orbitTrack.points;
    if (!points || points.length < 2) return;
    const stepMs = orbitTrack.stepSec * 1000;
    const totalPoints = points.length;
    const baseIdxRef = { current: 0 };
    let prevPos = points[0];

    const tickHandler = (clock: any) => {
      // Current simulation time in ms
      const simMs = Cesium.JulianDate.toDate(clock.currentTime).getTime();
      const elapsed = simMs - orbitTrack.timeStartMs;

      // Determine indices for interpolation
      const idxFloat = elapsed / stepMs;
      let baseIdx = Math.floor(idxFloat);
      const fraction = idxFloat - baseIdx;

      // Wrap index to always stay within the track (excluding the last duplicate point)
      baseIdx = ((baseIdx % (totalPoints - 1)) + (totalPoints - 1)) % (totalPoints - 1);
      const nextIdx = (baseIdx + 1) % totalPoints;

      // Interpolate between the two surrounding points
      const targetPos = Cesium.Cartesian3.lerp(
        points[baseIdx],
        points[nextIdx],
        fraction,
        new Cesium.Cartesian3()
      );

      // Apply damping for smooth movement
      const newPos = Cesium.Cartesian3.lerp(
        prevPos,
        targetPos,
        damping,
        new Cesium.Cartesian3()
      );

      entityRef.current.position = newPos;
      prevPos = newPos;
    };

    // Register the tick handler
    viewer.clock.onTick.addEventListener(tickHandler);
    tickHandlerRef.current = tickHandler;

    // Cleanup on unmount / dependencies change
    return () => {
      if (tickHandlerRef.current) {
        viewer.clock.onTick.removeEventListener(tickHandlerRef.current);
        tickHandlerRef.current = null;
      }
    };
  }, [viewer, Cesium, orbitTrack, damping]);

  // Maneuver animation – colour flash + size pulse
  useEffect(() => {
    if (!viewer || !Cesium || !entityRef.current) return;
    if (maneuverStartMs === undefined) return;

    const baseColor = isManual
      ? Cesium.Color.fromCssColorString('#10b981')
      : Cesium.Color.fromCssColorString('#22d3ee');
    const baseSize = 12;
    const maxSize = 20;

    const animate = () => {
      const now = Date.now();
      const elapsed = now - maneuverStartMs;

      let col = baseColor;
      let size = baseSize;

      if (elapsed >= 0 && elapsed <= 300) {
        // Ramp to red and increase size
        col = Cesium.Color.lerp(baseColor, Cesium.Color.RED, elapsed / 300, new Cesium.Color())!;
        size = baseSize + (maxSize - baseSize) * (elapsed / 300);
      } else if (elapsed > 300 && elapsed <= 2500) {
        col = Cesium.Color.RED;
        size = maxSize;
      } else if (elapsed > 2500 && elapsed <= 3500) {
        const t = (elapsed - 2500) / 1000;
        col = Cesium.Color.lerp(Cesium.Color.RED, baseColor, t, new Cesium.Color())!;
        size = maxSize - (maxSize - baseSize) * t;
      } else {
        // End of animation – restore base state
        col = baseColor;
        size = baseSize;
        // Apply final state and stop loop
        entityRef.current.point.color = col;
        entityRef.current.point.pixelSize = size;
        return; // stop further frames
      }

      // Apply colour and size to the entity
      entityRef.current.point.color = col;
      entityRef.current.point.pixelSize = size;

      animationHandleRef.current = requestAnimationFrame(animate);
    };

    animationHandleRef.current = requestAnimationFrame(animate);

    // Cleanup on effect teardown
    return () => {
      if (animationHandleRef.current !== null) {
        cancelAnimationFrame(animationHandleRef.current);
        animationHandleRef.current = null;
      }
      // Ensure entity returns to base appearance
      if (entityRef.current) {
        entityRef.current.point.color = baseColor;
        entityRef.current.point.pixelSize = baseSize;
      }
    };
  }, [viewer, Cesium, maneuverStartMs, isManual]);

  // Component unmount cleanup – remove entity and listeners
  useEffect(() => {
    return () => {
      if (cleanupRef.current) {
        cleanupRef.current();
        cleanupRef.current = null;
      }
      if (viewer && tickHandlerRef.current) {
        viewer.clock.onTick.removeEventListener(tickHandlerRef.current);
        tickHandlerRef.current = null;
      }
    };
  }, [viewer]);

  // This component does not render any DOM – it only interacts with Cesium.
  return null;
}
