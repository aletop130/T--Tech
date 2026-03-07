import { create } from 'zustand';

export interface RiskSnapshot {
  t: number;
  risk: number;
}

export interface SatelliteRiskTimeline {
  snapshots: RiskSnapshot[];
}

interface FleetRiskState {
  timelines: Record<string, SatelliteRiskTimeline>;
  pushSnapshots: (batch: Record<string, number>, timestamp: number) => void;
  clearAll: () => void;
}

const MAX_SNAPSHOTS = 2400;

export const useFleetRiskStore = create<FleetRiskState>((set) => ({
  timelines: {},

  pushSnapshots: (batch, timestamp) =>
    set((state) => {
      const next = { ...state.timelines };
      for (const [satId, risk] of Object.entries(batch)) {
        const existing = next[satId]?.snapshots ?? [];
        const updated = [...existing, { t: timestamp, risk }];
        next[satId] = {
          snapshots:
            updated.length > MAX_SNAPSHOTS
              ? updated.slice(updated.length - MAX_SNAPSHOTS)
              : updated,
        };
      }
      return { timelines: next };
    }),

  clearAll: () => set({ timelines: {} }),
}));
