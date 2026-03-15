'use client';

import { useEffect, useState, useRef, useCallback, Suspense, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import dynamic from 'next/dynamic';
import { useRouter, useSearchParams } from 'next/navigation';
import { Spinner, Tag, Icon, Button, Checkbox } from '@blueprintjs/core';
import { api, GroundStation, Satellite, ConjunctionEvent, PositionReport } from '@/lib/api';
import { getDebris } from '@/lib/api/debris';
import { getCesium, type CesiumModule } from '@/lib/cesium/loader';
import type { DebrisObject, OrbitTrackState } from '@/lib/types/debris';
import { AgentChat } from '@/components/Chat/AgentChat';
import { CompactAlertsButton } from '@/components/ProximityAlertPanel/CompactAlertsButton';
import { cesiumController } from '@/lib/cesium/controller';
import { useResizablePanel } from '@/hooks/useResizablePanel';

// Dynamic imports for heavy CesiumMap components (no SSR)
const CesiumViewer = dynamic(() => import('@/components/CesiumMap/CesiumViewer').then(m => ({ default: m.CesiumViewer })), { ssr: false });
const SatelliteLayer = dynamic(() => import('@/components/CesiumMap/SatelliteLayer').then(m => ({ default: m.SatelliteLayer })), { ssr: false });
const GroundStationLayer = dynamic(() => import('@/components/CesiumMap/GroundStationLayer').then(m => ({ default: m.GroundStationLayer })), { ssr: false });
const GroundVehicleLayer = dynamic(() => import('@/components/CesiumMap/GroundVehicleLayer').then(m => ({ default: m.GroundVehicleLayer })), { ssr: false });
const MilitaryVehicleLayer = dynamic(() => import('@/components/CesiumMap/MilitaryVehicleLayer').then(m => ({ default: m.MilitaryVehicleLayer })), { ssr: false });
const ConjunctionLayer = dynamic(() => import('@/components/CesiumMap/ConjunctionLayer').then(m => ({ default: m.ConjunctionLayer })), { ssr: false });
const SatelliteInfoCard = dynamic(() => import('@/components/CesiumMap/SatelliteInfoCard').then(m => ({ default: m.SatelliteInfoCard })), { ssr: false });
const GroundStationInfoCard = dynamic(() => import('@/components/CesiumMap/GroundStationInfoCard').then(m => ({ default: m.GroundStationInfoCard })), { ssr: false });
const GroundVehicleInfoCard = dynamic(() => import('@/components/CesiumMap/GroundVehicleInfoCard').then(m => ({ default: m.GroundVehicleInfoCard })), { ssr: false });
const ConjunctionInfoCard = dynamic(() => import('@/components/CesiumMap/ConjunctionInfoCard').then(m => ({ default: m.ConjunctionInfoCard })), { ssr: false });
const DebrisInstancedLayer = dynamic(() => import('@/components/CesiumMap/DebrisInstancedLayer').then(m => ({ default: m.DebrisInstancedLayer })), { ssr: false });
const DebrisInfoCard = dynamic(() => import('@/components/CesiumMap/DebrisInfoCard').then(m => ({ default: m.DebrisInfoCard })), { ssr: false });
const CelestrakBrowserDialog = dynamic(() => import('@/components/CesiumMap/CelestrakBrowserDialog').then(m => ({ default: m.CelestrakBrowserDialog })), { ssr: false });
const OrbitalTrackLayer = dynamic(() => import('@/components/CesiumMap/OrbitalTrackLayer').then(m => ({ default: m.OrbitalTrackLayer })), { ssr: false });
const MovingSatelliteMarker = dynamic(() => import('@/components/CesiumMap/MovingSatelliteMarker').then(m => ({ default: m.MovingSatelliteMarker })), { ssr: false });
const GroundTrackLayer = dynamic(() => import('@/components/CesiumMap/GroundTrackLayer').then(m => ({ default: m.GroundTrackLayer })), { ssr: false });
const CollisionHeatmapLayer = dynamic(() => import('@/components/CesiumMap/CollisionHeatmapLayer').then(m => ({ default: m.CollisionHeatmapLayer })), { ssr: false });
const ItalySatelliteLayer = dynamic(() => import('@/components/CesiumMap/ItalySatelliteLayer').then(m => ({ default: m.ItalySatelliteLayer })), { ssr: false });

declare global {
  interface Window {
    __DETOUR_SPEED__?: number;
  }
}


// Initialize satellite.js promise - wait for it before using
let satellitePromise: Promise<typeof import('satellite.js') | null> | null = null;
let satelliteModule: typeof import('satellite.js') | null = null;

const initializeSatellite = () => {
  if (typeof window === 'undefined') return null;
  if (satelliteModule) return Promise.resolve(satelliteModule);
  if (!satellitePromise) {
    satellitePromise = import('satellite.js').then((mod) => {
      satelliteModule = mod;
      return mod;
    });
  }
  return satellitePromise;
};

// Orbit data with TLE
interface OrbitData {
  satellite_id: string;
  positions: Array<{ lat: number; lon: number; alt: number; time: string }>;
  tle_line1?: string;
  tle_line2?: string;
  epoch?: string;
}

// Distinct color palette for satellite groups
const GROUP_COLORS = [
  '#06b6d4', // cyan
  '#f97316', // orange
  '#a855f7', // purple
  '#22c55e', // green
  '#ec4899', // pink
  '#eab308', // yellow
  '#3b82f6', // blue
  '#ef4444', // red
  '#14b8a6', // teal
  '#f59e0b', // amber
  '#8b5cf6', // violet
  '#10b981', // emerald
  '#e879f9', // fuchsia
  '#0ea5e9', // sky
  '#84cc16', // lime
];

const getGroupColor = (groupIndex: number): string =>
  GROUP_COLORS[groupIndex % GROUP_COLORS.length];

/** Small portal-based tooltip that escapes overflow:hidden containers. */
function GroupTooltip({ children, text }: { children: ReactNode; text: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);

  const show = useCallback(() => {
    if (!ref.current) return;
    const r = ref.current.getBoundingClientRect();
    setPos({ x: r.right + 8, y: r.top + r.height / 2 });
  }, []);

  return (
    <span ref={ref} onMouseEnter={show} onMouseLeave={() => setPos(null)} className="cursor-help">
      {children}
      {pos && createPortal(
        <div
          style={{
            position: 'fixed',
            left: pos.x,
            top: pos.y,
            transform: 'translateY(-50%)',
            zIndex: 9999,
            maxWidth: 280,
            padding: '8px 12px',
            borderRadius: 6,
            backgroundColor: 'rgba(17,20,28,0.95)',
            border: '1px solid rgba(255,255,255,0.1)',
            boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
            color: '#e2e8f0',
            fontSize: 12,
            lineHeight: 1.5,
            pointerEvents: 'none',
          }}
        >
          {text}
        </div>,
        document.body
      )}
    </span>
  );
}

/** Descriptions shown on hover over satellite group names in the legend panel. */
const GROUP_DESCRIPTIONS: Record<string, string> = {
  // CelesTrak standard groups
  'last-30-days':       'Objects launched in the last 30 days, tracked by CelesTrak.',
  'stations':           'Crewed space stations and visiting vehicles (ISS, Tiangong, etc.).',
  'visual':             'Brightest satellites visible to the naked eye.',
  'active':             'All currently active/operational satellites.',
  'analyst':            'Analyst-derived objects — orbits estimated from limited observations.',
  'weather':            'Meteorological satellites for weather monitoring and forecasting.',
  'noaa':               'NOAA polar-orbiting weather satellites (POES series).',
  'goes':               'GOES geostationary weather satellites (NOAA/NASA).',
  'resource':           'Earth observation satellites for resource monitoring.',
  'sarsat':             'Search & Rescue satellite-aided tracking (COSPAS-SARSAT).',
  'geo':                'Geostationary orbit satellites (~35,786 km altitude).',
  'intelsat':           'Intelsat commercial communications constellation.',
  'ses':                'SES commercial communications constellation.',
  'starlink':           'SpaceX Starlink broadband internet mega-constellation.',
  'oneweb':             'OneWeb broadband internet constellation.',
  'iridium-NEXT':       'Iridium NEXT mobile communications constellation.',
  'orbcomm':            'Orbcomm machine-to-machine communication satellites.',
  'globalstar':         'Globalstar mobile satellite communications constellation.',
  'amateur':            'Amateur radio (HAM) satellites.',
  'gnss':               'Global Navigation Satellite Systems (GPS, GLONASS, Galileo, BeiDou).',
  'gps-ops':            'U.S. GPS operational navigation satellites.',
  'glo-ops':            'Russian GLONASS operational navigation satellites.',
  'galileo':            'European Galileo navigation constellation.',
  'beidou':             'Chinese BeiDou navigation constellation.',
  'science':            'Space science and Earth observation research satellites.',
  'geodetic':           'Geodetic satellites for precise Earth measurements.',
  'engineering':        'Technology demonstration and engineering test satellites.',
  'education':          'Educational and university-built satellites.',
  'military':           'Known military and defense-related satellites.',
  'cubesat':            'CubeSats — miniaturized satellites (typically 1–12 U).',
  'radar':              'Radar calibration target objects.',
  'other':              'Miscellaneous tracked objects.',
  // Debris sub-groups
  'cosmos-1408-debris': 'Debris from 2021 Russian ASAT test on COSMOS 1408.',
  'fengyun-1c-debris':  'Debris from 2007 Chinese ASAT test on Fengyun 1C.',
  'iridium-33-debris':  'Debris from 2009 Iridium 33 / COSMOS 2251 collision.',
  'cosmos-2251-debris': 'Debris from 2009 COSMOS 2251 / Iridium 33 collision.',
  // Auto-inferred groups
  'debris':             'Space debris — defunct objects, fragments and rocket bodies.',
  'contacts':           'Unidentified contacts — detected objects not yet correlated to a known catalog entry.',
  'Uncategorized':      'Objects with no assigned category.',
};

const MAP_CHAT_QUICK_PROMPTS = [
  'Mostrami la minaccia più critica',
  'Tour della costellazione',
  'Briefing situazione',
  'Analizza le congiunzioni attive',
];

function MapPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [viewer, setViewer] = useState<InstanceType<CesiumModule['Viewer']> | null>(null);
  const [groundStations, setGroundStations] = useState<GroundStation[]>([]);
  const [satellites, setSatellites] = useState<Satellite[]>([]);
  const [groundVehicles, setGroundVehicles] = useState<PositionReport[]>([]);
  const [conjunctions, setConjunctions] = useState<ConjunctionEvent[]>([]);
  const [orbits, setOrbits] = useState<OrbitData[]>([]);
  const [loading, setLoading] = useState(true);
  const [satelliteReady, setSatelliteReady] = useState(false);
  const [celestrakDialogOpen, setCelestrakDialogOpen] = useState(false);
  const [selectedStation, setSelectedStation] = useState<GroundStation | null>(null);
  const [selectedSatellite, setSelectedSatellite] = useState<Satellite | null>(null);
  const [selectedVehicle, setSelectedVehicle] = useState<PositionReport | null>(null);
  const [selectedConjunction, setSelectedConjunction] = useState<ConjunctionEvent | null>(null);
  const [loadingSatellite, setLoadingSatellite] = useState(false);
  const [showOrbits, setShowOrbits] = useState(true);
  const [showCoverage, setShowCoverage] = useState(true);
  const [showConjunctions, setShowConjunctions] = useState(true);
  const [showGroundVehicles, setShowGroundVehicles] = useState(true);
  const [vehicleDisplayMode, setVehicleDisplayMode] = useState<'points' | '3d'>('points');
  const [showTerrain, setShowTerrain] = useState(false);
  const [terrainAvailable, setTerrainAvailable] = useState(false);
  const [photorealistic3D, setPhotorealistic3D] = useState(false);
  const [showGroundTrack, setShowGroundTrack] = useState(true);

  // Camera tracking state — name of the entity currently locked by the camera
  const [trackingEntityName, setTrackingEntityName] = useState<string | null>(null);

  // Per-satellite and per-group visibility
  const [hiddenSatellites, setHiddenSatellites] = useState<Set<string>>(new Set());
  const [hiddenOrbits, setHiddenOrbits] = useState<Set<string>>(new Set());
  const [hiddenGroups, setHiddenGroups] = useState<Set<string>>(new Set());
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [hiddenGroupOrbits, setHiddenGroupOrbits] = useState<Set<string>>(new Set());

  // Multi-select satellites for chat context
  const [pinnedSatelliteIds, setPinnedSatelliteIds] = useState<Set<string>>(new Set());

  // Batch delete state
  const [deleteProgress, setDeleteProgress] = useState<{ total: number; done: boolean } | null>(null);

  // Debris visualization state
  const [debris, setDebris] = useState<DebrisObject[]>([]);
  const [debrisPositions, setDebrisPositions] = useState<InstanceType<CesiumModule['Cartesian3']>[]>([]);
  const [showDebris, setShowDebris] = useState(true);
  const [showItalySats, setShowItalySats] = useState(false);

  // Sync showDebris toggle with hiddenGroups so SatelliteLayer also hides debris points+orbits
  useEffect(() => {
    setHiddenGroups((prev) => {
      const next = new Set(prev);
      if (!showDebris) {
        next.add('debris');
      } else {
        next.delete('debris');
      }
      return next;
    });
  }, [showDebris]);
  const [showCollisionHeatmap, setShowCollisionHeatmap] = useState(false);
  const [selectedDebris, setSelectedDebris] = useState<DebrisObject | null>(null);
  const [speed, setSpeed] = useState(1);
  const speedRef = useRef(1);
// Timestamp (ms) when a maneuver animation should start
const [maneuverStartMs, setManeuverStartMs] = useState<number | undefined>(undefined);

  // Resizable panels
  const elementsPanel = useResizablePanel({ defaultWidth: 288, minWidth: 200, maxWidth: 600, direction: 'right' });
  const chatPanel = useResizablePanel({ defaultWidth: 384, minWidth: 300, maxWidth: 700, direction: 'left' });

  // Live clock — initialize empty to avoid hydration mismatch (server vs client time)
  const [clockStr, setClockStr] = useState('');
  useEffect(() => {
    const fmt = () => new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    setClockStr(fmt());
    const t = setInterval(() => setClockStr(fmt()), 1000);
    return () => clearInterval(t);
  }, []);
  const [orbitTrack, setOrbitTrack] = useState<OrbitTrackState | null>(null);
  const SPEED_STEPS = [1, 2, 5, 10, 25, 50, 100];
// Update Cesium simulation speed when `speed` changes
useEffect(() => {
  if (viewer) {
    // Apply speed multiplier to Cesium clock via controller
    cesiumController.setOperationSpeed(speed);
  }
}, [speed, viewer]);



// Debris data loading configuration
const DEBRIS_REFRESH_MS = 15_000;
const DISPLAY_OBJECT_LIMIT = 2500;
const DEBRIS_ORBIT_CLASSES = "LEO";
  
  const handleChatSimulationControl = useCallback(
    (command: { action: string; mode?: string; prompt?: string }) => {
      if (command.action === 'open_sandbox') {
        const sandboxParams = new URLSearchParams();
        if (command.prompt) {
          sandboxParams.set('prompt', command.prompt);
        }
        if (pinnedSatelliteIds.size > 0) {
          sandboxParams.set('satelliteIds', Array.from(pinnedSatelliteIds).join(','));
        }
        router.push(`/sandbox${sandboxParams.toString() ? `?${sandboxParams.toString()}` : ''}`);
        return;
      }
    },
    [pinnedSatelliteIds, router]
  );
  
  const satellitePositionsRef = useRef<Map<string, InstanceType<CesiumModule['Cartesian3']>>>(new Map());
  const animationFrameRef = useRef<number | null>(null);
  const lastUpdateRef = useRef<number>(0);
  const isDebrisLoadingRef = useRef(false);

  useEffect(() => {
    // Initialize satellite.js first, then load data
    const init = initializeSatellite();
    if (init) {
      init.then(() => {
        setSatelliteReady(true);
        loadData();
      });
    } else {
      // SSR case - load data anyway (satellite.js won't be used)
      loadData();
    }
  }, []);

    // Helper functions to fly camera to objects
  const flyToSatellite = useCallback((sat: Satellite) => {
    if (!viewer) return;
    const entityId = `satellite-${sat.id}`;
    // Include orbit coordinates as fallback in case entity isn't in viewer yet
    const orbit = orbits.find((o) => o.satellite_id === sat.id);
    const pos = orbit?.positions?.[0];
    const payload: Record<string, unknown> = { entityId };
    if (pos) {
      payload.longitude = pos.lon;
      payload.latitude = pos.lat;
      payload.altitude = pos.alt * 1000;
    }
    cesiumController.dispatch({ type: 'cesium.flyTo', payload });
    setTrackingEntityName(sat.name);
  }, [viewer, orbits]);

  const flyToDebris = useCallback((debrisObj: DebrisObject) => {
    if (!viewer) return;
    cesiumController.dispatch({
      type: 'cesium.flyTo',
      payload: {
        longitude: debrisObj.lon,
        latitude: debrisObj.lat,
        altitude: (debrisObj.altKm ?? 0) * 1000,
      },
    });
  }, [viewer]);

  const flyToStation = useCallback((station: GroundStation) => {
    if (!viewer) return;
    cesiumController.dispatch({
      type: 'cesium.flyTo',
      payload: {
        longitude: station.longitude,
        latitude: station.latitude,
        altitude: (station.elevation_m ?? 0) + 10000,
      },
    });
  }, [viewer]);

  // Unlock camera tracking without moving the camera
  const unlockTracking = useCallback(() => {
    if (!viewer) return;
    viewer.trackedEntity = undefined;
    viewer.selectedEntity = undefined;
    setTrackingEntityName(null);
  }, [viewer]);

  // Reset view to default Earth overview
  const resetView = useCallback(async () => {
    if (!viewer) return;
    const Cesium = await getCesium();
    viewer.trackedEntity = undefined;
    viewer.selectedEntity = undefined;
    setTrackingEntityName(null);
    setSelectedSatellite(null);
    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(12.5, 42.0, 20_000_000),
      orientation: {
        heading: 0,
        pitch: Cesium.Math.toRadians(-90),
        roll: 0,
      },
      duration: 1.5,
    });
  }, [viewer]);

  // Fly to a top-down view of a geographic region
  const flyToRegion = useCallback(async (lon: number, lat: number, alt: number) => {
    if (!viewer) return;
    const Cesium = await getCesium();
    viewer.trackedEntity = undefined;
    viewer.selectedEntity = undefined;
    setTrackingEntityName(null);
    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(lon, lat, alt),
      orientation: {
        heading: 0,
        pitch: Cesium.Math.toRadians(-90),
        roll: 0,
      },
      duration: 1.5,
    });
  }, [viewer]);

  // Handle highlight parameter from explorer (by ID or NORAD ID)
  useEffect(() => {
    if (satellites.length === 0 || !viewer) return;

    const highlightId = searchParams.get('highlight');
    if (highlightId) {
      const sat = satellites.find((s) => s.id === highlightId);
      if (sat) flyToSatellite(sat);
    }

    const highlightNorad = searchParams.get('highlight_norad');
    if (highlightNorad) {
      const sat = satellites.find((s) => s.norad_id === Number(highlightNorad));
      if (sat) flyToSatellite(sat);
    }
  }, [searchParams, satellites, viewer]);

  // Real-time position updates
  useEffect(() => {
    if (!satelliteReady || !satelliteModule || satellites.length === 0 || orbits.length === 0) return;

    let Cesium: CesiumModule | null = null;
    getCesium().then((mod) => { Cesium = mod; });

    const updatePositions = () => {
      if (!Cesium) {
        animationFrameRef.current = requestAnimationFrame(updatePositions);
        return;
      }

      const now = Date.now();
      // Update every 5 seconds to avoid too much computation
      if (now - lastUpdateRef.current < 5000) {
        animationFrameRef.current = requestAnimationFrame(updatePositions);
        return;
      }
      lastUpdateRef.current = now;

      const updatedOrbits = orbits.map((orbit) => {
        if (!orbit.tle_line1 || !orbit.tle_line2 || !satelliteModule) {
          return orbit;
        }

        try {
          const satrec = satelliteModule.twoline2satrec(orbit.tle_line1, orbit.tle_line2);
          const currentTime = new Date();
          
          // Propagate to current time
          const positionAndVelocity = satelliteModule.propagate(satrec, currentTime);
          
          if (positionAndVelocity.position && typeof positionAndVelocity.position === 'object') {
            // Convert ECI to lat/lon/alt
            const gmst = satelliteModule.gstime(currentTime);
            const latLonAlt = satelliteModule.eciToGeodetic(positionAndVelocity.position, gmst);
            
            // Convert radians to degrees manually (radiansToDegrees not in types)
            const radToDeg = (radians: number) => radians * (180 / Math.PI);
            
            // Update first position with current propagated position
            const newPositions = [...orbit.positions];
            if (newPositions.length > 0) {
              newPositions[0] = {
                lat: radToDeg(latLonAlt.latitude),
                lon: radToDeg(latLonAlt.longitude),
                alt: latLonAlt.height,
                time: currentTime.toISOString(),
    };

  // expose loadDebris for external refresh
  // @ts-ignore
  (window as any).loadDebris = loadDebris;


            }
            
            return { ...orbit, positions: newPositions };
          }
        } catch (e) {
          // Keep original positions if propagation fails
        }
        
        return orbit;
      });

      setOrbits(updatedOrbits);
      
      // Update satellite positions ref
updatedOrbits.forEach((orbit) => {
  if (orbit.positions.length > 0 && Cesium) {
    const pos = orbit.positions[0];
    satellitePositionsRef.current.set(
      orbit.satellite_id,
      Cesium.Cartesian3.fromDegrees(pos.lon, pos.lat, pos.alt * 1000)
    );
  }
});

      animationFrameRef.current = requestAnimationFrame(updatePositions);
    };

    animationFrameRef.current = requestAnimationFrame(updatePositions);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [satellites, orbits]);

  const loadData = async (isRefresh = false) => {
    if (!isRefresh) setLoading(true);
    try {
      const [stationsData, satellitesWithOrbits, conjunctionsData, vehiclesData] = await Promise.all([
        api.getGroundStations({ page_size: 100 }),
        api.getSatellitesWithOrbits(),
        api.getConjunctions({ page_size: 50, is_actionable: true }),
        api.getGroundVehicles().catch(() => ({ items: [] })),
      ]);

      setGroundStations(stationsData.items);
      setSatellites(satellitesWithOrbits);
      setConjunctions(conjunctionsData.items);
      setGroundVehicles(vehiclesData.items);

      // Generate orbit positions from TLE if available for all satellites
      const generatedOrbits: OrbitData[] = satellitesWithOrbits
        .filter(sat => sat.latest_orbit?.tle_line1 && sat.latest_orbit?.tle_line2)
        .map((sat) => {
          const tle1 = sat.latest_orbit!.tle_line1!;
          const tle2 = sat.latest_orbit!.tle_line2!;

          if (satelliteModule) {
            return generateOrbitFromTLE(sat.id, tle1, tle2, sat.latest_orbit?.epoch);
          } else {
            return {
              satellite_id: sat.id,
              positions: generateOrbitPositions(sat),
            };
          }
        });
      
      setOrbits(generatedOrbits);

      // Store satellite positions for conjunction layer - load Cesium dynamically
      const Cesium = await getCesium();
      generatedOrbits.forEach((orbit) => {
        if (orbit.positions.length > 0) {
          const pos = orbit.positions[0];
          satellitePositionsRef.current.set(
            orbit.satellite_id,
            Cesium.Cartesian3.fromDegrees(pos.lon, pos.lat, pos.alt * 1000)
          );
        }
      });
    } catch (error) {
      console.warn('Failed to load map data:', error);
    } finally {
      if (!isRefresh) setLoading(false);
    }
  };

  // Load debris data and refresh periodically
useEffect(() => {
  let abortController = new AbortController();

const loadDebris = async () => {
      if (isDebrisLoadingRef.current) return;
      isDebrisLoadingRef.current = true;
      try {
        const response = await getDebris(DISPLAY_OBJECT_LIMIT, DEBRIS_ORBIT_CLASSES);
        if (!response || !Array.isArray(response.objects)) {
          console.warn('Failed to load debris: invalid response', response);
          setDebris([]);
          setDebrisPositions([]);
          return;
        }
        const Cesium = await getCesium();
        const positions = response.objects
          .filter((d) => {
            return (
              typeof d.lat === 'number' && typeof d.lon === 'number' && typeof d.altKm === 'number' &&
              Number.isFinite(d.lat) && Number.isFinite(d.lon) && Number.isFinite(d.altKm) &&
              d.lat >= -90 && d.lat <= 90 && d.lon >= -180 && d.lon <= 180 && d.altKm >= 0
            );
          })
          .map((d) => Cesium.Cartesian3.fromDegrees(d.lon, d.lat, d.altKm * 1000));

        setDebris(response.objects);
        setDebrisPositions(positions);
      } catch (err) {
        console.warn('Failed to load debris:', err);
      } finally {
        isDebrisLoadingRef.current = false;
      }
    };


  // Initial load
  loadDebris();

    let interval: any = null;
    if (process.env.NODE_ENV !== 'test') {
      interval = setInterval(() => {
      (window as any).loadDebris?.();
      }, DEBRIS_REFRESH_MS);
    }

    return () => {
      if (interval) clearInterval(interval);
      abortController.abort();
    };
}, []);

  useEffect(() => {
    const handler = () => {
      // Call the globally exposed loadDebris function if available
      // @ts-ignore
      (window as any).loadDebris?.();
    };
    window.addEventListener('refreshDebris', handler);
    return () => {
      window.removeEventListener('refreshDebris', handler);
    };
  }, []);

  // Load and refresh orbit track for selected satellite or debris
  useEffect(() => {
    let cancelled = false;
    const loadOrbitTrack = async () => {
      if (!viewer) return;
      try {
        if (selectedSatellite) {
          const orbit = orbits.find((o) => o.satellite_id === selectedSatellite.id);
          if (orbit && orbit.positions && orbit.positions.length > 0) {
            const Cesium = await getCesium();
            const points = orbit.positions.map((p) => Cesium.Cartesian3.fromDegrees(p.lon, p.lat, p.alt * 1000));
            const timeStartMs = orbit.positions[0]?.time ? new Date(orbit.positions[0].time).getTime() : Date.now();
            setOrbitTrack({ points, timeStartMs, stepSec: 60 });
          } else {
            setOrbitTrack(null);
          }
         } else {
          setOrbitTrack(null);
        }
      } catch (e) {
        if (!cancelled) console.warn('Failed to load orbit track', e);
      }
    };

    // Initial load
    loadOrbitTrack();

    // Refresh every 30 seconds
    const interval = setInterval(() => {
      loadOrbitTrack();
    }, 30_000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [selectedSatellite, selectedDebris, viewer, orbits]);


  // Generate orbit positions from TLE using satellite.js
  const generateOrbitFromTLE = useCallback((
    satelliteId: string,
    tleLine1: string,
    tleLine2: string,
    epoch?: string
  ): OrbitData => {
    const positions: Array<{ lat: number; lon: number; alt: number; time: string }> = [];
    
    if (!satelliteModule) {
      return {
        satellite_id: satelliteId,
        positions: [],
        tle_line1: tleLine1,
        tle_line2: tleLine2,
        epoch,
      };
    }

    try {
      const satrec = satelliteModule.twoline2satrec(tleLine1, tleLine2);
      const numPoints = 180;
      const now = new Date();
      const radToDeg = (radians: number) => radians * (180 / Math.PI);

      // Generate positions for ~2 full orbits (180 min covers 2× LEO period)
      for (let i = 0; i < numPoints; i++) {
        const time = new Date(now.getTime() + i * 60000); // Every minute
        const positionAndVelocity = satelliteModule.propagate(satrec, time);
        
        if (positionAndVelocity.position && typeof positionAndVelocity.position === 'object') {
          const gmst = satelliteModule.gstime(time);
          const latLonAlt = satelliteModule.eciToGeodetic(positionAndVelocity.position, gmst);
          
          positions.push({
            lat: radToDeg(latLonAlt.latitude),
            lon: radToDeg(latLonAlt.longitude),
            alt: latLonAlt.height,
            time: time.toISOString(),
          });
        }
      }
    } catch (e) {
      console.warn('Error propagating TLE:', e);
    }

    return {
      satellite_id: satelliteId,
      positions,
      tle_line1: tleLine1,
      tle_line2: tleLine2,
      epoch,
    };
  }, []);

  // Generate simplified orbit positions (fallback)
  const generateOrbitPositions = useCallback((sat: Satellite): Array<{
    lat: number;
    lon: number;
    alt: number;
    time: string;
  }> => {
    const positions: Array<{ lat: number; lon: number; alt: number; time: string }> = [];
    
    const altitude = 400; // km (typical LEO)
    const numPoints = 100;

    for (let i = 0; i < numPoints; i++) {
      const angle = (i / numPoints) * Math.PI * 2;
      const lat = Math.sin(angle) * 45; // Inclination
      const lon = (i / numPoints) * 360;
      positions.push({
        lat,
        lon,
        alt: altitude,
        time: new Date(Date.now() + i * 60000).toISOString(),
      });
    }

    return positions;
  }, []);

    const handleViewerReady = useCallback(async (cesiumViewer: InstanceType<CesiumModule['Viewer']>) => {
      setViewer(cesiumViewer);
      await cesiumController.initialize(cesiumViewer);

      const Cesium = await getCesium();

      cesiumViewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(12.5674, 41.8719, 8000000),
        orientation: {
          heading: Cesium.Math.toRadians(0),
          pitch: Cesium.Math.toRadians(-90),
          roll: 0,
        },
        duration: 1.5,
      });

      if (cesiumViewer.selectedEntityChanged && typeof cesiumViewer.selectedEntityChanged.addEventListener === 'function') {
        cesiumViewer.selectedEntityChanged.addEventListener((selectedEntity) => {
          if (selectedEntity && selectedEntity.position) {
            // Check if entity has valid position before tracking
            try {
              const position = selectedEntity.position.getValue(cesiumViewer.clock.currentTime);
              if (position && Cesium.Cartesian3.equals(position, Cesium.Cartesian3.ZERO) === false) {
                // Use trackedEntity so the satellite becomes the center of rotation
                // when the user orbits the camera with mouse/trackpad
                cesiumViewer.trackedEntity = selectedEntity;
                const eName = typeof selectedEntity.name === 'string'
                  ? selectedEntity.name
                  : selectedEntity.name?.getValue?.(cesiumViewer.clock.currentTime) ?? selectedEntity.id ?? null;
                setTrackingEntityName(eName);
              }
            } catch (e) {
              console.warn('Could not track selected entity:', e);
            }

            // Check if selected entity is a satellite and update selection state
            if (selectedEntity.id && typeof selectedEntity.id === 'string' && selectedEntity.id.startsWith('satellite-')) {
              const satelliteId = selectedEntity.id.replace('satellite-', '');
              const sat = satellites.find((s) => s.id === satelliteId);
              if (sat) {
                setSelectedSatellite(sat);
              }
            }
          }
          // Do NOT clear trackedEntity when clicking empty space —
          // the user should use the explicit "Reset View" button instead.
          // This prevents losing lock when dragging the mouse.
        });
      }
    }, []);


  return (
    <div className="h-full w-full relative overflow-hidden">
      {/* Map - Full Background */}
      <div className="absolute inset-0 z-0">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <Spinner size={40} />
          </div>
        ) : (
          <div className="w-full h-full">
            <CesiumViewer
              className="w-full h-full"
              onViewerReady={handleViewerReady}
              photorealistic3D={photorealistic3D}
            />

            {/* Earth Layers */}
              <>
                <SatelliteLayer
                    viewer={viewer}
                    satellites={satellites}
                    orbits={orbits}
                    showOrbits={showOrbits}
                    hiddenSatelliteIds={hiddenSatellites}
                    hiddenOrbitIds={hiddenOrbits}
                    hiddenGroups={hiddenGroups}
                    hiddenGroupOrbits={hiddenGroupOrbits}
                    selectedSatelliteIds={pinnedSatelliteIds}
                />
                <GroundStationLayer
                    viewer={viewer}
                    stations={groundStations}
                    showCoverage={showCoverage}
                />
                {showGroundVehicles && vehicleDisplayMode === 'points' && (
                  <GroundVehicleLayer
                    viewer={viewer}
                    vehicles={groundVehicles}
                    show={showGroundVehicles}
                  />
                )}
                {showGroundVehicles && vehicleDisplayMode === '3d' && (
                  <MilitaryVehicleLayer
                    viewer={viewer}
                    vehicles={groundVehicles}
                    show={showGroundVehicles}
                  />
                )}
                {showConjunctions && (
                  <ConjunctionLayer
                    viewer={viewer}
                    conjunctions={conjunctions}
                    satellitePositions={satellitePositionsRef.current}
                  />
                )}
                <CollisionHeatmapLayer
                    viewer={viewer}
                    visible={showCollisionHeatmap}
                />
                {showDebris && (
                  <DebrisInstancedLayer
                    viewer={viewer}
                    debris={debris}
                    maxDisplayObjects={2500}
                    refreshIntervalMs={15000}
                    showDebris={showDebris}
                  />
                )}
                <ItalySatelliteLayer viewer={viewer} show={showItalySats} />
                {selectedSatellite && (
                  <SatelliteInfoCard
                    satellite={selectedSatellite}
                    orbit={orbits.find((o) => o.satellite_id === selectedSatellite.id)}
                    onClose={() => setSelectedSatellite(null)}
                    onManeuver={() => setManeuverStartMs(Date.now())}
                  />
                )}
                {selectedStation && (
                  <GroundStationInfoCard
                    station={selectedStation}
                    onClose={() => setSelectedStation(null)}
                  />
                )}
                {selectedVehicle && (
                  <GroundVehicleInfoCard
                    vehicle={selectedVehicle}
                    onClose={() => setSelectedVehicle(null)}
                  />
                )}
                {selectedConjunction && (
                  <ConjunctionInfoCard
                    conjunction={selectedConjunction}
                    onClose={() => setSelectedConjunction(null)}
                  />
                )}
                {selectedDebris && (
                  <DebrisInfoCard
                    debris={selectedDebris}
                    onClose={() => setSelectedDebris(null)}
                    onManeuver={() => setManeuverStartMs(Date.now())}
                  />
                )}
                {orbitTrack && viewer && selectedSatellite && (
                  <>
                    <OrbitalTrackLayer viewer={viewer} orbitTrack={orbitTrack} maneuverStartMs={maneuverStartMs} />
                    <MovingSatelliteMarker viewer={viewer} orbitTrack={orbitTrack} maneuverStartMs={maneuverStartMs} />
                  </>
                )}
                <GroundTrackLayer
                    viewer={viewer}
                    selectedSatelliteNoradId={selectedSatellite?.norad_id ?? null}
                    visible={showGroundTrack}
                    selectedStation={selectedStation}
                />

              </>
          </div>
        )}
      </div>

      {/* ═══ Global Status & Control Bar (Astro UXDS-inspired) ═══ */}
      <div className="absolute top-0 left-0 right-0 z-20 control-bar">
        {/* Row 1 — Global Status Bar */}
        <div className="flex items-center h-10 px-4 gap-4 bg-sda-bg-secondary border-b border-sda-border-default">
          {/* App Identity */}
          <div className="flex items-center gap-2">
            <Icon icon="satellite" className="text-sda-accent-cyan" size={14} />
            <span className="text-xs font-bold tracking-wider text-sda-text-primary uppercase">Space Ops</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-sda-accent-green/20 text-sda-accent-green font-semibold uppercase tracking-wide">Live</span>
          </div>

          <div className="w-px h-5 bg-sda-border-default" />

          {/* Counters */}
          <div className="flex items-center gap-3 text-xs text-sda-text-secondary">
            <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-sda-accent-blue" />{satellites.length} Satellites</span>
            <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-amber-500" />{debris.length} Debris</span>
            <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-sda-accent-cyan" />{groundStations.length} Stations</span>
          </div>

          {/* Right side — status + clock */}
          <div className="ml-auto flex items-center gap-3">
            <div className="flex items-center gap-1.5 text-xs">
              <span className="w-2 h-2 rounded-full bg-sda-accent-green animate-pulse" />
              <span className="text-sda-text-secondary">Systems Nominal</span>
            </div>
            <div className="w-px h-5 bg-sda-border-default" />
            <span className="text-xs text-sda-text-secondary font-mono tabular-nums">{clockStr} UTC</span>
          </div>
        </div>

        {/* Row 2 — Command Controls */}
        <div className="flex items-center h-12 px-4 gap-3 bg-sda-bg-secondary/80 backdrop-blur-sm border-b border-sda-border-default/60">

          {/* ── Group: Actions ── */}
          <div className="control-group" role="group" aria-label="Actions">
            <span className="control-group-label">Actions</span>
            <div className="flex items-center gap-2">
              <CompactAlertsButton
                onAlertClick={(alert) => {
                  const sat = satellites.find(s => s.name === alert.primary_satellite_name);
                  if (sat) {
                    flyToSatellite(sat);
                  }
                }}
              />
              <Button
                onClick={() => setCelestrakDialogOpen(true)}
                icon="satellite"
                minimal
                small
                className="control-btn"
              >
                CelesTrak
              </Button>
            </div>
          </div>

              <div className="w-px h-6 bg-sda-border-default" />

              {/* ── Group: Layers ── */}
              <div className="control-group" role="group" aria-label="Map layers">
                <span className="control-group-label">Layers</span>
                <div className="flex items-center gap-2">
                  <Checkbox checked={showOrbits} onChange={(e) => setShowOrbits(e.currentTarget.checked)}
                    labelElement={<span className="text-xs text-sda-text-secondary">Orbits</span>} />
                  <Checkbox checked={showCoverage} onChange={(e) => setShowCoverage(e.currentTarget.checked)}
                    labelElement={<span className="text-xs text-sda-text-secondary">Coverage</span>} />
                  <Checkbox checked={showGroundVehicles} onChange={(e) => setShowGroundVehicles(e.currentTarget.checked)}
                    labelElement={<span className="text-xs text-sda-text-secondary">Vehicles</span>} />
                  {showGroundVehicles && (
                    <div className="flex items-center rounded overflow-hidden border border-sda-border-default ml-1">
                      <button
                        className={`control-seg-btn-sm ${vehicleDisplayMode === 'points' ? 'control-seg-btn-active' : ''}`}
                        onClick={() => setVehicleDisplayMode('points')}
                      >Points</button>
                      <button
                        className={`control-seg-btn-sm ${vehicleDisplayMode === '3d' ? 'control-seg-btn-active' : ''}`}
                        onClick={() => setVehicleDisplayMode('3d')}
                      >3D</button>
                    </div>
                  )}
                  <Checkbox checked={showConjunctions} onChange={(e) => setShowConjunctions(e.currentTarget.checked)}
                    labelElement={<span className="text-xs text-sda-text-secondary">Conj.</span>} />
                </div>
              </div>

              <div className="w-px h-6 bg-sda-border-default" />

              {/* ── Group: Data Overlays ── */}
              <div className="control-group" role="group" aria-label="Data overlays">
                <span className="control-group-label">Overlays</span>
                <div className="flex items-center gap-2">
                  <Checkbox checked={showDebris} onChange={(e) => setShowDebris(e.currentTarget.checked)}
                    labelElement={<span className="text-xs text-sda-text-secondary">Debris</span>} />
                  <Checkbox checked={showGroundTrack} onChange={(e) => setShowGroundTrack(e.currentTarget.checked)}
                    labelElement={<span className="text-xs text-sda-text-secondary">Track</span>} />
                  <Checkbox checked={showCollisionHeatmap} onChange={(e) => setShowCollisionHeatmap(e.currentTarget.checked)}
                    labelElement={<span className="text-xs text-sda-text-secondary">Collision</span>} />
                  <Checkbox checked={showItalySats} onChange={(e) => setShowItalySats(e.currentTarget.checked)}
                    labelElement={<span className="text-xs text-sda-text-secondary">IT Coverage</span>} />
                </div>
              </div>

              <div className="w-px h-6 bg-sda-border-default" />

              {/* ── Group: Visualization ── */}
              <div className="control-group" role="group" aria-label="Visualization mode">
                <span className="control-group-label">Visualization</span>
                <div className="flex items-center gap-2">
                  <div className="flex items-center rounded overflow-hidden border border-sda-border-default">
                    <button
                      className={`control-seg-btn-sm ${!photorealistic3D ? 'control-seg-btn-active' : ''}`}
                      onClick={() => setPhotorealistic3D(false)}
                      title="Standard satellite imagery globe"
                    >Globe</button>
                    <button
                      className={`control-seg-btn-sm ${photorealistic3D ? 'control-seg-btn-active' : ''}`}
                      onClick={() => setPhotorealistic3D(true)}
                      title="Google Photorealistic 3D Tiles — realistic buildings and terrain"
                    >3D Photo</button>
                  </div>
                </div>
              </div>

              <div className="w-px h-6 bg-sda-border-default" />

              {/* ── Group: Views ── */}
              <div className="control-group" role="group" aria-label="Camera views">
                <span className="control-group-label">Views</span>
                <div className="flex items-center gap-2">
                  {trackingEntityName && (
                    <Button
                      icon="unlock"
                      minimal
                      small
                      className="control-btn"
                      onClick={unlockTracking}
                      title="Unlock camera from satellite"
                    >
                      <span className="flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-sda-accent-cyan animate-pulse" />
                        <span className="max-w-[100px] truncate">{trackingEntityName}</span>
                      </span>
                    </Button>
                  )}
                  <Button
                    icon="globe"
                    minimal
                    small
                    className="control-btn"
                    onClick={resetView}
                    title="Reset to Earth overview"
                  >
                    Reset
                  </Button>
                  <Button
                    icon="path-search"
                    minimal
                    small
                    className="control-btn"
                    onClick={() => flyToRegion(12.8, 42.5, 1_800_000)}
                    title="Italy view"
                  >
                    IT
                  </Button>
                  <Button
                    icon="path-search"
                    minimal
                    small
                    className="control-btn"
                    onClick={() => flyToRegion(12.5, 50.0, 3_000_000)}
                    title="Europe view"
                  >
                    EU
                  </Button>
                  <Button
                    icon="path-search"
                    minimal
                    small
                    className="control-btn"
                    onClick={() => flyToRegion(-95.0, 38.0, 5_000_000)}
                    title="North America view"
                  >
                    NA
                  </Button>
                  <Button
                    icon="path-search"
                    minimal
                    small
                    className="control-btn"
                    onClick={() => flyToRegion(105.0, 35.0, 5_000_000)}
                    title="Asia-Pacific view"
                  >
                    APAC
                  </Button>
                </div>
              </div>
        </div>
      </div>

      {/* Speed Control Overlay */}
