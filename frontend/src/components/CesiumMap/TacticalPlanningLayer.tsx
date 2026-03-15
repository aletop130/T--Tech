'use client';

import { useEffect, useRef } from 'react';
import { getCesium, type CesiumModule } from '@/lib/cesium/loader';
import {
  useSandboxStore,
  type SandboxFaction,
  type SandboxPosition,
  type SandboxScenarioItem,
  type TacticalMarker,
  type TacticalRoute,
  type TacticalArea,
} from '@/lib/store/sandbox';

// --------------- COLOR SCHEME ---------------

const FACTION_COLORS: Record<SandboxFaction, { line: string; fill: string; marker: string }> = {
  allied: { line: '#00d4ff', fill: 'rgba(0, 212, 255, 0.12)', marker: '#00d4ff' },
  hostile: { line: '#ff3333', fill: 'rgba(255, 51, 51, 0.12)', marker: '#ff3333' },
  neutral: { line: '#ffaa00', fill: 'rgba(255, 170, 0, 0.12)', marker: '#ffaa00' },
  unknown: { line: '#888888', fill: 'rgba(136, 136, 136, 0.12)', marker: '#888888' },
};

const ROUTE_STYLE: Record<string, { dashPattern: number; width: number }> = {
  attack_axis: { dashPattern: 0, width: 3 },
  retreat_route: { dashPattern: 255, width: 2 },
  patrol_route: { dashPattern: 15, width: 2 },
  supply_route: { dashPattern: 3855, width: 2 },
  phase_line: { dashPattern: 255, width: 4 },
};

const AREA_FILL_ALPHA: Record<string, number> = {
  ao: 0.08,
  kill_zone: 0.18,
  safe_zone: 0.1,
  restricted: 0.14,
  objective_area: 0.12,
};

// --------------- MARKER SVG ICONS ---------------

