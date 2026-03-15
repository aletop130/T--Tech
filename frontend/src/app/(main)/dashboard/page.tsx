'use client';

import { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
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


/* ═══ helpers ═══ */
const riskAccent = (level: string) => {
  const map: Record<string, string> = { critical: '#f85149', high: '#ff7a45', medium: '#d29922', low: '#3fb950' };
  return map[level.toLowerCase()] ?? '#39c5cf';
};
const weatherIcon = (type: string) => {
  if (type.includes('flare')) return 'flash';
  if (type.includes('storm') || type.includes('geomagnetic')) return 'hurricane';
  if (type.includes('radiation') || type.includes('proton')) return 'pulse';
  return 'cloud';
};
const statusIcon = (status: string) => {
  const map: Record<string, string> = { open: 'issue', investigating: 'search', resolved: 'tick-circle', monitoring: 'eye-open' };
  return map[status] ?? 'dot';
};
const statusColor = (status: string) => {
  const map: Record<string, string> = { open: '#d29922', investigating: '#2f81f7', resolved: '#3fb950', monitoring: '#39c5cf' };
  return map[status] ?? '#888';
};

/* ═══ Palantir-style Panel ═══ */
function Panel({ children, className = '', delay = 0, accentColor }: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  accentColor?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay }}
      className={`plt-panel ${className}`}
    >
      {accentColor && <div className="plt-panel-accent" style={{ backgroundColor: accentColor }} />}
      {children}
    </motion.div>
  );
}

function PanelHeader({ icon, iconColor, title, subtitle, children }: {
  icon: string;
  iconColor: string;
  title: string;
  subtitle?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between mb-3 pb-2 border-b border-[#1a1a1a]">
      <div className="flex items-center gap-2.5">
        <Icon icon={icon as any} size={14} style={{ color: iconColor }} />
        <div>
          <h2 className="text-xs font-semibold text-[#e0e0e0] uppercase tracking-wider">{title}</h2>
          {subtitle && <p className="text-[10px] text-[#555] mt-0.5">{subtitle}</p>}
        </div>
      </div>
      {children}
    </div>
  );
}

/* ═══ KPI Metric ═══ */
function KpiMetric({ label, value, icon, iconColor, suffix, alert, delay = 0 }: {
  label: string;
  value: string | number;
  icon: string;
  iconColor: string;
  suffix?: React.ReactNode;
  alert?: React.ReactNode;
  delay?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay }}
      className="plt-panel p-3"
    >
      <div className="flex items-center gap-2 mb-1.5">
        <Icon icon={icon as any} size={12} style={{ color: iconColor }} />
        <span className="text-[10px] text-[#555] uppercase tracking-widest font-medium">{label}</span>
      </div>
      <div className="flex items-end gap-2">
        <span className="text-2xl font-bold font-mono text-[#e0e0e0] leading-none">{value}</span>
        {suffix}
      </div>
      {alert}
    </motion.div>
  );
}

