'use client';

import { useState, useCallback } from 'react';
import useSWR from 'swr';
import { api, SatelliteOverItaly, ItalyBigBrotherResponse } from '@/lib/api';
import { SatelliteListPanel } from '@/components/ItalyBigBrother/SatelliteListPanel';
import { DependencyCard } from '@/components/ItalyBigBrother/DependencyCard';
import { ItalyCesiumMap } from '@/components/ItalyBigBrother/ItalyCesiumMap';

export default function ItalyBigBrotherPage() {
  const [selectedSatellite, setSelectedSatellite] = useState<SatelliteOverItaly | null>(null);

  const { data, error, isLoading, mutate } = useSWR<ItalyBigBrotherResponse>(
    'italy-satellites',
    () => api.getItalySatellites(false),
    { refreshInterval: 120_000, revalidateOnFocus: false }
  );

  const handleSelectSatellite = useCallback((sat: SatelliteOverItaly) => {
    setSelectedSatellite(sat);
  }, []);

  const handleDeselect = useCallback(() => {
    setSelectedSatellite(null);
  }, []);

  return (
    <div className="flex flex-col h-full overflow-hidden"
         style={{ background: 'var(--sda-bg-primary, #0a0f1a)' }}>

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-5 py-2.5 border-b shrink-0"
           style={{ borderColor: 'var(--sda-border-default)' }}>
        <div className="flex items-center gap-3">
          <h1 className="text-sm font-bold tracking-widest uppercase font-mono"
              style={{ color: 'var(--sda-text-primary)' }}>
            Satellite Coverage — Italy
          </h1>
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded"
               style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.28)' }}>
            <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
            <span className="text-[9px] font-bold tracking-widest font-mono" style={{ color: '#ef4444' }}>LIVE</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {data && (
            <span className="text-[10px] font-mono" style={{ color: 'var(--sda-text-secondary)' }}>
              <span className="font-bold" style={{ color: '#38bdf8' }}>
                {data.satellites.length}
              </span>{' '}assets in coverage zone
            </span>
          )}
          <button
            onClick={() => mutate()}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-[10px] font-mono font-semibold tracking-wider uppercase disabled:opacity-50"
            style={{ background: 'rgba(56,189,248,0.06)', border: '1px solid rgba(56,189,248,0.22)', color: '#38bdf8' }}
          >
            {isLoading ? (
              <>
                <div className="w-3 h-3 border rounded-full animate-spin"
                     style={{ borderColor: '#38bdf8', borderTopColor: 'transparent' }} />
                Updating
              </>
            ) : 'Refresh'}
          </button>
        </div>
      </div>

      {error && (
        <div className="mx-4 mt-2 p-2.5 rounded text-[10px] font-mono"
             style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.28)', color: '#ef4444' }}>
          ERROR — {error.message}
        </div>
      )}

      {/* ── Body ────────────────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── LIST COLUMN (w-[20%]) ──────────────────────────────────────── */}
        <div className="shrink-0 flex flex-col border-r overflow-hidden"
             style={{
               width: '20%',
               borderColor: 'var(--sda-border-default)',
             }}>

          {/* compact stats */}
          {data && (
            <div className="grid grid-cols-4 gap-px shrink-0"
                 style={{ background: 'var(--sda-border-default)' }}>
              {[
                { value: data.stats.total_satellites_over_italy, label: 'IN TRANSIT',    color: '#38bdf8' },
                { value: data.stats.italian_satellites,          label: 'IT ASSETS',     color: '#22c55e' },
                { value: data.stats.critical_satellites,         label: 'CRITICAL',      color: '#ef4444' },
                {
                  value: data.stats.total_beneficiaries >= 1_000_000
                    ? `${(data.stats.total_beneficiaries / 1_000_000).toFixed(0)}M`
                    : `${Math.round(data.stats.total_beneficiaries / 1000)}K`,
                  label: 'BENEFICIARIES',
                  color: '#fb923c',
                },
              ].map(({ value, label, color }) => (
                <div key={label} className="flex flex-col items-center py-2"
                     style={{ background: 'var(--sda-bg-primary)' }}>
                  <span className="text-base font-mono font-bold leading-none" style={{ color }}>
                    {value}
                  </span>
                  <span className="text-[8px] mt-0.5 font-mono tracking-widest" style={{ color: 'var(--sda-text-secondary)' }}>
                    {label}
                  </span>
                </div>
              ))}
            </div>
          )}

          <SatelliteListPanel
            satellites={data?.satellites ?? []}
            selectedNoradId={selectedSatellite?.norad_id}
            onSelect={handleSelectSatellite}
            loading={isLoading}
          />
        </div>

        {/* ── DETAIL COLUMN — always visible (w-[40%]) ───────────────────── */}
        <div className="shrink-0 flex flex-col border-r overflow-hidden"
             style={{ width: '40%', borderColor: 'var(--sda-border-default)' }}>

          {/* header */}
          <div className="flex items-center justify-between px-3 py-1.5 shrink-0 border-b"
               style={{ borderColor: 'var(--sda-border-default)', background: 'rgba(255,255,255,0.02)' }}>
            <span className="text-[9px] font-mono font-semibold uppercase tracking-widest"
                  style={{ color: 'var(--sda-text-secondary)' }}>
              Dependency Analysis
            </span>
            {selectedSatellite && (
              <button
                onClick={handleDeselect}
                className="text-[9px] font-mono px-2 py-0.5 rounded tracking-wider uppercase hover:bg-white/10 transition-colors"
                style={{ color: 'var(--sda-text-secondary)' }}
              >
                Clear
              </button>
            )}
          </div>

          <div className="flex-1 overflow-hidden">
            {selectedSatellite ? (
              <DependencyCard satellite={selectedSatellite} />
            ) : (
              <div className="flex flex-col items-center justify-center h-full gap-3"
                   style={{ color: 'var(--sda-text-secondary)' }}>
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.35 }}>
                  <circle cx="12" cy="12" r="10" />
                  <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                  <line x1="2" y1="12" x2="22" y2="12" />
                </svg>
                <span className="text-[11px] font-mono tracking-wide">Nessun satellite selezionato</span>
                <span className="text-[9px] font-mono tracking-wider" style={{ opacity: 0.5 }}>
                  Seleziona un asset dalla lista
                </span>
              </div>
            )}
          </div>
        </div>

        {/* ── MAP COLUMN (w-[40%]) ──────────────────────────────────────── */}
        <div className="flex-1 overflow-hidden relative">
          <ItalyCesiumMap
            satellites={data?.satellites ?? []}
            selectedNoradId={selectedSatellite?.norad_id}
            onSelect={handleSelectSatellite}
          />
        </div>
      </div>
    </div>
  );
}
