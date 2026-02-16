import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  analyzeConjunction,
  getAnalysisStatus,
  getAnalysisResults,
  rejectManeuver,
  subscribeToAnalysisStream,
  DetourAnalysisStatus,
} from '../detour';

describe('detour API client', () => {
  const originalFetch = global.fetch as any;
  const originalEventSource = (global as any).EventSource;

  beforeEach(() => {
    vi.useFakeTimers();
    // Mock fetch
    (global as any).fetch = vi.fn();
    // Mock EventSource
    class MockEventSource {
      url: string;
      onmessage?: (event: any) => void;
      onerror?: (event?: any) => void;
      closed = false;
      constructor(url: string) {
        this.url = url;
      }
      close() {
        this.closed = true;
      }
    }
    (global as any).EventSource = MockEventSource;
  });

  afterEach(() => {
    vi.useRealTimers();
    (global as any).fetch = originalFetch;
    (global as any).EventSource = originalEventSource;
  });

  it('analyzeConjunction should POST and return session_id', async () => {
    const mockResponse = {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ session_id: 'sess-123' }),
    } as any;
    (global.fetch as any).mockResolvedValueOnce(mockResponse);
    const sessionId = await analyzeConjunction('conj-1');
    expect(sessionId).toBe('sess-123');
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/detour/conjunctions/conj-1/analyze'),
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('getAnalysisStatus should GET and parse JSON', async () => {
    const mockData: DetourAnalysisStatus = {
      session_id: 'sess-123',
      status: 'running',
    } as any;
    const mockResponse = {
      ok: true,
      status: 200,
      text: async () => JSON.stringify(mockData),
    } as any;
    (global.fetch as any).mockResolvedValueOnce(mockResponse);
    const status = await getAnalysisStatus('sess-123');
    expect(status).toEqual(mockData);
  });

  it('getAnalysisResults should GET and parse JSON', async () => {
    const mockResult = {
      session_id: 'sess-123',
      status: 'completed',
      output_data: { foo: 'bar' },
    } as any;
    const mockResponse = {
      ok: true,
      status: 200,
      text: async () => JSON.stringify(mockResult),
    } as any;
    (global.fetch as any).mockResolvedValueOnce(mockResponse);
    const result = await getAnalysisResults('sess-123');
    expect(result).toEqual(mockResult);
  });

  it('rejectManeuver should POST reason and return maneuver', async () => {
    const mockManeuver = { id: 'plan-1', status: 'rejected' } as any;
    const mockResponse = {
      ok: true,
      status: 200,
      text: async () => JSON.stringify(mockManeuver),
    } as any;
    (global.fetch as any).mockResolvedValueOnce(mockResponse);
    const plan = await rejectManeuver('plan-1', 'not needed');
    expect(plan).toEqual(mockManeuver);
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/detour/maneuvers/plan-1/reject'),
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ reason: 'not needed' }) })
    );
  });

  it('subscribeToAnalysisStream sets up EventSource and forwards messages', () => {
    const onEvent = vi.fn();
    const es = subscribeToAnalysisStream('sess-123', onEvent);
    // Verify EventSource instance
    const MockES = (global as any).EventSource as any;
    expect(es).toBeInstanceOf(MockES);
    expect((es as any).url).toContain('/api/v1/detour/sessions/sess-123/status');
    // Simulate a message event
    const messageEvent = { data: JSON.stringify({ session_id: 'sess-123', status: 'running' }) } as any;
    (es as any).onmessage?.(messageEvent);
    expect(onEvent).toHaveBeenCalledWith(messageEvent);
    // Simulate an error to trigger reconnection
    (es as any).onerror?.();
    // Fast-forward reconnection timeout (3000 ms)
    vi.advanceTimersByTime(3000);
    // Original EventSource should be closed
    expect((es as any).closed).toBe(true);
  });
});
