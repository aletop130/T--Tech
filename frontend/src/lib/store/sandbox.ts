'use client';

import { create } from 'zustand';

export type SandboxSessionStatus = 'draft' | 'running' | 'paused';
export type SandboxActorClass =
  | 'orbital'
  | 'fixed_ground'
  | 'mobile_ground'
  | 'air'
  | 'sea'
  | 'weapon'
  | 'effect';
export type SandboxFaction = 'allied' | 'hostile' | 'neutral' | 'unknown';
export type SandboxProvenance = 'manual' | 'agent' | 'live_cloned';
export type SandboxScenarioItemType = 'event' | 'modifier' | 'overlay' | 'objective';

export type SandboxInteractionMode =
  | 'idle'
  | 'place_template'
  | 'relocate_actor'
  | 'set_move_target'
  | 'add_waypoint';

export type SandboxContextTab = 'actors' | 'import' | 'saved';

export interface SandboxSession {
  id: string;
  tenant_id: string;
  user_id: string;
  name: string;
  status: SandboxSessionStatus;
  is_saved: boolean;
  description?: string | null;
  initial_prompt?: string | null;
  current_time_seconds: number;
  time_multiplier: number;
  created_at: string;
  updated_at: string;
}

export interface SandboxPosition {
  lat: number;
  lon: number;
  alt_m: number;
}

export interface SandboxActor {
  id: string;
  session_id: string;
  tenant_id: string;
  actor_class: SandboxActorClass;
  actor_type: string;
  subtype?: string | null;
  faction: SandboxFaction;
  label: string;
  provenance: SandboxProvenance;
  visual_config: Record<string, unknown>;
  state: Record<string, unknown>;
  initial_state: Record<string, unknown>;
  capabilities: Record<string, unknown>;
  behavior: Record<string, unknown>;
  source_ref: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface SandboxScenarioItem {
  id: string;
  session_id: string;
  tenant_id: string;
  item_type: SandboxScenarioItemType;
  label: string;
  source_type?: string | null;
  source_id?: string | null;
  payload: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface SandboxCommand {
  id: string;
  session_id: string;
  tenant_id: string;
  command_type: string;
  source: 'manual' | 'chat' | 'import' | 'system';
  summary: string;
  payload: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface SandboxSnapshot {
  session: SandboxSession;
  actors: SandboxActor[];
  scenario_items: SandboxScenarioItem[];
  commands: SandboxCommand[];
}

export interface SandboxTemplateDraft {
  actorClass: SandboxActorClass;
  actorType: string;
  label: string;
  faction: SandboxFaction;
  behavior?: Record<string, unknown>;
  capabilities?: Record<string, unknown>;
  visualConfig?: Record<string, unknown>;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

interface SandboxState {
  snapshot: SandboxSnapshot | null;
  selectedActorId: string | null;
  interactionMode: SandboxInteractionMode;
  interactionPayload: SandboxTemplateDraft | null;
  isBootstrapping: boolean;
  contextPanelOpen: boolean;
  contextTab: SandboxContextTab;
  chatMessages: ChatMessage[];
  chatBusy: boolean;

  setBootstrapping: (value: boolean) => void;
  hydrateSnapshot: (snapshot: SandboxSnapshot) => void;
  selectActor: (actorId: string | null) => void;
  setInteractionMode: (mode: SandboxInteractionMode, payload?: SandboxTemplateDraft | null) => void;
  setContextPanelOpen: (open: boolean) => void;
  setContextTab: (tab: SandboxContextTab) => void;
  appendChat: (message: ChatMessage) => void;
  setChatBusy: (busy: boolean) => void;
  reset: () => void;
}

export function buildChatMessage(role: ChatMessage['role'], content: string): ChatMessage {
  return {
    id: `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    role,
    content,
  };
}

export const useSandboxStore = create<SandboxState>((set) => ({
  snapshot: null,
  selectedActorId: null,
  interactionMode: 'idle',
  interactionPayload: null,
  isBootstrapping: true,
  contextPanelOpen: true,
  contextTab: 'actors',
  chatMessages: [],
  chatBusy: false,

  setBootstrapping: (value) => set({ isBootstrapping: value }),
  hydrateSnapshot: (snapshot) =>
    set((state) => ({
      snapshot,
      selectedActorId:
        state.selectedActorId && snapshot.actors.some((a) => a.id === state.selectedActorId)
          ? state.selectedActorId
          : null,
    })),
  selectActor: (actorId) => set({ selectedActorId: actorId }),
  setInteractionMode: (mode, payload) =>
    set({ interactionMode: mode, interactionPayload: payload ?? null }),
  setContextPanelOpen: (open) => set({ contextPanelOpen: open }),
  setContextTab: (tab) => set({ contextTab: tab }),
  appendChat: (message) =>
    set((state) => ({ chatMessages: [...state.chatMessages, message] })),
  setChatBusy: (busy) => set({ chatBusy: busy }),
  reset: () =>
    set({
      snapshot: null,
      selectedActorId: null,
      interactionMode: 'idle',
      interactionPayload: null,
      isBootstrapping: true,
      contextPanelOpen: true,
      contextTab: 'actors',
      chatMessages: [],
      chatBusy: false,
    }),
}));
