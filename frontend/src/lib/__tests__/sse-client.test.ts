// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SSEChatClient } from '../sse-client';

function createSseResponse(lines: string[]): Response {
  const encoder = new TextEncoder();

  return new Response(
    new ReadableStream({
      start(controller) {
        for (const line of lines) {
          controller.enqueue(encoder.encode(line));
        }
        controller.close();
      },
    }),
    {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' },
    }
  );
}

describe('SSEChatClient', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    (global as typeof globalThis).fetch = vi.fn();
  });

  afterEach(() => {
    (global as typeof globalThis).fetch = originalFetch;
  });

  it('handles orchestration events and forwards them to the UI callbacks', async () => {
    (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      createSseResponse([
        `data: ${JSON.stringify({ type: 'session', session_id: 'session-123' })}\n\n`,
        `data: ${JSON.stringify({ type: 'memory_usage', percentage: 37.5 })}\n\n`,
        `data: ${JSON.stringify({ type: 'agent_start', agent: 'scout', message: 'Starting scout' })}\n\n`,
        `data: ${JSON.stringify({ type: 'cesium_action', action: { type: 'cesium.flyTo', payload: { entityId: 'satellite-1' } } })}\n\n`,
        `data: ${JSON.stringify({ type: 'simulation_control', action: 'start_sar_simulation', mode: 'enter_simulation_mode', source: 'chat_orchestrator' })}\n\n`,
        `data: ${JSON.stringify({ type: 'confirmation_required', operation: { operation_type: 'create_satellite', summary: 'Crea satellite TEST' } })}\n\n`,
        `data: ${JSON.stringify({ type: 'content', chunk: 'Hello operator' })}\n\n`,
        `data: ${JSON.stringify({ type: 'agent_complete', agent: 'scout', message: 'Scout complete' })}\n\n`,
        'data: [DONE]\n\n',
      ])
    );

    const onAction = vi.fn();
    const onSimulationControl = vi.fn();
    const onConfirmationRequired = vi.fn();
    const onAgentStart = vi.fn();
    const onAgentComplete = vi.fn();
    const onSession = vi.fn();
    const onMemoryUsage = vi.fn();
    const onMessageChunk = vi.fn();
    const onDone = vi.fn();

    const client = new SSEChatClient({
      onAction,
      onSimulationControl,
      onConfirmationRequired,
      onAgentStart,
      onAgentComplete,
      onSession,
      onMemoryUsage,
      onMessageChunk,
      onDone,
    });

    await client.streamOrchestratedChat('Analyze the situation', 'chat-session', 'map-session');

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/v1/ai/chat/orchestrate',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          message: 'Analyze the situation',
          session_id: 'chat-session',
          map_session_id: 'map-session',
          mode: 'analyze',
        }),
      })
    );
    expect(onSession).toHaveBeenCalledWith('session-123');
    expect(onMemoryUsage).toHaveBeenCalledWith(37.5);
    expect(onAgentStart).toHaveBeenCalledWith('scout', 'Starting scout');
    expect(onAction).toHaveBeenCalledWith({
      type: 'cesium.flyTo',
      payload: { entityId: 'satellite-1' },
    });
    expect(onSimulationControl).toHaveBeenCalledWith({
      action: 'start_sar_simulation',
      mode: 'enter_simulation_mode',
      source: 'chat_orchestrator',
    });
    expect(onConfirmationRequired).toHaveBeenCalledWith({
      operation_type: 'create_satellite',
      summary: 'Crea satellite TEST',
    });
    expect(onMessageChunk).toHaveBeenCalledWith('Hello operator', false);
    expect(onMessageChunk).toHaveBeenCalledWith('', true);
    expect(onAgentComplete).toHaveBeenCalledWith('scout', 'Scout complete');
    expect(onDone).toHaveBeenCalledWith('Hello operator', 1);
  });

  it('aborts an in-flight stream when close is called', async () => {
    let capturedSignal: AbortSignal | undefined;

    (global.fetch as unknown as ReturnType<typeof vi.fn>).mockImplementationOnce(
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        capturedSignal = init?.signal as AbortSignal | undefined;

        return new Promise<Response>((_resolve, reject) => {
          capturedSignal?.addEventListener('abort', () => {
            reject(new DOMException('Aborted', 'AbortError'));
          });
        });
      }
    );

    const onError = vi.fn();
    const client = new SSEChatClient({ onError });
    const streamPromise = client.streamAgentChat([{ role: 'user', content: 'ciao' }], {});

    await Promise.resolve();
    client.close();
    await streamPromise;

    expect(capturedSignal?.aborted).toBe(true);
    expect(onError).not.toHaveBeenCalled();
  });

  it('forwards sandbox handoff prompts from simulation_control events', async () => {
    (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      createSseResponse([
        `data: ${JSON.stringify({
          type: 'simulation_control',
          action: 'open_sandbox',
          mode: 'navigate',
          source: 'chat_orchestrator',
          prompt: 'Open a sandbox around the current map selection',
        })}\n\n`,
        'data: [DONE]\n\n',
      ])
    );

    const onSimulationControl = vi.fn();
    const client = new SSEChatClient({ onSimulationControl });

    await client.streamOrchestratedChat('Open sandbox', 'chat-session', 'map-session');

    expect(onSimulationControl).toHaveBeenCalledWith({
      action: 'open_sandbox',
      mode: 'navigate',
      source: 'chat_orchestrator',
      prompt: 'Open a sandbox around the current map selection',
    });
  });
});
