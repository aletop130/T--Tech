import { create } from 'zustand';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface SatelliteResearch {
  report: string | null;
  logs: string[];
  chatMessages: ChatMessage[];
}

interface AdversaryState {
  research: Record<string, SatelliteResearch>;
  getResearch: (satId: string) => SatelliteResearch;
  setReport: (satId: string, report: string) => void;
  appendToReport: (satId: string, section: string) => void;
  setLogs: (satId: string, logs: string[]) => void;
  appendLog: (satId: string, log: string) => void;
  clearLogs: (satId: string) => void;
  setChatMessages: (satId: string, messages: ChatMessage[]) => void;
  appendChatMessage: (satId: string, message: ChatMessage) => void;
}

const EMPTY_RESEARCH: SatelliteResearch = { report: null, logs: [], chatMessages: [] };

export const useAdversaryStore = create<AdversaryState>((set, get) => ({
  research: {},

  getResearch: (satId) => get().research[satId] ?? EMPTY_RESEARCH,

  setReport: (satId, report) =>
    set((s) => ({
      research: { ...s.research, [satId]: { ...(s.research[satId] ?? EMPTY_RESEARCH), report } },
    })),

  appendToReport: (satId, section) =>
    set((s) => {
      const existing = s.research[satId] ?? EMPTY_RESEARCH;
      const newReport = existing.report ? existing.report + '\n\n' + section : section;
      return { research: { ...s.research, [satId]: { ...existing, report: newReport } } };
    }),

  setLogs: (satId, logs) =>
    set((s) => ({
      research: { ...s.research, [satId]: { ...(s.research[satId] ?? EMPTY_RESEARCH), logs } },
    })),

  appendLog: (satId, log) =>
    set((s) => {
      const existing = s.research[satId] ?? EMPTY_RESEARCH;
      return { research: { ...s.research, [satId]: { ...existing, logs: [...existing.logs, log] } } };
    }),

  clearLogs: (satId) =>
    set((s) => ({
      research: { ...s.research, [satId]: { ...(s.research[satId] ?? EMPTY_RESEARCH), logs: [] } },
    })),

  setChatMessages: (satId, messages) =>
    set((s) => ({
      research: { ...s.research, [satId]: { ...(s.research[satId] ?? EMPTY_RESEARCH), chatMessages: messages } },
    })),

  appendChatMessage: (satId, message) =>
    set((s) => {
      const existing = s.research[satId] ?? EMPTY_RESEARCH;
      return { research: { ...s.research, [satId]: { ...existing, chatMessages: [...existing.chatMessages, message] } } };
    }),
}));
