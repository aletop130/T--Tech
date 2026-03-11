import { getApiBase } from '@/lib/utils';

export interface SSEToolCallEvent {
  event_type: 'tool_call';
  tool_name: string;
  arguments: Record<string, unknown>;
}

export interface SSEToolResultEvent {
  event_type: 'tool_result';
  tool_call_id: string;
  tool_name: string;
  result: unknown;
  error?: string;
}

export interface SSEActionEvent {
  event_type: 'action';
  type: string;
  payload: Record<string, unknown>;
}

export interface SSEMessageEvent {
  event_type: 'message';
  content: string;
  chunk?: string;
  isComplete: boolean;
}

export interface SSEErrorEvent {
  event_type: 'error';
  error: string;
  details?: string;
}

export type SSEEvent = SSEToolCallEvent | SSEToolResultEvent | SSEActionEvent | SSEMessageEvent | SSEErrorEvent;

export interface SSEChatClientConfig {
  onThinking?: () => void;
  onMessageChunk?: (chunk: string, isComplete: boolean) => void;
  onToolCall?: (toolName: string, args: Record<string, unknown>) => void;
  onToolResult?: (toolCallId: string, toolName: string, result: unknown, error?: string) => void;
  onAction?: (action: { type: string; payload: Record<string, unknown> }) => void;
  onSimulationControl?: (command: {
    action: string;
    mode?: string;
    source?: string;
    prompt?: string;
  }) => void;
  onConfirmationRequired?: (operation: Record<string, unknown>) => void;
  onAgentStart?: (agent: string, message?: string) => void;
  onAgentComplete?: (agent: string, message?: string) => void;
  onSession?: (sessionId: string) => void;
  onMemoryUsage?: (percentage: number) => void;
  onMemoryError?: (error: string, details?: string) => void;
  onError?: (error: string, details?: string) => void;
  onDone?: (finalMessage: string, actionsCount: number) => void;
  onAgentPause?: (seconds: number, reason: string) => void;
  onNarration?: (text: string, style: string) => void;
  onSceneMood?: (mood: string) => void;
  onAgentThinking?: (step: number) => void;
}

export class SSEChatClient {
  private config: SSEChatClientConfig;
  private messageBuffer: string = '';
  private isComplete: boolean = false;
  private actionsCount: number = 0;
  private baseUrl: string;
  private tenantId: string;
  private abortController: AbortController | null = null;
  private activeStreamId: number = 0;

  constructor(config: SSEChatClientConfig) {
    this.config = config;
    // Use relative URL in browser to leverage Next.js rewrites, direct URL on server
    this.baseUrl = getApiBase();
    this.tenantId = 'default';
  }

  async streamChat(
    messages: Array<{ role: string; content: string }>,
    sceneState: Record<string, unknown>,
    sessionId?: string
  ): Promise<void> {
    await this.streamFromEndpoint('/api/v1/ai/chat/stream', {
      messages,
      sceneState,
      session_id: sessionId,
    });
  }

  async streamAgentChat(
    messages: Array<{ role: string; content: string }>,
    sceneState: Record<string, unknown>,
    sessionId?: string
  ): Promise<void> {
    await this.streamFromEndpoint('/api/v1/ai/chat/agent', {
      messages,
      sceneState,
      session_id: sessionId,
    });
  }

  async streamOrchestratedChat(
    message: string,
    sessionId?: string,
    mapSessionId?: string,
    mode: 'analyze' | 'execute' = 'analyze'
  ): Promise<void> {
    await this.streamFromEndpoint('/api/v1/ai/chat/orchestrate', {
      message,
      session_id: sessionId,
      map_session_id: mapSessionId,
      mode,
    });
  }

