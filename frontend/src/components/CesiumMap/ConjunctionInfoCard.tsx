'use client';

import { Card, Elevation, Tag, Icon, Button } from '@blueprintjs/core';
import { ConjunctionEvent } from '@/lib/api';

interface ConjunctionInfoCardProps {
  conjunction: ConjunctionEvent;
  onClose?: () => void;
}

export function ConjunctionInfoCard({ conjunction, onClose }: ConjunctionInfoCardProps) {
  return (
    <Card elevation={Elevation.TWO} className="absolute left-[310px] top-32 bottom-4 w-80 z-10 glass-panel pointer-events-auto">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Icon icon="warning-sign" className={conjunction.risk_level === 'critical' || conjunction.risk_level === 'high' ? 'text-red-500' : 'text-orange-500'} />
          <h3 className="text-lg font-semibold text-sda-text-primary">Conjunction Alert</h3>
        </div>
        {onClose && (
          <Button minimal small icon="cross" onClick={onClose} />
        )}
      </div>

      <div className="space-y-3">
        <div className="flex items-center gap-2 mb-2">
          <Tag
            intent={
              conjunction.risk_level === 'critical' ? 'danger' :
              conjunction.risk_level === 'high' ? 'danger' :
              conjunction.risk_level === 'medium' ? 'warning' : 'none'
            }
            large
          >
            {conjunction.risk_level?.toUpperCase()} RISK
          </Tag>
        </div>

        <div className="grid grid-cols-1 gap-2 text-sm">
          <div className="bg-sda-bg-secondary p-2 rounded">
            <span className="text-sda-text-secondary block">Miss Distance</span>
            <span className="text-sda-text-primary font-mono text-lg">
              {conjunction.miss_distance_km?.toFixed(2)} km
            </span>
          </div>

          <div className="bg-sda-bg-secondary p-2 rounded">
            <span className="text-sda-text-secondary block">Time of Closest Approach</span>
            <span className="text-sda-text-primary font-mono">
              {conjunction.tca ? new Date(conjunction.tca).toLocaleString() : 'N/A'}
            </span>
          </div>

          <div className="bg-sda-bg-secondary p-2 rounded">
            <span className="text-sda-text-secondary block">Relative Velocity</span>
            <span className="text-sda-text-primary font-mono">
              {'N/A'} km/s
            </span>
          </div>
        </div>

        <div className="border-t border-sda-border-default pt-3">
          <h4 className="text-sm font-semibold text-sda-text-primary mb-2">Objects Involved</h4>
          <div className="space-y-2">
            {conjunction.object1_name && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-sda-text-secondary">Object 1:</span>
                <span className="text-sda-text-primary font-medium">{conjunction.object1_name}</span>
              </div>
            )}
            {conjunction.object2_name && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-sda-text-secondary">Object 2:</span>
                <span className="text-sda-text-primary font-medium">{conjunction.object2_name}</span>
              </div>
            )}
          </div>
        </div>

        {conjunction.collision_probability && (
          <div className="border-t border-sda-border-default pt-3">
            <div className="flex items-center justify-between">
              <span className="text-sda-text-secondary text-sm">Collision Probability:</span>
              <Tag
                intent={
                  conjunction.collision_probability > 1e-4 ? 'danger' :
                  conjunction.collision_probability > 1e-6 ? 'warning' : 'success'
                }
              >
                {(conjunction.collision_probability * 100).toExponential(2)}%
              </Tag>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}
