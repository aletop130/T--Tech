'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { getCesium, type CesiumModule } from '@/lib/cesium/loader';
import { api, CollisionHeatmapBand, ConjunctionPairData } from '@/lib/api';

interface CollisionHeatmapLayerProps {
  viewer: InstanceType<CesiumModule['Viewer']> | null;
  visible: boolean;
}

const EARTH_RADIUS_M = 6_371_000;

function riskColor(Cesium: CesiumModule, score: number): InstanceType<CesiumModule['Color']> {
  if (score >= 70) return Cesium.Color.RED.withAlpha(0.04);
  if (score >= 50) return Cesium.Color.ORANGE.withAlpha(0.03);
  if (score >= 30) return Cesium.Color.YELLOW.withAlpha(0.02);
  if (score >= 10) return Cesium.Color.LIME.withAlpha(0.015);
  return Cesium.Color.GREEN.withAlpha(0.01);
}

function riskOutlineColor(Cesium: CesiumModule, score: number): InstanceType<CesiumModule['Color']> {
  if (score >= 70) return Cesium.Color.RED.withAlpha(0.15);
  if (score >= 50) return Cesium.Color.ORANGE.withAlpha(0.12);
  if (score >= 30) return Cesium.Color.YELLOW.withAlpha(0.10);
  return Cesium.Color.GREEN.withAlpha(0.08);
}

function riskLabel(score: number): string {
  if (score >= 70) return 'HIGH';
  if (score >= 50) return 'MEDIUM';
  if (score >= 30) return 'ELEVATED';
  if (score >= 10) return 'LOW';
  return 'MINIMAL';
}

