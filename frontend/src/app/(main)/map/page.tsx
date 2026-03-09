'use client';

import { useEffect, useState, useRef, useCallback, Suspense } from 'react';
import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';
import { Spinner, Tag, Icon, Button, Checkbox, Intent } from '@blueprintjs/core';
import { api, GroundStation, Satellite, ConjunctionEvent, PositionReport } from '@/lib/api';
import { getDebris, getOrbit } from '@/lib/api/debris';
import { getCesium, type CesiumModule } from '@/lib/cesium/loader';
import type { DebrisObject, OrbitTrackState } from '@/lib/types/debris';
import { AgentChat } from '@/components/Chat/AgentChat';
import { CompactAlertsButton } from '@/components/ProximityAlertPanel/CompactAlertsButton';
import { cesiumController } from '@/lib/cesium/controller';
import { useItalyDefenseSimulation } from '@/lib/simulation/useItalyDefenseSimulation';
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
const DebrisAddMenu = dynamic(() => import('@/components/CesiumMap/DebrisAddMenu').then(m => ({ default: m.DebrisAddMenu })), { ssr: false });
const CelestrakBrowserDialog = dynamic(() => import('@/components/CesiumMap/CelestrakBrowserDialog').then(m => ({ default: m.CelestrakBrowserDialog })), { ssr: false });
const OrbitalTrackLayer = dynamic(() => import('@/components/CesiumMap/OrbitalTrackLayer').then(m => ({ default: m.OrbitalTrackLayer })), { ssr: false });
const MovingSatelliteMarker = dynamic(() => import('@/components/CesiumMap/MovingSatelliteMarker').then(m => ({ default: m.MovingSatelliteMarker })), { ssr: false });
const SimulatedSatelliteLayer = dynamic(() => import('@/components/CesiumMap/SimulatedSatelliteLayer').then(m => ({ default: m.SimulatedSatelliteLayer })), { ssr: false });
const MilitarySymbolLayer = dynamic(() => import('@/components/CesiumMap/MilitarySymbolLayer').then(m => ({ default: m.MilitarySymbolLayer })), { ssr: false });
const DefenseDomeLayer = dynamic(() => import('@/components/CesiumMap/DefenseDomeLayer').then(m => ({ default: m.DefenseDomeLayer })), { ssr: false });
const MissileTrajectoryLayer = dynamic(() => import('@/components/CesiumMap/MissileTrajectoryLayer').then(m => ({ default: m.MissileTrajectoryLayer })), { ssr: false });
const SatelliteCoverageConeLayer = dynamic(() => import('@/components/CesiumMap/SatelliteCoverageConeLayer').then(m => ({ default: m.SatelliteCoverageConeLayer })), { ssr: false });
const ASATTrajectoryLayer = dynamic(() => import('@/components/CesiumMap/ASATTrajectoryLayer').then(m => ({ default: m.ASATTrajectoryLayer })), { ssr: false });
const HostileSatelliteLayer = dynamic(() => import('@/components/CesiumMap/HostileSatelliteLayer').then(m => ({ default: m.HostileSatelliteLayer })), { ssr: false });
const ItalyDefenseHUD = dynamic(() => import('@/components/Simulation/ItalyDefenseHUD').then(m => ({ default: m.ItalyDefenseHUD })), { ssr: false });
const ItalyDefenseNarrative = dynamic(() => import('@/components/Simulation/ItalyDefenseNarrative').then(m => ({ default: m.ItalyDefenseNarrative })), { ssr: false });
const GroundTrackLayer = dynamic(() => import('@/components/CesiumMap/GroundTrackLayer').then(m => ({ default: m.GroundTrackLayer })), { ssr: false });
const CollisionHeatmapLayer = dynamic(() => import('@/components/CesiumMap/CollisionHeatmapLayer').then(m => ({ default: m.CollisionHeatmapLayer })), { ssr: false });

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


