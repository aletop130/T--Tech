'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Button,
  HTMLSelect,
  Icon,
  InputGroup,
  Spinner,
  Tab,
  Tabs,
  Tag,
  TextArea,
} from '@blueprintjs/core';

import type {
  ConjunctionEvent,
  GroundStation,
  PositionReport,
  SatelliteDetail,
} from '@/lib/api';
import { sandboxApi, type SandboxSessionSummary } from '@/lib/api/sandbox';
import {
  type SandboxActor,
  type SandboxContextTab,
  type SandboxFaction,
  type SandboxInteractionMode,
  type SandboxPosition,
  type SandboxTemplateDraft,
} from '@/lib/store/sandbox';

// --------------- TYPES ---------------

export interface ActorEditorState {
  label: string;
  faction: SandboxFaction;
  lat: string;
  lon: string;
  alt_m: string;
  speed_ms: string;
  heading_deg: string;
  behaviorType: string;
  moveTargetLat: string;
  moveTargetLon: string;
}

export function buildEditorState(actor: SandboxActor | null): ActorEditorState {
  const pos = (actor?.state.position as { lat?: number; lon?: number; alt_m?: number }) ?? {};
  const beh = (actor?.behavior ?? {}) as Record<string, unknown>;
  const target = (beh.target ?? {}) as { lat?: number; lon?: number };
  return {
    label: actor?.label ?? '',
    faction: actor?.faction ?? 'neutral',
    lat: String(Number(pos.lat ?? 0).toFixed(4)),
    lon: String(Number(pos.lon ?? 0).toFixed(4)),
    alt_m: String(Math.round(Number(pos.alt_m ?? 0))),
    speed_ms: String(Number(actor?.state.speed_ms ?? 0)),
    heading_deg: String(Number(actor?.state.heading_deg ?? 0)),
    behaviorType: String(beh.type ?? 'hold'),
    moveTargetLat: target.lat != null ? String(Number(target.lat).toFixed(4)) : '',
    moveTargetLon: target.lon != null ? String(Number(target.lon).toFixed(4)) : '',
  };
}

// --------------- TEMPLATES ---------------

const TEMPLATE_LIBRARY: SandboxTemplateDraft[] = [
  { actorClass: 'fixed_ground', actorType: 'base', label: 'Allied Base', faction: 'allied' },
  {
    actorClass: 'effect',
    actorType: 'ground_station',
    label: 'Tracking Station',
    faction: 'allied',
    capabilities: { coverage_radius_km: 900 },
  },
  {
    actorClass: 'effect',
    actorType: 'defended_zone',
    label: 'Defended Zone',
    faction: 'allied',
    capabilities: { coverage_radius_km: 250 },
  },
  {
    actorClass: 'mobile_ground',
    actorType: 'ground_vehicle',
    label: 'Convoy',
    faction: 'neutral',
    behavior: { type: 'hold' },
  },
  {
    actorClass: 'air',
    actorType: 'aircraft',
    label: 'Patrol Aircraft',
    faction: 'allied',
    behavior: { type: 'hold' },
  },
  {
    actorClass: 'sea',
    actorType: 'ship',
    label: 'Task Group',
    faction: 'neutral',
    behavior: { type: 'hold' },
  },
  {
    actorClass: 'orbital',
    actorType: 'satellite',
    label: 'Satellite',
    faction: 'allied',
    behavior: { type: 'hold' },
  },
  {
    actorClass: 'weapon',
    actorType: 'missile',
    label: 'Interceptor',
    faction: 'allied',
    behavior: { type: 'hold' },
  },
];

// --------------- PROPS ---------------

interface SandboxContextPanelProps {
  tab: SandboxContextTab;
  onTabChange: (tab: SandboxContextTab) => void;
  actors: SandboxActor[];
  selectedActorId: string | null;
  currentSessionId: string | null;
  interactionMode: SandboxInteractionMode;
  liveSatellites: SatelliteDetail[];
  liveStations: GroundStation[];
  liveVehicles: PositionReport[];
  liveConjunctions: ConjunctionEvent[];
  onSelectActor: (id: string | null) => void;
  onFlyToActor: (actor: SandboxActor) => void;
  onDeleteActor: (actor: SandboxActor) => void;
  onSaveActor: (actorId: string, data: ActorEditorState) => void;
  onRelocateActor: (actorId: string) => void;
  onSetMoveTarget: (actorId: string) => void;
  onSetInteractionMode: (mode: SandboxInteractionMode, template?: SandboxTemplateDraft) => void;
  onImportLive: (sourceType: string, sourceId: string, position?: SandboxPosition) => void;
  onImportTLE: (tleText: string, label?: string, faction?: string) => void;
  onLoadSession: (sessionId: string) => void;
}