export function CollisionHeatmapLayer({ viewer, visible }: CollisionHeatmapLayerProps) {
  const [Cesium, setCesium] = useState<CesiumModule | null>(null);
  const [bands, setBands] = useState<CollisionHeatmapBand[]>([]);
  const [selectedBand, setSelectedBand] = useState<CollisionHeatmapBand | null>(null);
  const [bandEvents, setBandEvents] = useState<ConjunctionPairData[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const entityIdsRef = useRef<Set<string>>(new Set());
  const cleanupRef = useRef<(() => void) | null>(null);
  const fetchedRef = useRef(false);

  useEffect(() => {
    getCesium().then(setCesium);
  }, []);

  // Fetch heatmap data
  useEffect(() => {
    if (!visible || fetchedRef.current) return;
    fetchedRef.current = true;

    api.getCollisionHeatmap()
      .then((data) => setBands(data.bands))
      .catch((err) => console.error('Failed to fetch collision heatmap:', err));
  }, [visible]);

  // Reset fetch flag when hidden
  useEffect(() => {
    if (!visible) {
      fetchedRef.current = false;
    }
  }, [visible]);

  // Load events when a band is selected
  const handleBandClick = useCallback(async (band: CollisionHeatmapBand) => {
    setSelectedBand(band);
    setLoadingEvents(true);
    try {
      const data = await api.getCollisionEvents({
        altitude_min: band.altitude_min_km,
        altitude_max: band.altitude_max_km,
        page_size: 20,
      });
      setBandEvents(data.items);
    } catch (err) {
      console.error('Failed to fetch collision events:', err);
      setBandEvents([]);
    } finally {
      setLoadingEvents(false);
    }
  }, []);

  // Render shells on the globe
  useEffect(() => {
    if (!viewer || !Cesium || !visible || bands.length === 0) {
      // Clean up when hidden
      if (cleanupRef.current) {
        cleanupRef.current();
        cleanupRef.current = null;
      }
      return;
    }

    // Clean previous entities
    if (cleanupRef.current) {
      cleanupRef.current();
      cleanupRef.current = null;
    }

    const ids = new Set<string>();

    bands.forEach((band) => {
      if (band.event_count === 0) return;

      const innerRadiusM = EARTH_RADIUS_M + band.altitude_min_km * 1000;
      const outerRadiusM = EARTH_RADIUS_M + band.altitude_max_km * 1000;
      const midRadiusM = (innerRadiusM + outerRadiusM) / 2;

      const shellId = `collision-heatmap-shell-${band.altitude_min_km}`;
      const labelId = `collision-heatmap-label-${band.altitude_min_km}`;

      // Inner shell
      const innerEntity = viewer.entities.add({
        id: shellId + '-inner',
        position: Cesium.Cartesian3.fromDegrees(0, 0, 0),
        ellipsoid: {
          radii: new Cesium.Cartesian3(innerRadiusM, innerRadiusM, innerRadiusM),
          material: riskColor(Cesium, band.risk_score),
          outline: true,
          outlineColor: riskOutlineColor(Cesium, band.risk_score),
          outlineWidth: 1,
          slicePartitions: 36,
          stackPartitions: 18,
        },
      });
      if (innerEntity) ids.add(shellId + '-inner');

      // Outer shell (thinner, just outline)
      const outerEntity = viewer.entities.add({
        id: shellId + '-outer',
        position: Cesium.Cartesian3.fromDegrees(0, 0, 0),
        ellipsoid: {
          radii: new Cesium.Cartesian3(outerRadiusM, outerRadiusM, outerRadiusM),
          material: Cesium.Color.TRANSPARENT,
          outline: true,
          outlineColor: riskOutlineColor(Cesium, band.risk_score),
          outlineWidth: 1,
          slicePartitions: 36,
          stackPartitions: 18,
        },
      });
      if (outerEntity) ids.add(shellId + '-outer');

      // Label at a fixed longitude/latitude to mark the band
      const labelEntity = viewer.entities.add({
        id: labelId,
        position: Cesium.Cartesian3.fromDegrees(0, 45, midRadiusM - EARTH_RADIUS_M),
        label: {
          text: `${band.altitude_min_km}-${band.altitude_max_km}km\n${riskLabel(band.risk_score)} (${band.event_count})`,
          font: '13px Google Sans Code',
          fillColor: band.risk_score >= 50 ? Cesium.Color.RED : Cesium.Color.fromCssColorString('#88ccff'),
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 2,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          verticalOrigin: Cesium.VerticalOrigin.CENTER,
          horizontalOrigin: Cesium.HorizontalOrigin.LEFT,
          pixelOffset: new Cesium.Cartesian2(5, 0),
          scaleByDistance: new Cesium.NearFarScalar(1e6, 1.0, 5e7, 0.3),
          translucencyByDistance: new Cesium.NearFarScalar(1e6, 1.0, 8e7, 0.0),
          disableDepthTestDistance: 0,
        },
        description: `
          <div style="font-family: 'Google Sans', sans-serif; padding: 8px;">
            <h3 style="margin:0 0 8px">Collision Risk: ${band.altitude_min_km}-${band.altitude_max_km} km</h3>
            <p><strong>Risk Level:</strong> ${riskLabel(band.risk_score)}</p>
            <p><strong>Risk Score:</strong> ${band.risk_score.toFixed(1)}/100</p>
            <p><strong>Conjunction Events:</strong> ${band.event_count}</p>
          </div>
        `,
      });
      if (labelEntity) ids.add(labelId);
    });

    entityIdsRef.current = ids;

    cleanupRef.current = () => {
      if (viewer && viewer.entities) {
        ids.forEach((id) => {
          try {
            const entity = viewer.entities.getById(id);
            if (entity) viewer.entities.remove(entity);
          } catch {}
        });
      }
      ids.clear();
    };
  }, [viewer, Cesium, visible, bands]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (cleanupRef.current) {
        cleanupRef.current();
        cleanupRef.current = null;
      }
    };
  }, []);

  // Render the events info panel when a band is selected
  if (!visible) return null;

  return (
    <>
      {/* Band selection panel */}
      {bands.length > 0 && (
        <div
          className="absolute top-20 right-4 z-30 glass-panel rounded-lg p-3"
          style={{ width: 260, maxHeight: 420, overflowY: 'auto' }}
        >
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs font-bold text-sda-text-primary tracking-wider uppercase">
              Collision Risk
            </span>
          </div>
          {bands.map((band) => {
            const isSelected = selectedBand?.altitude_min_km === band.altitude_min_km;
            const bg =
              band.risk_score >= 70
                ? 'bg-red-900/40 border-red-500/50'
                : band.risk_score >= 50
                ? 'bg-orange-900/30 border-orange-500/40'
                : band.risk_score >= 30
                ? 'bg-yellow-900/20 border-yellow-500/30'
                : band.risk_score >= 10
                ? 'bg-green-900/15 border-green-500/20'
                : 'bg-gray-800/20 border-gray-600/20';
            return (
              <button
                key={band.altitude_min_km}
                className={`w-full text-left rounded px-2 py-1.5 mb-1 border text-xs transition-colors ${bg} ${
                  isSelected ? 'ring-1 ring-blue-400' : ''
                } hover:brightness-125`}
                onClick={() => handleBandClick(band)}
              >
                <div className="flex justify-between items-center">
                  <span className="text-sda-text-primary font-medium">
                    {band.altitude_min_km}-{band.altitude_max_km} km
                  </span>
                  <span className={`font-bold ${
                    band.risk_score >= 70 ? 'text-red-400' :
                    band.risk_score >= 50 ? 'text-orange-400' :
                    band.risk_score >= 30 ? 'text-yellow-400' :
                    'text-green-400'
                  }`}>
                    {riskLabel(band.risk_score)}
                  </span>
                </div>
                <div className="flex justify-between mt-0.5 text-sda-text-secondary">
                  <span>{band.event_count} events</span>
                  <span>Score: {band.risk_score.toFixed(0)}</span>
                </div>
                {/* Risk bar */}
                <div className="w-full h-1 mt-1 bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${
                      band.risk_score >= 70 ? 'bg-red-500' :
                      band.risk_score >= 50 ? 'bg-orange-500' :
                      band.risk_score >= 30 ? 'bg-yellow-500' :
                      'bg-green-500'
                    }`}
                    style={{ width: `${Math.min(band.risk_score, 100)}%` }}
                  />
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Event details panel */}
      {selectedBand && (
        <div
          className="absolute bottom-20 right-4 z-30 glass-panel rounded-lg p-3"
          style={{ width: 340, maxHeight: 300, overflowY: 'auto' }}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-sda-text-primary tracking-wider uppercase">
              {selectedBand.altitude_min_km}-{selectedBand.altitude_max_km} km Events
            </span>
            <button
              className="text-xs text-sda-text-secondary hover:text-white"
              onClick={() => { setSelectedBand(null); setBandEvents([]); }}
            >
              Close
            </button>
          </div>
          {loadingEvents ? (
            <div className="text-xs text-sda-text-secondary py-2">Loading events...</div>
          ) : bandEvents.length === 0 ? (
            <div className="text-xs text-sda-text-secondary py-2">No events in this band</div>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="text-sda-text-secondary border-b border-sda-border-default">
                  <th className="text-left py-1">Sat 1</th>
                  <th className="text-left py-1">Sat 2</th>
                  <th className="text-right py-1">Range</th>
                </tr>
              </thead>
              <tbody>
                {bandEvents.map((ev, i) => (
                  <tr
                    key={i}
                    className="border-b border-sda-border-default/30 hover:bg-white/5"
                  >
                    <td className="py-1 text-sda-text-primary truncate max-w-[100px]" title={ev.sat1_name}>
                      {ev.sat1_name.length > 14 ? ev.sat1_name.slice(0, 14) + '...' : ev.sat1_name}
                    </td>
                    <td className="py-1 text-sda-text-primary truncate max-w-[100px]" title={ev.sat2_name}>
                      {ev.sat2_name.length > 14 ? ev.sat2_name.slice(0, 14) + '...' : ev.sat2_name}
                    </td>
                    <td className="py-1 text-right font-mono">
                      <span className={
                        ev.min_range_km < 1 ? 'text-red-400' :
                        ev.min_range_km < 5 ? 'text-orange-400' :
                        ev.min_range_km < 25 ? 'text-yellow-400' :
                        'text-green-400'
                      }>
                        {ev.min_range_km.toFixed(2)} km
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </>
  );
}
