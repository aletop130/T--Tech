'use client';

import { Card, Elevation, Tag, Icon, Button } from '@blueprintjs/core';
import { GroundStation } from '@/lib/api';

interface GroundStationInfoCardProps {
  station: GroundStation;
  onClose?: () => void;
}

export function GroundStationInfoCard({ station, onClose }: GroundStationInfoCardProps) {
  return (
    <Card elevation={Elevation.TWO} className="absolute left-[310px] top-32 bottom-4 w-80 z-10 glass-panel pointer-events-auto">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Icon icon="globe" className="text-sda-accent-cyan" />
          <h3 className="text-lg font-semibold text-sda-text-primary">{station.name}</h3>
        </div>
        {onClose && (
          <Button minimal small icon="cross" onClick={onClose} />
        )}
      </div>

      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div>
            <span className="text-sda-text-secondary">Code:</span>
            <span className="ml-1 text-sda-text-primary font-medium">{station.code || 'N/A'}</span>
          </div>
          <div>
            <span className="text-sda-text-secondary">Status:</span>
            <Tag
              minimal
              intent={station.is_operational ? 'success' : 'danger'}
              className="ml-1"
            >
              {station.is_operational ? 'Operational' : 'Offline'}
            </Tag>
          </div>
          <div>
            <span className="text-sda-text-secondary">Country:</span>
            <span className="ml-1 text-sda-text-primary">{station.country}</span>
          </div>
          {station.latitude && station.longitude && (
            <div className="col-span-2">
              <span className="text-sda-text-secondary">Location:</span>
              <span className="ml-1 text-sda-text-primary">
                {station.latitude.toFixed(4)}°, {station.longitude.toFixed(4)}°
              </span>
            </div>
          )}
          {station.elevation_m && (
            <div>
              <span className="text-sda-text-secondary">Elevation:</span>
              <span className="ml-1 text-sda-text-primary">{station.elevation_m} m</span>
            </div>
          )}
        </div>

        {station.description && (
          <div className="border-t border-sda-border-default pt-3">
            <p className="text-sm text-sda-text-secondary">{station.description}</p>
          </div>
        )}
      </div>
    </Card>
  );
}
