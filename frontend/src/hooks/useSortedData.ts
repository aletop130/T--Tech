import { useState, useMemo } from 'react';

type SortDir = 'asc' | 'desc';

export interface UseSortedDataResult<T> {
  sorted: T[];
  sortKey: keyof T;
  sortDir: SortDir;
  toggleSort: (key: keyof T) => void;
}

export function useSortedData<T>(
  data: T[],
  defaultKey: keyof T,
  defaultDir: SortDir = 'asc'
): UseSortedDataResult<T> {
  const [sortKey, setSortKey] = useState<keyof T>(defaultKey);
  const [sortDir, setSortDir] = useState<SortDir>(defaultDir);

  const sorted = useMemo(() => {
    return [...data].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      const cmp =
        av === null || av === undefined
          ? -1
          : bv === null || bv === undefined
            ? 1
            : av < bv
              ? -1
              : av > bv
                ? 1
                : 0;
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [data, sortKey, sortDir]);

  const toggleSort = (key: keyof T) => {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  return { sorted, sortKey, sortDir, toggleSort };
}
