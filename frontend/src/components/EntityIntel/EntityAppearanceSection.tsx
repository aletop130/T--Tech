'use client';

import { useState } from 'react';
import { Button } from '@blueprintjs/core';
import type { UnifiedEntity } from '@/lib/store/entityIntel';

const PRESET_COLORS = [
  '#22d3ee', '#ef4444', '#fbbf24', '#22c55e',
  '#a78bfa', '#f97316', '#ec4899', '#a1a1aa',
];

interface Props {
  entity: UnifiedEntity;
  onUpdateVisualConfig?: (config: Record<string, unknown>) => void;
}

export function EntityAppearanceSection({ entity, onUpdateVisualConfig }: Props) {
  const isSandbox = entity.source === 'sandbox_actor';
  const rawConfig = isSandbox
    ? ((entity.rawData as Record<string, unknown>).visual_config as Record<string, unknown>) ?? {}
    : {};

  const [selectedColor, setSelectedColor] = useState<string>(
    (rawConfig.color as string) ?? '#22d3ee',
  );
  const [showLabel, setShowLabel] = useState<boolean>(
    (rawConfig.show_label as boolean) ?? true,
  );

  const handleApply = () => {
    onUpdateVisualConfig?.({
      ...rawConfig,
      color: selectedColor,
      show_label: showLabel,
    });
  };

  return (
    <div className="space-y-3 px-3 py-2">
      {/* Color */}
      <div>
        <div className="mb-1.5 font-code text-[9px] uppercase tracking-wider text-zinc-600">
          COLOR
        </div>
        <div className="flex flex-wrap gap-1.5">
          {PRESET_COLORS.map((c) => (
            <button
              key={c}
              className="h-5 w-5 border transition-all"
              style={{
                backgroundColor: c,
                borderColor: selectedColor === c ? '#fff' : '#333',
                opacity: selectedColor === c ? 1 : 0.6,
              }}
              onClick={() => setSelectedColor(c)}
            />
          ))}
        </div>
      </div>

      {/* Label toggle */}
      <div className="flex items-center justify-between">
        <span className="font-code text-[9px] uppercase tracking-wider text-zinc-600">
          SHOW LABEL
        </span>
        <button
          className="h-4 w-8 border border-zinc-700 transition-colors"
          style={{
            backgroundColor: showLabel ? '#22d3ee20' : '#1a1a1a',
          }}
          onClick={() => setShowLabel(!showLabel)}
        >
          <span
            className="block h-full w-1/2 transition-transform"
            style={{
              backgroundColor: showLabel ? '#22d3ee' : '#555',
              transform: showLabel ? 'translateX(100%)' : 'translateX(0)',
            }}
          />
        </button>
      </div>

      {/* Apply */}
      {isSandbox && (
        <Button
          small
          minimal
          icon="tick"
          onClick={handleApply}
          className="font-code text-[10px] uppercase tracking-wider"
        >
          APPLY
        </Button>
      )}

      {!isSandbox && (
        <div className="font-code text-[9px] text-zinc-700">
          Visual config available for sandbox actors only
        </div>
      )}
    </div>
  );
}
