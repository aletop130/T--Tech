'use client';

import { useEffect, useState, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { riskColor } from '@/lib/severity';
import {
  Collapse,
  Icon,
  Tag,
  Button,
} from '@blueprintjs/core';
import { api, IncidentStats, ConjunctionEvent, SpaceWeatherEvent } from '@/lib/api';
import { format } from 'date-fns';
import Link from 'next/link';
import { ConjunctionAnalysisDialog } from '@/components/dialogs/ConjunctionAnalysisDialog';
import { SpaceWeatherDialog } from '@/components/dialogs/SpaceWeatherDialog';
import { CreateIncidentDialog } from '@/components/dialogs/CreateIncidentDialog';
import { UploadTLEDialog } from '@/components/dialogs/UploadTLEDialog';

const SatelliteModelViewer = dynamic(
  () => import('@/components/Dashboard/SatelliteModelViewer').then(m => ({ default: m.SatelliteModelViewer })),
  { ssr: false, loading: () => <div className="flex items-center justify-center h-full min-h-[300px]"><div className="text-sda-text-secondary text-sm">Loading 3D model...</div></div> },
);

interface DashboardData {
  incidentStats: IncidentStats | null;
  conjunctions: ConjunctionEvent[];
  weatherEvents: SpaceWeatherEvent[];
  satelliteCount: number;
}

const AUTO_REFRESH_MS = 60_000;

/* ── helpers ── */
const riskAccent = (level: string) => {
  const map: Record<string, string> = { critical: '#f85149', high: '#ff7a45', medium: '#d29922', low: '#3fb950' };
  return map[level.toLowerCase()] ?? '#39c5cf';
};
const weatherIcon = (type: string) => {
  if (type.includes('flare')) return 'flash';
  if (type.includes('storm') || type.includes('geomagnetic')) return 'hurricane';
  if (type.includes('radiation') || type.includes('proton')) return 'ion';
  return 'cloud';
};
const statusIcon = (status: string) => {
  const map: Record<string, string> = { open: 'issue', investigating: 'search', resolved: 'tick-circle', monitoring: 'eye-open' };
  return map[status] ?? 'dot';
};
const statusColor = (status: string) => {
  const map: Record<string, string> = { open: '#d29922', investigating: '#2f81f7', resolved: '#3fb950', monitoring: '#39c5cf' };
  return map[status] ?? '#a0a0a0';
};

export default function DashboardPage() {
  const [mounted, setMounted] = useState(false);
  const [data, setData] = useState<DashboardData>({
    incidentStats: null,
    conjunctions: [],
    weatherEvents: [],
    satelliteCount: 0,
  });
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [systemHealth, setSystemHealth] = useState<'nominal' | 'degraded'>('nominal');
  const [refreshingDebris, setRefreshingDebris] = useState(false);
  const [timelineEvents, setTimelineEvents] = useState<Array<{id: string; type: string; title: string; time: string; severity?: string}>>([]);
  const [timelineOpen, setTimelineOpen] = useState(true);

  const [conjunctionDialogOpen, setConjunctionDialogOpen] = useState(false);
  const [weatherDialogOpen, setWeatherDialogOpen] = useState(false);
  const [incidentDialogOpen, setIncidentDialogOpen] = useState(false);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [stats, conjunctions, weather, satellites, timeline] = await Promise.all([
        api.getIncidentStats(),
        api.getConjunctions({ page_size: 5, is_actionable: true }),
        api.getSpaceWeatherEvents({ page_size: 5 }),
        api.getSatellites({ page_size: 1 }),
        api.getTimelineEvents({ date: format(new Date(), 'yyyy-MM-dd') }),
      ]);
      setData({
        incidentStats: stats,
        conjunctions: conjunctions.items,
        weatherEvents: weather.items,
        satelliteCount: satellites.total,
      });
      setTimelineEvents(timeline.events);
      setLastRefresh(new Date());
    } catch (error) {
      console.warn('Failed to load dashboard:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadHealth = useCallback(async () => {
    try {
      const health = await api.getHealth();
      setSystemHealth(health.status === 'healthy' ? 'nominal' : 'degraded');
    } catch {
      setSystemHealth('degraded');
    }
  }, []);

  const refreshCelestrakDebris = async () => {
    setRefreshingDebris(true);
    try {
      await api.fetchCelestrakDebris();
      if (typeof window !== 'undefined') window.dispatchEvent(new Event('refreshDebris'));
    } catch (error) {
      console.warn('Failed to refresh Celestrak debris:', error);
    } finally {
      setRefreshingDebris(false);
    }
  };

  useEffect(() => {
    setMounted(true);
    loadData();
    loadHealth();
    const interval = setInterval(() => { loadData(); loadHealth(); }, AUTO_REFRESH_MS);
    return () => clearInterval(interval);
  }, [loadData, loadHealth]);

  /* ── derived stats ── */
  const totalIncidents = data.incidentStats?.total || 0;
  const openCount = data.incidentStats?.open_count || 0;
  const criticalCount = data.incidentStats?.critical_count || 0;
  const resolvedCount = data.incidentStats?.by_status?.resolved || 0;
  const ringRadius = 35;
  const ringCircumference = 2 * Math.PI * ringRadius;

  return (
    <div className="space-y-6 bg-sda-bg-primary">
      {/* ═══ Header ═══ */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-sda-text-primary tracking-tight">
            Space Domain Awareness
          </h1>
          <p className="text-xs text-sda-text-secondary mt-0.5">Operational Command Dashboard</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-sda-bg-tertiary/60 border border-sda-border-default/40">
            <div className="refresh-indicator" />
            <span className="text-[10px] font-semibold text-sda-accent-green tracking-widest uppercase">Live</span>
            <span className="text-[10px] text-sda-text-secondary">
              {mounted && lastRefresh ? format(lastRefresh, 'HH:mm:ss') : '--:--:--'}
            </span>
          </div>
          <Button
            icon="refresh"
            minimal
            small
            loading={loading}
            onClick={() => { loadData(); loadHealth(); }}
          />
        </div>
      </div>

      {/* ═══ Hero — 3D Satellite + KPIs ═══ */}
      <div className="dashboard-hero p-6">
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* 3D model */}
          <div className="lg:col-span-3 h-[420px] relative">
            <SatelliteModelViewer />
            <div className="absolute bottom-3 left-4 text-[9px] text-sda-text-secondary/40 tracking-wider uppercase font-medium">
              Landsat &mdash; NASA 3D Resources
            </div>
          </div>

          {/* KPI stack */}
          <div className="lg:col-span-2 flex flex-col gap-3 justify-center">
            {/* Tracked Objects */}
            <div className="kpi-card p-4 bg-sda-bg-secondary rounded-xl" style={{ '--kpi-accent': '#39c5cf' } as React.CSSProperties}>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-sda-accent-cyan/15 flex items-center justify-center">
                  <Icon icon="satellite" size={20} className="text-sda-accent-cyan" />
                </div>
                <div className="flex-1">
                  <div className="text-[10px] text-sda-text-secondary uppercase tracking-widest font-medium">Tracked Objects</div>
                  <div className="text-3xl font-bold tracking-tight leading-none mt-0.5">{data.satelliteCount.toLocaleString()}</div>
                </div>
                <Icon icon="arrow-up" size={12} className="text-sda-accent-green opacity-60" />
              </div>
            </div>

            {/* Open Incidents */}
            <div className="kpi-card p-4 bg-sda-bg-secondary rounded-xl" style={{ '--kpi-accent': '#d29922' } as React.CSSProperties}>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-sda-accent-yellow/15 flex items-center justify-center">
                  <Icon icon="warning-sign" size={20} className="text-sda-accent-yellow" />
                </div>
                <div className="flex-1">
                  <div className="text-[10px] text-sda-text-secondary uppercase tracking-widest font-medium">Open Incidents</div>
                  <div className="text-3xl font-bold tracking-tight leading-none mt-0.5">{openCount}</div>
                </div>
                {criticalCount > 0 && (
                  <span className="text-[10px] font-bold text-sda-accent-red bg-sda-accent-red/15 px-2 py-0.5 rounded-md">
                    {criticalCount} CRIT
                  </span>
                )}
              </div>
            </div>

            {/* Conjunctions Today */}
            <div className="kpi-card p-4 bg-sda-bg-secondary rounded-xl" style={{ '--kpi-accent': '#f85149' } as React.CSSProperties}>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-sda-accent-red/15 flex items-center justify-center">
                  <Icon icon="intersection" size={20} className="text-sda-accent-red" />
                </div>
                <div className="flex-1">
                  <div className="text-[10px] text-sda-text-secondary uppercase tracking-widest font-medium">Actionable Conjunctions</div>
                  <div className="text-3xl font-bold tracking-tight leading-none mt-0.5">{data.conjunctions.length}</div>
                </div>
              </div>
            </div>

            {/* System Health */}
            <div className="kpi-card p-4 bg-sda-bg-secondary rounded-xl" style={{ '--kpi-accent': systemHealth === 'nominal' ? '#3fb950' : '#f85149' } as React.CSSProperties}>
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                  systemHealth === 'nominal' ? 'bg-sda-accent-green/15' : 'bg-sda-accent-red/15'
                }`}>
                  <Icon
                    icon={systemHealth === 'nominal' ? 'tick-circle' : 'error'}
                    size={20}
                    className={systemHealth === 'nominal' ? 'text-sda-accent-green' : 'text-sda-accent-red'}
                  />
                </div>
                <div className="flex-1">
                  <div className="text-[10px] text-sda-text-secondary uppercase tracking-widest font-medium">System Health</div>
                  <div className={`text-3xl font-bold tracking-tight leading-none mt-0.5 ${
                    systemHealth === 'nominal' ? 'text-sda-accent-green' : 'text-sda-accent-red'
                  }`}>
                    {systemHealth === 'nominal' ? 'Nominal' : 'Degraded'}
                  </div>
                </div>
                <div className={`w-2 h-2 rounded-full ${systemHealth === 'nominal' ? 'bg-sda-accent-green' : 'bg-sda-accent-red'}`}
                  style={{ boxShadow: `0 0 8px ${systemHealth === 'nominal' ? '#3fb950' : '#f85149'}` }} />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ═══ Content Grid ═══ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        {/* ── Actionable Conjunctions ── */}
        <div className="dash-card p-5" style={{ '--card-accent': 'rgba(248, 81, 73, 0.5)' } as React.CSSProperties}>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="dash-icon-badge bg-sda-accent-red/15">
                <Icon icon="intersection" size={16} className="text-sda-accent-red" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-sda-text-primary">Actionable Conjunctions</h2>
                <p className="text-[10px] text-sda-text-secondary mt-0.5">Closest approach events requiring action</p>
              </div>
            </div>
            <Link href="/explorer?type=conjunction">
              <Button minimal small rightIcon="arrow-right" className="text-xs">All</Button>
            </Link>
          </div>

          <div className="space-y-2.5">
            {data.conjunctions.length === 0 ? (
              <div className="text-sda-text-secondary text-center py-10 text-sm">
                <Icon icon="tick-circle" className="text-sda-accent-green mb-2" size={20} /><br />
                No actionable conjunctions
              </div>
            ) : (
              data.conjunctions.map((event) => (
                <div
                  key={event.id}
                  className="threat-row"
                  style={{ '--row-accent': riskAccent(event.risk_level) } as React.CSSProperties}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-semibold text-sda-text-primary truncate">
                          {event.object1_name || event.primary_object_id}
                        </span>
                        <Icon icon="arrow-right" size={10} className="text-sda-text-secondary flex-shrink-0" />
                        <span className="text-xs font-semibold text-sda-text-primary truncate">
                          {event.object2_name || event.secondary_object_id}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-[11px] text-sda-text-secondary">
                        <span>TCA {format(new Date(event.tca), 'MMM d HH:mm')}z</span>
                        <span className="opacity-40">|</span>
                        <span>{event.miss_distance_km.toFixed(3)} km</span>
                        {event.collision_probability != null && (
                          <>
                            <span className="opacity-40">|</span>
                            <span className="font-mono text-[10px]">Pc {(event.collision_probability * 100).toFixed(4)}%</span>
                          </>
                        )}
                      </div>
                    </div>
                    <span
                      className="severity-pill ml-3 flex-shrink-0"
                      style={{ background: `${riskAccent(event.risk_level)}20`, color: riskAccent(event.risk_level) }}
                    >
                      {event.risk_level.toUpperCase()}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* ── Space Weather ── */}
        <div className="dash-card p-5" style={{ '--card-accent': 'rgba(210, 153, 34, 0.5)' } as React.CSSProperties}>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="dash-icon-badge bg-sda-accent-yellow/15">
                <Icon icon="flash" size={16} className="text-sda-accent-yellow" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-sda-text-primary">Space Weather</h2>
                <p className="text-[10px] text-sda-text-secondary mt-0.5">Solar &amp; geomagnetic activity</p>
              </div>
            </div>
            <Link href="/explorer?type=space_weather">
              <Button minimal small rightIcon="arrow-right" className="text-xs">All</Button>
            </Link>
          </div>

          <div className="space-y-2.5">
            {data.weatherEvents.length === 0 ? (
              <div className="text-sda-text-secondary text-center py-10 text-sm">
                <Icon icon="cloud" className="text-sda-accent-green mb-2" size={20} /><br />
                No active weather events
              </div>
            ) : (
              data.weatherEvents.map((event) => (
                <div
                  key={event.id}
                  className="threat-row"
                  style={{ '--row-accent': riskColor(event.severity) } as React.CSSProperties}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <Icon icon={weatherIcon(event.event_type) as any} size={14} style={{ color: riskColor(event.severity) }} className="flex-shrink-0" />
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-sda-text-primary capitalize truncate">
                          {event.event_type.replace(/_/g, ' ')}
                        </div>
                        <div className="flex items-center gap-2 text-[11px] text-sda-text-secondary mt-0.5">
                          <span>{format(new Date(event.start_time), 'MMM d HH:mm')}z</span>
                          {event.kp_index != null && (
                            <>
                              <span className="opacity-40">|</span>
                              <span className="font-mono">Kp {event.kp_index}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                    <span
                      className="severity-pill ml-3 flex-shrink-0"
                      style={{ background: `${riskColor(event.severity)}20`, color: riskColor(event.severity) }}
                    >
                      {event.severity.toUpperCase()}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* ── Incident Overview ── */}
        <div className="dash-card p-5" style={{ '--card-accent': 'rgba(47, 129, 247, 0.5)' } as React.CSSProperties}>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="dash-icon-badge bg-sda-accent-blue/15">
                <Icon icon="th-list" size={16} className="text-sda-accent-blue" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-sda-text-primary">Incident Overview</h2>
                <p className="text-[10px] text-sda-text-secondary mt-0.5">{totalIncidents} total across all statuses</p>
              </div>
            </div>
            <Link href="/operations?tab=incidents">
              <Button minimal small rightIcon="arrow-right" className="text-xs">All</Button>
            </Link>
          </div>

          {data.incidentStats ? (
            <div className="flex items-start gap-6">
              {/* Ring gauge */}
              <div className="flex-shrink-0 relative" style={{ width: 90, height: 90 }}>
                <svg viewBox="0 0 80 80" className="ring-gauge w-full h-full -rotate-90">
                  <circle className="ring-track" cx="40" cy="40" r={ringRadius} strokeWidth="6" />
                  {totalIncidents > 0 && (
                    <circle
                      className="ring-fill"
                      cx="40" cy="40" r={ringRadius}
                      strokeWidth="6"
                      stroke="#3fb950"
                      strokeDasharray={ringCircumference}
                      strokeDashoffset={ringCircumference - (resolvedCount / totalIncidents) * ringCircumference}
                      style={{ '--ring-circumference': ringCircumference } as React.CSSProperties}
                    />
                  )}
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-lg font-bold leading-none">{resolvedCount}</span>
                  <span className="text-[8px] text-sda-text-secondary uppercase tracking-wider mt-0.5">resolved</span>
                </div>
              </div>

              {/* Status breakdown */}
              <div className="flex-1 space-y-2.5">
                {Object.entries(data.incidentStats.by_status).map(([status, count]) => (
                  <div key={status} className="flex items-center gap-3">
                    <Icon icon={statusIcon(status) as any} size={12} style={{ color: statusColor(status) }} />
                    <span className="text-xs capitalize flex-1">{status}</span>
                    <span className="text-xs font-bold font-mono">{count}</span>
                    <div className="w-16 h-1.5 rounded-full bg-sda-bg-tertiary overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-700"
                        style={{
                          width: `${totalIncidents > 0 ? (count / totalIncidents) * 100 : 0}%`,
                          backgroundColor: statusColor(status),
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="text-sda-text-secondary text-center py-10 text-sm">Loading...</div>
          )}
        </div>

        {/* ── Quick Actions ── */}
        <div className="dash-card p-5" style={{ '--card-accent': 'rgba(57, 197, 207, 0.4)' } as React.CSSProperties}>
          <div className="flex items-center gap-3 mb-4">
            <div className="dash-icon-badge bg-sda-accent-cyan/15">
              <Icon icon="lightning" size={16} className="text-sda-accent-cyan" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-sda-text-primary">Quick Actions</h2>
              <p className="text-[10px] text-sda-text-secondary mt-0.5">Common operations</p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <button className="action-tile" onClick={() => setConjunctionDialogOpen(true)}>
              <div className="action-icon bg-sda-accent-red/15" style={{ '--action-accent': '#f85149' } as React.CSSProperties}>
                <Icon icon="satellite" size={20} className="text-sda-accent-red" />
              </div>
              <span className="text-[11px] font-medium text-sda-text-primary leading-tight">Conjunction<br/>Analysis</span>
            </button>

            <button className="action-tile" onClick={() => setWeatherDialogOpen(true)}>
              <div className="action-icon bg-sda-accent-yellow/15" style={{ '--action-accent': '#d29922' } as React.CSSProperties}>
                <Icon icon="flash" size={20} className="text-sda-accent-yellow" />
              </div>
              <span className="text-[11px] font-medium text-sda-text-primary leading-tight">Space<br/>Weather</span>
            </button>

            <button className="action-tile" onClick={() => setIncidentDialogOpen(true)}>
              <div className="action-icon bg-sda-accent-blue/15" style={{ '--action-accent': '#2f81f7' } as React.CSSProperties}>
                <Icon icon="issue-new" size={20} className="text-sda-accent-blue" />
              </div>
              <span className="text-[11px] font-medium text-sda-text-primary leading-tight">Create<br/>Incident</span>
            </button>

            <button className="action-tile" onClick={() => setUploadDialogOpen(true)}>
              <div className="action-icon bg-green-500/15" style={{ '--action-accent': '#3fb950' } as React.CSSProperties}>
                <Icon icon="import" size={20} className="text-sda-accent-green" />
              </div>
              <span className="text-[11px] font-medium text-sda-text-primary leading-tight">Upload<br/>TLE</span>
            </button>

            <button className="action-tile" onClick={refreshCelestrakDebris} disabled={refreshingDebris}>
              <div className="action-icon bg-purple-500/15" style={{ '--action-accent': '#a78bfa' } as React.CSSProperties}>
                {refreshingDebris
                  ? <Icon icon="refresh" size={20} className="text-purple-400 animate-spin" />
                  : <Icon icon="refresh" size={20} className="text-purple-400" />
                }
              </div>
              <span className="text-[11px] font-medium text-sda-text-primary leading-tight">Celestrak<br/>Debris</span>
            </button>

            <Link href="/map" className="action-tile no-underline">
              <div className="action-icon bg-sda-accent-cyan/15" style={{ '--action-accent': '#39c5cf' } as React.CSSProperties}>
                <Icon icon="globe" size={20} className="text-sda-accent-cyan" />
              </div>
              <span className="text-[11px] font-medium text-sda-text-primary leading-tight">Open<br/>Map</span>
            </Link>
          </div>
        </div>
      </div>

      {/* ═══ Timeline ═══ */}
      <div className="dash-card p-5" style={{ '--card-accent': 'rgba(57, 197, 207, 0.3)' } as React.CSSProperties}>
        <div
          className="flex items-center justify-between mb-3 cursor-pointer select-none"
          onClick={() => setTimelineOpen(!timelineOpen)}
        >
          <div className="flex items-center gap-3">
            <div className="dash-icon-badge bg-sda-accent-cyan/15">
              <Icon icon="timeline-events" size={16} className="text-sda-accent-cyan" />
            </div>
            <h2 className="text-sm font-semibold text-sda-text-primary">Recent Events</h2>
            <span className="text-[10px] text-sda-text-secondary bg-sda-bg-tertiary px-2 py-0.5 rounded-md font-mono">
              {timelineEvents.length}
            </span>
          </div>
          <Icon icon={timelineOpen ? 'chevron-up' : 'chevron-down'} size={14} className="text-sda-text-secondary" />
        </div>
        <Collapse isOpen={timelineOpen}>
          <div className="max-h-64 overflow-y-auto pr-1">
            {timelineEvents.length === 0 ? (
              <div className="text-sda-text-secondary text-center py-6 text-xs">No events today</div>
            ) : (
              timelineEvents.slice(0, 10).map((event) => {
                const dotColor = event.severity === 'critical' ? '#f85149'
                  : event.severity === 'warning' || event.severity === 'high' ? '#d29922'
                  : event.type === 'conjunction' ? '#ff7a45'
                  : event.type === 'space_weather' ? '#d29922'
                  : '#39c5cf';
                return (
                  <div
                    key={event.id}
                    className="timeline-entry py-2.5"
                    style={{ '--dot-color': dotColor } as React.CSSProperties}
                  >
                    <div className="flex items-center justify-between">
                      <div className="min-w-0 flex-1">
                        <span className="text-xs font-medium text-sda-text-primary block truncate">{event.title}</span>
                        <span className="text-[10px] text-sda-text-secondary">{event.time}</span>
                      </div>
                      {event.severity && (
                        <Tag
                          minimal
                          intent={event.severity === 'critical' ? 'danger' : event.severity === 'warning' ? 'warning' : 'none'}
                          className="text-[10px] ml-2 flex-shrink-0"
                        >
                          {event.severity}
                        </Tag>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </Collapse>
      </div>

      {/* Dialogs */}
      <ConjunctionAnalysisDialog isOpen={conjunctionDialogOpen} onClose={() => setConjunctionDialogOpen(false)} onComplete={() => loadData()} />
      <SpaceWeatherDialog isOpen={weatherDialogOpen} onClose={() => setWeatherDialogOpen(false)} />
      <CreateIncidentDialog isOpen={incidentDialogOpen} onClose={() => setIncidentDialogOpen(false)} onCreated={() => loadData()} />
      <UploadTLEDialog isOpen={uploadDialogOpen} onClose={() => setUploadDialogOpen(false)} onUploaded={() => loadData()} />
    </div>
  );
}
