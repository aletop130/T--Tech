'use client';

import { useEffect, useRef, useState, memo } from 'react';
import { getCesium, type CesiumModule } from '@/lib/cesium/loader';
import { Viewer, useCesium } from 'resium';
import { SatelliteOverItaly } from '@/lib/api';
import { getEntityIcon } from '@/lib/cesium/entity-icons';

// ── Italian ground stations ───────────────────────────────────────────────────

export interface GroundStation {
  id: string;
  name: string;
  shortName: string;
  lat: number;
  lon: number;
  color: string;
  categories: string[];
  operator: string;
}

export const GROUND_STATIONS: GroundStation[] = [
  {
    id: 'fucino',
    name: 'Fucino Space Centre',
    shortName: 'Fucino',
    lat: 41.9775, lon: 13.6000,
    color: '#38bdf8',
    categories: ['NAVIGATION', 'TELECOM'],
    operator: 'Telespazio / ESA',
  },
  {
    id: 'matera',
    name: 'Centro Geodesia Spaziale',
    shortName: 'Matera CGS',
    lat: 40.6491, lon: 16.7046,
    color: '#22c55e',
    categories: ['EARTH_OBSERVATION', 'GEODESY'],
    operator: 'ASI',
  },
  {
    id: 'vigna',
    name: 'CIGC Vigna di Valle',
    shortName: 'Vigna di Valle',
    lat: 42.0850, lon: 12.2300,
    color: '#a78bfa',
    categories: ['DEFENSE'],
    operator: 'Aeronautica Militare',
  },
  {
    id: 'rome_mod',
    name: 'Ministero della Difesa',
    shortName: 'Roma MoD',
    lat: 41.9039, lon: 12.4921,
    color: '#a78bfa',
    categories: ['DEFENSE', 'EARTH_OBSERVATION'],
    operator: 'ASI / Min. Difesa',
  },
  {
    id: 'torino',
    name: 'Thales Alenia Space',
    shortName: 'Torino TAS',
    lat: 45.0632, lon: 7.5942,
    color: '#fb923c',
    categories: ['EARTH_OBSERVATION', 'DEFENSE', 'TELECOM'],
    operator: 'Thales Alenia / Leonardo',
  },
  {
    id: 'milan',
    name: 'Borsa Italiana / Euronext',
    shortName: 'Milano BIT',
    lat: 45.4634, lon: 9.1807,
    color: '#eab308',
    categories: ['FINANCE', 'NAVIGATION'],
    operator: 'Euronext Milan',
  },
  {
    id: 'naples',
    name: 'NATO JFC Naples',
    shortName: 'Napoli NATO',
    lat: 40.9185, lon: 14.0319,
    color: '#ef4444',
    categories: ['DEFENSE'],
    operator: 'NATO',
  },
  {
    id: 'sardinia',
    name: 'Sardinia Deep Space Antenna',
    shortName: 'Sardegna DSA',
    lat: 39.4886, lon: 9.2457,
    color: '#38bdf8',
    categories: ['SCIENCE', 'NAVIGATION'],
    operator: 'ESA / ASI',
  },
];

// ── helpers ───────────────────────────────────────────────────────────────────

function satColorHex(sat: SatelliteOverItaly): string {
  if (sat.is_italian) return '#22c55e';
  if (sat.critical_services_count > 0) return '#ef4444';
  if (sat.italian_services.length > 0) return '#f97316';
  if (sat.orbit_type === 'GEO') return '#fb923c';
  if (sat.orbit_type === 'MEO') return '#818cf8';
  return '#38bdf8';
}

function satColor(Cesium: CesiumModule, sat: SatelliteOverItaly) {
  return Cesium.Color.fromCssColorString(satColorHex(sat));
}

export function gcDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function matchingStations(sat: SatelliteOverItaly): GroundStation[] {
  const satCats = new Set(sat.italian_services.map(s => s.category));
  const name = sat.name.toUpperCase();
  if (name.includes('GALILEO') || name.includes('GSAT')) satCats.add('NAVIGATION');
  return GROUND_STATIONS.filter(gs => gs.categories.some(c => satCats.has(c)));
}

