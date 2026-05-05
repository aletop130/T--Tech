'use client';

import { useState } from 'react';
import { Button, HTMLSelect, Icon, type IconName } from '@blueprintjs/core';
import {
  useSandboxStore,
  type SandboxActor,
  type SandboxFaction,
  type SandboxInteractionMode,
  type SandboxPosition,
  type TacticalZone,
  type TacticalZoneType,
} from '@/lib/store/sandbox';

// --------------- ZONE TYPE CONFIG ---------------

interface ZoneConfig {
  type: TacticalZoneType;
  label: string;
  icon: IconName;
  defaultRadiusKm: number;
  color: string;
}

const ZONE_TYPES: ZoneConfig[] = [
  { type: 'range_ring', label: 'Range Ring', icon: 'circle', defaultRadiusKm: 50, color: '#00d4ff' },
  { type: 'threat_zone', label: 'Threat Zone', icon: 'warning-sign', defaultRadiusKm: 100, color: '#ff3333' },
  { type: 'engagement_zone', label: 'WEZ', icon: 'target', defaultRadiusKm: 80, color: '#ff6400' },
  { type: 'air_corridor', label: 'Air Corridor', icon: 'arrow-right', defaultRadiusKm: 30, color: '#00ff64' },
  { type: 'sensor_coverage', label: 'Sensor', icon: 'eye-open', defaultRadiusKm: 150, color: '#64c8ff' },
  { type: 'comms_range', label: 'Comms', icon: 'antenna', defaultRadiusKm: 200, color: '#a078ff' },
];

// --------------- COMPONENT ---------------

interface Props {
  actors: SandboxActor[];
  interactionMode: SandboxInteractionMode;
  onSetInteractionMode: (mode: SandboxInteractionMode) => void;
}

