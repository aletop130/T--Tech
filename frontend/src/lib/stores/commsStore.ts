import { create } from 'zustand';
import type { CommsTranscription } from '@/types/threats';

interface CommsState {
  isStreaming: boolean;
  currentTranscription: CommsTranscription | null;
  stages: Array<{ stage: string; data: unknown }>;
  error: string | null;
  setStreaming: (streaming: boolean) => void;
  setTranscription: (transcription: CommsTranscription | null) => void;
  addStage: (stage: string, data: unknown) => void;
  setError: (error: string | null) => void;
  reset: () => void;
}

export const useCommsStore = create<CommsState>((set) => ({
  isStreaming: false,
  currentTranscription: null,
  stages: [],
  error: null,

  setStreaming: (streaming) => set({ isStreaming: streaming }),
  setTranscription: (transcription) =>
    set({ currentTranscription: transcription, isStreaming: false }),
  addStage: (stage, data) =>
    set((s) => ({ stages: [...s.stages, { stage, data }] })),
  setError: (error) => set({ error, isStreaming: false }),
  reset: () =>
    set({ isStreaming: false, currentTranscription: null, stages: [], error: null }),
}));
