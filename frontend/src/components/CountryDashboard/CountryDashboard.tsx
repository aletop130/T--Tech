'use client';

import { useState, useEffect, useMemo } from 'react';
import { Card, HTMLTable, Tag, Spinner, Icon, NonIdealState } from '@blueprintjs/core';
import { api } from '@/lib/api';
import type { CountryDashboardSummary, CountrySummary, OperatorSummary } from '@/lib/api';

type SortKey = 'country_name' | 'total_objects' | 'payloads' | 'debris' | 'rocket_bodies';
type SortDir = 'asc' | 'desc';

function OrbitBar({ leo, meo, geo, heo }: { leo: number; meo: number; geo: number; heo: number }) {
  const total = leo + meo + geo + heo;
  if (total === 0) return <span style={{ color: 'var(--sda-text-tertiary)' }}>-</span>;

  const segments = [
    { label: 'LEO', value: leo, color: '#4dabf7' },
    { label: 'MEO', value: meo, color: '#ffd43b' },
    { label: 'GEO', value: geo, color: '#69db7c' },
    { label: 'HEO', value: heo, color: '#e599f7' },
  ].filter(s => s.value > 0);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <svg width={120} height={14} style={{ borderRadius: 3, overflow: 'hidden' }}>
        {segments.reduce<{ offset: number; elements: JSX.Element[] }>((acc, seg) => {
          const w = (seg.value / total) * 120;
          acc.elements.push(
            <rect key={seg.label} x={acc.offset} y={0} width={w} height={14} fill={seg.color} opacity={0.85} />
          );
          acc.offset += w;
          return acc;
        }, { offset: 0, elements: [] }).elements}
      </svg>
      <span style={{ fontSize: 11, color: 'var(--sda-text-tertiary)', whiteSpace: 'nowrap' }}>
        {segments.map(s => `${s.label}:${s.value}`).join(' ')}
      </span>
    </div>
  );
}

