import { create } from 'zustand';
import {
  createPersistedAIState,
  selectCoverCandidate,
  toggleCardEnabledInResult,
  updateCardInResult,
} from '../lib/ai-persistence';
import { migrateToProviders } from '../lib/llm/provider-utils';
import { migrateImageProviders } from '../lib/llm/migrate-image-providers';
import { loadGlobalSettingsFile, updateGlobalSettingsFile } from '../lib/global-settings-client';
import {
  DEFAULT_JIMENG_MODEL,
  type AIAnalysisResult,
  type AICard,
  type AIStoryboardPlan,
  type AISettings,
  type CoverCandidate,
  type CoverEditState,
  type PromptBinding,
  type PromptBindingMap,
} from '../types/ai';
import type {
  PromptCategory,
  PromptKind,
  UserPromptEntry,
} from '../lib/prompts/types';
import { SCRIPT_TEMPLATE_SEEDS } from '../lib/prompts/script-template-defaults';
import type { SaveStatus } from './timeline';
import { getCurrentProjectDir } from './timeline';

export type WorkflowStep =
  | 'idle'
  | 'tts_generating'
  | 'tts_done'
  | 'ai_analyzing'
  | 'cover_generating'
  | 'arranging'
  | 'done'
  | 'error';

export interface WorkflowState {
  step: WorkflowStep;
  progress: number;
  stepLabel: string;
  error: string | null;
  canCancel: boolean;
}

export const DEFAULT_WORKFLOW: WorkflowState = {
  step: 'idle',
  progress: 0,
  stepLabel: '',
  error: null,
  canCancel: false,
};

const AI_SETTINGS_LEGACY_KEY = 'podcast-editor-ai-settings';


function buildDefaultAISettings(): AISettings {
  return {
    llmProviders: [],
    defaultProviderId: null,
    defaultModel: null,
    llmBaseUrl: '',
    llmApiKey: '',
    llmModel: '',
    enableThinking: true,
    jimengApiUrl: '',
    jimengSessionId: '',
    jimengModel: DEFAULT_JIMENG_MODEL,
    minimaxApiKey: '',
    minimaxVoiceId: 'male-qn-qingse',
    minimaxSpeed: 1.0,
    minimaxVol: 1.0,
    minimaxPitch: 0,
    minimaxEmotion: '',
    minimaxModel: 'speech-2.8-hd',
    imageProviders: [],
    defaultImageProviderId: null,
    defaultImageModel: null,
    promptBindings: {},
  };
}

export type AITab = 'cards' | 'cover' | 'motion';

