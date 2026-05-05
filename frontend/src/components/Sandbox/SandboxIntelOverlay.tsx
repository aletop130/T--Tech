'use client';

import { useEffect, useRef, useState } from 'react';
import * as satellite from 'satellite.js';

import { getCesium, type CesiumModule } from '@/lib/cesium/loader';
import { getEntityIcon } from '@/lib/cesium/entity-icons';
import type { SatelliteDetail, GroundStation, PositionReport, AircraftPosition, VesselPosition } from '@/lib/api';

const FACTION_COLORS: Record<string, string> = {
  allied: '#06b6d4',
  enemy: '#ef4444',
  neutral: '#fbbf24',
};

function satColor(sat: SatelliteDetail): string {
  return FACTION_COLORS[sat.faction ?? 'neutral'] ?? '#a1a1aa';
}

function computeSatPosition(sat: SatelliteDetail): { lat: number; lon: number; alt: number } | null {
  const orbit = sat.latest_orbit;
  if (!orbit?.tle_line1 || !orbit?.tle_line2) return null;
  try {
    const satrec = satellite.twoline2satrec(orbit.tle_line1, orbit.tle_line2);
    const now = new Date();
    const posVel = satellite.propagate(satrec, now);
    if (!posVel.position || typeof posVel.position === 'boolean') return null;
    const gmst = satellite.gstime(now);
    const geo = satellite.eciToGeodetic(posVel.position, gmst);
    return {
      lat: satellite.degreesLat(geo.latitude),
      lon: satellite.degreesLong(geo.longitude),
      alt: geo.height * 1000, // km → m
    };
  } catch {
    return null;
  }
}

interface SandboxIntelOverlayProps {
  viewer: InstanceType<CesiumModule['Viewer']> | null;
  visible: boolean;
  satellites: SatelliteDetail[];
  stations: GroundStation[];
  vehicles: PositionReport[];
  aircraft?: AircraftPosition[];
  vessels?: VesselPosition[];
  showAircraft?: boolean;
  showVessels?: boolean;
}

