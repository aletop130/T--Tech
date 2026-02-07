'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { Card, Elevation, Spinner, Tag, Icon, Button, Checkbox, Intent } from '@blueprintjs/core';
import { api, GroundStation, Satellite, ConjunctionEvent } from '@/lib/api';
import * as Cesium from 'cesium';
import { CesiumViewer } from '@/components/CesiumMap/CesiumViewer';
import { SatelliteLayer } from '@/components/CesiumMap/SatelliteLayer';
import { GroundStationLayer } from '@/components/CesiumMap/GroundStationLayer';
import { ConjunctionLayer } from '@/components/CesiumMap/ConjunctionLayer';
import { SatelliteInfoCard } from '@/components/CesiumMap/SatelliteInfoCard';
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

export default function MapPage() {
  const [viewer, setViewer] = useState<Cesium.Viewer | null>(null);
  const [groundStations, setGroundStations] = useState<GroundStation[]>([]);
  const [satellites, setSatellites] = useState<Satellite[]>([]);
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
      const [stationsData, satellitesWithOrbits, conjunctionsData] = await Promise.all([
        api.getGroundStations({ page_size: 100 }),
        api.getSatellitesWithOrbits(),
        api.getConjunctions({ page_size: 50, is_actionable: true }),
      ]);

      setGroundStations(stationsData.items);
      setSatellites(satellitesWithOrbits);
      setConjunctions(conjunctionsData.items);

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
            <Tag minimal intent="primary">Allied: {satellites.filter(s => {
              const name = s.name?.toLowerCase() || '';
              return name.includes('guardian') || name.includes('deepwatch') || name.includes('terrascan') ||
                     name.includes('starfinder') || name.includes('celestial') || name.includes('windwatcher') ||
                     name.includes('commlink') || name.includes('weathereye') || name.includes('navbeacon') ||
                     name.includes('eyeinsky');
            }).length}</Tag>
            <Tag minimal intent="danger">Enemy: {satellites.filter(s => {
              const name = s.name?.toLowerCase() || '';
              return name.includes('unknown') || name.includes('hostile') || name.includes('suspect') ||
                     name.includes('tracked') || name.includes('unidentified') || name.includes('contact');
            }).length}</Tag>
          </div>
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

      {/* Legend */}
      <div className="flex items-center gap-6 mb-4 text-sm">
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-blue-500"></span>
          <span>Allied Forces</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-red-500"></span>
          <span>Enemy Forces</span>
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
              )}
            </div>
          )}
        </Card>

        {/* Satellites Panel */}
        <Card elevation={Elevation.TWO} className="w-80 flex flex-col overflow-hidden" style={{ minWidth: '320px' }}>
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
                <Tag minimal intent="primary" className="ml-auto">{satellites.filter(s => {
                  const name = s.name?.toLowerCase() || '';
                  return name.includes('guardian') || name.includes('deepwatch') || name.includes('terrascan') ||
                         name.includes('starfinder') || name.includes('celestial') || name.includes('windwatcher') ||
                         name.includes('commlink') || name.includes('weathereye') || name.includes('navbeacon') ||
                         name.includes('eyeinsky');
                }).length}</Tag>
              </div>
              <div className="space-y-1 ml-4 border-l-2 border-blue-500 pl-2">
                {satellites.filter(s => {
                  const name = s.name?.toLowerCase() || '';
                  return name.includes('guardian') || name.includes('deepwatch') || name.includes('terrascan') ||
                         name.includes('starfinder') || name.includes('celestial') || name.includes('windwatcher') ||
                         name.includes('commlink') || name.includes('weathereye') || name.includes('navbeacon') ||
                         name.includes('eyeinsky');
                }).slice(0, 10).map((sat) => (
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
                <Tag minimal intent="danger" className="ml-auto">{satellites.filter(s => {
                  const name = s.name?.toLowerCase() || '';
                  return name.includes('unknown') || name.includes('hostile') || name.includes('suspect') ||
                         name.includes('tracked') || name.includes('unidentified') || name.includes('contact');
                }).length}</Tag>
              </div>
              <div className="space-y-1 ml-4 border-l-2 border-red-500 pl-2">
                {satellites.filter(s => {
                  const name = s.name?.toLowerCase() || '';
                  return name.includes('unknown') || name.includes('hostile') || name.includes('suspect') ||
                         name.includes('tracked') || name.includes('unidentified') || name.includes('contact');
                }).slice(0, 10).map((sat) => (
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
