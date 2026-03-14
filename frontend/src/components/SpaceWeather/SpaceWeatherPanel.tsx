'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Icon, InputGroup, Spinner, Tag } from '@blueprintjs/core';
import {
  api,
  SpaceWeatherImpactResponse,
  SatelliteWeatherAnalysis,
  Satellite,
  DragImpactSatellite,
  KpTrendPoint,
  SolarWindData,
  ParsedAlert,
} from '@/lib/api';

const REFRESH_INTERVAL = 5 * 60 * 1000; // 5 min

/* ───────────────────── colour palette ───────────────────── */
const KP_COLORS = [
  '#3fb950', '#3fb950', '#84cc16', '#d29922', '#f59e0b',
  '#f97316', '#f85149', '#dc2626', '#b91c1c', '#991b1b',
];

const STORM_LABELS: Record<string, { label: string; color: string }> = {
  none:     { label: 'Quiete',            color: '#3fb950' },
  minor:    { label: 'G1 Minor Storm',    color: '#f59e0b' },
  moderate: { label: 'G2 Moderate Storm', color: '#f97316' },
  strong:   { label: 'G3 Strong Storm',   color: '#f85149' },
  severe:   { label: 'G4 Severe Storm',   color: '#dc2626' },
  extreme:  { label: 'G5 Extreme Storm',  color: '#991b1b' },
};

/* ───────────────────── helper fns ───────────────────── */
function fmtDate(iso: string) {
  try {
    const d = new Date(iso.replace('Z', '+00:00'));
    return d.toLocaleDateString('it-IT', { day: '2-digit', month: 'short', timeZone: 'UTC' }) + ' ' +
           d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }) + ' UTC';
  } catch { return iso; }
}

function kpColor(kp: number) {
  return KP_COLORS[Math.round(Math.min(9, Math.max(0, kp)))] || KP_COLORS[0];
}

function xrayLevel(cls: string | null): { label: string; color: string } {
  if (!cls) return { label: '--', color: '#6b7280' };
  const first = cls.charAt(0).toUpperCase();
  if (first === 'X') return { label: 'Estremo', color: '#f85149' };
  if (first === 'M') return { label: 'Alto', color: '#f97316' };
  if (first === 'C') return { label: 'Basso', color: '#d29922' };
  return { label: 'Minimo', color: '#3fb950' };
}

function protonLevel(flux: number | null): { label: string; color: string } {
  if (flux === null) return { label: '--', color: '#6b7280' };
  if (flux >= 10000) return { label: 'Estremo', color: '#f85149' };
  if (flux >= 1000) return { label: 'Elevato', color: '#f97316' };
  if (flux >= 100) return { label: 'Moderato', color: '#d29922' };
  return { label: 'Nominale', color: '#3fb950' };
}

function dstLevel(dst: number | null): { label: string; color: string } {
  if (dst === null) return { label: '--', color: '#6b7280' };
  if (dst <= -200) return { label: 'Severo', color: '#f85149' };
  if (dst <= -100) return { label: 'Intenso', color: '#f97316' };
  if (dst <= -50) return { label: 'Moderato', color: '#d29922' };
  return { label: 'Lieve', color: '#3fb950' };
}

function f107Level(v: number | null): { label: string; color: string } {
  if (v === null) return { label: '--', color: '#6b7280' };
  if (v > 200) return { label: 'Molto Alto', color: '#f85149' };
  if (v > 150) return { label: 'Alto', color: '#f97316' };
  if (v > 100) return { label: 'Moderato', color: '#d29922' };
  return { label: 'Basso', color: '#3fb950' };
}

function fmtSci(n: number | null): string {
  if (n === null) return '--';
  if (Math.abs(n) >= 10000 || (Math.abs(n) > 0 && Math.abs(n) < 0.01)) {
    return n.toExponential(1);
  }
  return n.toFixed(0);
}

/* ───────────────────── operational impact logic ───────────────────── */
interface ImpactRow { sistema: string; stato: string; color: string; dettaglio: string }

