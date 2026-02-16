'use client';

import { useEffect, useState, useRef, useCallback, Suspense } from 'react';
import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';
import { Spinner, Tag, Icon, Button, Checkbox, Intent } from '@blueprintjs/core';
import { api, GroundStation, Satellite, ConjunctionEvent, PositionReport } from '@/lib/api';
import { getDebris } from '@/lib/api/debris';
import { getCesium, type CesiumModule } from '@/lib/cesium/loader';
import type { DebrisObject } from '@/lib/types/debris';
import { CesiumViewer } from '@/components/CesiumMap/CesiumViewer';
import { SatelliteLayer } from '@/components/CesiumMap/SatelliteLayer';
import { GroundStationLayer } from '@/components/CesiumMap/GroundStationLayer';
import { GroundVehicleLayer } from '@/components/CesiumMap/GroundVehicleLayer';
import { MilitaryVehicleLayer } from '@/components/CesiumMap/MilitaryVehicleLayer';
import { ConjunctionLayer } from '@/components/CesiumMap/ConjunctionLayer';
import { SatelliteInfoCard } from '@/components/CesiumMap/SatelliteInfoCard';
import { GroundStationInfoCard } from '@/components/CesiumMap/GroundStationInfoCard';
import { GroundVehicleInfoCard } from '@/components/CesiumMap/GroundVehicleInfoCard';
import { ConjunctionInfoCard } from '@/components/CesiumMap/ConjunctionInfoCard';
import { SolarSystemLayer } from '@/components/CesiumMap/SolarSystemLayer';
import { PlanetInfoBox } from '@/components/CesiumMap/PlanetInfoBox';
import { PLANETS, type CelestialBody } from '@/lib/solarSystem/data';
import { AgentChat } from '@/components/Chat/AgentChat';
import { UnifiedAlertsPanel } from '@/components/ProximityAlertPanel/UnifiedAlertsPanel';
import { cesiumController } from '@/lib/cesium/controller';
import { SimulatedSatelliteLayer } from '@/components/CesiumMap/SimulatedSatelliteLayer';
import { MilitarySymbolLayer } from '@/components/CesiumMap/MilitarySymbolLayer';
import { MissionNarrative } from '@/components/Simulation/MissionNarrative';
import { MissionHUD } from '@/components/Simulation/MissionHUD';
import { useSARSimulation } from '@/lib/simulation/useSARSimulation';

declare global {
  interface Window {
    __DETOUR_SPEED__?: number;
  }
}

// Dynamically import Cesium to avoid SSR issues
const DynamicCesiumViewer = dynamic(
  () => Promise.resolve(CesiumViewer),
  { ssr: false }
);

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

// Mock space agency configuration
const ALLIED_COUNTRY = 'Italy';
const ALLIED_OPERATOR = 'Guardian Space Command';

const ENEMY_COUNTRIES = ['Unknown Territory', 'Hostile Region', 'Restricted Zone', 'Monitored Area'];
const ENEMY_OPERATORS = ['Shadow Fleet', 'Rogue Command', 'Hostile Ops', 'Unknown Entity', 'Suspect Agency'];

// Helper to check if satellite is allied
const isAlliedSatellite = (sat: Satellite): boolean => {
  const name = sat.name?.toLowerCase() || '';
  return name.includes('guardian') || name.includes('deepwatch') || name.includes('terrascan') ||
         name.includes('starfinder') || name.includes('celestial') || name.includes('windwatcher') ||
         name.includes('commlink') || name.includes('weathereye') || name.includes('navbeacon') ||
         name.includes('eyeinsky');
};

// Helper to check if satellite is enemy
const isEnemySatellite = (sat: Satellite): boolean => {
  const name = sat.name?.toLowerCase() || '';
  return name.includes('unknown') || name.includes('hostile') || name.includes('suspect') ||
         name.includes('tracked') || name.includes('unidentified') || name.includes('contact');
};

