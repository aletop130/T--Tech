'use client';

import { Card, Elevation, Tag, Icon, Button } from '@blueprintjs/core';
import { PositionReport } from '@/lib/api';

interface GroundVehicleInfoCardProps {
  vehicle: PositionReport;
  onClose?: () => void;
}

export function GroundVehicleInfoCard({ vehicle, onClose }: GroundVehicleInfoCardProps) {
  return (
    <Card elevation={Elevation.TWO} className="absolute left-[310px] top-32 bottom-4 w-80 z-10 glass-panel pointer-events-auto">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Icon icon="truck" className="text-sda-accent-cyan" />
          <h3 className="text-lg font-semibold text-sda-text-primary">{vehicle.entity_id}</h3>
        </div>
        {onClose && (
          <Button minimal small icon="cross" onClick={onClose} />
        )}
      </div>

      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div>
            <span className="text-sda-text-secondary">ID:</span>
            <span className="ml-1 text-sda-text-primary font-medium">{vehicle.id}</span>
          </div>
          <div>
            <span className="text-sda-text-secondary">Type:</span>
            <Tag intent="warning" minimal className="ml-1">
              {vehicle.entity_type || 'Ground Vehicle'}
            </Tag>
          </div>
          <div className="col-span-2">
            <span className="text-sda-text-secondary">Position:</span>
            <div className="text-sda-text-primary mt-1">
              <div>Lat: {vehicle.latitude?.toFixed(6)}°</div>
              <div>Lon: {vehicle.longitude?.toFixed(6)}°</div>
              {vehicle.altitude_m !== undefined && (
                <div>Alt: {vehicle.altitude_m.toFixed(1)} m</div>
              )}
            </div>
          </div>
          <div>
            <span className="text-sda-text-secondary">Heading:</span>
            <span className="ml-1 text-sda-text-primary">{vehicle.heading_deg?.toFixed(1)}°</span>
          </div>
          <div>
            <span className="text-sda-text-secondary">Speed:</span>
            <span className="ml-1 text-sda-text-primary">
              {vehicle.velocity_magnitude_ms?.toFixed(1) || 'N/A'} m/s
            </span>
          </div>
          {vehicle.timestamp && (
            <div className="col-span-2">
              <span className="text-sda-text-secondary">Last Update:</span>
              <span className="ml-1 text-sda-text-primary">
                {new Date(vehicle.timestamp).toLocaleString()}
              </span>
            </div>
          )}
        </div>

        {vehicle.source && (
          <div className="border-t border-sda-border-default pt-3">
            <span className="text-sda-text-secondary text-sm">Source:</span>
            <span className="ml-1 text-sda-text-primary text-sm">{vehicle.source}</span>
          </div>
        )}
      </div>
    </Card>
  );
}