  private async streamFromEndpoint(
    endpoint: string,
    body: Record<string, unknown>
  ): Promise<void> {
    this.close();
    this.messageBuffer = '';
    this.isComplete = false;
    this.actionsCount = 0;

    const streamId = ++this.activeStreamId;
    const controller = new AbortController();
    this.abortController = controller;

    const url = this.baseUrl
      ? new URL(`${this.baseUrl}${endpoint}`).toString()
      : endpoint;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Tenant-ID': this.tenantId,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        if (this.isCurrentStream(streamId)) {
          this.config.onError?.(error.detail || `HTTP error: ${response.status}`);
        }
        return;
      }

      const reader = response.body?.getReader();
      if (!reader) {
        if (this.isCurrentStream(streamId)) {
          this.config.onError?.('No response body');
        }
        return;
      }

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done || !this.isCurrentStream(streamId)) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!this.isCurrentStream(streamId) || !line.startsWith('data: ')) {
            continue;
          }

          const data = line.slice(6).trim();
          if (data === '[DONE]') {
            this.isComplete = true;
            this.config.onMessageChunk?.('', true);
            this.config.onDone?.(this.messageBuffer, this.actionsCount);
            return;
          }

          try {
            const event = JSON.parse(data);
            this.handleEvent(event);
          } catch {
            // Ignore parse errors for incomplete lines.
          }
        }
      }
    } catch (error) {
      if (!this.isAbortError(error) && this.isCurrentStream(streamId)) {
        this.config.onError?.(
          error instanceof Error ? error.message : 'Streaming request failed'
        );
      }
    } finally {
      if (this.abortController === controller) {
        this.abortController = null;
      }
    }
  }

  private handleEvent(event: Record<string, unknown>): void {
    switch (event.type) {
      case 'content':
        {
          const chunk = event.chunk as string;
          if (chunk) {
            this.messageBuffer += chunk;
            this.config.onMessageChunk?.(chunk, false);
          }
        }
        break;

      case 'tool_call':
        {
          this.actionsCount++;
          // Also handle iteration field from agent loop
          const toolName = event.tool_name as string;
          const args = event.arguments as Record<string, unknown>;
          this.config.onToolCall?.(toolName, args);
        }
        break;

      case 'tool_result':
        {
          const toolCallId = event.tool_call_id as string;
          const result = event.result;
          const error = event.error as string | undefined;
          const toolNameResult = event.tool_name as string;
          this.config.onToolResult?.(toolCallId, toolNameResult, result, error);
        }
        break;

      case 'action':
        {
          this.actionsCount++;
          const actionType = event.action_type as string;
          const payload = event.payload as Record<string, unknown>;
          this.config.onAction?.({ type: actionType, payload });
        }
        break;

      case 'cesium_action':
        {
          this.actionsCount++;
          const action = event.action as { type?: string; payload?: Record<string, unknown> } | undefined;
          if (action?.type) {
            this.config.onAction?.({
              type: action.type,
              payload: action.payload || {},
            });
          }
        }
        break;

      case 'simulation_control':
        {
          const action = event.action as string;
          if (action) {
            this.config.onSimulationControl?.({
              action,
              mode: event.mode as string | undefined,
              source: event.source as string | undefined,
              prompt: event.prompt as string | undefined,
            });
          }
        }
        break;

      case 'confirmation_required':
        {
          const operation = event.operation as Record<string, unknown> | undefined;
          if (operation) {
            this.config.onConfirmationRequired?.(operation);
          }
        }
        break;

      case 'agent_start':
        this.config.onAgentStart?.(
          event.agent as string,
          event.message as string | undefined
        );
        break;

      case 'agent_complete':
        this.config.onAgentComplete?.(
          event.agent as string,
          event.message as string | undefined
        );
        break;

      case 'session':
        {
          const sessionId = event.session_id as string;
          if (sessionId) {
            this.config.onSession?.(sessionId);
          }
        }
        break;

      case 'memory_usage':
        {
          const percentage = Number(event.percentage);
          this.config.onMemoryUsage?.(Number.isFinite(percentage) ? percentage : 0);
        }
        break;

      case 'memory_error':
        {
          const memoryError = event.error as string;
          const memoryDetails = event.details as string | undefined;
          this.config.onMemoryError?.(memoryError, memoryDetails);
        }
        break;

      case 'error':
        {
          const errorMsg = event.error as string;
          const details = event.details as string | undefined;
          this.config.onError?.(errorMsg, details);
        }
        break;

      case 'agent_pause':
        this.config.onAgentPause?.(
          event.seconds as number,
          event.reason as string || ''
        );
        break;

      case 'narration':
        this.config.onNarration?.(
          event.text as string,
          event.style as string || 'info'
        );
        break;

      case 'scene_mood':
        this.config.onSceneMood?.(event.mood as string);
        break;

      case 'agent_thinking':
        this.config.onAgentThinking?.(event.step as number);
        break;

      case 'heartbeat':
        // Reset idle timeout - no action needed, the read loop continues
        break;
    }
  }

  private isAbortError(error: unknown): boolean {
    if (typeof DOMException !== 'undefined' && error instanceof DOMException) {
      return error.name === 'AbortError';
    }
    return error instanceof Error && error.name === 'AbortError';
  }

  private isCurrentStream(streamId: number): boolean {
    return streamId === this.activeStreamId;
  }

  close(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }
}
