'use client';

import { Icon } from '@blueprintjs/core';
import {
  useEntityIntelStore,
  type EntityIntelSection as SectionType,
} from '@/lib/store/entityIntel';
import type { SandboxActor } from '@/lib/store/sandbox';
import { EntityIntelHeader } from './EntityIntelHeader';
import { EntityDetailsSection } from './EntityDetailsSection';
import { EntityIntelSection } from './EntityIntelSection';
import { EntitySpecsSection } from './EntitySpecsSection';
import { EntityLinksSection } from './EntityLinksSection';
import { EntityTimelineSection } from './EntityTimelineSection';
import { EntityAppearanceSection } from './EntityAppearanceSection';

interface Props {
  actors: SandboxActor[];
  onSelectActor?: (actorId: string) => void;
  onUpdateVisualConfig?: (actorId: string, config: Record<string, unknown>) => void;
}

const SECTIONS: { id: SectionType; label: string; icon: string }[] = [
  { id: 'details', label: 'POSITION / STATUS', icon: 'map-marker' },
  { id: 'intel', label: 'INTELLIGENCE BRIEF', icon: 'search' },
  { id: 'specs', label: 'SPECIFICATIONS', icon: 'properties' },
  { id: 'links', label: 'LINKED ENTITIES', icon: 'link' },
  { id: 'timeline', label: 'ACTIVITY TIMELINE', icon: 'timeline-events' },
  { id: 'appearance', label: 'APPEARANCE', icon: 'style' },
];

export function EntityIntelPanel({ actors, onSelectActor, onUpdateVisualConfig }: Props) {
  const entity = useEntityIntelStore((s) => s.selectedEntity);
  const expandedSections = useEntityIntelStore((s) => s.expandedSections);
  const toggleSection = useEntityIntelStore((s) => s.toggleSection);
  const clearSelection = useEntityIntelStore((s) => s.clearSelection);

  if (!entity) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-4">
        <Icon icon="target" size={20} className="mb-2 text-zinc-700" />
        <span className="font-code text-[10px] uppercase tracking-wider text-zinc-600">
          SELECT AN ENTITY ON THE MAP
        </span>
        <span className="mt-1 font-code text-[9px] text-zinc-700">
          Click any actor or intel overlay entity to view details
        </span>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[#080808]">
      {/* Header */}
      <EntityIntelHeader entity={entity} onClose={clearSelection} />

      {/* Scrollable sections */}
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {SECTIONS.map(({ id, label, icon }) => {
          const expanded = expandedSections.has(id);
          return (
            <div key={id} className="border-b border-[#111]">
              {/* Section header */}
              <button
                className="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-zinc-900/40"
                onClick={() => toggleSection(id)}
              >
                <Icon
                  icon={expanded ? 'chevron-down' : 'chevron-right'}
                  size={10}
                  className="text-zinc-600"
                />
                <Icon icon={icon as any} size={11} className="text-zinc-600" />
                <span className="font-code text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                  {label}
                </span>
              </button>

              {/* Section content */}
              {expanded && (
                <div>
                  {id === 'details' && <EntityDetailsSection entity={entity} />}
                  {id === 'intel' && <EntityIntelSection entity={entity} />}
                  {id === 'specs' && <EntitySpecsSection entity={entity} />}
                  {id === 'links' && (
                    <EntityLinksSection
                      entity={entity}
                      actors={actors}
                      onSelectActor={onSelectActor}
                    />
                  )}
                  {id === 'timeline' && <EntityTimelineSection entity={entity} />}
                  {id === 'appearance' && (
                    <EntityAppearanceSection
                      entity={entity}
                      onUpdateVisualConfig={
                        onUpdateVisualConfig
                          ? (config) => onUpdateVisualConfig(entity.id, config)
                          : undefined
                      }
                    />
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
