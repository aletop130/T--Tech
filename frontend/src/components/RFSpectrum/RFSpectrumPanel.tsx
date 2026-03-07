'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Card,
  Tag,
  Spinner,
  Tabs,
  Tab,
  Button,
  Callout,
  HTMLTable,
  InputGroup,
  HTMLSelect,
} from '@blueprintjs/core';
import { api } from '@/lib/api';
import type { RFTransmitter, RFBandSummary, RFSatelliteProfile } from '@/lib/api';

const BAND_COLORS: Record<string, string> = {
  HF: '#a855f7',
  VHF: '#3b82f6',
  UHF: '#22c55e',
  'S-band': '#eab308',
  'C-band': '#f97316',
  'X-band': '#ef4444',
  'Ku-band': '#ec4899',
  'Ka-band': '#06b6d4',
  EHF: '#8b5cf6',
  Unknown: '#6b7280',
};

const BAND_OPTIONS = ['', 'HF', 'VHF', 'UHF', 'S-band', 'C-band', 'X-band', 'Ku-band', 'Ka-band'];
const MODE_OPTIONS = ['', 'FM', 'AFSK', 'BPSK', 'QPSK', 'FSK', 'CW', 'SSB', 'AM', 'GFSK', 'GMSK', 'LoRa', 'OQPSK'];

function formatFreq(hz: number | null): string {
  if (!hz || hz <= 0) return '-';
  if (hz >= 1e9) return `${(hz / 1e9).toFixed(3)} GHz`;
  if (hz >= 1e6) return `${(hz / 1e6).toFixed(3)} MHz`;
  if (hz >= 1e3) return `${(hz / 1e3).toFixed(1)} kHz`;
  return `${hz} Hz`;
}

function BandTag({ band }: { band: string }) {
  return (
    <Tag
      minimal
      style={{
        backgroundColor: BAND_COLORS[band] || BAND_COLORS.Unknown,
        color: '#fff',
        fontWeight: 600,
      }}
    >
      {band}
    </Tag>
  );
}

function StatusTag({ alive, status }: { alive: boolean; status: string }) {
  if (!alive) return <Tag intent="danger" minimal>DEAD</Tag>;
  if (status === 'active') return <Tag intent="success" minimal>ACTIVE</Tag>;
  return <Tag intent="warning" minimal>{status.toUpperCase()}</Tag>;
}

