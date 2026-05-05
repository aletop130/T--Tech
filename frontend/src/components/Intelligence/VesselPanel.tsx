'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button, InputGroup, Spinner, Tag } from '@blueprintjs/core';

import { api, type VesselPosition, type TrafficAreaPreset } from '@/lib/api';

const REFRESH_INTERVAL = 30_000;

export function VesselPanel() {
  const [presets, setPresets] = useState<TrafficAreaPreset[]>([]);
  const [activePreset, setActivePreset] = useState('mediterranean');
  const [vessels, setVessels] = useState<VesselPosition[]>([]);
  const [loading, setLoading] = useState(false);
  const [subscribing, setSubscribing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    api.getTrafficPresets().then(setPresets).catch(() => {});
  }, []);

  const loadVessels = useCallback(async (preset: string) => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getVessels(preset);
      setVessels(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load vessels');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadVessels(activePreset);
    const interval = setInterval(() => loadVessels(activePreset), REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [activePreset, loadVessels]);

  const handleSubscribe = useCallback(async () => {
    setSubscribing(true);
    try {
      await api.subscribeVessels(activePreset);
      await loadVessels(activePreset);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Subscribe failed');
    } finally {
      setSubscribing(false);
    }
  }, [activePreset, loadVessels]);

  const filtered = filter
    ? vessels.filter(
        (v) =>
          (v.name ?? '').toLowerCase().includes(filter.toLowerCase()) ||
          String(v.mmsi).includes(filter),
      )
    : vessels;

  function formatHeading(v: VesselPosition): string {
    if (v.heading_deg == null) return '--';
    return `${Math.round(v.heading_deg)}°`;
  }

  function formatSpeed(v: VesselPosition): string {
    if (v.speed_knots == null) return '--';
    return `${v.speed_knots.toFixed(1)}kn`;
  }

  return (
    <div className="flex h-full flex-col">
      {/* Area selector */}
      <div className="flex-shrink-0 border-b border-[#1a1a1a] p-3">
        <div className="mb-2 font-code text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
          AREA SELECTOR
        </div>
        <div className="flex flex-wrap gap-1.5">
          {(presets.length > 0 ? presets : [{ key: 'mediterranean', label: 'Mediterraneo', bbox: null }]).map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => setActivePreset(p.key)}
              className={`border px-2.5 py-1 font-code text-[10px] font-medium uppercase tracking-wider transition-colors ${
                activePreset === p.key
                  ? 'border-sda-accent-cyan/50 bg-sda-accent-cyan/10 text-sda-accent-cyan'
                  : 'border-[#1a1a1a] text-zinc-500 hover:border-zinc-600 hover:text-zinc-300'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="mt-2.5 flex items-center gap-2">
          <Button
            small
            intent="primary"
            icon="feed"
            loading={subscribing}
            onClick={handleSubscribe}
            className="font-code text-[10px] uppercase"
          >
            SUBSCRIBE
          </Button>
          {loading && <Spinner size={14} />}
        </div>
      </div>

      {/* Header + filter */}
      <div className="flex-shrink-0 border-b border-[#1a1a1a] p-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="font-code text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
            VESSEL FEED
          </span>
          <Tag minimal className="font-code text-[10px]">
            {filtered.length}
          </Tag>
        </div>
        <InputGroup
          small
          leftIcon="search"
          placeholder="Filter name / MMSI..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="font-code text-[10px]"
        />
      </div>

      {/* Error */}
      {error && (
        <div className="flex-shrink-0 border-b border-red-500/20 bg-red-500/5 px-3 py-2 font-code text-[10px] text-red-400">
          {error}
        </div>
      )}

      {/* List */}
      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        {filtered.length === 0 && !loading ? (
          <div className="p-6 text-center font-code text-[10px] text-zinc-600">
            {vessels.length === 0 ? 'No vessel data. Click SUBSCRIBE to start AIS stream.' : 'No vessels match filter.'}
          </div>
        ) : (
          <div className="flex flex-col gap-px p-1">
            {filtered.map((v) => (
              <div
                key={v.mmsi}
                className="flex items-center gap-3 border border-[#1a1a1a] bg-white/[0.015] px-3 py-1.5 transition-colors hover:border-emerald-400/20 hover:bg-white/[0.03]"
              >
                <span className="text-[12px] text-emerald-400">&#9875;</span>
                <div className="min-w-0 flex-1">
                  <div className="font-code text-[10px] font-medium text-sda-text-primary">
                    {v.name || `MMSI ${v.mmsi}`}
                  </div>
                  <div className="font-code text-[9px] text-zinc-600">
                    {v.latitude.toFixed(2)}°N {v.longitude.toFixed(2)}°E
                    {v.destination ? ` → ${v.destination}` : ''}
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-code text-[10px] font-medium text-zinc-300">
                    {formatHeading(v)}
                  </div>
                  <div className="font-code text-[9px] text-zinc-600">
                    {formatSpeed(v)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
