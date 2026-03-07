'use client';

import { useEffect, useRef } from 'react';
import { useResponseStore } from '@/lib/stores/responseStore';
import type { ProximityThreat } from '@/types/threats';

const AGENT_THRESHOLD = 0.7;

/**
 * Auto-triggers the threat response agent when a proximity threat
 * exceeds the confidence threshold.
 */
export function useAgentTrigger(threats: ProximityThreat[]) {
  const setStreaming = useResponseStore((s) => s.setStreaming);
  const setDecision = useResponseStore((s) => s.setDecision);
  const setError = useResponseStore((s) => s.setError);
  const isStreaming = useResponseStore((s) => s.isStreaming);
  const triggeredRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (isStreaming) return;

    for (const threat of threats) {
      if (
        threat.confidence >= AGENT_THRESHOLD &&
        !triggeredRef.current.has(threat.id)
      ) {
        triggeredRef.current.add(threat.id);
        setStreaming(true);

        const params = new URLSearchParams({
          satellite_id: threat.targetAssetId,
          satellite_name: threat.targetAssetName,
          threat_satellite_id: threat.foreignSatId,
          threat_satellite_name: threat.foreignSatName,
          threat_score: String(threat.confidence * 100),
          miss_distance_km: String(threat.missDistanceKm),
          approach_pattern: threat.approachPattern,
          tca_minutes: String(threat.tcaInMinutes),
        });

        const eventSource = new EventSource(
          `/api/v1/response/stream?${params.toString()}`
        );

        eventSource.onmessage = (ev) => {
          try {
            const data = JSON.parse(ev.data);
            if (data.type === 'response_complete') {
              setDecision(data.data);
              eventSource.close();
            } else if (data.type === 'response_error') {
              setError(data.message);
              eventSource.close();
            }
          } catch {
            // ignore
          }
        };

        eventSource.onerror = () => {
          setError('Connection to response agent lost');
          eventSource.close();
        };

        break; // Only trigger one at a time
      }
    }
  }, [threats, isStreaming, setStreaming, setDecision, setError]);
}