function computeImpact(kp: number, bz: number | null, xray: string | null, protonFlux: number | null): ImpactRow[] {
  const kpActive = kp >= 4;
  const bzNeg = bz !== null && bz < -5;
  const xHigh = xray ? 'MX'.includes(xray.charAt(0).toUpperCase()) : false;

  return [
    {
      sistema: 'Comm HF',
      stato: xHigh || kpActive ? 'Degradata' : 'Nominale',
      color: xHigh || kpActive ? '#d29922' : '#3fb950',
      dettaglio: xHigh || kpActive ? `MUF ~${Math.max(5, 30 - Math.round(kp * 3))}%` : 'Nessun impatto',
    },
    {
      sistema: 'Comm VHF/UHF',
      stato: kp >= 7 ? 'Degradata' : 'Nominale',
      color: kp >= 7 ? '#d29922' : '#3fb950',
      dettaglio: kp >= 7 ? 'Scintillazione polare' : 'Nessun impatto',
    },
    {
      sistema: 'GPS/GNSS',
      stato: kpActive || (protonFlux !== null && protonFlux > 100) ? 'Ridotta acc.' : 'Nominale',
      color: kpActive ? '#d29922' : '#3fb950',
      dettaglio: kpActive ? `\u00b1${Math.round(kp)}${kp >= 5 ? '-' + Math.round(kp * 2) : ''}m extra` : 'Nessun impatto',
    },
    {
      sistema: 'Drag LEO',
      stato: kpActive ? 'Elevato' : 'Nominale',
      color: kpActive ? '#f85149' : '#3fb950',
      dettaglio: kpActive ? `+${Math.round((kp - 3) * 4)}% densit\u00e0 atm.` : 'Nessun impatto',
    },
    {
      sistema: 'Radar SAR',
      stato: kp >= 7 || bzNeg ? 'Degradato' : 'Nominale',
      color: kp >= 7 ? '#d29922' : '#3fb950',
      dettaglio: kp >= 7 ? 'Ionosfera perturbata' : 'Non impattato',
    },
    {
      sistema: 'Sensori EO',
      stato: kp >= 8 ? 'Degradato' : 'Nominale',
      color: kp >= 8 ? '#d29922' : '#3fb950',
      dettaglio: kp >= 8 ? 'Particelle energetiche' : 'Non impattato',
    },
  ];
}

/* ═══════════════════════════════════════════════════════════
   SUB-COMPONENTS
   ═══════════════════════════════════════════════════════════ */

function KpiCard({
  value, unit, label, sublabel, subColor, large,
}: {
  value: string; unit?: string; label: string; sublabel: string; subColor: string; large?: boolean;
}) {
  return (
    <div className="flex flex-col items-center text-center px-2 py-3 rounded-lg border border-sda-border-default bg-sda-bg-secondary min-w-0">
      <div className="flex items-baseline gap-1">
        <span className={`font-bold text-sda-text-primary ${large ? 'text-3xl' : 'text-2xl'}`}>{value}</span>
        {unit && <span className="text-xs text-sda-text-secondary font-medium">{unit}</span>}
      </div>
      <div className="text-[11px] text-sda-text-secondary mt-0.5 leading-tight">{label}</div>
      <div className="text-[11px] font-semibold mt-0.5" style={{ color: subColor }}>{sublabel}</div>
    </div>
  );
}