export function isVisible(sat: SatelliteOverItaly, gs: GroundStation): boolean {
  if (sat.orbit_type === 'GEO') return true;
  const d = gcDistance(sat.latitude, sat.longitude, gs.lat, gs.lon);
  return d < sat.footprint_radius_km;
}

/** Build a canvas data-URL crosshair ring for the selected satellite. */
function buildCrosshairCanvas(hexColor: string): string {
  const canvas = document.createElement('canvas');
  canvas.width = 48; canvas.height = 48;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  ctx.strokeStyle = hexColor;
  ctx.lineWidth = 1.5;
  // outer ring
  ctx.beginPath();
  ctx.arc(24, 24, 18, 0, Math.PI * 2);
  ctx.stroke();
  // crosshair ticks
  ctx.beginPath();
  ctx.moveTo(4,  24); ctx.lineTo(12, 24);
  ctx.moveTo(36, 24); ctx.lineTo(44, 24);
  ctx.moveTo(24, 4);  ctx.lineTo(24, 12);
  ctx.moveTo(24, 36); ctx.lineTo(24, 44);
  ctx.stroke();
  return canvas.toDataURL();
}

// ── inner layer ───────────────────────────────────────────────────────────────

interface LayerProps {
  Cesium: CesiumModule;
  satellites: SatelliteOverItaly[];
  selectedNoradId?: number;
  onSelect: (sat: SatelliteOverItaly) => void;
  showSats: boolean;
  showBases: boolean;
}

