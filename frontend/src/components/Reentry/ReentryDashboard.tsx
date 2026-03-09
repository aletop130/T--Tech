'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, Tag, Spinner, Tabs, Tab, Button, Callout, HTMLTable, ProgressBar, Icon } from '@blueprintjs/core';
import { api, ReentryPrediction, ReentryHistoryEntry } from '@/lib/api';

function riskIntent(level: string): 'danger' | 'warning' | 'primary' | 'success' {
  switch (level) {
    case 'critical': return 'danger';
    case 'high': return 'warning';
    case 'moderate': return 'primary';
    default: return 'success';
  }
}

function riskColor(level: string): string {
  switch (level) {
    case 'critical': return '#ff6b6b';
    case 'high': return '#ffa94d';
    case 'moderate': return '#74c0fc';
    default: return '#51cf66';
  }
}

function objectTypeColor(type: string): string {
  switch (type) {
    case 'rocket-body': return '#ffa94d';
    case 'payload': return '#74c0fc';
    case 'debris': return '#868e96';
    default: return '#adb5bd';
  }
}

function formatCountdown(seconds: number): string {
  if (seconds <= 0) return 'REENTERED';
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function CountdownTimer({ seconds: initialSeconds }: { seconds: number }) {
  const [seconds, setSeconds] = useState(initialSeconds);

  useEffect(() => {
    setSeconds(initialSeconds);
  }, [initialSeconds]);

  useEffect(() => {
    if (seconds <= 0) return;
    const t = setInterval(() => setSeconds(s => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [seconds > 0]);

  const isUrgent = seconds < 3600;
  const isImminent = seconds < 600;

  return (
    <span style={{
      fontFamily: 'monospace',
      fontWeight: 600,
      color: isImminent ? '#ff6b6b' : isUrgent ? '#ffa94d' : 'var(--sda-text-primary)',
      fontSize: '0.85rem',
    }}>
      {formatCountdown(seconds)}
    </span>
  );
}

function windowProgress(windowHours: number): number {
  if (windowHours <= 6) return 1.0;
  if (windowHours <= 24) return 0.75;
  if (windowHours <= 72) return 0.5;
  if (windowHours <= 168) return 0.25;
  return 0.1;
}

type SortKey = 'name' | 'object_type' | 'predicted_epoch' | 'window_hours' | 'risk_level';
type SortDir = 'asc' | 'desc';

const RISK_ORDER: Record<string, number> = { critical: 0, high: 1, moderate: 2, low: 3 };

function sortPredictions(data: ReentryPrediction[], key: SortKey, dir: SortDir): ReentryPrediction[] {
  const sorted = [...data].sort((a, b) => {
    let cmp = 0;
    switch (key) {
      case 'name': cmp = a.name.localeCompare(b.name); break;
      case 'object_type': cmp = a.object_type.localeCompare(b.object_type); break;
      case 'predicted_epoch': cmp = a.predicted_epoch.localeCompare(b.predicted_epoch); break;
      case 'window_hours': cmp = a.window_hours - b.window_hours; break;
      case 'risk_level': cmp = (RISK_ORDER[a.risk_level] ?? 9) - (RISK_ORDER[b.risk_level] ?? 9); break;
    }
    return dir === 'asc' ? cmp : -cmp;
  });
  return sorted;
}

function SortableHeader({ label, sortKey, currentKey, dir, onSort }: {
  label: string; sortKey: SortKey; currentKey: SortKey; dir: SortDir;
  onSort: (key: SortKey) => void;
}) {
  const isActive = currentKey === sortKey;
  return (
    <th
      onClick={() => onSort(sortKey)}
      style={{ cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}
    >
      {label}{' '}
      {isActive && <Icon icon={dir === 'asc' ? 'chevron-up' : 'chevron-down'} size={12} />}
    </th>
  );
}

export function ReentryDashboard() {
  const [predictions, setPredictions] = useState<ReentryPrediction[]>([]);
  const [history, setHistory] = useState<ReentryHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('active');
  const [sortKey, setSortKey] = useState<SortKey>('risk_level');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const fetchData = useCallback(async () => {
    try {
      setError(null);
      const [active, hist] = await Promise.all([
        api.getActiveReentries(),
        api.getReentryHistory(),
      ]);
      setPredictions(active);
      setHistory(hist);
    } catch (e) {
      console.error('Failed to fetch reentry data:', e);
      setError(e instanceof Error ? e.message : 'Failed to load reentry data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 60000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const handleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  if (loading) return <div className="p-4"><Spinner size={20} /> Loading reentry data...</div>;

  if (error) return (
    <div className="p-4">
      <Callout intent="danger" title="Failed to load reentry data">
        {error}
        <div className="mt-2">
          <Button small intent="primary" onClick={fetchData}>Retry</Button>
        </div>
      </Callout>
    </div>
  );

  const criticalCount = predictions.filter(p => p.risk_level === 'critical').length;
  const highCount = predictions.filter(p => p.risk_level === 'high').length;
  const controlledCount = history.filter(h => h.was_controlled).length;
  const sorted = sortPredictions(predictions, sortKey, sortDir);

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-xl font-bold" style={{ color: 'var(--sda-text-primary)' }}>
          Reentry Tracker & Alert
        </h2>
        <Button small icon="refresh" onClick={fetchData}>Refresh</Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-3">
        <Card style={{ background: 'var(--sda-bg-secondary)', border: '1px solid var(--sda-border-default)' }}>
          <div style={{ color: 'var(--sda-text-secondary)', fontSize: '0.75rem' }}>Active Predictions</div>
          <div style={{ color: 'var(--sda-text-primary)', fontSize: '1.5rem', fontWeight: 700 }}>
            {predictions.length}
          </div>
        </Card>
        <Card style={{ background: 'var(--sda-bg-secondary)', border: '1px solid var(--sda-border-default)' }}>
          <div style={{ color: 'var(--sda-text-secondary)', fontSize: '0.75rem' }}>Critical</div>
          <div style={{ color: '#ff6b6b', fontSize: '1.5rem', fontWeight: 700 }}>
            {criticalCount}
          </div>
        </Card>
        <Card style={{ background: 'var(--sda-bg-secondary)', border: '1px solid var(--sda-border-default)' }}>
          <div style={{ color: 'var(--sda-text-secondary)', fontSize: '0.75rem' }}>High Risk</div>
          <div style={{ color: '#ffa94d', fontSize: '1.5rem', fontWeight: 700 }}>
            {highCount}
          </div>
        </Card>
        <Card style={{ background: 'var(--sda-bg-secondary)', border: '1px solid var(--sda-border-default)' }}>
          <div style={{ color: 'var(--sda-text-secondary)', fontSize: '0.75rem' }}>Controlled (90d)</div>
          <div style={{ color: '#51cf66', fontSize: '1.5rem', fontWeight: 700 }}>
            {controlledCount}/{history.length}
          </div>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs
        id="reentry-tabs"
        selectedTabId={activeTab}
        onChange={(id) => setActiveTab(id as string)}
      >
        <Tab id="active" title={`Active Reentries (${predictions.length})`} panel={
          <div className="mt-2">
            {predictions.length === 0 ? (
              <Callout intent="success" icon="tick-circle">
                No active reentry predictions at this time.
              </Callout>
            ) : (
              <HTMLTable bordered  striped style={{ width: '100%' }}>
                <thead>
                  <tr>
                    <SortableHeader label="Name" sortKey="name" currentKey={sortKey} dir={sortDir} onSort={handleSort} />
                    <SortableHeader label="Type" sortKey="object_type" currentKey={sortKey} dir={sortDir} onSort={handleSort} />
                    <SortableHeader label="Predicted" sortKey="predicted_epoch" currentKey={sortKey} dir={sortDir} onSort={handleSort} />
                    <th>Countdown</th>
                    <SortableHeader label="Window" sortKey="window_hours" currentKey={sortKey} dir={sortDir} onSort={handleSort} />
                    <SortableHeader label="Risk" sortKey="risk_level" currentKey={sortKey} dir={sortDir} onSort={handleSort} />
                    <th>Uncertainty</th>
                    <th>NORAD</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((p, i) => (
                    <tr key={`${p.norad_id}-${i}`}>
                      <td style={{ fontWeight: 500 }}>{p.name}</td>
                      <td>
                        <Tag minimal style={{ backgroundColor: objectTypeColor(p.object_type), color: '#000' }}>
                          {p.object_type}
                        </Tag>
                      </td>
                      <td style={{ fontSize: '0.85rem' }}>{formatDate(p.predicted_epoch)}</td>
                      <td><CountdownTimer seconds={p.countdown_seconds} /></td>
                      <td style={{ fontSize: '0.85rem' }}>{p.window_hours < 24 ? `${p.window_hours}h` : `${(p.window_hours / 24).toFixed(1)}d`}</td>
                      <td>
                        <Tag minimal intent={riskIntent(p.risk_level)} style={{ fontWeight: 600 }}>
                          {p.risk_level.toUpperCase()}
                        </Tag>
                      </td>
                      <td style={{ width: 120 }}>
                        <ProgressBar
                          intent={riskIntent(p.risk_level)}
                          value={windowProgress(p.window_hours)}
                          animate={p.risk_level === 'critical'}
                          stripes={p.risk_level === 'critical' || p.risk_level === 'high'}
                        />
                      </td>
                      <td style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{p.norad_id}</td>
                    </tr>
                  ))}
                </tbody>
              </HTMLTable>
            )}
          </div>
        } />

        <Tab id="history" title={`History (${history.length})`} panel={
          <div className="mt-2">
            {history.length === 0 ? (
              <Callout>No historical reentry data available.</Callout>
            ) : (
              <HTMLTable bordered  striped style={{ width: '100%' }}>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Type</th>
                    <th>Reentry Date</th>
                    <th>Controlled</th>
                    <th>Country</th>
                    <th>NORAD</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((h, i) => (
                    <tr key={`${h.norad_id}-${i}`}>
                      <td style={{ fontWeight: 500 }}>{h.name}</td>
                      <td>
                        <Tag minimal style={{ backgroundColor: objectTypeColor(h.object_type), color: '#000' }}>
                          {h.object_type}
                        </Tag>
                      </td>
                      <td style={{ fontSize: '0.85rem' }}>{formatDate(h.actual_epoch)}</td>
                      <td>
                        {h.was_controlled ? (
                          <Tag minimal intent="success">CONTROLLED</Tag>
                        ) : (
                          <Tag minimal intent="warning">UNCONTROLLED</Tag>
                        )}
                      </td>
                      <td>{h.country || 'Unknown'}</td>
                      <td style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{h.norad_id}</td>
                    </tr>
                  ))}
                </tbody>
              </HTMLTable>
            )}
          </div>
        } />
      </Tabs>
    </div>
  );
}
