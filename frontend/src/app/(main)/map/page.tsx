'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { Card, Elevation, Spinner, Tag, Icon, Button, Checkbox, Intent } from '@blueprintjs/core';
import { api, GroundStation, Satellite, ConjunctionEvent, PositionReport } from '@/lib/api';
import * as Cesium from 'cesium';
import { CesiumViewer } from '@/components/CesiumMap/CesiumViewer';
import { SatelliteLayer } from '@/components/CesiumMap/SatelliteLayer';
import { GroundStationLayer } from '@/components/CesiumMap/GroundStationLayer';
import { GroundVehicleLayer } from '@/components/CesiumMap/GroundVehicleLayer';
import { MilitaryVehicleLayer } from '@/components/CesiumMap/MilitaryVehicleLayer';
import { ConjunctionLayer } from '@/components/CesiumMap/ConjunctionLayer';
import { SatelliteInfoCard } from '@/components/CesiumMap/SatelliteInfoCard';
import { SolarSystemLayer } from '@/components/CesiumMap/SolarSystemLayer';
import { PlanetInfoBox } from '@/components/CesiumMap/PlanetInfoBox';
import { PLANETS, type CelestialBody } from '@/lib/solarSystem/data';
import { AgentChat } from '@/components/Chat/AgentChat';
import { cesiumController } from '@/lib/cesium/controller';

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

