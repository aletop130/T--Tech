WRITE_TARGET="/root/T--Tech/frontend/src/components/CesiumMap/DetourLayer.tsx"
WRITE_CONTENT_LENGTH=1127
'use client';

import { useEffect, useRef, useState, useCallback, memo } from 'react';
import { getCesium, type CesiumModule } from '@/lib/cesium/loader';
import { ConjunctionEvent } from '@/lib/api';

interface DetourLayerProps {
  viewer: CesiumModule.Viewer | null;
  conjunctions: ConjunctionEvent[];
  satellitePositions: Map<string, CesiumModule.Cartesian3>;
  maxVisible?: number;
  onSelectConjunction?: (conjunction: ConjunctionEvent) => void;
}

/**
 * Cesium layer for visualising Detour conjunction analysis.
 * Features:
 *  - Primary & secondary satellite markers (points)
 *  - TCA approach line (glowing polyline)
 *  - Simple heat‑map ellipse coloured by risk level
 *  - Click handling to select a conjunction event
 *  - Entity cleanup on updates / unmount
 *  - Optional limiting of displayed entities for performance
 */
export function DetourLayer({
  viewer,
  conjunctions,
  satellitePositions,
  maxVisible = 200,
  onSelectConjunction,
}: DetourLayerProps) {
  const cleanupRef = useRef<(() => void) | null>(null);
  const [Cesium, setCesium] = useState<CesiumModule | null>(null);

  // Load Cesium module once
  useEffect(() => {
    getCesium().then(setCesium);
  }, []);

  // Helper to map risk level to colour
  const riskColor = useCallback(
    (level: string) => {
      if (!Cesium) return Cesium?.Color.WHITE;
      switch (level) {
        case 'critical':
        case 'high':
          return Cesium.Color.RED;
        case 'medium':
          return Cesium.Color.ORANGE;
        case 'low':
          return Cesium.Color.YELLOW;
        default:
          return Cesium.Color.WHITE;
      }
    },
    [Cesium]
  );

  // Main entity management effect
  useEffect(() => {
    if (!viewer || !Cesium) return;

    // Clean previous entities if any
    if (cleanupRef.current) {
      cleanupRef.current();
      cleanupRef.current = null;
    }

    // Wait for viewer.entities to become available (similar pattern to other layers)
    if (!viewer?.entities) {
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

    const currentEntities = new Set<string>();
    const limited = conjunctions.slice(0, maxVisible);

    limited.forEach((conj) => {
      const posPrimary = satellitePositions.get(conj.primary_object_id);
      const posSecondary = satellitePositions.get(conj.secondary_object_id);

      if (!posPrimary || !posSecondary) return;

      // Primary marker
      const primaryId = `detour-primary-${conj.id}`;
      const primaryEntity = viewer.entities.add({
        id: primaryId,
        position: posPrimary,
        point: {
          pixelSize: 8,
          color: Cesium.Color.CYAN,
          outlineColor: Cesium.Color.WHITE,
          outlineWidth: 2,
        },
        description: `<div><strong>Primary:</strong> ${conj.object1_name || conj.primary_object_id}</div>`,
      });
      if (primaryEntity) currentEntities.add(primaryId);

      // Secondary marker
      const secondaryId = `detour-secondary-${conj.id}`;
      const secondaryEntity = viewer.entities.add({
        id: secondaryId,
        position: posSecondary,
        point: {
          pixelSize: 8,
          color: Cesium.Color.MAGENTA,
          outlineColor: Cesium.Color.WHITE,
          outlineWidth: 2,
        },
        description: `<div><strong>Secondary:</strong> ${conj.object2_name || conj.secondary_object_id}</div>`,
      });
      if (secondaryEntity) currentEntities.add(secondaryId);

      // TCA line (glowing polyline)
      const lineId = `detour-line-${conj.id}`;
      viewer.entities.add({
        id: lineId,
        polyline: {
          positions: [posPrimary, posSecondary],
          width: 3,
          material: new Cesium.PolylineGlowMaterialProperty({
            glowPower: 0.5,
            color: riskColor(conj.risk_level),
          }),
          clampToGround: false,
        },
        description: `<div><strong>Risk:</strong> ${conj.risk_level}</div>`,
      });
      currentEntities.add(lineId);

      // Heat‑map ellipse centred on midpoint, radius proportional to miss distance
      const heatId = `detour-heat-${conj.id}`;
      const midpoint = Cesium.Cartesian3.midpoint(posPrimary, posSecondary, new Cesium.Cartesian3());
      const radiusMeters = Math.max(conj.miss_distance_km * 1000, 10000); // minimum size for visibility
      viewer.entities.add({
        id: heatId,
        position: midpoint,
        ellipse: {
          semiMajorAxis: radiusMeters,
          semiMinorAxis: radiusMeters,
          material: riskColor(conj.risk_level).withAlpha(0.2),
        },
        description: `<div><strong>Miss distance:</strong> ${conj.miss_distance_km.toFixed(2)} km</div>`,
      });
      currentEntities.add(heatId);
    });

    // Store cleanup function
    cleanupRef.current = () => {
      if (viewer && !viewer.isDestroyed() && viewer.entities) {
        currentEntities.forEach((id) => {
          try {
            const entity = viewer.entities.getById(id);
            if (entity) viewer.entities.remove(entity);
          } catch {}
        });
      }
      currentEntities.clear();
    };
  }, [viewer, conjunctions, satellitePositions, Cesium, maxVisible, riskColor]);

  // Click handling – registers once when viewer & Cesium are ready
  useEffect(() => {
    if (!viewer || !Cesium) return;
    const handler = new Cesium.ScreenSpaceEventHandler(viewer.canvas);

    const clickCallback = (click: CesiumModule.ScreenSpaceEventHandler.PositionedEvent) => {
      const picked = viewer.scene.pick(click.position);
      if (Cesium.defined(picked) && (picked as any).id instanceof Cesium.Entity) {
        const entity = (picked as any).id as CesiumModule.Entity;
        const match = (entity.id as string).match(/^detour-(?:primary|secondary|line|heat)-(.+)$/);
        if (match) {
          const conjId = match[1];
          const conj = conjunctions.find((c) => c.id === conjId);
          if (conj && onSelectConjunction) {
            onSelectConjunction(conj);
          }
        }
      }
    };

    handler.setInputAction(clickCallback, Cesium.ScreenSpaceEventType.LEFT_CLICK);

    return () => {
      handler.destroy();
    };
  }, [viewer, Cesium, conjunctions, onSelectConjunction]);

  // Cleanup on unmount
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
