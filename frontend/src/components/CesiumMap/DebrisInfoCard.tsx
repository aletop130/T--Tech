// WRITE_TARGET="frontend/src/components/CesiumMap/DebrisInfoCard.tsx"
// WRITE_CONTENT_LENGTH=0

'use client';

import { Card, Elevation, Tag, Icon, Button } from '@blueprintjs/core';
import type { DebrisObject } from '@/lib/types/debris';

interface DebrisInfoCardProps {
  debris: DebrisObject;
  onClose?: () => void;
  onManeuver?: () => void;
}

/** Determine orbit class based on altitude (km) */
const getOrbitClass = (altKm: number): string => {
  if (altKm < 2000) return 'LEO';
  if (altKm < 35786) return 'MEO';
  return 'GEO';
};

export function DebrisInfoCard({ debris, onClose, onManeuver }: DebrisInfoCardProps) {
  const orbitClass = getOrbitClass(debris.altKm);

  return (
    <Card elevation={Elevation.TWO} className="absolute left-[310px] top-32 bottom-4 w-80 z-10 glass-panel pointer-events-auto">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {/* Icon with debris colour */}
          <Icon icon="trash" className="text-[#f59e0b]" />
          <h3 className="text-lg font-semibold text-sda-text-primary">Debris {debris.noradId}</h3>
        </div>
{onClose && (
            <Button minimal small icon="cross" onClick={onClose} />
          )}
          {onManeuver && (
            <Button minimal small icon="flash" intent="warning" onClick={onManeuver} title="Trigger maneuver animation" />
          )}
      </div>

      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div>
            <span className="text-sda-text-secondary">NORAD ID:</span>
            <span className="ml-1 text-sda-text-primary font-medium">{debris.noradId}</span>
          </div>
          <div>
            <span className="text-sda-text-secondary">Altitude:</span>
            <span className="ml-1 text-sda-text-primary font-medium">{debris.altKm.toFixed(1)} km</span>
          </div>
          <div className="col-span-2">
            <span className="text-sda-text-secondary">Position:</span>
            <span className="ml-1 text-sda-text-primary">
              {debris.lat.toFixed(4)}°, {debris.lon.toFixed(4)}°
            </span>
          </div>
          <div>
            <span className="text-sda-text-secondary">Orbit Class:</span>
            <Tag intent="warning" minimal className="ml-1">{orbitClass}</Tag>
          </div>
          {/* Placeholder for last updated – API does not supply per‑object timestamp */}
          <div className="col-span-2">
            <span className="text-sda-text-secondary">Last Updated:</span>
            <span className="ml-1 text-sda-text-primary">N/A</span>
          </div>
        </div>
      </div>
    </Card>
  );
}