export function SandboxContextPanel({
  tab,
  onTabChange,
  actors,
  selectedActorId,
  currentSessionId,
  interactionMode,
  liveSatellites,
  liveStations,
  liveVehicles,
  liveConjunctions,
  onSelectActor,
  onFlyToActor,
  onDeleteActor,
  onSaveActor,
  onRelocateActor,
  onSetMoveTarget,
  onSetInteractionMode,
  onImportLive,
  onImportTLE,
  onLoadSession,
}: SandboxContextPanelProps) {
  const selectedActor = actors.find((a) => a.id === selectedActorId) ?? null;

  return (
    <div className="flex h-full flex-col bg-sda-bg-secondary/95 backdrop-blur-sm">
      <Tabs
        id="sandbox-context"
        selectedTabId={tab}
        onChange={(t) => onTabChange(t as SandboxContextTab)}
        className="flex h-full flex-col [&_.bp5-tab-list]:flex-shrink-0 [&_.bp5-tab-list]:border-b [&_.bp5-tab-list]:border-sda-border-default [&_.bp5-tab-list]:px-3 [&_.bp5-tab-panel]:min-h-0 [&_.bp5-tab-panel]:flex-1 [&_.bp5-tab-panel]:overflow-hidden"
      >
        <Tab
          id="actors"
          title="Actors"
          panel={
            <ActorsTab
              actors={actors}
              selectedActor={selectedActor}
              selectedActorId={selectedActorId}
              interactionMode={interactionMode}
              onSelectActor={onSelectActor}
              onFlyToActor={onFlyToActor}
              onDeleteActor={onDeleteActor}
              onSaveActor={onSaveActor}
              onRelocateActor={onRelocateActor}
              onSetMoveTarget={onSetMoveTarget}
              onSetInteractionMode={onSetInteractionMode}
            />
          }
        />
        <Tab
          id="import"
          title="Import"
          panel={
            <ImportTab
              liveSatellites={liveSatellites}
              liveStations={liveStations}
              liveVehicles={liveVehicles}
              liveConjunctions={liveConjunctions}
              onImportLive={onImportLive}
              onImportTLE={onImportTLE}
            />
          }
        />
        <Tab
          id="saved"
          title="Saved"
          panel={
            <SavedTab
              currentSessionId={currentSessionId}
              onLoadSession={onLoadSession}
            />
          }
        />
      </Tabs>
    </div>
  );
}

// --------------- ACTORS TAB ---------------

