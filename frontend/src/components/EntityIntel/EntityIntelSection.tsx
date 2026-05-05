'use client';

import { useEffect } from 'react';
import { Button, Spinner } from '@blueprintjs/core';
import {
  useEntityIntelStore,
  type EntityIntelBrief,
  type UnifiedEntity,
} from '@/lib/store/entityIntel';
import { entityIntelApi } from '@/lib/api/entityIntel';

const THREAT_COLORS: Record<string, string> = {
  low: '#22c55e',
  medium: '#fbbf24',
  high: '#ef4444',
  critical: '#dc2626',
};

interface Props {
  entity: UnifiedEntity;
}

export function EntityIntelSection({ entity }: Props) {
  const brief = useEntityIntelStore((s) => s.intelBrief);
  const loading = useEntityIntelStore((s) => s.intelLoading);
  const setIntelBrief = useEntityIntelStore((s) => s.setIntelBrief);
  const setIntelLoading = useEntityIntelStore((s) => s.setIntelLoading);

  const fetchBrief = async () => {
    setIntelLoading(true);
    try {
      const result = await entityIntelApi.getBrief(entity.entityType, entity.id);
      setIntelBrief(result);
    } catch {
      // Generate a local fallback brief
      setIntelBrief(generateLocalBrief(entity));
    }
  };

  // Auto-fetch on mount
  useEffect(() => {
    if (!brief && !loading) {
      void fetchBrief();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entity.id]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 px-3 py-4">
        <Spinner size={14} />
        <span className="font-code text-[10px] uppercase tracking-wider text-zinc-500">
          GENERATING INTEL BRIEF...
        </span>
      </div>
    );
  }

  if (!brief) {
    return (
      <div className="px-3 py-3">
        <Button
          small
          minimal
          icon="search"
          onClick={() => void fetchBrief()}
          className="font-code text-[10px] uppercase tracking-wider"
        >
          GENERATE INTEL BRIEF
        </Button>
      </div>
    );
  }

  const threatColor = THREAT_COLORS[brief.threatLevel] ?? THREAT_COLORS.medium;

  return (
    <div className="space-y-2.5 px-3 py-2">
      {/* Summary */}
      <p className="font-code text-[11px] leading-relaxed text-zinc-300">
        {brief.summary}
      </p>

      {/* Threat level */}
      <div className="flex items-center gap-2">
        <span className="font-code text-[9px] uppercase tracking-wider text-zinc-600">
          THREAT LEVEL
        </span>
        <span
          className="border px-1.5 py-0.5 font-code text-[10px] font-semibold uppercase tracking-wider"
          style={{ borderColor: threatColor + '60', color: threatColor }}
        >
          {brief.threatLevel}
        </span>
      </div>

      {/* Capabilities */}
      {brief.capabilities.length > 0 && (
        <div>
          <div className="mb-1 font-code text-[9px] uppercase tracking-wider text-zinc-600">
            CAPABILITIES
          </div>
          <div className="flex flex-wrap gap-1">
            {brief.capabilities.map((cap) => (
              <span
                key={cap}
                className="border border-zinc-700/60 px-1.5 py-0.5 font-code text-[9px] uppercase tracking-wider text-zinc-400"
              >
                {cap}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Mission Profile */}
      {brief.missionProfile && (
        <div>
          <div className="mb-0.5 font-code text-[9px] uppercase tracking-wider text-zinc-600">
            MISSION PROFILE
          </div>
          <p className="font-code text-[10px] leading-relaxed text-zinc-400">
            {brief.missionProfile}
          </p>
        </div>
      )}

      {/* C2 */}
      {brief.commandControl && (
        <div>
          <div className="mb-0.5 font-code text-[9px] uppercase tracking-wider text-zinc-600">
            COMMAND & CONTROL
          </div>
          <p className="font-code text-[10px] leading-relaxed text-zinc-400">
            {brief.commandControl}
          </p>
        </div>
      )}
    </div>
  );
}

// --------------- LOCAL FALLBACK ---------------

function generateLocalBrief(entity: UnifiedEntity): EntityIntelBrief {
  const t = entity.entityType.toLowerCase();
  const faction = entity.faction;
  const isHostile = faction === 'hostile';

  const capMap: Record<string, string[]> = {
    drone: ['ISR', 'Surveillance', 'SIGINT'],
    aircraft: ['Air Superiority', 'Strike', 'Intercept'],
    ship: ['Sea Control', 'ASW', 'AAW'],
    submarine: ['ASW', 'Strike', 'ISR'],
    tank: ['Direct Fire', 'Armor', 'Maneuver'],
    missile: ['Precision Strike', 'Standoff'],
    satellite: ['ISR', 'SIGINT', 'SATCOM'],
    ground_station: ['C2', 'Tracking', 'Communications'],
    base: ['Force Projection', 'Logistics', 'C2'],
    vehicle: ['Transport', 'Logistics'],
  };

  const capabilities = capMap[t] ?? ['Unknown'];
  const threatLevel = isHostile ? 'high' : faction === 'neutral' ? 'medium' : 'low';

  return {
    summary: `${entity.name} — ${faction} ${entity.entityType}${entity.subtype ? ` (${entity.subtype})` : ''}. ${
      entity.position
        ? `Located at ${entity.position.lat.toFixed(2)}°N, ${entity.position.lon.toFixed(2)}°E.`
        : 'Position unknown.'
    } ${isHostile ? 'Assessed as active threat.' : 'No immediate threat indicated.'}`,
    threatLevel,
    capabilities,
    missionProfile: isHostile
      ? `${t === 'drone' ? 'Persistent ISR / strike overwatch pattern' : 'Operational posture indicates active deployment'}`
      : null,
    commandControl: null,
    confidence: 0.6,
  };
}
