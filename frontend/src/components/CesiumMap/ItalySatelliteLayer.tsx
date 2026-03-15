'use client';

import { useEffect, useRef, useState } from 'react';
import useSWR from 'swr';
import { api, SatelliteOverItaly } from '@/lib/api';
import { getCesium, type CesiumModule } from '@/lib/cesium/loader';
import { getEntityIcon } from '@/lib/cesium/entity-icons';

function satColorHex(sat: SatelliteOverItaly): string {
  if (sat.is_italian) return '#22c55e';
  if (sat.critical_services_count > 0) return '#ef4444';
  if (sat.italian_services.length > 0) return '#f97316';
  return '#38bdf8';
}

interface Props {
  viewer: any | null;
  show?: boolean;
}

export function ItalySatelliteLayer({ viewer, show = true }: Props) {
  const cleanupRef = useRef<(() => void) | null>(null);
  const [Cesium, setCesium] = useState<CesiumModule | null>(null);

  const { data } = useSWR(
    'italy-satellites',
    () => api.getItalySatellites(false),
    { refreshInterval: 120_000, revalidateOnFocus: false, dedupingInterval: 60_000 }
  );

  useEffect(() => { getCesium().then(setCesium); }, []);

  useEffect(() => {
    if (cleanupRef.current) { cleanupRef.current(); cleanupRef.current = null; }
    if (!viewer || viewer.isDestroyed() || !viewer.entities || !Cesium || !show) return;

    const satellites = data?.satellites ?? [];
    const ids: string[] = [];

    for (const sat of satellites) {
      const hexColor = satColorHex(sat);
      const pos = Cesium.Cartesian3.fromDegrees(sat.longitude, sat.latitude, sat.altitude * 1000);
      const id = `italy-map-sat-${sat.norad_id}`;
      try {
        viewer.entities.add({
          id,
          name: `[IT] ${sat.name}`,
          position: pos,
          billboard: {
            image: getEntityIcon('satellite', hexColor),
            width: sat.is_italian ? 22 : 16,
            height: sat.is_italian ? 22 : 16,
            disableDepthTestDistance: 0,
            scaleByDistance: new Cesium.NearFarScalar(1e5, 1.5, 8e6, 0.5),
          },
          label: {
            text: sat.name,
            font: '10px monospace',
            fillColor: Cesium.Color.WHITE,
            outlineColor: Cesium.Color.BLACK,
            outlineWidth: 2,
            style: (Cesium as any).LabelStyle?.FILL_AND_OUTLINE,
            verticalOrigin: (Cesium as any).VerticalOrigin?.BOTTOM,
            pixelOffset: new Cesium.Cartesian2(0, -14),
            show: sat.is_italian,
            disableDepthTestDistance: 0,
            scaleByDistance: new Cesium.NearFarScalar(5e5, 1.0, 5e6, 0.6),
          },
        });
        ids.push(id);
      } catch {}
    }

    cleanupRef.current = () => {
      if (!viewer || viewer.isDestroyed() || !viewer.entities) return;
      for (const id of ids) {
        try { const e = viewer.entities.getById(id); if (e) viewer.entities.remove(e); } catch {}
      }
    };
  }, [viewer, Cesium, data, show]);

  useEffect(() => () => { if (cleanupRef.current) cleanupRef.current(); }, []);

  return null;
}
