'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Callout,
  Intent,
  Spinner,
  Tag,
  Icon,
} from '@blueprintjs/core';
import {
  api,
  SpaceWeatherImpactResponse,
  DragImpactSatellite,
} from '@/lib/api';

const REFRESH_INTERVAL = 5 * 60 * 1000; // 5 minutes

const KP_COLORS = [
  '#22c55e', // 0 - green
  '#22c55e', // 1 - green
  '#84cc16', // 2 - lime
  '#eab308', // 3 - yellow
  '#f59e0b', // 4 - amber
  '#f97316', // 5 - orange
  '#ef4444', // 6 - red
  '#dc2626', // 7 - red-dark
  '#b91c1c', // 8 - red-darker
  '#991b1b', // 9 - extreme
];

const STORM_LABELS: Record<string, { label: string; intent: Intent }> = {
  none: { label: 'Quiet', intent: Intent.SUCCESS },
  minor: { label: 'G1 Minor Storm', intent: Intent.WARNING },
  moderate: { label: 'G2 Moderate Storm', intent: Intent.WARNING },
  strong: { label: 'G3 Strong Storm', intent: Intent.DANGER },
  severe: { label: 'G4 Severe Storm', intent: Intent.DANGER },
  extreme: { label: 'G5 Extreme Storm', intent: Intent.DANGER },
};

function KpGauge({ value }: { value: number }) {
  const clampedKp = Math.min(9, Math.max(0, value));
  const pct = (clampedKp / 9) * 100;
  const color = KP_COLORS[Math.round(clampedKp)] || KP_COLORS[0];

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs text-sda-text-secondary">
        <span>Kp Index</span>
        <span style={{ color, fontWeight: 700 }}>{clampedKp.toFixed(1)}</span>
      </div>
      <div className="relative h-3 rounded-full overflow-hidden bg-[#1e293b]">
        {/* Segmented scale markers */}
        <div className="absolute inset-0 flex">
          {Array.from({ length: 10 }).map((_, i) => (
            <div
              key={i}
              className="flex-1 border-r border-[#0f172a] last:border-r-0"
              style={{
                backgroundColor: i <= Math.round(clampedKp) ? KP_COLORS[i] : 'transparent',
                opacity: i <= Math.round(clampedKp) ? 0.85 : 0.15,
              }}
            />
          ))}
        </div>
      </div>
      <div className="flex justify-between text-[10px] text-sda-text-secondary">
        <span>0</span>
        <span>3</span>
        <span>5</span>
        <span>7</span>
        <span>9</span>
      </div>
    </div>
  );
}

function F107Indicator({ value }: { value: number | null }) {
  if (value === null) return null;

  let level = 'Low';
  let color = '#22c55e';
  if (value > 200) {
    level = 'Very High';
    color = '#ef4444';
  } else if (value > 150) {
    level = 'High';
    color = '#f97316';
  } else if (value > 100) {
    level = 'Moderate';
    color = '#eab308';
  }

  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-sda-text-secondary">F10.7 Solar Flux</span>
      <div className="flex items-center gap-2">
        <span className="text-xs font-mono" style={{ color }}>
          {value.toFixed(0)} sfu
        </span>
        <Tag minimal style={{ color, borderColor: color, fontSize: 10 }}>
          {level}
        </Tag>
      </div>
    </div>
  );
}

