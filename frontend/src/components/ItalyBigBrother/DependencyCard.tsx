'use client';

import { SatelliteOverItaly, ItalyServiceDependency } from '@/lib/api';
import { matchingStations, isVisible, gcDistance, type GroundStation } from './ItalyCesiumMap';

interface Props {
  satellite: SatelliteOverItaly;
}

const CRITICALITY_COLORS = {
  CRITICAL: '#ef4444',
  HIGH: '#f97316',
  MEDIUM: '#eab308',
  LOW: '#22c55e',
};

const CRITICALITY_BG = {
  CRITICAL: 'rgba(239,68,68,0.15)',
  HIGH: 'rgba(249,115,22,0.15)',
  MEDIUM: 'rgba(234,179,8,0.15)',
  LOW: 'rgba(34,197,94,0.15)',
};

const ORBIT_COLORS = {
  LEO: '#38bdf8',
  MEO: '#818cf8',
  GEO: '#fb923c',
};

function formatUsers(n: number): string {
  if (n === 0) return 'Classificato';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(0)}K`;
  return n.toString();
}

function ServiceRow({ svc }: { svc: ItalyServiceDependency }) {
  const color = CRITICALITY_COLORS[svc.criticality];
  const bg = CRITICALITY_BG[svc.criticality];
  return (
    <div className="flex items-start gap-3 p-3 rounded-lg mb-2" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
      <span className="text-xl mt-0.5">{svc.icon}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold" style={{ color: 'var(--sda-text-primary)' }}>{svc.name}</span>
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ color, background: bg }}>
            {svc.criticality}
          </span>
          {svc.italian_users > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ color: '#94a3b8', background: 'rgba(148,163,184,0.1)' }}>
              {formatUsers(svc.italian_users)} utenti
            </span>
          )}
        </div>
        <p className="text-xs mt-1 leading-relaxed" style={{ color: 'var(--sda-text-secondary)' }}>{svc.description}</p>
        <p className="text-[10px] mt-1" style={{ color: 'var(--sda-text-tertiary, #64748b)' }}>Provider: {svc.provider}</p>
      </div>
    </div>
  );
}

export function DependencyCard({ satellite }: Props) {
  const orbitColor = ORBIT_COLORS[satellite.orbit_type as keyof typeof ORBIT_COLORS] || '#94a3b8';
  const totalUsers = formatUsers(satellite.total_italian_beneficiaries);

  // Group services by category
  const byCategory: Record<string, ItalyServiceDependency[]> = {};
  for (const svc of satellite.italian_services) {
    if (!byCategory[svc.category]) byCategory[svc.category] = [];
    byCategory[svc.category].push(svc);
  }

  const activeTransmitters = satellite.transmitters?.filter(t => t.alive) ?? [];

  return (
    <div className="h-full overflow-y-auto" style={{ background: 'var(--sda-bg-secondary, #0f172a)' }}>
      {/* Header */}
      <div className="p-4 border-b" style={{ borderColor: 'var(--sda-border-default)' }}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base font-bold font-mono" style={{ color: 'var(--sda-text-primary)' }}>
                {satellite.name}
              </h2>
              {satellite.is_italian && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded" style={{ background: 'rgba(34,197,94,0.15)', color: '#22c55e' }}>
                  🇮🇹 ITALIANO
                </span>
              )}
              {satellite.is_critical && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded" style={{ background: 'rgba(239,68,68,0.15)', color: '#ef4444' }}>
                  CRITICO
                </span>
              )}
            </div>
            <p className="text-xs mt-0.5" style={{ color: 'var(--sda-text-secondary)' }}>
              NORAD {satellite.norad_id} {satellite.operator && `· ${satellite.operator}`} {satellite.constellation && `· ${satellite.constellation}`}
            </p>
          </div>
          <div className="text-right shrink-0">
            <div className="text-xs font-mono font-bold" style={{ color: orbitColor }}>{satellite.orbit_type}</div>
            <div className="text-xs font-mono" style={{ color: 'var(--sda-text-secondary)' }}>{satellite.altitude.toFixed(0)} km</div>
          </div>
        </div>

        {/* Metrics row */}
        <div className="grid grid-cols-4 gap-2 mt-3">
          {[
            { label: 'Lat', value: `${satellite.latitude.toFixed(2)}°` },
            { label: 'Lon', value: `${satellite.longitude.toFixed(2)}°` },
            { label: 'Footprint', value: `${satellite.footprint_radius_km.toFixed(0)} km` },
            { label: 'Servizi', value: satellite.italian_services.length.toString() },
          ].map(({ label, value }) => (
            <div key={label} className="text-center p-2 rounded" style={{ background: 'rgba(255,255,255,0.04)' }}>
              <div className="text-[10px]" style={{ color: 'var(--sda-text-secondary)' }}>{label}</div>
              <div className="text-xs font-mono font-semibold" style={{ color: 'var(--sda-text-primary)' }}>{value}</div>
            </div>
          ))}
        </div>

        {/* Impact summary */}
        {satellite.total_italian_beneficiaries > 0 && (
          <div className="mt-3 p-2 rounded" style={{ background: 'rgba(56,189,248,0.08)', border: '1px solid rgba(56,189,248,0.2)' }}>
            <p className="text-xs text-center" style={{ color: '#38bdf8' }}>
              📈 <strong>{totalUsers} cittadini italiani</strong> dipendono dai servizi di questo satellite
            </p>
          </div>
        )}
      </div>

      {/* Transmitters */}
      {activeTransmitters.length > 0 && (
        <div className="p-4 border-b" style={{ borderColor: 'var(--sda-border-default)' }}>
          <h3 className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--sda-text-secondary)' }}>
            📡 Frequenze attive
          </h3>
          <div className="flex flex-wrap gap-2">
            {activeTransmitters.map((t, i) => (
              <span key={i} className="text-[10px] font-mono px-2 py-1 rounded" style={{ background: 'rgba(167,139,250,0.15)', color: '#a78bfa' }}>
                {t.band || 'UNK'} {t.downlink_low ? `${(t.downlink_low / 1e6).toFixed(1)} MHz` : ''} {t.mode ? `(${t.mode})` : ''}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Connections */}
      {(() => {
        const stations = matchingStations(satellite).filter(gs => isVisible(satellite, gs));
        if (stations.length === 0) return null;
        return (
          <div className="p-4 border-b" style={{ borderColor: 'var(--sda-border-default)' }}>
            <h3 className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--sda-text-secondary)' }}>
              Connessioni Ground Station
            </h3>
            <div className="flex flex-col gap-2">
              {stations.map(gs => {
                const dist = gcDistance(satellite.latitude, satellite.longitude, gs.lat, gs.lon);
                return (
                  <div key={gs.id} className="flex items-center gap-3 p-2.5 rounded-lg"
                       style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <div className="w-2.5 h-2.5 rounded-full shrink-0 border"
                         style={{ background: gs.color, borderColor: 'rgba(255,255,255,0.3)' }} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold" style={{ color: 'var(--sda-text-primary)' }}>
                          {gs.shortName}
                        </span>
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded"
                              style={{ background: 'rgba(34,197,94,0.12)', color: '#22c55e' }}>
                          LINK
                        </span>
                      </div>
                      <p className="text-[10px] mt-0.5" style={{ color: 'var(--sda-text-secondary)' }}>
                        {gs.name} · {gs.operator}
                      </p>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="text-[9px] font-mono" style={{ color: 'var(--sda-text-tertiary, #64748b)' }}>
                          {dist.toFixed(0)} km
                        </span>
                        <div className="flex gap-1">
                          {gs.categories.map(cat => (
                            <span key={cat} className="text-[8px] font-mono px-1 py-0.5 rounded"
                                  style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--sda-text-secondary)' }}>
                              {cat}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* Services */}
      <div className="p-4">
        {satellite.italian_services.length === 0 ? (
          <p className="text-xs text-center py-6" style={{ color: 'var(--sda-text-secondary)' }}>
            Nessuna dipendenza italiana catalogata per questo satellite
          </p>
        ) : (
          <>
            <h3 className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--sda-text-secondary)' }}>
              🇮🇹 Servizi dipendenti in Italia
            </h3>
            {satellite.italian_services
              .sort((a, b) => {
                const order: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
                return (order[a.criticality] ?? 4) - (order[b.criticality] ?? 4);
              })
              .map((svc, i) => <ServiceRow key={i} svc={svc} />)
            }
          </>
        )}
      </div>
    </div>
  );
}