function SummaryCard({ label, value, color }: { label: string; value: number | string; color: string }) {
  return (
    <Card style={{ padding: '16px 20px', flex: 1, minWidth: 140, background: 'var(--sda-bg-secondary)', border: '1px solid var(--sda-border-default)' }}>
      <div style={{ fontSize: 11, color: 'var(--sda-text-tertiary)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 700, color, fontVariantNumeric: 'tabular-nums' }}>
        {typeof value === 'number' ? value.toLocaleString() : value}
      </div>
    </Card>
  );
}

export function CountryDashboard() {
  const [data, setData] = useState<CountryDashboardSummary | null>(null);
  const [operators, setOperators] = useState<OperatorSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('total_objects');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [expandedCountry, setExpandedCountry] = useState<string | null>(null);
  const [searchFilter, setSearchFilter] = useState('');

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const [summary, ops] = await Promise.all([
          api.getCountryDashboardSummary(),
          api.getTopOperators(30),
        ]);
        setData(summary);
        setOperators(ops.operators);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Failed to load data');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  const sortedCountries = useMemo(() => {
    if (!data) return [];
    const filtered = data.all_countries.filter(c => {
      if (!searchFilter) return true;
      const q = searchFilter.toLowerCase();
      return c.country_code.toLowerCase().includes(q) || c.country_name.toLowerCase().includes(q);
    });
    return [...filtered].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (typeof av === 'string' && typeof bv === 'string') {
        return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
      }
      return sortDir === 'asc' ? (av as number) - (bv as number) : (bv as number) - (av as number);
    });
  }, [data, sortKey, sortDir, searchFilter]);

  const renderSortIcon = (key: SortKey) => {
    if (sortKey !== key) return null;
    return <Icon icon={sortDir === 'asc' ? 'sort-asc' : 'sort-desc'} size={12} style={{ marginLeft: 4 }} />;
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', padding: 80 }}>
        <Spinner size={40} />
      </div>
    );
  }

  if (error || !data) {
    return <NonIdealState icon="error" title="Failed to load" description={error || 'Unknown error'} />;
  }

  return (
    <div style={{ padding: 24, maxWidth: 1400, margin: '0 auto' }}>
      <h2 style={{ margin: '0 0 20px', color: 'var(--sda-text-primary)', fontSize: 20, fontWeight: 600 }}>
        Country / Operator Dashboard
      </h2>

      {/* Summary cards */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
        <SummaryCard label="Total Active Objects" value={data.total_objects} color="#4dabf7" />
        <SummaryCard label="Countries" value={data.total_countries} color="#20c997" />
        <SummaryCard label="Payloads" value={data.total_payloads} color="#69db7c" />
        <SummaryCard label="Rocket Bodies" value={data.total_rocket_bodies} color="#ffd43b" />
        <SummaryCard label="Debris" value={data.total_debris} color="#ff6b6b" />
      </div>

      {/* Global orbit distribution */}
      <Card style={{ padding: 16, marginBottom: 24, background: 'var(--sda-bg-secondary)', border: '1px solid var(--sda-border-default)' }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--sda-text-primary)', marginBottom: 12 }}>
          Global Orbit Distribution
        </div>
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
          {[
            { label: 'LEO', value: data.orbit_distribution.leo, color: '#4dabf7' },
            { label: 'MEO', value: data.orbit_distribution.meo, color: '#ffd43b' },
            { label: 'GEO', value: data.orbit_distribution.geo, color: '#69db7c' },
            { label: 'HEO', value: data.orbit_distribution.heo, color: '#e599f7' },
          ].map(o => {
            const pct = data.total_objects > 0 ? ((o.value / data.total_objects) * 100).toFixed(1) : '0';
            return (
              <div key={o.label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <svg width={12} height={12}><rect width={12} height={12} rx={2} fill={o.color} /></svg>
                <span style={{ color: 'var(--sda-text-primary)', fontSize: 13, fontWeight: 500 }}>
                  {o.label}: {o.value.toLocaleString()}
                </span>
                <span style={{ color: 'var(--sda-text-tertiary)', fontSize: 12 }}>({pct}%)</span>
              </div>
            );
          })}
        </div>
        {/* Full-width bar */}
        <svg width="100%" height={20} style={{ marginTop: 12, borderRadius: 4, overflow: 'hidden', display: 'block' }}>
          {(() => {
            const total = data.total_objects || 1;
            const segs = [
              { v: data.orbit_distribution.leo, c: '#4dabf7' },
              { v: data.orbit_distribution.meo, c: '#ffd43b' },
              { v: data.orbit_distribution.geo, c: '#69db7c' },
              { v: data.orbit_distribution.heo, c: '#e599f7' },
            ];
            let offset = 0;
            return segs.map((s, i) => {
              const pct = `${(s.v / total) * 100}%`;
              const el = <rect key={i} x={`${(offset / total) * 100}%`} y={0} width={pct} height={20} fill={s.c} opacity={0.8} />;
              offset += s.v;
              return el;
            });
          })()}
        </svg>
      </Card>

      {/* Search */}
      <div style={{ marginBottom: 12 }}>
        <input
          type="text"
          placeholder="Search country..."
          value={searchFilter}
          onChange={e => setSearchFilter(e.target.value)}
          style={{
            width: 280,
            padding: '6px 10px',
            borderRadius: 4,
            border: '1px solid var(--sda-border-default)',
            background: 'var(--sda-bg-secondary)',
            color: 'var(--sda-text-primary)',
            fontSize: 13,
            outline: 'none',
          }}
        />
      </div>

      {/* Country table */}
      <Card style={{ padding: 0, overflow: 'hidden', background: 'var(--sda-bg-secondary)', border: '1px solid var(--sda-border-default)', marginBottom: 24 }}>
        <div style={{ overflowX: 'auto' }}>
          <HTMLTable compact striped style={{ width: '100%', fontSize: 13 }}>
            <thead>
              <tr>
                <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('country_name')}>
                  Country {renderSortIcon('country_name')}
                </th>
                <th style={{ cursor: 'pointer', userSelect: 'none', textAlign: 'right' }} onClick={() => handleSort('total_objects')}>
                  Total {renderSortIcon('total_objects')}
                </th>
                <th style={{ cursor: 'pointer', userSelect: 'none', textAlign: 'right' }} onClick={() => handleSort('payloads')}>
                  Payloads {renderSortIcon('payloads')}
                </th>
                <th style={{ cursor: 'pointer', userSelect: 'none', textAlign: 'right' }} onClick={() => handleSort('rocket_bodies')}>
                  R/B {renderSortIcon('rocket_bodies')}
                </th>
                <th style={{ cursor: 'pointer', userSelect: 'none', textAlign: 'right' }} onClick={() => handleSort('debris')}>
                  Debris {renderSortIcon('debris')}
                </th>
                <th>Orbit Distribution</th>
              </tr>
            </thead>
            <tbody>
              {sortedCountries.map((c: CountrySummary) => (
                <>
                  <tr
                    key={c.country_code}
                    onClick={() => setExpandedCountry(expandedCountry === c.country_code ? null : c.country_code)}
                    style={{ cursor: 'pointer' }}
                  >
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Icon icon={expandedCountry === c.country_code ? 'chevron-down' : 'chevron-right'} size={12} />
                        <Tag minimal style={{ fontFamily: 'monospace', fontSize: 11 }}>{c.country_code}</Tag>
                        <span>{c.country_name}</span>
                      </div>
                    </td>
                    <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                      {c.total_objects.toLocaleString()}
                    </td>
                    <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                      {c.payloads.toLocaleString()}
                    </td>
                    <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                      {c.rocket_bodies.toLocaleString()}
                    </td>
                    <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                      {c.debris.toLocaleString()}
                    </td>
                    <td>
                      <OrbitBar leo={c.leo} meo={c.meo} geo={c.geo} heo={c.heo} />
                    </td>
                  </tr>
                  {expandedCountry === c.country_code && (
                    <tr key={`${c.country_code}-detail`}>
                      <td colSpan={6} style={{ padding: '12px 24px', background: 'var(--sda-bg-tertiary)' }}>
                        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
                          <div>
                            <div style={{ fontSize: 11, color: 'var(--sda-text-tertiary)', marginBottom: 4 }}>Orbit Breakdown</div>
                            <div style={{ display: 'flex', gap: 12 }}>
                              <Tag intent="primary" minimal>LEO: {c.leo}</Tag>
                              <Tag style={{ background: '#ffd43b33', color: '#ffd43b' }} minimal>MEO: {c.meo}</Tag>
                              <Tag intent="success" minimal>GEO: {c.geo}</Tag>
                              <Tag style={{ background: '#e599f733', color: '#e599f7' }} minimal>HEO: {c.heo}</Tag>
                            </div>
                          </div>
                          <div>
                            <div style={{ fontSize: 11, color: 'var(--sda-text-tertiary)', marginBottom: 4 }}>Object Types</div>
                            <div style={{ display: 'flex', gap: 12 }}>
                              <Tag intent="success" minimal>Payloads: {c.payloads}</Tag>
                              <Tag intent="warning" minimal>Rocket Bodies: {c.rocket_bodies}</Tag>
                              <Tag intent="danger" minimal>Debris: {c.debris}</Tag>
                            </div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </HTMLTable>
        </div>
      </Card>

      {/* Top operators */}
      <Card style={{ padding: 16, background: 'var(--sda-bg-secondary)', border: '1px solid var(--sda-border-default)' }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--sda-text-primary)', marginBottom: 12 }}>
          Top Operators / Programs
        </div>
        <HTMLTable compact striped style={{ width: '100%', fontSize: 13 }}>
          <thead>
            <tr>
              <th>Operator / Program</th>
              <th>Country</th>
              <th style={{ textAlign: 'right' }}>Satellites</th>
              <th>Type</th>
            </tr>
          </thead>
          <tbody>
            {operators.map((op, i) => (
              <tr key={`${op.operator_name}-${i}`}>
                <td style={{ fontWeight: 500 }}>{op.operator_name}</td>
                <td>{op.country}</td>
                <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                  {op.satellite_count.toLocaleString()}
                </td>
                <td>
                  <Tag minimal intent={op.primary_purpose === 'payload' ? 'success' : op.primary_purpose === 'debris' ? 'danger' : 'warning'}>
                    {op.primary_purpose}
                  </Tag>
                </td>
              </tr>
            ))}
          </tbody>
        </HTMLTable>
      </Card>
    </div>
  );
}
