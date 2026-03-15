'use client';

import { useEffect, useRef, useState } from 'react';
import { getCesium, type CesiumModule } from '@/lib/cesium/loader';
import {
  api,
  type GroundTrackResponse,
  type SensorFootprintResponse,
  type PassPredictionsResponse,
  type GroundStation,
} from '@/lib/api';

interface GroundTrackLayerProps {
  viewer: InstanceType<CesiumModule['Viewer']> | null;
  selectedSatelliteNoradId: number | null;
  visible: boolean;
  /** When a ground station is selected, show pass prediction markers */
  selectedStation?: GroundStation | null;
}

export function GroundTrackLayer({
  viewer,
  selectedSatelliteNoradId,
  visible,
  selectedStation,
}: GroundTrackLayerProps) {
  const cleanupRef = useRef<(() => void) | null>(null);
  const [Cesium, setCesium] = useState<CesiumModule | null>(null);

  useEffect(() => {
    getCesium().then(setCesium);
  }, []);

  useEffect(() => {
    if (!viewer || !Cesium || viewer.isDestroyed() || !viewer.entities) return;

    // Clean up previous entities
    if (cleanupRef.current) {
      cleanupRef.current();
      cleanupRef.current = null;
    }

    if (!visible || !selectedSatelliteNoradId) return;

    let cancelled = false;
    const entityIds: string[] = [];

    const loadData = async () => {
      // Fetch ground track + footprint in parallel; optionally fetch pass predictions
      const promises: [
        Promise<GroundTrackResponse>,
        Promise<SensorFootprintResponse>,
        Promise<PassPredictionsResponse | null>,
      ] = [
        api.getGroundTrack(selectedSatelliteNoradId, 90, 30),
        api.getSensorFootprint(selectedSatelliteNoradId, 30),
        selectedStation
          ? api.getPassPredictions(
              selectedSatelliteNoradId,
              selectedStation.latitude,
              selectedStation.longitude,
              24,
            )
          : Promise.resolve(null),
      ];

      let trackData: GroundTrackResponse | null = null;
      let footprintData: SensorFootprintResponse | null = null;
      let passData: PassPredictionsResponse | null = null;

      try {
        [trackData, footprintData, passData] = await Promise.all(promises);
      } catch (err) {
        console.warn('Failed to load ground track data:', err);
        return;
      }

      if (cancelled || !viewer || viewer.isDestroyed() || !viewer.entities) return;

      // Draw ground track polyline with color gradient
      if (trackData && trackData.points.length > 1) {
        const points = trackData.points;
        // Split into past and future based on current time (half is past, half is future)
        const midIndex = Math.floor(points.length / 2);

        // Past track (faded)
        if (midIndex > 1) {
          const pastPositions = points.slice(0, midIndex + 1).map(p =>
            Cesium.Cartesian3.fromDegrees(p.longitude, p.latitude, 0)
          );
          const pastId = `ground-track-past-${selectedSatelliteNoradId}`;
          try {
            viewer.entities.add({
              id: pastId,
              polyline: {
                positions: pastPositions,
                width: 2,
                arcType: Cesium.ArcType.GEODESIC,
                material: new Cesium.PolylineGlowMaterialProperty({
                  glowPower: 0.1,
                  color: Cesium.Color.fromCssColorString('#06b6d4').withAlpha(0.35),
                }),
                clampToGround: true,
                granularity: 0.02,
              },
            });
            entityIds.push(pastId);
          } catch {}
        }

        // Future track (brighter)
        if (midIndex < points.length - 1) {
          const futurePositions = points.slice(midIndex).map(p =>
            Cesium.Cartesian3.fromDegrees(p.longitude, p.latitude, 0)
          );
          const futureId = `ground-track-future-${selectedSatelliteNoradId}`;
          try {
            viewer.entities.add({
              id: futureId,
              polyline: {
                positions: futurePositions,
                width: 3,
                arcType: Cesium.ArcType.GEODESIC,
                material: new Cesium.PolylineGlowMaterialProperty({
                  glowPower: 0.25,
                  color: Cesium.Color.fromCssColorString('#22d3ee'),
                }),
                clampToGround: true,
                granularity: 0.02,
              },
            });
            entityIds.push(futureId);
          } catch {}
        }

        // Current position marker on ground
        const currentPoint = points[midIndex];
        const currentId = `ground-track-current-${selectedSatelliteNoradId}`;
        try {
          viewer.entities.add({
            id: currentId,
            position: Cesium.Cartesian3.fromDegrees(
              currentPoint.longitude,
              currentPoint.latitude,
              0
            ),
            point: {
              pixelSize: 10,
              color: Cesium.Color.fromCssColorString('#f0f9ff'),
              outlineColor: Cesium.Color.fromCssColorString('#06b6d4'),
              outlineWidth: 3,
              heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
            },
            label: {
              text: 'Sub-Satellite Point',
              font: '11px Google Sans',
              fillColor: Cesium.Color.fromCssColorString('#22d3ee'),
              outlineColor: Cesium.Color.BLACK,
              outlineWidth: 2,
              style: Cesium.LabelStyle.FILL_AND_OUTLINE,
              verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
              pixelOffset: new Cesium.Cartesian2(0, -16),
              heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
            },
          });
          entityIds.push(currentId);
        } catch {}
      }

      // Draw sensor footprint as an ellipse on the ground
      if (footprintData && footprintData.radius_km > 0) {
        const footprintId = `ground-track-footprint-${selectedSatelliteNoradId}`;
        try {
          viewer.entities.add({
            id: footprintId,
            position: Cesium.Cartesian3.fromDegrees(
              footprintData.center_lon,
              footprintData.center_lat,
              0
            ),
            ellipse: {
              semiMajorAxis: footprintData.radius_km * 1000,
              semiMinorAxis: footprintData.radius_km * 1000,
              material: Cesium.Color.fromCssColorString('#06b6d4').withAlpha(0.12),
              outline: true,
              outlineColor: Cesium.Color.fromCssColorString('#22d3ee').withAlpha(0.6),
              outlineWidth: 2,
              heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
            },
          });
          entityIds.push(footprintId);
        } catch {}
      }

      // Draw pass prediction markers at the ground station
      if (passData && passData.passes.length > 0 && selectedStation) {
        passData.passes.forEach((pass, idx) => {
          const passId = `ground-track-pass-${selectedSatelliteNoradId}-${idx}`;
          const riseTime = new Date(pass.rise_time);
          const minsFromNow = Math.round((riseTime.getTime() - Date.now()) / 60000);
          const timeLabel = minsFromNow > 0
            ? `+${minsFromNow}m`
            : `${minsFromNow}m`;
          const durMin = Math.round(pass.duration_seconds / 60);

          try {
            viewer.entities.add({
              id: passId,
              position: Cesium.Cartesian3.fromDegrees(
                selectedStation.longitude,
                selectedStation.latitude,
                0
              ),
              billboard: {
                image: buildPassIcon(pass.max_elevation_deg),
                width: 24,
                height: 24,
                verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
                pixelOffset: new Cesium.Cartesian2(30 * idx, -30),
                heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
              },
              label: {
                text: `Pass ${idx + 1}: ${timeLabel} | ${durMin}m | ${pass.max_elevation_deg.toFixed(0)}°`,
                font: '11px Google Sans',
                fillColor: Cesium.Color.fromCssColorString('#a5f3fc'),
                outlineColor: Cesium.Color.BLACK,
                outlineWidth: 2,
                style: Cesium.LabelStyle.FILL_AND_OUTLINE,
                verticalOrigin: Cesium.VerticalOrigin.TOP,
                pixelOffset: new Cesium.Cartesian2(0, -50 - 18 * idx),
                heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
                show: true,
              },
            });
            entityIds.push(passId);
          } catch {}
        });
      }
    };

    loadData();

    cleanupRef.current = () => {
      if (viewer && !viewer.isDestroyed() && viewer.entities) {
        entityIds.forEach(id => {
          try {
            const entity = viewer.entities.getById(id);
            if (entity) viewer.entities.remove(entity);
          } catch {}
        });
      }
    };

    return () => {
      cancelled = true;
      if (cleanupRef.current) {
        cleanupRef.current();
        cleanupRef.current = null;
      }
    };
  }, [viewer, Cesium, selectedSatelliteNoradId, visible, selectedStation]);

  return null;
}

/** Build a small data-URI icon for pass markers colored by elevation quality. */
function buildPassIcon(maxElevationDeg: number): string {
  const color = maxElevationDeg >= 45 ? '#22c55e' : maxElevationDeg >= 20 ? '#eab308' : '#ef4444';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
    <circle cx="12" cy="12" r="10" fill="${color}" fill-opacity="0.7" stroke="white" stroke-width="2"/>
    <text x="12" y="16" text-anchor="middle" fill="white" font-size="10" font-family="sans-serif">P</text>
  </svg>`;
  return `data:image/svg+xml;base64,${btoa(svg)}`;
}