// Mock satellite metadata
const mockSatelliteMetadata = (satellites: Satellite[]): Satellite[] => {
  return satellites.map((sat) => {
    if (isAlliedSatellite(sat)) {
      return {
        ...sat,
        country: ALLIED_COUNTRY,
        operator: ALLIED_OPERATOR,
        faction: 'allied' as const,
      };
    } else if (isEnemySatellite(sat)) {
      // Deterministic mocking based on satellite ID
      const idHash = sat.id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
      return {
        ...sat,
        country: ENEMY_COUNTRIES[idHash % ENEMY_COUNTRIES.length],
        operator: ENEMY_OPERATORS[idHash % ENEMY_OPERATORS.length],
        faction: 'enemy' as const,
      };
    }
    // Neutral satellites
    return {
      ...sat,
      faction: 'neutral' as const,
    };
  });
};

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
  const [fetchingFamous, setFetchingFamous] = useState(false);
  const [fetchMessage, setFetchMessage] = useState<string | null>(null);
  const [fetchIntent, setFetchIntent] = useState<Intent>(Intent.SUCCESS);
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
  const [viewMode, setViewMode] = useState<'earth' | 'solar'>('earth');
  const [focusedBody, setFocusedBody] = useState<string | null>(null);
  const [managingPlanet, setManagingPlanet] = useState<string | null>(null);
  const [showSolarLabels, setShowSolarLabels] = useState(true);
  const [showPlanetInfo, setShowPlanetInfo] = useState(false);
  const [solarSimulationTime, setSolarSimulationTime] = useState(Date.now());
  const [isSimulationMode, setIsSimulationMode] = useState(false);

  // Debris visualization state
  const [debris, setDebris] = useState<DebrisObject[]>([]);
  const [debrisPositions, setDebrisPositions] = useState<InstanceType<CesiumModule['Cartesian3']>[]>([]);
  const [showDebris, setShowDebris] = useState(true);
  const [selectedDebris, setSelectedDebris] = useState<DebrisObject | null>(null);
  const [speed, setSpeed] = useState(1);
  const speedRef = useRef(1);
