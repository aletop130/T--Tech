"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Button,
  HTMLSelect,
  Icon,
  InputGroup,
  Spinner,
  TextArea,
  type IconName,
} from "@blueprintjs/core";

import {
  api,
  type AircraftPosition,
  type ConjunctionEvent,
  type GroundStation,
  type PositionReport,
  type SatelliteDetail,
  type TrafficAreaPreset,
  type VesselPosition,
} from "@/lib/api";
import { sandboxApi, type SandboxSessionSummary } from "@/lib/api/sandbox";
import {
  useSandboxStore,
  type GroundDrawingConfig,
  type SandboxActor,
  type SandboxContextTab,
  type SandboxFaction,
  type SandboxInteractionMode,
  type SandboxPosition,
  type SandboxTemplateDraft,
  type TacticalAreaType,
  type TacticalMarkerType,
  type TacticalRouteType,
} from "@/lib/store/sandbox";
import { useEntityIntelStore } from "@/lib/store/entityIntel";
import { EntityIntelPanel } from "@/components/EntityIntel";
import { LayerTreePanel } from "@/components/LayerTree/LayerTreePanel";
import { ZonePlanningPanel } from "@/components/Sandbox/ZonePlanningPanel";
import { OverlayManager } from "@/components/Sandbox/OverlayManager";

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
  const pos =
    (actor?.state.position as { lat?: number; lon?: number; alt_m?: number }) ??
    {};
  const beh = (actor?.behavior ?? {}) as Record<string, unknown>;
  const target = (beh.target ?? {}) as { lat?: number; lon?: number };
  return {
    label: actor?.label ?? "",
    faction: actor?.faction ?? "neutral",
    lat: String(Number(pos.lat ?? 0).toFixed(4)),
    lon: String(Number(pos.lon ?? 0).toFixed(4)),
    alt_m: String(Math.round(Number(pos.alt_m ?? 0))),
    speed_ms: String(Number(actor?.state.speed_ms ?? 0)),
    heading_deg: String(Number(actor?.state.heading_deg ?? 0)),
    behaviorType: String(beh.type ?? "hold"),
    moveTargetLat:
      target.lat != null ? String(Number(target.lat).toFixed(4)) : "",
    moveTargetLon:
      target.lon != null ? String(Number(target.lon).toFixed(4)) : "",
  };
}

// --------------- TEMPLATES ---------------

const TEMPLATE_ICON_MAP: Record<string, IconName> = {
  base: "office",
  ground_station: "antenna",
  defended_zone: "shield",
  drone: "airplane",
  ground_vehicle: "drive-time",
  aircraft: "airplane",
  ship: "floating-point",
  satellite: "satellite",
  missile: "rocket-slant",
};

const TEMPLATE_LIBRARY: SandboxTemplateDraft[] = [
  {
    actorClass: "fixed_ground",
    actorType: "base",
    label: "Allied Base",
    faction: "allied",
  },
  {
    actorClass: "effect",
    actorType: "ground_station",
    label: "Tracking Station",
    faction: "allied",
    capabilities: { coverage_radius_km: 900 },
  },
  {
    actorClass: "effect",
    actorType: "defended_zone",
    label: "Defended Zone",
    faction: "allied",
    capabilities: { coverage_radius_km: 250 },
  },
  {
    actorClass: "mobile_ground",
    actorType: "ground_vehicle",
    label: "Convoy",
    faction: "neutral",
    behavior: { type: "hold" },
  },
  {
    actorClass: "air",
    actorType: "aircraft",
    label: "Patrol Aircraft",
    faction: "allied",
    behavior: { type: "hold" },
  },
  {
    actorClass: "air",
    actorType: "aircraft",
    subtype: "drone",
    label: "Recon Drone",
    faction: "allied",
    behavior: { type: "hold" },
  },
  {
    actorClass: "air",
    actorType: "aircraft",
    subtype: "drone",
    label: "Hostile Drone",
    faction: "hostile",
    behavior: { type: "hold" },
  },
  {
    actorClass: "orbital",
    actorType: "satellite",
    label: "Satellite",
    faction: "allied",
    behavior: { type: "hold" },
  },
  {
    actorClass: "weapon",
    actorType: "missile",
    label: "Interceptor",
    faction: "allied",
    behavior: { type: "hold" },
  },
];

// --------------- HELPERS ---------------

const FACTION_DOT: Record<string, string> = {
  allied: "bg-cyan-400",
  hostile: "bg-red-500",
  neutral: "bg-amber-400",
  unknown: "bg-zinc-500",
};

const TAB_LABELS: Record<string, string> = {
  actors: "ORBAT",
  import: "INTEL",
  saved: "OPS",
  ground: "GROUND",
  layers: "LAYERS",
  asset: "ASSET",
};