function KpGaugeBar({ value, trendPoints }: { value: number; trendPoints: KpTrendPoint[] }) {
  const clamped = Math.min(9, Math.max(0, value));
  const pct = (clamped / 9) * 100;

  const ranges = [
    { label: 'Quiete (0-3)', start: 0, end: 33.33, color: '#3fb950' },
    { label: 'G1 (3-5)', start: 33.33, end: 55.55, color: '#d29922' },
    { label: 'G2-3 (5-7)', start: 55.55, end: 77.77, color: '#f97316' },
    { label: 'G4-5 (7-9)', start: 77.77, end: 100, color: '#f85149' },
  ];

  return (
    <div className="rounded-lg border border-sda-border-default bg-sda-bg-secondary p-4">
      <div className="text-sm font-semibold text-sda-text-primary mb-3">
        Kp Index &mdash; gauge e trend 24h
      </div>

      {/* Range labels */}
      <div className="relative h-4 mb-1">
        {ranges.map((r) => (
          <span
            key={r.label}
            className="absolute text-[10px] font-medium"
            style={{
              left: `${r.start}%`,
              width: `${r.end - r.start}%`,
              color: r.color,
              textAlign: 'center',
              display: 'inline-block',
            }}
          >
            {r.label}
          </span>
        ))}
      </div>

      {/* Gradient gauge */}
      <div className="relative h-4 rounded-full overflow-visible">
        <div
          className="h-full rounded-full"
          style={{
            background: 'linear-gradient(to right, #3fb950 0%, #84cc16 20%, #d29922 35%, #f59e0b 45%, #f97316 56%, #f85149 70%, #dc2626 85%, #991b1b 100%)',
          }}
        />
        {/* Position marker */}
        <div
          className="absolute top-1/2 w-3 h-6 rounded-sm border-2 border-sda-text-primary bg-sda-bg-primary"
          style={{ left: `${pct}%`, transform: 'translate(-50%, -50%)' }}
        />
      </div>

      {/* Scale numbers */}
      <div className="flex justify-between text-[10px] text-sda-text-secondary mt-1 px-0.5">
        {[0, 3, 5, 7, 9].map((n) => <span key={n}>{n}</span>)}
      </div>

      {/* 24h trend bars */}
      {trendPoints.length > 0 && (
        <div className="mt-3">
          <div className="text-[10px] text-sda-text-secondary mb-1">Trend 24h (ogni barra = 3h)</div>
          <div className="flex items-end gap-[3px]" style={{ height: 28 }}>
            {trendPoints.map((p, i) => {
              const h = Math.max(2, (p.kp / 9) * 28);
              return (
                <div key={i} className="flex-1 rounded-t" style={{
                  height: h,
                  backgroundColor: kpColor(p.kp),
                  opacity: 0.9,
                }}
                  title={`Kp ${p.kp}`}
                />
              );
            })}
          </div>
          <div className="flex justify-between text-[9px] text-sda-text-secondary mt-0.5">
            <span>-24h</span>
            <span>-18h</span>
            <span>-12h</span>
            <span>-6h</span>
            <span>ora</span>
          </div>
        </div>
      )}
    </div>
  );
}

function SolarWindPanel({ sw }: { sw: SolarWindData | null }) {
  const speed = sw?.speed_km_s;
  const density = sw?.density_n_cm3;
  const bz = sw?.bz_gsm_nt;
  const temp = sw?.temperature_k;

  const rows = [
    { label: 'Velocit\u00e0 vento', value: speed != null ? `${speed.toFixed(0)} km/s` : '--', pct: speed ? Math.min(100, (speed / 800) * 100) : 0, highlight: false },
    { label: 'Densit\u00e0 protoni', value: density != null ? `${density.toFixed(1)} n/cm\u00b3` : '--', pct: density ? Math.min(100, (density / 20) * 100) : 0, highlight: false },
    { label: 'Bz campo IMF', value: bz != null ? `${bz.toFixed(0)} nT` : '--', pct: 0, highlight: bz != null && bz < -5 },
    { label: 'Temp. plasma', value: temp != null ? `${fmtSci(temp)} K` : '--', pct: 0, highlight: false },
  ];

  return (
    <div className="rounded-lg border border-sda-border-default bg-sda-bg-secondary p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-semibold text-sda-text-primary">Parametri solar wind</span>
        <span className="text-[10px] text-sda-text-secondary font-medium">DSCOVR/ACE</span>
      </div>
      <div className="space-y-2.5">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center justify-between">
            <span className="text-xs text-sda-text-secondary">{r.label}</span>
            <div className="flex items-center gap-2">
              {r.pct > 0 && (
                <div className="w-16 h-1.5 rounded-full bg-sda-bg-elevated overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${r.pct}%`,
                      backgroundColor: r.pct > 70 ? '#f85149' : r.pct > 40 ? '#d29922' : '#3fb950',
                    }}
                  />
                </div>
              )}
              <span className={`text-xs font-mono font-semibold ${r.highlight ? 'text-[#f85149]' : 'text-sda-text-primary'}`}>
                {r.value}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Bz interpretation callout */}
      {bz != null && bz < -5 && (
        <div className="mt-3 rounded-md px-3 py-2 text-[11px] leading-snug"
          style={{ backgroundColor: 'rgba(210, 153, 34, 0.15)', border: '1px solid rgba(210, 153, 34, 0.4)', color: '#d29922' }}
        >
          Bz negativo ({bz.toFixed(0)} nT) indica accoppiamento attivo con magnetosfera
          &mdash; rischio tempesta geomagnetica in aumento nelle prossime 2-4h
        </div>
      )}
    </div>
  );
}

