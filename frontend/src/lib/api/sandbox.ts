import { ApiClient } from '@/lib/api';
import type {
  SandboxActor,
  SandboxFaction,
  SandboxPosition,
  SandboxSnapshot,
  SandboxTemplateDraft,
} from '@/lib/store/sandbox';

export interface SandboxSessionCreatePayload {
  name?: string;
  initial_prompt?: string;
  is_saved?: boolean;
}

export interface SandboxActorCreatePayload {
  actor_class: SandboxTemplateDraft['actorClass'];
  actor_type: string;
  subtype?: string;
  faction?: SandboxFaction;
  label: string;
  provenance?: SandboxActor['provenance'];
  state?: Record<string, unknown>;
  behavior?: Record<string, unknown>;
  capabilities?: Record<string, unknown>;
  visual_config?: Record<string, unknown>;
  source_ref?: Record<string, unknown>;
}

export interface SandboxActorUpdatePayload {
  label?: string;
  subtype?: string;
  faction?: SandboxFaction;
  state?: Record<string, unknown>;
  behavior?: Record<string, unknown>;
  capabilities?: Record<string, unknown>;
  visual_config?: Record<string, unknown>;
}

export interface SandboxChatResponse {
  message: string;
  applied_commands: string[];
  snapshot: SandboxSnapshot;
}

export interface SandboxSessionSummary {
  id: string;
  name: string;
  description: string | null;
  status: 'draft' | 'running' | 'paused';
  is_saved: boolean;
  actor_count: number;
  created_at: string;
  updated_at: string;
}

class SandboxApiClient extends ApiClient {
  async listSessions(): Promise<SandboxSessionSummary[]> {
    return this.get<SandboxSessionSummary[]>('/api/v1/sandbox/sessions');
  }

  async createSession(data: SandboxSessionCreatePayload): Promise<SandboxSnapshot> {
    return this.post<SandboxSnapshot>('/api/v1/sandbox/sessions', data);
  }

  async getSession(sessionId: string): Promise<SandboxSnapshot> {
    return this.get<SandboxSnapshot>(`/api/v1/sandbox/sessions/${sessionId}`);
  }

  async createActor(sessionId: string, data: SandboxActorCreatePayload): Promise<SandboxSnapshot> {
    return this.post<SandboxSnapshot>(`/api/v1/sandbox/sessions/${sessionId}/actors`, data);
  }

  async updateActor(
    sessionId: string,
    actorId: string,
    data: SandboxActorUpdatePayload,
  ): Promise<SandboxSnapshot> {
    return this._fetch<SandboxSnapshot>(`/api/v1/sandbox/sessions/${sessionId}/actors/${actorId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async deleteActor(sessionId: string, actorId: string): Promise<SandboxSnapshot> {
    return this.delete<SandboxSnapshot>(`/api/v1/sandbox/sessions/${sessionId}/actors/${actorId}`);
  }

  async createScenarioItem(
    sessionId: string,
    data: {
      item_type: 'event' | 'modifier' | 'overlay' | 'objective';
      label: string;
      source_type?: string;
      source_id?: string;
      payload?: Record<string, unknown>;
    },
  ): Promise<SandboxSnapshot> {
    return this.post<SandboxSnapshot>(`/api/v1/sandbox/sessions/${sessionId}/items`, data);
  }

  async controlSession(
    sessionId: string,
    data: {
      action: 'start' | 'pause' | 'resume' | 'reset' | 'set_speed' | 'set_duration' | 'seek';
      time_multiplier?: number;
      duration_seconds?: number;
      seek_seconds?: number;
    },
  ): Promise<SandboxSnapshot> {
    return this.post<SandboxSnapshot>(`/api/v1/sandbox/sessions/${sessionId}/control`, data);
  }

  async tickSession(sessionId: string, data: { delta_seconds: number }): Promise<SandboxSnapshot> {
    return this.post<SandboxSnapshot>(`/api/v1/sandbox/sessions/${sessionId}/tick`, data);
  }

  async importLiveObject(
    sessionId: string,
    data: {
      source_type: 'satellite' | 'ground_station' | 'ground_vehicle' | 'conjunction';
      source_id: string;
      drop_position?: SandboxPosition;
    },
  ): Promise<SandboxSnapshot> {
    return this.post<SandboxSnapshot>(`/api/v1/sandbox/sessions/${sessionId}/import`, data);
  }

  async renameSession(sessionId: string, name: string): Promise<SandboxSnapshot> {
    return this._fetch<SandboxSnapshot>(`/api/v1/sandbox/sessions/${sessionId}`, {
      method: 'PATCH',
      body: JSON.stringify({ name }),
    });
  }

  async deleteSession(sessionId: string): Promise<void> {
    await this._fetch<{ ok: boolean }>(`/api/v1/sandbox/sessions/${sessionId}`, {
      method: 'DELETE',
    });
  }

  async compileChat(sessionId: string, prompt: string): Promise<SandboxChatResponse> {
    return this.post<SandboxChatResponse>(`/api/v1/sandbox/sessions/${sessionId}/chat`, { prompt });
  }

  async importTLE(
    sessionId: string,
    data: { tle_text: string; label?: string; faction?: string },
  ): Promise<SandboxSnapshot> {
    return this.post<SandboxSnapshot>(`/api/v1/sandbox/sessions/${sessionId}/import-tle`, data);
  }
}

export const sandboxApi = new SandboxApiClient();