<div className="absolute bottom-2 z-20 glass-panel rounded-sm px-3 py-2 flex items-center gap-2" style={{ left: 'calc(288px + 1.5rem)' }}>
  <span className="text-xs text-white font-medium">SPD</span>
  <input
    type="range"
    min={0}
    max={SPEED_STEPS.length - 1}
    step={1}
    value={SPEED_STEPS.indexOf(speed)}
    onChange={(e) => {
      const idx = Number(e.target.value);
      const newSpeed = SPEED_STEPS[idx];
      setSpeed(newSpeed);
      speedRef.current = newSpeed;
      if (typeof window !== 'undefined') {
        window.__DETOUR_SPEED__ = newSpeed;
      }
    }}
    className="w-24"
  />
  <span className={`text-xs font-medium ${speed > 1 ? 'text-yellow-300' : 'text-white'}`}>{speed}x</span>
</div>
{/* Panels Container */}
      <div className="absolute inset-0 z-10 pointer-events-none" style={{ height: '100%' }}>
        {/* Left Panel - Elements */}
          <div className="absolute left-2 top-[96px] bottom-2 pointer-events-auto flex flex-col" style={{ width: elementsPanel.width }}>
            <div className="relative flex-1 min-h-0 bg-sda-bg-secondary/80 backdrop-blur-md rounded-sm border border-sda-border-default shadow-lg flex flex-col overflow-hidden map-panel-accent">
            {/* Resize handle - right edge */}
            <div className="resize-handle resize-handle-right" onMouseDown={elementsPanel.onMouseDown} />
            <div className="flex flex-col h-full min-h-0">
              <>
                <div className="p-3 border-b border-sda-border-default">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-sda-text-primary flex items-center gap-2">
                      <Icon icon="satellite" className="text-sda-accent-cyan" />
                      Elements ({satellites.length})
                    </span>
                    {pinnedSatelliteIds.size > 0 && !deleteProgress && (
                      <button
                        title="Delete selected satellites"
                        className="flex items-center gap-1 px-2 py-1 text-xs rounded bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-300 border border-red-500/20 transition-colors"
                        onClick={async () => {
                          const count = pinnedSatelliteIds.size;
                          if (!confirm(`Delete ${count} selected satellite${count > 1 ? 's' : ''}? This action cannot be undone.`)) return;
                          const idsToDelete = [...pinnedSatelliteIds];
                          setDeleteProgress({ total: count, done: false });
                          try {
                            const result = await api.batchDeleteSatellites(idsToDelete);
                            // Update local state immediately
                            const deletedSet = new Set(idsToDelete);
                            setSatellites(prev => prev.filter(s => !deletedSet.has(s.id)));
                            setPinnedSatelliteIds(new Set());
                            if (selectedSatellite && deletedSet.has(selectedSatellite.id)) {
                              setSelectedSatellite(null);
                            }
                            setDeleteProgress({ total: count, done: true });
                            // Refresh all data to sync with server
                            await loadData(true);
                            if (result.errors.length > 0) {
                              console.warn('Batch delete partial errors:', result.errors);
                            }
                          } catch (err) {
                            console.error('Failed to delete satellites:', err);
                            // Even on error, refresh to get accurate state
                            await loadData(true);
                          } finally {
                            setTimeout(() => setDeleteProgress(null), 1200);
                          }
                        }}
                      >
                        <Icon icon="trash" size={12} />
                        <span>Delete ({pinnedSatelliteIds.size})</span>
                      </button>
                    )}
                    {deleteProgress && (
                      <div className="flex items-center gap-2 px-2 py-1 text-xs rounded bg-red-500/10 border border-red-500/20 text-red-300">
                        {deleteProgress.done ? (
                          <>
                            <Icon icon="tick-circle" size={12} className="text-green-400" />
                            <span>Deleted {deleteProgress.total}</span>
                          </>
                        ) : (
                          <>
                            <Spinner size={12} />
                            <span>Deleting {deleteProgress.total}...</span>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex-1 overflow-auto p-3">
                  {/* Satellites grouped by CelesTrak tag */}
                  {(() => {
                    const grouped = satellites.reduce((acc, sat) => {
                      let group = sat.tags?.[0] || '';
                      if (!group) {
                        const n = sat.name?.toUpperCase() || '';
                        if (n.startsWith('DEBRIS') || n.startsWith('DEB ') || sat.object_type === 'DEBRIS')
                          group = 'debris';
                        else if (n.startsWith('CONTACT') || n.startsWith('UNKNOWN'))
                          group = 'contacts';
                        else
                          group = 'Uncategorized';
                      }
                      (acc[group] = acc[group] || []).push(sat);
                      return acc;
                    }, {} as Record<string, Satellite[]>);
                    const groupNames = Object.keys(grouped);
                    return groupNames.map((group, groupIdx) => {
                      const groupSats = grouped[group];
                      const color = group === 'debris' ? '#f59e0b' : getGroupColor(groupIdx);
                      const isGroupHidden = hiddenGroups.has(group);
                      const isGroupOrbitsHidden = hiddenGroupOrbits.has(group);
                      const allGroupPinned = groupSats.length > 0 && groupSats.every(s => pinnedSatelliteIds.has(s.id));
                      const someGroupPinned = groupSats.some(s => pinnedSatelliteIds.has(s.id));
                      return (
                        <div key={group} className="mb-3">
                          <div className="flex items-center gap-2 mb-1">
                            <input
                              type="checkbox"
                              checked={allGroupPinned}
                              ref={(el) => { if (el) el.indeterminate = someGroupPinned && !allGroupPinned; }}
                              title={allGroupPinned ? 'Deselect all in group' : 'Select all in group'}
                              className="w-3 h-3 rounded accent-cyan-500 cursor-pointer flex-shrink-0"
                              onChange={() => {
                                setPinnedSatelliteIds(prev => {
                                  const next = new Set(prev);
                                  if (allGroupPinned) {
                                    groupSats.forEach(s => next.delete(s.id));
                                  } else {
                                    groupSats.forEach(s => next.add(s.id));
                                  }
                                  return next;
                                });
                              }}
                            />
                            <Icon icon="folder-close" size={14} style={{ color }} />
                            <GroupTooltip text={GROUP_DESCRIPTIONS[group] || `Satellite group: ${group}`}>
                              <span className="text-sm font-semibold flex items-center gap-1" style={{ color }}>
                                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }}></span>
                                {group}
                              </span>
                            </GroupTooltip>
                            <div className="ml-auto flex items-center gap-1">
                              <button
                                title={isGroupHidden ? 'Show group' : 'Hide group'}
                                className="p-0.5 rounded hover:bg-sda-bg-tertiary"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setHiddenGroups(prev => {
                                    const next = new Set(prev);
                                    if (next.has(group)) next.delete(group); else next.add(group);
                                    return next;
                                  });
                                }}
                              >
                                <Icon icon={isGroupHidden ? 'eye-off' : 'eye-open'} size={12} className={isGroupHidden ? 'text-sda-text-muted' : 'text-sda-text-secondary'} />
                              </button>
                              <button
                                title={isGroupOrbitsHidden ? 'Show orbits' : 'Hide orbits'}
                                className="p-0.5 rounded hover:bg-sda-bg-tertiary"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setHiddenGroupOrbits(prev => {
                                    const next = new Set(prev);
                                    if (next.has(group)) next.delete(group); else next.add(group);
                                    return next;
                                  });
                                }}
                              >
                                <Icon icon="path" size={12} className={isGroupOrbitsHidden ? 'text-sda-text-muted' : 'text-sda-text-secondary'} />
                              </button>
                              <Tag minimal style={{ color, borderColor: color }} className="ml-1">{groupSats.length}</Tag>
                            </div>
                          </div>
                          {!isGroupHidden && (
                            <div className="space-y-1 ml-4 pl-2" style={{ borderLeft: `2px solid ${color}` }}>
                              {(expandedGroups.has(group) ? groupSats : groupSats.slice(0, 10)).map((sat) => {
                                const isSatHidden = hiddenSatellites.has(sat.id);
                                const isSatOrbitHidden = hiddenOrbits.has(sat.id);
                                const isSatPinned = pinnedSatelliteIds.has(sat.id);
                                return (
                                  <div
                                    key={sat.id}
                                    className={`p-2 text-sm hover:bg-sda-bg-tertiary rounded cursor-pointer ${
                                      selectedSatellite?.id === sat.id ? 'bg-sda-bg-tertiary' : ''
                                    } ${isSatPinned ? 'ring-1 ring-sda-accent-cyan/40 bg-sda-accent-cyan/5' : ''}`}
                                    onClick={() => flyToSatellite(sat)}
                                  >
                                    <div className="flex items-center justify-between">
                                      <div className="flex items-center gap-1.5 min-w-0">
                                        <input
                                          type="checkbox"
                                          checked={isSatPinned}
                                          title="Pin to chat context"
                                          className="w-3 h-3 rounded accent-cyan-500 cursor-pointer flex-shrink-0"
                                          onClick={(e) => e.stopPropagation()}
                                          onChange={() => {
                                            setPinnedSatelliteIds(prev => {
                                              const next = new Set(prev);
                                              if (next.has(sat.id)) next.delete(sat.id); else next.add(sat.id);
                                              return next;
                                            });
                                          }}
                                        />
                                        <span className="font-medium truncate max-w-[90px]">{sat.name}</span>
                                      </div>
                                      <div className="flex items-center gap-1">
                                        <button
                                          title={isSatHidden ? 'Show satellite' : 'Hide satellite'}
                                          className="p-0.5 rounded hover:bg-sda-bg-tertiary"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setHiddenSatellites(prev => {
                                              const next = new Set(prev);
                                              if (next.has(sat.id)) next.delete(sat.id); else next.add(sat.id);
                                              return next;
                                            });
                                          }}
                                        >
                                          <Icon icon={isSatHidden ? 'eye-off' : 'eye-open'} size={12} className={isSatHidden ? 'text-sda-text-muted' : 'text-sda-text-secondary'} />
                                        </button>
                                        <button
                                          title={isSatOrbitHidden ? 'Show orbit' : 'Hide orbit'}
                                          className="p-0.5 rounded hover:bg-sda-bg-tertiary"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setHiddenOrbits(prev => {
                                              const next = new Set(prev);
                                              if (next.has(sat.id)) next.delete(sat.id); else next.add(sat.id);
                                              return next;
                                            });
                                          }}
                                        >
                                          <Icon icon="path" size={12} className={isSatOrbitHidden ? 'text-sda-text-muted' : 'text-sda-text-secondary'} />
                                        </button>
                                        {loadingSatellite && selectedSatellite?.id === sat.id ? (
                                          <Spinner size={14} />
                                        ) : (
                                          <Tag minimal style={{ color, borderColor: color, fontSize: '10px' }}>{sat.norad_id}</Tag>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                              {groupSats.length > 10 && (
                                <button
                                  className="p-2 text-xs text-sda-accent-blue hover:text-sda-text-primary hover:bg-sda-bg-tertiary rounded w-full text-left cursor-pointer"
                                  onClick={() => setExpandedGroups(prev => {
                                    const next = new Set(prev);
                                    if (next.has(group)) next.delete(group); else next.add(group);
                                    return next;
                                  })}
                                >
                                  {expandedGroups.has(group)
                                    ? 'Show less'
                                    : `+${groupSats.length - 10} more`}
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    });
                  })()}

                   {/* Ground Stations */}
                  <div className="mt-4 pt-4 border-t border-sda-border-default">
                    <h4 className="text-sm font-semibold text-sda-text-secondary mb-2 flex items-center gap-2">
                      <Icon icon="globe" className="text-sda-accent-cyan" />
                      Ground Stations ({groundStations.length})
                    </h4>
                    <div className="space-y-1 max-h-40 overflow-auto">
                      {groundStations.map((station) => (
                        <div
                          key={station.id}
                          className={`p-2 text-sm hover:bg-sda-bg-tertiary rounded cursor-pointer ${
                            selectedStation?.id === station.id ? 'bg-sda-bg-tertiary' : ''
                          }`}
                          onClick={() => flyToStation(station)}
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-medium">{station.name}</span>
                            <Tag
                              intent={station.is_operational ? 'success' : 'danger'}
                              minimal
                            >
                              {station.is_operational ? 'ON' : 'OFF'}
                            </Tag>
                          </div>
                          <div className="text-xs text-sda-text-muted mt-1">
                            {station.code && `${station.code} • `}
                            {station.country}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Ground Vehicles */}
                  <div className="mt-4 pt-4 border-t border-sda-border-default">
                    <h4 className="text-sm font-semibold text-sda-text-secondary mb-2 flex items-center gap-2">
                      <Icon icon="truck" className="text-sda-accent-cyan" />
                      Vehicles ({groundVehicles.length})
                    </h4>
                    <div className="space-y-1 max-h-40 overflow-auto">
                      {groundVehicles.map((vehicle) => (
                        <div
                          key={vehicle.id}
                          className="p-2 text-sm hover:bg-sda-bg-tertiary rounded cursor-pointer"
                          onClick={() => {
                            setSelectedVehicle(vehicle);
                            setSelectedSatellite(null);
                            setSelectedStation(null);
                            setSelectedConjunction(null);
                          }}
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-medium">{vehicle.entity_id}</span>
                            <Tag intent="warning" minimal>
                              {vehicle.heading_deg?.toFixed(0)}°
                            </Tag>
                          </div>
                          <div className="text-xs text-sda-text-muted mt-1">
                            {vehicle.latitude.toFixed(4)}°, {vehicle.longitude.toFixed(4)}° • {vehicle.velocity_magnitude_ms?.toFixed(1)} m/s
                          </div>
                        </div>
                      ))}
                      {groundVehicles.length === 0 && (
                        <div className="text-xs text-sda-text-muted italic">
                          No ground vehicles tracked
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Conjunctions */}
                  {showConjunctions && conjunctions.length > 0 && (
                    <div className="mt-4 pt-4 border-t border-sda-border-default">
                      <h4 className="text-sm font-semibold text-sda-text-secondary mb-2 flex items-center gap-2">
                        <Icon icon="warning-sign" className="text-sda-accent-cyan" />
                        Conjunctions ({conjunctions.length})
                      </h4>
                      <div className="space-y-1 max-h-32 overflow-auto">
                        {conjunctions.slice(0, 5).map((conj) => (
                          <div
                            key={conj.id}
                            className="p-2 text-sm bg-sda-bg-tertiary rounded cursor-pointer hover:bg-sda-bg-secondary transition-colors"
                            onClick={() => {
                              setSelectedConjunction(conj);
                              setSelectedSatellite(null);
                              setSelectedStation(null);
                              setSelectedVehicle(null);
                            }}
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-medium">Risk: {conj.risk_level}</span>
                              <Tag
                                intent={
                                  conj.risk_level === 'high' || conj.risk_level === 'critical'
                                    ? 'danger'
                                    : 'warning'
                                }
                                minimal
                              >
                                {conj.miss_distance_km.toFixed(1)} km
                              </Tag>
                            </div>
                            <div className="text-xs text-sda-text-muted mt-1">
                              TCA: {new Date(conj.tca).toLocaleString()}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </>
          </div>
          </div>
        </div>

        {/* Right Panel - AI Chat */}
        <div className="absolute right-2 top-[96px] bottom-2 pointer-events-auto flex flex-col gap-2" style={{ width: chatPanel.width }}>
          {/* AI Chat Panel */}
          <div className="relative flex-[2] bg-sda-bg-secondary/80 backdrop-blur-md rounded-sm border border-sda-border-default shadow-lg flex flex-col overflow-hidden min-h-0 map-panel-accent">
            {/* Resize handle - left edge */}
            <div className="resize-handle resize-handle-left" onMouseDown={chatPanel.onMouseDown} />
            <div className="flex items-center justify-between p-2 border-b border-sda-border-default">
              <span className="text-sm font-semibold text-sda-text-primary flex items-center gap-2">
                <Icon icon="chat" className="text-sda-accent-cyan" />
                AI Assistant
              </span>
            </div>
            <div className="flex-1 overflow-hidden">
              <AgentChat
                useStreaming={true}
                onSimulationControl={handleChatSimulationControl}
                quickPrompts={MAP_CHAT_QUICK_PROMPTS}
                contextSatellites={satellites
                  .filter(s => pinnedSatelliteIds.has(s.id))
                  .map(s => ({ id: s.id, name: s.name, norad_id: s.norad_id, object_type: s.object_type, country: s.country, operator: s.operator, tags: s.tags }))}
                onRemoveContextSatellite={(id) => setPinnedSatelliteIds(prev => { const next = new Set(prev); next.delete(id); return next; })}
              />
            </div>
          </div>
        </div>

      </div>

      {/* CelesTrak Browser Dialog */}
      <CelestrakBrowserDialog
        isOpen={celestrakDialogOpen}
        onClose={() => setCelestrakDialogOpen(false)}
        onFetched={() => loadData(true)}
      />

    </div>
  );
}

function MapLoading() {
  return (
    <div className="h-full flex items-center justify-center">
      <Spinner />
    </div>
  );
}

export default function MapPage() {
  return (
    <Suspense fallback={<MapLoading />}>
      <MapPageContent />
    </Suspense>
  );
}
