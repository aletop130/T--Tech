'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, Spinner, ProgressBar, Button, Callout, Tag, Icon } from '@blueprintjs/core';
import type { RiskSnapshot, FleetRiskSummary } from '@/types/threats';
import { api } from '@/lib/api';
import { riskColor, riskIntent } from '@/lib/severity';
import { SatelliteRiskDebrief } from './SatelliteRiskDebrief';

type SortKey = 'risk' | 'name' | 'dominant';
type SortDir = 'asc' | 'desc';

function RiskLevelTag({ level }: { level: string }) {
  return (
    <Tag
      minimal
      intent={riskIntent(level)}
      style={{ fontWeight: 600, fontSize: '10px', textTransform: 'uppercase' }}
    >
      {level}
    </Tag>
  );
}

function DominantThreatBadge({ threat }: { threat?: string }) {
  if (!threat) return null;
  const icons: Record<string, string> = {
    proximity: 'locate',
    signal: 'signal-search',
    anomaly: 'warning-sign',
    orbital_similarity: 'path-search',
    geo_loiter: 'eye-open',
  };
  const labels: Record<string, string> = {
    proximity: 'Proximity',
    signal: 'Signal',
    anomaly: 'Anomaly',
    orbital_similarity: 'Orbital',
    geo_loiter: 'GEO Loiter',
  };
  return (
    <Tag minimal style={{ fontSize: '9px', color: 'var(--sda-text-secondary)' }}>
      <Icon icon={(icons[threat] || 'circle') as any} size={10} /> {labels[threat] || threat}
    </Tag>
  );
}

