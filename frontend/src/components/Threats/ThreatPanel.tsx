'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, Tag, Spinner, Tabs, Tab, Button, Callout } from '@blueprintjs/core';
import type {
  ProximityThreat,
  SignalThreat,
  AnomalyThreat,
  OrbitalSimilarityThreat,
  GeoLoiterThreat,
} from '@/types/threats';
import { api } from '@/lib/api';

function severityColor(severity: string): string {
  switch (severity) {
    case 'threatened': return '#ff6b6b';
    case 'watched': return '#ffd43b';
    default: return '#51cf66';
  }
}

function SeverityTag({ severity }: { severity: string }) {
  return (
    <Tag
      minimal
      style={{ backgroundColor: severityColor(severity), color: '#000' }}
    >
      {severity.toUpperCase()}
    </Tag>
  );
}

export function ThreatPanel() {
  const [proximity, setProximity] = useState<ProximityThreat[]>([]);
  const [signal, setSignal] = useState<SignalThreat[]>([]);
  const [anomaly, setAnomaly] = useState<AnomalyThreat[]>([]);
  const [orbital, setOrbital] = useState<OrbitalSimilarityThreat[]>([]);
  const [geoLoiter, setGeoLoiter] = useState<GeoLoiterThreat[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('proximity');

  const fetchThreats = useCallback(async () => {
    try {
      setError(null);
      const [p, s, a, o, g] = await Promise.all([
        api.getProximityThreats(),
        api.getSignalThreats(),
        api.getAnomalyThreats(),
        api.getOrbitalSimilarityThreats(),
        api.getGeoLoiterThreats(),
      ]);
      setProximity(p);
      setSignal(s);
      setAnomaly(a);
      setOrbital(o);
      setGeoLoiter(g);
    } catch (e) {
      console.error('Failed to fetch threats:', e);
      setError(e instanceof Error ? e.message : 'Failed to load threat data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchThreats();
    const interval = setInterval(fetchThreats, 30000);
    return () => clearInterval(interval);
  }, [fetchThreats]);

  if (loading) return <div className="p-4"><Spinner size={20} /> Loading threats...</div>;

  if (error) return (
    <div className="p-4">
      <Callout intent="danger" title="Failed to load threats">
        {error}
        <div className="mt-2">
          <Button small intent="primary" onClick={fetchThreats}>Retry</Button>
        </div>
      </Callout>
    </div>
  );

  return (
    <div className="p-4">
      <h2 className="text-lg font-semibold mb-3" style={{ color: 'var(--sda-text-primary)' }}>
        Multi-Modal Threat Detection
      </h2>
      <Tabs selectedTabId={activeTab} onChange={(id) => setActiveTab(id as string)}>
        <Tab id="proximity" title={`Proximity (${proximity.length})`} panel={
          <div className="space-y-2 mt-2">
            {proximity.map(t => (
              <Card key={t.id} className="p-3" style={{ backgroundColor: 'var(--sda-bg-secondary)' }}>
                <div className="flex justify-between items-start">
                  <div>
                    <div className="font-medium" style={{ color: 'var(--sda-text-primary)' }}>
                      {t.foreignSatName} → {t.targetAssetName}
                    </div>
                    <div className="text-xs mt-1" style={{ color: 'var(--sda-text-secondary)' }}>
                      Miss: {t.missDistanceKm} km | Vel: {t.approachVelocityKms} km/s | TCA: {t.tcaInMinutes} min
                    </div>
                  </div>
                  <div className="flex gap-2 items-center">
                    <span className="text-xs" style={{ color: 'var(--sda-text-secondary)' }}>
                      {(t.confidence * 100).toFixed(0)}%
                    </span>
                    <SeverityTag severity={t.severity} />
                  </div>
                </div>
              </Card>
            ))}
            {proximity.length === 0 && <div className="text-sm" style={{ color: 'var(--sda-text-secondary)' }}>No proximity threats detected</div>}
          </div>
        } />
        <Tab id="signal" title={`Signal (${signal.length})`} panel={
          <div className="space-y-2 mt-2">
            {signal.map(t => (
              <Card key={t.id} className="p-3" style={{ backgroundColor: 'var(--sda-bg-secondary)' }}>
                <div className="flex justify-between items-start">
                  <div>
                    <div className="font-medium" style={{ color: 'var(--sda-text-primary)' }}>
                      {t.interceptorName} → {t.targetLinkAssetName}
                    </div>
                    <div className="text-xs mt-1" style={{ color: 'var(--sda-text-secondary)' }}>
                      Intercept: {(t.interceptionProbability * 100).toFixed(0)}% | GS: {t.groundStationName}
                    </div>
                  </div>
                  <SeverityTag severity={t.severity} />
                </div>
              </Card>
            ))}
            {signal.length === 0 && <div className="text-sm" style={{ color: 'var(--sda-text-secondary)' }}>No signal threats detected</div>}
          </div>
        } />
        <Tab id="anomaly" title={`Anomaly (${anomaly.length})`} panel={
          <div className="space-y-2 mt-2">
            {anomaly.map(t => (
              <Card key={t.id} className="p-3" style={{ backgroundColor: 'var(--sda-bg-secondary)' }}>
                <div className="flex justify-between items-start">
                  <div>
                    <div className="font-medium" style={{ color: 'var(--sda-text-primary)' }}>
                      {t.satelliteName}
                    </div>
                    <div className="text-xs mt-1" style={{ color: 'var(--sda-text-secondary)' }}>
                      {t.anomalyType} | {t.description.slice(0, 80)}...
                    </div>
                  </div>
                  <SeverityTag severity={t.severity} />
                </div>
              </Card>
            ))}
            {anomaly.length === 0 && <div className="text-sm" style={{ color: 'var(--sda-text-secondary)' }}>No anomalies detected</div>}
          </div>
        } />
        <Tab id="orbital" title={`Orbital (${orbital.length})`} panel={
          <div className="space-y-2 mt-2">
            {orbital.map(t => (
              <Card key={t.id} className="p-3" style={{ backgroundColor: 'var(--sda-bg-secondary)' }}>
                <div className="flex justify-between items-start">
                  <div>
                    <div className="font-medium" style={{ color: 'var(--sda-text-primary)' }}>
                      {t.foreignSatName} ↔ {t.targetAssetName}
                    </div>
                    <div className="text-xs mt-1" style={{ color: 'var(--sda-text-secondary)' }}>
                      Div: {t.divergenceScore.toFixed(4)} | Pattern: {t.pattern}
                    </div>
                  </div>
                  <SeverityTag severity={t.severity} />
                </div>
              </Card>
            ))}
            {orbital.length === 0 && <div className="text-sm" style={{ color: 'var(--sda-text-secondary)' }}>No orbital similarity threats</div>}
          </div>
        } />
        <Tab id="geoloiter" title={`GEO Loiter (${geoLoiter.length})`} panel={
          <div className="space-y-2 mt-2">
            {geoLoiter.map(t => (
              <Card key={t.id} className="p-3" style={{ backgroundColor: 'var(--sda-bg-secondary)' }}>
                <div className="flex justify-between items-start">
                  <div>
                    <div className="font-medium" style={{ color: 'var(--sda-text-primary)' }}>
                      {t.satelliteName} ({t.countryCode})
                    </div>
                    <div className="text-xs mt-1" style={{ color: 'var(--sda-text-secondary)' }}>
                      {t.orbitType} | Lon: {t.subsatelliteLonDeg}° | Dwell: {(t.dwellFractionOverUs * 100).toFixed(0)}%
                    </div>
                  </div>
                  <SeverityTag severity={t.severity} />
                </div>
              </Card>
            ))}
            {geoLoiter.length === 0 && <div className="text-sm" style={{ color: 'var(--sda-text-secondary)' }}>No GEO loiter threats</div>}
          </div>
        } />
      </Tabs>
    </div>
  );
}
