'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Card,
  Tag,
  Spinner,
  Button,
  Callout,
  Collapse,
  Icon,
  InputGroup,
} from '@blueprintjs/core';
import { api } from '@/lib/api';
import type {
  FragmentationEvent,
  FragmentationEventDetail,
  DebrisLineage,
} from '@/lib/api';

const EVENT_TYPE_COLORS: Record<string, string> = {
  ASAT: '#ff6b6b',
  collision: '#ff922b',
  explosion: '#ffd43b',
  anomaly: '#74c0fc',
};

const EVENT_TYPE_ICONS: Record<string, string> = {
  ASAT: 'missile',
  collision: 'merge-links',
  explosion: 'flame',
  anomaly: 'warning-sign',
};

function EventTypeTag({ type }: { type: string }) {
  const color = EVENT_TYPE_COLORS[type] || '#8b949e';
  return (
    <Tag minimal style={{ backgroundColor: color, color: '#000' }}>
      {type.toUpperCase()}
    </Tag>
  );
}

function FragmentTable({ detail }: { detail: FragmentationEventDetail }) {
  const [expanded, setExpanded] = useState(false);
  const fragments = expanded ? detail.fragments : detail.fragments.slice(0, 100);
  const remaining = detail.fragments.length - 100;

  return (
    <div className="mt-2">
      <div className="text-xs text-sda-text-secondary mb-1">
        Showing {fragments.length} of {detail.fragments.length} tracked fragments
      </div>
      <div className="max-h-48 overflow-y-auto border border-sda-border-default rounded">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-sda-bg-secondary">
            <tr className="text-sda-text-secondary">
              <th className="text-left px-2 py-1">NORAD</th>
              <th className="text-left px-2 py-1">Name</th>
              <th className="text-left px-2 py-1">INTDES</th>
              <th className="text-left px-2 py-1">Size</th>
            </tr>
          </thead>
          <tbody>
            {fragments.map((f) => (
              <tr key={f.norad_id} className="border-t border-sda-border-default hover:bg-sda-bg-tertiary">
                <td className="px-2 py-1 text-sda-text-primary font-mono">{f.norad_id}</td>
                <td className="px-2 py-1 text-sda-text-primary">{f.name}</td>
                <td className="px-2 py-1 text-sda-text-secondary font-mono">{f.intdes}</td>
                <td className="px-2 py-1">
                  {f.rcs_size && (
                    <Tag minimal intent={f.rcs_size === 'LARGE' ? 'danger' : f.rcs_size === 'MEDIUM' ? 'warning' : 'none'}>
                      {f.rcs_size}
                    </Tag>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {remaining > 0 && (
          <button
            className="w-full text-center text-xs py-1 border-t border-sda-border-default cursor-pointer hover:bg-sda-bg-tertiary text-sda-accent-blue"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? 'Show less' : `+${remaining} more fragments`}
          </button>
        )}
      </div>
    </div>
  );
}

function EventCard({
  event,
  isExpanded,
  onToggle,
  detail,
  loadingDetail,
}: {
  event: FragmentationEvent;
  isExpanded: boolean;
  onToggle: () => void;
  detail: FragmentationEventDetail | null;
  loadingDetail: boolean;
}) {
  const typeColor = EVENT_TYPE_COLORS[event.event_type] || '#8b949e';
  const iconName = EVENT_TYPE_ICONS[event.event_type] || 'warning-sign';

  return (
    <Card
      className="mb-2"
      style={{
        backgroundColor: 'var(--sda-bg-secondary)',
        borderLeft: `3px solid ${typeColor}`,
        padding: '10px 12px',
      }}
    >
      <div
        className="flex items-start gap-2 cursor-pointer select-none"
        onClick={onToggle}
      >
        <Icon
          icon={iconName as any}
          size={14}
          style={{ color: typeColor, marginTop: 2 }}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-sda-text-primary">{event.name}</span>
            <EventTypeTag type={event.event_type} />
          </div>
          <div className="flex items-center gap-3 mt-1 text-xs text-sda-text-secondary">
            <span>{event.date}</span>
            <span>|</span>
            <span>Parent: <span className="text-sda-text-primary">{event.parent_object_name}</span></span>
            <span>|</span>
            <span>
              <span className="text-sda-text-primary font-medium">{event.fragment_count.toLocaleString()}</span> fragments
            </span>
          </div>
        </div>
        <Icon
          icon={isExpanded ? 'chevron-up' : 'chevron-down'}
          size={14}
          className="text-sda-text-secondary mt-1"
        />
      </div>

      <Collapse isOpen={isExpanded}>
        <div className="mt-3 pt-2 border-t border-sda-border-default">
          <p className="text-xs text-sda-text-secondary mb-2">{event.description}</p>

          <div className="grid grid-cols-2 gap-2 text-xs mb-2">
            <div>
              <span className="text-sda-text-secondary">INTDES Prefix: </span>
              <span className="text-sda-text-primary font-mono">{event.parent_intdes}</span>
            </div>
            <div>
              <span className="text-sda-text-secondary">NORAD ID: </span>
              <span className="text-sda-text-primary font-mono">{event.parent_norad_id ?? 'N/A'}</span>
            </div>
            <div>
              <span className="text-sda-text-secondary">Orbit: </span>
              <Tag minimal>{event.orbit_regime}</Tag>
            </div>
          </div>

          {/* Tree view: parent -> event -> children */}
          <div className="mt-2 ml-2 text-xs">
            <div className="flex items-center gap-1 text-sda-text-primary">
              <Icon icon="satellite" size={12} />
              <span className="font-medium">{event.parent_object_name}</span>
              {event.parent_norad_id && (
                <span className="text-sda-text-secondary font-mono">#{event.parent_norad_id}</span>
              )}
            </div>
            <div className="ml-3 border-l border-sda-border-default pl-3 mt-1">
              <div className="flex items-center gap-1" style={{ color: typeColor }}>
                <Icon icon={iconName as any} size={11} />
                <span className="font-medium">{event.event_type.toUpperCase()}</span>
                <span className="text-sda-text-secondary">({event.date})</span>
              </div>
              <div className="ml-3 border-l border-sda-border-default pl-3 mt-1 text-sda-text-secondary">
                <Icon icon="scatter-plot" size={11} className="mr-1" />
                {event.fragment_count.toLocaleString()} tracked fragments
              </div>
            </div>
          </div>

          {loadingDetail && (
            <div className="mt-2 flex items-center gap-2 text-xs text-sda-text-secondary">
              <Spinner size={14} /> Loading fragments from SATCAT...
            </div>
          )}
          {detail && <FragmentTable detail={detail} />}
        </div>
      </Collapse>
    </Card>
  );
}

export function DebrisGenealogyPanel() {
  const [events, setEvents] = useState<FragmentationEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [details, setDetails] = useState<Record<string, FragmentationEventDetail>>({});
  const [loadingDetails, setLoadingDetails] = useState<Record<string, boolean>>({});
  const [lineageNorad, setLineageNorad] = useState('');
  const [lineage, setLineage] = useState<DebrisLineage | null>(null);
  const [lineageLoading, setLineageLoading] = useState(false);
  const [lineageError, setLineageError] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<string | null>(null);

  const fetchEvents = useCallback(async () => {
    try {
      setError(null);
      const data = await api.getFragmentationEvents();
      setEvents(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load events');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  const toggleExpand = useCallback(
    async (eventId: string) => {
      if (expandedId === eventId) {
        setExpandedId(null);
        return;
      }
      setExpandedId(eventId);

      if (!details[eventId]) {
        setLoadingDetails((p) => ({ ...p, [eventId]: true }));
        try {
          const detail = await api.getFragmentationEventDetail(eventId);
          setDetails((p) => ({ ...p, [eventId]: detail }));
        } catch {
          // Silently fail — the card still shows event info
        } finally {
          setLoadingDetails((p) => ({ ...p, [eventId]: false }));
        }
      }
    },
    [expandedId, details]
  );

  const lookupLineage = useCallback(async () => {
    const norad = parseInt(lineageNorad, 10);
    if (isNaN(norad)) return;
    setLineageLoading(true);
    setLineageError(null);
    setLineage(null);
    try {
      const result = await api.getDebrisLineage(norad);
      setLineage(result);
    } catch (e) {
      setLineageError(e instanceof Error ? e.message : 'Not found');
    } finally {
      setLineageLoading(false);
    }
  }, [lineageNorad]);

  const filtered = filterType
    ? events.filter((e) => e.event_type === filterType)
    : events;

  // Stats
  const totalFragments = events.reduce((s, e) => s + e.fragment_count, 0);
  const asatCount = events.filter((e) => e.event_type === 'ASAT').length;
  const collisionCount = events.filter((e) => e.event_type === 'collision').length;
  const explosionCount = events.filter((e) => e.event_type === 'explosion').length;

  if (loading) {
    return (
      <div className="p-4">
        <Spinner size={20} /> Loading debris genealogy...
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4">
        <Callout intent="danger" title="Failed to load debris genealogy">
          {error}
          <div className="mt-2">
            <Button small intent="primary" onClick={fetchEvents}>Retry</Button>
          </div>
        </Callout>
      </div>
    );
  }

  return (
    <div className="p-3 h-full flex flex-col overflow-hidden">
      <div className="flex items-center gap-2 mb-3">
        <Icon icon="scatter-plot" size={16} style={{ color: '#ff922b' }} />
        <h2 className="text-base font-semibold text-sda-text-primary">Debris Genealogy</h2>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-4 gap-2 mb-3">
        <Card className="!p-2 text-center" style={{ backgroundColor: 'var(--sda-bg-secondary)' }}>
          <div className="text-lg font-bold text-sda-text-primary">{events.length}</div>
          <div className="text-[10px] text-sda-text-secondary">Events</div>
        </Card>
        <Card className="!p-2 text-center" style={{ backgroundColor: 'var(--sda-bg-secondary)' }}>
          <div className="text-lg font-bold" style={{ color: '#ff6b6b' }}>{asatCount}</div>
          <div className="text-[10px] text-sda-text-secondary">ASAT</div>
        </Card>
        <Card className="!p-2 text-center" style={{ backgroundColor: 'var(--sda-bg-secondary)' }}>
          <div className="text-lg font-bold" style={{ color: '#ff922b' }}>{collisionCount}</div>
          <div className="text-[10px] text-sda-text-secondary">Collisions</div>
        </Card>
        <Card className="!p-2 text-center" style={{ backgroundColor: 'var(--sda-bg-secondary)' }}>
          <div className="text-lg font-bold" style={{ color: '#ffd43b' }}>{totalFragments.toLocaleString()}</div>
          <div className="text-[10px] text-sda-text-secondary">Fragments</div>
        </Card>
      </div>

      {/* Filter buttons */}
      <div className="flex items-center gap-1 mb-3 flex-wrap">
        <Button
          small
          minimal={filterType !== null}
          intent={filterType === null ? 'primary' : 'none'}
          onClick={() => setFilterType(null)}
        >
          All ({events.length})
        </Button>
        {['ASAT', 'collision', 'explosion', 'anomaly'].map((type) => {
          const count = events.filter((e) => e.event_type === type).length;
          if (count === 0) return null;
          return (
            <Button
              key={type}
              small
              minimal={filterType !== type}
              onClick={() => setFilterType(filterType === type ? null : type)}
              style={filterType === type ? { backgroundColor: EVENT_TYPE_COLORS[type], color: '#000' } : {}}
            >
              {type.toUpperCase()} ({count})
            </Button>
          );
        })}
      </div>

      {/* Timeline of events */}
      <div className="flex-1 overflow-y-auto min-h-0 mb-3">
        {/* Timeline line */}
        <div className="relative">
          {filtered
            .sort((a, b) => a.date.localeCompare(b.date))
            .map((event) => (
              <EventCard
                key={event.id}
                event={event}
                isExpanded={expandedId === event.id}
                onToggle={() => toggleExpand(event.id)}
                detail={details[event.id] || null}
                loadingDetail={!!loadingDetails[event.id]}
              />
            ))}
        </div>
      </div>

      {/* Lineage lookup */}
      <Card
        style={{
          backgroundColor: 'var(--sda-bg-secondary)',
          padding: '10px 12px',
        }}
      >
        <div className="text-xs font-semibold text-sda-text-primary mb-2">
          <Icon icon="search" size={12} className="mr-1" />
          Trace Object Lineage
        </div>
        <div className="flex items-center gap-2">
          <InputGroup
            small
            placeholder="NORAD ID (e.g. 25730)"
            value={lineageNorad}
            onChange={(e) => setLineageNorad(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && lookupLineage()}
            style={{ flex: 1 }}
          />
          <Button
            small
            intent="primary"
            icon="arrow-right"
            loading={lineageLoading}
            onClick={lookupLineage}
            disabled={!lineageNorad.trim()}
          >
            Trace
          </Button>
        </div>

        {lineageError && (
          <div className="mt-2 text-xs text-red-400">{lineageError}</div>
        )}

        {lineage && (
          <div className="mt-2 text-xs">
            <div className="text-sda-text-primary font-medium">
              {lineage.name} <span className="text-sda-text-secondary font-mono">#{lineage.norad_id}</span>
            </div>
            <div className="text-sda-text-secondary">INTDES: {lineage.intdes}</div>
            {lineage.parent_event ? (
              <div className="mt-1 ml-2 pl-2 border-l-2" style={{ borderColor: EVENT_TYPE_COLORS[lineage.parent_event.event_type] || '#8b949e' }}>
                <div className="text-sda-text-primary">
                  Origin: <span className="font-medium">{lineage.parent_event.name}</span>
                </div>
                <div className="text-sda-text-secondary">
                  Parent: {lineage.parent_object_name} | {lineage.siblings_count.toLocaleString()} siblings
                </div>
              </div>
            ) : (
              <div className="mt-1 text-sda-text-secondary italic">
                No known fragmentation event linked
              </div>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}
