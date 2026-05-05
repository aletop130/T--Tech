'use client';

import { Button, Icon } from '@blueprintjs/core';
import type { UnifiedEntity } from '@/lib/store/entityIntel';
import { getPlatformModel } from '@/lib/entitySpecifications';
import { inferActorIcon, type EntityIconType } from '@/lib/cesium/entity-icons';

const FACTION_COLORS: Record<string, string> = {
  allied: '#22d3ee',
  hostile: '#ef4444',
  neutral: '#fbbf24',
  unknown: '#a1a1aa',
};

const DOMAIN_LABELS: Record<string, string> = {
  space: 'SPACE',
  air: 'AIR',
  maritime: 'SEA',
  ground: 'GROUND',
  tactical: 'TACTICAL',
};

function inferIcon(entity: UnifiedEntity): EntityIconType {
  if (entity.source === 'sandbox_actor') {
    const raw = entity.rawData as Record<string, unknown>;
    return inferActorIcon(
      String(raw.actor_class ?? ''),
      entity.entityType,
      entity.subtype,
    );
  }
  const t = entity.entityType.toLowerCase();
  if (t === 'satellite') return 'satellite';
  if (t === 'aircraft') return 'aircraft';
  if (t === 'ship' || t === 'vessel') return 'ship';
  if (t === 'drone' || t === 'uav') return 'drone';
  if (t === 'ground_station') return 'ground_station';
  if (t === 'vehicle') return 'vehicle';
  return 'default';
}

interface Props {
  entity: UnifiedEntity;
  onClose: () => void;
}

export function EntityIntelHeader({ entity, onClose }: Props) {
  const factionColor = FACTION_COLORS[entity.faction] ?? FACTION_COLORS.unknown;
  const model = getPlatformModel(entity.entityType, entity.subtype);
  const iconType = inferIcon(entity);
  const domain = DOMAIN_LABELS[entity.domain] ?? entity.domain.toUpperCase();

  return (
    <div className="border-b border-[#1a1a1a] px-3 py-2.5">
      {/* Top row: name + close */}
      <div className="flex items-center gap-2">
        <span
          className="h-2 w-2 flex-shrink-0"
          style={{ backgroundColor: factionColor }}
        />
        <span className="min-w-0 flex-1 truncate font-code text-[12px] font-semibold uppercase tracking-wide text-zinc-100">
          {entity.name}
        </span>
        <Button small minimal icon="cross" onClick={onClose} />
      </div>

      {/* Second row: metadata tags */}
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        <span
          className="border px-1.5 py-0.5 font-code text-[9px] uppercase tracking-wider"
          style={{ borderColor: factionColor + '40', color: factionColor }}
        >
          {entity.faction}
        </span>
        <span className="border border-zinc-700 px-1.5 py-0.5 font-code text-[9px] uppercase tracking-wider text-zinc-500">
          {domain}
        </span>
        <span className="border border-zinc-700 px-1.5 py-0.5 font-code text-[9px] uppercase tracking-wider text-zinc-500">
          {iconType.replace('_', ' ')}
        </span>
        {model && model !== entity.entityType && (
          <span className="border border-zinc-700/50 px-1.5 py-0.5 font-code text-[9px] tracking-wider text-zinc-600">
            {model}
          </span>
        )}
      </div>

      {/* Third row: last updated */}
      <div className="mt-1.5 font-code text-[9px] tracking-wider text-zinc-600">
        LAST UPDATED:{' '}
        {entity.lastUpdated
          ? new Date(entity.lastUpdated).toLocaleString('en-GB', {
              day: '2-digit',
              month: 'short',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
            })
          : 'N/A'}
      </div>
    </div>
  );
}
