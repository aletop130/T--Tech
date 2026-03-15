'use client';

import { useCallback, useEffect, useRef, useState, type DragEvent } from 'react';
import dynamic from 'next/dynamic';
import { Button, Spinner } from '@blueprintjs/core';

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
import { TacticalPlanningLayer } from '@/components/CesiumMap/TacticalPlanningLayer';
import { SandboxActorLayer } from '@/components/Sandbox/SandboxActorLayer';
import { SandboxChatPanel } from '@/components/Sandbox/SandboxChatPanel';
import { SandboxTimeline } from '@/components/Sandbox/SandboxTimeline';
import {
  SandboxContextPanel,
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

type SandboxMapTargetBehavior = 'move_to' | 'approach_target';

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
  x: number,
  y: number,
  coordinateSpace: 'canvas' | 'client' = 'client',
): Promise<SandboxPosition | null> {
  const Cesium = await getCesium();
  const rect = viewer.canvas.getBoundingClientRect();
  const canvasX = coordinateSpace === 'client' ? x - rect.left : x;
  const canvasY = coordinateSpace === 'client' ? y - rect.top : y;
  const sp = new Cesium.Cartesian2(canvasX, canvasY);

  let picked =
    viewer.scene.pickPositionSupported ? viewer.scene.pickPosition(sp) : undefined;

  if (!picked) {
    const ray = viewer.camera.getPickRay(sp);
    if (ray) {
      picked = viewer.scene.globe.pick(ray, viewer.scene);
    }
  }

  if (!picked) {
    picked = viewer.camera.pickEllipsoid(sp, viewer.scene.globe.ellipsoid);
  }

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
  const isDrone = template.subtype === 'drone';
  const state: Record<string, unknown> = { position };

  if (template.actorType === 'satellite') {
    state.position = { ...position, alt_m: 500_000 };
    state.orbit = { mode: 'pseudo' };
  } else if (template.actorType === 'aircraft') {
    state.position = { ...position, alt_m: isDrone ? 2_500 : 8_500 };
    state.speed_ms = isDrone ? 85 : 220;
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
    subtype: template.subtype ?? undefined,
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
  const addTacticalMarker = useSandboxStore((s) => s.addTacticalMarker);
  const addTacticalRoute = useSandboxStore((s) => s.addTacticalRoute);
  const addTacticalArea = useSandboxStore((s) => s.addTacticalArea);
  const addDrawingPoint = useSandboxStore((s) => s.addDrawingPoint);
  const clearDrawing = useSandboxStore((s) => s.clearDrawing);
  const drawingPoints = useSandboxStore((s) => s.drawingPoints);
  const groundDrawingConfig = useSandboxStore((s) => s.groundDrawingConfig);

  // Local state
  const [viewer, setViewer] = useState<InstanceType<CesiumModule['Viewer']> | null>(null);
  const [chatInput, setChatInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [placingBusy, setPlacingBusy] = useState(false);
  const [mapTargetBehavior, setMapTargetBehavior] = useState<SandboxMapTargetBehavior>('move_to');
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
      setChatInput('');
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
      }
    },
    [appendChat, refreshSession, sessionId, setChatBusy],
  );

  const handleControl = useCallback(
    async (action: 'start' | 'pause' | 'resume' | 'reset' | 'set_speed' | 'set_duration', value?: number) => {
      if (!sessionId) return;
      try {
        const next = await sandboxApi.controlSession(sessionId, {
          action,
          time_multiplier: action === 'set_speed' ? value : undefined,
          duration_seconds: action === 'set_duration' ? value : undefined,
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
      // Clear drawing state when switching modes
      if (mode !== interactionMode) {
        clearDrawing();
      }
      setInteractionMode(mode, template ?? null);
    },
    [clearDrawing, interactionMode, setInteractionMode],
  );

  const handleFinishDrawing = useCallback(() => {
    const config = groundDrawingConfig;
    const uid = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

    if (interactionMode === 'draw_route' && drawingPoints.length >= 2) {
      addTacticalRoute({
        id: uid,
        routeType: config.routeType,
        label: config.label || config.routeType.replace('_', ' ').toUpperCase(),
        points: [...drawingPoints],
        faction: config.faction,
      });
    } else if (interactionMode === 'draw_area' && drawingPoints.length >= 3) {
      addTacticalArea({
        id: uid,
        areaType: config.areaType,
        label: config.label || config.areaType.replace('_', ' ').toUpperCase(),
        vertices: [...drawingPoints],
        faction: config.faction,
      });
    }

    clearDrawing();
    setInteractionMode('idle');
  }, [addTacticalArea, addTacticalRoute, clearDrawing, drawingPoints, groundDrawingConfig, interactionMode, setInteractionMode]);

  const handleRelocateActor = useCallback(
    (actorId: string) => {
      selectActor(actorId);
      setInteractionMode('relocate_actor');
    },
    [selectActor, setInteractionMode],
  );

  const handleSetMoveTarget = useCallback(
    (actorId: string, behaviorType?: string) => {
      selectActor(actorId);
      setMapTargetBehavior(behaviorType === 'approach_target' ? 'approach_target' : 'move_to');
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

          const position = await screenToPosition(
            viewer,
            movement.position.x,
            movement.position.y,
            'canvas',
          );
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
                const actorPosition = getActorPosition(actor);
                const behavior = (actor.behavior as Record<string, unknown> | undefined) ?? {};
                const speed = Number(behavior.speed_ms ?? actor.state.speed_ms ?? 250);
                const next = await sandboxApi.updateActor(sessionId, selectedActorId, {
                  behavior: {
                    type: mapTargetBehavior,
                    target: {
                      lat: position.lat,
                      lon: position.lon,
                      alt_m: actorPosition.alt_m,
                    },
                    speed_ms: speed || 250,
                  },
                });
                refreshSession(next);
              }
              setInteractionMode('idle');
            } else if (interactionMode === 'place_marker') {
              // Ground planning: place marker instantly
              const config = groundDrawingConfig;
              addTacticalMarker({
                id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                markerType: config.markerType,
                label: config.label || config.markerType.replace('_', ' ').toUpperCase(),
                position,
                faction: config.faction,
              });
              // Stay in place_marker mode for rapid placement
            } else if (interactionMode === 'draw_route' || interactionMode === 'draw_area') {
              // Ground planning: accumulate drawing points
              addDrawingPoint(position);
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
    addDrawingPoint,
    addTacticalMarker,
    groundDrawingConfig,
    interactionMode,
    interactionPayload,
    placingBusy,
    refreshSession,
    selectedActorId,
    sessionId,
    setInteractionMode,
    snapshot?.actors,
    mapTargetBehavior,
    viewer,
  ]);

  // Auto-tick when running — adaptive interval based on speed multiplier
  const speedMultiplier = snapshot?.session.time_multiplier ?? 1;
  useEffect(() => {
    if (!sessionId || snapshot?.session.status !== 'running') return;

    // Higher speeds → faster tick interval for smoother animation
    const tickMs = speedMultiplier >= 50 ? 200 : speedMultiplier >= 10 ? 400 : speedMultiplier >= 5 ? 600 : 1000;
    const deltaSec = tickMs / 1000;

    const interval = window.setInterval(async () => {
      if (tickInFlightRef.current) return;
      tickInFlightRef.current = true;
      try {
        const next = await sandboxApi.tickSession(sessionId, { delta_seconds: deltaSec });
        refreshSession(next);
      } catch {
        // Swallow tick errors to avoid spamming
      } finally {
        tickInFlightRef.current = false;
      }
    }, tickMs);

    return () => window.clearInterval(interval);
  }, [refreshSession, sessionId, snapshot?.session.status, speedMultiplier]);

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
      <div className="flex h-[calc(100vh-7.5rem)] flex-col items-center justify-center gap-3 bg-[#050505]">
        <Spinner size={32} />
        <span className="font-code text-[10px] uppercase tracking-widest text-zinc-600">
          INITIALIZING SANDBOX
        </span>
      </div>
    );
  }

  const actors = snapshot?.actors ?? [];

  return (
    <div className="flex h-[calc(100vh-7.5rem)] flex-col">
      <div
        className={`grid min-h-0 flex-1 gap-0 ${
          contextPanelOpen
            ? 'grid-cols-[minmax(320px,380px)_minmax(0,1fr)_340px]'
            : 'grid-cols-[minmax(320px,380px)_minmax(0,1fr)]'
        }`}
      >
        {/* LEFT: Chat panel */}
        <div className="min-h-0 overflow-hidden border-r border-[#1a1a1a]">
          <SandboxChatPanel
            session={snapshot?.session ?? null}
            messages={chatMessages}
            input={chatInput}
            isSubmitting={chatBusy}
            actorCount={actors.length}
            onInputChange={setChatInput}
            onSubmit={() => sendPrompt(chatInput)}
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
              <>
                <SandboxActorLayer
                  viewer={viewer}
                  actors={actors}
                  selectedActorId={selectedActorId}
                  onSelectActor={handleActorSelect}
                  selectionEnabled={interactionMode === 'idle'}
                />
                <TacticalPlanningLayer viewer={viewer} />
              </>
            )}
          </div>

          {/* Globe overlay: top-left info */}
          <div className="pointer-events-none absolute left-3 top-3 flex flex-col gap-2">
            {interactionMode !== 'idle' && (
              <div className="pointer-events-auto flex items-center gap-2 border border-sda-accent-cyan/30 bg-[#080808]/95 px-3 py-2 font-code text-[11px] text-sda-accent-cyan backdrop-blur-sm">
                <span className="h-1.5 w-1.5 animate-pulse bg-sda-accent-cyan" />
                {interactionMode === 'place_template' && `DEPLOY: ${(interactionPayload?.label ?? 'TEMPLATE').toUpperCase()}`}
                {interactionMode === 'relocate_actor' && 'RELOCATE ASSET'}
                {interactionMode === 'set_move_target' &&
                  `SET ${
                    mapTargetBehavior === 'approach_target' ? 'APPROACH' : 'MOVEMENT'
                  } TARGET`}
                {interactionMode === 'add_waypoint' && 'ADD WAYPOINT'}
                {interactionMode === 'place_marker' && 'PLACE MARKER'}
                {interactionMode === 'draw_route' && `DRAW ROUTE (${drawingPoints.length} pts)`}
                {interactionMode === 'draw_area' && `DRAW AREA (${drawingPoints.length} pts)`}
                {(interactionMode === 'draw_route' && drawingPoints.length >= 2) ||
                (interactionMode === 'draw_area' && drawingPoints.length >= 3) ? (
                  <Button
                    small
                    minimal
                    icon="tick"
                    intent="success"
                    className="ml-1"
                    onClick={handleFinishDrawing}
                  >
                    FINISH
                  </Button>
                ) : null}
                <Button
                  small
                  minimal
                  icon="cross"
                  className="ml-2"
                  onClick={() => {
                    clearDrawing();
                    setInteractionMode('idle');
                  }}
                />
              </div>
            )}
            {error && (
              <div className="pointer-events-auto flex items-center gap-2 border border-red-500/30 bg-[#080808]/95 px-3 py-2 font-code text-[11px] text-red-400 backdrop-blur-sm">
                <span className="h-1.5 w-1.5 bg-red-500" />
                {error}
                <Button small minimal icon="cross" className="ml-2" onClick={() => setError(null)} />
              </div>
            )}
          </div>

          {/* Globe overlay: bottom toolbar */}
          <div className="pointer-events-auto absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-3 border border-[#1a1a1a] bg-[#080808]/95 px-4 py-2 backdrop-blur-sm">
            <Button
              small
              minimal
              icon="globe"
              title="Reset camera view"
              onClick={handleResetView}
            />
            <div className="h-4 w-px bg-[#1a1a1a]" />
            <Button
              small
              minimal
              icon="panel-stats"
              title={contextPanelOpen ? 'Hide panel' : 'Show panel'}
              onClick={() => setContextPanelOpen(!contextPanelOpen)}
            />
            <div className="h-4 w-px bg-[#1a1a1a]" />
            <span className="font-code text-[10px] uppercase tracking-wider text-zinc-600">
              {placingBusy ? 'PROCESSING...' : 'DROP ASSETS ON GLOBE'}
            </span>
          </div>
        </div>

        {/* RIGHT: Context panel */}
        {contextPanelOpen && (
          <div className="min-h-0 overflow-hidden border-l border-[#1a1a1a]">
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

      {/* BOTTOM: Timeline */}
      <SandboxTimeline session={snapshot?.session ?? null} onControl={handleControl} />
    </div>
  );
}