function buildMarkerSvg(color: string, symbol: string): string {
  return `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="20" height="26" viewBox="0 0 20 26">
    <path d="M10 0 C4.5 0 0 4.5 0 10 C0 18 10 26 10 26 C10 26 20 18 20 10 C20 4.5 15.5 0 10 0Z" fill="${color}" opacity="0.85"/>
    <circle cx="10" cy="9.5" r="5.5" fill="#0a0a0f" opacity="0.6"/>
    <text x="10" y="12.5" text-anchor="middle" fill="${color}" font-size="7" font-weight="bold" font-family="monospace">${symbol}</text>
  </svg>`)}`;
}

const MARKER_SYMBOLS: Record<string, string> = {
  objective: 'OBJ',
  rally_point: 'RP',
  op: 'OP',
  hq: 'HQ',
  checkpoint: 'CP',
};

// --------------- HELPERS ---------------

function hexToColor(Cesium: CesiumModule, hex: string, alpha = 1.0) {
  return Cesium.Color.fromCssColorString(hex).withAlpha(alpha);
}

function posToCartesian(Cesium: CesiumModule, pos: SandboxPosition, clampAlt = 50) {
  return Cesium.Cartesian3.fromDegrees(pos.lon, pos.lat, clampAlt);
}

function positionsToCartesianArray(Cesium: CesiumModule, positions: SandboxPosition[], clampAlt = 10) {
  return positions.map((p) => Cesium.Cartesian3.fromDegrees(p.lon, p.lat, clampAlt));
}

function centroid(positions: SandboxPosition[]): SandboxPosition {
  const n = positions.length;
  if (n === 0) return { lat: 0, lon: 0, alt_m: 0 };
  const sum = positions.reduce(
    (acc, p) => ({ lat: acc.lat + p.lat, lon: acc.lon + p.lon, alt_m: 0 }),
    { lat: 0, lon: 0, alt_m: 0 },
  );
  return { lat: sum.lat / n, lon: sum.lon / n, alt_m: 0 };
}

function midpoint(positions: SandboxPosition[]): SandboxPosition {
  if (positions.length < 2) return positions[0] ?? { lat: 0, lon: 0, alt_m: 0 };
  const mid = Math.floor(positions.length / 2);
  return positions[mid];
}

// --------------- COMPONENT ---------------

interface TacticalPlanningLayerProps {
  viewer: InstanceType<CesiumModule['Viewer']>;
}

/** Extract tactical elements from scenario_items returned by the chat agent. */
function parseTacticalFromScenarioItems(items: SandboxScenarioItem[]) {
  const markers: TacticalMarker[] = [];
  const routes: TacticalRoute[] = [];
  const areas: TacticalArea[] = [];

  for (const item of items) {
    const p = item.payload as Record<string, unknown>;
    if (item.source_type === 'tactical_marker') {
      markers.push({
        id: `si-${item.id}`,
        markerType: (p.marker_type as TacticalMarker['markerType']) ?? 'objective',
        label: item.label,
        position: p.position as SandboxPosition,
        faction: (p.faction as SandboxFaction) ?? 'neutral',
      });
    } else if (item.source_type === 'tactical_route') {
      routes.push({
        id: `si-${item.id}`,
        routeType: (p.route_type as TacticalRoute['routeType']) ?? 'patrol_route',
        label: item.label,
        points: p.points as SandboxPosition[],
        faction: (p.faction as SandboxFaction) ?? 'neutral',
      });
    } else if (item.source_type === 'tactical_area') {
      areas.push({
        id: `si-${item.id}`,
        areaType: (p.area_type as TacticalArea['areaType']) ?? 'ao',
        label: item.label,
        vertices: p.vertices as SandboxPosition[],
        faction: (p.faction as SandboxFaction) ?? 'neutral',
      });
    }
  }
  return { markers, routes, areas };
}

export function TacticalPlanningLayer({ viewer }: TacticalPlanningLayerProps) {
  const groundPlan = useSandboxStore((s) => s.groundPlan);
  const scenarioItems = useSandboxStore((s) => s.snapshot?.scenario_items ?? []);
  const drawingPoints = useSandboxStore((s) => s.drawingPoints);
  const interactionMode = useSandboxStore((s) => s.interactionMode);
  const groundDrawingConfig = useSandboxStore((s) => s.groundDrawingConfig);

  const entityIdsRef = useRef<string[]>([]);

  useEffect(() => {
    let cancelled = false;

    const render = async () => {
      const Cesium = await getCesium();
      if (cancelled || !viewer || viewer.isDestroyed()) return;

      // Remove previous entities
      for (const eid of entityIdsRef.current) {
        const existing = viewer.entities.getById(eid);
        if (existing) viewer.entities.remove(existing);
      }
      entityIdsRef.current = [];

      const addEntity = (id: string, options: Record<string, unknown>) => {
        entityIdsRef.current.push(id);
        viewer.entities.add({ id, ...options } as Parameters<typeof viewer.entities.add>[0]);
      };

      // Merge local ground plan with chat-generated scenario items
      const fromChat = parseTacticalFromScenarioItems(scenarioItems);
      const allMarkers = [...groundPlan.markers, ...fromChat.markers];
      const allRoutes = [...groundPlan.routes, ...fromChat.routes];
      const allAreas = [...groundPlan.areas, ...fromChat.areas];

      // ── RENDER MARKERS ──
      for (const marker of allMarkers) {
        const fc = FACTION_COLORS[marker.faction];
        const symbol = MARKER_SYMBOLS[marker.markerType] ?? '?';
        const eid = `tac-marker-${marker.id}`;

        addEntity(eid, {
          position: posToCartesian(Cesium, marker.position, 50),
          billboard: {
            image: buildMarkerSvg(fc.marker, symbol),
            width: 18,
            height: 23,
            verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
            heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
          label: {
            text: marker.label || symbol,
            font: '9px monospace',
            fillColor: hexToColor(Cesium, fc.marker),
            outlineColor: Cesium.Color.BLACK,
            outlineWidth: 2,
            style: Cesium.LabelStyle.FILL_AND_OUTLINE,
            verticalOrigin: Cesium.VerticalOrigin.TOP,
            pixelOffset: new Cesium.Cartesian2(0, 8),
            heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
        });
      }

      // ── RENDER ROUTES ──
      for (const route of allRoutes) {
        if (route.points.length < 2) continue;
        const fc = FACTION_COLORS[route.faction];
        const style = ROUTE_STYLE[route.routeType] ?? { dashPattern: 0, width: 3 };
        const eid = `tac-route-${route.id}`;

        const positions = positionsToCartesianArray(Cesium, route.points);
        const material =
          style.dashPattern > 0
            ? new Cesium.PolylineDashMaterialProperty({
                color: hexToColor(Cesium, fc.line, 0.9),
                dashLength: 16,
                dashPattern: style.dashPattern,
              })
            : hexToColor(Cesium, fc.line, 0.9);

        addEntity(eid, {
          polyline: {
            positions,
            width: style.width,
            material,
            clampToGround: true,
          },
        });

        // Route label at midpoint
        const mp = midpoint(route.points);
        addEntity(`${eid}-lbl`, {
          position: posToCartesian(Cesium, mp, 80),
          label: {
            text: route.label || route.routeType.replace('_', ' ').toUpperCase(),
            font: 'bold 10px monospace',
            fillColor: hexToColor(Cesium, fc.line),
            outlineColor: Cesium.Color.BLACK,
            outlineWidth: 2,
            style: Cesium.LabelStyle.FILL_AND_OUTLINE,
            heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
        });

        // Waypoint dots
        for (let i = 0; i < route.points.length; i++) {
          addEntity(`${eid}-wp-${i}`, {
            position: posToCartesian(Cesium, route.points[i], 20),
            point: {
              pixelSize: 4,
              color: hexToColor(Cesium, fc.line),
              outlineColor: Cesium.Color.BLACK,
              outlineWidth: 1,
              heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
              disableDepthTestDistance: Number.POSITIVE_INFINITY,
            },
          });
        }

        // Arrow at the end of route (direction indicator)
        if (route.points.length >= 2 && route.routeType === 'attack_axis') {
          const last = route.points[route.points.length - 1];
          const prev = route.points[route.points.length - 2];
          const bearing = Math.atan2(last.lon - prev.lon, last.lat - prev.lat);

          addEntity(`${eid}-arrow`, {
            position: posToCartesian(Cesium, last, 60),
            billboard: {
              image: `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20"><polygon points="10,0 20,20 10,14 0,20" fill="${fc.line}" opacity="0.9"/></svg>`)}`,
              width: 18,
              height: 18,
              rotation: -bearing,
              heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
              disableDepthTestDistance: Number.POSITIVE_INFINITY,
            },
          });
        }
      }

      // ── RENDER AREAS ──
      for (const area of allAreas) {
        if (area.vertices.length < 3) continue;
        const fc = FACTION_COLORS[area.faction];
        const fillAlpha = AREA_FILL_ALPHA[area.areaType] ?? 0.1;
        const eid = `tac-area-${area.id}`;

        const positions = positionsToCartesianArray(Cesium, area.vertices, 0);

        addEntity(eid, {
          polygon: {
            hierarchy: new Cesium.PolygonHierarchy(positions),
            material: hexToColor(Cesium, fc.line, fillAlpha),
            classificationType: Cesium.ClassificationType.BOTH,
          },
        });

        // Outline
        const outlinePositions = [...positions, positions[0]];
        addEntity(`${eid}-outline`, {
          polyline: {
            positions: outlinePositions,
            width: 2,
            material: hexToColor(Cesium, fc.line, 0.6),
            clampToGround: true,
          },
        });

        // Area label at centroid
        const c = centroid(area.vertices);
        addEntity(`${eid}-lbl`, {
          position: posToCartesian(Cesium, c, 100),
          label: {
            text: area.label || area.areaType.replace('_', ' ').toUpperCase(),
            font: 'bold 11px monospace',
            fillColor: hexToColor(Cesium, fc.line),
            outlineColor: Cesium.Color.BLACK,
            outlineWidth: 2,
            style: Cesium.LabelStyle.FILL_AND_OUTLINE,
            heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
        });
      }

      // ── RENDER DRAWING PREVIEW ──
      if (
        (interactionMode === 'draw_route' || interactionMode === 'draw_area') &&
        drawingPoints.length > 0
      ) {
        const config = groundDrawingConfig;
        const fc = FACTION_COLORS[config.faction];

        // Drawing points
        for (let i = 0; i < drawingPoints.length; i++) {
          addEntity(`tac-draw-pt-${i}`, {
            position: posToCartesian(Cesium, drawingPoints[i], 30),
            point: {
              pixelSize: 5,
              color: hexToColor(Cesium, fc.line),
              outlineColor: Cesium.Color.WHITE,
              outlineWidth: 1,
              heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
              disableDepthTestDistance: Number.POSITIVE_INFINITY,
            },
          });
        }

        // Drawing polyline
        if (drawingPoints.length >= 2) {
          const pts = positionsToCartesianArray(Cesium, drawingPoints);
          // For areas, close the loop
          if (interactionMode === 'draw_area') {
            pts.push(pts[0]);
          }
          addEntity('tac-draw-line', {
            polyline: {
              positions: pts,
              width: 2,
              material: new Cesium.PolylineDashMaterialProperty({
                color: hexToColor(Cesium, fc.line, 0.7),
                dashLength: 12,
                dashPattern: 255,
              }),
              clampToGround: true,
            },
          });
        }

        // Drawing label
        addEntity('tac-draw-lbl', {
          position: posToCartesian(Cesium, drawingPoints[drawingPoints.length - 1], 100),
          label: {
            text: `${drawingPoints.length} pts`,
            font: '10px monospace',
            fillColor: hexToColor(Cesium, fc.line, 0.8),
            outlineColor: Cesium.Color.BLACK,
            outlineWidth: 1,
            style: Cesium.LabelStyle.FILL_AND_OUTLINE,
            pixelOffset: new Cesium.Cartesian2(15, -10),
            heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
        });
      }
    };

    void render();

    return () => {
      cancelled = true;
    };
  }, [viewer, groundPlan, scenarioItems, drawingPoints, interactionMode, groundDrawingConfig]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (!viewer || viewer.isDestroyed()) return;
      for (const eid of entityIdsRef.current) {
        const existing = viewer.entities.getById(eid);
        if (existing) viewer.entities.remove(existing);
      }
      entityIdsRef.current = [];
    };
  }, [viewer]);

  return null;
}