function AtRiskTable({ satellites }: { satellites: DragImpactSatellite[] }) {
  if (satellites.length === 0) {
    return (
      <div className="text-xs text-sda-text-secondary text-center py-3">
        No satellites at elevated drag risk
      </div>
    );
  }

  return (
    <div className="max-h-48 overflow-y-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-sda-text-secondary border-b border-sda-border-default">
            <th className="text-left py-1 font-medium">Satellite</th>
            <th className="text-right py-1 font-medium">Alt (km)</th>
            <th className="text-right py-1 font-medium">Drag +%</th>
          </tr>
        </thead>
        <tbody>
          {satellites.map((sat) => (
            <tr key={sat.norad_id} className="border-b border-sda-border-default/30 hover:bg-sda-bg-tertiary">
              <td className="py-1.5">
                <div className="flex items-center gap-1">
                  <Icon icon="satellite" size={10} className="text-sda-text-secondary" />
                  <span className="truncate max-w-[140px]">{sat.name}</span>
                </div>
                <span className="text-[10px] text-sda-text-secondary">NORAD {sat.norad_id}</span>
              </td>
              <td className="text-right font-mono">{sat.altitude_km.toFixed(0)}</td>
              <td className="text-right font-mono">
                <span style={{ color: sat.estimated_drag_increase_pct > 10 ? '#ef4444' : '#f97316' }}>
                  +{sat.estimated_drag_increase_pct.toFixed(1)}%
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function SpaceWeatherPanel() {
  const [data, setData] = useState<SpaceWeatherImpactResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const result = await api.getSpaceWeatherImpactLive();
      setData(result);
      setError(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load space weather';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchData]);

  if (loading && !data) {
    return (
      <div className="flex justify-center items-center py-8">
        <Spinner size={24} />
      </div>
    );
  }

  if (error && !data) {
    return <Callout intent={Intent.DANGER} icon="error" compact>{error}</Callout>;
  }

  if (!data) return null;

  const { current_conditions: cond, affected_satellites, alert_level, active_alerts, total_affected } = data;
  const storm = STORM_LABELS[cond.storm_level] || STORM_LABELS.none;

  return (
    <div className="space-y-3">
      {/* Storm alert banner */}
      {cond.kp_index >= 5 && (
        <Callout
          intent={Intent.DANGER}
          icon="warning-sign"
          compact
          className="animate-pulse"
        >
          <strong>{storm.label}</strong> &mdash; {total_affected} LEO satellite{total_affected !== 1 ? 's' : ''} at
          increased drag risk
        </Callout>
      )}

      {/* Kp Gauge */}
      <KpGauge value={cond.kp_index} />

      {/* F10.7 */}
      <F107Indicator value={cond.f10_7} />

      {/* Storm status */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-sda-text-secondary">Geomagnetic Status</span>
        <Tag intent={storm.intent} minimal>
          {storm.label}
        </Tag>
      </div>

      {/* Alert level indicator */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-sda-text-secondary">Alert Level</span>
        <div
          className="w-3 h-3 rounded-full"
          style={{
            backgroundColor:
              alert_level === 'red'
                ? '#ef4444'
                : alert_level === 'orange'
                ? '#f97316'
                : alert_level === 'yellow'
                ? '#eab308'
                : '#22c55e',
            boxShadow: alert_level !== 'green' ? `0 0 6px ${alert_level === 'red' ? '#ef4444' : '#f97316'}` : 'none',
          }}
        />
      </div>

      {/* At-risk satellites */}
      {affected_satellites.length > 0 && (
        <div>
          <div className="text-xs font-medium text-sda-text-secondary mb-1">
            LEO Satellites at Risk ({total_affected})
          </div>
          <AtRiskTable satellites={affected_satellites} />
        </div>
      )}

      {/* NOAA Alerts */}
      {active_alerts.length > 0 && (
        <div>
          <div className="text-xs font-medium text-sda-text-secondary mb-1">
            NOAA Alerts ({active_alerts.length})
          </div>
          <div className="space-y-1 max-h-32 overflow-y-auto">
            {active_alerts.map((alert, i) => (
              <div
                key={`${alert.product_id}-${i}`}
                className="text-[11px] bg-sda-bg-tertiary rounded p-2 text-sda-text-secondary leading-tight"
              >
                <div className="font-medium text-sda-text-primary">{alert.product_id}</div>
                <div className="line-clamp-2 mt-0.5">{alert.message}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Timestamp */}
      <div className="text-[10px] text-sda-text-secondary text-right">
        Updated: {new Date(cond.timestamp).toLocaleTimeString()} &middot; Auto-refresh 5min
      </div>
    </div>
  );
}