export function SandboxIntelOverlay({
  viewer,
  visible,
  satellites,
  stations,
  vehicles,
  aircraft = [],
  vessels = [],
  showAircraft = false,
  showVessels = false,
}: SandboxIntelOverlayProps) {
  const cleanupRef = useRef<(() => void) | null>(null);
  const [Cesium, setCesium] = useState<CesiumModule | null>(null);

  useEffect(() => {
    getCesium().then(setCesium);
  }, []);

  useEffect(() => {
    if (!viewer || !Cesium || !viewer.entities) return;

    // Always clean up previous entities first
    cleanupRef.current?.();
    cleanupRef.current = null;

    if (!visible && !showAircraft && !showVessels) return;

    const entityIds = new Set<string>();

    // Satellites (only when main intel overlay is visible)
    if (visible) satellites.forEach((sat) => {
      const pos = computeSatPosition(sat);
      if (!pos) return;
      const id = `intel-sat-${sat.id}`;
      const cssColor = satColor(sat);
      const color = Cesium.Color.fromCssColorString(cssColor);
      viewer.entities.add({
        id,
        name: sat.name,
        position: Cesium.Cartesian3.fromDegrees(pos.lon, pos.lat, pos.alt),
        billboard: {
          image: getEntityIcon('satellite', cssColor),
          width: 16,
          height: 16,
          heightReference: Cesium.HeightReference.NONE,
          disableDepthTestDistance: 0,
        },
        label: {
          text: sat.name,
          font: '10px Google Sans',
          fillColor: color.withAlpha(0.7),
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 2,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
          pixelOffset: new Cesium.Cartesian2(0, -12),
          scale: 0.85,
        },
      });
      entityIds.add(id);
    });

    // Ground stations (only when main intel overlay is visible)
    if (visible) stations.forEach((gs) => {
      const id = `intel-gs-${gs.id}`;
      const cssColor = '#22d3ee';
      const color = Cesium.Color.fromCssColorString(cssColor);
      viewer.entities.add({
        id,
        name: gs.name,
        position: Cesium.Cartesian3.fromDegrees(gs.longitude, gs.latitude, 0),
        billboard: {
          image: getEntityIcon('ground_station', cssColor),
          width: 14,
          height: 14,
          heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
          disableDepthTestDistance: 0,
        },
        label: {
          text: gs.name,
          font: '9px Google Sans',
          fillColor: color.withAlpha(0.6),
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 2,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
          pixelOffset: new Cesium.Cartesian2(0, -10),
          scale: 0.8,
        },
      });
      entityIds.add(id);
    });

    // Ground vehicles (only when main intel overlay is visible)
    if (visible) vehicles.forEach((v) => {
      const id = `intel-veh-${v.id}`;
      const cssColor = '#fbbf24';
      const color = Cesium.Color.fromCssColorString(cssColor);
      viewer.entities.add({
        id,
        name: v.entity_id,
        position: Cesium.Cartesian3.fromDegrees(v.longitude, v.latitude, 0),
        billboard: {
          image: getEntityIcon('vehicle', cssColor),
          width: 14,
          height: 14,
          heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
          disableDepthTestDistance: 0,
        },
        label: {
          text: v.entity_id,
          font: '9px Google Sans',
          fillColor: color.withAlpha(0.6),
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 2,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
          pixelOffset: new Cesium.Cartesian2(0, -10),
          scale: 0.8,
        },
      });
      entityIds.add(id);
    });

    // Aircraft
    if (showAircraft) {
      aircraft.forEach((ac) => {
        const id = `intel-ac-${ac.icao24}`;
        const cssColor = '#f9a8d4';
        const color = Cesium.Color.fromCssColorString(cssColor);
        const alt = ac.on_ground ? 0 : ac.altitude_m;
        viewer.entities.add({
          id,
          name: ac.callsign || ac.icao24,
          position: Cesium.Cartesian3.fromDegrees(ac.longitude, ac.latitude, alt),
          billboard: {
            image: getEntityIcon('aircraft', cssColor),
            width: 14,
            height: 14,
            heightReference: ac.on_ground
              ? Cesium.HeightReference.CLAMP_TO_GROUND
              : Cesium.HeightReference.NONE,
            rotation: ac.heading_deg != null
              ? -Cesium.Math.toRadians(ac.heading_deg)
              : 0,
            disableDepthTestDistance: 0,
          },
          label: {
            text: ac.callsign || ac.icao24,
            font: '9px Google Sans',
            fillColor: color.withAlpha(0.7),
            outlineColor: Cesium.Color.BLACK,
            outlineWidth: 2,
            style: Cesium.LabelStyle.FILL_AND_OUTLINE,
            verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
            pixelOffset: new Cesium.Cartesian2(0, -10),
            scale: 0.8,
          },
        });
        entityIds.add(id);
      });
    }

    // Vessels
    if (showVessels) {
      vessels.forEach((v) => {
        const id = `intel-vs-${v.mmsi}`;
        const cssColor = '#6ee7b7';
        const color = Cesium.Color.fromCssColorString(cssColor);
        viewer.entities.add({
          id,
          name: v.name || `MMSI ${v.mmsi}`,
          position: Cesium.Cartesian3.fromDegrees(v.longitude, v.latitude, 0),
          billboard: {
            image: getEntityIcon('ship', cssColor),
            width: 14,
            height: 14,
            heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
            rotation: v.heading_deg != null
              ? -Cesium.Math.toRadians(v.heading_deg)
              : 0,
            disableDepthTestDistance: 0,
          },
          label: {
            text: v.name || `${v.mmsi}`,
            font: '9px Google Sans',
            fillColor: color.withAlpha(0.6),
            outlineColor: Cesium.Color.BLACK,
            outlineWidth: 2,
            style: Cesium.LabelStyle.FILL_AND_OUTLINE,
            verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
            pixelOffset: new Cesium.Cartesian2(0, -10),
            scale: 0.8,
          },
        });
        entityIds.add(id);
      });
    }

    cleanupRef.current = () => {
      entityIds.forEach((eid) => {
        const entity = viewer.entities.getById(eid);
        if (entity) viewer.entities.remove(entity);
      });
    };

    return () => {
      cleanupRef.current?.();
      cleanupRef.current = null;
    };
  }, [Cesium, viewer, visible, satellites, stations, vehicles, aircraft, vessels, showAircraft, showVessels]);

  return null;
}