export default function MapPage() {
  const [viewer, setViewer] = useState<Cesium.Viewer | null>(null);
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
  const [loadingSatellite, setLoadingSatellite] = useState(false);
  const [showOrbits, setShowOrbits] = useState(true);
  const [showCoverage, setShowCoverage] = useState(true);
  const [showConjunctions, setShowConjunctions] = useState(true);
  const [showGroundVehicles, setShowGroundVehicles] = useState(true);
  const [vehicleDisplayMode, setVehicleDisplayMode] = useState<'points' | '3d'>('points');
  const [showTerrain, setShowTerrain] = useState(false);
  const [terrainAvailable, setTerrainAvailable] = useState(false);
  const [viewMode, setViewMode] = useState<'earth' | 'solar'>('solar');
  const [focusedBody, setFocusedBody] = useState<string | null>(null);
  const [managingPlanet, setManagingPlanet] = useState<string | null>(null);
  const [showSolarLabels, setShowSolarLabels] = useState(true);
  const [showPlanetInfo, setShowPlanetInfo] = useState(false);
  const [solarSimulationTime, setSolarSimulationTime] = useState(Date.now());
  const satellitePositionsRef = useRef<Map<string, Cesium.Cartesian3>>(new Map());
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

  // Real-time position updates
  useEffect(() => {
    if (!satelliteReady || !satelliteModule || satellites.length === 0 || orbits.length === 0) return;

    const updatePositions = () => {
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
        if (orbit.positions.length > 0) {
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

      // Store satellite positions for conjunction layer
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

  const handleViewerReady = (cesiumViewer: Cesium.Viewer) => {
    setViewer(cesiumViewer);
    cesiumController.initialize(cesiumViewer);

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
                Cesium.Math.toRadians(-45),
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

  const flyToStation = (station: GroundStation) => {
    if (viewer) {
      viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(
          station.longitude,
          station.latitude,
          10000
        ),
      });
      setSelectedStation(station);
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

  const flyToSatellite = (satellite: Satellite) => {
    setLoadingSatellite(true);
    setSelectedSatellite(satellite);
    
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

  const handleManagePlanet = useCallback((planetId: string) => {
    console.log('[MapPage] Managing planet:', planetId);
    
    if (planetId === 'earth') {
      // For Earth, switch to Earth view mode with satellite management
      setViewMode('earth');
      setFocusedBody('earth');
      setManagingPlanet(null);
      
      if (viewer) {
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
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-sda-text-primary flex items-center gap-2">
          <Icon icon="globe" className="text-sda-accent-cyan" />
          3D Globe View
        </h1>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Tag minimal intent="primary">Allied: {satellites.filter(isAlliedSatellite).length}</Tag>
            <Tag minimal intent="danger">Enemy: {satellites.filter(isEnemySatellite).length}</Tag>
          </div>
          <Button
            intent={viewMode === 'earth' ? Intent.PRIMARY : Intent.NONE}
            onClick={() => {
              setViewMode('earth');
              setFocusedBody('earth');
            }}
            icon="globe"
            minimal
          >
            Earth
          </Button>
          <Button
            intent={viewMode === 'solar' ? Intent.PRIMARY : Intent.NONE}
            onClick={() => {
              setViewMode('solar');
              setFocusedBody(null);
              // Reset selected satellite when switching to solar view
              setSelectedSatellite(null);
            }}
            icon="globe-network"
            minimal
          >
            Solar System
          </Button>
          <Button
            intent={Intent.PRIMARY}
            loading={fetchingFamous}
            onClick={fetchFamousSatellites}
            icon="satellite"
            minimal
          >
            Refresh
          </Button>
        </div>
      </div>

      {/* Fetch message */}
      {fetchMessage && (
        <div className={`mb-4 p-3 rounded ${fetchIntent === Intent.SUCCESS ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
          {fetchMessage}
        </div>
      )}

      {/* Legend and Toggles */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-6 text-sm">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-blue-500"></span>
            <span>Allied Forces</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-red-500"></span>
            <span>Enemy Forces</span>
          </div>
        </div>
        <div className="flex items-center gap-4">
          {viewMode === 'earth' ? (
            <>
              <Checkbox
                checked={showOrbits}
                onChange={(e) => setShowOrbits(e.currentTarget.checked)}
                label="Show Orbits"
              />
              <Checkbox
                checked={showCoverage}
                onChange={(e) => setShowCoverage(e.currentTarget.checked)}
                label="Ground Coverage"
              />
              <Checkbox
                checked={showGroundVehicles}
                onChange={(e) => setShowGroundVehicles(e.currentTarget.checked)}
                label="Ground Vehicles"
              />
              {showGroundVehicles && (
                <div className="flex flex-col gap-1 ml-4">
                  <label className="text-xs text-gray-400">Vehicle Display:</label>
                  <div className="flex gap-2">
                    <button
                      className={`px-2 py-1 text-xs rounded ${
                        vehicleDisplayMode === 'points'
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-700 text-gray-300'
                      }`}
                      onClick={() => setVehicleDisplayMode('points')}
                    >
                      Points
                    </button>
                    <button
                      className={`px-2 py-1 text-xs rounded ${
                        vehicleDisplayMode === '3d'
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-700 text-gray-300'
                      }`}
                      onClick={() => setVehicleDisplayMode('3d')}
                    >
                      3D Models
                    </button>
                  </div>
                </div>
              )}
              <div className="flex flex-col gap-1">
                <label className="text-xs text-gray-400">Terrain:</label>
                <button
                  className={`px-2 py-1 text-xs rounded ${
                    showTerrain
                      ? 'bg-green-600 text-white'
                      : 'bg-gray-700 text-gray-300'
                  }`}
                  onClick={() => {
                    setShowTerrain(!showTerrain);
                    if (!terrainAvailable && !showTerrain) {
                      alert('Terrain requires CESIUM_ION_TOKEN in environment variables');
                    }
                  }}
                >
                  {showTerrain ? 'ON' : 'OFF'}
                </button>
              </div>
              <Checkbox
                checked={showConjunctions}
                onChange={(e) => setShowConjunctions(e.currentTarget.checked)}
                label="Conjunctions"
              />
            </>
          ) : (
            <>
              <Checkbox
                checked={showOrbits}
                onChange={(e) => setShowOrbits(e.currentTarget.checked)}
                label="Show Orbits"
              />
              <Checkbox
                checked={showSolarLabels}
                onChange={(e) => setShowSolarLabels(e.currentTarget.checked)}
                label="Show Labels"
              />
            </>
          )}
        </div>
      </div>

      <div className="flex-1 flex gap-4 min-h-0 overflow-hidden">
        {/* Map */}
        <Card elevation={Elevation.TWO} className="flex-1 overflow-hidden relative" style={{ minHeight: '400px' }}>
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <Spinner size={40} />
            </div>
          ) : (
            <div className="w-full h-full" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
              <DynamicCesiumViewer
                className="w-full h-full"
                onViewerReady={handleViewerReady}
              />
              {viewer && (
                <>
                  {viewMode === 'earth' ? (
                    <>
                      <SatelliteLayer
                        viewer={viewer}
                        satellites={satellites}
                        orbits={orbits}
                        showOrbits={showOrbits}
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
                      {/* Satellite Info Card */}
                      {selectedSatellite && (
                        <SatelliteInfoCard
                          satellite={selectedSatellite}
                          orbit={orbits.find((o) => o.satellite_id === selectedSatellite.id)}
                          onClose={() => setSelectedSatellite(null)}
                        />
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
        </Card>

        {/* Right Panel - Satellites or Solar System */}
        <Card elevation={Elevation.TWO} className="w-80 flex flex-col overflow-hidden" style={{ minWidth: '320px' }}>
          {viewMode === 'earth' ? (
            <>
              <div className="p-3 border-b border-sda-border-default bg-sda-bg-secondary">
                <span className="text-sm font-semibold text-sda-text-primary flex items-center gap-2">
                  <Icon icon="satellite" className="text-sda-accent-cyan" />
                  Satellites ({satellites.length})
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
                    Ground Vehicles ({groundVehicles.length})
                  </h4>
                  <div className="space-y-1 max-h-40 overflow-auto">
                    {groundVehicles.map((vehicle) => (
                      <div
                        key={vehicle.id}
                        className="p-2 text-sm hover:bg-sda-bg-tertiary rounded"
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
                          className="p-2 text-sm bg-sda-bg-tertiary rounded"
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
          ) : managingPlanet ? (
            <>
              <div className="p-3 border-b border-sda-border-default bg-sda-bg-secondary">
                <span className="text-sm font-semibold text-sda-text-primary flex items-center gap-2">
                  <Icon icon="cog" className="text-sda-accent-cyan" />
                  {PLANETS.find(p => p.id === managingPlanet)?.name} Management
                </span>
                <div className="text-xs text-sda-text-muted mt-1">
                  Managing satellite operations
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <Button
                    small
                    minimal
                    intent={Intent.DANGER}
                    onClick={() => setManagingPlanet(null)}
                    icon="cross"
                  >
                    Exit Management
                  </Button>
                  <Button
                    small
                    minimal
                    intent={Intent.PRIMARY}
                    onClick={handleBackToOverview}
                    icon="zoom-out"
                    className="ml-auto"
                  >
                    Back to Overview
                  </Button>
                </div>
              </div>
              <div className="flex-1 overflow-auto p-3">
                <div className="text-center py-8">
                  <Icon icon="globe" size={40} className="text-sda-accent-cyan mb-3" />
                  <h4 className="text-sm font-semibold text-sda-text-primary mb-2">
                    {PLANETS.find(p => p.id === managingPlanet)?.name}
                  </h4>
                  <p className="text-xs text-sda-text-secondary mb-4">
                    Planet management interface for {PLANETS.find(p => p.id === managingPlanet)?.name}.
                    Satellite tracking and ground station management for this planet would appear here.
                  </p>
                  <div className="p-3 bg-sda-bg-tertiary rounded mb-3">
                    <h5 className="text-xs font-semibold text-sda-text-primary mb-2">Quick Actions</h5>
                    <Button small minimal icon="satellite" className="mb-1 w-full text-left">
                      Track Natural Satellites
                    </Button>
                    <Button small minimal icon="search" className="mb-1 w-full text-left">
                      Scan for Objects
                    </Button>
                    <Button small minimal icon="timeline-events" className="mb-1 w-full text-left">
                      Orbital Analysis
                    </Button>
                  </div>
                  <Tag intent={Intent.WARNING} minimal>
                    Coming Soon
                  </Tag>
                </div>
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
                      Reset View
                    </Button>
                  </div>
                )}
              </div>
              <div className="flex-1 overflow-auto p-3">
                {/* Sun */}
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

                {/* Inner Planets */}
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

                {/* Outer Planets */}
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
                      <span className="text-xs text-sda-text-muted ml-auto">{planet.distanceAU?.toFixed(1) || 0} AU</span>
                    </div>
                  ))}
                </div>

                {/* Dwarf Planets */}
                <div>
                  <h4 className="text-xs font-semibold text-sda-text-muted mb-2 uppercase">Dwarf Planets</h4>
                  {PLANETS.filter(p => p.id === 'pluto').map(planet => (
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
                      <span className="text-xs text-sda-text-muted ml-auto">{planet.distanceAU?.toFixed(1) || 0} AU</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </Card>

        {/* AI Chat Panel */}
        <Card elevation={Elevation.TWO} className="w-96 flex flex-col overflow-hidden" style={{ minWidth: '380px' }}>
          <div className="flex items-center justify-between p-3 border-b border-sda-border-default bg-sda-bg-secondary">
            <span className="text-sm font-semibold text-sda-text-primary flex items-center gap-2">
              <Icon icon="chat" className="text-sda-accent-cyan" />
              AI Assistant
            </span>
          </div>
          <div className="flex-1 overflow-hidden">
            <AgentChat useStreaming={true} />
          </div>
        </Card>
      </div>
    </div>
  );
}
