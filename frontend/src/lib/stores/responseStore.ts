import { create } from 'zustand';
import type { ThreatResponseDecision } from '@/types/threats';

interface ResponseState {
  isStreaming: boolean;
  currentDecision: ThreatResponseDecision | null;
  progressMessages: string[];
  error: string | null;
  setStreaming: (streaming: boolean) => void;
  setDecision: (decision: ThreatResponseDecision | null) => void;
  addProgress: (message: string) => void;
  setError: (error: string | null) => void;
  reset: () => void;
}

export const useResponseStore = create<ResponseState>((set) => ({
  isStreaming: false,
  currentDecision: null,
  progressMessages: [],
  error: null,

  setStreaming: (streaming) => set({ isStreaming: streaming }),
  setDecision: (decision) => set({ currentDecision: decision, isStreaming: false }),
  addProgress: (message) =>
    set((s) => ({ progressMessages: [...s.progressMessages, message] })),
  setError: (error) => set({ error, isStreaming: false }),
  reset: () =>
    set({ isStreaming: false, currentDecision: null, progressMessages: [], error: null }),
}));
