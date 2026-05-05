'use client';

import { useEntityIntelStore, type UnifiedEntity } from '@/lib/store/entityIntel';
import type { SandboxActor } from '@/lib/store/sandbox';

interface Props {
  entity: UnifiedEntity;
  actors: SandboxActor[];
  onSelectActor?: (actorId: string) => void;
}

export function EntityLinksSection({ entity, actors, onSelectActor }: Props) {
  const links = useEntityIntelStore((s) => s.links);

  // For sandbox actors, derive links from same-faction actors and nearby actors
  const derivedLinks =
    entity.source === 'sandbox_actor'
      ? deriveSandboxLinks(entity, actors)
      : [];

  const allLinks = links.length > 0 ? links : derivedLinks;

  if (allLinks.length === 0) {
    return (
      <div className="px-3 py-2">
        <span className="font-code text-[10px] text-zinc-600">No linked entities</span>
      </div>
    );
  }

  return (
    <div className="space-y-1 px-3 py-2">
      {allLinks.map((link, i) => (
        <div
          key={`${link.relatedEntityId}-${i}`}
          className="flex cursor-pointer items-center gap-2 py-1 transition-colors hover:bg-zinc-900/50"
          onClick={() => onSelectActor?.(link.relatedEntityId)}
        >
          <span className="h-1 w-1 flex-shrink-0 bg-zinc-500" />
          <div className="min-w-0 flex-1">
            <div className="truncate font-code text-[10px] text-zinc-300">
              {link.relatedEntityName}
            </div>
            <div className="font-code text-[9px] uppercase tracking-wider text-zinc-600">
              {link.relationship} — {link.relatedEntityType}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// --------------- DERIVE SANDBOX LINKS ---------------

function deriveSandboxLinks(
  entity: UnifiedEntity,
  actors: SandboxActor[],
): { relatedEntityId: string; relatedEntityName: string; relatedEntityType: string; relationship: string }[] {
  const result: {
    relatedEntityId: string;
    relatedEntityName: string;
    relatedEntityType: string;
    relationship: string;
  }[] = [];

  const actor = entity.rawData as SandboxActor;
  const faction = actor.faction;

  // Find same-faction bases/HQs as command chain
  for (const a of actors) {
    if (a.id === actor.id) continue;
    if (a.faction === faction && (a.actor_type === 'base' || a.actor_type === 'hq')) {
      result.push({
        relatedEntityId: a.id,
        relatedEntityName: a.label,
        relatedEntityType: a.actor_type,
        relationship: 'parent_unit',
      });
    }
  }

  // Find targets (if approaching)
  const behavior = actor.behavior as Record<string, unknown>;
  if (behavior.type === 'approach_target' && behavior.target) {
    // Find nearest hostile
    for (const a of actors) {
      if (a.faction !== faction && a.faction !== 'neutral') {
        result.push({
          relatedEntityId: a.id,
          relatedEntityName: a.label,
          relatedEntityType: a.actor_type,
          relationship: 'target',
        });
        break;
      }
    }
  }

  // Find same-faction ground stations as data links
  for (const a of actors) {
    if (a.id === actor.id) continue;
    if (a.faction === faction && a.actor_type === 'ground_station') {
      result.push({
        relatedEntityId: a.id,
        relatedEntityName: a.label,
        relatedEntityType: a.actor_type,
        relationship: 'data_link',
      });
    }
  }

  return result.slice(0, 8); // Limit to prevent clutter
}
