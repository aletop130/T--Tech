'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Tag,
  Spinner,
  Tabs,
  Tab,
  Callout,
  HTMLTable,
  HTMLSelect,
  Icon,
} from '@blueprintjs/core';
import { api } from '@/lib/api';
import type {
  Satellite,
  RFTransmitter,
  RFBandSummary,
  RFSatelliteProfile,
  RFOperationalDashboard,
  BandOperationalStatus,
  ScintillationRegion,
  BandForecast,
  FrequencyAlternative,
  SpaceWeatherStrip,
} from '@/lib/api';

const REFRESH_INTERVAL = 5 * 60 * 1000; // 5 min

const BAND_COLORS: Record<string, string> = {
  HF: '#a855f7',
  VHF: '#3b82f6',
  UHF: '#22c55e',
  'S-band': '#eab308',
  'C-band': '#f97316',
  'X-band': '#ef4444',
  'Ku-band': '#ec4899',
  'Ka-band': '#06b6d4',
  EHF: '#8b5cf6',
  Unknown: '#6b7280',
};

const STATUS_COLORS: Record<string, string> = {
  operational: '#22c55e',
  degraded: '#f59e0b',
  blackout: '#ef4444',
};

const STATUS_LABELS: Record<string, string> = {
  operational: 'GO',
  degraded: 'DEGRADED',
  blackout: 'BLACKOUT',
};

const ALERT_COLORS: Record<string, string> = {
  green: '#22c55e',
  yellow: '#eab308',
  orange: '#f97316',
  red: '#ef4444',
};

const KP_COLORS = [
  '#22c55e', '#22c55e', '#84cc16', '#eab308', '#f59e0b',
  '#f97316', '#ef4444', '#dc2626', '#b91c1c', '#991b1b',
];

const BAND_OPTIONS = ['', 'HF', 'VHF', 'UHF', 'S-band', 'C-band', 'X-band', 'Ku-band', 'Ka-band'];
const MODE_OPTIONS = ['', 'FM', 'AFSK', 'BPSK', 'QPSK', 'FSK', 'CW', 'SSB', 'AM', 'GFSK', 'GMSK', 'LoRa', 'OQPSK'];

function formatFreq(hz: number | null): string {
  if (!hz || hz <= 0) return '-';
  if (hz >= 1e9) return `${(hz / 1e9).toFixed(3)} GHz`;
  if (hz >= 1e6) return `${(hz / 1e6).toFixed(3)} MHz`;
  if (hz >= 1e3) return `${(hz / 1e3).toFixed(1)} kHz`;
  return `${hz} Hz`;
}

function BandTag({ band }: { band: string }) {
  return (
    <Tag
      minimal
      style={{
        backgroundColor: BAND_COLORS[band] || BAND_COLORS.Unknown,
        color: '#fff',
        fontWeight: 600,
      }}
    >
      {band}
    </Tag>
  );
}

function StatusTag({ alive, status }: { alive: boolean; status: string }) {
  if (!alive) return <Tag intent="danger" minimal>DEAD</Tag>;
  if (status === 'active') return <Tag intent="success" minimal>ACTIVE</Tag>;
  return <Tag intent="warning" minimal>{status.toUpperCase()}</Tag>;
}

/* ================================================================
   SPACE WEATHER STRIP — always visible at the top of the panel
   ================================================================ */