export function FleetRiskPanel() {
  const [satellites, setSatellites] = useState<RiskSnapshot[]>([]);
  const [summary, setSummary] = useState<FleetRiskSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('risk');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [lastUpdated, setLastUpdated] = useState<string>('');
  const [expandedSatId, setExpandedSatId] = useState<string | null>(null);

  const fetchRisk = useCallback(async () => {
    try {
      setError(null);
      const data = await api.getFleetRiskCurrent();
      setSatellites(data.satellites || []);
      setSummary(data.summary || null);
      setLastUpdated(new Date().toLocaleTimeString());
    } catch (e) {
      console.error('Failed to fetch fleet risk:', e);
      setError(e instanceof Error ? e.message : 'Failed to load fleet risk data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRisk();
    const interval = setInterval(fetchRisk, 60000);
    return () => clearInterval(interval);
  }, [fetchRisk]);

  const handleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir(key === 'risk' ? 'desc' : 'asc');
    }
  };

  const sorted = [...satellites].sort((a, b) => {
    let cmp = 0;
    switch (sortKey) {
      case 'risk': cmp = a.risk_score - b.risk_score; break;
      case 'name': cmp = (a.satellite_name || '').localeCompare(b.satellite_name || ''); break;
      case 'dominant': cmp = (a.dominant_threat || '').localeCompare(b.dominant_threat || ''); break;
    }
    return sortDir === 'asc' ? cmp : -cmp;
  });

  if (loading) return <div className="p-4"><Spinner size={20} /> Loading fleet risk...</div>;

  if (error) return (
    <div className="p-4">
      <Callout intent="danger" title="Failed to load fleet risk">
        {error}
        <div className="mt-2">
          <Button small intent="primary" onClick={fetchRisk}>Retry</Button>
        </div>
      </Callout>
    </div>
  );

  // Show debrief view when a satellite is expanded
  if (expandedSatId) {
    const expandedSat = satellites.find(s => s.satellite_id === expandedSatId);
    if (expandedSat) {
      return (
        <SatelliteRiskDebrief
          satellite={expandedSat}
          onClose={() => setExpandedSatId(null)}
        />
      );
    }
  }

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold" style={{ color: 'var(--sda-text-primary)' }}>
          Fleet Risk Dashboard
        </h2>
        <div className="flex items-center gap-2">
          {lastUpdated && (
            <span className="text-xs" style={{ color: 'var(--sda-text-secondary)' }}>
              Updated {lastUpdated}
            </span>
          )}
          <Button small icon="refresh" onClick={fetchRisk}>Refresh</Button>
        </div>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-5 gap-2 mb-4">
          <Card className="p-2 text-center" style={{ backgroundColor: 'var(--sda-bg-secondary)' }}>
            <div className="text-2xl font-bold" style={{ color: 'var(--sda-text-primary)' }}>
              {summary.total}
            </div>
            <div className="text-xs" style={{ color: 'var(--sda-text-secondary)' }}>Tracked</div>
          </Card>
          <Card className="p-2 text-center" style={{ backgroundColor: 'var(--sda-bg-secondary)' }}>
            <div className="text-2xl font-bold" style={{ color: '#ff4d4f' }}>
              {summary.critical}
            </div>
            <div className="text-xs" style={{ color: 'var(--sda-text-secondary)' }}>Critical</div>
          </Card>
          <Card className="p-2 text-center" style={{ backgroundColor: 'var(--sda-bg-secondary)' }}>
            <div className="text-2xl font-bold" style={{ color: '#ff7a45' }}>
              {summary.high}
            </div>
            <div className="text-xs" style={{ color: 'var(--sda-text-secondary)' }}>High</div>
          </Card>
          <Card className="p-2 text-center" style={{ backgroundColor: 'var(--sda-bg-secondary)' }}>
            <div className="text-2xl font-bold" style={{ color: '#ffc53d' }}>
              {summary.medium}
            </div>
            <div className="text-xs" style={{ color: 'var(--sda-text-secondary)' }}>Medium</div>
          </Card>
          <Card className="p-2 text-center" style={{ backgroundColor: 'var(--sda-bg-secondary)' }}>
            <div className="text-2xl font-bold" style={{ color: '#73d13d' }}>
              {summary.low}
            </div>
            <div className="text-xs" style={{ color: 'var(--sda-text-secondary)' }}>Low</div>
          </Card>
        </div>
      )}

      {/* Average Risk Indicator */}
      {summary && (
        <div className="mb-4 px-2">
          <div className="flex justify-between items-center mb-1">
            <span className="text-xs" style={{ color: 'var(--sda-text-secondary)' }}>
              Fleet Average Risk
            </span>
            <span className="text-xs font-medium" style={{
              color: riskColor(summary.average_risk >= 0.6 ? 'high' : summary.average_risk >= 0.3 ? 'medium' : 'low')
            }}>
              {(summary.average_risk * 100).toFixed(1)}%
            </span>
          </div>
          <ProgressBar
            value={summary.average_risk}
            intent={summary.average_risk >= 0.6 ? 'danger' : summary.average_risk >= 0.3 ? 'warning' : 'success'}
            stripes={false}
            animate={false}
          />
        </div>
      )}

      {/* Sort Controls */}
      <div className="flex gap-2 mb-3">
        <span className="text-xs" style={{ color: 'var(--sda-text-secondary)' }}>Sort:</span>
        {(['risk', 'name', 'dominant'] as SortKey[]).map(key => (
          <Button
            key={key}
            small
            minimal
            active={sortKey === key}
            onClick={() => handleSort(key)}
            rightIcon={sortKey === key ? (sortDir === 'asc' ? 'chevron-up' : 'chevron-down') : undefined}
            style={{ fontSize: '11px' }}
          >
            {key === 'risk' ? 'Risk Score' : key === 'name' ? 'Name' : 'Threat Type'}
          </Button>
        ))}
      </div>

      {/* Satellite List */}
      <div className="space-y-2">
        {sorted.map(s => (
          <Card
            key={s.satellite_id}
            className="p-3 cursor-pointer"
            style={{ backgroundColor: 'var(--sda-bg-secondary)' }}
            interactive
            onClick={() => setExpandedSatId(s.satellite_id)}
          >
            <div className="flex justify-between items-center mb-1">
              <div className="flex items-center gap-2">
                <span className="font-medium text-sm" style={{ color: 'var(--sda-text-primary)' }}>
                  {s.satellite_name || s.satellite_id}
                </span>
                {s.risk_level && <RiskLevelTag level={s.risk_level} />}
                <DominantThreatBadge threat={s.dominant_threat} />
              </div>
              <span className="text-xs font-mono font-bold" style={{
                color: riskColor(s.risk_level || 'low')
              }}>
                {(s.risk_score * 100).toFixed(1)}%
              </span>
            </div>
            <ProgressBar
              value={s.risk_score}
              intent={riskIntent(s.risk_level || 'low')}
              stripes={false}
              animate={false}
            />
            {s.components && Object.keys(s.components).length > 0 && (
              <div className="flex gap-3 mt-1">
                {Object.entries(s.components).map(([key, val]) => (
                  <span key={key} className="text-xs" style={{ color: 'var(--sda-text-secondary)' }}>
                    {key.replace('_', ' ')}: <span style={{ color: riskColor(val >= 0.6 ? 'high' : val >= 0.3 ? 'medium' : 'low') }}>{(val * 100).toFixed(0)}%</span>
                  </span>
                ))}
              </div>
            )}
          </Card>
        ))}
        {satellites.length === 0 && (
          <Callout intent="success" icon="tick-circle">
            No satellites with elevated risk detected
          </Callout>
        )}
      </div>
    </div>
  );
}