function ImpactMatrixPanel({ rows }: { rows: ImpactRow[] }) {
  return (
    <div className="rounded-lg border border-sda-border-default bg-sda-bg-secondary p-4">
      <div className="text-sm font-semibold text-sda-text-primary mb-3">Impatto operativo per sistema</div>
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-sda-border-default">
            <th className="text-left py-1.5 text-sda-text-secondary font-medium">Sistema</th>
            <th className="text-left py-1.5 text-sda-text-secondary font-medium">Stato</th>
            <th className="text-left py-1.5 text-sda-text-secondary font-medium">Dettaglio</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.sistema} className="border-b border-sda-border-default/40">
              <td className="py-2 font-medium text-sda-text-primary">{r.sistema}</td>
              <td className="py-2">
                <span className="font-semibold" style={{ color: r.color }}>{r.stato}</span>
              </td>
              <td className="py-2 text-sda-text-secondary">{r.dettaglio}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DragMonitorPanel({ kp, satellites }: { kp: number; satellites: DragImpactSatellite[] }) {
  const active = kp >= 4;

  return (
    <div className="rounded-lg border border-sda-border-default bg-sda-bg-secondary p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-semibold text-sda-text-primary">LEO &mdash; drag risk monitor</span>
        {active && (
          <Tag
            minimal
            style={{
              backgroundColor: 'rgba(210, 153, 34, 0.15)',
              color: '#d29922',
              fontSize: 10,
              fontWeight: 600,
              border: '1px solid rgba(210, 153, 34, 0.4)',
            }}
          >
            Kp&ge;4 attivo
          </Tag>
        )}
      </div>

      {active && (
        <p className="text-[11px] text-sda-text-secondary mb-3 leading-snug">
          Con Kp {kp.toFixed(1)} la densit&agrave; atmosferica a 300-500 km aumenta del 5-10%.
          Orbite basse sensibili al decadimento accelerato.
        </p>
      )}

      {satellites.length === 0 ? (
        <div className="text-xs text-sda-text-secondary text-center py-3">
          Nessun satellite a rischio drag elevato
        </div>
      ) : (
        <div className="space-y-2">
          {satellites.slice(0, 8).map((sat) => (
            <div key={sat.norad_id} className="flex items-center gap-3">
              <span className="text-xs font-semibold text-sda-text-primary w-20 truncate">{sat.name}</span>
              <span className="text-[10px] text-sda-text-secondary w-14 text-right font-mono">{sat.altitude_km.toFixed(0)} km</span>
              <div className="flex-1 h-2 rounded-full bg-sda-bg-elevated overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${Math.min(100, sat.estimated_drag_increase_pct * 5)}%`,
                    backgroundColor: sat.estimated_drag_increase_pct > 10 ? '#f85149' : sat.estimated_drag_increase_pct > 5 ? '#f97316' : '#d29922',
                  }}
                />
              </div>
              <span className="text-xs font-mono font-semibold w-16 text-right"
                style={{ color: sat.estimated_drag_increase_pct > 10 ? '#f85149' : '#f97316' }}
              >
                +{sat.estimated_drag_increase_pct.toFixed(1)}% drag
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* --- Satellite Weather Lookup --- */
const VULN_COLORS: Record<string, string> = {
  low: '#3fb950', moderate: '#d29922', high: '#f97316', critical: '#f85149',
};

function SatelliteWeatherLookup() {
  const [satellites, setSatellites] = useState<Satellite[]>([]);
  const [satsLoading, setSatsLoading] = useState(false);
  const [satSearch, setSatSearch] = useState('');
  const [selectedNorad, setSelectedNorad] = useState<number | null>(null);
  const [analysis, setAnalysis] = useState<SatelliteWeatherAnalysis | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  // Load satellite list on first render
  useEffect(() => {
    if (loaded) return;
    setLoaded(true);
    (async () => {
      setSatsLoading(true);
      try {
        const first = await api.getSatellites({ page: 1, page_size: 200, is_active: true });
        let all = first.items;
        if (first.pages > 1) {
          const rest = await Promise.all(
            Array.from({ length: Math.min(first.pages - 1, 4) }, (_, i) =>
              api.getSatellites({ page: i + 2, page_size: 200, is_active: true }),
            ),
          );
          for (const p of rest) all = all.concat(p.items);
        }
        setSatellites(all);
      } catch { /* ignore */ }
      finally { setSatsLoading(false); }
    })();
  }, [loaded]);

  const handleSelect = useCallback(async (noradId: number) => {
    setSelectedNorad(noradId);
    setAnalysisLoading(true);
    setAnalysisError(null);
    try {
      const result = await api.getSpaceWeatherSatelliteAnalysis(noradId);
      setAnalysis(result);
    } catch (e) {
      setAnalysisError(e instanceof Error ? e.message : 'Errore analisi');
      setAnalysis(null);
    } finally {
      setAnalysisLoading(false);
    }
  }, []);

  const filtered = satellites.filter((s) => {
    if (!satSearch) return true;
    const q = satSearch.toLowerCase();
    return s.name.toLowerCase().includes(q) || String(s.norad_id).includes(q)
      || (s.country || '').toLowerCase().includes(q);
  });

  return (
    <div className="rounded-lg border border-sda-border-default bg-sda-bg-secondary p-4">
      <div className="flex items-center gap-2 mb-3">
        <Icon icon="satellite" size={14} className="text-sda-text-secondary" />
        <span className="text-sm font-semibold text-sda-text-primary">
          Analisi space weather per satellite
        </span>
      </div>

      <div className="flex gap-4" style={{ minHeight: 260 }}>
        {/* Left: satellite list */}
        <div className="flex-shrink-0" style={{ width: 240 }}>
          <InputGroup
            leftIcon="search"
            placeholder="Cerca satellite..."
            value={satSearch}
            onChange={(e) => setSatSearch(e.target.value)}
            small
            className="mb-2"
          />
          {satsLoading ? (
            <div className="flex items-center gap-2 py-4 justify-center">
              <Spinner size={14} />
              <span className="text-[11px] text-sda-text-secondary">Caricamento flotta...</span>
            </div>
          ) : (
            <div className="overflow-y-auto" style={{ maxHeight: 300 }}>
              {filtered.slice(0, 100).map((s) => {
                const isSelected = selectedNorad === s.norad_id;
                const factionColor = s.faction === 'enemy' ? '#f85149' : s.faction === 'allied' ? '#2f81f7' : 'var(--sda-text-secondary)';
                return (
                  <div
                    key={s.id}
                    className="flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer transition-colors"
                    style={{
                      backgroundColor: isSelected ? 'var(--sda-bg-tertiary)' : 'transparent',
                      borderLeft: isSelected ? '2px solid var(--sda-accent-cyan)' : '2px solid transparent',
                    }}
                    onClick={() => handleSelect(s.norad_id)}
                  >
                    <Icon icon="satellite" size={11} style={{ color: factionColor }} />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium truncate text-sda-text-primary">{s.name}</div>
                      <div className="text-[10px] text-sda-text-secondary font-mono">{s.norad_id}</div>
                    </div>
                    {isSelected && analysisLoading && <Spinner size={12} />}
                  </div>
                );
              })}
              {filtered.length === 0 && !satsLoading && (
                <div className="text-[11px] text-sda-text-secondary text-center py-3">Nessun satellite trovato</div>
              )}
            </div>
          )}
          <div className="mt-1 text-[10px] text-sda-text-secondary">{satellites.length} satelliti in flotta</div>
        </div>

        {/* Right: analysis */}
        <div className="flex-1 min-w-0" style={{ borderLeft: '1px solid var(--sda-border-default)', paddingLeft: 16 }}>
          {!selectedNorad && !analysis && (
            <div className="flex flex-col items-center justify-center h-full text-center py-8">
              <Icon icon="satellite" size={28} style={{ color: 'var(--sda-text-secondary)', opacity: 0.3 }} />
              <p className="text-xs mt-2 text-sda-text-secondary">
                Seleziona un satellite per visualizzare l&apos;analisi space weather
              </p>
            </div>
          )}
          {analysisLoading && (
            <div className="flex items-center gap-2 py-8 justify-center">
              <Spinner size={18} />
              <span className="text-xs text-sda-text-secondary">Analisi in corso...</span>
            </div>
          )}
          {analysisError && (
            <div className="text-xs p-3 rounded" style={{ backgroundColor: 'rgba(248,81,73,0.1)', color: '#f85149' }}>
              {analysisError}
            </div>
          )}
          {analysis && !analysisLoading && (
            <div className="space-y-3">
              {/* Satellite header */}
              <div className="flex items-center gap-2 flex-wrap">
                <Tag minimal style={{ backgroundColor: 'rgba(47,129,247,0.15)', color: '#2f81f7', fontWeight: 700, fontSize: 11 }}>
                  NORAD {analysis.norad_id}
                </Tag>
                <span className="text-sm font-semibold text-sda-text-primary">{analysis.name}</span>
                {analysis.orbit_type && (
                  <Tag minimal style={{ fontSize: 10 }}>{analysis.orbit_type}</Tag>
                )}
              </div>

              {/* Orbital info */}
              <div className="flex gap-4 text-[11px] text-sda-text-secondary">
                {analysis.altitude_km != null && <span>Altitudine: <strong className="text-sda-text-primary font-mono">{analysis.altitude_km.toFixed(0)} km</strong></span>}
                {analysis.inclination_deg != null && <span>Inclinazione: <strong className="text-sda-text-primary font-mono">{analysis.inclination_deg.toFixed(1)}&deg;</strong></span>}
              </div>

              {/* Vulnerability score */}
              <div className="flex items-center gap-3 p-2.5 rounded-lg" style={{ backgroundColor: 'var(--sda-bg-tertiary)' }}>
                <div className="text-center">
                  <div className="text-2xl font-bold font-mono" style={{ color: VULN_COLORS[analysis.vulnerability_level] || '#6b7280' }}>
                    {analysis.vulnerability_score.toFixed(0)}
                  </div>
                  <div className="text-[9px] text-sda-text-secondary uppercase tracking-wider">score</div>
                </div>
                <div className="flex-1">
                  <div className="h-2 rounded-full bg-sda-bg-elevated overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{
                      width: `${analysis.vulnerability_score}%`,
                      backgroundColor: VULN_COLORS[analysis.vulnerability_level] || '#6b7280',
                    }} />
                  </div>
                  <div className="text-[10px] font-semibold mt-1 uppercase" style={{ color: VULN_COLORS[analysis.vulnerability_level] }}>
                    {analysis.vulnerability_level === 'low' ? 'Bassa vulnerabilit\u00e0' :
                     analysis.vulnerability_level === 'moderate' ? 'Vulnerabilit\u00e0 moderata' :
                     analysis.vulnerability_level === 'high' ? 'Alta vulnerabilit\u00e0' : 'Vulnerabilit\u00e0 critica'}
                  </div>
                </div>
                {analysis.drag_increase_pct > 0 && (
                  <div className="text-center px-2">
                    <div className="text-lg font-bold font-mono" style={{ color: analysis.drag_increase_pct > 8 ? '#f85149' : '#d29922' }}>
                      +{analysis.drag_increase_pct.toFixed(1)}%
                    </div>
                    <div className="text-[9px] text-sda-text-secondary">drag</div>
                  </div>
                )}
              </div>

              {/* System impacts */}
              {analysis.impacts.length > 0 && (
                <table className="w-full text-[11px]">
                  <thead>
                    <tr className="border-b border-sda-border-default">
                      <th className="text-left py-1 text-sda-text-secondary font-medium">Sistema</th>
                      <th className="text-left py-1 text-sda-text-secondary font-medium">Stato</th>
                      <th className="text-left py-1 text-sda-text-secondary font-medium">Dettaglio</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analysis.impacts.map((imp) => (
                      <tr key={imp.system} className="border-b border-sda-border-default/30">
                        <td className="py-1.5 font-medium text-sda-text-primary">{imp.system}</td>
                        <td className="py-1.5">
                          <span className="font-semibold" style={{ color: imp.color }}>{imp.status}</span>
                        </td>
                        <td className="py-1.5 text-sda-text-secondary">{imp.detail}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {/* Recommendations */}
              {analysis.recommendations.length > 0 && (
                <div className="rounded-md p-2.5" style={{ backgroundColor: 'rgba(47,129,247,0.08)', border: '1px solid rgba(47,129,247,0.2)' }}>
                  <div className="text-[10px] font-semibold text-[#2f81f7] uppercase tracking-wider mb-1.5">Raccomandazioni</div>
                  <ul className="space-y-1">
                    {analysis.recommendations.map((r, i) => (
                      <li key={i} className="text-[11px] text-sda-text-primary flex items-start gap-1.5">
                        <span className="text-[#2f81f7] mt-0.5 shrink-0">&bull;</span>
                        {r}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function AlertCard({ alert }: { alert: ParsedAlert }) {
  const isAlert = alert.alert_type === 'ALERT';
  const accentColor = isAlert ? '#f85149' : '#d29922';

  return (
    <div
      className="rounded-lg p-3 border-l-4 border border-sda-border-default"
      style={{ backgroundColor: 'var(--sda-bg-tertiary)', borderLeftColor: accentColor }}
    >
      <div className="flex items-start justify-between mb-1.5">
        <div className="text-xs font-bold text-sda-text-primary leading-tight flex-1 pr-2">
          {alert.product_id} &mdash; {alert.title}
        </div>
        <span
          className="text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0"
          style={{ backgroundColor: accentColor, color: '#fff' }}
        >
          {alert.alert_type}
        </span>
      </div>
      <p className="text-[11px] text-sda-text-secondary leading-snug mb-2">{alert.description}</p>
      <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-[10px] text-sda-text-secondary">
        {alert.noaa_scale && <span><strong className="text-sda-text-primary">Scala NOAA:</strong> {alert.noaa_scale}</span>}
        {alert.issued && <span><strong className="text-sda-text-primary">Emesso:</strong> {alert.issued}</span>}
        {alert.valid_from && <span><strong className="text-sda-text-primary">Periodo:</strong> {alert.valid_from}{alert.valid_to ? ` \u2192 ${alert.valid_to}` : ''}</span>}
        {alert.serial && <span><strong className="text-sda-text-primary">Seriale:</strong> {alert.serial}</span>}
      </div>
    </div>
  );
}

function ParsedAlertsPanel({ alerts, rawCount }: { alerts: ParsedAlert[]; rawCount: number }) {
  return (
    <div className="rounded-lg border border-sda-border-default bg-sda-bg-secondary p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-semibold text-sda-text-primary">NOAA Alerts parsati</span>
        <span className="text-[10px] text-sda-text-secondary font-medium">{rawCount} messaggi</span>
      </div>
      {alerts.length === 0 ? (
        <div className="text-xs text-sda-text-secondary text-center py-3">Nessun alert attivo</div>
      ) : (
        <div className="space-y-3 max-h-[320px] overflow-y-auto">
          {alerts.map((a, i) => (
            <AlertCard key={`${a.product_id}-${i}`} alert={a} />
          ))}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   MAIN PANEL
   ═══════════════════════════════════════════════════════════ */

export function SpaceWeatherPanel() {
  const [data, setData] = useState<SpaceWeatherImpactResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(REFRESH_INTERVAL / 1000);

  const fetchData = useCallback(async () => {
    try {
      const result = await api.getSpaceWeatherImpactLive();
      setData(result);
      setError(null);
      setCountdown(REFRESH_INTERVAL / 1000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load space weather';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const dataInterval = setInterval(fetchData, REFRESH_INTERVAL);
    const tickInterval = setInterval(() => setCountdown((c) => Math.max(0, c - 1)), 1000);
    return () => { clearInterval(dataInterval); clearInterval(tickInterval); };
  }, [fetchData]);

  const impactRows = useMemo(() => {
    if (!data) return [];
    const cond = data.current_conditions;
    return computeImpact(cond.kp_index, data.solar_wind?.bz_gsm_nt ?? null, cond.xray_class, cond.proton_flux_10mev);
  }, [data]);

  if (loading && !data) {
    return (
      <div className="flex justify-center items-center py-16">
        <Spinner size={32} />
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="rounded-lg p-4 text-sm"
        style={{ backgroundColor: 'rgba(248, 81, 73, 0.1)', border: '1px solid rgba(248, 81, 73, 0.3)', color: '#f85149' }}
      >
        {error}
      </div>
    );
  }

  if (!data) return null;

  const { current_conditions: cond, affected_satellites, active_alerts, kp_trend_24h, solar_wind, parsed_alerts } = data;
  const storm = STORM_LABELS[cond.storm_level] || STORM_LABELS.none;
  const f107 = f107Level(cond.f10_7);
  const xray = xrayLevel(cond.xray_class);
  const proton = protonLevel(cond.proton_flux_10mev);
  const dst = dstLevel(cond.dst_index);

  const countdownMin = Math.floor(countdown / 60);
  const countdownSec = countdown % 60;

  return (
    <div className="space-y-4 p-1">
      {/* ── Header bar ── */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <span className="text-xl">&#9728;&#65039;</span>
          <h2 className="text-lg font-bold text-sda-text-primary m-0">Space Weather</h2>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {cond.storm_level !== 'none' && (
            <span
              className="px-3 py-1 rounded-full text-xs font-bold text-white"
              style={{ backgroundColor: storm.color }}
            >
              {storm.label}
            </span>
          )}
          <span className="text-[11px] text-sda-text-secondary">
            NOAA SWPC &middot; aggiornato {fmtDate(cond.timestamp)} &middot;
            refresh {countdownMin}:{String(countdownSec).padStart(2, '0')}
          </span>
        </div>
      </div>

      {/* ── 5 KPI cards ── */}
      <div className="grid grid-cols-5 gap-3">
        <KpiCard
          value={cond.kp_index.toFixed(1)}
          label="Kp Index"
          sublabel={storm.label !== 'Quiete' ? storm.label.replace(' Storm', '') : 'Quiete'}
          subColor={storm.color}
          large
        />
        <KpiCard
          value={cond.f10_7 !== null ? cond.f10_7.toFixed(0) : '--'}
          unit="sfu"
          label="F10.7 Solar Flux"
          sublabel={f107.label}
          subColor={f107.color}
        />
        <KpiCard
          value={cond.xray_class || '--'}
          label="X-ray Flux"
          sublabel={xray.label}
          subColor={xray.color}
        />
        <KpiCard
          value={cond.proton_flux_10mev !== null ? fmtSci(cond.proton_flux_10mev) : '--'}
          unit="p/cm&sup2;"
          label="Proton Flux >10 MeV"
          sublabel={proton.label}
          subColor={proton.color}
        />
        <KpiCard
          value={cond.dst_index !== null ? cond.dst_index.toFixed(0) : '--'}
          unit="nT"
          label="DST Index"
          sublabel={dst.label}
          subColor={dst.color}
        />
      </div>

      {/* ── Kp Gauge + Trend ── */}
      <KpGaugeBar value={cond.kp_index} trendPoints={kp_trend_24h || []} />

      {/* ── Two-column layout ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="space-y-4">
          <SolarWindPanel sw={solar_wind} />
          <DragMonitorPanel kp={cond.kp_index} satellites={affected_satellites} />
        </div>
        <div className="space-y-4">
          <ImpactMatrixPanel rows={impactRows} />
        </div>
      </div>

      {/* ── NOAA Alerts — full width ── */}
      <ParsedAlertsPanel alerts={parsed_alerts || []} rawCount={active_alerts.length} />

      {/* ── Satellite Weather Analysis ── */}
      <SatelliteWeatherLookup />
    </div>
  );
}
