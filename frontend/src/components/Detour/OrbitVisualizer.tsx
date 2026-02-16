// WRITE_TARGET="frontend/src/components/Detour/OrbitVisualizer.tsx"
// WRITE_CONTENT_LENGTH=0
'use client';

import React from 'react';
import { Card } from '@blueprintjs/core';

export interface OrbitVisualizerProps {}

/**
 * Mini 3‑D preview placeholder for satellite orbits.
 * In a full implementation this would embed Cesium or another 3D engine.
 */
export function OrbitVisualizer(_: OrbitVisualizerProps) {
  return (
    <Card>
      <h4 className="text-md font-medium mb-2">Orbit Visualizer</h4>
      <div className="h-48 bg-sda-bg-secondary flex items-center justify-center">
        <span className="text-sda-text-muted">3D Orbit preview (coming soon)</span>
      </div>
    </Card>
  );
}