// Debris data loading configuration
const DEBRIS_REFRESH_MS = 15_000;
const DISPLAY_OBJECT_LIMIT = 2500;
const DEBRIS_ORBIT_CLASSES = "LEO";
  
  // SAR Simulation hook
  const {
    time: simTime,
    isPlaying: simIsPlaying,
    isComplete: simIsComplete,
    isPaused: simIsPaused,
    stepMode: simStepMode,
    currentStep: simCurrentStep,
    keyEvents: simKeyEvents,
    totalDuration: simTotalDuration,
    satellites: simSatellites,
    groundUnits: simGroundUnits,
    togglePlayPause: simTogglePlayPause,
    resetSimulation: simReset,
    toggleStepMode: simToggleStepMode,
    startSimulation: simStart,
    nextStep: simNextStep,
    prevStep: simPrevStep,
    freeCameraMode: simFreeCameraMode,
    toggleFreeCameraMode: simToggleFreeCameraMode,
  } = useSARSimulation(viewer, isSimulationMode);
  
  const satellitePositionsRef = useRef<Map<string, InstanceType<CesiumModule['Cartesian3']>>>(new Map());
  const animationFrameRef = useRef<number | null>(null);
  const lastUpdateRef = useRef<number>(0);

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

  const loadData = async () => {
    setLoading(true);
    try {
      const [stationsData, satellitesWithOrbits, conjunctionsData, vehiclesData] = await Promise.all([
        api.getGroundStations({ page_size: 100 }),
        api.getSatellitesWithOrbits(),
        api.getConjunctions({ page_size: 50, is_actionable: true }),
        api.getGroundVehicles().catch(() => ({ items: [] })),
      ]);

      setGroundStations(stationsData.items);
      // Apply mock metadata to satellites
      const satellitesWithMockData = mockSatelliteMetadata(satellitesWithOrbits);
      setSatellites(satellitesWithMockData);
      setConjunctions(conjunctionsData.items);
      setGroundVehicles(vehiclesData.items);

      // Generate orbit positions from TLE if available
      const generatedOrbits: OrbitData[] = satellitesWithOrbits.map((sat) => {
        const tle1 = sat.latest_orbit?.tle_line1;
        const tle2 = sat.latest_orbit?.tle_line2;
        
        if (tle1 && tle2 && satelliteModule) {
          // Use TLE for realistic orbit
          return generateOrbitFromTLE(sat.id, tle1, tle2, sat.latest_orbit?.epoch);
        } else {
          // Fallback to simplified orbit
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
      console.error('Failed to load map data:', error);
    } finally {
      setLoading(false);
    }
  };

  // Load debris data and refresh periodically
useEffect(() => {
  let abortController = new AbortController();

  const loadDebris = async () => {
    if (isSimulationMode) return; // pause during simulation
    try {
      const response = await getDebris(DISPLAY_OBJECT_LIMIT, DEBRIS_ORBIT_CLASSES);
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
      console.error('Failed to load debris:', err);
    }
  };

  // Initial load
  loadDebris();

  const interval = setInterval(() => {
    loadDebris();
  }, DEBRIS_REFRESH_MS);

  return () => {
    clearInterval(interval);
    abortController.abort();
  };
}, [isSimulationMode, viewer]);

const fetchFamousSatellites = async () => {
    setFetchingFamous(true);
    setFetchMessage(null);
    
    try {
      const result = await api.fetchFamousSatellites();
      
      if (result.success) {
        setFetchIntent(Intent.SUCCESS);
        setFetchMessage(result.message);
        
        // Reload data to get new satellites with orbits
        await loadData();
        
        // Clear message after 5 seconds
        setTimeout(() => setFetchMessage(null), 5000);
      } else {
        setFetchIntent(Intent.DANGER);
        setFetchMessage(result.message || 'Failed to fetch satellites');
      }
    } catch (error) {
      setFetchIntent(Intent.DANGER);
      setFetchMessage(error instanceof Error ? error.message : 'Failed to fetch satellites');
    } finally {
      setFetchingFamous(false);
    }
  };

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
      console.error('Error propagating TLE:', e);
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

  const handleViewerReady = async (cesiumViewer: InstanceType<CesiumModule['Viewer']>) => {
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
      duration: 0,
    });

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
  };

  const flyToStation = async (station: GroundStation) => {
    if (viewer) {
      const Cesium = await getCesium();
      viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(
          station.longitude,
          station.latitude,
          10000
        ),
      });
      setSelectedStation(station);
      setSelectedSatellite(null);
      setSelectedVehicle(null);
      setSelectedConjunction(null);
    }
  };

  // Handle transitioning from solar system to Earth view
  // REMOVED: Effect that auto-switched to Earth when focusedBody was 'earth'
  // Each body now has independent coordinates in solar system mode

  // Sync showPlanetInfo with focusedBody - hide info when focusedBody is null
  useEffect(() => {
    if (!focusedBody) {
      setShowPlanetInfo(false);
    }
  }, [focusedBody]);

  const flyToSatellite = async (satellite: Satellite) => {
    setLoadingSatellite(true);
    setSelectedSatellite(satellite);
    setSelectedStation(null);
    setSelectedVehicle(null);
    setSelectedConjunction(null);
    
    const orbit = orbits.find((o) => o.satellite_id === satellite.id);
    
    if (!viewer) {
      console.warn('Viewer not ready');
      setLoadingSatellite(false);
      return;
    }
    
    if (!orbit) {
      console.warn('Orbit not found for satellite:', satellite.id);
      setLoadingSatellite(false);
      return;
    }
    
    if (!orbit.positions || orbit.positions.length === 0) {
      console.warn('No positions available for satellite:', satellite.id);
      setLoadingSatellite(false);
      return;
    }
    
    const pos = orbit.positions[0];
    
    if (typeof pos.lon !== 'number' || typeof pos.lat !== 'number' || typeof pos.alt !== 'number') {
      console.error('Invalid position data:', pos);
      setLoadingSatellite(false);
      return;
    }
    
    if (!Number.isFinite(pos.lon) || !Number.isFinite(pos.lat) || !Number.isFinite(pos.alt)) {
      console.error('Position contains invalid values:', pos);
      setLoadingSatellite(false);
      return;
    }
    
    if (pos.lat < -90 || pos.lat > 90) {
      console.error('Invalid latitude:', pos.lat);
      setLoadingSatellite(false);
      return;
    }
    
    const altitudeMeters = pos.alt * 1000 + 1000;
    
    try {
      const Cesium = await getCesium();
      viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(pos.lon, pos.lat, altitudeMeters),
        duration: 2,
      });
      // Set loading to false after animation
      setTimeout(() => setLoadingSatellite(false), 2100);
    } catch (error) {
      console.error('Failed to fly to satellite:', error);
      setLoadingSatellite(false);
    }
  };

  const handleManagePlanet = useCallback(async (planetId: string) => {
    console.log('[MapPage] Managing planet:', planetId);
    
    if (planetId === 'earth') {
      // For Earth, switch to Earth view mode with satellite management
      setViewMode('earth');
      setFocusedBody('earth');
      setManagingPlanet(null);
      
      if (viewer) {
        const Cesium = await getCesium();
        viewer.camera.flyTo({
          destination: Cesium.Cartesian3.fromDegrees(0, 0, 20000000),
          orientation: {
            heading: 0.0,
            pitch: -Cesium.Math.PI_OVER_TWO,
            roll: 0.0,
          },
          duration: 1.5,
        });
      }
    } else {
      // For other planets, stay in solar system view but enter management mode
      setViewMode('solar');
      setFocusedBody(planetId);
      setManagingPlanet(planetId);
      setShowPlanetInfo(false); // Hide info box, show management panel instead
    }
  }, [viewer]);

  const handleBackToOverview = useCallback(() => {
    setFocusedBody(null);
    setShowPlanetInfo(false);
    setManagingPlanet(null);
  }, []);

  const handleClosePlanetInfo = useCallback(() => {
    setShowPlanetInfo(false);
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
            <DynamicCesiumViewer
              className="w-full h-full"
              onViewerReady={handleViewerReady}
            />
            {viewer && (
              <>
                {viewMode === 'earth' ? (
                  <>
                    {!isSimulationMode && (
                      <SatelliteLayer
                        viewer={viewer}
                        satellites={satellites}
                        orbits={orbits}
                        showOrbits={showOrbits}
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
                    {selectedSatellite && (
                      <SatelliteInfoCard
                        satellite={selectedSatellite}
                        orbit={orbits.find((o) => o.satellite_id === selectedSatellite.id)}
                        onClose={() => setSelectedSatellite(null)}
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
                    
                    {/* SAR Simulation Layers */}
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
                            position: unit.position,
                            affiliation: unit.affiliation,
                            status: unit.status,
                            heading: unit.movements?.find(m => m.time <= simTime)?.heading,
                            speed: unit.movements?.find(m => m.time <= simTime)?.speed,
                          }))}
                        />
                      </>
                    )}
                  </>
                ) : (
                  <>
                    <SolarSystemLayer
                      viewer={viewer}
                      showOrbits={showOrbits}
                      showLabels={showSolarLabels}
                      focusedBody={focusedBody}
                      onBodyClick={(bodyId) => {
                        setFocusedBody(bodyId);
                        setShowPlanetInfo(true);
                      }}
                      simulationTime={solarSimulationTime}
                    />
                    {showPlanetInfo && focusedBody && (
                      <PlanetInfoBox
                        planet={PLANETS.find(p => p.id === focusedBody)!}
                        onManage={() => handleManagePlanet(focusedBody)}
                        onClose={handleClosePlanetInfo}
                        onBackToOverview={handleBackToOverview}
                      />
                    )}
                  </>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* Simulation Mode Button - Top Left */}
      <div className="absolute top-4 left-4 z-20">
        <Button
          intent={isSimulationMode ? Intent.DANGER : Intent.SUCCESS}
          onClick={() => {
            if (isSimulationMode) {
              // Exit simulation
              simReset();
              setIsSimulationMode(false);
            } else {
              // Enter simulation
              setIsSimulationMode(true);
            }
          }}
          icon={isSimulationMode ? 'cross' : 'play'}
          large
        >
          {isSimulationMode ? 'Exit Simulation' : 'Start SAR Simulation'}
        </Button>
      </div>

      {/* Unified Control Bar */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 bg-sda-bg-secondary/60 backdrop-blur-sm rounded-lg border border-sda-border-default px-4 py-2 shadow-lg">
        {/* Row 1: Title + Counters + View Buttons */}
        <div className="flex items-center gap-4 mb-2">
          <h1 className="text-lg font-bold text-sda-text-primary flex items-center gap-2">
            <Icon icon="globe" className="text-sda-accent-cyan" />
            3D Glove View
          </h1>
          <div className="flex items-center gap-2">
            <Tag minimal intent="primary">Allied: {satellites.filter(isAlliedSatellite).length}</Tag>
            <Tag minimal intent="danger">Enemy: {satellites.filter(isEnemySatellite).length}</Tag>
          </div>
          <div className="flex items-center gap-2 ml-auto">
            <Button
              intent={viewMode === 'earth' ? Intent.PRIMARY : Intent.NONE}
              onClick={async () => {
                setViewMode('earth');
                setFocusedBody('earth');
                if (viewer) {
                  const Cesium = await getCesium();
                  viewer.camera.flyTo({
                    destination: Cesium.Cartesian3.fromDegrees(12.5674, 41.8719, 8000000),
                    orientation: {
                      heading: Cesium.Math.toRadians(0),
                      pitch: Cesium.Math.toRadians(-90),
                      roll: 0,
                    },
                    duration: 1.5,
                  });
                }
              }}
              icon="globe"
              minimal
              small
            >
              Earth
            </Button>
            <Button
              intent={viewMode === 'solar' ? Intent.PRIMARY : Intent.NONE}
              onClick={() => {
                setViewMode('solar');
                setFocusedBody(null);
                setSelectedSatellite(null);
              }}
              icon="globe-network"
              minimal
              small
            >
              Solar
            </Button>
            <Button
              intent={Intent.PRIMARY}
              loading={fetchingFamous}
              onClick={fetchFamousSatellites}
              icon="satellite"
              minimal
              small
            >
              Refresh
            </Button>
          </div>
        </div>

        {/* Row 2: Toggles */}
        {!isSimulationMode && (
          <div className="flex items-center gap-4 text-sm">
            {viewMode === 'earth' ? (
              <>
                <div className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                  <span className="text-sda-text-secondary">Allied</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-red-500"></span>
                  <span className="text-sda-text-secondary">Enemy</span>
                </div>
                <div className="border-l border-sda-border-default pl-4 flex items-center gap-3">
                <Checkbox
                  checked={showOrbits}
                  onChange={(e) => setShowOrbits(e.currentTarget.checked)}
                  label="Orbits"
                  labelElement={<span className="text-xs text-sda-text-secondary">Orbits</span>}
                />
                <Checkbox
                  checked={showCoverage}
                  onChange={(e) => setShowCoverage(e.currentTarget.checked)}
                  label="Coverage"
                  labelElement={<span className="text-xs text-sda-text-secondary">Coverage</span>}
                />
                <Checkbox
                  checked={showGroundVehicles}
                  onChange={(e) => setShowGroundVehicles(e.currentTarget.checked)}
                  label="Vehicles"
                  labelElement={<span className="text-xs text-sda-text-secondary">Vehicles</span>}
                />
                {showGroundVehicles && (
                  <div className="flex items-center gap-1 ml-2">
                    <button
                      className={`px-2 py-0.5 text-xs rounded ${
                        vehicleDisplayMode === 'points'
                          ? 'bg-blue-600 text-white'
                          : 'bg-sda-bg-tertiary text-sda-text-secondary'
                      }`}
                      onClick={() => setVehicleDisplayMode('points')}
                    >
                      Points
                    </button>
                    <button
                      className={`px-2 py-0.5 text-xs rounded ${
                        vehicleDisplayMode === '3d'
                          ? 'bg-blue-600 text-white'
                          : 'bg-sda-bg-tertiary text-sda-text-secondary'
                      }`}
                      onClick={() => setVehicleDisplayMode('3d')}
                    >
                      3D
                    </button>
                  </div>
                )}
                <button
                  className={`px-2 py-0.5 text-xs rounded ${
                    showTerrain
                      ? 'bg-green-600 text-white'
                      : 'bg-sda-bg-tertiary text-sda-text-secondary'
                  }`}
                  onClick={() => {
                    setShowTerrain(!showTerrain);
                    if (!terrainAvailable && !showTerrain) {
                      alert('Terrain requires CESIUM_ION_TOKEN in environment variables');
                    }
                  }}
                >
                  Terrain: {showTerrain ? 'ON' : 'OFF'}
                </button>
                <Checkbox
                  checked={showConjunctions}
                  onChange={(e) => setShowConjunctions(e.currentTarget.checked)}
                  label="Conj"
                  labelElement={<span className="text-xs text-sda-text-secondary">Conj</span>}
                />
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                <span className="text-sda-text-secondary">Allied</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-red-500"></span>
                <span className="text-sda-text-secondary">Enemy</span>
              </div>
              <div className="border-l border-sda-border-default pl-4 flex items-center gap-3">
                <Checkbox
                  checked={showOrbits}
                  onChange={(e) => setShowOrbits(e.currentTarget.checked)}
                  label="Orbits"
                  labelElement={<span className="text-xs text-sda-text-secondary">Orbits</span>}
                />
                <Checkbox
                  checked={showSolarLabels}
                  onChange={(e) => setShowSolarLabels(e.currentTarget.checked)}
                  label="Labels"
                  labelElement={<span className="text-xs text-sda-text-secondary">Labels</span>}
                />
              </div>
            </>
          )}
        </div>
        )}
      </div>

      {/* Panels Container */}
      <div className="absolute inset-0 z-10 pointer-events-none">
        {/* Left Panel - Elements */}
        {!isSimulationMode && (
          <div className="absolute left-4 top-32 bottom-4 w-72 pointer-events-auto bg-sda-bg-secondary/60 backdrop-blur-sm rounded-lg border border-sda-border-default px-4 py-2 shadow-lg flex flex-col overflow-hidden">
            <div className="flex flex-col h-full">
              {viewMode === 'earth' ? (
              <>
                <div className="p-3 border-b border-sda-border-default">
                  <span className="text-sm font-semibold text-sda-text-primary flex items-center gap-2">
                    <Icon icon="satellite" className="text-sda-accent-cyan" />
                    Elements ({satellites.length})
                  </span>
                  <div className="flex items-center gap-3 mt-2 text-xs text-sda-text-muted">
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500"></span> Allied</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500"></span> Enemy</span>
                  </div>
                </div>
                <div className="flex-1 overflow-auto p-3">
                  {/* Allied Satellites Folder */}
                  <div className="mb-3">
                    <div className="flex items-center gap-2 mb-1">
                      <Icon icon="folder-close" className="text-blue-500" size={14} />
                      <span className="text-sm font-semibold text-blue-500 flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                        Allied Forces
                      </span>
                      <Tag minimal intent="primary" className="ml-auto">{satellites.filter(isAlliedSatellite).length}</Tag>
                    </div>
                    <div className="space-y-1 ml-4 border-l-2 border-blue-500 pl-2">
                      {satellites.filter(isAlliedSatellite).slice(0, 10).map((sat) => (
                        <div
                          key={sat.id}
                          className={`p-2 text-sm hover:bg-sda-bg-tertiary rounded cursor-pointer ${
                            selectedSatellite?.id === sat.id ? 'bg-sda-bg-tertiary' : ''
                          }`}
                          onClick={() => flyToSatellite(sat)}
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-medium truncate max-w-[120px]">{sat.name}</span>
                            {loadingSatellite && selectedSatellite?.id === sat.id ? (
                              <Spinner size={16} />
                            ) : (
                              <Tag minimal intent="primary">{sat.norad_id}</Tag>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Enemy Satellites Folder */}
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <Icon icon="folder-close" className="text-red-500" size={14} />
                      <span className="text-sm font-semibold text-red-500 flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-red-500"></span>
                        Enemy Forces
                      </span>
                      <Tag minimal intent="danger" className="ml-auto">{satellites.filter(isEnemySatellite).length}</Tag>
                    </div>
                    <div className="space-y-1 ml-4 border-l-2 border-red-500 pl-2">
                      {satellites.filter(isEnemySatellite).slice(0, 10).map((sat) => (
                        <div
                          key={sat.id}
                          className={`p-2 text-sm hover:bg-sda-bg-tertiary rounded cursor-pointer ${
                            selectedSatellite?.id === sat.id ? 'bg-sda-bg-tertiary' : ''
                          }`}
                          onClick={() => flyToSatellite(sat)}
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-medium truncate max-w-[120px]">{sat.name}</span>
                            {loadingSatellite && selectedSatellite?.id === sat.id ? (
                              <Spinner size={16} />
                            ) : (
                              <Tag minimal intent="danger">{sat.norad_id}</Tag>
                            )}
                          </div>
                        </div>
                      ))}
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
            ) : (
              <>
                <div className="p-3 border-b border-sda-border-default bg-sda-bg-secondary">
                  <span className="text-sm font-semibold text-sda-text-primary flex items-center gap-2">
                    <Icon icon="globe-network" className="text-sda-accent-cyan" />
                    Solar System
                  </span>
                  <div className="text-xs text-sda-text-muted mt-1">
                    Click a planet to focus view
                  </div>
                  {focusedBody && (
                    <div className="mt-2 flex items-center gap-2">
                      <span className="text-xs text-sda-text-secondary">
                        Focused: <span className="font-semibold capitalize">{focusedBody}</span>
                      </span>
                      <Button
                        small
                        minimal
                        intent={Intent.PRIMARY}
                        onClick={handleBackToOverview}
                        icon="zoom-out"
                        className="ml-auto"
                      >
                        Reset
                      </Button>
                    </div>
                  )}
                </div>
                <div className="flex-1 overflow-auto p-3">
                  <div className="mb-4">
                    <div
                      className={`flex items-center gap-2 p-2 rounded cursor-pointer ${
                        focusedBody === 'sun' ? 'bg-sda-bg-tertiary' : 'hover:bg-sda-bg-tertiary'
                      }`}
                      onClick={() => {
                        setFocusedBody('sun');
                        setShowPlanetInfo(true);
                      }}
                    >
                      <span className="w-4 h-4 rounded-full" style={{ backgroundColor: '#FDB813' }}></span>
                      <span className="font-medium">Sun</span>
                    </div>
                  </div>
                  <div className="mb-4">
                    <h4 className="text-xs font-semibold text-sda-text-muted mb-2 uppercase">Inner Planets</h4>
                    {PLANETS.filter(p => ['mercury', 'venus', 'earth', 'mars'].includes(p.id)).map(planet => (
                      <div
                        key={planet.id}
                        className={`flex items-center gap-2 p-2 rounded cursor-pointer ${
                          focusedBody === planet.id ? 'bg-sda-bg-tertiary' : 'hover:bg-sda-bg-tertiary'
                        }`}
                        onClick={() => {
                          setFocusedBody(planet.id);
                          setShowPlanetInfo(true);
                        }}
                      >
                        <span className="w-3 h-3 rounded-full" style={{ backgroundColor: planet.color }}></span>
                        <span className="text-sm">{planet.name}</span>
                        <span className="text-xs text-sda-text-muted ml-auto">{planet.distanceAU?.toFixed(2) || 0} AU</span>
                      </div>
                    ))}
                  </div>
                  <div className="mb-4">
                    <h4 className="text-xs font-semibold text-sda-text-muted mb-2 uppercase">Outer Planets</h4>
                    {PLANETS.filter(p => ['jupiter', 'saturn', 'uranus', 'neptune'].includes(p.id)).map(planet => (
                      <div
                        key={planet.id}
                        className={`flex items-center gap-2 p-2 rounded cursor-pointer ${
                          focusedBody === planet.id ? 'bg-sda-bg-tertiary' : 'hover:bg-sda-bg-tertiary'
                        }`}
                        onClick={() => {
                          setFocusedBody(planet.id);
                          setShowPlanetInfo(true);
                        }}
                      >
                        <span className="w-3 h-3 rounded-full" style={{ backgroundColor: planet.color }}></span>
                        <span className="text-sm">{planet.name}</span>
                        <span className="text-xs text-sda-text-muted ml-auto">{planet.distanceAU?.toFixed(2) || 0} AU</span>
                      </div>
                    ))}
                  </div>
                  {showPlanetInfo && focusedBody && focusedBody !== 'sun' && (
                    <PlanetInfoBox
                      planet={PLANETS.find(p => p.id === focusedBody)!}
                      onManage={() => handleManagePlanet(focusedBody)}
                      onClose={handleClosePlanetInfo}
                      onBackToOverview={handleBackToOverview}
                    />
                  )}
                </div>
              </>
            )}
          </div>
        </div>
        )}

        {/* Right Panel - Alerts & AI Chat - Hidden during simulation */}
        {!isSimulationMode && (
        <div className="absolute right-4 top-24 bottom-4 w-96 pointer-events-auto flex flex-col gap-4">
          {/* Unified Alerts Panel */}
          {viewMode === 'earth' && (
            <div className="h-80 bg-sda-bg-secondary/60 backdrop-blur-sm rounded-lg border border-sda-border-default shadow-lg overflow-hidden">
              <UnifiedAlertsPanel 
                onAlertClick={(alert) => {
                  const sat = satellites.find(s => s.name === alert.primary_satellite_name);
                  if (sat) {
                    flyToSatellite(sat);
                  }
                }}
              />
            </div>
          )}
          
          {/* AI Chat Panel */}
          <div className="flex-1 bg-sda-bg-secondary/60 backdrop-blur-sm rounded-lg border border-sda-border-default px-4 py-2 shadow-lg flex flex-col overflow-hidden min-h-0">
            <div className="flex items-center justify-between p-2 border-b border-sda-border-default">
              <span className="text-sm font-semibold text-sda-text-primary flex items-center gap-2">
                <Icon icon="chat" className="text-sda-accent-cyan" />
                AI Assistant
              </span>
            </div>
            <div className="flex-1 overflow-hidden">
              <AgentChat useStreaming={true} />
            </div>
          </div>
        </div>
        )}
      </div>

      {/* Fetch message toast */}
      {fetchMessage && (
        <div className={`absolute bottom-6 left-1/2 -translate-x-1/2 z-30 p-3 rounded shadow-lg ${
          fetchIntent === Intent.SUCCESS 
            ? 'bg-green-500/90 text-white' 
            : 'bg-red-500/90 text-white'
        }`}>
          {fetchMessage}
        </div>
      )}
      
      {/* SAR Simulation UI */}
      {isSimulationMode && (
        <>
          {/* Start Mission Button - Only show when simulation hasn't started */}
          {!simIsPlaying && !simIsComplete && simTime === 0 && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
              <div className="bg-slate-900 border border-cyan-500 rounded-lg p-8 max-w-lg text-center shadow-2xl">
                <h2 className="text-2xl font-bold text-cyan-400 mb-4">Operation Guardian Angel</h2>
                <p className="text-slate-300 mb-6">
                  Allied special forces team Phantom-6 has been isolated 45km southwest of Misrata.
                  Your mission: Execute precision SAR operation using satellite overwatch and ground assets.
                </p>
                <div className="space-y-2 text-sm text-slate-400 mb-6">
                  <p>Mission Duration: 4 hours (compressed to 2 minutes)</p>
                  <p>Primary Asset: ReconSat-1</p>
                  <p>Extraction Unit: MH-60 Seahawk</p>
                </div>
                <Button
                  intent={Intent.SUCCESS}
                  large
                  onClick={simStart}
                  icon="play"
                  className="px-8 py-3 text-lg font-bold"
                >
                  START MISSION
                </Button>
              </div>
            </div>
          )}
          <MissionHUD
            simulationTime={simTime}
            totalDuration={simTotalDuration}
            stepMode={simStepMode}
            currentStep={simCurrentStep}
            keyEvents={simKeyEvents}
            satellites={simSatellites.map(s => ({
              id: s.id,
              name: s.name,
              status: s.status,
              fuelPercent: s.fuelPercent,
            }))}
            groundAssets={[
              { id: 'phantom-6', name: 'Phantom-6 Team', status: simTime < 210 ? 'WAITING' : simTime < 240 ? 'EXTRACTING' : 'SECURED' },
              { id: 'hms-defender', name: 'HMS Defender', status: 'OPERATIONAL' },
              { id: 'seahawk', name: 'MH-60 Seahawk', status: simTime < 120 ? 'STANDBY' : simTime < 270 ? 'ACTIVE' : 'RTB' },
            ]}
            isPlaying={simIsPlaying}
            isComplete={simIsComplete}
            isPaused={simIsPaused}
            onPlayPause={simTogglePlayPause}
            onReset={() => {
              simReset();
              setIsSimulationMode(false);
            }}
            onToggleStepMode={simToggleStepMode}
            onNextStep={simNextStep}
            onPrevStep={simPrevStep}
            freeCameraMode={simFreeCameraMode}
            onToggleFreeCameraMode={simToggleFreeCameraMode}
          />
          <MissionNarrative
            simulationTime={simTime}
            isPlaying={simIsPlaying}
            stepMode={simStepMode}
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
