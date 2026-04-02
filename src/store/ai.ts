import { create } from 'zustand';
import {
  selectCoverCandidate,
  toggleCardEnabledInResult,
  updateCardInResult,
} from '../lib/ai-persistence';
import type { AIAnalysisResult, AICard, AISettings, CoverCandidate } from '../types/ai';

const AI_SETTINGS_KEY = 'podcast-editor-ai-settings';

export type AITab = 'cards' | 'cover';

export interface AIStore {
  analysisResult: AIAnalysisResult | null;
  isAnalyzing: boolean;
  analysisError: string | null;
  coverCandidates: CoverCandidate[];
  isGeneratingCovers: boolean;
  activeTab: AITab;
  setAnalysisResult: (result: AIAnalysisResult) => void;
  setAnalyzing: (analyzing: boolean) => void;
  setAnalysisError: (error: string | null) => void;
  toggleCardEnabled: (cardId: string) => void;
  updateCard: (cardId: string, updates: Partial<AICard>) => void;
  setCoverCandidates: (candidates: CoverCandidate[]) => void;
  selectCover: (candidateId: string) => void;
  setGeneratingCovers: (generating: boolean) => void;
  setActiveTab: (tab: AITab) => void;
  clearAnalysis: () => void;
}

export const useAIStore = create<AIStore>((set) => ({
  analysisResult: null,
  isAnalyzing: false,
  analysisError: null,
  coverCandidates: [],
  isGeneratingCovers: false,
  activeTab: 'cards',
  setAnalysisResult: (result) => set({ analysisResult: result, analysisError: null }),
  setAnalyzing: (analyzing) => set({ isAnalyzing: analyzing }),
  setAnalysisError: (error) => set({ analysisError: error, isAnalyzing: false }),
  toggleCardEnabled: (cardId) =>
    set((state) => ({
      analysisResult: toggleCardEnabledInResult(state.analysisResult, cardId),
    })),
  updateCard: (cardId, updates) =>
    set((state) => ({
      analysisResult: updateCardInResult(state.analysisResult, cardId, updates),
    })),
  setCoverCandidates: (candidates) => set({ coverCandidates: candidates }),
  selectCover: (candidateId) =>
    set((state) => ({
      coverCandidates: selectCoverCandidate(state.coverCandidates, candidateId),
    })),
  setGeneratingCovers: (generating) => set({ isGeneratingCovers: generating }),
  setActiveTab: (tab) => set({ activeTab: tab }),
  clearAnalysis: () => set({ analysisResult: null, analysisError: null, coverCandidates: [] }),
}));

export function loadAISettings(): AISettings | null {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return null;
  }

  const rawValue = window.localStorage.getItem(AI_SETTINGS_KEY);
  if (!rawValue) {
    return null;
  }

  try {
    return JSON.parse(rawValue) as AISettings;
  } catch {
    return null;
  }
}

export function saveAISettings(settings: AISettings): void {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return;
  }

  window.localStorage.setItem(AI_SETTINGS_KEY, JSON.stringify(settings));
}