export interface AIStore {
  analysisResult: AIAnalysisResult | null;
  isAnalyzing: boolean;
  analysisError: string | null;
  coverCandidates: CoverCandidate[];
  isGeneratingCovers: boolean;
  motionCards: AICard[];
  isGeneratingMotion: boolean;
  motionError: string | null;
  storyboardPlan: AIStoryboardPlan | null;
  isPlanningStoryboard: boolean;
  storyboardError: string | null;
  activeTab: AITab;
  // —— 提示词 × AI 绑定（项目级）——
  projectBindings: PromptBindingMap;
  currentProjectDir: string | null;
  loadProjectBindings: (projectDir: string | null) => Promise<void>;
  /**
   * 写入/清除单个提示词在当前项目下的 AI 绑定。
   * key 支持：PromptKind（如 'script.review'）或 userPromptBindingKey(...)（如 'user:script-template:xxx'）
   */
  setProjectBinding: (key: string, binding: PromptBinding | null) => Promise<void>;
  setGlobalBinding: (kind: PromptKind, binding: PromptBinding | null) => Promise<void>;
  // —— 用户自定义提示词条目（分类：script-template 等）——
  userPromptEntries: Record<PromptCategory, UserPromptEntry[]>;
  userPromptsLoaded: Record<PromptCategory, boolean>;
  loadUserPrompts: (category: PromptCategory) => Promise<void>;
  saveUserPrompt: (input: {
    category: PromptCategory;
    id: string;
    name: string;
    description: string;
    version?: number;
    system: string;
    user: string;
  }) => Promise<UserPromptEntry>;
  deleteUserPrompt: (category: PromptCategory, id: string) => Promise<void>;
  setAnalysisResult: (result: AIAnalysisResult) => void;
  setAnalyzing: (analyzing: boolean) => void;
  setAnalysisError: (error: string | null) => void;
  toggleCardEnabled: (cardId: string) => void;
  updateCard: (cardId: string, updates: Partial<AICard>) => void;
  setCoverCandidates: (candidates: CoverCandidate[]) => void;
  appendCoverCandidate: (candidate: CoverCandidate) => void;
  replaceCoverCandidate: (candidateId: string, patch: Partial<CoverCandidate>) => void;
  updateCoverEdits: (candidateId: string, edits: CoverEditState) => void;
  selectCover: (candidateId: string) => void;
  setGeneratingCovers: (generating: boolean) => void;
  setActiveTab: (tab: AITab) => void;
  setMotionCards: (cards: AICard[]) => void;
  addMotionCard: (card: AICard) => void;
  updateMotionCard: (cardId: string, updates: Partial<AICard>) => void;
  removeMotionCard: (cardId: string) => void;
  setGeneratingMotion: (generating: boolean) => void;
  setMotionError: (error: string | null) => void;
  setPlanningStoryboard: (planning: boolean) => void;
  setStoryboardError: (error: string | null) => void;
  setStoryboardPlan: (plan: AIStoryboardPlan | null) => void;
  clearAnalysis: () => void;
  workflow: WorkflowState;
  setWorkflow: (updates: Partial<WorkflowState>) => void;
  resetWorkflow: () => void;
}