function getTemplateIcon(template: SandboxTemplateDraft): IconName {
  if (template.subtype && TEMPLATE_ICON_MAP[template.subtype]) {
    return TEMPLATE_ICON_MAP[template.subtype];
  }
  return TEMPLATE_ICON_MAP[template.actorType] ?? "dot";
}

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
  liveAircraft?: AircraftPosition[];
  liveVessels?: VesselPosition[];
  onSelectActor: (id: string | null) => void;
  onFlyToActor: (actor: SandboxActor) => void;
  onDeleteActor: (actor: SandboxActor) => void;
  onSaveActor: (actorId: string, data: ActorEditorState) => void;
  onRelocateActor: (actorId: string) => void;
  onSetMoveTarget: (actorId: string, behaviorType?: string) => void;
  onSetInteractionMode: (
    mode: SandboxInteractionMode,
    template?: SandboxTemplateDraft,
  ) => void;
  onImportLive: (
    sourceType: string,
    sourceId: string,
    position?: SandboxPosition,
  ) => void;
  onImportTLE: (tleText: string, label?: string, faction?: string) => void;
  onLoadSession: (sessionId: string) => void;
  onSatellitesChange?: (satellites: SatelliteDetail[]) => void;
  onAircraftChange?: (aircraft: AircraftPosition[]) => void;
  onVesselsChange?: (vessels: VesselPosition[]) => void;
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
  liveAircraft = [],
  liveVessels = [],
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
  onSatellitesChange,
  onAircraftChange,
  onVesselsChange,
}: SandboxContextPanelProps) {
  const selectedActor = actors.find((a) => a.id === selectedActorId) ?? null;
  const entitySelected = useEntityIntelStore((s) => !!s.selectedEntity);

  // Build visible tabs — ASSET only appears when entity is selected
  const baseTabs: SandboxContextTab[] = ["actors", "import", "saved", "ground", "layers"];
  const visibleTabs: SandboxContextTab[] = entitySelected
    ? ["asset", ...baseTabs]
    : baseTabs;

  return (
    <div className="flex h-full flex-col bg-[#080808]">
      {/* ── TACTICAL TAB BAR ── */}
      <div className="flex flex-shrink-0 overflow-x-auto border-b border-[#1a1a1a] scrollbar-none">
        {visibleTabs.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => onTabChange(t)}
            className={`relative flex-shrink-0 px-3 py-2.5 font-code text-[10px] font-semibold uppercase tracking-wider transition-colors ${
              tab === t
                ? t === "asset"
                  ? "text-amber-400"
                  : "text-sda-accent-cyan"
                : "text-zinc-600 hover:text-zinc-400"
            }`}
          >
            {TAB_LABELS[t] ?? t.toUpperCase()}
            {tab === t && (
              <span
                className={`absolute inset-x-0 bottom-0 h-px ${
                  t === "asset" ? "bg-amber-400" : "bg-sda-accent-cyan"
                }`}
              />
            )}
          </button>
        ))}
      </div>

      {/* ── TAB CONTENT ── */}
      <div className="min-h-0 flex-1 overflow-hidden">
        {tab === "asset" && (
          <EntityIntelPanel
            actors={actors}
            onSelectActor={onSelectActor}
          />
        )}
        {tab === "actors" && (
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
        )}
        {tab === "import" && (
          <ImportTab
            liveSatellites={liveSatellites}
            liveStations={liveStations}
            liveVehicles={liveVehicles}
            liveConjunctions={liveConjunctions}
            liveAircraft={liveAircraft}
            liveVessels={liveVessels}
            onImportLive={onImportLive}
            onImportTLE={onImportTLE}
            onSatellitesChange={onSatellitesChange}
            onAircraftChange={onAircraftChange}
            onVesselsChange={onVesselsChange}
          />
        )}
        {tab === "saved" && (
          <SavedTab
            currentSessionId={currentSessionId}
            onLoadSession={onLoadSession}
          />
        )}
        {tab === "ground" && (
          <GroundPlanningTab
            actors={actors}
            interactionMode={interactionMode}
            onSetInteractionMode={onSetInteractionMode}
          />
        )}
        {tab === "layers" && <LayerTreePanel />}
      </div>
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
  onSetMoveTarget: (actorId: string, behaviorType?: string) => void;
  onSetInteractionMode: (
    mode: SandboxInteractionMode,
    template?: SandboxTemplateDraft,
  ) => void;
}) {
  const [editor, setEditor] = useState<ActorEditorState>(
    buildEditorState(null),
  );

  useEffect(() => {
    setEditor(buildEditorState(selectedActor));
  }, [selectedActor]);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto">
      {/* ── FORCE TEMPLATES ── */}
      <div className="flex-shrink-0 border-b border-[#1a1a1a] p-4">
        <div className="mb-3 font-code text-[10px] font-semibold uppercase tracking-wider text-sda-accent-cyan/50">
          // FORCE TEMPLATES
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          {TEMPLATE_LIBRARY.map((t) => (
            <button
              key={`${t.actorType}-${t.label}`}
              type="button"
              draggable
              onDragStart={(e) =>
                e.dataTransfer.setData(
                  "application/x-sandbox-template",
                  JSON.stringify(t),
                )
              }
              onClick={() =>
                onSetInteractionMode(
                  interactionMode === "place_template"
                    ? "idle"
                    : "place_template",
                  t,
                )
              }
              className="flex items-center gap-2 border border-[#1a1a1a] bg-white/[0.02] px-2.5 py-2 text-left font-code text-[10px] uppercase tracking-wider text-zinc-500 transition-colors hover:border-sda-accent-cyan/30 hover:bg-sda-accent-cyan/[0.04] hover:text-zinc-300"
            >
              <Icon
                icon={getTemplateIcon(t)}
                size={12}
                className="flex-shrink-0 text-zinc-600"
              />
              <span>{t.label}</span>
            </button>
          ))}
        </div>
        {interactionMode === "place_template" && (
          <div className="mt-2 border-l-2 border-l-sda-accent-cyan/50 bg-sda-accent-cyan/[0.04] px-2.5 py-1.5 font-code text-[10px] text-sda-accent-cyan">
            Click globe to deploy asset.
          </div>
        )}
      </div>

      {/* ── ORDER OF BATTLE ── */}
      <div className="flex min-h-[180px] flex-[0.9] flex-col border-b border-[#1a1a1a] p-4">
        <div className="mb-3 flex items-center justify-between">
          <span className="font-code text-[10px] font-semibold uppercase tracking-wider text-sda-accent-cyan/50">
            // ORDER OF BATTLE
          </span>
          <span className="font-code text-[9px] tracking-wider text-zinc-600">
            {actors.length}
          </span>
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto pr-1">
          {actors.length === 0 ? (
            <div className="border border-dashed border-[#1a1a1a] px-3 py-3 text-center font-code text-[10px] text-zinc-600">
              No forces deployed. Use chat or templates.
            </div>
          ) : (
            actors.map((a) => (
              <div
                key={a.id}
                className={`flex items-center justify-between border px-3 py-2 transition-colors ${
                  a.id === selectedActorId
                    ? "border-sda-accent-cyan/50 bg-sda-accent-cyan/[0.06]"
                    : "border-[#1a1a1a] bg-white/[0.015] hover:border-sda-accent-cyan/20 hover:bg-white/[0.03]"
                }`}
              >
                <button
                  type="button"
                  onClick={() =>
                    onSelectActor(a.id === selectedActorId ? null : a.id)
                  }
                  className="min-w-0 flex-1 text-left"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`h-1.5 w-1.5 flex-shrink-0 ${FACTION_DOT[a.faction] ?? "bg-zinc-500"}`}
                    />
                    <span className="font-code text-[11px] font-medium text-sda-text-primary">
                      {a.label}
                    </span>
                  </div>
                  <div className="ml-3.5 font-code text-[9px] uppercase tracking-wider text-zinc-600">
                    {(a.subtype ?? a.actor_type).replace("_", " ")} &middot; {a.faction}
                  </div>
                </button>
                <div className="ml-2 flex flex-shrink-0 gap-1">
                  <Button
                    small
                    minimal
                    icon="locate"
                    onClick={() => onFlyToActor(a)}
                  />
                  <Button
                    small
                    minimal
                    icon="trash"
                    intent="danger"
                    onClick={() => onDeleteActor(a)}
                  />
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* ── ASSET CONFIG ── */}
      {selectedActor && (
        <div className="flex min-h-0 flex-1 flex-col p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="font-code text-[10px] font-semibold uppercase tracking-wider text-sda-accent-cyan/50">
              // ASSET CONFIG: {selectedActor.label}
            </span>
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
                title="Set behavior target on map"
                onClick={() =>
                  onSetMoveTarget(selectedActor.id, editor.behaviorType)
                }
              />
            </div>
          </div>

          {interactionMode === "relocate_actor" && (
            <div className="mb-2 border-l-2 border-l-amber-500/50 bg-amber-500/[0.06] px-2.5 py-1.5 font-code text-[10px] text-amber-400">
              Click globe to relocate asset.
            </div>
          )}
          {interactionMode === "set_move_target" && (
            <div className="mb-2 border-l-2 border-l-sda-accent-cyan/50 bg-sda-accent-cyan/[0.06] px-2.5 py-1.5 font-code text-[10px] text-sda-accent-cyan">
              Click globe to set move target.
            </div>
          )}

          <div className="min-h-0 overflow-y-auto pr-1">
            <div className="flex flex-col gap-2.5">
              {/* Callsign */}
              <div>
                <div className="mb-1 font-code text-[9px] uppercase tracking-wider text-zinc-600">
                  CALLSIGN
                </div>
                <InputGroup
                  small
                  value={editor.label}
                  onChange={(e) =>
                    setEditor((s) => ({ ...s, label: e.target.value }))
                  }
                  placeholder="Callsign"
                />
              </div>

              {/* Faction */}
              <div>
                <div className="mb-1 font-code text-[9px] uppercase tracking-wider text-zinc-600">
                  FACTION
                </div>
                <HTMLSelect
                  fill
                  value={editor.faction}
                  onChange={(e) =>
                    setEditor((s) => ({
                      ...s,
                      faction: e.target.value as SandboxFaction,
                    }))
                  }
                  options={["allied", "hostile", "neutral", "unknown"]}
                />
              </div>

              {/* Position */}
              <div>
                <div className="mb-1 font-code text-[9px] uppercase tracking-wider text-zinc-600">
                  POSITION
                </div>
                <div className="grid grid-cols-3 gap-1.5">
                  <InputGroup
                    small
                    type="number"
                    value={editor.lat}
                    onChange={(e) =>
                      setEditor((s) => ({ ...s, lat: e.target.value }))
                    }
                    placeholder="LAT"
                  />
                  <InputGroup
                    small
                    type="number"
                    value={editor.lon}
                    onChange={(e) =>
                      setEditor((s) => ({ ...s, lon: e.target.value }))
                    }
                    placeholder="LON"
                  />
                  <InputGroup
                    small
                    type="number"
                    value={editor.alt_m}
                    onChange={(e) =>
                      setEditor((s) => ({ ...s, alt_m: e.target.value }))
                    }
                    placeholder="ALT"
                  />
                </div>
              </div>

              {/* Kinematics */}
              <div>
                <div className="mb-1 font-code text-[9px] uppercase tracking-wider text-zinc-600">
                  KINEMATICS
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  <InputGroup
                    small
                    type="number"
                    value={editor.speed_ms}
                    onChange={(e) =>
                      setEditor((s) => ({ ...s, speed_ms: e.target.value }))
                    }
                    placeholder="SPD m/s"
                  />
                  <InputGroup
                    small
                    type="number"
                    value={editor.heading_deg}
                    onChange={(e) =>
                      setEditor((s) => ({
                        ...s,
                        heading_deg: e.target.value,
                      }))
                    }
                    placeholder="HDG deg"
                  />
                </div>
              </div>

              {/* Behavior */}
              <div>
                <div className="mb-1 font-code text-[9px] uppercase tracking-wider text-zinc-600">
                  BEHAVIOR
                </div>
                <HTMLSelect
                  fill
                  value={editor.behaviorType}
                  onChange={(e) =>
                    setEditor((s) => ({ ...s, behaviorType: e.target.value }))
                  }
                  options={[
                    { label: "Hold Position", value: "hold" },
                    { label: "Move To Target", value: "move_to" },
                    { label: "Patrol Loop", value: "patrol_loop" },
                    { label: "Follow Waypoints", value: "follow_waypoints" },
                    { label: "Orbit Keep", value: "orbit_keep" },
                    { label: "Approach Target", value: "approach_target" },
                  ]}
                />
              </div>

              {(editor.behaviorType === "move_to" ||
                editor.behaviorType === "approach_target") && (
                <div className="flex flex-col gap-1.5">
                  <div className="mb-1 font-code text-[9px] uppercase tracking-wider text-zinc-600">
                    TARGET
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    <InputGroup
                      small
                      type="number"
                      value={editor.moveTargetLat}
                      onChange={(e) =>
                        setEditor((s) => ({
                          ...s,
                          moveTargetLat: e.target.value,
                        }))
                      }
                      placeholder="TGT LAT"
                    />
                    <InputGroup
                      small
                      type="number"
                      value={editor.moveTargetLon}
                      onChange={(e) =>
                        setEditor((s) => ({
                          ...s,
                          moveTargetLon: e.target.value,
                        }))
                      }
                      placeholder="TGT LON"
                    />
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-code text-[9px] text-zinc-600">
                      Click globe to set target coordinates.
                    </div>
                    <Button
                      small
                      minimal
                      icon="path-search"
                      onClick={() =>
                        onSetMoveTarget(selectedActor.id, editor.behaviorType)
                      }
                    >
                      Pick on map
                    </Button>
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => onSaveActor(selectedActor.id, editor)}
                  className="flex items-center gap-1.5 border border-sda-accent-cyan/30 bg-sda-accent-cyan/[0.08] px-3 py-1.5 font-code text-[10px] uppercase tracking-wider text-sda-accent-cyan transition-colors hover:bg-sda-accent-cyan/[0.15]"
                >
                  <Icon icon="floppy-disk" size={10} />
                  COMMIT
                </button>
                <button
                  type="button"
                  onClick={() => onDeleteActor(selectedActor)}
                  className="flex items-center gap-1.5 border border-red-500/20 bg-red-500/[0.05] px-3 py-1.5 font-code text-[10px] uppercase tracking-wider text-red-400/70 transition-colors hover:bg-red-500/[0.1]"
                >
                  <Icon icon="trash" size={10} />
                  DELETE
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// --------------- IMPORT TAB ---------------

type IntelSubTab = "sat" | "plane" | "ship";

const INTEL_SUB_LABELS: Record<IntelSubTab, string> = {
  sat: "SAT",
  plane: "PLANE",
  ship: "SHIP",
};

function ImportTab({
  liveSatellites,
  liveStations,
  liveVehicles,
  liveConjunctions,
  liveAircraft = [],
  liveVessels = [],
  onImportLive,
  onImportTLE,
  onSatellitesChange,
  onAircraftChange,
  onVesselsChange,
}: {
  liveSatellites: SatelliteDetail[];
  liveStations: GroundStation[];
  liveVehicles: PositionReport[];
  liveConjunctions: ConjunctionEvent[];
  liveAircraft?: AircraftPosition[];
  liveVessels?: VesselPosition[];
  onImportLive: (sourceType: string, sourceId: string) => void;
  onImportTLE: (tleText: string, label?: string, faction?: string) => void;
  onSatellitesChange?: (satellites: SatelliteDetail[]) => void;
  onAircraftChange?: (aircraft: AircraftPosition[]) => void;
  onVesselsChange?: (vessels: VesselPosition[]) => void;
}) {
  const [subTab, setSubTab] = useState<IntelSubTab>("sat");
  const [filter, setFilter] = useState("");
  const [tleText, setTleText] = useState("");
  const [tleLabel, setTleLabel] = useState("");

  const lf = filter.toLowerCase();
  const sats = lf
    ? liveSatellites.filter((s) => s.name.toLowerCase().includes(lf))
    : liveSatellites;
  const stations = lf
    ? liveStations.filter((s) => s.name.toLowerCase().includes(lf))
    : liveStations;
  const vehicles = lf
    ? liveVehicles.filter((v) => v.entity_id.toLowerCase().includes(lf))
    : liveVehicles;
  const filteredAircraft = lf
    ? liveAircraft.filter(
        (a) =>
          (a.callsign ?? "").toLowerCase().includes(lf) ||
          a.icao24.toLowerCase().includes(lf),
      )
    : liveAircraft;
  const filteredVessels = lf
    ? liveVessels.filter(
        (v) =>
          (v.name ?? "").toLowerCase().includes(lf) ||
          String(v.mmsi).includes(lf),
      )
    : liveVessels;

  const handleTLEImport = useCallback(() => {
    if (!tleText.trim()) return;
    onImportTLE(tleText.trim(), tleLabel.trim() || undefined, undefined);
    setTleText("");
    setTleLabel("");
  }, [onImportTLE, tleLabel, tleText]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* ── SUB-TAB BAR: SAT / PLANE / SHIP ── */}
      <div className="flex flex-shrink-0 border-b border-[#1a1a1a]">
        {(["sat", "plane", "ship"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setSubTab(t)}
            className={`relative flex-1 px-2 py-2 font-code text-[10px] font-semibold uppercase tracking-wider transition-colors ${
              subTab === t
                ? "text-sda-accent-cyan"
                : "text-zinc-600 hover:text-zinc-400"
            }`}
          >
            {INTEL_SUB_LABELS[t]}
            {subTab === t && (
              <span className="absolute inset-x-0 bottom-0 h-px bg-sda-accent-cyan" />
            )}
          </button>
        ))}
      </div>

      {/* ── FILTER ── */}
      <div className="flex-shrink-0 border-b border-[#1a1a1a] p-3">
        <InputGroup
          small
          fill
          leftIcon="search"
          placeholder={
            subTab === "sat"
              ? "Filter satellites..."
              : subTab === "plane"
                ? "Filter callsign / ICAO24..."
                : "Filter name / MMSI..."
          }
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      </div>

      {/* ── SAT TAB ── */}
      {subTab === "sat" && (
        <SatSubTab
          filter={lf}
          liveSatellites={liveSatellites}
          onImportLive={onImportLive}
          onImportTLE={onImportTLE}
          onSatellitesChange={onSatellitesChange}
        />
      )}

      {/* ── PLANE TAB ── */}
      {subTab === "plane" && <PlaneSubTab filter={lf} onDataChange={onAircraftChange} />}

      {/* ── SHIP TAB ── */}
      {subTab === "ship" && <ShipSubTab filter={lf} onDataChange={onVesselsChange} />}
    </div>
  );
}

// --------------- PLANE SUB-TAB ---------------

const DISPLAY_LIMITS = [50, 100, 500, 1000] as const;

const SAT_AREA_PRESETS: Record<string, { label: string; bbox: { lat_min: number; lat_max: number; lon_min: number; lon_max: number } | null }> = {
  italy: { label: "Italia", bbox: { lat_min: 36, lat_max: 47, lon_min: 6, lon_max: 19 } },
  mediterranean: { label: "Mediterraneo", bbox: { lat_min: 30, lat_max: 46, lon_min: -6, lon_max: 36 } },
  europe: { label: "Europa", bbox: { lat_min: 35, lat_max: 72, lon_min: -25, lon_max: 45 } },
  middle_east: { label: "Medio Oriente", bbox: { lat_min: 12, lat_max: 42, lon_min: 25, lon_max: 63 } },
  hormuz: { label: "Stretto di Hormuz", bbox: { lat_min: 24, lat_max: 27.5, lon_min: 54, lon_max: 58 } },
  persian_gulf: { label: "Golfo Persico", bbox: { lat_min: 23, lat_max: 31, lon_min: 47, lon_max: 57 } },
  baltic: { label: "Baltico", bbox: { lat_min: 53, lat_max: 66, lon_min: 10, lon_max: 30 } },
  global: { label: "Globale", bbox: null },
};

function computeSatLatLon(sat: SatelliteDetail): { lat: number; lon: number; alt: number } | null {
  const orbit = sat.latest_orbit;
  if (!orbit?.tle_line1 || !orbit?.tle_line2) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const satlib = require("satellite.js") as typeof import("satellite.js");
    const satrec = satlib.twoline2satrec(orbit.tle_line1, orbit.tle_line2);
    const now = new Date();
    const posVel = satlib.propagate(satrec, now);
    if (!posVel.position || typeof posVel.position === "boolean") return null;
    const gmst = satlib.gstime(now);
    const geo = satlib.eciToGeodetic(posVel.position, gmst);
    return {
      lat: satlib.degreesLat(geo.latitude),
      lon: satlib.degreesLong(geo.longitude),
      alt: geo.height * 1000,
    };
  } catch {
    return null;
  }
}

// --------------- SAT SUB-TAB ---------------

function SatSubTab({
  filter,
  liveSatellites,
  onImportLive,
  onImportTLE,
  onSatellitesChange,
}: {
  filter: string;
  liveSatellites: SatelliteDetail[];
  onImportLive: (sourceType: string, sourceId: string) => void;
  onImportTLE: (tleText: string, label?: string, faction?: string) => void;
  onSatellitesChange?: (satellites: SatelliteDetail[]) => void;
}) {
  const [activePreset, setActivePreset] = useState("global");
  const [limit, setLimit] = useState<number>(100);
  const [showOnMap, setShowOnMap] = useState(true);
  const [tleText, setTleText] = useState("");
  const onSatChangeRef = useRef(onSatellitesChange);
  onSatChangeRef.current = onSatellitesChange;
  const [tleLabel, setTleLabel] = useState("");

  const handleTLEImport = useCallback(() => {
    if (!tleText.trim()) return;
    onImportTLE(tleText.trim(), tleLabel.trim() || undefined, undefined);
    setTleText("");
    setTleLabel("");
  }, [onImportTLE, tleLabel, tleText]);

  // Filter by name
  const nameFiltered = filter
    ? liveSatellites.filter((s) => s.name.toLowerCase().includes(filter))
    : liveSatellites;

  // Filter by area using current TLE position
  const bbox = SAT_AREA_PRESETS[activePreset]?.bbox ?? null;
  const areaFiltered = bbox
    ? nameFiltered.filter((sat) => {
        const pos = computeSatLatLon(sat);
        if (!pos) return false;
        return (
          pos.lat >= bbox.lat_min &&
          pos.lat <= bbox.lat_max &&
          pos.lon >= bbox.lon_min &&
          pos.lon <= bbox.lon_max
        );
      })
    : nameFiltered;

  const limited = areaFiltered.slice(0, limit);

  // Push filtered satellites to map overlay
  const limitedIds = JSON.stringify(limited.map((s) => s.id));
  useEffect(() => {
    onSatChangeRef.current?.(showOnMap ? limited : []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [limitedIds, showOnMap, limit]);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      {/* Area presets */}
      <div className="flex-shrink-0 border-b border-[#1a1a1a] p-3">
        <div className="flex flex-wrap gap-1">
          {Object.entries(SAT_AREA_PRESETS).map(([key, p]) => (
            <button
              key={key}
              type="button"
              onClick={() => setActivePreset(key)}
              className={`border px-2 py-0.5 font-code text-[9px] font-medium uppercase tracking-wider transition-colors ${
                activePreset === key
                  ? "border-purple-400/50 bg-purple-400/10 text-purple-400"
                  : "border-[#1a1a1a] text-zinc-600 hover:text-zinc-400"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Controls: map toggle + limit */}
      <div className="flex flex-shrink-0 items-center justify-between border-b border-[#1a1a1a] px-3 py-2">
        <button
          type="button"
          onClick={() => setShowOnMap(!showOnMap)}
          className={`flex items-center gap-1.5 border px-2 py-0.5 font-code text-[9px] font-medium uppercase tracking-wider transition-colors ${
            showOnMap
              ? "border-purple-400/50 bg-purple-400/10 text-purple-400"
              : "border-[#1a1a1a] text-zinc-600"
          }`}
        >
          <Icon icon="eye-open" size={10} />
          MAP
        </button>
        <div className="flex items-center gap-1">
          <span className="font-code text-[9px] text-zinc-600">SHOW</span>
          {DISPLAY_LIMITS.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setLimit(n)}
              className={`border px-1.5 py-0.5 font-code text-[9px] transition-colors ${
                limit === n
                  ? "border-purple-400/40 bg-purple-400/10 text-purple-400"
                  : "border-[#1a1a1a] text-zinc-600 hover:text-zinc-400"
              }`}
            >
              {n}
            </button>
          ))}
        </div>
      </div>

      {/* Header */}
      <div className="flex-shrink-0 border-b border-[#1a1a1a] px-3 py-1.5">
        <div className="flex items-center justify-between">
          <span className="font-code text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
            SATELLITES OVER AREA
          </span>
          <span className="font-code text-[9px] text-zinc-600">
            {limited.length} / {areaFiltered.length}
          </span>
        </div>
      </div>

      {/* Satellite list */}
      <div className="flex flex-col gap-px p-1">
        {limited.length === 0 ? (
          <div className="border border-dashed border-[#1a1a1a] px-3 py-6 text-center font-code text-[10px] text-zinc-600">
            {liveSatellites.length === 0
              ? "No satellites loaded."
              : "No satellites currently over this area."}
          </div>
        ) : (
          limited.map((sat) => (
            <button
              key={sat.id}
              type="button"
              draggable
              onDragStart={(e) =>
                e.dataTransfer.setData(
                  "application/x-sandbox-import",
                  JSON.stringify({ source_type: "satellite", source_id: sat.id }),
                )
              }
              onClick={() => onImportLive("satellite", sat.id)}
              className="flex items-center gap-2.5 border border-[#1a1a1a] bg-white/[0.015] px-2.5 py-1.5 text-left transition-colors hover:border-purple-400/20 hover:bg-white/[0.03]"
            >
              <Icon icon="satellite" size={12} className="text-purple-400" />
              <div className="min-w-0 flex-1">
                <div className="font-code text-[10px] font-medium text-sda-text-primary">
                  {sat.name}
                </div>
                <div className="font-code text-[9px] text-zinc-600">
                  NORAD {sat.norad_id} {sat.country ? `· ${sat.country}` : ""}
                </div>
              </div>
            </button>
          ))
        )}
      </div>

      {/* TLE INGEST (collapsible at bottom) */}
      <div className="border-t border-[#1a1a1a] p-3">
        <div className="mb-2 font-code text-[10px] font-semibold uppercase tracking-wider text-sda-accent-cyan/50">
          // TLE INGEST
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
          <button
            type="button"
            disabled={!tleText.trim()}
            onClick={handleTLEImport}
            className="flex-shrink-0 border border-sda-accent-cyan/30 bg-sda-accent-cyan/[0.08] px-3 py-1 font-code text-[10px] uppercase tracking-wider text-sda-accent-cyan transition-colors hover:bg-sda-accent-cyan/[0.15] disabled:opacity-30"
          >
            IMPORT
          </button>
        </div>
      </div>
    </div>
  );
}

function PlaneSubTab({ filter, onDataChange }: { filter: string; onDataChange?: (data: AircraftPosition[]) => void }) {
  const [presets, setPresets] = useState<TrafficAreaPreset[]>([]);
  const [activePreset, setActivePreset] = useState("middle_east");
  const [aircraft, setAircraft] = useState<AircraftPosition[]>([]);
  const [loading, setLoading] = useState(false);
  const [limit, setLimit] = useState<number>(100);
  const [showOnMap, setShowOnMap] = useState(true);
  const onDataChangeRef = useRef(onDataChange);
  onDataChangeRef.current = onDataChange;

  useEffect(() => {
    api.getTrafficPresets().then(setPresets).catch(() => {});
  }, []);

  const load = useCallback(
    async (preset: string) => {
      setLoading(true);
      try {
        const data = await api.getAircraft(preset);
        setAircraft(data);
      } catch {
        /* silent */
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    load(activePreset);
    const iv = setInterval(() => load(activePreset), 60_000);
    return () => clearInterval(iv);
  }, [activePreset, load]);

  const filtered = filter
    ? aircraft.filter(
        (a) =>
          (a.callsign ?? "").toLowerCase().includes(filter) ||
          a.icao24.toLowerCase().includes(filter),
      )
    : aircraft;

  const limited = filtered.slice(0, limit);

  // Push to map whenever data, limit, or toggle changes
  const limitedJson = JSON.stringify(limited.map((a) => a.icao24));
  useEffect(() => {
    onDataChangeRef.current?.(showOnMap ? limited : []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [limitedJson, showOnMap, limit]);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      {/* Area presets */}
      <div className="flex-shrink-0 border-b border-[#1a1a1a] p-3">
        <div className="flex flex-wrap gap-1">
          {(presets.length > 0
            ? presets
            : [{ key: "italy", label: "Italia", bbox: null }]
          ).map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => setActivePreset(p.key)}
              className={`border px-2 py-0.5 font-code text-[9px] font-medium uppercase tracking-wider transition-colors ${
                activePreset === p.key
                  ? "border-blue-400/50 bg-blue-400/10 text-blue-400"
                  : "border-[#1a1a1a] text-zinc-600 hover:text-zinc-400"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        {loading && (
          <div className="mt-1.5 font-code text-[9px] text-zinc-600">
            Loading...
          </div>
        )}
      </div>

      {/* Controls: map toggle + limit */}
      <div className="flex flex-shrink-0 items-center justify-between border-b border-[#1a1a1a] px-3 py-2">
        <button
          type="button"
          onClick={() => setShowOnMap(!showOnMap)}
          className={`flex items-center gap-1.5 border px-2 py-0.5 font-code text-[9px] font-medium uppercase tracking-wider transition-colors ${
            showOnMap
              ? "border-blue-400/50 bg-blue-400/10 text-blue-400"
              : "border-[#1a1a1a] text-zinc-600"
          }`}
        >
          <Icon icon="eye-open" size={10} />
          MAP
        </button>
        <div className="flex items-center gap-1">
          <span className="font-code text-[9px] text-zinc-600">SHOW</span>
          {DISPLAY_LIMITS.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setLimit(n)}
              className={`border px-1.5 py-0.5 font-code text-[9px] transition-colors ${
                limit === n
                  ? "border-blue-400/40 bg-blue-400/10 text-blue-400"
                  : "border-[#1a1a1a] text-zinc-600 hover:text-zinc-400"
              }`}
            >
              {n}
            </button>
          ))}
        </div>
      </div>

      {/* Header */}
      <div className="flex-shrink-0 border-b border-[#1a1a1a] px-3 py-1.5">
        <div className="flex items-center justify-between">
          <span className="font-code text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
            LIVE AIRCRAFT
          </span>
          <span className="font-code text-[9px] text-zinc-600">
            {limited.length} / {filtered.length}
          </span>
        </div>
      </div>

      {/* List */}
      <div className="flex flex-col gap-px p-1">
        {limited.length === 0 ? (
          <div className="border border-dashed border-[#1a1a1a] px-3 py-6 text-center font-code text-[10px] text-zinc-600">
            {aircraft.length === 0
              ? "No aircraft data. Select an area above."
              : "No aircraft match filter."}
          </div>
        ) : (
          limited.map((ac) => (
            <div
              key={ac.icao24}
              className="flex items-center gap-2.5 border border-[#1a1a1a] bg-white/[0.015] px-2.5 py-1.5 transition-colors hover:border-blue-400/20 hover:bg-white/[0.03]"
            >
              <span className="text-[12px] text-blue-400">&#9992;</span>
              <div className="min-w-0 flex-1">
                <div className="font-code text-[10px] font-medium text-sda-text-primary">
                  {ac.callsign || ac.icao24}
                </div>
                <div className="font-code text-[9px] text-zinc-600">
                  {ac.latitude.toFixed(2)}°, {ac.longitude.toFixed(2)}°
                  {ac.on_ground
                    ? " GND"
                    : ` FL${String(Math.round(ac.altitude_m / 30.48 / 100)).padStart(3, "0")}`}
                  {ac.speed_ms != null
                    ? ` ${Math.round(ac.speed_ms * 1.944)}kt`
                    : ""}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// --------------- SHIP SUB-TAB ---------------

function ShipSubTab({ filter, onDataChange }: { filter: string; onDataChange?: (data: VesselPosition[]) => void }) {
  const [presets, setPresets] = useState<TrafficAreaPreset[]>([]);
  const [activePreset, setActivePreset] = useState("middle_east");
  const [vessels, setVessels] = useState<VesselPosition[]>([]);
  const [loading, setLoading] = useState(false);
  const [limit, setLimit] = useState<number>(100);
  const [showOnMap, setShowOnMap] = useState(true);
  const onDataChangeRef = useRef(onDataChange);
  onDataChangeRef.current = onDataChange;

  useEffect(() => {
    api.getTrafficPresets().then(setPresets).catch(() => {});
  }, []);

  const load = useCallback(
    async (preset: string) => {
      setLoading(true);
      try {
        const data = await api.getVessels(preset);
        setVessels(data);
      } catch {
        /* silent */
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  // Fetch only on area change — no periodic refresh to save API credits
  useEffect(() => {
    load(activePreset);
  }, [activePreset, load]);

  const filtered = filter
    ? vessels.filter(
        (v) =>
          (v.name ?? "").toLowerCase().includes(filter) ||
          String(v.mmsi).includes(filter),
      )
    : vessels;

  const limited = filtered.slice(0, limit);

  const limitedJson = JSON.stringify(limited.map((v) => v.mmsi));
  useEffect(() => {
    onDataChangeRef.current?.(showOnMap ? limited : []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [limitedJson, showOnMap, limit]);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      {/* Area presets */}
      <div className="flex-shrink-0 border-b border-[#1a1a1a] p-3">
        <div className="flex flex-wrap gap-1">
          {(presets.length > 0
            ? presets
            : [{ key: "baltic", label: "Baltico", bbox: null }]
          ).map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => setActivePreset(p.key)}
              className={`border px-2 py-0.5 font-code text-[9px] font-medium uppercase tracking-wider transition-colors ${
                activePreset === p.key
                  ? "border-emerald-400/50 bg-emerald-400/10 text-emerald-400"
                  : "border-[#1a1a1a] text-zinc-600 hover:text-zinc-400"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        {loading && (
          <div className="mt-1.5 font-code text-[9px] text-zinc-600">
            Loading...
          </div>
        )}
      </div>

      {/* Controls: map toggle + limit */}
      <div className="flex flex-shrink-0 items-center justify-between border-b border-[#1a1a1a] px-3 py-2">
        <button
          type="button"
          onClick={() => setShowOnMap(!showOnMap)}
          className={`flex items-center gap-1.5 border px-2 py-0.5 font-code text-[9px] font-medium uppercase tracking-wider transition-colors ${
            showOnMap
              ? "border-emerald-400/50 bg-emerald-400/10 text-emerald-400"
              : "border-[#1a1a1a] text-zinc-600"
          }`}
        >
          <Icon icon="eye-open" size={10} />
          MAP
        </button>
        <div className="flex items-center gap-1">
          <span className="font-code text-[9px] text-zinc-600">SHOW</span>
          {DISPLAY_LIMITS.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setLimit(n)}
              className={`border px-1.5 py-0.5 font-code text-[9px] transition-colors ${
                limit === n
                  ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-400"
                  : "border-[#1a1a1a] text-zinc-600 hover:text-zinc-400"
              }`}
            >
              {n}
            </button>
          ))}
        </div>
      </div>

      {/* Header */}
      <div className="flex-shrink-0 border-b border-[#1a1a1a] px-3 py-1.5">
        <div className="flex items-center justify-between">
          <span className="font-code text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
            LIVE VESSELS
          </span>
          <span className="font-code text-[9px] text-zinc-600">
            {limited.length} / {filtered.length}
          </span>
        </div>
      </div>

      {/* List */}
      <div className="flex flex-col gap-px p-1">
        {limited.length === 0 ? (
          <div className="border border-dashed border-[#1a1a1a] px-3 py-6 text-center font-code text-[10px] text-zinc-600">
            {vessels.length === 0
              ? "No vessel data for this area. Try Baltico or Europa."
              : "No vessels match filter."}
          </div>
        ) : (
          limited.map((v) => (
            <div
              key={v.mmsi}
              className="flex items-center gap-2.5 border border-[#1a1a1a] bg-white/[0.015] px-2.5 py-1.5 transition-colors hover:border-emerald-400/20 hover:bg-white/[0.03]"
            >
              <span className="text-[12px] text-emerald-400">&#9875;</span>
              <div className="min-w-0 flex-1">
                <div className="font-code text-[10px] font-medium text-sda-text-primary">
                  {v.name || `MMSI ${v.mmsi}`}
                </div>
                <div className="font-code text-[9px] text-zinc-600">
                  {v.latitude.toFixed(2)}°, {v.longitude.toFixed(2)}°
                  {v.speed_knots != null
                    ? ` ${v.speed_knots.toFixed(1)}kn`
                    : ""}
                  {v.destination ? ` → ${v.destination}` : ""}
                </div>
              </div>
            </div>
          ))
        )}
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
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  const fetchSessions = useCallback(() => {
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
  }, []);

  useEffect(() => {
    return fetchSessions();
  }, [currentSessionId, fetchSessions]);

  const handleDelete = async (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation();
    try {
      await sandboxApi.deleteSession(sessionId);
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
    } catch {
      /* swallow */
    }
  };

  const handleRenameStart = (e: React.MouseEvent, session: SandboxSessionSummary) => {
    e.stopPropagation();
    setEditingId(session.id);
    setEditName(session.name);
  };

  const handleRenameSubmit = async (sessionId: string) => {
    const trimmed = editName.trim();
    if (!trimmed) {
      setEditingId(null);
      return;
    }
    try {
      await sandboxApi.renameSession(sessionId, trimmed);
      setSessions((prev) =>
        prev.map((s) => (s.id === sessionId ? { ...s, name: trimmed } : s)),
      );
    } catch {
      /* swallow */
    }
    setEditingId(null);
  };

  const others = sessions.filter((s) => s.id !== currentSessionId);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-6">
        <Spinner size={24} />
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden p-3">
      <div className="mb-3 flex items-center justify-between">
        <span className="font-code text-[10px] font-semibold uppercase tracking-wider text-sda-accent-cyan/50">
          // OPERATION ARCHIVE
        </span>
        <span className="font-code text-[9px] text-zinc-600">
          {sessions.length}
        </span>
      </div>

      {others.length === 0 ? (
        <div className="border border-dashed border-[#1a1a1a] px-3 py-4 text-center font-code text-[10px] text-zinc-600">
          No saved operations.
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto pr-1">
          {others.map((s) => (
            <div
              key={s.id}
              className="group border border-[#1a1a1a] bg-white/[0.015] px-3 py-2 transition-colors hover:border-sda-accent-cyan/30 hover:bg-white/[0.03]"
            >
              {editingId === s.id ? (
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void handleRenameSubmit(s.id);
                    if (e.key === "Escape") setEditingId(null);
                  }}
                  onBlur={() => void handleRenameSubmit(s.id)}
                  autoFocus
                  className="w-full border border-sda-accent-cyan/30 bg-[#0a0a0a] px-1.5 py-0.5 font-code text-[10px] text-sda-text-primary outline-none"
                />
              ) : (
                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => onLoadSession(s.id)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <div className="truncate font-code text-[10px] font-medium text-sda-text-primary">
                      {s.name}
                    </div>
                  </button>
                  <div className="ml-2 flex flex-shrink-0 items-center gap-3 opacity-0 transition-opacity group-hover:opacity-100">
                    <Button
                      small
                      minimal
                      icon="edit"
                      title="Rename"
                      onClick={(e: React.MouseEvent) => handleRenameStart(e, s)}
                      className="!min-h-0 !min-w-0 !p-0.5 text-zinc-600 hover:text-sda-accent-cyan"
                    />
                    <Button
                      small
                      minimal
                      icon="trash"
                      title="Delete"
                      onClick={(e: React.MouseEvent) => void handleDelete(e, s.id)}
                      className="!min-h-0 !min-w-0 !p-0.5 text-zinc-600 hover:text-red-400"
                    />
                  </div>
                </div>
              )}
              <div className="flex items-center gap-2 font-code text-[9px] text-zinc-600">
                <span>{s.actor_count} units</span>
                <span className="uppercase">{s.status}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// --------------- GROUND PLANNING TAB ---------------

const MARKER_TYPE_OPTIONS: { label: string; value: TacticalMarkerType }[] = [
  { label: "Objective (OBJ)", value: "objective" },
  { label: "Rally Point (RP)", value: "rally_point" },
  { label: "Observation Post (OP)", value: "op" },
  { label: "Headquarters (HQ)", value: "hq" },
  { label: "Checkpoint (CP)", value: "checkpoint" },
];

const ROUTE_TYPE_OPTIONS: { label: string; value: TacticalRouteType }[] = [
  { label: "Attack Axis", value: "attack_axis" },
  { label: "Retreat Route", value: "retreat_route" },
  { label: "Patrol Route", value: "patrol_route" },
  { label: "Supply Route", value: "supply_route" },
  { label: "Phase Line", value: "phase_line" },
];

const AREA_TYPE_OPTIONS: { label: string; value: TacticalAreaType }[] = [
  { label: "Area of Operations", value: "ao" },
  { label: "Kill Zone", value: "kill_zone" },
  { label: "Safe Zone", value: "safe_zone" },
  { label: "Restricted Area", value: "restricted" },
  { label: "Objective Area", value: "objective_area" },
];

const GROUND_TOOL_ICONS: Record<string, IconName> = {
  place_marker: "map-marker",
  draw_route: "route",
  draw_area: "polygon-filter",
};

function GroundPlanningTab({
  actors,
  interactionMode,
  onSetInteractionMode,
}: {
  actors: SandboxActor[];
  interactionMode: SandboxInteractionMode;
  onSetInteractionMode: (
    mode: SandboxInteractionMode,
    template?: SandboxTemplateDraft,
  ) => void;
}) {
  const groundPlan = useSandboxStore((s) => s.groundPlan);
  const scenarioItems = useSandboxStore((s) => s.snapshot?.scenario_items ?? []);
  const groundDrawingConfig = useSandboxStore((s) => s.groundDrawingConfig);
  const setGroundDrawingConfig = useSandboxStore((s) => s.setGroundDrawingConfig);
  const removeTacticalElement = useSandboxStore((s) => s.removeTacticalElement);
  const clearGroundPlan = useSandboxStore((s) => s.clearGroundPlan);
  const drawingPoints = useSandboxStore((s) => s.drawingPoints);

  // Count chat-created tactical items from scenario_items
  const chatMarkers = scenarioItems.filter((i) => i.source_type === "tactical_marker");
  const chatRoutes = scenarioItems.filter((i) => i.source_type === "tactical_route");
  const chatAreas = scenarioItems.filter((i) => i.source_type === "tactical_area");

  const isDrawing =
    interactionMode === "place_marker" ||
    interactionMode === "draw_route" ||
    interactionMode === "draw_area";

  const totalElements =
    groundPlan.markers.length + groundPlan.routes.length + groundPlan.areas.length +
    chatMarkers.length + chatRoutes.length + chatAreas.length;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto">
      {/* PLANNING TOOLS */}
      <div className="flex-shrink-0 border-b border-[#1a1a1a] p-4">
        <div className="mb-3 font-code text-[10px] font-semibold uppercase tracking-wider text-sda-accent-cyan/50">
          // PLANNING TOOLS
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          {(
            [
              { mode: "place_marker" as const, label: "MARKER" },
              { mode: "draw_route" as const, label: "ROUTE" },
              { mode: "draw_area" as const, label: "AREA" },
            ] as const
          ).map(({ mode, label }) => (
            <button
              key={mode}
              type="button"
              onClick={() =>
                onSetInteractionMode(interactionMode === mode ? "idle" : mode)
              }
              className={`flex flex-col items-center gap-1.5 border px-2 py-2.5 font-code text-[10px] uppercase tracking-wider transition-colors ${
                interactionMode === mode
                  ? "border-sda-accent-cyan/50 bg-sda-accent-cyan/[0.1] text-sda-accent-cyan"
                  : "border-[#1a1a1a] bg-white/[0.02] text-zinc-500 hover:border-sda-accent-cyan/30 hover:text-zinc-300"
              }`}
            >
              <Icon
                icon={GROUND_TOOL_ICONS[mode]}
                size={14}
                className={
                  interactionMode === mode ? "text-sda-accent-cyan" : "text-zinc-600"
                }
              />
              {label}
            </button>
          ))}
        </div>

        {isDrawing && (
          <div className="mt-2 border-l-2 border-l-sda-accent-cyan/50 bg-sda-accent-cyan/[0.04] px-2.5 py-1.5 font-code text-[10px] text-sda-accent-cyan">
            {interactionMode === "place_marker" && "Click globe to place marker."}
            {interactionMode === "draw_route" &&
              `Click to add waypoints (${drawingPoints.length} pts). Use FINISH in toolbar.`}
            {interactionMode === "draw_area" &&
              `Click to add vertices (${drawingPoints.length} pts). Use FINISH in toolbar.`}
          </div>
        )}
      </div>

      {/* CONFIGURATION */}
      <div className="flex-shrink-0 border-b border-[#1a1a1a] p-4">
        <div className="mb-3 font-code text-[10px] font-semibold uppercase tracking-wider text-sda-accent-cyan/50">
          // CONFIGURATION
        </div>
        <div className="flex flex-col gap-2.5">
          <div>
            <div className="mb-1 font-code text-[9px] uppercase tracking-wider text-zinc-600">
              LABEL
            </div>
            <InputGroup
              small
              fill
              value={groundDrawingConfig.label}
              onChange={(e) => setGroundDrawingConfig({ label: e.target.value })}
              placeholder="Element label..."
            />
          </div>

          <div>
            <div className="mb-1 font-code text-[9px] uppercase tracking-wider text-zinc-600">
              FACTION
            </div>
            <HTMLSelect
              fill
              value={groundDrawingConfig.faction}
              onChange={(e) =>
                setGroundDrawingConfig({
                  faction: e.target.value as GroundDrawingConfig["faction"],
                })
              }
              options={["allied", "hostile", "neutral", "unknown"]}
            />
          </div>

          {(interactionMode === "place_marker" || !isDrawing) && (
            <div>
              <div className="mb-1 font-code text-[9px] uppercase tracking-wider text-zinc-600">
                MARKER TYPE
              </div>
              <HTMLSelect
                fill
                value={groundDrawingConfig.markerType}
                onChange={(e) =>
                  setGroundDrawingConfig({
                    markerType: e.target.value as TacticalMarkerType,
                  })
                }
                options={MARKER_TYPE_OPTIONS}
              />
            </div>
          )}

          {interactionMode === "draw_route" && (
            <div>
              <div className="mb-1 font-code text-[9px] uppercase tracking-wider text-zinc-600">
                ROUTE TYPE
              </div>
              <HTMLSelect
                fill
                value={groundDrawingConfig.routeType}
                onChange={(e) =>
                  setGroundDrawingConfig({
                    routeType: e.target.value as TacticalRouteType,
                  })
                }
                options={ROUTE_TYPE_OPTIONS}
              />
            </div>
          )}

          {interactionMode === "draw_area" && (
            <div>
              <div className="mb-1 font-code text-[9px] uppercase tracking-wider text-zinc-600">
                AREA TYPE
              </div>
              <HTMLSelect
                fill
                value={groundDrawingConfig.areaType}
                onChange={(e) =>
                  setGroundDrawingConfig({
                    areaType: e.target.value as TacticalAreaType,
                  })
                }
                options={AREA_TYPE_OPTIONS}
              />
            </div>
          )}
        </div>
      </div>

      {/* GROUND PLAN ELEMENTS */}
      <div className="flex min-h-0 flex-1 flex-col p-4">
        <div className="mb-3 flex items-center justify-between">
          <span className="font-code text-[10px] font-semibold uppercase tracking-wider text-sda-accent-cyan/50">
            // GROUND PLAN
          </span>
          <div className="flex items-center gap-2">
            <span className="font-code text-[9px] tracking-wider text-zinc-600">
              {totalElements}
            </span>
            {totalElements > 0 && (
              <Button
                small
                minimal
                icon="trash"
                intent="danger"
                title="Clear all"
                onClick={clearGroundPlan}
              />
            )}
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto pr-1">
          {totalElements === 0 ? (
            <div className="border border-dashed border-[#1a1a1a] px-3 py-3 text-center font-code text-[10px] text-zinc-600">
              No elements placed. Select a tool above.
            </div>
          ) : (
            <>
              {groundPlan.markers.map((m) => (
                <div
                  key={m.id}
                  className="flex items-center justify-between border border-[#1a1a1a] bg-white/[0.015] px-2.5 py-1.5"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Icon icon="map-marker" size={10} className="text-zinc-600" />
                      <span className="font-code text-[10px] text-sda-text-primary">
                        {m.label || m.markerType.replace("_", " ").toUpperCase()}
                      </span>
                    </div>
                    <div className="ml-[18px] font-code text-[9px] text-zinc-600">
                      {m.position.lat.toFixed(3)}, {m.position.lon.toFixed(3)}
                    </div>
                  </div>
                  <Button
                    small
                    minimal
                    icon="cross"
                    onClick={() => removeTacticalElement("marker", m.id)}
                  />
                </div>
              ))}
              {groundPlan.routes.map((r) => (
                <div
                  key={r.id}
                  className="flex items-center justify-between border border-[#1a1a1a] bg-white/[0.015] px-2.5 py-1.5"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Icon icon="route" size={10} className="text-zinc-600" />
                      <span className="font-code text-[10px] text-sda-text-primary">
                        {r.label || r.routeType.replace("_", " ").toUpperCase()}
                      </span>
                    </div>
                    <div className="ml-[18px] font-code text-[9px] text-zinc-600">
                      {r.points.length} waypoints
                    </div>
                  </div>
                  <Button
                    small
                    minimal
                    icon="cross"
                    onClick={() => removeTacticalElement("route", r.id)}
                  />
                </div>
              ))}
              {groundPlan.areas.map((a) => (
                <div
                  key={a.id}
                  className="flex items-center justify-between border border-[#1a1a1a] bg-white/[0.015] px-2.5 py-1.5"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Icon icon="polygon-filter" size={10} className="text-zinc-600" />
                      <span className="font-code text-[10px] text-sda-text-primary">
                        {a.label || a.areaType.replace("_", " ").toUpperCase()}
                      </span>
                    </div>
                    <div className="ml-[18px] font-code text-[9px] text-zinc-600">
                      {a.vertices.length} vertices
                    </div>
                  </div>
                  <Button
                    small
                    minimal
                    icon="cross"
                    onClick={() => removeTacticalElement("area", a.id)}
                  />
                </div>
              ))}
              {/* Chat-created tactical items */}
              {chatMarkers.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between border border-amber-500/20 bg-amber-500/[0.03] px-2.5 py-1.5"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Icon icon="map-marker" size={10} className="text-amber-600" />
                      <span className="font-code text-[10px] text-sda-text-primary">
                        {item.label}
                      </span>
                    </div>
                    <div className="ml-[18px] font-code text-[9px] text-amber-600/60">
                      CHAT &middot; {String((item.payload as Record<string, unknown>).marker_type ?? "marker").replace("_", " ")}
                    </div>
                  </div>
                </div>
              ))}
              {chatRoutes.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between border border-amber-500/20 bg-amber-500/[0.03] px-2.5 py-1.5"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Icon icon="route" size={10} className="text-amber-600" />
                      <span className="font-code text-[10px] text-sda-text-primary">
                        {item.label}
                      </span>
                    </div>
                    <div className="ml-[18px] font-code text-[9px] text-amber-600/60">
                      CHAT &middot; {String((item.payload as Record<string, unknown>).route_type ?? "route").replace("_", " ")}
                    </div>
                  </div>
                </div>
              ))}
              {chatAreas.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between border border-amber-500/20 bg-amber-500/[0.03] px-2.5 py-1.5"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Icon icon="polygon-filter" size={10} className="text-amber-600" />
                      <span className="font-code text-[10px] text-sda-text-primary">
                        {item.label}
                      </span>
                    </div>
                    <div className="ml-[18px] font-code text-[9px] text-amber-600/60">
                      CHAT &middot; {String((item.payload as Record<string, unknown>).area_type ?? "area").replace("_", " ")}
                    </div>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>

        {totalElements > 0 && (
          <div className="mt-3 flex-shrink-0">
            <button
              type="button"
              onClick={() => {
                const json = JSON.stringify(groundPlan, null, 2);
                const blob = new Blob([json], { type: "application/json" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `ground-plan-${Date.now()}.json`;
                a.click();
                URL.revokeObjectURL(url);
              }}
              className="flex w-full items-center justify-center gap-1.5 border border-[#1a1a1a] bg-white/[0.02] px-3 py-1.5 font-code text-[10px] uppercase tracking-wider text-zinc-500 transition-colors hover:border-sda-accent-cyan/30 hover:text-zinc-300"
            >
              <Icon icon="export" size={10} />
              EXPORT GROUND PLAN
            </button>
          </div>
        )}
      </div>

      {/* ZONE PLANNING */}
      <div className="flex-shrink-0 border-b border-[#1a1a1a] p-4">
        <div className="mb-3 font-code text-[10px] font-semibold uppercase tracking-wider text-sda-accent-cyan/50">
          // ZONE PLANNING
        </div>
        <ZonePlanningPanel
          actors={actors}
          interactionMode={interactionMode}
          onSetInteractionMode={onSetInteractionMode}
        />
      </div>

      {/* OVERLAY MANAGER */}
      <div className="flex-shrink-0 p-4">
        <div className="mb-3 font-code text-[10px] font-semibold uppercase tracking-wider text-sda-accent-cyan/50">
          // OVERLAYS
        </div>
        <OverlayManager />
      </div>
    </div>
  );
}
