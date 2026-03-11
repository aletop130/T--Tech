// WRITE_TARGET="frontend/src/components/Detour/ThreatList.tsx"
// WRITE_CONTENT_LENGTH=0
'use client';

import React from 'react';
import { Card } from '@blueprintjs/core';
import { useDetourStore } from '@/lib/store/detour';

export interface ThreatListProps {
  onSelectConjunction?: (conjunctionId: string) => void;
}

/**
 * Displays a table of conjunction candidates (threats).
 * Uses placeholder data if the store has not yet loaded screening results.
 */
export function ThreatList({ onSelectConjunction }: ThreatListProps) {
  const { screeningResults } = useDetourStore();

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
    <div>
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="border-b border-sda-border-default">
            <th className="text-left p-1.5 text-sda-text-secondary text-xs">Satellite</th>
            <th className="text-left p-1.5 text-sda-text-secondary text-xs">TCA</th>
            <th className="text-left p-1.5 text-sda-text-secondary text-xs">Miss (km)</th>
            <th className="text-left p-1.5 text-sda-text-secondary text-xs">Risk</th>
          </tr>
        </thead>
        <tbody>
          {candidates.map((c) => (
            <tr
              key={c.candidate_id}
              className="border-b border-sda-border-default hover:bg-sda-bg-tertiary cursor-pointer transition-colors"
              onClick={() => onSelectConjunction?.(c.candidate_id)}
            >
              <td className="p-1.5 text-sda-text-primary">{c.satellite_id}</td>
              <td className="p-1.5 text-sda-text-primary">{new Date(c.tca).toLocaleString()}</td>
              <td className="p-1.5 text-sda-text-primary">{c.miss_distance_km}</td>
              <td className="p-1.5">
                <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                  c.risk_level === 'high' || c.risk_level === 'critical'
                    ? 'bg-red-900/40 text-red-300'
                    : c.risk_level === 'medium'
                      ? 'bg-yellow-900/40 text-yellow-300'
                      : 'bg-green-900/40 text-green-300'
                }`}>
                  {(c.risk_level ?? 'low').toUpperCase()}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
