'use client';

import { Card, Elevation, Tag, Icon, Button } from '@blueprintjs/core';
import { Satellite } from '@/lib/api';

interface OrbitData {
  satellite_id: string;
  positions: Array<{ lat: number; lon: number; alt: number; time: string }>;
  tle_line1?: string;
  tle_line2?: string;
  epoch?: string;
}

interface SatelliteInfoCardProps {
  satellite: Satellite;
  orbit?: OrbitData;
  onClose?: () => void;
  onManeuver?: () => void;
}

export function SatelliteInfoCard({ satellite, orbit, onClose, onManeuver }: SatelliteInfoCardProps) {
  // Parse TLE data if available
  const parseTLE = () => {
    if (!orbit?.tle_line1 || !orbit?.tle_line2) return null;
    
    const line1 = orbit.tle_line1;
    const line2 = orbit.tle_line2;
    
    // Parse TLE Line 1
    const noradId = line1.substring(2, 7).trim();
    const classification = line1.substring(7, 8) || 'U';
    const intlDesignator = line1.substring(9, 17).trim();
    const epochYear = line1.substring(18, 20);
    const epochDay = line1.substring(20, 32);
    const ndot = line1.substring(33, 43).trim();
    const nddot = line1.substring(44, 52).trim();
    const bstar = line1.substring(53, 61).trim();
    
    // Parse TLE Line 2
    const inclination = parseFloat(line2.substring(8, 16)).toFixed(4);
    const raan = parseFloat(line2.substring(17, 25)).toFixed(4);
    const eccentricity = '0.' + line2.substring(26, 33);
    const argPerigee = parseFloat(line2.substring(34, 42)).toFixed(4);
    const meanAnomaly = parseFloat(line2.substring(43, 51)).toFixed(4);
    const meanMotion = parseFloat(line2.substring(52, 63)).toFixed(8);
    const revNumber = line2.substring(63, 68).trim();
    
    // Calculate full epoch date
    const year = parseInt(epochYear);
    const fullYear = year < 57 ? 2000 + year : 1900 + year;
    const date = new Date(fullYear, 0, 1);
    date.setDate(date.getDate() + parseFloat(epochDay) - 1);
    
    return {
      noradId,
      classification,
      intlDesignator,
      epoch: date.toISOString(),
      epochDay,
      inclination,
      raan,
      eccentricity,
      argPerigee,
      meanAnomaly,
      meanMotion,
      revNumber,
      ndot,
      nddot,
      bstar,
    };
  };

  const tleData = parseTLE();

  return (
    <Card elevation={Elevation.TWO} className="absolute left-[310px] top-32 bottom-4 w-80 z-10 glass-panel pointer-events-auto">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Icon icon="satellite" className="text-sda-accent-cyan" />
          <h3 className="text-lg font-semibold text-sda-text-primary">{satellite.name}</h3>
        </div>
{onClose && (
            <Button minimal small icon="cross" onClick={onClose} />
          )}
          {onManeuver && (
            <Button minimal small icon="flash" intent="warning" onClick={onManeuver} title="Trigger maneuver animation" />
          )}
      </div>

      <div className="space-y-3">
        {/* Basic Info */}
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div>
            <span className="text-sda-text-secondary">NORAD ID:</span>
            <span className="ml-1 text-sda-text-primary font-medium">{satellite.norad_id}</span>
          </div>
          <div>
            <span className="text-sda-text-secondary">Type:</span>
            <span className="ml-1 text-sda-text-primary">{satellite.object_type}</span>
          </div>
          {satellite.country && (
            <div>
              <span className="text-sda-text-secondary">Country:</span>
              <span className="ml-1 text-sda-text-primary">{satellite.country}</span>
            </div>
          )}
          {satellite.operator && (
            <div>
              <span className="text-sda-text-secondary">Operator:</span>
              <span className="ml-1 text-sda-text-primary">{satellite.operator}</span>
            </div>
          )}
          <div>
            <span className="text-sda-text-secondary">Status:</span>
            <Tag 
              minimal 
              intent={satellite.is_active ? 'success' : 'danger'}
              className="ml-1"
            >
              {satellite.is_active ? 'Active' : 'Inactive'}
            </Tag>
          </div>
        </div>

        {/* TLE Data */}
        {tleData ? (
          <div className="border-t border-sda-border-default pt-3">
            <h4 className="text-sm font-semibold text-sda-text-primary mb-2 flex items-center gap-2">
              <Icon icon="document" className="text-sda-accent-cyan" size={14} />
              Orbital Elements (TLE)
            </h4>
            
            <div className="space-y-2 text-xs">
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-sda-bg-secondary p-2 rounded">
                  <span className="text-sda-text-secondary block">Inclination</span>
                  <span className="text-sda-text-primary font-mono">{tleData.inclination}°</span>
                </div>
                <div className="bg-sda-bg-secondary p-2 rounded">
                  <span className="text-sda-text-secondary block">Period</span>
                  <span className="text-sda-text-primary font-mono">
                    {(24 / parseFloat(tleData.meanMotion) * 60).toFixed(1)} min
                  </span>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-sda-bg-secondary p-2 rounded">
                  <span className="text-sda-text-secondary block">Eccentricity</span>
                  <span className="text-sda-text-primary font-mono">{tleData.eccentricity}</span>
                </div>
                <div className="bg-sda-bg-secondary p-2 rounded">
                  <span className="text-sda-text-secondary block">Mean Motion</span>
                  <span className="text-sda-text-primary font-mono">{tleData.meanMotion}</span>
                </div>
              </div>

              <div className="bg-sda-bg-secondary p-2 rounded">
                <span className="text-sda-text-secondary block">RAAN</span>
                <span className="text-sda-text-primary font-mono">{tleData.raan}°</span>
              </div>

              <div className="bg-sda-bg-secondary p-2 rounded">
                <span className="text-sda-text-secondary block">Argument of Perigee</span>
                <span className="text-sda-text-primary font-mono">{tleData.argPerigee}°</span>
              </div>

              <div className="bg-sda-bg-secondary p-2 rounded">
                <span className="text-sda-text-secondary block">Mean Anomaly</span>
                <span className="text-sda-text-primary font-mono">{tleData.meanAnomaly}°</span>
              </div>

              <div className="bg-sda-bg-secondary p-2 rounded">
                <span className="text-sda-text-secondary block">Epoch</span>
                <span className="text-sda-text-primary font-mono">
                  {new Date(tleData.epoch).toLocaleString()}
                </span>
              </div>

              <div className="bg-sda-bg-secondary p-2 rounded">
                <span className="text-sda-text-secondary block">Revolution #</span>
                <span className="text-sda-text-primary font-mono">{tleData.revNumber}</span>
              </div>

              {/* Raw TLE Lines */}
              <div className="mt-3 pt-2 border-t border-sda-border-default">
                <span className="text-sda-text-secondary block mb-1">Raw TLE:</span>
                <div className="font-mono text-[10px] text-sda-text-muted bg-sda-bg-tertiary p-2 rounded overflow-x-auto">
                  <div>{orbit?.tle_line1}</div>
                  <div>{orbit?.tle_line2}</div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="border-t border-sda-border-default pt-3">
            <div className="text-sm text-sda-text-muted italic">
              No TLE data available for this satellite
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}
