'use client';

import { ItalyBigBrotherStats } from '@/lib/api';

interface Props {
  stats: ItalyBigBrotherStats;
}

const CATEGORY_ICONS: Record<string, string> = {
  TV_BROADCASTING: '📺',
  NAVIGATION: '🧭',
  EARTH_OBSERVATION: '🌍',
  DEFENSE: '🛡️',
  METEO: '🌤️',
  MARITIME: '⚓',
  AGRICULTURE: '🌾',
  TELECOM: '📡',
  FINANCE: '💰',
  ENERGY: '⚡',
  TRANSPORT: '✈️',
  SCIENCE: '🔬',
  EMERGENCY: '🆘',
  IOT: '📟',
  GEODESY: '🗺️',
};

const CATEGORY_LABELS: Record<string, string> = {
  TV_BROADCASTING: 'TV & Broadcasting',
  NAVIGATION: 'Navigazione GNSS',
  EARTH_OBSERVATION: 'Osservazione Terra',
  DEFENSE: 'Difesa & Sicurezza',
  METEO: 'Meteo & Clima',
  MARITIME: 'Marittimo',
  AGRICULTURE: 'Agricoltura',
  TELECOM: 'Telecomunicazioni',
  FINANCE: 'Finanza & Timing',
  ENERGY: 'Energia',
  TRANSPORT: 'Trasporti',
  SCIENCE: 'Ricerca Scientifica',
  EMERGENCY: 'Emergenze & SAR',
  IOT: 'Internet of Things',
  GEODESY: 'Cartografia & Geodesia',
};

function formatBig(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(0)}K`;
  return n.toString();
}

export function ItalyStatsPanel({ stats }: Props) {
  const topCategories = Object.entries(stats.by_category)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 8);

  return (
    <div className="flex flex-col gap-3 p-4">
      {/* Live indicator */}
      <div className="flex items-center gap-2">
        <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
        <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: '#ef4444' }}>
          Aggiornamento live
        </span>
      </div>

      {/* Main stats */}
      <div className="grid grid-cols-2 gap-2">
        <div className="p-3 rounded-lg text-center" style={{ background: 'rgba(56,189,248,0.08)', border: '1px solid rgba(56,189,248,0.2)' }}>
          <div className="text-2xl font-mono font-bold" style={{ color: '#38bdf8' }}>
            {stats.total_satellites_over_italy}
          </div>
          <div className="text-[9px] mt-0.5" style={{ color: 'var(--sda-text-secondary)' }}>SAT SOPRA ITALIA</div>
        </div>
        <div className="p-3 rounded-lg text-center" style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)' }}>
          <div className="text-2xl font-mono font-bold" style={{ color: '#22c55e' }}>
            {stats.italian_satellites}
          </div>
          <div className="text-[9px] mt-0.5" style={{ color: 'var(--sda-text-secondary)' }}>🇮🇹 ITALIANI</div>
        </div>
        <div className="p-3 rounded-lg text-center" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
          <div className="text-2xl font-mono font-bold" style={{ color: '#ef4444' }}>
            {stats.critical_satellites}
          </div>
          <div className="text-[9px] mt-0.5" style={{ color: 'var(--sda-text-secondary)' }}>CRITICI</div>
        </div>
        <div className="p-3 rounded-lg text-center" style={{ background: 'rgba(251,146,60,0.08)', border: '1px solid rgba(251,146,60,0.2)' }}>
          <div className="text-2xl font-mono font-bold" style={{ color: '#fb923c' }}>
            {formatBig(stats.total_beneficiaries)}
          </div>
          <div className="text-[9px] mt-0.5" style={{ color: 'var(--sda-text-secondary)' }}>BENEFICIARI IT</div>
        </div>
      </div>

      {/* Category breakdown */}
      <div>
        <h4 className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--sda-text-secondary)' }}>
          Servizi per categoria
        </h4>
        <div className="flex flex-col gap-1">
          {topCategories.map(([cat, count]) => (
            <div key={cat} className="flex items-center gap-2 py-1">
              <span className="text-base w-5 text-center">{CATEGORY_ICONS[cat] || '📡'}</span>
              <span className="text-xs flex-1 truncate" style={{ color: 'var(--sda-text-primary)' }}>
                {CATEGORY_LABELS[cat] || cat}
              </span>
              <span className="text-xs font-mono font-semibold px-1.5 py-0.5 rounded" style={{ background: 'rgba(255,255,255,0.08)', color: 'var(--sda-text-primary)' }}>
                {count}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Impact banner */}
      <div className="p-3 rounded-lg" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
        <p className="text-[10px] leading-relaxed" style={{ color: 'var(--sda-text-secondary)' }}>
          🔥 <strong style={{ color: 'var(--sda-text-primary)' }}>Big Brother Italia</strong> monitora in tempo reale
          tutti i satelliti sopra il territorio italiano e mappa i servizi critici da essi dipendenti.
        </p>
      </div>

      {/* Timestamp */}
      <p className="text-[9px] text-center" style={{ color: 'var(--sda-text-tertiary, #475569)' }}>
        Ultimo aggiornamento: {new Date(stats.timestamp).toLocaleTimeString('it-IT')}
      </p>
    </div>
  );
}
