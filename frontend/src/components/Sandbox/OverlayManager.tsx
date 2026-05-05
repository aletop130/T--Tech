'use client';

import { useState } from 'react';
import { Button, Icon } from '@blueprintjs/core';
import { useSandboxStore, type PlanningOverlay } from '@/lib/store/sandbox';

export function OverlayManager() {
  const overlays = useSandboxStore((s) => s.groundPlan.overlays);
  const zones = useSandboxStore((s) => s.groundPlan.zones);
  const addPlanningOverlay = useSandboxStore((s) => s.addPlanningOverlay);
  const removePlanningOverlay = useSandboxStore((s) => s.removePlanningOverlay);
  const toggleOverlayVisibility = useSandboxStore((s) => s.toggleOverlayVisibility);

  const [newName, setNewName] = useState('');

  const handleCreate = () => {
    if (!newName.trim()) return;
    const overlay: PlanningOverlay = {
      id: `overlay-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: newName.trim(),
      visible: true,
      zoneIds: [],
      markerIds: [],
      routeIds: [],
      areaIds: [],
    };
    addPlanningOverlay(overlay);
    setNewName('');
  };

  return (
    <div className="space-y-2">
      <div className="mb-1 font-code text-[9px] font-semibold uppercase tracking-wider text-zinc-500">
        PLANNING OVERLAYS
      </div>

      {/* Overlay list */}
      {overlays.length > 0 ? (
        <div className="space-y-0.5">
          {overlays.map((o) => (
            <div key={o.id} className="flex items-center gap-1.5 py-0.5">
              <button
                className="flex h-3.5 w-3.5 items-center justify-center border border-zinc-700 transition-colors"
                style={{
                  backgroundColor: o.visible ? '#22d3ee10' : 'transparent',
                  borderColor: o.visible ? '#22d3ee40' : '#333',
                }}
                onClick={() => toggleOverlayVisibility(o.id)}
              >
                {o.visible && <span className="h-1 w-1 bg-sda-accent-cyan" />}
              </button>
              <span className="min-w-0 flex-1 truncate font-code text-[10px] text-zinc-400">
                {o.name}
              </span>
              <span className="font-code text-[9px] tabular-nums text-zinc-600">
                {o.zoneIds.length}z
              </span>
              <Button
                small
                minimal
                icon="cross"
                className="!h-4 !min-h-0 !w-4 !min-w-0 !p-0"
                onClick={() => removePlanningOverlay(o.id)}
              />
            </div>
          ))}
        </div>
      ) : (
        <div className="font-code text-[9px] text-zinc-700">
          No overlays created
        </div>
      )}

      {/* Create overlay */}
      <div className="flex items-center gap-1">
        <input
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Overlay name..."
          className="flex-1 border border-[#1a1a1a] bg-[#0a0a0a] px-1.5 py-0.5 font-code text-[10px] text-zinc-300 placeholder:text-zinc-700"
          onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
        />
        <Button
          small
          minimal
          icon="add"
          onClick={handleCreate}
          disabled={!newName.trim()}
        />
      </div>
    </div>
  );
}
