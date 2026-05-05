'use client';

import type { UnifiedEntity, EntityTimelineEntry } from '@/lib/store/entityIntel';
import type { SandboxActor } from '@/lib/store/sandbox';

interface Props {
  entity: UnifiedEntity;
}

export function EntityTimelineSection({ entity }: Props) {
  const entries = buildTimeline(entity);

  if (entries.length === 0) {
    return (
      <div className="px-3 py-2">
        <span className="font-code text-[10px] text-zinc-600">No activity recorded</span>
      </div>
    );
  }

  return (
    <div className="space-y-0 px-3 py-2">
      {entries.map((entry, i) => (
        <div key={i} className="flex gap-2 py-1">
          {/* Timeline dot and line */}
          <div className="flex flex-col items-center">
            <span className="mt-1 h-1.5 w-1.5 flex-shrink-0 bg-zinc-500" />
            {i < entries.length - 1 && <span className="w-px flex-1 bg-zinc-800" />}
          </div>
          {/* Content */}
          <div className="min-w-0 flex-1 pb-1">
            <div className="font-code text-[10px] text-zinc-300">{entry.event}</div>
            {entry.detail && (
              <div className="font-code text-[9px] text-zinc-600">{entry.detail}</div>
            )}
            <div className="font-code text-[9px] tabular-nums text-zinc-700">
              {formatTime(entry.timestamp)}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function formatTime(ts: string): string {
  try {
    return new Date(ts).toLocaleString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      day: '2-digit',
      month: 'short',
    });
  } catch {
    return ts;
  }
}

function buildTimeline(entity: UnifiedEntity): EntityTimelineEntry[] {
  const entries: EntityTimelineEntry[] = [];

  if (entity.source === 'sandbox_actor') {
    const actor = entity.rawData as SandboxActor;
    entries.push({
      timestamp: actor.created_at,
      event: `Deployed as ${actor.actor_type}`,
      detail: `Faction: ${actor.faction}, Provenance: ${actor.provenance}`,
    });
    if (actor.updated_at !== actor.created_at) {
      entries.push({
        timestamp: actor.updated_at,
        event: 'Last state update',
        detail: `Behavior: ${(actor.behavior as Record<string, unknown>)?.type ?? 'hold'}`,
      });
    }
    const behavior = actor.behavior as Record<string, unknown>;
    if (behavior.type === 'move_to' || behavior.type === 'approach_target') {
      const target = behavior.target as Record<string, unknown> | undefined;
      if (target) {
        entries.push({
          timestamp: actor.updated_at,
          event: `${behavior.type === 'approach_target' ? 'Approaching target' : 'Moving to waypoint'}`,
          detail: `Target: ${Number(target.lat ?? 0).toFixed(3)}°, ${Number(target.lon ?? 0).toFixed(3)}°`,
        });
      }
    }
  } else {
    entries.push({
      timestamp: entity.lastUpdated,
      event: 'Position reported',
      detail: entity.position
        ? `${entity.position.lat.toFixed(3)}°N, ${entity.position.lon.toFixed(3)}°E`
        : undefined,
    });
  }

  return entries;
}