function ActorsTab({
  actors,
  selectedActor,
  selectedActorId,
  interactionMode,
  onSelectActor,
  onFlyToActor,
  onDeleteActor,
  onSaveActor,
  onRelocateActor,
  onSetMoveTarget,
  onSetInteractionMode,
}: {
  actors: SandboxActor[];
  selectedActor: SandboxActor | null;
  selectedActorId: string | null;
  interactionMode: SandboxInteractionMode;
  onSelectActor: (id: string | null) => void;
  onFlyToActor: (actor: SandboxActor) => void;
  onDeleteActor: (actor: SandboxActor) => void;
  onSaveActor: (actorId: string, data: ActorEditorState) => void;
  onRelocateActor: (actorId: string) => void;
  onSetMoveTarget: (actorId: string) => void;
  onSetInteractionMode: (mode: SandboxInteractionMode, template?: SandboxTemplateDraft) => void;
}) {
  const [editor, setEditor] = useState<ActorEditorState>(buildEditorState(null));
  const [editorActorId, setEditorActorId] = useState<string | null>(null);

  // Sync editor when selection changes
  if (selectedActor && selectedActor.id !== editorActorId) {
    setEditor(buildEditorState(selectedActor));
    setEditorActorId(selectedActor.id);
  } else if (!selectedActor && editorActorId) {
    setEditor(buildEditorState(null));
    setEditorActorId(null);
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      {/* Templates */}
      <div className="border-b border-sda-border-default p-3">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-sda-text-muted">
          Drop to place
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          {TEMPLATE_LIBRARY.map((t) => (
            <button
              key={`${t.actorType}-${t.label}`}
              type="button"
              draggable
              onDragStart={(e) => e.dataTransfer.setData('application/x-sandbox-template', JSON.stringify(t))}
              onClick={() =>
                onSetInteractionMode(
                  interactionMode === 'place_template' ? 'idle' : 'place_template',
                  t,
                )
              }
              className="rounded border border-sda-border-default bg-sda-bg-tertiary/50 px-2 py-1.5 text-left text-xs transition-colors hover:border-sda-accent-cyan/40"
            >
              <div className="font-medium text-sda-text-primary">{t.label}</div>
            </button>
          ))}
        </div>
        {interactionMode === 'place_template' && (
          <div className="mt-2 rounded bg-sda-accent-cyan/10 px-2 py-1 text-xs text-sda-accent-cyan">
            Click the globe to place the template.
          </div>
        )}
      </div>

      {/* Actor list */}
      <div className="border-b border-sda-border-default p-3">
        <div className="mb-2 flex items-center justify-between">
          <div className="text-xs font-semibold uppercase tracking-wide text-sda-text-muted">
            Session Actors
          </div>
          <Tag minimal>{actors.length}</Tag>
        </div>
        <div className="flex max-h-[200px] flex-col gap-1.5 overflow-y-auto">
          {actors.length === 0 ? (
            <div className="text-xs text-sda-text-muted">
              No actors yet. Use chat or templates to create.
            </div>
          ) : (
            actors.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => onSelectActor(a.id === selectedActorId ? null : a.id)}
                className={`flex items-center justify-between rounded border px-2.5 py-1.5 text-left transition-colors ${
                  a.id === selectedActorId
                    ? 'border-sda-accent-cyan bg-sda-accent-cyan/10'
                    : 'border-sda-border-default bg-sda-bg-tertiary/40 hover:border-sda-accent-cyan/30'
                }`}
              >
                <div>
                  <div className="text-sm font-medium text-sda-text-primary">{a.label}</div>
                  <div className="text-xs text-sda-text-muted">
                    {a.actor_type.replace('_', ' ')} · {a.faction}
                  </div>
                </div>
                <div className="flex gap-1">
                  <Button
                    small
                    minimal
                    icon="locate"
                    onClick={(e) => {
                      e.stopPropagation();
                      onFlyToActor(a);
                    }}
                  />
                  <Button
                    small
                    minimal
                    icon="trash"
                    intent="danger"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteActor(a);
                    }}
                  />
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Actor editor */}
      {selectedActor && (
        <div className="flex-1 p-3">
          <div className="mb-2 flex items-center justify-between">
            <div className="text-xs font-semibold uppercase tracking-wide text-sda-text-muted">
              Edit: {selectedActor.label}
            </div>
            <div className="flex gap-1">
              <Button
                small
                minimal
                icon="move"
                title="Relocate on map"
                onClick={() => onRelocateActor(selectedActor.id)}
              />
              <Button
                small
                minimal
                icon="path-search"
                title="Set move target on map"
                onClick={() => onSetMoveTarget(selectedActor.id)}
              />
            </div>
          </div>

          {interactionMode === 'relocate_actor' && (
            <div className="mb-2 rounded bg-amber-500/10 px-2 py-1 text-xs text-amber-400">
              Click the globe to relocate this actor.
            </div>
          )}
          {interactionMode === 'set_move_target' && (
            <div className="mb-2 rounded bg-sda-accent-cyan/10 px-2 py-1 text-xs text-sda-accent-cyan">
              Click the globe to set the move target.
            </div>
          )}

          <div className="flex flex-col gap-2">
            <InputGroup
              small
              value={editor.label}
              onChange={(e) => setEditor((s) => ({ ...s, label: e.target.value }))}
              placeholder="Label"
            />
            <HTMLSelect
              fill
              value={editor.faction}
              onChange={(e) => setEditor((s) => ({ ...s, faction: e.target.value as SandboxFaction }))}
              options={['allied', 'hostile', 'neutral', 'unknown']}
            />
            <div className="grid grid-cols-3 gap-1.5">
              <InputGroup
                small
                type="number"
                value={editor.lat}
                onChange={(e) => setEditor((s) => ({ ...s, lat: e.target.value }))}
                placeholder="Lat"
              />
              <InputGroup
                small
                type="number"
                value={editor.lon}
                onChange={(e) => setEditor((s) => ({ ...s, lon: e.target.value }))}
                placeholder="Lon"
              />
              <InputGroup
                small
                type="number"
                value={editor.alt_m}
                onChange={(e) => setEditor((s) => ({ ...s, alt_m: e.target.value }))}
                placeholder="Alt(m)"
              />
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              <InputGroup
                small
                type="number"
                value={editor.speed_ms}
                onChange={(e) => setEditor((s) => ({ ...s, speed_ms: e.target.value }))}
                placeholder="Speed m/s"
              />
              <InputGroup
                small
                type="number"
                value={editor.heading_deg}
                onChange={(e) => setEditor((s) => ({ ...s, heading_deg: e.target.value }))}
                placeholder="Heading"
              />
            </div>

            {/* Behavior */}
            <div className="text-xs font-medium text-sda-text-muted">Behavior</div>
            <HTMLSelect
              fill
              value={editor.behaviorType}
              onChange={(e) => setEditor((s) => ({ ...s, behaviorType: e.target.value }))}
              options={[
                { label: 'Hold Position', value: 'hold' },
                { label: 'Move To Target', value: 'move_to' },
                { label: 'Patrol Loop', value: 'patrol_loop' },
                { label: 'Follow Waypoints', value: 'follow_waypoints' },
                { label: 'Orbit Keep', value: 'orbit_keep' },
                { label: 'Approach Target', value: 'approach_target' },
              ]}
            />

            {(editor.behaviorType === 'move_to' || editor.behaviorType === 'approach_target') && (
              <div className="grid grid-cols-2 gap-1.5">
                <InputGroup
                  small
                  type="number"
                  value={editor.moveTargetLat}
                  onChange={(e) => setEditor((s) => ({ ...s, moveTargetLat: e.target.value }))}
                  placeholder="Target Lat"
                />
                <InputGroup
                  small
                  type="number"
                  value={editor.moveTargetLon}
                  onChange={(e) => setEditor((s) => ({ ...s, moveTargetLon: e.target.value }))}
                  placeholder="Target Lon"
                />
              </div>
            )}

            <div className="flex gap-2 pt-1">
              <Button
                small
                intent="primary"
                icon="floppy-disk"
                onClick={() => onSaveActor(selectedActor.id, editor)}
              >
                Save
              </Button>
              <Button
                small
                intent="danger"
                minimal
                icon="trash"
                onClick={() => onDeleteActor(selectedActor)}
              >
                Delete
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// --------------- IMPORT TAB ---------------

function ImportTab({
  liveSatellites,
  liveStations,
  liveVehicles,
  liveConjunctions,
  onImportLive,
  onImportTLE,
}: {
  liveSatellites: SatelliteDetail[];
  liveStations: GroundStation[];
  liveVehicles: PositionReport[];
  liveConjunctions: ConjunctionEvent[];
  onImportLive: (sourceType: string, sourceId: string) => void;
  onImportTLE: (tleText: string, label?: string, faction?: string) => void;
}) {
  const [filter, setFilter] = useState('');
  const [tleText, setTleText] = useState('');
  const [tleLabel, setTleLabel] = useState('');

  const lf = filter.toLowerCase();
  const sats = (lf ? liveSatellites.filter((s) => s.name.toLowerCase().includes(lf)) : liveSatellites).slice(0, 15);
  const stations = (lf ? liveStations.filter((s) => s.name.toLowerCase().includes(lf)) : liveStations).slice(0, 10);
  const vehicles = (lf ? liveVehicles.filter((v) => v.entity_id.toLowerCase().includes(lf)) : liveVehicles).slice(0, 10);

  const handleTLEImport = useCallback(() => {
    if (!tleText.trim()) return;
    onImportTLE(tleText.trim(), tleLabel.trim() || undefined, undefined);
    setTleText('');
    setTleLabel('');
  }, [onImportTLE, tleLabel, tleText]);

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      {/* TLE Import */}
      <div className="border-b border-sda-border-default p-3">
        <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-sda-text-muted">
          <Icon icon="satellite" size={12} />
          Paste TLE
        </div>
        <TextArea
          fill
          rows={3}
          placeholder="Paste 2-line or 3-line TLE here..."
          value={tleText}
          onChange={(e) => setTleText(e.target.value)}
          className="!text-xs font-mono"
        />
        <div className="mt-1.5 flex gap-1.5">
          <InputGroup
            small
            fill
            value={tleLabel}
            onChange={(e) => setTleLabel(e.target.value)}
            placeholder="Label (optional)"
          />
          <Button small intent="primary" disabled={!tleText.trim()} onClick={handleTLEImport}>
            Import
          </Button>
        </div>
      </div>

      {/* Live data search */}
      <div className="border-b border-sda-border-default p-3">
        <InputGroup
          small
          fill
          leftIcon="search"
          placeholder="Filter live data..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      </div>

      {/* Satellites */}
      <div className="border-b border-sda-border-default p-3">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-sda-text-muted">
          Satellites ({liveSatellites.length})
        </div>
        <div className="flex max-h-[160px] flex-col gap-1 overflow-y-auto">
          {sats.map((sat) => (
            <button
              key={sat.id}
              type="button"
              draggable
              onDragStart={(e) =>
                e.dataTransfer.setData(
                  'application/x-sandbox-import',
                  JSON.stringify({ source_type: 'satellite', source_id: sat.id }),
                )
              }
              onClick={() => onImportLive('satellite', sat.id)}
              className="rounded border border-sda-border-default bg-sda-bg-tertiary/40 px-2.5 py-1.5 text-left transition-colors hover:border-sda-accent-cyan/40"
            >
              <div className="text-xs font-medium text-sda-text-primary">{sat.name}</div>
              <div className="text-[10px] text-sda-text-muted">NORAD {sat.norad_id}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Ground Stations */}
      <div className="border-b border-sda-border-default p-3">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-sda-text-muted">
          Ground Stations ({liveStations.length})
        </div>
        <div className="flex max-h-[120px] flex-col gap-1 overflow-y-auto">
          {stations.map((s) => (
            <button
              key={s.id}
              type="button"
              draggable
              onDragStart={(e) =>
                e.dataTransfer.setData(
                  'application/x-sandbox-import',
                  JSON.stringify({ source_type: 'ground_station', source_id: s.id }),
                )
              }
              onClick={() => onImportLive('ground_station', s.id)}
              className="rounded border border-sda-border-default bg-sda-bg-tertiary/40 px-2.5 py-1.5 text-left transition-colors hover:border-sda-accent-cyan/40"
            >
              <div className="text-xs font-medium text-sda-text-primary">{s.name}</div>
              <div className="text-[10px] text-sda-text-muted">
                {s.latitude.toFixed(2)}, {s.longitude.toFixed(2)}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Ground Vehicles */}
      <div className="p-3">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-sda-text-muted">
          Ground Vehicles ({liveVehicles.length})
        </div>
        <div className="flex max-h-[120px] flex-col gap-1 overflow-y-auto">
          {vehicles.map((v) => (
            <button
              key={v.id}
              type="button"
              draggable
              onDragStart={(e) =>
                e.dataTransfer.setData(
                  'application/x-sandbox-import',
                  JSON.stringify({ source_type: 'ground_vehicle', source_id: v.id }),
                )
              }
              onClick={() => onImportLive('ground_vehicle', v.id)}
              className="rounded border border-sda-border-default bg-sda-bg-tertiary/40 px-2.5 py-1.5 text-left transition-colors hover:border-sda-accent-cyan/40"
            >
              <div className="text-xs font-medium text-sda-text-primary">{v.entity_id}</div>
              <div className="text-[10px] text-sda-text-muted">{v.entity_type}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// --------------- SAVED TAB ---------------

function SavedTab({
  currentSessionId,
  onLoadSession,
}: {
  currentSessionId: string | null;
  onLoadSession: (sessionId: string) => void;
}) {
  const [sessions, setSessions] = useState<SandboxSessionSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    sandboxApi
      .listSessions()
      .then((list) => {
        if (!cancelled) setSessions(list);
      })
      .catch(() => {
        /* swallow */
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [currentSessionId]);

  const others = sessions.filter((s) => s.id !== currentSessionId);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-6">
        <Spinner size={24} />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto p-3">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-sda-text-muted">
        Your Sandboxes ({sessions.length})
      </div>

      {others.length === 0 ? (
        <div className="rounded border border-dashed border-sda-border-default px-3 py-4 text-center text-xs text-sda-text-muted">
          No other sandboxes yet.
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {others.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => onLoadSession(s.id)}
              className="rounded border border-sda-border-default bg-sda-bg-tertiary/40 px-2.5 py-2 text-left transition-colors hover:border-sda-accent-cyan/40"
            >
              <div className="text-xs font-medium text-sda-text-primary">{s.name}</div>
              <div className="flex items-center gap-2 text-[10px] text-sda-text-muted">
                <span>{s.actor_count} actors</span>
                <span>{s.status}</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
