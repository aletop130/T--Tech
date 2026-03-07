'use client';

import { useEffect, useRef, useCallback } from 'react';
import type { ProximityThreat, SignalThreat, AnomalyThreat } from '@/types/threats';

interface ScenarioTick {
  type: 'scenario_tick';
  elapsed: number;
  proximityThreats: ProximityThreat[];
  signalThreats: SignalThreat[];
  anomalyThreats: AnomalyThreat[];
  threats: unknown[];
}

interface UseWebSocketOptions {
  onProximityThreats?: (threats: ProximityThreat[]) => void;
  onSignalThreats?: (threats: SignalThreat[]) => void;
  onAnomalyThreats?: (threats: AnomalyThreat[]) => void;
  speed?: number;
}

const WS_URL =
  typeof window !== 'undefined'
    ? `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.hostname}:8000/ws/threats`
    : '';

/**
 * WebSocket hook for real-time threat data streaming.
 * Throttles store updates to ~4Hz to avoid re-render storms.
 */
export function useWebSocket(options: UseWebSocketOptions = {}) {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);
  const lastStoreUpdate = useRef(0);
  const pendingTick = useRef<ScenarioTick | null>(null);
  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flushToCallbacks = useCallback(
    (tick: ScenarioTick) => {
      options.onProximityThreats?.(tick.proximityThreats);
      options.onSignalThreats?.(tick.signalThreats);
      options.onAnomalyThreats?.(tick.anomalyThreats);
      lastStoreUpdate.current = performance.now();
      pendingTick.current = null;
    },
    [options],
  );

  const handleTick = useCallback(
    (tick: ScenarioTick) => {
      pendingTick.current = tick;
      const now = performance.now();
      const elapsed = now - lastStoreUpdate.current;

      if (elapsed >= 250) {
        if (flushTimer.current) {
          clearTimeout(flushTimer.current);
          flushTimer.current = null;
        }
        flushToCallbacks(tick);
      } else if (!flushTimer.current) {
        flushTimer.current = setTimeout(() => {
          flushTimer.current = null;
          if (pendingTick.current) flushToCallbacks(pendingTick.current);
        }, 250 - elapsed);
      }
    },
    [flushToCallbacks],
  );

  const connect = useCallback(() => {
    if (!WS_URL || !mountedRef.current) return;
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      if (options.speed) {
        ws.send(JSON.stringify({ speed: options.speed }));
      }
    };

    ws.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data) as ScenarioTick;
        if (data.type === 'scenario_tick') {
          handleTick(data);
        }
      } catch {
        // ignore malformed
      }
    };

    ws.onclose = () => {
      wsRef.current = null;
      if (mountedRef.current) {
        reconnectTimer.current = setTimeout(connect, 2000);
      }
    };

    ws.onerror = () => ws.close();
  }, [handleTick, options.speed]);

  useEffect(() => {
    mountedRef.current = true;
    connect();
    return () => {
      mountedRef.current = false;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      if (flushTimer.current) clearTimeout(flushTimer.current);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [connect]);

  // Send speed changes
  useEffect(() => {
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN && options.speed) {
      ws.send(JSON.stringify({ speed: options.speed }));
    }
  }, [options.speed]);

  return wsRef;
}
