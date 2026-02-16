// WRITE_TARGET="frontend/src/components/Detour/ManeuverPlanner.tsx"
// WRITE_CONTENT_LENGTH=0
'use client';

import React from 'react';
import { Card } from '@blueprintjs/core';
import { useDetourStore } from '@/lib/store/detour';

export interface ManeuverPlannerProps {}

/**
 * Lists possible maneuver options for the selected conjunction.
 * This placeholder uses a static list; integration with the backend will replace it.
 */
export function ManeuverPlanner(_: ManeuverPlannerProps) {
  const { selectedConjunction, isLoading } = useDetourStore();

  // Static placeholder data – in a real implementation this would come from the API.
  const maneuvers = [
    { type: 'In‑plane prograde', deltaV: 0.12, fuel: 5, riskReduction: 60 },
    { type: 'Out‑of‑plane retrograde', deltaV: 0.15, fuel: 6, riskReduction: 70 },
  ];

  return (
    <Card>
      <h4 className="text-md font-medium mb-2">Maneuver Options</h4>
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="border-b">
            <th className="text-left p-1">Type</th>
            <th className="text-left p-1">ΔV (m/s)</th>
            <th className="text-left p-1">Fuel (kg)</th>
            <th className="text-left p-1">Risk Reduction (%)</th>
          </tr>
        </thead>
        <tbody>
          {maneuvers.map((m, idx) => (
            <tr key={idx} className="border-b">
              <td className="p-1">{m.type}</td>
              <td className="p-1">{m.deltaV}</td>
              <td className="p-1">{m.fuel}</td>
              <td className="p-1">{m.riskReduction}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
