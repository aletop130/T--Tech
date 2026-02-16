// WRITE_TARGET="frontend/src/components/Detour/ThreatList.tsx"
// WRITE_CONTENT_LENGTH=0
'use client';

import React from 'react';
import { Card } from '@blueprintjs/core';
import { useDetourStore } from '@/lib/store/detour';

export interface ThreatListProps {}

/**
 * Displays a table of conjunction candidates (threats).
 * Uses placeholder data if the store has not yet loaded screening results.
 */
export function ThreatList(_: ThreatListProps) {
  const { screeningResults, isLoading } = useDetourStore();

  const candidates = screeningResults?.candidates ?? [
    {
      candidate_id: 'c1',
      satellite_id: 'SAT-001',
      tca: '2026-02-20T12:00:00Z',
      miss_distance_km: 3.2,
      risk_level: 'medium',
    },
    {
      candidate_id: 'c2',
      satellite_id: 'SAT-002',
      tca: '2026-02-21T08:45:00Z',
      miss_distance_km: 6.7,
      risk_level: 'low',
    },
  ];

  return (
    <Card>
      <h4 className="text-md font-medium mb-2">Conjunction Threats</h4>
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="border-b">
            <th className="text-left p-1">Satellite</th>
            <th className="text-left p-1">TCA</th>
            <th className="text-left p-1">Miss (km)</th>
            <th className="text-left p-1">Risk</th>
          </tr>
        </thead>
        <tbody>
          {candidates.map((c) => (
            <tr key={c.candidate_id} className="border-b">
              <td className="p-1">{c.satellite_id}</td>
              <td className="p-1">{new Date(c.tca).toLocaleString()}</td>
              <td className="p-1">{c.miss_distance_km}</td>
              <td className="p-1">{c.risk_level}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
