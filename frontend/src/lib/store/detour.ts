

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  analyzeConjunction,
  getAnalysisStatus,
  subscribeToAnalysisStream,
  approveManeuver as apiApproveManeuver,
  rejectManeuver as apiRejectManeuver,
  executeManeuver as apiExecuteManeuver,
  getSatelliteState,
  runScreening,
  DetourAnalysisStatus,
  ScreeningResult,
  ManeuverPlan,
} from '../api/detour';

/**
 * Zustand store for Detour subsystem.
 * Persists sessions and user selections in localStorage.
 */
export interface DetourState {
  /** Active analysis sessions keyed by session ID */
  activeAnalyses: Record<string, DetourAnalysisStatus>;
  /** Currently selected satellite ID */
  selectedSatellite: string | null;
  /** Currently selected conjunction ID */
  selectedConjunction: string | null;
  /** Results of the latest screening run */
  screeningResults: ScreeningResult | null;
  /** Global loading flag for async operations */
  isLoading: boolean;
  /** Last error message, if any */
  error: string | null;

  /** Trigger a new analysis for a conjunction */
  startAnalysis: (conjunctionId: string) => Promise<void>;
  /** Subscribe to SSE updates for a session */
  subscribeToSession: (
    sessionId: string,
    onEvent: (event: MessageEvent) => void
  ) => () => void;
  /** Approve a maneuver plan */
  approveManeuver: (planId: string, notes?: string) => Promise<void>;
  /** Reject a maneuver plan */
  rejectManeuver: (planId: string, reason: string) => Promise<void>;
  /** Execute an approved maneuver plan */
  executeManeuver: (planId: string) => Promise<void>;
  /** Run manual screening for a satellite */
  runScreening: (
    satelliteId: string,
    timeWindowHours?: number,
    thresholdKm?: number
  ) => Promise<void>;
  /** Select a satellite */
  selectSatellite: (satelliteId: string | null) => void;
  /** Select a conjunction */
  selectConjunction: (conjunctionId: string | null) => void;
}

export const useDetourStore = create<DetourState>()(
  persist(
    (set, get) => ({
      activeAnalyses: {},
      selectedSatellite: null,
      selectedConjunction: null,
      screeningResults: null,
      isLoading: false,
      error: null,

      startAnalysis: async (conjunctionId: string) => {
        set({ isLoading: true, error: null });
        try {
          const sessionId = await analyzeConjunction(conjunctionId);
          const status = await getAnalysisStatus(sessionId);
          set((state) => ({
            activeAnalyses: { ...state.activeAnalyses, [sessionId]: status },
          }));
        } catch (e: any) {
          set({ error: e?.message ?? String(e) });
        } finally {
          set({ isLoading: false });
        }
      },

      subscribeToSession: (sessionId: string, onEvent: (event: MessageEvent) => void) => {
        // Subscribe to backend SSE; update store on each message.
        const es = subscribeToAnalysisStream(sessionId, (event) => {
          try {
            const data = JSON.parse(event.data) as DetourAnalysisStatus;
            set((state) => ({
              activeAnalyses: { ...state.activeAnalyses, [sessionId]: data },
            }));
          } catch {
            // ignore malformed messages
          }
          onEvent(event);
        });
        return () => {
          es.close();
        };
      },

      approveManeuver: async (planId: string, notes?: string) => {
        set({ isLoading: true, error: null });
        try {
          await apiApproveManeuver(planId, notes);
          // Optimistic update – caller can refresh data as needed.
        } catch (e: any) {
          set({ error: e?.message ?? String(e) });
        } finally {
          set({ isLoading: false });
        }
      },

      rejectManeuver: async (planId: string, reason: string) => {
        set({ isLoading: true, error: null });
        try {
          await apiRejectManeuver(planId, reason);
        } catch (e: any) {
          set({ error: e?.message ?? String(e) });
        } finally {
          set({ isLoading: false });
        }
      },

      executeManeuver: async (planId: string) => {
        set({ isLoading: true, error: null });
        try {
          await apiExecuteManeuver(planId);
        } catch (e: any) {
          set({ error: e?.message ?? String(e) });
        } finally {
          set({ isLoading: false });
        }
      },

      runScreening: async (
        satelliteId: string,
        timeWindowHours: number = 72,
        thresholdKm: number = 5.0
      ) => {
        set({ isLoading: true, error: null });
        try {
          const result = await runScreening(satelliteId, timeWindowHours, thresholdKm);
          set({ screeningResults: result });
        } catch (e: any) {
          set({ error: e?.message ?? String(e) });
        } finally {
          set({ isLoading: false });
        }
      },

      selectSatellite: (satelliteId: string | null) => {
        set({ selectedSatellite: satelliteId });
      },

      selectConjunction: (conjunctionId: string | null) => {
        set({ selectedConjunction: conjunctionId });
      },
    }),
    {
      name: 'detour-store', // key in localStorage
    }
  )
);
