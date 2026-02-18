import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getDebris, getOrbit } from '../debris';
import type { DebrisResponse, OrbitResponse } from '../../types/debris';

describe('debris API client', () => {
  const originalFetch = (global as any).fetch;

  beforeEach(() => {
    vi.useFakeTimers();
    (global as any).fetch = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
    (global as any).fetch = originalFetch;
  });

  it('getDebris should fetch and parse response with default params', async () => {
    const mockData: DebrisResponse = {
      timeUtc: '2026-01-01T00:00:00Z',
      objects: [{ noradId: 12345, lat: 10, lon: 20, altKm: 400 }],
    };
    const mockResponse = {
      ok: true,
      status: 200,
      text: async () => JSON.stringify(mockData),
    } as any;
    (global.fetch as any).mockResolvedValueOnce(mockResponse);

    const result = await getDebris();
    expect(result).toEqual(mockData);
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/debris?limit=2500&orbitClasses=LEO'),
      expect.objectContaining({
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          'X-Tenant-ID': 'default',
        }),
      })
    );
  });

  it('getDebris should accept custom limit and orbitClasses', async () => {
    const mockData: DebrisResponse = {
      timeUtc: '2026-01-01T00:00:00Z',
      objects: [],
    };
    const mockResponse = {
      ok: true,
      status: 200,
      text: async () => JSON.stringify(mockData),
    } as any;
    (global.fetch as any).mockResolvedValueOnce(mockResponse);

    const result = await getDebris(100, 'LEO,MEO');
    expect(result).toEqual(mockData);
    // Verify limit parameter
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('limit=100'),
      expect.anything()
    );
    // Verify orbitClasses parameter is URL-encoded
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('orbitClasses=LEO%2CMEO'),
      expect.anything()
    );
  });

  it('getOrbit should fetch and parse response', async () => {
    const mockData: OrbitResponse = {
      noradId: 12345,
      timeStartUtc: '2026-01-01T00:00:00Z',
      stepSec: 60,
      points: [{ tUtc: '2026-01-01T00:01:00Z', lat: 10, lon: 20, altKm: 400 }],
    };
    const mockResponse = {
      ok: true,
      status: 200,
      text: async () => JSON.stringify(mockData),
    } as any;
    (global.fetch as any).mockResolvedValueOnce(mockResponse);

    const result = await getOrbit(12345);
    expect(result).toEqual(mockData);
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/orbit?norad=12345&minutes=180&stepSec=60'),
      expect.anything()
    );
  });

  it('fetchWithBackoff retries on failure and succeeds', async () => {
    const mockData: DebrisResponse = {
      timeUtc: '2026-01-01T00:00:00Z',
      objects: [{ noradId: 999, lat: 0, lon: 0, altKm: 400 }],
    };
    const mockError = new Error('Network error');
    const mockSuccess = {
      ok: true,
      status: 200,
      text: async () => JSON.stringify(mockData),
    } as any;

    // First call rejects, second resolves
    (global.fetch as any)
      .mockRejectedValueOnce(mockError)
      .mockResolvedValueOnce(mockSuccess);

    const promise = getDebris(10, 'LEO');
    // advance timer for the backoff delay (500ms)
    await vi.advanceTimersByTimeAsync(500);
    const result = await promise;

    expect(result).toEqual(mockData);
    expect((global.fetch as any)).toHaveBeenCalledTimes(2);
  });

  it('fetchWithBackoff fails after max attempts', async () => {
    const mockError = new Error('Network error');
    // All attempts reject
    (global.fetch as any).mockRejectedValue(mockError);

    const promise = getDebris(10, 'LEO');
    // Attach a catch to avoid unhandled rejection warnings
    promise.catch(() => {});
    // first backoff 500ms
    await vi.advanceTimersByTimeAsync(500);
    // second backoff 1000ms
    await vi.advanceTimersByTimeAsync(1000);
    // third attempt will reject and throw
    let caughtError: any;
    try {
      await promise;
    } catch (e) {
      caughtError = e;
    }
    expect(caughtError).toBeInstanceOf(Error);
    expect(caughtError?.message).toBe('Network error');
    expect((global.fetch as any)).toHaveBeenCalledTimes(3);
  });
});
