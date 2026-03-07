'use client';

import { useEffect, useRef } from 'react';
import { useFleetRiskStore } from '@/lib/stores/fleetRiskStore';

/**
 * Sensor-noise variance for sparkline realism.
 */
const driftState: Record<string, number> = {};

function addVariance(satId: string, trueRisk: number): number {
  if (trueRisk === 0) return 0;
  const prev = driftState[satId] ?? 0;
  const step = (Math.random() - 0.5) * 0.80;
  const drift = prev * 0.93 + step;
  driftState[satId] = drift;
  return Math.max(0, Math.min(1, trueRisk + drift));
}

interface FleetRiskInput {
  riskMap: Record<string, number>;
}

/**
 * Hook that accumulates fleet risk from a risk map into the store.
 * Throttled to 500ms updates.
 */
export function useFleetRiskAccumulator(input: FleetRiskInput) {
  const pushSnapshots = useFleetRiskStore((s) => s.pushSnapshots);
  const lastPushRef = useRef(0);

  useEffect(() => {
    const now = Date.now();
    if (now - lastPushRef.current < 500) return;
    if (Object.keys(input.riskMap).length === 0) return;
    lastPushRef.current = now;

    const batch: Record<string, number> = {};
    for (const [id, risk] of Object.entries(input.riskMap)) {
      batch[id] = addVariance(id, risk);
    }
    pushSnapshots(batch, now);
  }, [input.riskMap, pushSnapshots]);
}
