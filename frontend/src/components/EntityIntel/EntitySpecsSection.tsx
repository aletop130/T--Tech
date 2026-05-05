'use client';

import { useEffect } from 'react';
import { useEntityIntelStore, type UnifiedEntity } from '@/lib/store/entityIntel';
import { getEntitySpecifications } from '@/lib/entitySpecifications';

interface Props {
  entity: UnifiedEntity;
}

export function EntitySpecsSection({ entity }: Props) {
  const specifications = useEntityIntelStore((s) => s.specifications);
  const setSpecifications = useEntityIntelStore((s) => s.setSpecifications);

  useEffect(() => {
    const specs = getEntitySpecifications(entity.entityType, entity.subtype);
    setSpecifications(specs);
  }, [entity.id, entity.entityType, entity.subtype, setSpecifications]);

  if (specifications.length === 0) {
    return (
      <div className="px-3 py-2">
        <span className="font-code text-[10px] text-zinc-600">No specifications available</span>
      </div>
    );
  }

  return (
    <div className="space-y-0.5 px-3 py-2">
      {specifications.map((spec) => (
        <div key={spec.key} className="flex items-baseline justify-between gap-2 py-0.5">
          <span className="font-code text-[9px] uppercase tracking-wider text-zinc-600">
            {spec.key}
          </span>
          <span className="text-right font-code text-[11px] tabular-nums text-zinc-200">
            {spec.value}
            {spec.unit && (
              <span className="ml-0.5 text-zinc-500">{spec.unit}</span>
            )}
          </span>
        </div>
      ))}
    </div>
  );
}
