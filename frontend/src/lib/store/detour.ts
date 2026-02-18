

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
  // Step-by-step imports
  startStepByStep as apiStartStepByStep,
  executeAgentStep as apiExecuteAgentStep,
  approveAgentStep as apiApproveAgentStep,
  rejectAgentStep as apiRejectAgentStep,
  getSessionStatus as apiGetSessionStatus,
  getNextStep as apiGetNextStep,
  StepSessionResponse,
  StepExecutionResponse,
  NextStepResponse,
  CesiumAction,
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

  /** Step-by-step session data */
  stepSession: StepSessionResponse | null;
  /** Pending Cesium actions from the current step */
  pendingCesiumActions: CesiumAction[];
  /** Whether we're in step-by-step mode */
  isStepByStepMode: boolean;

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

  /** Start a step-by-step analysis session */
  startStepByStep: (conjunctionEventId: string, satelliteId: string) => Promise<void>;
  /** Execute the next agent step */
  executeStep: (agentName: string) => Promise<StepExecutionResponse | null>;
  /** Approve the current step */
  approveStep: (agentName: string, notes?: string) => Promise<void>;
  /** Reject the current step */
  rejectStep: (agentName: string, reason: string) => Promise<void>;
  /** Get current session status */
  refreshSessionStatus: () => Promise<void>;
  /** Clear step session */
  clearStepSession: () => void;
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
      // Step-by-step state
      stepSession: null,
      pendingCesiumActions: [],
      isStepByStepMode: false,

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

      // Step-by-step implementations
      startStepByStep: async (conjunctionEventId: string, satelliteId: string) => {
        set({ isLoading: true, error: null });
        try {
          const session = await apiStartStepByStep(conjunctionEventId, satelliteId, 'step_by_step');
          set({
            stepSession: session,
            isStepByStepMode: true,
            pendingCesiumActions: session.cesium_actions || [],
          });
        } catch (e: any) {
          set({ error: e?.message ?? String(e) });
        } finally {
          set({ isLoading: false });
        }
      },

      executeStep: async (agentName: string) => {
        const { stepSession } = get();
        if (!stepSession) {
          set({ error: 'No active step session' });
          return null;
        }

        set({ isLoading: true, error: null });
        try {
          const result = await apiExecuteAgentStep(stepSession.session_id, agentName);
          
          // Refresh session status
          const updatedSession = await apiGetSessionStatus(stepSession.session_id);
          
          set({
            stepSession: updatedSession,
            pendingCesiumActions: [
              ...get().pendingCesiumActions,
              ...(result.cesium_actions || []),
            ],
          });
          
          return result;
        } catch (e: any) {
          set({ error: e?.message ?? String(e) });
          return null;
        } finally {
          set({ isLoading: false });
        }
      },

      approveStep: async (agentName: string, notes?: string) => {
        const { stepSession } = get();
        if (!stepSession) {
          set({ error: 'No active step session' });
          return;
        }

        set({ isLoading: true, error: null });
        try {
          const session = await apiApproveAgentStep(stepSession.session_id, agentName, notes);
          set({ stepSession: session });
        } catch (e: any) {
          set({ error: e?.message ?? String(e) });
        } finally {
          set({ isLoading: false });
        }
      },

      rejectStep: async (agentName: string, reason: string) => {
        const { stepSession } = get();
        if (!stepSession) {
          set({ error: 'No active step session' });
          return;
        }

        set({ isLoading: true, error: null });
        try {
          const session = await apiRejectAgentStep(stepSession.session_id, agentName, reason);
          set({ 
            stepSession: session,
            isStepByStepMode: false,
          });
        } catch (e: any) {
          set({ error: e?.message ?? String(e) });
        } finally {
          set({ isLoading: false });
        }
      },

      refreshSessionStatus: async () => {
        const { stepSession } = get();
        if (!stepSession) return;

        try {
          const session = await apiGetSessionStatus(stepSession.session_id);
          set({ stepSession: session });
        } catch (e: any) {
          set({ error: e?.message ?? String(e) });
        }
      },

      clearStepSession: () => {
        set({
          stepSession: null,
          pendingCesiumActions: [],
          isStepByStepMode: false,
        });
      },
    }),
    {
      name: 'detour-store', // key in localStorage
    }
  )
);