function BandOverview({ bands }: { bands: RFBandSummary[] }) {
  const maxTx = Math.max(...bands.map(b => b.transmitter_count), 1);

  return (
    <div className="space-y-3">
      {bands.map(b => (
        <div key={b.band_name}>
          <div className="flex justify-between items-center mb-1">
            <div className="flex items-center gap-2">
              <BandTag band={b.band_name} />
              <span className="text-xs" style={{ color: 'var(--sda-text-secondary)' }}>
                {b.frequency_range}
              </span>
            </div>
            <span className="text-xs" style={{ color: 'var(--sda-text-secondary)' }}>
              {b.satellite_count} sats / {b.transmitter_count} tx
            </span>
          </div>
          <div
            className="h-2 rounded-full"
            style={{ backgroundColor: 'var(--sda-bg-tertiary)' }}
          >
            <div
              className="h-2 rounded-full transition-all"
              style={{
                width: `${(b.transmitter_count / maxTx) * 100}%`,
                backgroundColor: BAND_COLORS[b.band_name] || BAND_COLORS.Unknown,
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function TransmitterTable({ transmitters }: { transmitters: RFTransmitter[] }) {
  if (!transmitters.length) {
    return (
      <Callout intent="primary" icon="info-sign" className="mt-2">
        No transmitters found matching current filters.
      </Callout>
    );
  }

  return (
    <div className="overflow-x-auto mt-2">
      <HTMLTable compact striped interactive style={{ width: '100%' }}>
        <thead>
          <tr>
            <th>NORAD</th>
            <th>Description</th>
            <th>Band</th>
            <th>Downlink</th>
            <th>Uplink</th>
            <th>Mode</th>
            <th>Baud</th>
            <th>Type</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {transmitters.slice(0, 200).map((tx, i) => (
            <tr key={tx.uuid || i}>
              <td style={{ color: 'var(--sda-accent-cyan)' }}>{tx.norad_cat_id || '-'}</td>
              <td>{tx.description || '-'}</td>
              <td><BandTag band={tx.band} /></td>
              <td style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
                {formatFreq(tx.downlink_low)}
                {tx.downlink_high && tx.downlink_high !== tx.downlink_low
                  ? ` - ${formatFreq(tx.downlink_high)}`
                  : ''}
              </td>
              <td style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
                {formatFreq(tx.uplink_low)}
                {tx.uplink_high && tx.uplink_high !== tx.uplink_low
                  ? ` - ${formatFreq(tx.uplink_high)}`
                  : ''}
              </td>
              <td>
                {tx.mode ? (
                  <Tag minimal intent="none" style={{ fontSize: '0.7rem' }}>
                    {tx.mode}
                  </Tag>
                ) : '-'}
              </td>
              <td style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
                {tx.baud ? `${tx.baud}` : '-'}
              </td>
              <td className="text-xs">{tx.type || '-'}</td>
              <td><StatusTag alive={tx.alive} status={tx.status} /></td>
            </tr>
          ))}
        </tbody>
      </HTMLTable>
      {transmitters.length > 200 && (
        <p className="text-xs mt-1" style={{ color: 'var(--sda-text-secondary)' }}>
          Showing first 200 of {transmitters.length} results.
        </p>
      )}
    </div>
  );
}

export function RFSpectrumPanel() {
  const [bands, setBands] = useState<RFBandSummary[]>([]);
  const [searchResults, setSearchResults] = useState<RFTransmitter[]>([]);
  const [searchTotal, setSearchTotal] = useState(0);
  const [satProfile, setSatProfile] = useState<RFSatelliteProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchLoading, setSearchLoading] = useState(false);
  const [satLoading, setSatLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('bands');

  // Filters
  const [bandFilter, setBandFilter] = useState('');
  const [modeFilter, setModeFilter] = useState('');
  const [noradInput, setNoradInput] = useState('');

  const fetchBands = useCallback(async () => {
    try {
      setError(null);
      const data = await api.getRFBandSummary();
      setBands(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load band data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBands();
  }, [fetchBands]);

  const handleSearch = useCallback(async () => {
    setSearchLoading(true);
    try {
      const data = await api.searchRFTransmitters({
        band: bandFilter || undefined,
        mode: modeFilter || undefined,
      });
      setSearchResults(data.transmitters);
      setSearchTotal(data.total);
    } catch (e) {
      console.error('RF search error:', e);
    } finally {
      setSearchLoading(false);
    }
  }, [bandFilter, modeFilter]);

  const handleSatLookup = useCallback(async () => {
    const id = parseInt(noradInput, 10);
    if (isNaN(id) || id <= 0) return;
    setSatLoading(true);
    try {
      const data = await api.getRFSatelliteProfile(id);
      setSatProfile(data);
    } catch (e) {
      console.error('Satellite RF lookup error:', e);
      setSatProfile(null);
    } finally {
      setSatLoading(false);
    }
  }, [noradInput]);

  if (loading) {
    return (
      <div className="p-4">
        <Spinner size={20} /> Loading RF spectrum data...
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4">
        <Callout intent="danger" title="Failed to load RF data">
          {error}
          <div className="mt-2">
            <Button small intent="primary" onClick={fetchBands}>Retry</Button>
          </div>
        </Callout>
      </div>
    );
  }

  return (
    <div className="p-4">
      <h2 className="text-lg font-semibold mb-3" style={{ color: 'var(--sda-text-primary)' }}>
        RF Spectrum Awareness
      </h2>
      <p className="text-xs mb-4" style={{ color: 'var(--sda-text-secondary)' }}>
        Satellite transmitter data from SatNOGS DB
      </p>

      <Tabs selectedTabId={activeTab} onChange={(id) => setActiveTab(id as string)}>
        <Tab
          id="bands"
          title="Band Overview"
          panel={
            <Card className="mt-2 p-4" style={{ backgroundColor: 'var(--sda-bg-secondary)' }}>
              <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--sda-text-primary)' }}>
                Spectrum Band Allocation
              </h3>
              <BandOverview bands={bands} />
              <div className="mt-4">
                <HTMLTable compact striped style={{ width: '100%' }}>
                  <thead>
                    <tr>
                      <th>Band</th>
                      <th>Range</th>
                      <th>Satellites</th>
                      <th>Transmitters</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bands.map(b => (
                      <tr key={b.band_name}>
                        <td><BandTag band={b.band_name} /></td>
                        <td style={{ color: 'var(--sda-text-secondary)' }}>{b.frequency_range}</td>
                        <td>{b.satellite_count}</td>
                        <td>{b.transmitter_count}</td>
                      </tr>
                    ))}
                  </tbody>
                </HTMLTable>
              </div>
            </Card>
          }
        />
        <Tab
          id="search"
          title="Search Transmitters"
          panel={
            <Card className="mt-2 p-4" style={{ backgroundColor: 'var(--sda-bg-secondary)' }}>
              <div className="flex gap-3 items-end flex-wrap mb-3">
                <div>
                  <label className="text-xs block mb-1" style={{ color: 'var(--sda-text-secondary)' }}>
                    Band
                  </label>
                  <HTMLSelect
                    value={bandFilter}
                    onChange={(e) => setBandFilter(e.target.value)}
                    options={BAND_OPTIONS.map(b => ({ label: b || 'All Bands', value: b }))}
                  />
                </div>
                <div>
                  <label className="text-xs block mb-1" style={{ color: 'var(--sda-text-secondary)' }}>
                    Mode
                  </label>
                  <HTMLSelect
                    value={modeFilter}
                    onChange={(e) => setModeFilter(e.target.value)}
                    options={MODE_OPTIONS.map(m => ({ label: m || 'All Modes', value: m }))}
                  />
                </div>
                <Button
                  intent="primary"
                  icon="search"
                  loading={searchLoading}
                  onClick={handleSearch}
                >
                  Search
                </Button>
              </div>
              {searchTotal > 0 && (
                <p className="text-xs mb-2" style={{ color: 'var(--sda-text-secondary)' }}>
                  Found {searchTotal} transmitters
                </p>
              )}
              <TransmitterTable transmitters={searchResults} />
            </Card>
          }
        />
        <Tab
          id="satellite"
          title="Satellite Lookup"
          panel={
            <Card className="mt-2 p-4" style={{ backgroundColor: 'var(--sda-bg-secondary)' }}>
              <div className="flex gap-3 items-end mb-3">
                <div>
                  <label className="text-xs block mb-1" style={{ color: 'var(--sda-text-secondary)' }}>
                    NORAD Catalog ID
                  </label>
                  <InputGroup
                    placeholder="e.g. 25544"
                    value={noradInput}
                    onChange={(e) => setNoradInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSatLookup()}
                    type="number"
                  />
                </div>
                <Button
                  intent="primary"
                  icon="satellite"
                  loading={satLoading}
                  onClick={handleSatLookup}
                >
                  Lookup
                </Button>
              </div>
              {satProfile && (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Tag intent="primary" large>
                      NORAD {satProfile.norad_id}
                    </Tag>
                    {satProfile.satellite_name && (
                      <span className="font-medium" style={{ color: 'var(--sda-text-primary)' }}>
                        {satProfile.satellite_name}
                      </span>
                    )}
                    <Tag minimal>
                      {satProfile.transmitters.length} transmitter{satProfile.transmitters.length !== 1 ? 's' : ''}
                    </Tag>
                  </div>
                  <TransmitterTable transmitters={satProfile.transmitters} />
                </div>
              )}
            </Card>
          }
        />
      </Tabs>
    </div>
  );
}