function SpaceWeatherStripBar({ sw }: { sw: SpaceWeatherStrip }) {
  const kpColor = KP_COLORS[Math.round(Math.min(9, Math.max(0, sw.kp_index)))] || KP_COLORS[0];
  const alertColor = ALERT_COLORS[sw.alert_level] || ALERT_COLORS.green;

  let f107Level = 'Low';
  let f107Color = '#22c55e';
  if (sw.f10_7 && sw.f10_7 > 200) { f107Level = 'V.High'; f107Color = '#ef4444'; }
  else if (sw.f10_7 && sw.f10_7 > 150) { f107Level = 'High'; f107Color = '#f97316'; }
  else if (sw.f10_7 && sw.f10_7 > 100) { f107Level = 'Mod'; f107Color = '#eab308'; }

  return (
    <div
      className="plt-panel p-3 mb-3"
      style={{
        borderColor: sw.hf_blackout || sw.polar_cap_absorption ? '#ef4444' : undefined,
        boxShadow: sw.hf_blackout ? '0 0 12px rgba(239,68,68,0.3)' : 'none',
      }}
    >
      {/* Alert banners */}
      {sw.hf_blackout && (
        <div className="flex items-center gap-2 mb-2 px-2 py-1 rounded-[2px] text-[10px] font-mono font-semibold uppercase tracking-wider"
          style={{ backgroundColor: '#f8514915', color: '#f85149', border: '1px solid #f8514930' }}>
          <Icon icon="warning-sign" size={12} />
          HF RADIO BLACKOUT IN EFFECT
          {sw.xray_class && <span>— {sw.xray_class}-class flare</span>}
        </div>
      )}
      {sw.polar_cap_absorption && (
        <div className="flex items-center gap-2 mb-2 px-2 py-1 rounded-[2px] text-[10px] font-mono font-semibold uppercase tracking-wider"
          style={{ backgroundColor: 'rgba(249,115,22,0.1)', color: '#f97316', border: '1px solid rgba(249,115,22,0.2)' }}>
          <Icon icon="warning-sign" size={12} />
          POLAR CAP ABSORPTION — Proton flux {sw.proton_flux?.toFixed(0)} pfu
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
        {/* Kp Index */}
        <div className="text-center">
          <div className="text-[10px] uppercase tracking-wider mb-1" style={{ color: '#555' }}>
            Kp Index
          </div>
          <div className="text-xl font-bold font-mono" style={{ color: kpColor }}>
            {sw.kp_index.toFixed(1)}
          </div>
          <div className="h-1.5 rounded-full mt-1 overflow-hidden" style={{ backgroundColor: '#111' }}>
            <div className="h-full rounded-full transition-all" style={{
              width: `${(sw.kp_index / 9) * 100}%`,
              backgroundColor: kpColor,
            }} />
          </div>
        </div>

        {/* F10.7 */}
        <div className="text-center">
          <div className="text-[10px] uppercase tracking-wider mb-1" style={{ color: '#555' }}>
            F10.7 Flux
          </div>
          <div className="text-xl font-bold font-mono" style={{ color: f107Color }}>
            {sw.f10_7?.toFixed(0) || '--'}
          </div>
          <div className="text-[10px]" style={{ color: f107Color }}>{f107Level}</div>
        </div>

        {/* X-ray flux */}
        <div className="text-center">
          <div className="text-[10px] uppercase tracking-wider mb-1" style={{ color: '#555' }}>
            X-Ray
          </div>
          <div className="text-xl font-bold font-mono" style={{
            color: sw.xray_class === 'X' ? '#ef4444' :
              sw.xray_class === 'M' ? '#f97316' :
                sw.xray_class === 'C' ? '#eab308' : '#22c55e'
          }}>
            {sw.xray_class || '--'}
          </div>
          <div className="text-[10px] font-mono" style={{ color: '#555' }}>
            {sw.xray_flux ? sw.xray_flux.toExponential(1) : '--'} W/m²
          </div>
        </div>

        {/* Proton flux */}
        <div className="text-center">
          <div className="text-[10px] uppercase tracking-wider mb-1" style={{ color: '#555' }}>
            Proton &gt;10MeV
          </div>
          <div className="text-xl font-bold font-mono" style={{
            color: sw.proton_flux && sw.proton_flux > 100 ? '#ef4444' :
              sw.proton_flux && sw.proton_flux > 10 ? '#f97316' : '#22c55e'
          }}>
            {sw.proton_flux?.toFixed(1) || '--'}
          </div>
          <div className="text-[10px]" style={{ color: '#555' }}>pfu</div>
        </div>

        {/* Storm Level */}
        <div className="text-center">
          <div className="text-[10px] uppercase tracking-wider mb-1" style={{ color: '#555' }}>
            Storm
          </div>
          <div className="text-sm font-bold" style={{
            color: sw.storm_level === 'none' ? '#22c55e' :
              sw.storm_level === 'minor' ? '#eab308' :
                sw.storm_level === 'moderate' ? '#f97316' : '#ef4444'
          }}>
            {sw.storm_level === 'none' ? 'Quiet' :
              sw.storm_level === 'minor' ? 'G1' :
                sw.storm_level === 'moderate' ? 'G2' :
                  sw.storm_level === 'strong' ? 'G3' :
                    sw.storm_level === 'severe' ? 'G4' : 'G5'}
          </div>
          <div className="text-[10px] capitalize" style={{ color: '#555' }}>
            {sw.storm_level}
          </div>
        </div>

        {/* Alert Level */}
        <div className="text-center">
          <div className="text-[10px] uppercase tracking-wider mb-1" style={{ color: '#555' }}>
            Alert
          </div>
          <div className="flex items-center justify-center gap-2">
            <div
              className="w-4 h-4 rounded-full"
              style={{
                backgroundColor: alertColor,
                boxShadow: sw.alert_level !== 'green' ? `0 0 8px ${alertColor}` : 'none',
                animation: sw.alert_level === 'red' ? 'pulse 2s infinite' : 'none',
              }}
            />
            <span className="text-sm font-bold uppercase" style={{ color: alertColor }}>
              {sw.alert_level}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ================================================================
   BAND OPERATIONAL STATUS CARDS
   ================================================================ */

function BandStatusCard({ band }: { band: BandOperationalStatus }) {
  const statusColor = STATUS_COLORS[band.status] || STATUS_COLORS.operational;
  const bandColor = BAND_COLORS[band.band_name] || BAND_COLORS.Unknown;

  return (
    <div
      className="plt-panel p-3 relative overflow-hidden"
      style={{
        backgroundColor: '#0a0a0a',
        borderLeft: `3px solid ${bandColor}`,
      }}
    >
      {/* Degradation overlay */}
      {band.degradation_pct > 0 && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: `linear-gradient(90deg, ${statusColor}10 0%, transparent ${band.degradation_pct}%)`,
          }}
        />
      )}

      <div className="relative">
        <div className="flex items-center justify-between mb-1.5">
          <div className="flex items-center gap-2">
            <BandTag band={band.band_name} />
            <span className="text-[10px] font-mono" style={{ color: '#555' }}>
              {band.frequency_range}
            </span>
          </div>
          <span className="plt-badge" style={{
            backgroundColor: `${statusColor}18`,
            color: statusColor,
            borderColor: `${statusColor}30`,
          }}>
            {STATUS_LABELS[band.status] || band.status.toUpperCase()}
          </span>
        </div>

        {/* Stats row */}
        <div className="flex items-center gap-3 text-[10px] mb-1" style={{ color: '#555' }}>
          <span>{band.satellite_count} sats</span>
          <span>{band.transmitter_count} tx</span>
          {band.degradation_pct > 0 && (
            <span style={{ color: statusColor }}>
              {band.degradation_pct.toFixed(0)}% degraded
            </span>
          )}
        </div>

        {/* Reason */}
        {band.reason && (
          <div className="text-[11px] mt-1" style={{
            color: band.status === 'operational' ? '#555' : statusColor
          }}>
            {band.reason}
          </div>
        )}

        {/* Alternative suggestion */}
        {band.alternative_band && (
          <div className="flex items-center gap-1 mt-1.5 text-[10px]" style={{ color: '#06b6d4' }}>
            <Icon icon="arrow-right" size={10} />
            Route to <BandTag band={band.alternative_band} />
          </div>
        )}
      </div>
    </div>
  );
}

/* ================================================================
   SCINTILLATION INDEX PANEL
   ================================================================ */

function ScintillationPanel({ regions }: { regions: ScintillationRegion[] }) {
  const REGION_LABELS: Record<string, string> = {
    polar: 'Polar',
    equatorial: 'Equatorial',
    mid_latitude: 'Mid-Latitude',
  };

  const SEVERITY_COLORS: Record<string, string> = {
    none: '#22c55e',
    weak: '#84cc16',
    moderate: '#f59e0b',
    strong: '#ef4444',
  };

  return (
    <div className="plt-panel p-3">
      <div className="flex items-center gap-2 mb-3 pb-2 border-b border-[#1a1a1a]">
        <Icon icon="pulse" size={14} color="#555" />
        <span className="text-xs font-semibold text-[#e0e0e0] uppercase tracking-wider">
          UHF Scintillation Index (S4)
        </span>
      </div>
      <div className="grid grid-cols-3 gap-3">
        {regions.map(r => {
          const color = SEVERITY_COLORS[r.severity] || SEVERITY_COLORS.none;
          const barWidth = Math.min(100, (r.s4_index / 1.0) * 100);
          return (
            <div key={r.region}>
              <div className="text-[10px] uppercase tracking-wider mb-1" style={{ color: '#555' }}>
                {REGION_LABELS[r.region] || r.region}
              </div>
              <div className="text-lg font-bold font-mono" style={{ color }}>
                {r.s4_index.toFixed(2)}
              </div>
              <div className="h-1 rounded-full mt-1 overflow-hidden" style={{ backgroundColor: '#111' }}>
                <div className="h-full rounded-full transition-all" style={{
                  width: `${barWidth}%`,
                  backgroundColor: color,
                }} />
              </div>
              <div className="text-[10px] mt-0.5 capitalize" style={{ color }}>
                {r.severity}
              </div>
              {r.affected_bands.length > 0 && (
                <div className="flex flex-wrap gap-0.5 mt-1">
                  {r.affected_bands.map(b => (
                    <span key={b} className="text-[9px] px-1 rounded" style={{
                      backgroundColor: `${BAND_COLORS[b] || '#6b7280'}30`,
                      color: BAND_COLORS[b] || '#6b7280',
                    }}>
                      {b}
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ================================================================
   12-HOUR AVAILABILITY FORECAST
   ================================================================ */

function ForecastTimeline({ forecasts }: { forecasts: BandForecast[] }) {
  if (!forecasts.length) return null;

  return (
    <div className="plt-panel p-3">
      <div className="flex items-center gap-2 mb-3 pb-2 border-b border-[#1a1a1a]">
        <Icon icon="timeline-events" size={14} color="#555" />
        <span className="text-xs font-semibold text-[#e0e0e0] uppercase tracking-wider">
          12h Band Availability Forecast
        </span>
      </div>

      <div className="space-y-2">
        {forecasts.map(f => (
          <div key={f.band_name} className="flex items-center gap-2">
            <div className="w-16 flex-shrink-0">
              <BandTag band={f.band_name} />
            </div>
            <div className="flex-1 flex gap-px">
              {f.points.map((p, i) => {
                const color = STATUS_COLORS[p.status] || STATUS_COLORS.operational;
                return (
                  <div
                    key={i}
                    className="flex-1 rounded-[1px] relative group cursor-default"
                    style={{
                      height: 18,
                      backgroundColor: `${color}${Math.round(p.confidence * 255).toString(16).padStart(2, '0')}`,
                      minWidth: 4,
                    }}
                    title={`+${p.hours_ahead}h: ${p.status} (${p.degradation_pct.toFixed(0)}% deg, ${(p.confidence * 100).toFixed(0)}% conf)`}
                  >
                    {/* Hour marker for every 3rd hour */}
                    {p.hours_ahead % 3 === 0 && (
                      <span className="absolute -bottom-3 left-1/2 -translate-x-1/2 text-[8px]"
                        style={{ color: '#555' }}>
                        +{p.hours_ahead}h
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 mt-5 text-[10px]" style={{ color: '#555' }}>
        <div className="flex items-center gap-1">
          <div className="w-3 h-2 rounded-[1px]" style={{ backgroundColor: STATUS_COLORS.operational }} />
          GO
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-2 rounded-[1px]" style={{ backgroundColor: STATUS_COLORS.degraded }} />
          DEGRADED
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-2 rounded-[1px]" style={{ backgroundColor: STATUS_COLORS.blackout }} />
          BLACKOUT
        </div>
        <span className="ml-auto">Opacity = confidence</span>
      </div>
    </div>
  );
}

/* ================================================================
   FREQUENCY ROUTING ALTERNATIVES
   ================================================================ */

function AlternativesPanel({ alternatives }: { alternatives: FrequencyAlternative[] }) {
  if (!alternatives.length) return null;

  const IMPACT_COLORS: Record<string, string> = {
    minimal: '#22c55e',
    moderate: '#eab308',
    significant: '#ef4444',
  };

  return (
    <div className="plt-panel p-3" style={{ borderColor: 'rgba(57,197,207,0.3)' }}>
      <div className="flex items-center gap-2 mb-3 pb-2 border-b border-[#1a1a1a]">
        <Icon icon="exchange" size={14} color="#39c5cf" />
        <span className="text-xs font-semibold text-[#39c5cf] uppercase tracking-wider">
          Frequency Routing Recommendations
        </span>
      </div>
      <div className="space-y-2">
        {alternatives.map((alt, i) => (
          <div key={i} className="flex items-center gap-2 text-xs">
            <BandTag band={alt.degraded_band} />
            <Icon icon="arrow-right" size={12} color="#555" />
            <BandTag band={alt.alternative_band} />
            <span className="flex-1 text-[11px]" style={{ color: '#555' }}>
              {alt.reason}
            </span>
            <span className="plt-badge" style={{
              backgroundColor: `${IMPACT_COLORS[alt.link_margin_impact]}18`,
              color: IMPACT_COLORS[alt.link_margin_impact],
              borderColor: `${IMPACT_COLORS[alt.link_margin_impact]}30`,
            }}>
              {alt.link_margin_impact} impact
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ================================================================
   EXISTING SUB-COMPONENTS (Band Overview, Transmitter Search, Sat Lookup)
   ================================================================ */

function BandOverview({ bands }: { bands: RFBandSummary[] }) {
  const maxTx = Math.max(...bands.map(b => b.transmitter_count), 1);

  return (
    <div className="space-y-3">
      {bands.map(b => (
        <div key={b.band_name}>
          <div className="flex justify-between items-center mb-1">
            <div className="flex items-center gap-2">
              <BandTag band={b.band_name} />
              <span className="text-xs" style={{ color: '#555' }}>
                {b.frequency_range}
              </span>
            </div>
            <span className="text-xs" style={{ color: '#555' }}>
              {b.satellite_count} sats / {b.transmitter_count} tx
            </span>
          </div>
          <div className="h-1 rounded-[1px]" style={{ backgroundColor: '#111' }}>
            <div
              className="h-1 rounded-[1px] transition-all"
              style={{
                width: `${(b.transmitter_count / maxTx) * 100}%`,
                backgroundColor: BAND_COLORS[b.band_name] || BAND_COLORS.Unknown,
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function TransmitterTable({ transmitters }: { transmitters: RFTransmitter[] }) {
  if (!transmitters.length) {
    return (
      <Callout intent="primary" icon="info-sign" className="mt-2">
        No transmitters found matching current filters.
      </Callout>
    );
  }

  return (
    <div className="overflow-x-auto mt-2">
      <HTMLTable compact striped interactive style={{ width: '100%' }}>
        <thead>
          <tr>
            <th>NORAD</th>
            <th>Description</th>
            <th>Band</th>
            <th>Downlink</th>
            <th>Uplink</th>
            <th>Mode</th>
            <th>Baud</th>
            <th>Type</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {transmitters.slice(0, 200).map((tx, i) => (
            <tr key={tx.uuid || i}>
              <td style={{ color: '#39c5cf' }}>{tx.norad_cat_id || '-'}</td>
              <td>{tx.description || '-'}</td>
              <td><BandTag band={tx.band} /></td>
              <td style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
                {formatFreq(tx.downlink_low)}
                {tx.downlink_high && tx.downlink_high !== tx.downlink_low
                  ? ` - ${formatFreq(tx.downlink_high)}`
                  : ''}
              </td>
              <td style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
                {formatFreq(tx.uplink_low)}
                {tx.uplink_high && tx.uplink_high !== tx.uplink_low
                  ? ` - ${formatFreq(tx.uplink_high)}`
                  : ''}
              </td>
              <td>
                {tx.mode ? (
                  <Tag minimal intent="none" style={{ fontSize: '0.7rem' }}>
                    {tx.mode}
                  </Tag>
                ) : '-'}
              </td>
              <td style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
                {tx.baud ? `${tx.baud}` : '-'}
              </td>
              <td className="text-xs">{tx.type || '-'}</td>
              <td><StatusTag alive={tx.alive} status={tx.status} /></td>
            </tr>
          ))}
        </tbody>
      </HTMLTable>
      {transmitters.length > 200 && (
        <p className="text-xs mt-1" style={{ color: '#555' }}>
          Showing first 200 of {transmitters.length} results.
        </p>
      )}
    </div>
  );
}

/* ================================================================
   MAIN PANEL COMPONENT
   ================================================================ */

export function RFSpectrumPanel() {
  // Dashboard state
  const [dashboard, setDashboard] = useState<RFOperationalDashboard | null>(null);
  const [dashLoading, setDashLoading] = useState(true);
  const [dashError, setDashError] = useState<string | null>(null);

  // Existing state for other tabs
  const [bands, setBands] = useState<RFBandSummary[]>([]);
  const [searchResults, setSearchResults] = useState<RFTransmitter[]>([]);
  const [searchTotal, setSearchTotal] = useState(0);
  const [satProfile, setSatProfile] = useState<RFSatelliteProfile | null>(null);
  const [bandsLoading, setBandsLoading] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [satLoading, setSatLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('operational');

  // Satellite list from ontology
  const [satellites, setSatellites] = useState<Satellite[]>([]);
  const [satsLoading, setSatsLoading] = useState(false);
  const [satSearch, setSatSearch] = useState('');
  const [selectedSatId, setSelectedSatId] = useState<number | null>(null);

  // Filters
  const [bandFilter, setBandFilter] = useState('');
  const [modeFilter, setModeFilter] = useState('');

  const fetchDashboard = useCallback(async () => {
    try {
      setDashError(null);
      const data = await api.getRFOperationalDashboard();
      setDashboard(data);
    } catch (e) {
      setDashError(e instanceof Error ? e.message : 'Failed to load operational dashboard');
    } finally {
      setDashLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboard();
    const interval = setInterval(fetchDashboard, REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchDashboard]);

  const fetchBands = useCallback(async () => {
    setBandsLoading(true);
    try {
      const data = await api.getRFBandSummary();
      setBands(data);
    } catch (e) {
      console.error('Band fetch error:', e);
    } finally {
      setBandsLoading(false);
    }
  }, []);

  // Fetch satellite list from ontology (paginated, max 200 per page)
  const fetchSatellites = useCallback(async () => {
    setSatsLoading(true);
    try {
      const first = await api.getSatellites({ page: 1, page_size: 200, is_active: true });
      let all = first.items;
      // Fetch remaining pages if any
      if (first.pages > 1) {
        const remaining = await Promise.all(
          Array.from({ length: first.pages - 1 }, (_, i) =>
            api.getSatellites({ page: i + 2, page_size: 200, is_active: true })
          )
        );
        for (const page of remaining) {
          all = all.concat(page.items);
        }
      }
      setSatellites(all);
    } catch (e) {
      console.error('Satellite list fetch error:', e);
    } finally {
      setSatsLoading(false);
    }
  }, []);

  // Auto-load satellite list when Satellite RF tab becomes active
  useEffect(() => {
    if (activeTab === 'satellite' && satellites.length === 0 && !satsLoading) {
      fetchSatellites();
    }
  }, [activeTab]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-load band data when Band Overview tab becomes active
  useEffect(() => {
    if (activeTab === 'bands' && bands.length === 0 && !bandsLoading) {
      fetchBands();
    }
  }, [activeTab]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-load search results when Search tab becomes active
  useEffect(() => {
    if (activeTab === 'search' && searchResults.length === 0 && !searchLoading) {
      handleSearch();
    }
  }, [activeTab]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSearch = useCallback(async () => {
    setSearchLoading(true);
    try {
      const data = await api.searchRFTransmitters({
        band: bandFilter || undefined,
        mode: modeFilter || undefined,
      });
      setSearchResults(data.transmitters);
      setSearchTotal(data.total);
    } catch (e) {
      console.error('RF search error:', e);
    } finally {
      setSearchLoading(false);
    }
  }, [bandFilter, modeFilter]);

  const handleSatSelect = useCallback(async (noradId: number) => {
    setSelectedSatId(noradId);
    setSatLoading(true);
    try {
      const data = await api.getRFSatelliteProfile(noradId);
      setSatProfile(data);
    } catch (e) {
      console.error('Satellite RF lookup error:', e);
      setSatProfile(null);
    } finally {
      setSatLoading(false);
    }
  }, []);

  // Overall status indicator
  const overallColor = dashboard?.overall_status === 'critical' ? '#f85149' :
    dashboard?.overall_status === 'degraded' ? '#d29922' : '#3fb950';
  const overallLabel = dashboard?.overall_status === 'critical' ? 'CRITICAL' :
    dashboard?.overall_status === 'degraded' ? 'DEGRADED' : 'NOMINAL';

  return (
    <div className="p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Icon icon="satellite" size={14} style={{ color: '#a78bfa' }} />
          <div>
            <h2 className="text-xs font-bold text-[#e0e0e0] uppercase tracking-[0.15em]">
              RF Spectrum Awareness
            </h2>
            <p className="text-[10px] text-[#555] font-mono uppercase tracking-wider mt-0.5">
              Operational spectrum monitoring with space weather correlation
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {/* Overall status badge */}
          {dashboard && (
            <div className="plt-panel flex items-center gap-2 px-3 py-1.5" style={{
              borderColor: `${overallColor}40`,
            }}>
              <div className="w-1.5 h-1.5 rounded-full" style={{
                backgroundColor: overallColor,
                boxShadow: dashboard.overall_status !== 'nominal' ? `0 0 6px ${overallColor}80` : 'none',
              }} />
              <span className="text-[10px] font-mono font-semibold uppercase tracking-widest" style={{ color: overallColor }}>
                {overallLabel}
              </span>
            </div>
          )}
          <button
            className="plt-btn p-1.5"
            onClick={fetchDashboard}
            disabled={dashLoading}
          >
            <Icon icon="refresh" size={12} className={dashLoading ? 'animate-spin text-[#555]' : 'text-[#888]'} />
          </button>
        </div>
      </div>

      {/* Space Weather Strip — always visible */}
      {dashboard?.space_weather && (
        <SpaceWeatherStripBar sw={dashboard.space_weather} />
      )}

      {dashLoading && !dashboard && (
        <div className="flex items-center gap-2 py-8 justify-center">
          <Spinner size={20} />
          <span className="text-[10px] font-mono text-[#555] uppercase">
            Loading operational dashboard...
          </span>
        </div>
      )}

      {dashError && !dashboard && (
        <div className="plt-panel p-3" style={{ borderColor: '#f8514930' }}>
          <div className="flex items-center gap-2 mb-2">
            <Icon icon="error" size={12} style={{ color: '#f85149' }} />
            <span className="text-xs font-semibold text-[#f85149] uppercase tracking-wider">Dashboard Error</span>
          </div>
          <p className="text-[11px] font-mono text-[#888] mb-2">{dashError}</p>
          <button className="plt-btn px-3 py-1 text-[10px] font-mono text-[#888] hover:text-[#e0e0e0]" onClick={fetchDashboard}>
            RETRY
          </button>
        </div>
      )}

      {/* Tabs */}
      <Tabs selectedTabId={activeTab} onChange={(id) => setActiveTab(id as string)}>
        <Tab
          id="operational"
          title="Operational Status"
          panel={
            <div className="mt-3 space-y-3">
              {dashboard ? (
                <>
                  {/* Band Operational Status Grid */}
                  <div>
                    <h3 className="text-[9px] font-mono font-medium text-[#555] uppercase tracking-widest mb-2">
                      Band Status
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-2">
                      {dashboard.band_status.map(b => (
                        <BandStatusCard key={b.band_name} band={b} />
                      ))}
                    </div>
                  </div>

                  {/* Scintillation + Forecast row */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <ScintillationPanel regions={dashboard.scintillation} />
                    <ForecastTimeline forecasts={dashboard.forecasts} />
                  </div>

                  {/* Frequency Routing */}
                  <AlternativesPanel alternatives={dashboard.alternatives} />

                  {/* Timestamp */}
                  {dashboard.space_weather.timestamp && (
                    <div className="text-[9px] font-mono text-right text-[#444] uppercase tracking-wider mt-2">
                      Data: {new Date(dashboard.space_weather.timestamp).toLocaleString()} | Auto-refresh 5min
                    </div>
                  )}
                </>
              ) : (
                <div className="text-[10px] font-mono py-8 text-center text-[#555] uppercase">
                  Loading operational data...
                </div>
              )}
            </div>
          }
        />
        <Tab
          id="satellite"
          title="Satellite RF Profile"
          panel={
            <div className="plt-panel mt-2 p-3">
              <div className="flex gap-4" style={{ minHeight: 300 }}>
                {/* Left: satellite list */}
                <div className="flex-shrink-0" style={{ width: 280 }}>
                  <div className="flex items-center gap-2 mb-2 px-2 py-1.5 rounded-[2px]"
                    style={{ backgroundColor: '#111', border: '1px solid #1a1a1a' }}>
                    <Icon icon="search" size={12} className="text-[#555]" />
                    <input
                      type="text"
                      placeholder="Search satellites..."
                      value={satSearch}
                      onChange={(e) => setSatSearch(e.target.value)}
                      className="bg-transparent border-none outline-none text-[11px] font-mono text-[#e0e0e0] placeholder-[#444] w-full"
                    />
                  </div>
                  {satsLoading ? (
                    <div className="flex items-center gap-2 py-4 justify-center">
                      <Spinner size={16} />
                      <span className="text-xs" style={{ color: '#555' }}>
                        Loading fleet...
                      </span>
                    </div>
                  ) : (
                    <div className="overflow-y-auto" style={{ maxHeight: 450 }}>
                      {satellites
                        .filter(s => {
                          if (!satSearch) return true;
                          const q = satSearch.toLowerCase();
                          return (
                            s.name.toLowerCase().includes(q) ||
                            String(s.norad_id).includes(q) ||
                            (s.country || '').toLowerCase().includes(q) ||
                            (s.operator || '').toLowerCase().includes(q)
                          );
                        })
                        .map(s => {
                          const isSelected = selectedSatId === s.norad_id;
                          const factionColor =
                            s.faction === 'enemy' ? '#ef4444' :
                            s.faction === 'allied' ? '#3b82f6' : '#555';
                          return (
                            <div
                              key={s.id}
                              className={`flex items-center gap-2 px-2 py-1.5 cursor-pointer transition-colors ${isSelected ? '' : 'plt-row'}`}
                              style={{
                                backgroundColor: isSelected ? 'rgba(57,197,207,0.08)' : undefined,
                                borderLeft: isSelected ? '2px solid #39c5cf' : '2px solid transparent',
                                borderRadius: '2px',
                              }}
                              onClick={() => handleSatSelect(s.norad_id)}
                            >
                              <Icon
                                icon="satellite"
                                size={12}
                                style={{ color: factionColor }}
                              />
                              <div className="flex-1 min-w-0">
                                <div className="text-xs font-medium truncate" style={{ color: '#e0e0e0' }}>
                                  {s.name}
                                </div>
                                <div className="flex items-center gap-2 text-[10px]" style={{ color: '#555' }}>
                                  <span style={{ color: '#39c5cf', fontFamily: 'monospace' }}>
                                    {s.norad_id}
                                  </span>
                                  {s.country && <span>{s.country}</span>}
                                  {s.object_type && (
                                    <Tag minimal style={{ fontSize: '9px', padding: '0 3px', lineHeight: '14px' }}>
                                      {s.object_type}
                                    </Tag>
                                  )}
                                </div>
                              </div>
                              {isSelected && satLoading && <Spinner size={12} />}
                            </div>
                          );
                        })}
                      {satellites.length === 0 && !satsLoading && (
                        <div className="text-xs text-center py-4" style={{ color: '#555' }}>
                          No satellites in ontology
                        </div>
                      )}
                    </div>
                  )}
                  <div className="mt-2 text-[10px]" style={{ color: '#555' }}>
                    {satellites.length} satellites in fleet
                  </div>
                </div>

                {/* Right: RF profile for selected satellite */}
                <div className="flex-1 min-w-0" style={{ borderLeft: '1px solid #1a1a1a', paddingLeft: 16 }}>
                  {!selectedSatId && !satProfile && (
                    <div className="flex flex-col items-center justify-center h-full text-center py-12">
                      <Icon icon="satellite" size={24} style={{ color: '#333' }} />
                      <p className="text-[10px] font-mono text-[#555] uppercase tracking-wider mt-3">
                        Select a satellite to view RF profile
                      </p>
                    </div>
                  )}
                  {satLoading && (
                    <div className="flex items-center gap-2 py-8 justify-center">
                      <Spinner size={20} />
                      <span className="text-xs" style={{ color: '#555' }}>
                        Loading RF profile...
                      </span>
                    </div>
                  )}
                  {satProfile && !satLoading && (
                    <div>
                      <div className="flex items-center gap-2 mb-3 pb-2 border-b border-[#1a1a1a]">
                        <span className="plt-badge" style={{
                          backgroundColor: '#39c5cf18',
                          color: '#39c5cf',
                          borderColor: '#39c5cf30',
                        }}>
                          NORAD {satProfile.norad_id}
                        </span>
                        {satProfile.satellite_name && (
                          <span className="text-xs font-mono font-semibold text-[#e0e0e0]">
                            {satProfile.satellite_name}
                          </span>
                        )}
                        <span className="text-[10px] font-mono text-[#555]">
                          {satProfile.transmitters.length} transmitter{satProfile.transmitters.length !== 1 ? 's' : ''}
                        </span>
                      </div>
                      {satProfile.transmitters.length > 0 ? (
                        <TransmitterTable transmitters={satProfile.transmitters} />
                      ) : (
                        <Callout intent="warning" icon="info-sign" className="mt-2">
                          No transmitter data found for this satellite in SatNOGS.
                        </Callout>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          }
        />
        <Tab
          id="bands"
          title="Band Overview"
          panel={
            <div className="plt-panel mt-2 p-3">
              {bandsLoading ? (
                <div className="flex items-center gap-2 py-4">
                  <Spinner size={16} />
                  <span className="text-[10px] font-mono text-[#555] uppercase">Loading band data...</span>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-2 mb-3 pb-2 border-b border-[#1a1a1a]">
                    <Icon icon="panel-stats" size={14} className="text-[#555]" />
                    <h3 className="text-xs font-semibold text-[#e0e0e0] uppercase tracking-wider">
                      Spectrum Band Allocation
                    </h3>
                  </div>
                  <BandOverview bands={bands} />
                  <div className="mt-4">
                    <HTMLTable compact striped style={{ width: '100%' }}>
                      <thead>
                        <tr>
                          <th>Band</th>
                          <th>Range</th>
                          <th>Satellites</th>
                          <th>Transmitters</th>
                        </tr>
                      </thead>
                      <tbody>
                        {bands.map(b => (
                          <tr key={b.band_name}>
                            <td><BandTag band={b.band_name} /></td>
                            <td style={{ color: '#555' }}>{b.frequency_range}</td>
                            <td>{b.satellite_count}</td>
                            <td>{b.transmitter_count}</td>
                          </tr>
                        ))}
                      </tbody>
                    </HTMLTable>
                  </div>
                </>
              )}
            </div>
          }
        />
        <Tab
          id="search"
          title="Search Transmitters"
          panel={
            <div className="plt-panel mt-2 p-3">
              <div className="flex gap-3 items-end flex-wrap mb-3">
                <div>
                  <label className="text-[9px] font-mono text-[#555] uppercase tracking-widest block mb-1">
                    Band
                  </label>
                  <HTMLSelect
                    value={bandFilter}
                    onChange={(e) => setBandFilter(e.target.value)}
                    options={BAND_OPTIONS.map(b => ({ label: b || 'All Bands', value: b }))}
                  />
                </div>
                <div>
                  <label className="text-[9px] font-mono text-[#555] uppercase tracking-widest block mb-1">
                    Mode
                  </label>
                  <HTMLSelect
                    value={modeFilter}
                    onChange={(e) => setModeFilter(e.target.value)}
                    options={MODE_OPTIONS.map(m => ({ label: m || 'All Modes', value: m }))}
                  />
                </div>
                <button
                  className="plt-btn px-3 py-1.5 text-[10px] font-mono font-semibold text-[#888] hover:text-[#e0e0e0] uppercase tracking-wider flex items-center gap-2"
                  onClick={handleSearch}
                  disabled={searchLoading}
                >
                  <Icon icon="search" size={12} className={searchLoading ? 'animate-spin' : ''} />
                  Search
                </button>
              </div>
              {searchTotal > 0 && (
                <p className="text-[10px] font-mono text-[#555] mb-2">
                  Found {searchTotal} transmitters
                </p>
              )}
              <TransmitterTable transmitters={searchResults} />
            </div>
          }
        />
      </Tabs>
    </div>
  );
}
