'use client';

import { useCallback, useEffect, useRef, useState, type DragEvent } from 'react';
import dynamic from 'next/dynamic';
import { Button, Icon, Spinner } from '@blueprintjs/core';

import {
  api,
  type ConjunctionEvent,
  type GroundStation,
  type PositionReport,
  type SatelliteDetail,
} from '@/lib/api';
import { sandboxApi } from '@/lib/api/sandbox';
import { getCesium, type CesiumModule } from '@/lib/cesium/loader';
import { cesiumController } from '@/lib/cesium/controller';
import { SandboxActorLayer } from '@/components/Sandbox/SandboxActorLayer';
import { SandboxChatPanel } from '@/components/Sandbox/SandboxChatPanel';
import {
  SandboxContextPanel,
  buildEditorState,
  type ActorEditorState,
} from '@/components/Sandbox/SandboxContextPanel';
import {
  useSandboxStore,
  buildChatMessage,
  type SandboxActor,
  type SandboxInteractionMode,
  type SandboxPosition,
  type SandboxSnapshot,
  type SandboxTemplateDraft,
} from '@/lib/store/sandbox';

const CesiumViewer = dynamic(
  () =>
    import('@/components/CesiumMap/CesiumViewer').then((m) => ({
      default: m.CesiumViewer,
    })),
  { ssr: false },
);

// --------------- HELPERS ---------------

function getActorPosition(actor: SandboxActor | null): SandboxPosition {
  const pos = (actor?.state.position as Record<string, unknown> | undefined) ?? {};
  return {
    lat: Number(pos.lat ?? 0),
    lon: Number(pos.lon ?? 0),
    alt_m: Number(pos.alt_m ?? 0),
  };
}

async function screenToPosition(
  viewer: InstanceType<CesiumModule['Viewer']>,
  clientX: number,
  clientY: number,
): Promise<SandboxPosition | null> {
  const Cesium = await getCesium();
  const rect = viewer.canvas.getBoundingClientRect();
  const sp = new Cesium.Cartesian2(clientX - rect.left, clientY - rect.top);
  const picked =
    viewer.camera.pickEllipsoid(sp, viewer.scene.globe.ellipsoid) ??
    (viewer.scene.pickPositionSupported ? viewer.scene.pickPosition(sp) : undefined);
  if (!picked) return null;
  const carto = Cesium.Cartographic.fromCartesian(picked);
  if (!carto) return null;
  return {
    lat: Cesium.Math.toDegrees(carto.latitude),
    lon: Cesium.Math.toDegrees(carto.longitude),
    alt_m: Math.max(0, carto.height || 0),
  };
}

function buildActorPayload(template: SandboxTemplateDraft, position: SandboxPosition) {
  const state: Record<string, unknown> = { position };

  if (template.actorType === 'satellite') {
    state.position = { ...position, alt_m: 500_000 };
    state.orbit = { mode: 'pseudo' };
  } else if (template.actorType === 'aircraft') {
    state.position = { ...position, alt_m: 8_500 };
    state.speed_ms = 220;
    state.heading_deg = 0;
  } else if (template.actorType === 'ground_vehicle') {
    state.speed_ms = 18;
    state.heading_deg = 0;
  } else if (template.actorType === 'ship') {
    state.speed_ms = 12;
    state.heading_deg = 0;
  }

  return {
    actor_class: template.actorClass,
    actor_type: template.actorType,
    label: template.label,
    faction: template.faction,
    state,
    behavior: template.behavior ?? { type: 'hold' },
    capabilities: template.capabilities ?? {},
    visual_config: template.visualConfig ?? {},
  };
}

// --------------- PAGE ---------------

