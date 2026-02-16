// WRITE_TARGET="frontend/src/components/Detour/DetourDashboard.tsx"
// WRITE_CONTENT_LENGTH=0
'use client';

import React from 'react';
import { Card } from '@blueprintjs/core';
import { CollisionAnalyzer } from './CollisionAnalyzer';
import { ManeuverPlanner } from './ManeuverPlanner';
import { ThreatList } from './ThreatList';
import { OrbitVisualizer } from './OrbitVisualizer';
import { AgentChat } from './AgentChat';
import { OpsBriefPanel } from './OpsBriefPanel';

export interface DetourDashboardProps {
  /** Optional custom class name */
  className?: string;
}

/**
 * Main dashboard layout for the Detour subsystem.
 * Composes the various sub‑components into a responsive grid.
 */
export function DetourDashboard({ className }: DetourDashboardProps) {
  return (
    <div className={`grid gap-4 md:grid-cols-2 lg:grid-cols-3 ${className ?? ''}`}>
      <Card>
        <h3 className="text-lg font-semibold mb-2">Threat List</h3>
        <ThreatList />
      </Card>

      <Card>
        <h3 className="text-lg font-semibold mb-2">Collision Analyzer</h3>
        <CollisionAnalyzer />
      </Card>

      <Card>
        <h3 className="text-lg font-semibold mb-2">Orbit Visualizer</h3>
        <OrbitVisualizer />
      </Card>

      <Card className="md:col-span-2">
        <h3 className="text-lg font-semibold mb-2">Maneuver Planner</h3>
        <ManeuverPlanner />
      </Card>

      <Card className="md:col-span-2">
        <h3 className="text-lg font-semibold mb-2">Operations Brief</h3>
        <OpsBriefPanel />
      </Card>

      <Card className="md:col-span-2">
        <h3 className="text-lg font-semibold mb-2">Agent Chat</h3>
        <AgentChat />
      </Card>
    </div>
  );
}
