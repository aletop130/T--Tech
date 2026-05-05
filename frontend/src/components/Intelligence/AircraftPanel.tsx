'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button, InputGroup, Spinner, Tag } from '@blueprintjs/core';

import { api, type AircraftPosition, type TrafficAreaPreset } from '@/lib/api';

const REFRESH_INTERVAL = 60_000;

export function AircraftPanel() {
  const [presets, setPresets] = useState<TrafficAreaPreset[]>([]);
  const [activePreset, setActivePreset] = useState('italy');
  const [aircraft, setAircraft] = useState<AircraftPosition[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    api.getTrafficPresets().then(setPresets).catch(() => {});
  }, []);

  const loadAircraft = useCallback(async (preset: string) => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getAircraft(preset);
      setAircraft(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load aircraft');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAircraft(activePreset);
    const interval = setInterval(() => loadAircraft(activePreset), REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [activePreset, loadAircraft]);

  const handleFetch = useCallback(async () => {
    setFetching(true);
    try {
      await api.fetchAircraft(activePreset);
      await loadAircraft(activePreset);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fetch failed');
    } finally {
      setFetching(false);
    }
  }, [activePreset, loadAircraft]);

  const filtered = filter
    ? aircraft.filter(
        (a) =>
          (a.callsign ?? '').toLowerCase().includes(filter.toLowerCase()) ||
          a.icao24.toLowerCase().includes(filter.toLowerCase()),
      )
    : aircraft;

  function formatAlt(a: AircraftPosition): string {
    if (a.on_ground) return 'GND';
    const fl = Math.round(a.altitude_m / 30.48 / 100);
    return `FL${String(fl).padStart(3, '0')}`;
  }

  function formatSpeed(a: AircraftPosition): string {
    if (a.speed_ms == null) return '--';
    const kts = Math.round(a.speed_ms * 1.944);
    return `${kts}kt`;
  }

  return (
    <div className="flex h-full flex-col">
      {/* Area selector */}
      <div className="flex-shrink-0 border-b border-[#1a1a1a] p-3">
        <div className="mb-2 font-code text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
          AREA SELECTOR
        </div>
        <div className="flex flex-wrap gap-1.5">
          {(presets.length > 0 ? presets : [{ key: 'italy', label: 'Italia', bbox: null }]).map((p) => (
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
            icon="refresh"
            loading={fetching}
            onClick={handleFetch}
            className="font-code text-[10px] uppercase"
          >
            FETCH
          </Button>
          {loading && <Spinner size={14} />}
        </div>
      </div>

      {/* Header + filter */}
      <div className="flex-shrink-0 border-b border-[#1a1a1a] p-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="font-code text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
            AIRCRAFT FEED
          </span>
          <Tag minimal className="font-code text-[10px]">
            {filtered.length}
          </Tag>
        </div>
        <InputGroup
          small
          leftIcon="search"
          placeholder="Filter callsign / ICAO24..."
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
            {aircraft.length === 0 ? 'No aircraft data. Click FETCH to pull live data.' : 'No aircraft match filter.'}
          </div>
        ) : (
          <div className="flex flex-col gap-px p-1">
            {filtered.map((a) => (
              <div
                key={a.icao24}
                className="flex items-center gap-3 border border-[#1a1a1a] bg-white/[0.015] px-3 py-1.5 transition-colors hover:border-sda-accent-cyan/20 hover:bg-white/[0.03]"
              >
                <span className="text-[12px] text-blue-400">&#9992;</span>
                <div className="min-w-0 flex-1">
                  <div className="font-code text-[10px] font-medium text-sda-text-primary">
                    {a.callsign || a.icao24}
                  </div>
                  <div className="font-code text-[9px] text-zinc-600">
                    {a.latitude.toFixed(2)}°N {a.longitude.toFixed(2)}°E
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-code text-[10px] font-medium text-zinc-300">
                    {formatAlt(a)}
                  </div>
                  <div className="font-code text-[9px] text-zinc-600">
                    {formatSpeed(a)}
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
