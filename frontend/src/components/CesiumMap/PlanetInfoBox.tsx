import { Card, Elevation, Button, Tag, Icon, Intent } from '@blueprintjs/core';
import type { CelestialBody } from '@/lib/solarSystem/data';

interface PlanetInfoBoxProps {
  planet: CelestialBody;
  onManage: () => void;
  onClose: () => void;
  onBackToOverview: () => void;
}

export function PlanetInfoBox({ planet, onManage, onClose, onBackToOverview }: PlanetInfoBoxProps) {
  return (
    <div
      style={{
        position: 'absolute',
        top: '20px',
        left: '20px',
        zIndex: 1000,
        maxWidth: '320px',
      }}
    >
      <Card elevation={Elevation.THREE} className="glass-panel border border-sda-border-default">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2">
            <div
              className="w-6 h-6 rounded-full"
              style={{ backgroundColor: planet.color }}
            />
            <h3 className="text-lg font-bold text-sda-text-primary m-0">{planet.name}</h3>
          </div>
          <Button
            icon="cross"
            minimal
            small
            onClick={onClose}
            className="text-sda-text-muted hover:text-sda-text-primary"
          />
        </div>

        <div className="space-y-2 mb-4">
          <div className="flex justify-between text-sm">
            <span className="text-sda-text-muted">Radius:</span>
            <span className="text-sda-text-primary font-medium">{planet.radiusKm.toLocaleString()} km</span>
          </div>
          {planet.distanceAU !== undefined && planet.distanceAU > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-sda-text-muted">Distance from Sun:</span>
              <span className="text-sda-text-primary font-medium">{planet.distanceAU.toFixed(2)} AU</span>
            </div>
          )}
          <div className="flex justify-between text-sm">
            <span className="text-sda-text-muted">Orbital Period:</span>
            <span className="text-sda-text-primary font-medium">
              {planet.orbitalPeriodDays > 0 ? `${planet.orbitalPeriodDays.toLocaleString()} days` : 'N/A'}
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-sda-text-muted">Type:</span>
            <Tag minimal intent={Intent.NONE} className="text-xs">
              {planet.type.charAt(0).toUpperCase() + planet.type.slice(1).replace('_', ' ')}
            </Tag>
          </div>
        </div>

        <p className="text-sm text-sda-text-secondary mb-4" style={{ lineHeight: 1.4 }}>
          {planet.description}
        </p>

        <div className="flex gap-2">
          <Button
            intent={Intent.PRIMARY}
            icon="cog"
            onClick={onManage}
            className="flex-1"
          >
            Manage
          </Button>
          <Button
            intent={Intent.NONE}
            icon="zoom-out"
            onClick={onBackToOverview}
            className="flex-1"
          >
            Back to Overview
          </Button>
        </div>
      </Card>
    </div>
  );
}