const ItalyMapLayer = memo(function ItalyMapLayer({
  Cesium, satellites, selectedNoradId, onSelect, showSats, showBases,
}: LayerProps) {
  const { viewer } = useCesium();
  const satCleanupRef  = useRef<(() => void) | null>(null);
  const gsCleanupRef   = useRef<(() => void) | null>(null);
  const handlerRef     = useRef<any>(null);
  const initRef        = useRef(false);
  const satEntityIdsRef = useRef<string[]>([]);
  const gsEntityIdsRef  = useRef<string[]>([]);

  // ── one-time scene + camera setup ─────────────────────────────────────────
  useEffect(() => {
    if (!viewer || initRef.current) return;
    initRef.current = true;

    (viewer.cesiumWidget as any).showRenderLoopErrors = false;
    viewer.scene.renderError.addEventListener((_s: any, err: any) =>
      console.warn('Cesium render warning:', err?.message)
    );
    viewer.scene.globe.enableLighting = false;
    viewer.scene.globe.show = true;
    viewer.scene.backgroundColor = Cesium.Color.fromCssColorString('#060d1a');
    if (viewer.scene.skyAtmosphere) viewer.scene.skyAtmosphere.show = false;
    viewer.scene.fog.enabled = false;

    try {
      viewer.imageryLayers.removeAll();
      viewer.imageryLayers.addImageryProvider(
        new Cesium.UrlTemplateImageryProvider({
          url: 'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
          maximumLevel: 19,
          credit: new Cesium.Credit('© Esri'),
        })
      );
    } catch {}

    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(12.5, 41.9, 2_400_000),
      orientation: { heading: 0, pitch: -Cesium.Math.PI_OVER_TWO, roll: 0 },
      duration: 2.0,
    });

    // Italy bbox
    try {
      viewer.entities.add({
        id: 'italy-bbox',
        polyline: {
          positions: Cesium.Cartesian3.fromDegreesArray([
            5.5, 35.0, 19.5, 35.0, 19.5, 48.0, 5.5, 48.0, 5.5, 35.0,
          ]),
          width: 1.5,
          material: Cesium.Color.fromCssColorString('#22c55e').withAlpha(0.3),
          arcType: (Cesium as any).ArcType?.NONE,
          clampToGround: false,
        },
      });
    } catch {}
  }, [viewer, Cesium]);

  // ── ground station markers ─────────────────────────────────────────────────
  useEffect(() => {
    if (!viewer || viewer.isDestroyed() || !viewer.entities) return;
    if (gsCleanupRef.current) { gsCleanupRef.current(); gsCleanupRef.current = null; }

    const ids: string[] = [];

    for (const gs of GROUND_STATIONS) {
      const col = Cesium.Color.fromCssColorString(gs.color);
      const gsId = `gs-${gs.id}`;
      const gsRingId = `gs-ring-${gs.id}`;

      try {
        viewer.entities.add({
          id: gsRingId,
          show: showBases,
          position: Cesium.Cartesian3.fromDegrees(gs.lon, gs.lat, 0),
          ellipse: {
            semiMajorAxis: 18000,
            semiMinorAxis: 18000,
            height: 0,
            material: col.withAlpha(0.1),
            outline: true,
            outlineColor: col.withAlpha(0.45),
            outlineWidth: 1,
          },
        });
        ids.push(gsRingId);

        viewer.entities.add({
          id: gsId,
          show: showBases,
          name: gs.name,
          position: Cesium.Cartesian3.fromDegrees(gs.lon, gs.lat, 100),
          billboard: {
            image: getEntityIcon('ground_station', gs.color),
            width: 26,
            height: 26,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
            scaleByDistance: new Cesium.NearFarScalar(5e5, 1.0, 3e6, 0.7),
          },
          label: {
            text: gs.shortName,
            font: '10px monospace',
            fillColor: col,
            outlineColor: Cesium.Color.fromCssColorString('#000'),
            outlineWidth: 2,
            style: (Cesium as any).LabelStyle?.FILL_AND_OUTLINE,
            verticalOrigin: (Cesium as any).VerticalOrigin?.BOTTOM,
            pixelOffset: new Cesium.Cartesian2(0, -12),
            show: true,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
            scaleByDistance: new Cesium.NearFarScalar(5e5, 1.0, 3e6, 0.7),
          },
        });
        ids.push(gsId);
      } catch {}
    }

    gsEntityIdsRef.current = ids;

    gsCleanupRef.current = () => {
      if (!viewer || viewer.isDestroyed() || !viewer.entities) return;
      for (const id of ids) {
        try { const e = viewer.entities.getById(id); if (e) viewer.entities.remove(e); } catch {}
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewer, Cesium]);

  // ── toggle GS visibility ───────────────────────────────────────────────────
  useEffect(() => {
    if (!viewer || viewer.isDestroyed()) return;
    for (const id of gsEntityIdsRef.current) {
      try {
        const e = viewer.entities.getById(id);
        if (e) (e as any).show = showBases;
      } catch {}
    }
  }, [viewer, showBases]);

  // ── satellite points + lines ───────────────────────────────────────────────
  useEffect(() => {
    if (!viewer || viewer.isDestroyed() || !viewer.entities) return;
    if (satCleanupRef.current) { satCleanupRef.current(); satCleanupRef.current = null; }

    const ids: string[] = [];
    const selectedSat = satellites.find(s => s.norad_id === selectedNoradId) ?? null;

    for (const sat of satellites) {
      const isSelected = sat.norad_id === selectedNoradId;
      const col = satColor(Cesium, sat);
      const hex = satColorHex(sat);
      const altM = sat.altitude * 1000;
      const pos = Cesium.Cartesian3.fromDegrees(sat.longitude, sat.latitude, altM);
      const groundPos = Cesium.Cartesian3.fromDegrees(sat.longitude, sat.latitude, 0);

      // ── satellite icon ──
      try {
        const satIconSize = sat.is_italian ? (isSelected ? 30 : 22) : (isSelected ? 26 : 18);
        viewer.entities.add({
          id: `italy-sat-${sat.norad_id}`,
          show: showSats,
          name: sat.name,
          position: pos,
          billboard: {
            image: getEntityIcon('satellite', hex),
            width: satIconSize,
            height: satIconSize,
            heightReference: (Cesium as any).HeightReference?.NONE,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
            scaleByDistance: new Cesium.NearFarScalar(1e5, 1.6, 5e6, 0.7),
          },
          label: {
            text: sat.name,
            font: isSelected ? '11px monospace' : '10px monospace',
            fillColor: Cesium.Color.WHITE,
            outlineColor: Cesium.Color.fromCssColorString('#000'),
            outlineWidth: 2,
            style: (Cesium as any).LabelStyle?.FILL_AND_OUTLINE,
            verticalOrigin: (Cesium as any).VerticalOrigin?.BOTTOM,
            pixelOffset: new Cesium.Cartesian2(0, -14),
            show: isSelected || sat.is_italian,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
        });
        ids.push(`italy-sat-${sat.norad_id}`);
      } catch {}

      // ── crosshair ring for selected satellite ──
      if (isSelected) {
        try {
          const ringCanvas = buildCrosshairCanvas(hex);
          if (ringCanvas) {
            viewer.entities.add({
              id: `italy-sel-ring-${sat.norad_id}`,
              show: showSats,
              position: pos,
              billboard: {
                image: ringCanvas,
                width: 48,
                height: 48,
                disableDepthTestDistance: Number.POSITIVE_INFINITY,
                scaleByDistance: new Cesium.NearFarScalar(1e5, 1.6, 5e6, 0.7),
              },
            });
            ids.push(`italy-sel-ring-${sat.norad_id}`);
          }
        } catch {}
      }

      // ── footprint (selected only, always green) ──
      if (isSelected && sat.footprint_radius_km > 0 && sat.footprint_radius_km < 8000) {
        try {
          const green = Cesium.Color.fromCssColorString('#22c55e');
          viewer.entities.add({
            id: `italy-fp-${sat.norad_id}`,
            show: showSats,
            position: groundPos,
            ellipse: {
              semiMajorAxis: sat.footprint_radius_km * 1000,
              semiMinorAxis: sat.footprint_radius_km * 1000,
              height: 0,
              material: green.withAlpha(0.06),
              outline: true,
              outlineColor: green.withAlpha(0.5),
              outlineWidth: 1.5,
            },
          });
          ids.push(`italy-fp-${sat.norad_id}`);
        } catch {}
      }

      // ── nadir line (selected or Italian) ──
      if (isSelected || sat.is_italian) {
        try {
          viewer.entities.add({
            id: `italy-nadir-${sat.norad_id}`,
            show: showSats,
            polyline: {
              positions: [pos, groundPos],
              width: isSelected ? 1.5 : 0.8,
              material: col.withAlpha(isSelected ? 0.5 : 0.2),
              arcType: (Cesium as any).ArcType?.NONE,
            },
          });
          ids.push(`italy-nadir-${sat.norad_id}`);
        } catch {}
      }

      // ── always-on dim connections for ALL sats with Italian service deps ──
      if (!isSelected && (sat.is_italian || sat.italian_services.length > 0)) {
        const stations = matchingStations(sat).filter(gs => isVisible(sat, gs));
        for (const gs of stations.slice(0, 2)) {
          const gsCol = Cesium.Color.fromCssColorString(gs.color);
          const lineId = `italy-always-${sat.norad_id}-${gs.id}`;
          try {
            viewer.entities.add({
              id: lineId,
              show: showSats,
              polyline: {
                positions: [
                  pos,
                  Cesium.Cartesian3.fromDegrees(gs.lon, gs.lat, 100),
                ],
                width: 0.8,
                material: new (Cesium as any).PolylineDashMaterialProperty({
                  color: gsCol.withAlpha(0.22),
                  dashLength: 20,
                }),
                arcType: (Cesium as any).ArcType?.NONE,
              },
            });
            ids.push(lineId);
          } catch {}
        }
      }
    }

    // ── selected satellite: bright glow connections ────────────────────────
    if (selectedSat) {
      const stations = matchingStations(selectedSat).filter(gs => isVisible(selectedSat, gs));
      for (const gs of stations) {
        const gsCol = Cesium.Color.fromCssColorString(gs.color);
        const satPos3D = Cesium.Cartesian3.fromDegrees(
          selectedSat.longitude, selectedSat.latitude, selectedSat.altitude * 1000
        );
        const gsPos3D = Cesium.Cartesian3.fromDegrees(gs.lon, gs.lat, 100);
        const lineId = `italy-link-${selectedSat.norad_id}-${gs.id}`;
        try {
          viewer.entities.add({
            id: lineId,
            show: showSats,
            polyline: {
              positions: [satPos3D, gsPos3D],
              width: 2,
              material: new (Cesium as any).PolylineGlowMaterialProperty({
                glowPower: 0.22,
                color: gsCol.withAlpha(0.9),
              }),
              arcType: (Cesium as any).ArcType?.NONE,
            },
          });
          ids.push(lineId);
        } catch {
          try {
            viewer.entities.add({
              id: lineId + '-fb',
              show: showSats,
              polyline: {
                positions: [satPos3D, gsPos3D],
                width: 2,
                material: gsCol.withAlpha(0.75),
                arcType: (Cesium as any).ArcType?.NONE,
              },
            });
            ids.push(lineId + '-fb');
          } catch {}
        }
      }
    }

    satEntityIdsRef.current = ids;

    satCleanupRef.current = () => {
      if (!viewer || viewer.isDestroyed() || !viewer.entities) return;
      for (const id of ids) {
        try { const e = viewer.entities.getById(id); if (e) viewer.entities.remove(e); } catch {}
      }
    };
  }, [viewer, satellites, selectedNoradId, Cesium, showSats]);

  // ── toggle sat visibility ──────────────────────────────────────────────────
  useEffect(() => {
    if (!viewer || viewer.isDestroyed()) return;
    for (const id of satEntityIdsRef.current) {
      try {
        const e = viewer.entities.getById(id);
        if (e) (e as any).show = showSats;
      } catch {}
    }
  }, [viewer, showSats]);

  // ── fly to selected satellite ──────────────────────────────────────────────
  useEffect(() => {
    if (!viewer || !selectedNoradId) return;
    const sat = satellites.find(s => s.norad_id === selectedNoradId);
    if (!sat) return;
    const dist = sat.orbit_type === 'GEO' ? 8_000_000 : Math.max(sat.altitude * 3000, 1_400_000);
    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(sat.longitude, sat.latitude, dist),
      orientation: { heading: 0, pitch: -Cesium.Math.PI_OVER_TWO, roll: 0 },
      duration: 1.2,
    });
  }, [viewer, selectedNoradId, satellites, Cesium]);

  // ── click handler ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!viewer) return;
    if (handlerRef.current) { try { handlerRef.current.destroy(); } catch {} handlerRef.current = null; }

    const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
    handler.setInputAction((e: any) => {
      try {
        const picked = viewer.scene.pick(e.position);
        if (!picked?.id) return;
        const entityId: string = picked.id?.id ?? '';
        if (entityId.startsWith('italy-sat-')) {
          const noradId = parseInt(entityId.replace('italy-sat-', ''), 10);
          const sat = satellites.find(s => s.norad_id === noradId);
          if (sat) onSelect(sat);
        }
      } catch {}
    }, (Cesium as any).ScreenSpaceEventType?.LEFT_CLICK);

    handlerRef.current = handler;
    return () => { try { handler.destroy(); } catch {}; handlerRef.current = null; };
  }, [viewer, satellites, onSelect, Cesium]);

  // ── cleanup on unmount ─────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (satCleanupRef.current) satCleanupRef.current();
      if (gsCleanupRef.current) gsCleanupRef.current();
      if (handlerRef.current) { try { handlerRef.current.destroy(); } catch {} }
    };
  }, []);

  return null;
});

