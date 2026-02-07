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
  onError?: (error: string, details?: string) => void;
  onDone?: (finalMessage: string, actionsCount: number) => void;
}

export class SSEChatClient {
  private eventSource: EventSource | null = null;
  private config: SSEChatClientConfig;
  private messageBuffer: string = '';
  private isComplete: boolean = false;
  private actionsCount: number = 0;
  private baseUrl: string;
  private tenantId: string;

  constructor(config: SSEChatClientConfig) {
    this.config = config;
    this.baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
    this.tenantId = 'default';
  }

  async streamChat(
    messages: Array<{ role: string; content: string }>,
    sceneState: Record<string, unknown>
  ): Promise<void> {
    this.messageBuffer = '';
    this.isComplete = false;
    this.actionsCount = 0;

    const url = new URL(`${this.baseUrl}/api/v1/ai/chat/stream`);
    
    const response = await fetch(url.toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Tenant-ID': this.tenantId,
      },
      body: JSON.stringify({
        messages,
        sceneState,
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      this.config.onError?.(error.detail || `HTTP error: ${response.status}`);
      return;
    }

    const reader = response.body?.getReader();
    if (!reader) {
      this.config.onError?.('No response body');
      return;
    }

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
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
          } catch (e) {
            // Ignore parse errors for incomplete lines
          }
        }
      }
    }
  }

  private handleEvent(event: Record<string, unknown>): void {
    switch (event.type) {
      case 'content':
        const chunk = event.chunk as string;
        if (chunk) {
          this.messageBuffer += chunk;
          this.config.onMessageChunk?.(chunk, false);
        }
        break;

      case 'tool_call':
        this.actionsCount++;
        const toolName = event.tool_name as string;
        const args = event.arguments as Record<string, unknown>;
        this.config.onToolCall?.(toolName, args);
        break;

      case 'tool_result':
        const toolCallId = event.tool_call_id as string;
        const result = event.result;
        const error = event.error as string | undefined;
        const toolNameResult = event.tool_name as string;
        this.config.onToolResult?.(toolCallId, toolNameResult, result, error);
        break;

      case 'action':
        this.actionsCount++;
        const actionType = event.action_type as string;
        const payload = event.payload as Record<string, unknown>;
        this.config.onAction?.({ type: actionType, payload });
        break;

      case 'error':
        const errorMsg = event.error as string;
        const details = event.details as string | undefined;
        this.config.onError?.(errorMsg, details);
        break;
    }
  }

  close(): void {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
  }
}
