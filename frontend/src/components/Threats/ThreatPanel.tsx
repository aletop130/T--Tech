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
import { severityHex } from '@/lib/severity';

type ThreatFeedKey = 'proximity' | 'signal' | 'anomaly' | 'orbital' | 'geoloiter';

const FEED_LABELS: Record<ThreatFeedKey, string> = {
  proximity: 'Proximity',
  signal: 'Signal',
  anomaly: 'Anomaly',
  orbital: 'Orbital similarity',
  geoloiter: 'GEO loiter',
};

function SeverityTag({ severity }: { severity: string }) {
  return (
    <Tag
      minimal
      style={{ backgroundColor: severityHex(severity), color: '#000' }}
    >
      {severity.toUpperCase()}
    </Tag>
  );
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between py-1" style={{ borderBottom: '1px solid var(--sda-border)' }}>
      <span className="text-xs" style={{ color: 'var(--sda-text-secondary)' }}>{label}</span>
      <span className="text-xs font-mono" style={{ color: 'var(--sda-text-primary)' }}>{value}</span>
    </div>
  );
}

function PositionInfo({ pos, label }: { pos: { lat: number; lon: number; altKm: number }; label: string }) {
  return (
    <div className="mt-1">
      <div className="text-xs font-medium mb-1" style={{ color: 'var(--sda-text-secondary)' }}>{label}</div>
      <div className="grid grid-cols-3 gap-2">
        <div className="text-xs" style={{ color: 'var(--sda-text-primary)' }}>
          <span style={{ color: 'var(--sda-text-secondary)' }}>Lat:</span> {pos.lat.toFixed(3)}°
        </div>
        <div className="text-xs" style={{ color: 'var(--sda-text-primary)' }}>
          <span style={{ color: 'var(--sda-text-secondary)' }}>Lon:</span> {pos.lon.toFixed(3)}°
        </div>
        <div className="text-xs" style={{ color: 'var(--sda-text-primary)' }}>
          <span style={{ color: 'var(--sda-text-secondary)' }}>Alt:</span> {pos.altKm.toFixed(1)} km
        </div>
      </div>
    </div>
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
  const [feedErrors, setFeedErrors] = useState<Partial<Record<ThreatFeedKey, string>>>({});
  const [activeTab, setActiveTab] = useState('proximity');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchThreats = useCallback(async () => {
    try {
      setError(null);
      const results = await Promise.allSettled([
        api.getProximityThreats(),
        api.getSignalThreats(),
        api.getAnomalyThreats(),
        api.getOrbitalSimilarityThreats(),
        api.getGeoLoiterThreats(),
      ]);

      const nextErrors: Partial<Record<ThreatFeedKey, string>> = {};
      let successCount = 0;

      const keys: ThreatFeedKey[] = ['proximity', 'signal', 'anomaly', 'orbital', 'geoloiter'];
      const setters = [
        setProximity,
        setSignal,
        setAnomaly,
        setOrbital,
        setGeoLoiter,
      ] as const;

      results.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          setters[index](result.value as never);
          successCount += 1;
          return;
        }

        setters[index]([] as never);
        nextErrors[keys[index]] =
          result.reason instanceof Error ? result.reason.message : 'Feed unavailable';
      });

      setFeedErrors(nextErrors);

      if (successCount === 0) {
        throw new Error('All threat feeds are currently unavailable');
      }
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

  const hasFeedWarnings = Object.keys(feedErrors).length > 0;
  const renderFeedFallback = (feedKey: ThreatFeedKey, emptyMessage: string) => {
    if (feedErrors[feedKey]) {
      return (
        <Callout intent="warning" className="mt-2">
          {FEED_LABELS[feedKey]} feed unavailable: {feedErrors[feedKey]}
        </Callout>
      );
    }
    return (
      <div className="text-sm" style={{ color: 'var(--sda-text-secondary)' }}>
        {emptyMessage}
      </div>
    );
  };

  const totalThreats = proximity.length + signal.length + anomaly.length + orbital.length + geoLoiter.length;

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold" style={{ color: 'var(--sda-text-primary)' }}>
          Multi-Modal Threat Detection
        </h2>
        <div className="flex items-center gap-2">
          <Tag minimal intent={totalThreats > 0 ? 'danger' : 'success'}>
            {totalThreats} active threats
          </Tag>
          <Button small icon="refresh" onClick={fetchThreats}>Refresh</Button>
        </div>
      </div>
      {/* Summary row */}
      <div className="flex gap-3 mb-3">
        {[
          { label: 'Proximity', count: proximity.length, color: '#ff6b6b' },
          { label: 'Signal', count: signal.length, color: '#ffd43b' },
          { label: 'Anomaly', count: anomaly.length, color: '#ff922b' },
          { label: 'Orbital', count: orbital.length, color: '#74c0fc' },
          { label: 'GEO Loiter', count: geoLoiter.length, color: '#da77f2' },
        ].map(f => (
          <div key={f.label} className="text-xs text-center" style={{ color: 'var(--sda-text-secondary)' }}>
            <div style={{ color: f.count > 0 ? f.color : 'var(--sda-text-secondary)', fontWeight: 700, fontSize: '1.1rem' }}>
              {f.count}
            </div>
            {f.label}
          </div>
        ))}
      </div>
      {hasFeedWarnings && (
        <Callout intent="warning" className="mb-3">
          Some threat feeds are degraded. Available feeds are still shown.
        </Callout>
      )}
      <Tabs selectedTabId={activeTab} onChange={(id) => setActiveTab(id as string)}>
        <Tab id="proximity" title={`Proximity (${proximity.length})`} panel={
          <div className="space-y-2 mt-2">
            {proximity.map(t => (
              <Card
                key={t.id}
                className="p-3 cursor-pointer"
                style={{ backgroundColor: 'var(--sda-bg-secondary)' }}
                interactive
                onClick={() => setExpandedId(expandedId === t.id ? null : t.id)}
              >
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
                {expandedId === t.id && (
                  <div className="mt-3 pt-3" style={{ borderTop: '1px solid var(--sda-border)' }}>
                    <DetailRow label="Miss Distance" value={`${t.missDistanceKm} km`} />
                    <DetailRow label="Approach Velocity" value={`${t.approachVelocityKms} km/s`} />
                    <DetailRow label="Time to Closest Approach" value={`${t.tcaInMinutes} min`} />
                    <DetailRow label="Approach Pattern" value={t.approachPattern} />
                    <DetailRow label="Sun Hiding Detected" value={t.sunHidingDetected ? 'YES — possible evasion' : 'No'} />
                    <DetailRow label="Confidence" value={`${(t.confidence * 100).toFixed(1)}%`} />
                    <PositionInfo pos={t.primaryPosition} label="Foreign Object Position" />
                    <PositionInfo pos={t.secondaryPosition} label="Target Asset Position" />
                  </div>
                )}
              </Card>
            ))}
            {proximity.length === 0 && renderFeedFallback('proximity', 'No proximity threats detected')}
          </div>
        } />
        <Tab id="signal" title={`Signal (${signal.length})`} panel={
          <div className="space-y-2 mt-2">
            {signal.map(t => (
              <Card
                key={t.id}
                className="p-3 cursor-pointer"
                style={{ backgroundColor: 'var(--sda-bg-secondary)' }}
                interactive
                onClick={() => setExpandedId(expandedId === t.id ? null : t.id)}
              >
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
                {expandedId === t.id && (
                  <div className="mt-3 pt-3" style={{ borderTop: '1px solid var(--sda-border)' }}>
                    <DetailRow label="Interception Probability" value={`${(t.interceptionProbability * 100).toFixed(1)}%`} />
                    <DetailRow label="Signal Path Angle" value={`${t.signalPathAngleDeg.toFixed(2)}°`} />
                    <DetailRow label="Comm Windows at Risk" value={`${t.commWindowsAtRisk} / ${t.totalCommWindows}`} />
                    <DetailRow label="Ground Station" value={t.groundStationName} />
                    <DetailRow label="Time to Closest Approach" value={`${t.tcaInMinutes} min`} />
                    <DetailRow label="Confidence" value={`${(t.confidence * 100).toFixed(1)}%`} />
                    <PositionInfo pos={t.position} label="Interceptor Position" />
                  </div>
                )}
              </Card>
            ))}
            {signal.length === 0 && renderFeedFallback('signal', 'No signal threats detected')}
          </div>
        } />
        <Tab id="anomaly" title={`Anomaly (${anomaly.length})`} panel={
          <div className="space-y-2 mt-2">
            {anomaly.map(t => (
              <Card
                key={t.id}
                className="p-3 cursor-pointer"
                style={{ backgroundColor: 'var(--sda-bg-secondary)' }}
                interactive
                onClick={() => setExpandedId(expandedId === t.id ? null : t.id)}
              >
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
                {expandedId === t.id && (
                  <div className="mt-3 pt-3" style={{ borderTop: '1px solid var(--sda-border)' }}>
                    <DetailRow label="Anomaly Type" value={t.anomalyType} />
                    <DetailRow label="Baseline Deviation" value={`${(t.baselineDeviation * 100).toFixed(1)}%`} />
                    <DetailRow label="Confidence" value={`${(t.confidence * 100).toFixed(1)}%`} />
                    <DetailRow label="Detected At" value={new Date(t.detectedAt).toLocaleString()} />
                    <div className="mt-2">
                      <div className="text-xs font-medium mb-1" style={{ color: 'var(--sda-text-secondary)' }}>Description</div>
                      <div className="text-xs p-2" style={{ color: 'var(--sda-text-primary)', backgroundColor: 'var(--sda-bg-primary)' }}>
                        {t.description}
                      </div>
                    </div>
                    <PositionInfo pos={t.position} label="Satellite Position" />
                  </div>
                )}
              </Card>
            ))}
            {anomaly.length === 0 && renderFeedFallback('anomaly', 'No anomalies detected')}
          </div>
        } />
        <Tab id="orbital" title={`Orbital (${orbital.length})`} panel={
          <div className="space-y-2 mt-2">
            {orbital.map(t => (
              <Card
                key={t.id}
                className="p-3 cursor-pointer"
                style={{ backgroundColor: 'var(--sda-bg-secondary)' }}
                interactive
                onClick={() => setExpandedId(expandedId === t.id ? null : t.id)}
              >
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
                {expandedId === t.id && (
                  <div className="mt-3 pt-3" style={{ borderTop: '1px solid var(--sda-border)' }}>
                    <DetailRow label="Divergence Score" value={t.divergenceScore.toFixed(4)} />
                    <DetailRow label="Pattern" value={t.pattern} />
                    <DetailRow label="Inclination Diff" value={`${t.inclinationDiffDeg.toFixed(2)}°`} />
                    <DetailRow label="Altitude Diff" value={`${t.altitudeDiffKm.toFixed(1)} km`} />
                    <DetailRow label="Confidence" value={`${(t.confidence * 100).toFixed(1)}%`} />
                    <div className="mt-2 grid grid-cols-2 gap-3">
                      <div>
                        <div className="text-xs font-medium mb-1" style={{ color: 'var(--sda-text-secondary)' }}>Foreign Orbit</div>
                        <div className="text-xs" style={{ color: 'var(--sda-text-primary)' }}>
                          Alt: {t.foreignOrbit.altitudeKm.toFixed(0)} km | Inc: {t.foreignOrbit.inclinationDeg.toFixed(1)}°
                        </div>
                        <div className="text-xs" style={{ color: 'var(--sda-text-primary)' }}>
                          Period: {t.foreignOrbit.periodMin.toFixed(1)} min | Vel: {t.foreignOrbit.velocityKms.toFixed(2)} km/s
                        </div>
                      </div>
                      <div>
                        <div className="text-xs font-medium mb-1" style={{ color: 'var(--sda-text-secondary)' }}>Target Orbit</div>
                        <div className="text-xs" style={{ color: 'var(--sda-text-primary)' }}>
                          Alt: {t.targetOrbit.altitudeKm.toFixed(0)} km | Inc: {t.targetOrbit.inclinationDeg.toFixed(1)}°
                        </div>
                        <div className="text-xs" style={{ color: 'var(--sda-text-primary)' }}>
                          Period: {t.targetOrbit.periodMin.toFixed(1)} min | Vel: {t.targetOrbit.velocityKms.toFixed(2)} km/s
                        </div>
                      </div>
                    </div>
                    <PositionInfo pos={t.position} label="Current Position" />
                  </div>
                )}
              </Card>
            ))}
            {orbital.length === 0 && renderFeedFallback('orbital', 'No orbital similarity threats')}
          </div>
        } />
        <Tab id="geoloiter" title={`GEO Loiter (${geoLoiter.length})`} panel={
          <div className="space-y-2 mt-2">
            {geoLoiter.map(t => (
              <Card
                key={t.id}
                className="p-3 cursor-pointer"
                style={{ backgroundColor: 'var(--sda-bg-secondary)' }}
                interactive
                onClick={() => setExpandedId(expandedId === t.id ? null : t.id)}
              >
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
                {expandedId === t.id && (
                  <div className="mt-3 pt-3" style={{ borderTop: '1px solid var(--sda-border)' }}>
                    <DetailRow label="NORAD ID" value={t.noradId} />
                    <DetailRow label="Country" value={t.countryCode} />
                    <DetailRow label="Orbit Type" value={t.orbitType} />
                    <DetailRow label="Subsatellite Longitude" value={`${t.subsatelliteLonDeg.toFixed(2)}°`} />
                    <DetailRow label="Subsatellite Latitude" value={`${t.subsatelliteLatDeg.toFixed(2)}°`} />
                    <DetailRow label="Altitude" value={`${t.altitudeKm.toFixed(1)} km`} />
                    <DetailRow label="Dwell Fraction" value={`${(t.dwellFractionOverUs * 100).toFixed(1)}%`} />
                    <DetailRow label="Threat Score" value={`${(t.threatScore * 100).toFixed(1)}%`} />
                    <DetailRow label="Confidence" value={`${(t.confidence * 100).toFixed(1)}%`} />
                    <DetailRow label="Detected At" value={new Date(t.detectedAt).toLocaleString()} />
                    {t.description && (
                      <div className="mt-2">
                        <div className="text-xs font-medium mb-1" style={{ color: 'var(--sda-text-secondary)' }}>Description</div>
                        <div className="text-xs p-2" style={{ color: 'var(--sda-text-primary)', backgroundColor: 'var(--sda-bg-primary)' }}>
                          {t.description}
                        </div>
                      </div>
                    )}
                    <PositionInfo pos={t.position} label="Current Position" />
                  </div>
                )}
              </Card>
            ))}
            {geoLoiter.length === 0 && renderFeedFallback('geoloiter', 'No GEO loiter threats')}
          </div>
        } />
      </Tabs>
    </div>
  );
}