export default function SandboxPage() {
  // URL params
  const [initialPrompt, setInitialPrompt] = useState('');
  const [handoffSatelliteIds, setHandoffSatelliteIds] = useState<string[]>([]);
  const [searchParamsReady, setSearchParamsReady] = useState(false);

  // Store
  const snapshot = useSandboxStore((s) => s.snapshot);
  const selectedActorId = useSandboxStore((s) => s.selectedActorId);
  const interactionMode = useSandboxStore((s) => s.interactionMode);
  const interactionPayload = useSandboxStore((s) => s.interactionPayload);
  const isBootstrapping = useSandboxStore((s) => s.isBootstrapping);
  const contextPanelOpen = useSandboxStore((s) => s.contextPanelOpen);
  const contextTab = useSandboxStore((s) => s.contextTab);
  const chatMessages = useSandboxStore((s) => s.chatMessages);
  const chatBusy = useSandboxStore((s) => s.chatBusy);
  const hydrateSnapshot = useSandboxStore((s) => s.hydrateSnapshot);
  const selectActor = useSandboxStore((s) => s.selectActor);
  const setInteractionMode = useSandboxStore((s) => s.setInteractionMode);
  const setBootstrapping = useSandboxStore((s) => s.setBootstrapping);
  const setContextPanelOpen = useSandboxStore((s) => s.setContextPanelOpen);
  const setContextTab = useSandboxStore((s) => s.setContextTab);
  const appendChat = useSandboxStore((s) => s.appendChat);
  const setChatBusy = useSandboxStore((s) => s.setChatBusy);
  const resetStore = useSandboxStore((s) => s.reset);

  // Local state
  const [viewer, setViewer] = useState<InstanceType<CesiumModule['Viewer']> | null>(null);
  const [chatInput, setChatInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [placingBusy, setPlacingBusy] = useState(false);
  const [liveSatellites, setLiveSatellites] = useState<SatelliteDetail[]>([]);
  const [liveStations, setLiveStations] = useState<GroundStation[]>([]);
  const [liveVehicles, setLiveVehicles] = useState<PositionReport[]>([]);
  const [liveConjunctions, setLiveConjunctions] = useState<ConjunctionEvent[]>([]);

  const bootstrappedRef = useRef(false);
  const initialPromptHandledRef = useRef(false);
  const tickInFlightRef = useRef(false);

  const sessionId = snapshot?.session.id ?? null;

  // --------------- CALLBACKS ---------------

  const refreshSession = useCallback(
    (next: SandboxSnapshot) => {
      hydrateSnapshot(next);
    },
    [hydrateSnapshot],
  );

  const loadLiveImports = useCallback(async () => {
    const [sats, stations, vehicles, conj] = await Promise.all([
      api.getSatellitesWithOrbits(),
      api.getGroundStations({ page_size: 50 }),
      api.getGroundVehicles(),
      api.getConjunctions({ page_size: 20 }),
    ]);
    setLiveSatellites(sats);
    setLiveStations(stations.items);
    setLiveVehicles(vehicles.items);
    setLiveConjunctions(conj.items);
  }, []);

  const sendPrompt = useCallback(
    async (prompt: string) => {
      if (!sessionId || !prompt.trim()) return;
      setChatBusy(true);
      setError(null);
      appendChat(buildChatMessage('user', prompt));
      try {
        const resp = await sandboxApi.compileChat(sessionId, prompt);
        refreshSession(resp.snapshot);
        appendChat(buildChatMessage('assistant', resp.message));
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Chat failed';
        setError(msg);
        appendChat(buildChatMessage('assistant', `Error: ${msg}`));
      } finally {
        setChatBusy(false);
        setChatInput('');
      }
    },
    [appendChat, refreshSession, sessionId, setChatBusy],
  );

  const handleControl = useCallback(
    async (action: 'start' | 'pause' | 'resume' | 'reset' | 'set_speed', multiplier?: number) => {
      if (!sessionId) return;
      try {
        const next = await sandboxApi.controlSession(sessionId, {
          action,
          time_multiplier: multiplier,
        });
        refreshSession(next);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Control failed');
      }
    },
    [refreshSession, sessionId],
  );

  const handleFlyToActor = useCallback((actor: SandboxActor) => {
    const pos = getActorPosition(actor);
    cesiumController.dispatch({
      type: 'cesium.flyTo',
      payload: {
        longitude: pos.lon,
        latitude: pos.lat,
        altitude: Math.max(pos.alt_m + 25_000, 25_000),
      },
    });
  }, []);

  const handleResetView = useCallback(() => {
    cesiumController.dispatch({ type: 'cesium.resetView', payload: {} });
    selectActor(null);
  }, [selectActor]);

  const handleDeleteActor = useCallback(
    async (actor: SandboxActor) => {
      if (!sessionId) return;
      try {
        selectActor(null);
        const next = await sandboxApi.deleteActor(sessionId, actor.id);
        refreshSession(next);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Delete failed');
      }
    },
    [refreshSession, selectActor, sessionId],
  );

  const handleSaveActor = useCallback(
    async (actorId: string, data: ActorEditorState) => {
      if (!sessionId) return;
      const actor = snapshot?.actors.find((a) => a.id === actorId);
      if (!actor) return;

      const lat = Number(data.lat);
      const lon = Number(data.lon);
      const alt = Number(data.alt_m || 0);
      if (!isFinite(lat) || !isFinite(lon)) {
        setError('Invalid lat/lon values');
        return;
      }

      const nextState: Record<string, unknown> = {
        ...(actor.state as Record<string, unknown>),
        position: { lat, lon, alt_m: alt },
        speed_ms: Number(data.speed_ms || 0),
        heading_deg: Number(data.heading_deg || 0),
      };

      // Build clean behavior
      let nextBehavior: Record<string, unknown> = { type: data.behaviorType };
      if (data.behaviorType === 'move_to' || data.behaviorType === 'approach_target') {
        const tLat = Number(data.moveTargetLat);
        const tLon = Number(data.moveTargetLon);
        if (isFinite(tLat) && isFinite(tLon)) {
          nextBehavior.target = { lat: tLat, lon: tLon, alt_m: alt };
          nextBehavior.speed_ms = Number(data.speed_ms || 250);
        }
      } else if (data.behaviorType === 'patrol_loop' || data.behaviorType === 'follow_waypoints') {
        // Preserve existing waypoints
        const existingBehavior = actor.behavior as Record<string, unknown>;
        if (existingBehavior.waypoints) {
          nextBehavior.waypoints = existingBehavior.waypoints;
          nextBehavior.current_waypoint_index = existingBehavior.current_waypoint_index ?? 0;
          nextBehavior.speed_ms = Number(data.speed_ms || 250);
        }
      }

      try {
        const next = await sandboxApi.updateActor(sessionId, actorId, {
          label: data.label,
          faction: data.faction,
          state: nextState,
          behavior: nextBehavior,
          capabilities: actor.capabilities as Record<string, unknown>,
          visual_config: actor.visual_config as Record<string, unknown>,
        });
        refreshSession(next);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Save failed');
      }
    },
    [refreshSession, sessionId, snapshot?.actors],
  );

  const handleImportLive = useCallback(
    async (sourceType: string, sourceId: string) => {
      if (!sessionId) return;
      try {
        const next = await sandboxApi.importLiveObject(sessionId, {
          source_type: sourceType as 'satellite' | 'ground_station' | 'ground_vehicle' | 'conjunction',
          source_id: sourceId,
        });
        refreshSession(next);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Import failed');
      }
    },
    [refreshSession, sessionId],
  );

  const handleImportTLE = useCallback(
    async (tleText: string, label?: string, faction?: string) => {
      if (!sessionId) return;
      try {
        const next = await sandboxApi.importTLE(sessionId, { tle_text: tleText, label, faction });
        refreshSession(next);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'TLE import failed');
      }
    },
    [refreshSession, sessionId],
  );

  const handleActorSelect = useCallback(
    (actorId: string | null) => {
      selectActor(actorId);
      // If we were in a placement mode, cancel it
      if (interactionMode !== 'idle') {
        setInteractionMode('idle');
      }
    },
    [interactionMode, selectActor, setInteractionMode],
  );

  const handleSetInteractionMode = useCallback(
    (mode: SandboxInteractionMode, template?: SandboxTemplateDraft) => {
      setInteractionMode(mode, template ?? null);
    },
    [setInteractionMode],
  );

  const handleRelocateActor = useCallback(
    (actorId: string) => {
      selectActor(actorId);
      setInteractionMode('relocate_actor');
    },
    [selectActor, setInteractionMode],
  );

  const handleSetMoveTarget = useCallback(
    (actorId: string) => {
      selectActor(actorId);
      setInteractionMode('set_move_target');
    },
    [selectActor, setInteractionMode],
  );

  // --------------- EFFECTS ---------------

  // Read URL params
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setInitialPrompt(params.get('prompt')?.trim() ?? '');
    setHandoffSatelliteIds(
      (params.get('satelliteIds') ?? '')
        .split(',')
        .map((v) => v.trim())
        .filter(Boolean),
    );
    setSearchParamsReady(true);
  }, []);

  // Cleanup on unmount
  useEffect(() => () => resetStore(), [resetStore]);

  // Bootstrap session
  useEffect(() => {
    if (!searchParamsReady || bootstrappedRef.current) return;
    bootstrappedRef.current = true;

    const bootstrap = async () => {
      setBootstrapping(true);
      setError(null);
      try {
        let snap = await sandboxApi.createSession({
          initial_prompt: initialPrompt || undefined,
          name: initialPrompt ? 'Sandbox from map handoff' : 'Untitled Sandbox',
          is_saved: false,
        });
        refreshSession(snap);
        void loadLiveImports();

        if (handoffSatelliteIds.length > 0) {
          for (const sid of handoffSatelliteIds) {
            snap = await sandboxApi.importLiveObject(snap.session.id, {
              source_type: 'satellite',
              source_id: sid,
            });
          }
          refreshSession(snap);
        }

        if (initialPrompt && !initialPromptHandledRef.current) {
          initialPromptHandledRef.current = true;
          setChatBusy(true);
          appendChat(buildChatMessage('user', initialPrompt));
          try {
            const resp = await sandboxApi.compileChat(snap.session.id, initialPrompt);
            refreshSession(resp.snapshot);
            appendChat(buildChatMessage('assistant', resp.message));
          } catch (err) {
            appendChat(
              buildChatMessage('assistant', `Error: ${err instanceof Error ? err.message : 'Failed'}`),
            );
          } finally {
            setChatBusy(false);
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Bootstrap failed');
      } finally {
        setBootstrapping(false);
      }
    };

    void bootstrap();
  }, [
    appendChat,
    handoffSatelliteIds,
    initialPrompt,
    loadLiveImports,
    refreshSession,
    searchParamsReady,
    setBootstrapping,
    setChatBusy,
  ]);

  // Initialize cesium controller
  useEffect(() => {
    if (!viewer) return;
    void cesiumController.initialize(viewer);
  }, [viewer]);

  // Map click handler for placement/relocation/target setting
  useEffect(() => {
    if (!viewer || !sessionId) return;

    let cancelled = false;
    let handler: InstanceType<CesiumModule['ScreenSpaceEventHandler']> | null = null;

    const attach = async () => {
      const Cesium = await getCesium();
      if (cancelled) return;

      handler = new Cesium.ScreenSpaceEventHandler(viewer.canvas);
      handler.setInputAction(
        async (movement: { position?: { x: number; y: number } }) => {
          if (!movement.position || placingBusy) return;

          // Only handle if we're in a placement/relocation mode
          if (interactionMode === 'idle') return;

          const position = await screenToPosition(viewer, movement.position.x, movement.position.y);
          if (!position) {
            setError('Could not resolve map position.');
            return;
          }

          setPlacingBusy(true);
          setError(null);

          try {
            if (interactionMode === 'place_template' && interactionPayload) {
              const next = await sandboxApi.createActor(
                sessionId,
                buildActorPayload(interactionPayload, position),
              );
              refreshSession(next);
              setInteractionMode('idle');
            } else if (interactionMode === 'relocate_actor' && selectedActorId) {
              const actor = snapshot?.actors.find((a) => a.id === selectedActorId);
              if (actor) {
                const nextState = { ...(actor.state as Record<string, unknown>), position };
                const next = await sandboxApi.updateActor(sessionId, selectedActorId, {
                  state: nextState,
                });
                refreshSession(next);
              }
              setInteractionMode('idle');
            } else if (interactionMode === 'set_move_target' && selectedActorId) {
              const actor = snapshot?.actors.find((a) => a.id === selectedActorId);
              if (actor) {
                const speed = Number(actor.state.speed_ms ?? 250);
                const next = await sandboxApi.updateActor(sessionId, selectedActorId, {
                  behavior: {
                    type: 'move_to',
                    target: { lat: position.lat, lon: position.lon, alt_m: position.alt_m },
                    speed_ms: speed || 250,
                  },
                });
                refreshSession(next);
              }
              setInteractionMode('idle');
            }
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Placement failed');
          } finally {
            setPlacingBusy(false);
          }
        },
        Cesium.ScreenSpaceEventType.LEFT_CLICK,
      );
    };

    void attach();
    return () => {
      cancelled = true;
      handler?.destroy();
    };
  }, [
    interactionMode,
    interactionPayload,
    placingBusy,
    refreshSession,
    selectedActorId,
    sessionId,
    setInteractionMode,
    snapshot?.actors,
    viewer,
  ]);

  // Auto-tick when running
  useEffect(() => {
    if (!sessionId || snapshot?.session.status !== 'running') return;

    const interval = window.setInterval(async () => {
      if (tickInFlightRef.current) return;
      tickInFlightRef.current = true;
      try {
        const next = await sandboxApi.tickSession(sessionId, { delta_seconds: 1 });
        refreshSession(next);
      } catch {
        // Swallow tick errors to avoid spamming
      } finally {
        tickInFlightRef.current = false;
      }
    }, 1000);

    return () => window.clearInterval(interval);
  }, [refreshSession, sessionId, snapshot?.session.status]);

  // Globe drop handler
  const handleGlobeDrop = useCallback(
    async (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      if (!viewer || !sessionId) return;

      const templateData = event.dataTransfer.getData('application/x-sandbox-template');
      const importData = event.dataTransfer.getData('application/x-sandbox-import');
      if (!templateData && !importData) return;

      const position = await screenToPosition(viewer, event.clientX, event.clientY);
      if (!position) {
        setError('Could not resolve drop position.');
        return;
      }

      setPlacingBusy(true);
      setError(null);

      try {
        if (templateData) {
          const template = JSON.parse(templateData) as SandboxTemplateDraft;
          const next = await sandboxApi.createActor(sessionId, buildActorPayload(template, position));
          refreshSession(next);
        } else if (importData) {
          const data = JSON.parse(importData) as {
            source_type: 'satellite' | 'ground_station' | 'ground_vehicle' | 'conjunction';
            source_id: string;
          };
          if (data.source_type === 'conjunction') {
            setError('Conjunction drop not supported on the globe. Use chat to describe scenarios.');
            return;
          }
          const next = await sandboxApi.importLiveObject(sessionId, { ...data, drop_position: position });
          refreshSession(next);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Drop failed');
      } finally {
        setPlacingBusy(false);
      }
    },
    [refreshSession, sessionId, viewer],
  );

  const handleLoadSession = useCallback(
    async (targetSessionId: string) => {
      try {
        setError(null);
        const snap = await sandboxApi.getSession(targetSessionId);
        refreshSession(snap);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load session');
      }
    },
    [refreshSession],
  );

  // --------------- RENDER ---------------

  if (isBootstrapping && !snapshot) {
    return (
      <div className="flex h-[calc(100vh-7.5rem)] items-center justify-center">
        <Spinner size={50} />
      </div>
    );
  }

  const actors = snapshot?.actors ?? [];

  return (
    <div
      className={`grid h-[calc(100vh-7.5rem)] gap-0 ${
        contextPanelOpen
          ? 'grid-cols-[minmax(320px,380px)_minmax(0,1fr)_340px]'
          : 'grid-cols-[minmax(320px,380px)_minmax(0,1fr)]'
      }`}
    >
      {/* LEFT: Chat panel */}
      <div className="min-h-0 overflow-hidden border-r border-sda-border-default">
        <SandboxChatPanel
          session={snapshot?.session ?? null}
          messages={chatMessages}
          input={chatInput}
          isSubmitting={chatBusy}
          actorCount={actors.length}
          onInputChange={setChatInput}
          onSubmit={() => sendPrompt(chatInput)}
          onControl={handleControl}
          onQuickPrompt={(p) => void sendPrompt(p)}
        />
      </div>

      {/* CENTER: Globe */}
      <div className="relative min-h-0 overflow-hidden">
        <div
          className="absolute inset-0"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => void handleGlobeDrop(e)}
        >
          <CesiumViewer className="h-full w-full" onViewerReady={setViewer} />
          {viewer && snapshot && (
            <SandboxActorLayer
              viewer={viewer}
              actors={actors}
              selectedActorId={selectedActorId}
              onSelectActor={handleActorSelect}
            />
          )}
        </div>

        {/* Globe overlay: top-left info */}
        <div className="pointer-events-none absolute left-3 top-3 flex flex-col gap-2">
          {interactionMode !== 'idle' && (
            <div className="pointer-events-auto rounded-md border border-sda-accent-cyan/40 bg-sda-bg-secondary/90 px-3 py-2 text-sm text-sda-accent-cyan">
              {interactionMode === 'place_template' && `Click to place ${interactionPayload?.label ?? 'template'}`}
              {interactionMode === 'relocate_actor' && 'Click to relocate the selected actor'}
              {interactionMode === 'set_move_target' && 'Click to set movement target'}
              {interactionMode === 'add_waypoint' && 'Click to add a waypoint'}
              <Button
                small
                minimal
                icon="cross"
                className="ml-2"
                onClick={() => setInteractionMode('idle')}
              />
            </div>
          )}
          {error && (
            <div className="pointer-events-auto rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">
              {error}
              <Button small minimal icon="cross" className="ml-2" onClick={() => setError(null)} />
            </div>
          )}
        </div>

        {/* Globe overlay: bottom toolbar */}
        <div className="pointer-events-auto absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-lg border border-sda-border-default bg-sda-bg-secondary/90 px-3 py-2 backdrop-blur-sm">
          <Button
            small
            minimal
            icon="globe"
            title="Reset camera view"
            onClick={handleResetView}
          />
          <div className="h-4 w-px bg-sda-border-default" />
          <Button
            small
            minimal
            icon={contextPanelOpen ? 'panel-stats' : 'panel-stats'}
            title={contextPanelOpen ? 'Hide panel' : 'Show panel'}
            onClick={() => setContextPanelOpen(!contextPanelOpen)}
          />
          <div className="h-4 w-px bg-sda-border-default" />
          <div className="text-xs text-sda-text-muted">
            {placingBusy ? 'Applying...' : 'Drop templates or assets onto the globe'}
          </div>
        </div>
      </div>

      {/* RIGHT: Context panel */}
      {contextPanelOpen && (
        <div className="min-h-0 overflow-hidden border-l border-sda-border-default">
          <SandboxContextPanel
            tab={contextTab}
            onTabChange={setContextTab}
            actors={actors}
            selectedActorId={selectedActorId}
            currentSessionId={sessionId}
            interactionMode={interactionMode}
            liveSatellites={liveSatellites}
            liveStations={liveStations}
            liveVehicles={liveVehicles}
            liveConjunctions={liveConjunctions}
            onSelectActor={handleActorSelect}
            onFlyToActor={handleFlyToActor}
            onDeleteActor={handleDeleteActor}
            onSaveActor={handleSaveActor}
            onRelocateActor={handleRelocateActor}
            onSetMoveTarget={handleSetMoveTarget}
            onSetInteractionMode={handleSetInteractionMode}
            onImportLive={handleImportLive}
            onImportTLE={handleImportTLE}
            onLoadSession={handleLoadSession}
          />
        </div>
      )}
    </div>
  );
}