function MapPageContent() {
  const searchParams = useSearchParams();
  // @ts-ignore
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
  const [isSimulationMode, setIsSimulationMode] = useState(false);
  const [showGroundTrack, setShowGroundTrack] = useState(true);

  // Per-satellite and per-group visibility
  const [hiddenSatellites, setHiddenSatellites] = useState<Set<string>>(new Set());
  const [hiddenOrbits, setHiddenOrbits] = useState<Set<string>>(new Set());
  const [hiddenGroups, setHiddenGroups] = useState<Set<string>>(new Set());
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [hiddenGroupOrbits, setHiddenGroupOrbits] = useState<Set<string>>(new Set());

  // Multi-select satellites for chat context
  const [pinnedSatelliteIds, setPinnedSatelliteIds] = useState<Set<string>>(new Set());

  // Debris visualization state
  const [debris, setDebris] = useState<DebrisObject[]>([]);
  const [debrisPositions, setDebrisPositions] = useState<InstanceType<CesiumModule['Cartesian3']>[]>([]);
  const [showDebris, setShowDebris] = useState(true);
  const [showCollisionHeatmap, setShowCollisionHeatmap] = useState(false);
  const [selectedDebris, setSelectedDebris] = useState<DebrisObject | null>(null);
  const [speed, setSpeed] = useState(1);
  const speedRef = useRef(1);
// Timestamp (ms) when a maneuver animation should start
const [maneuverStartMs, setManeuverStartMs] = useState<number | undefined>(undefined);

  // Resizable panels
  const elementsPanel = useResizablePanel({ defaultWidth: 288, minWidth: 200, maxWidth: 600, direction: 'right' });
  const chatPanel = useResizablePanel({ defaultWidth: 384, minWidth: 300, maxWidth: 700, direction: 'left' });

  // Live clock
  const [clockStr, setClockStr] = useState(() => new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
  useEffect(() => {
    const t = setInterval(() => setClockStr(new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })), 1000);
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
  
  // Italy Defense Simulation hook
  const {
    time: simTime,
    isPlaying: simIsPlaying,
    isComplete: simIsComplete,
    isPaused: simIsPaused,
    currentStep: simCurrentStep,
    currentPhase: simCurrentPhase,
    keyEvents: simKeyEvents,
    totalDuration: simTotalDuration,
    bases: simBases,
    missiles: simMissiles,
    interceptors: simInterceptors,
    satellites: simSatellites,
    groundUnits: simGroundUnits,
    score: simScore,
    asatMissiles: simASATMissiles,
    hostileSatellites: simHostileSatellites,
    defenseModifier: simDefenseModifier,
    togglePlayPause: simTogglePlayPause,
    resetSimulation: simReset,
    startSimulation: simStart,
    nextStep: simNextStep,
    prevStep: simPrevStep,
    freeCameraMode: simFreeCameraMode,
    toggleFreeCameraMode: simToggleFreeCameraMode,
  } = useItalyDefenseSimulation(viewer, isSimulationMode);

  const handleChatSimulationControl = useCallback(
    (command: { action: string; mode?: string }) => {
      if (command.action !== 'start_italy_defense' && command.action !== 'start_sar_simulation') {
        return;
      }

      const shouldEnterSimulation = !command.mode || command.mode === 'enter_simulation_mode';
      if (shouldEnterSimulation && !isSimulationMode) {
        setIsSimulationMode(true);
      }
    },
    [isSimulationMode]
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
    cesiumController.dispatch({ type: 'cesium.flyTo', payload: { entityId } });
  }, [viewer]);

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

  // Handle highlight parameter from explorer
  useEffect(() => {
    const highlightId = searchParams.get('highlight');
    if (highlightId && satellites.length > 0 && viewer) {
      const sat = satellites.find((s) => s.id === highlightId);
      if (sat) {
        flyToSatellite(sat);
      }
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
      if (isSimulationMode) return; // pause during simulation
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
}, [isSimulationMode]);

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
         } else if (selectedDebris) {
           if (isSimulationMode) {
             const response = await getOrbit(selectedDebris.noradId);
             const Cesium = await getCesium();
             const points = response.points.map((p) => Cesium.Cartesian3.fromDegrees(p.lon, p.lat, p.altKm * 1000));
             const timeStartMs = new Date(response.timeStartUtc).getTime();
             setOrbitTrack({ points, timeStartMs, stepSec: response.stepSec });
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
      const numPoints = 100;
      const now = new Date();
      const radToDeg = (radians: number) => radians * (180 / Math.PI);
      
      // Generate positions for one full orbit
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
            // Check if entity has valid position before flying
            try {
              const position = selectedEntity.position.getValue(cesiumViewer.clock.currentTime);
              if (position && Cesium.Cartesian3.equals(position, Cesium.Cartesian3.ZERO) === false) {
                cesiumViewer.flyTo(selectedEntity, {
                  duration: 2,
                  offset: new Cesium.HeadingPitchRange(
                    Cesium.Math.toRadians(0),
                    Cesium.Math.toRadians(-90),
                    10000
                  )
                });
              }
            } catch (e) {
              console.warn('Could not fly to selected entity:', e);
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
        });
      }
    }, []);


  return (
    <div className="h-full w-full relative overflow-hidden">

          {showDebris && (
            <DebrisInstancedLayer
              viewer={viewer}
              debris={debris}
              maxDisplayObjects={2500}
              refreshIntervalMs={15000}
              showDebris={showDebris}
            />
          )}
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
            />

            {/* Earth Layers */}
              <>
                {!isSimulationMode && (
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
                )}
                {!isSimulationMode && (
                  <GroundStationLayer
                    viewer={viewer}
                    stations={groundStations}
                    showCoverage={showCoverage}
                  />
                )}
                {!isSimulationMode && showGroundVehicles && vehicleDisplayMode === 'points' && (
                  <GroundVehicleLayer
                    viewer={viewer}
                    vehicles={groundVehicles}
                    show={showGroundVehicles}
                  />
                )}
                {!isSimulationMode && showGroundVehicles && vehicleDisplayMode === '3d' && (
                  <MilitaryVehicleLayer
                    viewer={viewer}
                    vehicles={groundVehicles}
                    show={showGroundVehicles}
                  />
                )}
                {!isSimulationMode && showConjunctions && (
                  <ConjunctionLayer
                    viewer={viewer}
                    conjunctions={conjunctions}
                    satellitePositions={satellitePositionsRef.current}
                  />
                )}
                {!isSimulationMode && (
                  <CollisionHeatmapLayer
                    viewer={viewer}
                    visible={showCollisionHeatmap}
                  />
                )}
                {!isSimulationMode && (
                  <DebrisInstancedLayer
                    viewer={viewer}
                    debris={debris}
                    maxDisplayObjects={2500}
                    refreshIntervalMs={15000}
                    showDebris={showDebris}
                  />
                )}
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
                {orbitTrack && viewer && ((selectedDebris && isSimulationMode) || (selectedSatellite && !isSimulationMode)) && (
                  <>
                    <OrbitalTrackLayer viewer={viewer} orbitTrack={orbitTrack} maneuverStartMs={maneuverStartMs} />
                    <MovingSatelliteMarker viewer={viewer} orbitTrack={orbitTrack} maneuverStartMs={maneuverStartMs} />
                  </>
                )}
                {!isSimulationMode && (
                  <GroundTrackLayer
                    viewer={viewer}
                    selectedSatelliteNoradId={selectedSatellite?.norad_id ?? null}
                    visible={showGroundTrack}
                    selectedStation={selectedStation}
                  />
                )}

                {/* Italy Defense Simulation Layers */}
                {isSimulationMode && (
                  <>
                    <SimulatedSatelliteLayer
                      viewer={viewer}
                      satellites={simSatellites.map(sat => ({
                        id: sat.id,
                        name: sat.name,
                        type: sat.type,
                        position: sat.currentPosition || sat.initialPosition,
                        status: sat.status as 'online' | 'degraded' | 'maneuvering' | 'offline',
                        fuelPercent: sat.fuelPercent,
                        affiliation: sat.affiliation as 'allied' | 'hostile' | 'neutral' | undefined,
                      }))}
                      showManeuvers={true}
                      showDataLinks={true}
                      simulationTime={simTime}
                    />
                    <MilitarySymbolLayer
                      viewer={viewer}
                      units={simGroundUnits.map(unit => ({
                        id: unit.id,
                        name: unit.name,
                        sidc: unit.sidc,
                        position: (unit as any).position || unit.initialPosition,
                        affiliation: unit.affiliation,
                        status: unit.status,
                      }))}
                    />
                    <DefenseDomeLayer
                      viewer={viewer}
                      bases={simBases}
                      simulationTime={simTime}
                    />
                    <MissileTrajectoryLayer
                      viewer={viewer}
                      missiles={simMissiles}
                      interceptors={simInterceptors}
                      simulationTime={simTime}
                    />
                    <SatelliteCoverageConeLayer
                      viewer={viewer}
                      satellites={simSatellites}
                      simulationTime={simTime}
                    />
                    <ASATTrajectoryLayer
                      viewer={viewer}
                      asatMissiles={simASATMissiles}
                      simulationTime={simTime}
                    />
                    <HostileSatelliteLayer
                      viewer={viewer}
                      hostileSatellites={simHostileSatellites}
                      satellites={simSatellites}
                      simulationTime={simTime}
                    />
                  </>
                )}
              </>
          </div>
        )}
      </div>

      {/* Simulation Mode Button - Top Left */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20">
        <Button
          intent={isSimulationMode ? Intent.DANGER : Intent.SUCCESS}
          onClick={() => {
            if (isSimulationMode) {
              simReset();
              setIsSimulationMode(false);
            } else {
              setIsSimulationMode(true);
            }
          }}
          icon={isSimulationMode ? 'cross' : 'play'}
          large
        >
          {isSimulationMode ? 'Exit Simulation' : 'Start Simulation'}
        </Button>
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

          {!isSimulationMode && (
            <>
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
                  <DebrisAddMenu debrisCount={debris.length} />
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Speed Control Overlay */}
<div className="absolute bottom-4 left-4 z-20 glass-panel rounded-md px-3 py-2 flex items-center gap-2">
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
      <div className="absolute inset-0 z-10 pointer-events-none">
        {/* Left Panel - Elements */}
        {!isSimulationMode && (
          <div className="absolute left-4 top-[88px] bottom-4 pointer-events-auto bg-sda-bg-secondary/60 backdrop-blur-sm rounded-lg border border-sda-border-default px-4 py-2 shadow-lg flex flex-col overflow-hidden" style={{ width: elementsPanel.width }}>
            {/* Resize handle - right edge */}
            <div className="resize-handle resize-handle-right" onMouseDown={elementsPanel.onMouseDown} />
            <div className="flex flex-col h-full">
              <>
                <div className="p-3 border-b border-sda-border-default">
                  <span className="text-sm font-semibold text-sda-text-primary flex items-center gap-2">
                    <Icon icon="satellite" className="text-sda-accent-cyan" />
                    Elements ({satellites.length})
                  </span>
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
                      const color = getGroupColor(groupIdx);
                      const isGroupHidden = hiddenGroups.has(group);
                      const isGroupOrbitsHidden = hiddenGroupOrbits.has(group);
                      return (
                        <div key={group} className="mb-3">
                          <div className="flex items-center gap-2 mb-1">
                            <Icon icon="folder-close" size={14} style={{ color }} />
                            <span className="text-sm font-semibold flex items-center gap-1" style={{ color }}>
                              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }}></span>
                              {group}
                            </span>
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

                   {/* Debris Folder */}
                   <div>
                     <div className="flex items-center gap-2 mb-1">
                       <Icon icon="folder-close" className="text-amber-500" size={14} />
                       <span className="text-sm font-semibold text-amber-500 flex items-center gap-1">
                         <span className="w-2 h-2 rounded-full" style={{ backgroundColor: '#f59e0b' }}></span>
                         Space Debris
                       </span>
                       <Tag minimal intent="warning" className="ml-auto">{debris.length}</Tag>
                     </div>
                     <div className="space-y-1 ml-4 border-l-2 border-amber-500 pl-2 max-h-60 overflow-auto">
                       {[...debris]
                         .sort((a, b) => a.altKm - b.altKm)
                         .slice(0, expandedGroups.has('__debris__') ? debris.length : 10)
                         .map((d) => (
                           <div
                             key={d.noradId}
                             className={`p-2 text-sm hover:bg-sda-bg-tertiary rounded cursor-pointer ${selectedDebris?.noradId === d.noradId ? 'bg-sda-bg-tertiary' : ''}`}
                             onClick={() => flyToDebris(d)}
                           >
                             <div className="flex items-center justify-between">
                               <span className="font-medium">NORAD {d.noradId}</span>
                               <Tag minimal intent="warning">{d.altKm.toFixed(1)} km</Tag>
                             </div>
                           </div>
                         ))}
                       {debris.length > 10 && (
                         <button
                           className="p-2 text-xs text-sda-accent-blue hover:text-sda-text-primary hover:bg-sda-bg-tertiary rounded w-full text-left cursor-pointer"
                           onClick={() => setExpandedGroups(prev => {
                             const next = new Set(prev);
                             if (next.has('__debris__')) next.delete('__debris__'); else next.add('__debris__');
                             return next;
                           })}
                         >
                           {expandedGroups.has('__debris__')
                             ? 'Show less'
                             : `+${debris.length - 10} more`}
                         </button>
                       )}
                     </div>
                   </div>

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
        )}

        {/* Right Panel - AI Chat */}
        <div className="absolute right-4 top-[88px] bottom-4 pointer-events-auto flex flex-col gap-4" style={{ width: chatPanel.width }}>
          {/* AI Chat Panel */}
          <div className="relative flex-[2] bg-sda-bg-secondary/90 backdrop-blur-md rounded-lg border border-sda-border-default px-4 py-2 shadow-lg flex flex-col overflow-hidden min-h-0">
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
                contextSatellites={satellites
                  .filter(s => pinnedSatelliteIds.has(s.id))
                  .map(s => ({ id: s.id, name: s.name, norad_id: s.norad_id, object_type: s.object_type, country: s.country, operator: s.operator, tags: s.tags }))}
                onRemoveContextSatellite={(id) => setPinnedSatelliteIds(prev => { const next = new Set(prev); next.delete(id); return next; })}
              />
            </div>
          </div>
        </div>

        {/* Left Panel - Italy Defense HUD (Simulation Mode Only) */}
        {isSimulationMode && (
          <ItalyDefenseHUD
            simulationTime={simTime}
            totalDuration={simTotalDuration}
            currentPhase={simCurrentPhase}
            keyEvents={simKeyEvents}
            bases={simBases}
            satellites={simSatellites}
            score={simScore}
            isPlaying={simIsPlaying}
            isComplete={simIsComplete}
            isPaused={simIsPaused}
            onPlayPause={simTogglePlayPause}
            onReset={() => {
              simReset();
              setIsSimulationMode(false);
            }}
            onNextStep={simNextStep}
            onPrevStep={simPrevStep}
            freeCameraMode={simFreeCameraMode}
            onToggleFreeCameraMode={simToggleFreeCameraMode}
            asatMissiles={simASATMissiles}
            hostileSatellites={simHostileSatellites}
            defenseModifier={simDefenseModifier}
          />
        )}
      </div>

      {/* CelesTrak Browser Dialog */}
      <CelestrakBrowserDialog
        isOpen={celestrakDialogOpen}
        onClose={() => setCelestrakDialogOpen(false)}
        onFetched={() => loadData(true)}
      />

      {/* Italy Defense Simulation UI */}
      {isSimulationMode && (
        <>
          {/* Start Mission Button - Only show when simulation hasn't started */}
          {!simIsPlaying && !simIsComplete && simTime === 0 && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
              <div className="bg-slate-900 border border-red-500 rounded-lg p-8 max-w-lg text-center shadow-2xl">
                <h2 className="text-2xl font-bold text-red-400 mb-2">OPERATION SCUDO D'ITALIA</h2>
                <p className="text-sm text-cyan-400 mb-4 font-mono">ITALY MISSILE DEFENSE SIMULATION</p>
                <p className="text-slate-300 mb-6">
                  Intelligence reports confirm imminent multi-domain attack from Iran targeting Italian military installations and allied satellite constellation.
                  NATO integrated air defense network must intercept incoming ballistic missiles while defending the satellite
                  constellation from ASAT kinetic kill vehicles, co-orbital hostile satellites, electronic warfare, and cyber attacks.
                </p>
                <div className="space-y-2 text-sm text-slate-400 mb-6">
                  <p>Ground: 8 ballistic missiles (Shahab-3, Emad, Khorramshahr)</p>
                  <p>Space: 3 ASAT missiles, 3 co-orbital threats, 3 EW attacks, 2 cyber attacks</p>
                  <p>Defense: 8 NATO/Italian bases + 6 allied satellites</p>
                  <p>Duration: 15 min sim time (1 min real-time at 15x)</p>
                </div>
                <Button
                  intent={Intent.DANGER}
                  large
                  onClick={simStart}
                  icon="shield"
                  className="px-8 py-3 text-lg font-bold"
                >
                  ACTIVATE DEFENSE
                </Button>
              </div>
            </div>
          )}
          <ItalyDefenseNarrative
            simulationTime={simTime}
            isPlaying={simIsPlaying}
          />
        </>
      )}
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