export const useAIStore = create<AIStore>((set, get) => ({
  analysisResult: null,
  isAnalyzing: false,
  analysisError: null,
  coverCandidates: [],
  isGeneratingCovers: false,
  motionCards: [],
  isGeneratingMotion: false,
  motionError: null,
  storyboardPlan: null,
  isPlanningStoryboard: false,
  storyboardError: null,
  activeTab: 'cards',
  projectBindings: {},
  currentProjectDir: null,
  userPromptEntries: { 'script-template': [] },
  userPromptsLoaded: { 'script-template': false },
  loadUserPrompts: async (category) => {
    if (typeof window === 'undefined' || !window.electronAPI?.listUserPrompts) {
      // 非 Electron 环境：直接使用内置 seeds 作为 fallback
      if (category === 'script-template') {
        const fallback: UserPromptEntry[] = SCRIPT_TEMPLATE_SEEDS.map((seed) => ({
          id: seed.id,
          category: seed.category,
          name: seed.name,
          description: seed.description,
          version: seed.version,
          system: seed.system,
          user: seed.user,
          isBuiltin: true,
        }));
        set((state) => ({
          userPromptEntries: { ...state.userPromptEntries, [category]: fallback },
          userPromptsLoaded: { ...state.userPromptsLoaded, [category]: true },
        }));
      }
      return;
    }
    try {
      const entries = await window.electronAPI.listUserPrompts(category);
      set((state) => ({
        userPromptEntries: { ...state.userPromptEntries, [category]: entries },
        userPromptsLoaded: { ...state.userPromptsLoaded, [category]: true },
      }));
    } catch (err) {
      console.error('加载用户提示词失败:', err);
    }
  },
  saveUserPrompt: async (input) => {
    if (typeof window === 'undefined' || !window.electronAPI?.writeUserPrompt) {
      throw new Error('当前环境不支持写入用户提示词');
    }
    const entry = await window.electronAPI.writeUserPrompt(input);
    set((state) => {
      const list = state.userPromptEntries[input.category] ?? [];
      const idx = list.findIndex((e) => e.id === entry.id);
      const nextList = idx >= 0
        ? list.map((e, i) => (i === idx ? entry : e))
        : [...list, entry];
      return {
        userPromptEntries: { ...state.userPromptEntries, [input.category]: nextList },
      };
    });
    return entry;
  },
  deleteUserPrompt: async (category, id) => {
    if (typeof window === 'undefined' || !window.electronAPI?.deleteUserPrompt) {
      throw new Error('当前环境不支持删除用户提示词');
    }
    const result = await window.electronAPI.deleteUserPrompt(category, id);
    // 删除后重新从主进程拉一次（以便 seed 恢复/自定义消失都能一致反映）
    if (result.removed) {
      try {
        const entries = await window.electronAPI.listUserPrompts(category);
        set((state) => ({
          userPromptEntries: { ...state.userPromptEntries, [category]: entries },
        }));
      } catch (err) {
        console.error('删除后刷新用户提示词失败:', err);
      }
    }
  },
  loadProjectBindings: async (projectDir) => {
    // 切换为无项目状态时，清空内存快照
    if (!projectDir) {
      set({ projectBindings: {}, currentProjectDir: null });
      return;
    }
    // 非 Electron 环境（如测试渲染环境）不做任何 IO，只更新 projectDir
    if (typeof window === 'undefined' || !window.electronAPI?.readPromptBindings) {
      set({ projectBindings: {}, currentProjectDir: projectDir });
      return;
    }
    try {
      const bindings = await window.electronAPI.readPromptBindings('project', projectDir);
      set({ projectBindings: bindings ?? {}, currentProjectDir: projectDir });
    } catch (error) {
      console.error('加载项目提示词绑定失败:', error);
      set({ projectBindings: {}, currentProjectDir: projectDir });
    }
  },
  setProjectBinding: async (key, binding) => {
    const { currentProjectDir, projectBindings } = get();
    // 不可在无项目上下文写入
    if (!currentProjectDir) {
      console.warn('setProjectBinding: 无当前项目目录，已忽略');
      return;
    }
    const next: PromptBindingMap = { ...projectBindings };
    if (binding === null) {
      delete next[key];
    } else {
      next[key] = binding;
    }
    set({ projectBindings: next });
    if (typeof window !== 'undefined' && window.electronAPI?.writePromptBindings) {
      try {
        await window.electronAPI.writePromptBindings('project', next, currentProjectDir);
      } catch (error) {
        console.error('写入项目提示词绑定失败:', error);
        throw error;
      }
    }
  },
  setGlobalBinding: async (kind, binding) => {
    const current = await loadAISettings();
    const baseSettings: AISettings = current ?? buildDefaultAISettings();
    const nextBindings: PromptBindingMap = { ...(baseSettings.promptBindings ?? {}) };
    if (binding === null) {
      delete nextBindings[kind];
    } else {
      nextBindings[kind] = binding;
    }
    await saveAISettings({ ...baseSettings, promptBindings: nextBindings });
  },
  setAnalysisResult: (result) => set({ analysisResult: result, analysisError: null }),
  setAnalyzing: (analyzing) => set({ isAnalyzing: analyzing }),
  setAnalysisError: (error) =>
    set((state) => ({
      analysisError: error,
      isAnalyzing: error ? false : state.isAnalyzing,
    })),
  toggleCardEnabled: (cardId) =>
    set((state) => ({
      analysisResult: toggleCardEnabledInResult(state.analysisResult, cardId),
    })),
  updateCard: (cardId, updates) =>
    set((state) => ({
      analysisResult: updateCardInResult(state.analysisResult, cardId, updates),
    })),
  setCoverCandidates: (candidates) => set({ coverCandidates: candidates }),
  appendCoverCandidate: (candidate) =>
    set((state) => ({ coverCandidates: [...state.coverCandidates, candidate] })),
  replaceCoverCandidate: (candidateId, patch) =>
    set((state) => ({
      coverCandidates: state.coverCandidates.map((c) =>
        c.id === candidateId ? { ...c, ...patch } : c,
      ),
    })),
  updateCoverEdits: (candidateId, edits) =>
    set((state) => ({
      coverCandidates: state.coverCandidates.map((c) =>
        c.id === candidateId ? { ...c, edits } : c,
      ),
    })),
  selectCover: (candidateId) =>
    set((state) => ({
      coverCandidates: selectCoverCandidate(state.coverCandidates, candidateId),
    })),
  setGeneratingCovers: (generating) => set({ isGeneratingCovers: generating }),
  setActiveTab: (tab) => set({ activeTab: tab }),
  setMotionCards: (cards) => set({ motionCards: cards }),
  addMotionCard: (card) =>
    set((state) => ({
      motionCards: [...state.motionCards, card],
    })),
  updateMotionCard: (cardId, updates) =>
    set((state) => ({
      motionCards: state.motionCards.map((card) =>
        card.id === cardId ? { ...card, ...updates } : card,
      ),
    })),
  removeMotionCard: (cardId) =>
    set((state) => ({
      motionCards: state.motionCards.filter((card) => card.id !== cardId),
    })),
  setGeneratingMotion: (generating) => set({ isGeneratingMotion: generating }),
  setMotionError: (error) => set({ motionError: error }),
  setPlanningStoryboard: (planning) => set({ isPlanningStoryboard: planning }),
  setStoryboardError: (error) =>
    set((state) => ({
      storyboardError: error,
      isPlanningStoryboard: error ? false : state.isPlanningStoryboard,
    })),
  setStoryboardPlan: (plan) => set({ storyboardPlan: plan, storyboardError: null }),
  clearAnalysis: () =>
    set({
      analysisResult: null,
      analysisError: null,
      coverCandidates: [],
      motionCards: [],
      motionError: null,
      isGeneratingMotion: false,
      storyboardPlan: null,
      isPlanningStoryboard: false,
      storyboardError: null,
    }),
  workflow: { ...DEFAULT_WORKFLOW },
  setWorkflow: (updates) =>
    set((state) => ({
      workflow: { ...state.workflow, ...updates },
    })),
  resetWorkflow: () => set({ workflow: { ...DEFAULT_WORKFLOW } }),
}));