export function ZonePlanningPanel({ actors, interactionMode, onSetInteractionMode }: Props) {
  const zones = useSandboxStore((s) => s.groundPlan.zones);
  const addTacticalZone = useSandboxStore((s) => s.addTacticalZone);
  const removeTacticalElement = useSandboxStore((s) => s.removeTacticalElement);
  const updateTacticalZone = useSandboxStore((s) => s.updateTacticalZone);

  const [selectedZoneType, setSelectedZoneType] = useState<TacticalZoneType>('range_ring');
  const [radiusKm, setRadiusKm] = useState(50);
  const [minRadiusKm, setMinRadiusKm] = useState(10);
  const [attachActorId, setAttachActorId] = useState<string>('');
  const [faction, setFaction] = useState<SandboxFaction>('allied');
  const [label, setLabel] = useState('');

  const selectedConfig = ZONE_TYPES.find((z) => z.type === selectedZoneType) ?? ZONE_TYPES[0];

  const handlePlaceZone = () => {
    if (attachActorId) {
      // Directly add zone centered on actor
      const actor = actors.find((a) => a.id === attachActorId);
      if (!actor) return;
      const pos = (actor.state as Record<string, unknown>).position as
        | { lat?: number; lon?: number; alt_m?: number }
        | undefined;
      const center: SandboxPosition = {
        lat: Number(pos?.lat ?? 0),
        lon: Number(pos?.lon ?? 0),
        alt_m: 0,
      };

      addTacticalZone({
        id: `zone-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        zoneType: selectedZoneType,
        label: label || selectedConfig.label,
        centerId: attachActorId,
        centerPosition: center,
        radiusKm,
        minRadiusKm: selectedZoneType === 'engagement_zone' ? minRadiusKm : undefined,
        color: selectedConfig.color,
        opacity: 0.12,
        faction,
        showLabel: true,
      });
    } else {
      // Enter interactive placement mode
      onSetInteractionMode('place_zone');
    }
  };

  return (
    <div className="space-y-3">
      {/* Zone type selector grid */}
      <div>
        <div className="mb-1.5 font-code text-[9px] font-semibold uppercase tracking-wider text-zinc-500">
          ZONE TYPE
        </div>
        <div className="grid grid-cols-3 gap-1">
          {ZONE_TYPES.map((z) => (
            <button
              key={z.type}
              className={`flex flex-col items-center gap-0.5 border px-2 py-1.5 transition-colors ${
                selectedZoneType === z.type
                  ? 'border-sda-accent-cyan/40 bg-sda-accent-cyan/10'
                  : 'border-[#1a1a1a] hover:border-zinc-700'
              }`}
              onClick={() => {
                setSelectedZoneType(z.type);
                setRadiusKm(z.defaultRadiusKm);
              }}
            >
              <Icon icon={z.icon} size={12} style={{ color: z.color }} />
              <span className="font-code text-[8px] uppercase tracking-wider text-zinc-500">
                {z.label}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Radius */}
      <div className="flex items-center gap-2">
        <span className="font-code text-[9px] uppercase tracking-wider text-zinc-600">RADIUS</span>
        <input
          type="number"
          min={1}
          max={5000}
          value={radiusKm}
          onChange={(e) => setRadiusKm(Number(e.target.value))}
          className="w-16 border border-[#1a1a1a] bg-[#0a0a0a] px-1.5 py-0.5 font-code text-[10px] text-zinc-300"
        />
        <span className="font-code text-[9px] text-zinc-600">km</span>
      </div>

      {/* Min radius for WEZ */}
      {selectedZoneType === 'engagement_zone' && (
        <div className="flex items-center gap-2">
          <span className="font-code text-[9px] uppercase tracking-wider text-zinc-600">MIN RANGE</span>
          <input
            type="number"
            min={0}
            max={radiusKm}
            value={minRadiusKm}
            onChange={(e) => setMinRadiusKm(Number(e.target.value))}
            className="w-16 border border-[#1a1a1a] bg-[#0a0a0a] px-1.5 py-0.5 font-code text-[10px] text-zinc-300"
          />
          <span className="font-code text-[9px] text-zinc-600">km</span>
        </div>
      )}

      {/* Attach to actor */}
      <div>
        <span className="mb-0.5 block font-code text-[9px] uppercase tracking-wider text-zinc-600">
          ATTACH TO ACTOR
        </span>
        <HTMLSelect
          minimal
          value={attachActorId}
          onChange={(e) => setAttachActorId(e.target.value)}
          className="w-full font-code !text-[10px] [&_select]:!bg-[#0a0a0a] [&_select]:!text-zinc-300 [&_select]:!text-[10px] [&_select]:!py-0.5 [&_select]:!min-h-0 [&_select]:!h-6"
        >
          <option value="">Manual placement</option>
          {actors.map((a) => (
            <option key={a.id} value={a.id}>
              {a.label} ({a.faction})
            </option>
          ))}
        </HTMLSelect>
      </div>

      {/* Label */}
      <div className="flex items-center gap-2">
        <span className="font-code text-[9px] uppercase tracking-wider text-zinc-600">LABEL</span>
        <input
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder={selectedConfig.label}
          className="flex-1 border border-[#1a1a1a] bg-[#0a0a0a] px-1.5 py-0.5 font-code text-[10px] text-zinc-300 placeholder:text-zinc-700"
        />
      </div>

      {/* Faction */}
      <div className="flex items-center gap-2">
        <span className="font-code text-[9px] uppercase tracking-wider text-zinc-600">FACTION</span>
        <HTMLSelect
          minimal
          value={faction}
          onChange={(e) => setFaction(e.target.value as SandboxFaction)}
          className="font-code !text-[10px] [&_select]:!bg-[#0a0a0a] [&_select]:!text-zinc-300 [&_select]:!text-[10px] [&_select]:!py-0.5 [&_select]:!min-h-0 [&_select]:!h-6"
        >
          <option value="allied">Allied</option>
          <option value="hostile">Hostile</option>
          <option value="neutral">Neutral</option>
        </HTMLSelect>
      </div>

      {/* Place button */}
      <Button
        small
        icon={attachActorId ? 'add' : 'map-marker'}
        className="w-full font-code text-[10px] uppercase tracking-wider"
        onClick={handlePlaceZone}
      >
        {attachActorId ? 'ADD ZONE TO ACTOR' : 'PLACE ON MAP'}
      </Button>

      {/* Active zones list */}
      {zones.length > 0 && (
        <div>
          <div className="mb-1 font-code text-[9px] font-semibold uppercase tracking-wider text-zinc-500">
            ACTIVE ZONES ({zones.length})
          </div>
          <div className="max-h-32 space-y-0.5 overflow-y-auto scrollbar-thin">
            {zones.map((z) => (
              <div
                key={z.id}
                className="flex items-center gap-1.5 py-0.5"
              >
                <span
                  className="h-1.5 w-1.5 flex-shrink-0"
                  style={{ backgroundColor: z.color }}
                />
                <span className="min-w-0 flex-1 truncate font-code text-[10px] text-zinc-400">
                  {z.label}
                </span>
                <span className="font-code text-[9px] tabular-nums text-zinc-600">
                  {z.radiusKm}km
                </span>
                <Button
                  small
                  minimal
                  icon="cross"
                  className="!h-4 !min-h-0 !w-4 !min-w-0 !p-0"
                  onClick={() => removeTacticalElement('zone', z.id)}
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
