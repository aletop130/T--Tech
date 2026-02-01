'use client';

import { useEffect, useState, useRef } from 'react';
import dynamic from 'next/dynamic';
import { Card, Elevation, Spinner, Tag, Icon, Button, Checkbox } from '@blueprintjs/core';
import { api, GroundStation, Satellite, ConjunctionEvent } from '@/lib/api';
import * as Cesium from 'cesium';
import { CesiumViewer } from '@/components/CesiumMap/CesiumViewer';
import { SatelliteLayer } from '@/components/CesiumMap/SatelliteLayer';
import { GroundStationLayer } from '@/components/CesiumMap/GroundStationLayer';
import { ConjunctionLayer } from '@/components/CesiumMap/ConjunctionLayer';

// Dynamically import Cesium to avoid SSR issues
const DynamicCesiumViewer = dynamic(
  () => Promise.resolve(CesiumViewer),
  { ssr: false }
);

export default function MapPage() {
  const [viewer, setViewer] = useState<Cesium.Viewer | null>(null);
  const [groundStations, setGroundStations] = useState<GroundStation[]>([]);
  const [satellites, setSatellites] = useState<Satellite[]>([]);
  const [conjunctions, setConjunctions] = useState<ConjunctionEvent[]>([]);
  const [orbits, setOrbits] = useState<Array<{
    satellite_id: string;
    positions: Array<{ lat: number; lon: number; alt: number; time: string }>;
  }>>([]);
  const [loading, setLoading] = useState(true);
  const [selectedStation, setSelectedStation] = useState<GroundStation | null>(null);
  const [showOrbits, setShowOrbits] = useState(true);
  const [showCoverage, setShowCoverage] = useState(true);
  const [showConjunctions, setShowConjunctions] = useState(true);
  const satellitePositionsRef = useRef<Map<string, Cesium.Cartesian3>>(new Map());

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [stationsData, satellitesData, conjunctionsData] = await Promise.all([
        api.getGroundStations({ page_size: 100 }),
        api.getSatellites({ page_size: 100, is_active: true }),
        api.getConjunctions({ page_size: 50, is_actionable: true }),
      ]);

      setGroundStations(stationsData.items);
      setSatellites(satellitesData.items);
      setConjunctions(conjunctionsData.items);

      // Generate orbit positions (simplified - in production, use actual TLE propagation)
      const generatedOrbits = satellitesData.items.map((sat) => ({
        satellite_id: sat.id,
        positions: generateOrbitPositions(sat),
      }));
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

  // Simplified orbit generation (in production, use SGP4 from TLE)
  const generateOrbitPositions = (satellite: Satellite): Array<{
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
  };

  const handleViewerReady = (cesiumViewer: Cesium.Viewer) => {
    setViewer(cesiumViewer);

    // Configure entity selection
    cesiumViewer.selectedEntityChanged.addEventListener((selectedEntity) => {
      if (selectedEntity) {
        // Fly to selected entity
        cesiumViewer.flyTo(selectedEntity);
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
    const orbit = orbits.find((o) => o.satellite_id === satellite.id);
    if (viewer && orbit && orbit.positions.length > 0) {
      const pos = orbit.positions[0];
      viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(pos.lon, pos.lat, pos.alt * 1000 + 1000),
      });
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
          <Checkbox
            checked={showOrbits}
            onChange={(e) => setShowOrbits(e.currentTarget.checked)}
            label="Show Orbits"
          />
          <Checkbox
            checked={showCoverage}
            onChange={(e) => setShowCoverage(e.currentTarget.checked)}
            label="Show Coverage"
          />
          <Checkbox
            checked={showConjunctions}
            onChange={(e) => setShowConjunctions(e.currentTarget.checked)}
            label="Show Conjunctions"
          />
        </div>
      </div>

      <div className="flex-1 flex gap-4 min-h-0">
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
                </>
              )}
            </div>
          )}
        </Card>

        {/* Sidebar */}
        <Card elevation={Elevation.TWO} className="w-80 overflow-hidden flex flex-col">
          <div className="p-4 border-b border-sda-border-default">
            <h3 className="font-semibold">Layers</h3>
          </div>

          <div className="flex-1 overflow-auto">
            {/* Satellites */}
            <div className="p-3 border-b border-sda-border-default">
              <h4 className="text-sm font-semibold text-sda-text-secondary mb-2">
                Satellites ({satellites.length})
              </h4>
              <div className="space-y-1 max-h-40 overflow-auto">
                {satellites.slice(0, 10).map((sat) => (
                  <div
                    key={sat.id}
                    className="p-2 text-sm hover:bg-sda-bg-tertiary rounded cursor-pointer"
                    onClick={() => flyToSatellite(sat)}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{sat.name}</span>
                      <Tag minimal>{sat.norad_id}</Tag>
                    </div>
                  </div>
                ))}
                {satellites.length > 10 && (
                  <div className="text-xs text-sda-text-muted text-center pt-2">
                    +{satellites.length - 10} more
                  </div>
                )}
              </div>
            </div>

            {/* Ground Stations */}
            <div className="p-3 border-b border-sda-border-default">
              <h4 className="text-sm font-semibold text-sda-text-secondary mb-2">
                Ground Stations ({groundStations.length})
              </h4>
              <div className="space-y-1 max-h-60 overflow-auto">
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
              <div className="p-3">
                <h4 className="text-sm font-semibold text-sda-text-secondary mb-2">
                  Conjunctions ({conjunctions.length})
                </h4>
                <div className="space-y-1 max-h-40 overflow-auto">
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
      </div>
    </div>
  );
}
