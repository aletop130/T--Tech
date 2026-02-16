// WRITE_TARGET="frontend/src/components/Detour/CollisionAnalyzer.tsx"
// WRITE_CONTENT_LENGTH=0
'use client';

import React from 'react';
import { Card, ProgressBar } from '@blueprintjs/core';
import { useDetourStore } from '@/lib/store/detour';

export interface CollisionAnalyzerProps {}

/**
 * Displays a simple risk gauge for the selected conjunction.
 * Uses Blueprint's ProgressBar as a placeholder visualisation.
 */
export function CollisionAnalyzer(_: CollisionAnalyzerProps) {
  // Pull needed values from the Detour store using selectors for reliable updates.
  const { selectedConjunction, screeningResults, isLoading } = useDetourStore.getState();

  // Derive a dummy risk value – high risk if any candidate flagged high, else low.
  const hasHighRisk = Boolean(
    screeningResults?.candidates?.some((c) => (c as any).risk_level?.toLowerCase() === 'high')
  );
  const riskLevel = hasHighRisk ? 0.9 : 0.2;

  return (
    <Card>
      <h4 className="text-md font-medium mb-2">Collision Risk</h4>
      <ProgressBar value={riskLevel} intent={riskLevel > 0.7 ? 'danger' : 'warning'} />
      {isLoading && <p className="text-sm text-sda-text-muted mt-2">Loading…</p>}
    </Card>
  );
}
