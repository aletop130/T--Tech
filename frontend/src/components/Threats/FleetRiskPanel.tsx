'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, Spinner, ProgressBar, Button, Callout } from '@blueprintjs/core';
import type { RiskSnapshot } from '@/types/threats';
import { api } from '@/lib/api';

export function FleetRiskPanel() {
  const [satellites, setSatellites] = useState<RiskSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchRisk = useCallback(async () => {
    try {
      setError(null);
      const data = await api.getFleetRiskCurrent();
      setSatellites(data.satellites || []);
    } catch (e) {
      console.error('Failed to fetch fleet risk:', e);
      setError(e instanceof Error ? e.message : 'Failed to load fleet risk data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRisk();
    const interval = setInterval(fetchRisk, 10000);
    return () => clearInterval(interval);
  }, [fetchRisk]);

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

  return (
    <div className="p-4">
      <h2 className="text-lg font-semibold mb-3" style={{ color: 'var(--sda-text-primary)' }}>
        Fleet Risk Dashboard
      </h2>
      <div className="space-y-2">
        {satellites.map(s => (
          <Card key={s.satellite_id} className="p-3" style={{ backgroundColor: 'var(--sda-bg-secondary)' }}>
            <div className="flex justify-between items-center mb-1">
              <span className="font-medium text-sm" style={{ color: 'var(--sda-text-primary)' }}>
                {s.satellite_name || s.satellite_id}
              </span>
              <span className="text-xs" style={{
                color: s.risk_score > 0.7 ? '#ff6b6b' : s.risk_score > 0.3 ? '#ffd43b' : '#51cf66'
              }}>
                {(s.risk_score * 100).toFixed(1)}%
              </span>
            </div>
            <ProgressBar
              value={s.risk_score}
              intent={s.risk_score > 0.7 ? 'danger' : s.risk_score > 0.3 ? 'warning' : 'success'}
              stripes={false}
              animate={false}
            />
            {s.components && Object.keys(s.components).length > 0 && (
              <div className="flex gap-2 mt-1">
                {Object.entries(s.components).map(([key, val]) => (
                  <span key={key} className="text-xs" style={{ color: 'var(--sda-text-secondary)' }}>
                    {key}: {(val * 100).toFixed(0)}%
                  </span>
                ))}
              </div>
            )}
          </Card>
        ))}
        {satellites.length === 0 && (
          <div className="text-sm" style={{ color: 'var(--sda-text-secondary)' }}>
            No risk data available
          </div>
        )}
      </div>
    </div>
  );
}