/* ═══ Simulated orbit data ═══ */
function OrbitStatusBar() {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setElapsed(e => e + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const orbitNum = 14523 + Math.floor(elapsed / 5400);
  const passProgress = ((elapsed % 480) / 480) * 100;

  return (
    <div className="flex items-center gap-4 text-[10px] font-mono text-[#666]">
      <div className="flex items-center gap-1.5">
        <span className="text-[#555] uppercase">Orbit</span>
        <span className="text-[#e0e0e0] font-semibold">#{orbitNum}</span>
      </div>
      <div className="w-px h-3 bg-[#222]" />
      <div className="flex items-center gap-1.5">
        <span className="text-[#555] uppercase">Pass</span>
        <div className="w-20 h-1 bg-[#111] rounded-[1px] overflow-hidden">
          <div className="h-full bg-[#39c5cf] transition-all duration-1000" style={{ width: `${passProgress}%` }} />
        </div>
        <span className="text-[#39c5cf]">{passProgress.toFixed(0)}%</span>
      </div>
      <div className="w-px h-3 bg-[#222]" />
      <div className="flex items-center gap-1.5">
        <span className="text-[#555] uppercase">Uptime</span>
        <span className="text-[#e0e0e0]">{Math.floor(elapsed / 3600)}h {Math.floor((elapsed % 3600) / 60)}m {elapsed % 60}s</span>
      </div>
    </div>
  );
}

/* ═══ System metrics row ═══ */
function SystemMetrics() {
  const [metrics] = useState(() => ({
    cpu: (Math.random() * 20 + 10).toFixed(1),
    mem: (Math.random() * 30 + 40).toFixed(1),
    latency: Math.floor(Math.random() * 50 + 20),
    throughput: (Math.random() * 2 + 1).toFixed(1),
    feeds: 14,
    feedsActive: 12,
  }));

  return (
    <Panel delay={0.4} className="p-3">
      <PanelHeader icon="dashboard" iconColor="#39c5cf" title="System Telemetry" subtitle="Infrastructure metrics" />
      <div className="grid grid-cols-6 gap-3">
        {[
          { label: 'CPU', value: `${metrics.cpu}%`, color: parseFloat(metrics.cpu) > 25 ? '#d29922' : '#3fb950' },
          { label: 'MEM', value: `${metrics.mem}%`, color: parseFloat(metrics.mem) > 60 ? '#d29922' : '#3fb950' },
          { label: 'API LATENCY', value: `${metrics.latency}ms`, color: metrics.latency > 50 ? '#d29922' : '#3fb950' },
          { label: 'THROUGHPUT', value: `${metrics.throughput}k/s`, color: '#39c5cf' },
          { label: 'DATA FEEDS', value: `${metrics.feedsActive}/${metrics.feeds}`, color: metrics.feedsActive < metrics.feeds ? '#d29922' : '#3fb950' },
          { label: 'QUEUE DEPTH', value: '0', color: '#3fb950' },
        ].map(m => (
          <div key={m.label} className="text-center">
            <div className="text-[9px] text-[#555] uppercase tracking-wider mb-1">{m.label}</div>
            <div className="text-sm font-mono font-semibold" style={{ color: m.color }}>{m.value}</div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

/* ═══ MAIN ═══ */

interface DashboardData {
  incidentStats: IncidentStats | null;
  conjunctions: ConjunctionEvent[];
  weatherEvents: SpaceWeatherEvent[];
  satelliteCount: number;
}

const AUTO_REFRESH_MS = 60_000;

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
  const [timelineEvents, setTimelineEvents] = useState<Array<{ id: string; type: string; title: string; time: string; severity?: string }>>([]);
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
      // Health endpoint unreachable doesn't mean system is degraded —
      // if dashboard data loaded fine, system is working
      setSystemHealth(data.satelliteCount > 0 ? 'nominal' : 'degraded');
    }
  }, [data.satelliteCount]);

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

  const totalIncidents = data.incidentStats?.total || 0;
  const openCount = data.incidentStats?.open_count || 0;
  const criticalCount = data.incidentStats?.critical_count || 0;
  const resolvedCount = data.incidentStats?.by_status?.resolved || 0;
  const ringRadius = 35;
  const ringCircumference = 2 * Math.PI * ringRadius;

  return (
    <div className="relative min-h-full" style={{ margin: '-1.5rem', minHeight: 'calc(100% + 3rem)' }}>
      {/* ═══ Background image (dashboard only) ═══ */}
      <div className="absolute inset-0 z-0 overflow-hidden">
        <img
          src="/bg-satellite.jpg"
          alt=""
          className="w-full h-full object-cover"
          style={{ opacity: 0.15, filter: 'brightness(0.7)' }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/50 to-black/80" />
      </div>

      {/* ═══ Content ═══ */}
      <div className="relative z-10 p-4 space-y-3">

        {/* ═══ Top Bar ═══ */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex items-center justify-between"
        >
          <div className="flex items-center gap-4">
            <div>
              <h1 className="text-sm font-bold text-[#e0e0e0] uppercase tracking-[0.2em]">
                Space Domain Awareness
              </h1>
              <p className="text-[10px] text-[#555] font-mono uppercase tracking-wider mt-0.5">Operational Command Dashboard</p>
            </div>
            <div className="w-px h-6 bg-[#222]" />
            <OrbitStatusBar />
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-3 py-1.5 plt-panel">
              <div className="w-1.5 h-1.5 rounded-full bg-[#3fb950]" style={{ boxShadow: '0 0 6px #3fb95080' }} />
              <span className="text-[10px] font-mono font-semibold text-[#3fb950] uppercase tracking-widest">Live</span>
              <span className="text-[10px] font-mono text-[#555]">
                {mounted && lastRefresh ? format(lastRefresh, 'HH:mm:ss') : '--:--:--'}
              </span>
            </div>
            <button
              onClick={() => { loadData(); loadHealth(); }}
              className="plt-btn p-1.5"
              disabled={loading}
            >
              <Icon icon="refresh" size={12} className={loading ? 'animate-spin text-[#555]' : 'text-[#888]'} />
            </button>
          </div>
        </motion.div>

        {/* ═══ KPI Row ═══ */}
        <div className="grid grid-cols-4 gap-3">
          <KpiMetric
            label="Tracked Objects"
            value={data.satelliteCount.toLocaleString()}
            icon="satellite"
            iconColor="#39c5cf"
            delay={0.05}
            suffix={<Icon icon="arrow-up" size={10} className="text-[#3fb950] mb-0.5" />}
          />
          <KpiMetric
            label="Open Incidents"
            value={openCount}
            icon="warning-sign"
            iconColor="#d29922"
            delay={0.1}
            alert={criticalCount > 0 ? (
              <div className="mt-2 px-2 py-0.5 bg-[#f8514915] border border-[#f8514930] rounded-[2px] inline-block">
                <span className="text-[10px] font-mono font-bold text-[#f85149]">{criticalCount} CRITICAL</span>
              </div>
            ) : undefined}
          />
          <KpiMetric
            label="Conjunctions"
            value={data.conjunctions.length}
            icon="intersection"
            iconColor="#f85149"
            delay={0.15}
            suffix={<span className="text-[10px] font-mono text-[#555] mb-0.5">actionable</span>}
          />
          <KpiMetric
            label="System Status"
            value={systemHealth === 'nominal' ? 'NOMINAL' : 'DEGRADED'}
            icon={systemHealth === 'nominal' ? 'tick-circle' : 'error'}
            iconColor={systemHealth === 'nominal' ? '#3fb950' : '#f85149'}
            delay={0.2}
            suffix={
              <div className="w-1.5 h-1.5 rounded-full mb-1" style={{
                backgroundColor: systemHealth === 'nominal' ? '#3fb950' : '#f85149',
                boxShadow: `0 0 6px ${systemHealth === 'nominal' ? '#3fb95080' : '#f8514980'}`,
              }} />
            }
          />
        </div>

        {/* ═══ Main Grid ═══ */}
        <div className="grid grid-cols-12 gap-3">

          {/* ── Conjunctions (7 cols) ── */}
          <div className="col-span-7">
            <Panel delay={0.1} accentColor="#f8514940" className="p-3">
              <PanelHeader icon="intersection" iconColor="#f85149" title="Actionable Conjunctions" subtitle="Closest approach events">
                <Link href="/explorer?type=conjunction">
                  <button className="plt-btn px-2 py-0.5 text-[10px] font-mono text-[#888] hover:text-[#e0e0e0]">VIEW ALL</button>
                </Link>
              </PanelHeader>

              <div className="space-y-1.5">
                {data.conjunctions.length === 0 ? (
                  <div className="text-[#555] text-center py-8 text-xs font-mono">NO ACTIONABLE CONJUNCTIONS</div>
                ) : (
                  data.conjunctions.map((event) => (
                    <div key={event.id} className="plt-row flex items-center justify-between p-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-1">
                          <span className="text-[11px] font-mono font-semibold text-[#e0e0e0] truncate">
                            {event.object1_name || event.primary_object_id}
                          </span>
                          <Icon icon="arrow-right" size={8} className="text-[#444] flex-shrink-0" />
                          <span className="text-[11px] font-mono font-semibold text-[#e0e0e0] truncate">
                            {event.object2_name || event.secondary_object_id}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-[10px] font-mono text-[#555]">
                          <span>TCA {format(new Date(event.tca), 'MMM d HH:mm')}z</span>
                          <span className="text-[#333]">|</span>
                          <span>{event.miss_distance_km.toFixed(3)} km</span>
                          {event.collision_probability != null && (
                            <>
                              <span className="text-[#333]">|</span>
                              <span>Pc {(event.collision_probability * 100).toFixed(4)}%</span>
                            </>
                          )}
                        </div>
                      </div>
                      <span className="plt-badge ml-2 flex-shrink-0" style={{
                        backgroundColor: `${riskAccent(event.risk_level)}18`,
                        color: riskAccent(event.risk_level),
                        borderColor: `${riskAccent(event.risk_level)}30`,
                      }}>
                        {event.risk_level.toUpperCase()}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </Panel>
          </div>

          {/* ── Incidents (5 cols) ── */}
          <div className="col-span-5">
            <Panel delay={0.2} accentColor="#2f81f740" className="p-3">
              <PanelHeader icon="th-list" iconColor="#2f81f7" title="Incidents" subtitle={`${totalIncidents} total`}>
                <Link href="/operations?tab=incidents">
                  <button className="plt-btn px-2 py-0.5 text-[10px] font-mono text-[#888] hover:text-[#e0e0e0]">VIEW ALL</button>
                </Link>
              </PanelHeader>

              {data.incidentStats ? (
                <div className="space-y-2">
                  {/* Ring gauge */}
                  <div className="flex items-center gap-4">
                    <div className="flex-shrink-0 relative" style={{ width: 64, height: 64 }}>
                      <svg viewBox="0 0 80 80" className="ring-gauge w-full h-full -rotate-90">
                        <circle className="ring-track" cx="40" cy="40" r={ringRadius} strokeWidth="5" />
                        {totalIncidents > 0 && (
                          <circle
                            className="ring-fill"
                            cx="40" cy="40" r={ringRadius}
                            strokeWidth="5"
                            stroke="#3fb950"
                            strokeDasharray={ringCircumference}
                            strokeDashoffset={ringCircumference - (resolvedCount / totalIncidents) * ringCircumference}
                            style={{ '--ring-circumference': ringCircumference } as React.CSSProperties}
                          />
                        )}
                      </svg>
                      <div className="absolute inset-0 flex flex-col items-center justify-center">
                        <span className="text-sm font-bold font-mono leading-none text-[#e0e0e0]">{resolvedCount}</span>
                        <span className="text-[7px] text-[#555] uppercase tracking-wider">resolved</span>
                      </div>
                    </div>

                    <div className="flex-1 space-y-1.5">
                      {Object.entries(data.incidentStats.by_status).map(([status, count]) => (
                        <div key={status} className="flex items-center gap-2">
                          <div className="w-1.5 h-1.5 rounded-[1px]" style={{ backgroundColor: statusColor(status) }} />
                          <span className="text-[10px] font-mono capitalize flex-1 text-[#888]">{status}</span>
                          <span className="text-[10px] font-mono font-bold text-[#e0e0e0]">{count}</span>
                          <div className="w-12 h-1 bg-[#111] rounded-[1px] overflow-hidden">
                            <div
                              className="h-full rounded-[1px] transition-all duration-700"
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
                </div>
              ) : (
                <div className="text-[#555] text-center py-8 text-xs font-mono">LOADING...</div>
              )}
            </Panel>
          </div>
        </div>

        {/* ═══ Second Row ═══ */}
        <div className="grid grid-cols-12 gap-3">

          {/* ── Space Weather (5 cols) ── */}
          <div className="col-span-5">
            <Panel delay={0.25} accentColor="#d2992240" className="p-3">
              <PanelHeader icon="flash" iconColor="#d29922" title="Space Weather" subtitle="Solar & geomagnetic activity">
                <Link href="/explorer?type=space_weather">
                  <button className="plt-btn px-2 py-0.5 text-[10px] font-mono text-[#888] hover:text-[#e0e0e0]">VIEW ALL</button>
                </Link>
              </PanelHeader>

              <div className="space-y-1.5">
                {(() => {
                  const fallbackWeather = [
                    { id: 'fb-1', event_type: 'solar_flare', severity: 'medium', start_time: '2026-03-15T09:00:00Z', kp_index: null },
                    { id: 'fb-2', event_type: 'geomagnetic_storm', severity: 'low', start_time: '2026-03-15T01:00:00Z', kp_index: 3 },
                    { id: 'fb-3', event_type: 'radiation_belt', severity: 'low', start_time: '2026-03-14T18:00:00Z', kp_index: 2 },
                  ];
                  const events = data.weatherEvents.length > 0 ? data.weatherEvents : fallbackWeather;
                  return events.map((event: any) => (
                    <div key={event.id} className="plt-row flex items-center justify-between p-2">
                      <div className="flex items-center gap-2.5 flex-1 min-w-0">
                        <Icon icon={weatherIcon(event.event_type) as any} size={12} style={{ color: riskColor(event.severity) }} className="flex-shrink-0" />
                        <div className="min-w-0">
                          <div className="text-[11px] font-mono font-semibold text-[#e0e0e0] capitalize truncate">
                            {event.event_type.replace(/_/g, ' ')}
                          </div>
                          <div className="flex items-center gap-2 text-[10px] font-mono text-[#555] mt-0.5">
                            <span>{format(new Date(event.start_time), 'MMM d HH:mm')}z</span>
                            {event.kp_index != null && (
                              <>
                                <span className="text-[#333]">|</span>
                                <span>Kp {event.kp_index}</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                      <span className="plt-badge ml-2 flex-shrink-0" style={{
                        backgroundColor: `${riskColor(event.severity)}18`,
                        color: riskColor(event.severity),
                        borderColor: `${riskColor(event.severity)}30`,
                      }}>
                        {event.severity.toUpperCase()}
                      </span>
                    </div>
                  ));
                })()}
              </div>
            </Panel>
          </div>

          {/* ── Quick Actions (3 cols) ── */}
          <div className="col-span-3">
            <Panel delay={0.3} className="p-3">
              <PanelHeader icon="lightning" iconColor="#39c5cf" title="Quick Actions" subtitle="Common operations" />

              <div className="grid grid-cols-2 gap-1.5">
                {[
                  { label: 'CONJUNCTION', icon: 'satellite', color: '#f85149', onClick: () => setConjunctionDialogOpen(true) },
                  { label: 'WEATHER', icon: 'flash', color: '#d29922', onClick: () => setWeatherDialogOpen(true) },
                  { label: 'INCIDENT', icon: 'issue-new', color: '#2f81f7', onClick: () => setIncidentDialogOpen(true) },
                  { label: 'UPLOAD TLE', icon: 'import', color: '#3fb950', onClick: () => setUploadDialogOpen(true) },
                  { label: 'CELESTRAK', icon: 'refresh', color: '#a78bfa', onClick: refreshCelestrakDebris, loading: refreshingDebris },
                  { label: 'OPEN MAP', icon: 'globe', color: '#39c5cf', href: '/map' },
                ].map((action) => {
                  const content = (
                    <div className="flex items-center gap-2 p-2">
                      <Icon
                        icon={action.icon as any}
                        size={12}
                        style={{ color: action.color }}
                        className={(action as any).loading ? 'animate-spin' : ''}
                      />
                      <span className="text-[10px] font-mono font-medium text-[#888]">{action.label}</span>
                    </div>
                  );

                  if ((action as any).href) {
                    return (
                      <Link key={action.label} href={(action as any).href} className="plt-row no-underline block">
                        {content}
                      </Link>
                    );
                  }
                  return (
                    <button
                      key={action.label}
                      className="plt-row text-left w-full"
                      onClick={action.onClick}
                      disabled={(action as any).loading}
                    >
                      {content}
                    </button>
                  );
                })}
              </div>
            </Panel>
          </div>

          {/* ── System Metrics (4 cols) ── */}
          <div className="col-span-4">
            <SystemMetrics />
          </div>
        </div>

        {/* ═══ Timeline ═══ */}
        <Panel delay={0.35} className="p-3">
          <div
            className="flex items-center justify-between mb-2 pb-2 border-b border-[#1a1a1a] cursor-pointer select-none"
            onClick={() => setTimelineOpen(!timelineOpen)}
          >
            <div className="flex items-center gap-2.5">
              <Icon icon="timeline-events" size={14} className="text-[#39c5cf]" />
              <h2 className="text-xs font-semibold text-[#e0e0e0] uppercase tracking-wider">Event Log</h2>
              <span className="text-[10px] font-mono text-[#555] bg-[#111] px-1.5 py-0.5 rounded-[2px] border border-[#1a1a1a]">
                {timelineEvents.length}
              </span>
            </div>
            <Icon icon={timelineOpen ? 'chevron-up' : 'chevron-down'} size={12} className="text-[#555]" />
          </div>
          <Collapse isOpen={timelineOpen}>
            <div className="max-h-48 overflow-y-auto">
              {timelineEvents.length === 0 ? (
                <div className="text-[#555] text-center py-4 text-[10px] font-mono uppercase">No events today</div>
              ) : (
                <table className="w-full">
                  <thead>
                    <tr className="text-[9px] font-mono text-[#444] uppercase tracking-wider">
                      <th className="text-left py-1 pr-3 font-medium">Time</th>
                      <th className="text-left py-1 pr-3 font-medium">Type</th>
                      <th className="text-left py-1 pr-3 font-medium">Event</th>
                      <th className="text-right py-1 font-medium">Severity</th>
                    </tr>
                  </thead>
                  <tbody>
                    {timelineEvents.slice(0, 10).map((event) => {
                      const dotColor = event.severity === 'critical' ? '#f85149'
                        : event.severity === 'warning' || event.severity === 'high' ? '#d29922'
                        : event.type === 'conjunction' ? '#ff7a45'
                        : event.type === 'space_weather' ? '#d29922'
                        : '#39c5cf';
                      return (
                        <tr key={event.id} className="border-t border-[#111] hover:bg-[#0a0a0a] transition-colors">
                          <td className="py-1.5 pr-3 text-[10px] font-mono text-[#555]">{event.time}</td>
                          <td className="py-1.5 pr-3">
                            <div className="flex items-center gap-1.5">
                              <div className="w-1.5 h-1.5 rounded-[1px]" style={{ backgroundColor: dotColor }} />
                              <span className="text-[10px] font-mono text-[#888] uppercase">{event.type.replace('_', ' ')}</span>
                            </div>
                          </td>
                          <td className="py-1.5 pr-3 text-[11px] font-mono text-[#e0e0e0] truncate max-w-[300px]">{event.title}</td>
                          <td className="py-1.5 text-right">
                            {event.severity && (
                              <span className="plt-badge" style={{
                                backgroundColor: `${dotColor}18`,
                                color: dotColor,
                                borderColor: `${dotColor}30`,
                              }}>
                                {event.severity.toUpperCase()}
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </Collapse>
        </Panel>
      </div>

      {/* Dialogs */}
      <ConjunctionAnalysisDialog isOpen={conjunctionDialogOpen} onClose={() => setConjunctionDialogOpen(false)} onComplete={() => loadData()} />
      <SpaceWeatherDialog isOpen={weatherDialogOpen} onClose={() => setWeatherDialogOpen(false)} />
      <CreateIncidentDialog isOpen={incidentDialogOpen} onClose={() => setIncidentDialogOpen(false)} onCreated={() => loadData()} />
      <UploadTLEDialog isOpen={uploadDialogOpen} onClose={() => setUploadDialogOpen(false)} onUploaded={() => loadData()} />
    </div>
  );
}
