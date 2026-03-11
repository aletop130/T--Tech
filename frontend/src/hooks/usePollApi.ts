import { useState, useEffect, useCallback, useRef } from 'react';

interface UsePollApiOptions {
  /** Polling interval in ms. 0 = no polling, fetch once on mount. Default: 0 */
  interval?: number;
  /** Skip the initial fetch entirely. Default: false */
  skip?: boolean;
}

export interface UsePollApiResult<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function usePollApi<T>(
  fetcher: () => Promise<T>,
  options: UsePollApiOptions = {}
): UsePollApiResult<T> {
  const { interval = 0, skip = false } = options;
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(!skip);
  const [error, setError] = useState<string | null>(null);

  // Keep fetcher stable across re-renders without triggering effects
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetcherRef.current();
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fetch failed');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (skip) return;
    refetch();
    if (interval > 0) {
      const id = setInterval(refetch, interval);
      return () => clearInterval(id);
    }
  }, [refetch, interval, skip]);

  return { data, loading, error, refetch };
}