export async function loadAISettings(): Promise<AISettings | null> {
  // 优先从 Electron 全局存储读取
  if (typeof window !== 'undefined' && window.electronAPI) {
    try {
      const file = await loadGlobalSettingsFile();
      if (file?.aiSettings) {
        const hadProviders =
          Array.isArray(file.aiSettings.llmProviders) &&
          file.aiSettings.llmProviders.length > 0;
        const settings: AISettings = {
          ...file.aiSettings,
          llmProviders: file.aiSettings.llmProviders ?? [],
          defaultProviderId: file.aiSettings.defaultProviderId ?? null,
          defaultModel: file.aiSettings.defaultModel ?? null,
          enableThinking: file.aiSettings.enableThinking ?? true,
          jimengModel: file.aiSettings.jimengModel?.trim() || DEFAULT_JIMENG_MODEL,
          minimaxApiKey: file.aiSettings.minimaxApiKey ?? '',
          minimaxVoiceId: file.aiSettings.minimaxVoiceId ?? 'male-qn-qingse',
          minimaxSpeed: file.aiSettings.minimaxSpeed ?? 1.0,
          minimaxVol: file.aiSettings.minimaxVol ?? 1.0,
          minimaxPitch: file.aiSettings.minimaxPitch ?? 0,
          minimaxEmotion: file.aiSettings.minimaxEmotion ?? '',
          minimaxModel: file.aiSettings.minimaxModel ?? 'speech-2.8-hd',
          imageProviders: file.aiSettings.imageProviders ?? [],
          defaultImageProviderId: file.aiSettings.defaultImageProviderId ?? null,
          defaultImageModel: file.aiSettings.defaultImageModel ?? null,
          promptBindings: file.aiSettings.promptBindings ?? {},
        };
        const providerMigrated = migrateToProviders(settings);
        const imageMigrated = migrateImageProviders(providerMigrated);
        const llmChanged = !hadProviders && providerMigrated.llmProviders.length > 0;
        const imageChanged = imageMigrated !== providerMigrated;
        if (llmChanged || imageChanged) {
          void saveAISettings(imageMigrated);
        }
        return imageMigrated;
      }
    } catch {
      // fallthrough to legacy
    }
  }

  // 兼容：从 localStorage 读取旧数据并自动迁移
  if (typeof window !== 'undefined' && typeof window.localStorage !== 'undefined') {
    const rawValue = window.localStorage.getItem(AI_SETTINGS_LEGACY_KEY);
    if (rawValue) {
      try {
        const parsed = JSON.parse(rawValue) as AISettings;
        const raw: AISettings = {
          ...parsed,
          llmProviders: parsed.llmProviders ?? [],
          defaultProviderId: parsed.defaultProviderId ?? null,
          defaultModel: parsed.defaultModel ?? null,
          enableThinking: parsed.enableThinking ?? true,
          jimengModel: parsed.jimengModel?.trim() || DEFAULT_JIMENG_MODEL,
          minimaxApiKey: parsed.minimaxApiKey ?? '',
          minimaxVoiceId: parsed.minimaxVoiceId ?? 'male-qn-qingse',
          minimaxSpeed: parsed.minimaxSpeed ?? 1.0,
          minimaxVol: parsed.minimaxVol ?? 1.0,
          minimaxPitch: parsed.minimaxPitch ?? 0,
          minimaxEmotion: parsed.minimaxEmotion ?? '',
          minimaxModel: parsed.minimaxModel ?? 'speech-2.8-hd',
          imageProviders: parsed.imageProviders ?? [],
          defaultImageProviderId: parsed.defaultImageProviderId ?? null,
          defaultImageModel: parsed.defaultImageModel ?? null,
          promptBindings: parsed.promptBindings ?? {},
        };
        const providerMigrated = migrateToProviders(raw);
        const settings = migrateImageProviders(providerMigrated);
        // 自动迁移到 Electron 全局存储（saveAISettings 会刷新缓存）
        await saveAISettings(settings);
        window.localStorage.removeItem(AI_SETTINGS_LEGACY_KEY);
        return settings;
      } catch {
        return null;
      }
    }
  }

  return null;
}

