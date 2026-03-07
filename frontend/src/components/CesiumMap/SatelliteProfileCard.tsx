'use client';

import { useEffect, useState } from 'react';
import { Card, Elevation, Tag, Icon, Button, Spinner, Divider, HTMLTable } from '@blueprintjs/core';
import { api, SatelliteProfile } from '@/lib/api';

interface SatelliteProfileCardProps {
  noradId: number;
  onClose?: () => void;
}

function formatFreq(hz: number | undefined | null): string {
  if (!hz) return '—';
  if (hz >= 1e9) return `${(hz / 1e9).toFixed(3)} GHz`;
  if (hz >= 1e6) return `${(hz / 1e6).toFixed(3)} MHz`;
  if (hz >= 1e3) return `${(hz / 1e3).toFixed(1)} kHz`;
  return `${hz} Hz`;
}

function factionIntent(faction?: string): 'success' | 'danger' | 'none' {
  if (faction === 'allied') return 'success';
  if (faction === 'enemy') return 'danger';
  return 'none';
}

export function SatelliteProfileCard({ noradId, onClose }: SatelliteProfileCardProps) {
  const [profile, setProfile] = useState<SatelliteProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    api.getSatelliteProfile(noradId)
      .then((data) => { if (!cancelled) setProfile(data); })
      .catch((e) => { if (!cancelled) setError(e.message || 'Failed to load profile'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [noradId]);

  return (
    <Card
      elevation={Elevation.TWO}
      className="absolute left-[310px] top-32 bottom-4 w-96 z-10 glass-panel pointer-events-auto overflow-y-auto"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Icon icon="satellite" className="text-sda-accent-cyan" />
          <h3 className="text-lg font-semibold text-sda-text-primary">
            {profile?.name || `NORAD ${noradId}`}
          </h3>
        </div>
        {onClose && <Button minimal small icon="cross" onClick={onClose} />}
      </div>

      {loading && (
        <div className="flex items-center justify-center py-8">
          <Spinner size={32} />
        </div>
      )}

      {error && (
        <div className="text-red-400 text-sm py-4">{error}</div>
      )}

      {profile && !loading && (
        <div className="space-y-3 text-sm">
          {/* Identity Section */}
          <div>
            <h4 className="text-xs font-semibold text-sda-text-secondary uppercase tracking-wider mb-2 flex items-center gap-1">
              <Icon icon="id-number" size={12} /> Identity
            </h4>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <span className="text-sda-text-secondary">NORAD ID:</span>
                <span className="ml-1 text-sda-text-primary font-mono">{profile.norad_id}</span>
              </div>
              {profile.international_designator && (
                <div>
                  <span className="text-sda-text-secondary">COSPAR:</span>
                  <span className="ml-1 text-sda-text-primary font-mono">{profile.international_designator}</span>
                </div>
              )}
              {profile.country && (
                <div>
                  <span className="text-sda-text-secondary">Country:</span>
                  <span className="ml-1 text-sda-text-primary">{profile.country}</span>
                </div>
              )}
              {profile.operator && (
                <div>
                  <span className="text-sda-text-secondary">Operator:</span>
                  <span className="ml-1 text-sda-text-primary">{profile.operator}</span>
                </div>
              )}
              {profile.object_type && (
                <div>
                  <span className="text-sda-text-secondary">Type:</span>
                  <span className="ml-1 text-sda-text-primary">{profile.object_type}</span>
                </div>
              )}
              {profile.purpose && (
                <div className="col-span-2">
                  <span className="text-sda-text-secondary">Purpose:</span>
                  <span className="ml-1 text-sda-text-primary">{profile.purpose}</span>
                </div>
              )}
            </div>
            <div className="flex gap-2 mt-2">
              <Tag minimal intent={profile.is_active ? 'success' : 'danger'}>
                {profile.is_active ? 'Active' : 'Inactive'}
              </Tag>
              {profile.faction && (
                <Tag minimal intent={factionIntent(profile.faction)}>
                  {profile.faction.toUpperCase()}
                </Tag>
              )}
            </div>
          </div>

          <Divider />

          {/* Orbit Section */}
          <div>
            <h4 className="text-xs font-semibold text-sda-text-secondary uppercase tracking-wider mb-2 flex items-center gap-1">
              <Icon icon="path" size={12} /> Orbit
            </h4>
            {profile.orbit ? (
              <div className="space-y-2">
                {profile.orbit.orbit_type && (
                  <Tag intent="primary" minimal>{profile.orbit.orbit_type}</Tag>
                )}
                <div className="grid grid-cols-2 gap-2">
                  {profile.orbit.apogee_km != null && (
                    <div className="bg-sda-bg-secondary p-2 rounded">
                      <span className="text-sda-text-secondary block text-xs">Apogee</span>
                      <span className="text-sda-text-primary font-mono">{profile.orbit.apogee_km.toFixed(1)} km</span>
                    </div>
                  )}
                  {profile.orbit.perigee_km != null && (
                    <div className="bg-sda-bg-secondary p-2 rounded">
                      <span className="text-sda-text-secondary block text-xs">Perigee</span>
                      <span className="text-sda-text-primary font-mono">{profile.orbit.perigee_km.toFixed(1)} km</span>
                    </div>
                  )}
                  {profile.orbit.inclination_deg != null && (
                    <div className="bg-sda-bg-secondary p-2 rounded">
                      <span className="text-sda-text-secondary block text-xs">Inclination</span>
                      <span className="text-sda-text-primary font-mono">{profile.orbit.inclination_deg.toFixed(4)}&deg;</span>
                    </div>
                  )}
                  {profile.orbit.period_minutes != null && (
                    <div className="bg-sda-bg-secondary p-2 rounded">
                      <span className="text-sda-text-secondary block text-xs">Period</span>
                      <span className="text-sda-text-primary font-mono">{profile.orbit.period_minutes.toFixed(1)} min</span>
                    </div>
                  )}
                  {profile.orbit.eccentricity != null && (
                    <div className="bg-sda-bg-secondary p-2 rounded">
                      <span className="text-sda-text-secondary block text-xs">Eccentricity</span>
                      <span className="text-sda-text-primary font-mono">{profile.orbit.eccentricity.toFixed(7)}</span>
                    </div>
                  )}
                  {profile.orbit.mean_motion_rev_day != null && (
                    <div className="bg-sda-bg-secondary p-2 rounded">
                      <span className="text-sda-text-secondary block text-xs">Mean Motion</span>
                      <span className="text-sda-text-primary font-mono">{profile.orbit.mean_motion_rev_day.toFixed(4)} rev/d</span>
                    </div>
                  )}
                </div>
                {profile.orbit.epoch && (
                  <div className="text-xs text-sda-text-muted">
                    Epoch: {new Date(profile.orbit.epoch).toLocaleString()}
                  </div>
                )}
              </div>
            ) : (
              <div className="text-sda-text-muted italic">No orbital data available</div>
            )}
          </div>

          {/* RF / Transmitters Section */}
          {profile.transmitters.length > 0 && (
            <>
              <Divider />
              <div>
                <h4 className="text-xs font-semibold text-sda-text-secondary uppercase tracking-wider mb-2 flex items-center gap-1">
                  <Icon icon="cell-tower" size={12} /> RF Transmitters ({profile.transmitters.length})
                </h4>
                <div className="max-h-48 overflow-y-auto">
                  <HTMLTable compact striped className="w-full text-xs">
                    <thead>
                      <tr>
                        <th className="text-sda-text-secondary">Description</th>
                        <th className="text-sda-text-secondary">Downlink</th>
                        <th className="text-sda-text-secondary">Mode</th>
                        <th className="text-sda-text-secondary">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {profile.transmitters.map((tx, i) => (
                        <tr key={tx.uuid || i}>
                          <td className="text-sda-text-primary">{tx.description || '—'}</td>
                          <td className="font-mono text-sda-text-primary">{formatFreq(tx.downlink_low)}</td>
                          <td className="text-sda-text-primary">{tx.mode || '—'}</td>
                          <td>
                            <Tag
                              minimal
                              intent={tx.alive ? 'success' : 'danger'}
                              className="text-[10px]"
                            >
                              {tx.alive ? 'ACTIVE' : 'DEAD'}
                            </Tag>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </HTMLTable>
                </div>
              </div>
            </>
          )}

          <Divider />

          {/* Sources */}
          <div>
            <h4 className="text-xs font-semibold text-sda-text-secondary uppercase tracking-wider mb-1">
              Data Sources
            </h4>
            <div className="flex flex-wrap gap-1">
              {profile.sources.map((src) => (
                <Tag key={src} minimal round className="text-[10px]">
                  {src}
                </Tag>
              ))}
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
