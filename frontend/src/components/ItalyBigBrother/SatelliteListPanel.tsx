'use client';

import { SatelliteOverItaly } from '@/lib/api';

interface Props {
  satellites: SatelliteOverItaly[];
  selectedNoradId?: number;
  onSelect: (sat: SatelliteOverItaly) => void;
  loading: boolean;
}

const ORBIT_COLORS: Record<string, string> = {
  LEO: '#38bdf8',
  MEO: '#818cf8',
  GEO: '#fb923c',
};

const CRITICALITY_DOT: Record<string, string> = {
  CRITICAL: '🔴',
  HIGH:     '🟠',
  MEDIUM:   '🟡',
  LOW:      '🟢',
};

export function SatelliteListPanel({ satellites, selectedNoradId, onSelect, loading }: Props) {
  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex flex-col items-center gap-3">
          <div className="w-7 h-7 border-2 rounded-full animate-spin"
               style={{ borderColor: '#38bdf8', borderTopColor: 'transparent' }} />
          <p className="text-[10px] uppercase tracking-widest font-mono"
             style={{ color: 'var(--sda-text-secondary)' }}>
            Propagating orbits...
          </p>
        </div>
      </div>
    );
  }

  if (satellites.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-xs uppercase tracking-wider font-mono"
           style={{ color: 'var(--sda-text-secondary)' }}>
          No assets detected
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* header */}
      <div className="px-3 py-1.5 border-b shrink-0"
           style={{ borderColor: 'var(--sda-border-default)' }}>
        <p className="text-[9px] uppercase tracking-widest font-mono font-semibold"
           style={{ color: 'var(--sda-text-secondary)' }}>
          {satellites.length} assets in coverage zone — select for analysis
        </p>
      </div>

      {/* list */}
      <div className="flex-1 overflow-y-auto py-1 px-2">
        {satellites.map((sat) => {
          const isSelected = sat.norad_id === selectedNoradId;
          const orbitColor = ORBIT_COLORS[sat.orbit_type] || '#94a3b8';
          const topCriticality: string | null = sat.italian_services.length > 0
            ? sat.italian_services.reduce((acc, s) => {
                const order: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
                return (order[s.criticality] ?? 4) < (order[acc] ?? 4) ? s.criticality : acc;
              }, 'LOW')
            : null;

          return (
            <button
              key={sat.norad_id}
              onClick={() => onSelect(sat)}
              className="w-full text-left p-2.5 rounded mb-0.5 transition-all"
              style={{
                background: isSelected ? 'rgba(56,189,248,0.08)' : 'transparent',
                border: `1px solid ${isSelected ? 'rgba(56,189,248,0.35)' : 'transparent'}`,
              }}
            >
              <div className="flex items-center gap-2 min-w-0">
                {/* Italian flag or sat icon */}
                <span className="text-sm shrink-0">
                  {sat.is_italian ? '🇮🇹' : '·'}
                </span>

                {/* name + badges */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="text-[11px] font-mono font-semibold truncate"
                          style={{ color: isSelected ? '#38bdf8' : 'var(--sda-text-primary)' }}>
                      {sat.name}
                    </span>
                    <span className="text-[8px] font-mono px-1 py-px rounded shrink-0"
                          style={{ color: orbitColor, background: `${orbitColor}18` }}>
                      {sat.orbit_type}
                    </span>
                    {topCriticality && (
                      <span className="text-[9px] shrink-0 leading-none">
                        {CRITICALITY_DOT[topCriticality]}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-px">
                    <span className="text-[9px] font-mono"
                          style={{ color: 'var(--sda-text-secondary)' }}>
                      {sat.altitude.toFixed(0)} km
                    </span>
                    {sat.italian_services.length > 0 && (
                      <span className="text-[9px] font-mono"
                            style={{ color: 'var(--sda-text-secondary)' }}>
                        {sat.italian_services.length} dep.
                      </span>
                    )}
                    {sat.total_italian_beneficiaries > 0 && (
                      <span className="text-[9px] font-mono" style={{ color: '#38bdf8' }}>
                        {sat.total_italian_beneficiaries >= 1_000_000
                          ? `${(sat.total_italian_beneficiaries / 1_000_000).toFixed(0)}M`
                          : `${(sat.total_italian_beneficiaries / 1000).toFixed(0)}K`}
                      </span>
                    )}
                  </div>
                </div>

                {/* NORAD */}
                <span className="text-[8px] font-mono shrink-0"
                      style={{ color: 'var(--sda-text-tertiary, #475569)' }}>
                  {sat.norad_id}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