export async function saveAISettings(settings: AISettings): Promise<void> {
  const normalized: AISettings = {
    ...settings,
    jimengModel: settings.jimengModel?.trim() || DEFAULT_JIMENG_MODEL,
  };
  if (typeof window !== 'undefined' && window.electronAPI) {
    await updateGlobalSettingsFile((current) => ({
      ...current,
      aiSettings: normalized,
    }));
  }
}

// ─── AI Save Status ──────────────────────────────────────────────────────────

let currentAISaveStatus: SaveStatus = 'idle';
const aiSaveStatusListeners = new Set<(status: SaveStatus) => void>();

function emitAISaveStatus(status: SaveStatus): void {
  currentAISaveStatus = status;
  for (const listener of aiSaveStatusListeners) {
    listener(status);
  }
}

export function getCurrentAISaveStatus(): SaveStatus {
  return currentAISaveStatus;
}

export function subscribeToAISaveStatus(listener: (status: SaveStatus) => void): () => void {
  aiSaveStatusListeners.add(listener);
  listener(currentAISaveStatus);
  return () => {
    aiSaveStatusListeners.delete(listener);
  };
}

// ─── Auto-save subscription ──────────────────────────────────────────────────

let aiSaveTimer: ReturnType<typeof setTimeout> | null = null;

if (typeof window !== 'undefined') {
  useAIStore.subscribe((state, prevState) => {
    if (
      state.analysisResult === prevState.analysisResult &&
      state.coverCandidates === prevState.coverCandidates &&
      state.motionCards === prevState.motionCards &&
      state.storyboardPlan === prevState.storyboardPlan
    ) {
      return;
    }

    const projectDir = getCurrentProjectDir();
    if (!projectDir || !window.electronAPI?.saveProjectSection) {
      return;
    }

    emitAISaveStatus('saving');
    if (aiSaveTimer) {
      clearTimeout(aiSaveTimer);
    }

    aiSaveTimer = setTimeout(() => {
      const persistedState = createPersistedAIState(
        state.analysisResult,
        state.coverCandidates,
        state.motionCards,
        state.storyboardPlan,
      );
      void window.electronAPI
        .saveProjectSection(projectDir, 'aiAnalysis', JSON.stringify(persistedState))
        .then(() => {
          emitAISaveStatus('saved');
        })
        .catch((error) => {
          console.error('保存 AI 分析数据失败:', error);
          emitAISaveStatus('error');
        });
    }, 300);
  });
}