// ── public component ──────────────────────────────────────────────────────────

interface ItalyCesiumMapProps {
  satellites: SatelliteOverItaly[];
  selectedNoradId?: number;
  onSelect: (sat: SatelliteOverItaly) => void;
}

export function ItalyCesiumMap({ satellites, selectedNoradId, onSelect }: ItalyCesiumMapProps) {
  const creditRef  = useRef<HTMLDivElement | null>(null);
  const [cesium, setCesium]     = useState<CesiumModule | null>(null);
  const [mounted, setMounted]   = useState(false);
  const [showSats,  setShowSats]  = useState(true);
  const [showBases, setShowBases] = useState(true);

  useEffect(() => {
    setMounted(true);
    creditRef.current = document.createElement('div');
    getCesium().then(setCesium);
  }, []);

  if (!mounted || !cesium) {
    return (
      <div className="flex items-center justify-center h-full flex-col gap-3"
           style={{ background: '#060d1a' }}>
        <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin"
             style={{ borderColor: '#22c55e', borderTopColor: 'transparent' }} />
        <p className="text-[10px] font-mono uppercase tracking-widest" style={{ color: '#4ade80' }}>
          Initializing map...
        </p>
      </div>
    );
  }

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <Viewer
        full
        timeline={false} animation={false} vrButton={false}
        geocoder={false} homeButton={false} infoBox={false}
        sceneModePicker={true} baseLayerPicker={false}
        navigationHelpButton={false} selectionIndicator={false}
        skyBox={false} creditContainer={creditRef.current ?? undefined}
      >
        <ItalyMapLayer
          Cesium={cesium}
          satellites={satellites}
          selectedNoradId={selectedNoradId}
          onSelect={onSelect}
          showSats={showSats}
          showBases={showBases}
        />
      </Viewer>

      {/* overlay controls + legend */}
      <div className="absolute bottom-4 left-3 flex flex-col gap-2 pointer-events-auto"
           style={{ background: 'rgba(6,13,26,0.88)', border: '1px solid rgba(255,255,255,0.07)',
                    borderRadius: 8, padding: '8px 10px', minWidth: 160 }}>

        {/* layer toggles */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowSats(v => !v)}
            className="flex items-center gap-1.5 px-2 py-1 rounded text-[9px] font-mono font-semibold tracking-wider uppercase transition-colors"
            style={{
              background: showSats ? 'rgba(56,189,248,0.12)' : 'rgba(255,255,255,0.04)',
              border: `1px solid ${showSats ? 'rgba(56,189,248,0.35)' : 'rgba(255,255,255,0.1)'}`,
              color: showSats ? '#38bdf8' : '#475569',
            }}
          >
            <span style={{ fontSize: 7 }}>●</span> Satellites
          </button>
          <button
            onClick={() => setShowBases(v => !v)}
            className="flex items-center gap-1.5 px-2 py-1 rounded text-[9px] font-mono font-semibold tracking-wider uppercase transition-colors"
            style={{
              background: showBases ? 'rgba(34,197,94,0.12)' : 'rgba(255,255,255,0.04)',
              border: `1px solid ${showBases ? 'rgba(34,197,94,0.35)' : 'rgba(255,255,255,0.1)'}`,
              color: showBases ? '#22c55e' : '#475569',
            }}
          >
            <span style={{ fontSize: 7 }}>▲</span> Bases
          </button>
        </div>

        {/* divider */}
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }} />

        {/* satellite legend */}
        <div>
          <p className="text-[8px] font-mono font-semibold uppercase tracking-widest mb-1.5"
             style={{ color: '#475569' }}>Satellites</p>
          {[
            { color: '#22c55e', label: 'Italian asset' },
            { color: '#ef4444', label: 'Critical services' },
            { color: '#f97316', label: 'IT dependencies' },
            { color: '#38bdf8', label: 'LEO / other' },
          ].map(({ color, label }) => (
            <div key={label} className="flex items-center gap-1.5 mb-0.5">
              <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: color }} />
              <span className="text-[9px] font-mono" style={{ color: '#94a3b8' }}>{label}</span>
            </div>
          ))}
        </div>

        {/* divider */}
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }} />

        {/* ground station legend */}
        <div>
          <p className="text-[8px] font-mono font-semibold uppercase tracking-widest mb-1.5"
             style={{ color: '#475569' }}>Ground Stations</p>
          {GROUND_STATIONS.map(gs => (
            <div key={gs.id} className="flex items-center gap-1.5 mb-0.5">
              <div className="w-1.5 h-1.5 rounded-full border shrink-0"
                   style={{ background: gs.color, borderColor: 'rgba(255,255,255,0.3)' }} />
              <span className="text-[9px] font-mono" style={{ color: '#94a3b8' }}>{gs.shortName}</span>
            </div>
          ))}
        </div>
      </div>

      {/* count badge */}
      {satellites.length > 0 && (
        <div className="absolute top-3 right-3 px-2.5 py-1 rounded text-[10px] font-mono font-bold pointer-events-none"
             style={{ background: 'rgba(6,13,26,0.88)', border: '1px solid rgba(56,189,248,0.28)', color: '#38bdf8' }}>
          {satellites.length} sat · {GROUND_STATIONS.length} bases
        </div>
      )}
    </div>
  );
}
