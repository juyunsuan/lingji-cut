import { create } from 'zustand';
import { v4 as uuid } from 'uuid';
import {
  createPersistedAIState,
  selectCoverCandidate,
  toggleCardEnabledInResult,
  updateCardInResult,
} from '../lib/ai-persistence';
import { migrateToProviders } from '../lib/llm/provider-utils';
import { migrateImageProviders } from '../lib/llm/migrate-image-providers';
import { normalizeTTSSettings } from '../lib/tts-settings';
import { loadGlobalSettingsFile, updateGlobalSettingsFile } from '../lib/global-settings-client';
import {
  DEFAULT_CARD_STYLE,
  DEFAULT_JIMENG_MODEL,
  getDefaultTemplate,
  type AIAnalysisResult,
  type AICard,
  type AICardDisplayMode,
  type AISettings,
  type CoverCandidate,
  type CoverEditState,
  type ImageAspectRatio,
  type MediaCardContent,
  type PromptBinding,
  type PromptBindingMap,
  type VideoAspectRatio,
} from '../types/ai';
import { useTaskProgressStore } from './task-progress';
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
  | 'douyin_importing'
  | 'script_generating'
  | 'tts_generating'
  | 'tts_done'
  | 'ai_analyzing'
  | 'cover_generating'
  | 'arranging'
  | 'done'
  | 'error';

export interface AutoWorkflowParams {
  templateId: string;
  roleId: string;
  voiceId: string;
}

export interface WorkflowState {
  step: WorkflowStep;
  progress: number;
  stepLabel: string;
  error: string | null;
  canCancel: boolean;
  /** 进入 error 态时由阶段回调写入，AutoRunOverlay 用于决定跳转目标。 */
  failedStep: WorkflowStep | null;
}

export const DEFAULT_WORKFLOW: WorkflowState = {
  step: 'idle',
  progress: 0,
  stepLabel: '',
  error: null,
  canCancel: false,
  failedStep: null,
};

const AI_SETTINGS_LEGACY_KEY = 'podcast-editor-ai-settings';

const MEDIA_DEFAULT_DURATION_MS: Record<'image' | 'video', number> = {
  image: 5_000,
  video: 6_000,
};

interface MediaCardSkeletonOptions {
  prompt?: string;
  aspectRatio: ImageAspectRatio | VideoAspectRatio;
  displayMode: AICardDisplayMode;
  durationSeconds?: number;
}

function buildMediaCardSkeleton(
  type: 'image' | 'video',
  segmentId: string,
  analysis: AIAnalysisResult | null,
  opts: MediaCardSkeletonOptions,
): AICard {
  const segment = analysis?.segments.find((s) => s.id === segmentId);
  const fallbackTitle = type === 'image' ? '图片卡' : '视频卡';
  const title = segment?.title?.trim() || fallbackTitle;
  const promptFallback = opts.prompt ?? segment?.summary ?? '';
  const startMs = segment?.startMs ?? 0;
  const endMs = segment?.endMs ?? startMs;
  const displayDurationMs =
    type === 'video' && typeof opts.durationSeconds === 'number'
      ? Math.max(1000, Math.round(opts.durationSeconds * 1000))
      : MEDIA_DEFAULT_DURATION_MS[type];

  const content: MediaCardContent = {
    mediaType: type,
    assetPath: null,
    aspectRatio: opts.aspectRatio as ImageAspectRatio,
    prompt: promptFallback,
    providerId: null,
    model: null,
    generationStatus: 'idle',
  };

  return {
    id: uuid(),
    segmentId,
    type,
    title,
    content,
    startMs,
    endMs,
    displayDurationMs,
    displayMode: opts.displayMode,
    template: getDefaultTemplate(type),
    enabled: true,
    style: { ...DEFAULT_CARD_STYLE[type] },
  };
}

function appendCardToStore(
  set: (
    partial:
      | Partial<AIStore>
      | ((state: AIStore) => Partial<AIStore>),
  ) => void,
  get: () => AIStore,
  card: AICard,
): void {
  const current = get().analysisResult;
  if (!current) {
    const empty: AIAnalysisResult = {
      segments: [],
      cards: [card],
      coverPrompts: [],
      summary: '',
      keywords: [],
    };
    set({ analysisResult: empty });
    return;
  }
  set({
    analysisResult: { ...current, cards: [...current.cards, card] },
  });
}


/**
 * 规范化卡片生成并发数：必须为 >= 1 的整数；非法值回退到默认 2。
 */
function normalizeConcurrency(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 2;
  const n = Math.floor(value);
  return n >= 1 ? n : 2;
}

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
    ttsProviders: [],
    defaultTtsProviderId: null,
    defaultTtsVoiceId: null,
    ttsVoices: [],
    imageProviders: [],
    defaultImageProviderId: null,
    defaultImageModel: null,
    globalCoverImagePrompt: '',
    videoProviders: [],
    defaultVideoProviderId: null,
    defaultVideoModel: null,
    promptBindings: {},
    cardGenerationConcurrency: 2,
  };
}

export type AITab = 'cards' | 'cover';

export interface AIStore {
  analysisResult: AIAnalysisResult | null;
  isAnalyzing: boolean;
  analysisError: string | null;
  coverCandidates: CoverCandidate[];
  isGeneratingCovers: boolean;
  pendingAutoParams: AutoWorkflowParams | null;
  setPendingAutoParams: (params: AutoWorkflowParams | null) => void;
  /**
   * auto-run 恢复起点：AutoRunResumeBanner 触发恢复时写入，
   * AutoRunController 在起跑 useAIVideoWorkflow.start 时作为 startFromStep。
   * 离开 auto-run 页或恢复完成后由 AutoRunController 清空。
   */
  pendingAutoResumeStep: Extract<
    WorkflowStep,
    'script_generating' | 'tts_generating' | 'ai_analyzing' | 'cover_generating' | 'arranging'
  > | null;
  setPendingAutoResumeStep: (
    step:
      | Extract<
          WorkflowStep,
          'script_generating' | 'tts_generating' | 'ai_analyzing' | 'cover_generating' | 'arranging'
        >
      | null,
  ) => void;
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
  // —— 媒体卡（image/video）actions ——
  cardMediaTasks: Record<string, { taskId: string; phase: string; percent: number }>;
  createImageCard: (
    segmentId: string,
    opts?: {
      prompt?: string;
      aspectRatio?: ImageAspectRatio;
      displayMode?: AICardDisplayMode;
    },
  ) => Promise<AICard>;
  createVideoCard: (
    segmentId: string,
    opts?: {
      prompt?: string;
      aspectRatio?: VideoAspectRatio;
      durationSeconds?: number;
      displayMode?: AICardDisplayMode;
    },
  ) => Promise<AICard>;
  regenerateCardMedia: (
    cardId: string,
    overrides?: Partial<MediaCardContent>,
  ) => Promise<void>;
  /**
   * 把现有卡片转换为 image/video 卡，保持 cardId / segmentId / 时间区间 / displayMode 不变。
   * 用于「转为图片卡」「转为视频卡」入口；返回新 card；若卡片不存在或目标类型与当前一致则返回 null。
   */
  convertCardToMedia: (
    cardId: string,
    mediaType: 'image' | 'video',
  ) => Promise<AICard | null>;
  cancelCardMediaGeneration: (cardId: string) => Promise<void>;
  deleteCard: (cardId: string) => Promise<void>;
  setCoverCandidates: (candidates: CoverCandidate[]) => void;
  appendCoverCandidate: (candidate: CoverCandidate) => void;
  replaceCoverCandidate: (candidateId: string, patch: Partial<CoverCandidate>) => void;
  updateCoverEdits: (candidateId: string, edits: CoverEditState) => void;
  selectCover: (candidateId: string) => void;
  setGeneratingCovers: (generating: boolean) => void;
  setActiveTab: (tab: AITab) => void;
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
  pendingAutoParams: null,
  pendingAutoResumeStep: null,
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
  cardMediaTasks: {},
  createImageCard: async (segmentId, opts) => {
    const card = buildMediaCardSkeleton('image', segmentId, get().analysisResult, {
      prompt: opts?.prompt,
      aspectRatio: opts?.aspectRatio ?? '16:9',
      displayMode: opts?.displayMode ?? 'fullscreen',
    });
    appendCardToStore(set, get, card);
    return card;
  },
  createVideoCard: async (segmentId, opts) => {
    const durationSeconds = opts?.durationSeconds ?? 6;
    const card = buildMediaCardSkeleton('video', segmentId, get().analysisResult, {
      prompt: opts?.prompt,
      aspectRatio: opts?.aspectRatio ?? '16:9',
      displayMode: opts?.displayMode ?? 'fullscreen',
      durationSeconds,
    });
    appendCardToStore(set, get, card);
    return card;
  },
  convertCardToMedia: async (cardId, mediaType) => {
    const state = get();
    const result = state.analysisResult;
    const card = result?.cards.find((c) => c.id === cardId);
    if (!card) return null;
    if (card.type === mediaType) return null;

    // prompt 种子：原 title + segment.summary（若可用）
    const segment = result?.segments.find((s) => s.id === card.segmentId);
    const seedParts: string[] = [];
    if (card.title?.trim()) seedParts.push(card.title.trim());
    if (segment?.summary?.trim()) seedParts.push(segment.summary.trim());
    const seedPrompt = seedParts.join('\n');

    const defaultDurationMs = MEDIA_DEFAULT_DURATION_MS[mediaType];
    const newContent: MediaCardContent = {
      mediaType,
      assetPath: null,
      aspectRatio: '16:9',
      prompt: seedPrompt,
      providerId: null,
      model: null,
      generationStatus: 'idle',
    };

    const newCard: AICard = {
      ...card,
      type: mediaType,
      content: newContent,
      template: getDefaultTemplate(mediaType),
      style: { ...DEFAULT_CARD_STYLE[mediaType] },
      // image/video 默认时长按媒体默认；保留原 displayDurationMs 当其有效
      displayDurationMs:
        card.displayDurationMs && card.displayDurationMs > 0
          ? card.displayDurationMs
          : defaultDurationMs,
    };

    set((s) => {
      if (!s.analysisResult) return {};
      return {
        analysisResult: {
          ...s.analysisResult,
          cards: s.analysisResult.cards.map((c) => (c.id === cardId ? newCard : c)),
        },
      };
    });
    return newCard;
  },
  regenerateCardMedia: async (cardId, overrides) => {
    const state = get();
    const result = state.analysisResult;
    const card = result?.cards.find((c) => c.id === cardId);
    if (!card || (card.type !== 'image' && card.type !== 'video')) {
      throw new Error(`regenerateCardMedia: 卡片不存在或类型非 image/video: ${cardId}`);
    }
    const baseContent = card.content as MediaCardContent;
    const mergedContent: MediaCardContent = {
      ...baseContent,
      ...(overrides ?? {}),
      generationStatus: 'generating',
      errorMessage: undefined,
    };

    // 先把 generating 状态写回 store
    set((s) => ({
      analysisResult: updateCardInResult(s.analysisResult, cardId, {
        content: mergedContent,
      }),
    }));

    const taskId = `card-media-${cardId}`;
    const cardTypeLabel = card.type === 'image' ? '图片卡' : '视频卡';
    const taskProgress = useTaskProgressStore.getState();
    taskProgress.startTask({
      id: taskId,
      category: card.type === 'image' ? 'cover' : 'export',
      label: `生成${cardTypeLabel}：${card.title}`,
      mode: 'determinate',
      progress: 0,
      phase: '准备生成',
      level: 1,
      canCancel: true,
      onCancel: () => {
        void get().cancelCardMediaGeneration(cardId);
      },
    });

    set((s) => ({
      cardMediaTasks: {
        ...s.cardMediaTasks,
        [cardId]: { taskId, phase: '准备生成', percent: 0 },
      },
    }));

    let unsubscribe: (() => void) | null = null;
    if (typeof window !== 'undefined' && window.electronAPI?.onCardMediaProgress) {
      unsubscribe = window.electronAPI.onCardMediaProgress((payload) => {
        if (payload.cardId !== cardId) return;
        const phase = payload.phase ?? payload.message ?? '生成中';
        const percent = typeof payload.percent === 'number' ? payload.percent : 0;
        useTaskProgressStore.getState().updateTask(taskId, {
          progress: percent,
          phase,
        });
        set((s) => ({
          cardMediaTasks: {
            ...s.cardMediaTasks,
            [cardId]: { taskId, phase, percent },
          },
        }));
      });
    }

    const cleanup = () => {
      if (unsubscribe) {
        try {
          unsubscribe();
        } catch {
          // ignore
        }
        unsubscribe = null;
      }
      set((s) => {
        const next = { ...s.cardMediaTasks };
        delete next[cardId];
        return { cardMediaTasks: next };
      });
    };

    try {
      if (typeof window === 'undefined' || !window.electronAPI) {
        throw new Error('当前环境不支持媒体生成 IPC');
      }
      const projectDir = get().currentProjectDir ?? '';
      const settings = (await loadAISettings()) ?? buildDefaultAISettings();
      const projectBindings = get().projectBindings;
      let nextContent: MediaCardContent;
      if (card.type === 'image') {
        nextContent = await window.electronAPI.generateCardImage({
          projectDir,
          cardId,
          prompt: mergedContent.prompt,
          negativePrompt: mergedContent.negativePrompt,
          aspectRatio: mergedContent.aspectRatio,
          providerId: mergedContent.providerId,
          model: mergedContent.model,
          extraParams: mergedContent.extraParams,
          settings,
          projectBindings,
        });
      } else {
        // video 仅接受 16:9 / 9:16 / 1:1
        const ar = mergedContent.aspectRatio as VideoAspectRatio;
        const durationSeconds = Math.max(
          1,
          Math.round((card.displayDurationMs ?? 6000) / 1000),
        );
        nextContent = await window.electronAPI.generateCardVideo({
          projectDir,
          cardId,
          prompt: mergedContent.prompt,
          negativePrompt: mergedContent.negativePrompt,
          aspectRatio: ar,
          durationSeconds,
          providerId: mergedContent.providerId,
          model: mergedContent.model,
          extraParams: mergedContent.extraParams,
          settings,
          projectBindings,
        });
      }

      // 写回新 content；video 卡同步 displayDurationMs
      set((s) => {
        const updates: Partial<AICard> = { content: nextContent };
        if (card.type === 'video' && nextContent.mediaDurationMs && nextContent.mediaDurationMs > 0) {
          updates.displayDurationMs = nextContent.mediaDurationMs;
        }
        return {
          analysisResult: updateCardInResult(s.analysisResult, cardId, updates),
        };
      });
      useTaskProgressStore.getState().completeTask(taskId);
      cleanup();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // 若非 cancelled，标记 failed
      const currentCard = get().analysisResult?.cards.find((c) => c.id === cardId);
      const currentStatus =
        currentCard && (currentCard.content as MediaCardContent)?.generationStatus;
      if (currentStatus !== 'cancelled') {
        set((s) => ({
          analysisResult: updateCardInResult(s.analysisResult, cardId, {
            content: {
              ...mergedContent,
              generationStatus: 'failed',
              errorMessage: message,
            },
          }),
        }));
        useTaskProgressStore.getState().failTask(taskId, message);
      }
      cleanup();
    }
  },
  cancelCardMediaGeneration: async (cardId) => {
    const state = get();
    const taskEntry = state.cardMediaTasks[cardId];
    const card = state.analysisResult?.cards.find((c) => c.id === cardId);
    if (typeof window !== 'undefined' && window.electronAPI?.cancelCardMediaGeneration) {
      try {
        await window.electronAPI.cancelCardMediaGeneration(cardId);
      } catch (error) {
        console.error('取消媒体卡生成失败:', error);
      }
    }
    if (card && (card.type === 'image' || card.type === 'video')) {
      const baseContent = card.content as MediaCardContent;
      set((s) => ({
        analysisResult: updateCardInResult(s.analysisResult, cardId, {
          content: {
            ...baseContent,
            generationStatus: 'cancelled',
          },
        }),
      }));
    }
    if (taskEntry) {
      useTaskProgressStore.getState().failTask(taskEntry.taskId, 'cancelled');
      set((s) => {
        const next = { ...s.cardMediaTasks };
        delete next[cardId];
        return { cardMediaTasks: next };
      });
    }
  },
  deleteCard: async (cardId) => {
    const state = get();
    const result = state.analysisResult;
    const card = result?.cards.find((c) => c.id === cardId);
    // 媒体卡：先清理资产
    if (card && (card.type === 'image' || card.type === 'video')) {
      const projectDir = state.currentProjectDir;
      if (
        projectDir &&
        typeof window !== 'undefined' &&
        window.electronAPI?.deleteCardMediaAssets
      ) {
        try {
          await window.electronAPI.deleteCardMediaAssets(projectDir, cardId);
        } catch (error) {
          console.error('删除媒体卡资产失败:', error);
        }
      }
    }
    set((s) => {
      if (!s.analysisResult) return {};
      return {
        analysisResult: {
          ...s.analysisResult,
          cards: s.analysisResult.cards.filter((c) => c.id !== cardId),
        },
      };
    });
  },
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
  setPendingAutoParams: (params) => set({ pendingAutoParams: params }),
  setPendingAutoResumeStep: (step) => set({ pendingAutoResumeStep: step }),
  clearAnalysis: () =>
    set({
      analysisResult: null,
      analysisError: null,
      coverCandidates: [],
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
          ttsProviders: file.aiSettings.ttsProviders ?? [],
          defaultTtsProviderId: file.aiSettings.defaultTtsProviderId ?? null,
          defaultTtsVoiceId: file.aiSettings.defaultTtsVoiceId ?? null,
          ttsVoices: file.aiSettings.ttsVoices ?? [],
          imageProviders: file.aiSettings.imageProviders ?? [],
          defaultImageProviderId: file.aiSettings.defaultImageProviderId ?? null,
          defaultImageModel: file.aiSettings.defaultImageModel ?? null,
          globalCoverImagePrompt: file.aiSettings.globalCoverImagePrompt ?? '',
          videoProviders: file.aiSettings.videoProviders ?? [],
          defaultVideoProviderId: file.aiSettings.defaultVideoProviderId ?? null,
          defaultVideoModel: file.aiSettings.defaultVideoModel ?? null,
          promptBindings: file.aiSettings.promptBindings ?? {},
          cardGenerationConcurrency: normalizeConcurrency(
            file.aiSettings.cardGenerationConcurrency,
          ),
        };
        const providerMigrated = migrateToProviders(settings);
        const imageMigrated = migrateImageProviders(providerMigrated);
        const ttsMigrated = normalizeTTSSettings(imageMigrated);
        const llmChanged = !hadProviders && providerMigrated.llmProviders.length > 0;
        const imageChanged = imageMigrated !== providerMigrated;
        const ttsChanged =
          !Array.isArray(file.aiSettings.ttsProviders) ||
          file.aiSettings.ttsProviders.length === 0 ||
          file.aiSettings.defaultTtsProviderId !== ttsMigrated.defaultTtsProviderId ||
          file.aiSettings.defaultTtsVoiceId !== ttsMigrated.defaultTtsVoiceId;
        if (llmChanged || imageChanged || ttsChanged) {
          void saveAISettings(ttsMigrated);
        }
        return ttsMigrated;
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
          ttsProviders: parsed.ttsProviders ?? [],
          defaultTtsProviderId: parsed.defaultTtsProviderId ?? null,
          defaultTtsVoiceId: parsed.defaultTtsVoiceId ?? null,
          ttsVoices: parsed.ttsVoices ?? [],
          imageProviders: parsed.imageProviders ?? [],
          defaultImageProviderId: parsed.defaultImageProviderId ?? null,
          defaultImageModel: parsed.defaultImageModel ?? null,
          globalCoverImagePrompt: parsed.globalCoverImagePrompt ?? '',
          videoProviders: parsed.videoProviders ?? [],
          defaultVideoProviderId: parsed.defaultVideoProviderId ?? null,
          defaultVideoModel: parsed.defaultVideoModel ?? null,
          promptBindings: parsed.promptBindings ?? {},
          cardGenerationConcurrency: normalizeConcurrency(parsed.cardGenerationConcurrency),
        };
        const providerMigrated = migrateToProviders(raw);
        const settings = normalizeTTSSettings(migrateImageProviders(providerMigrated));
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
  const normalized: AISettings = normalizeTTSSettings({
    ...settings,
    jimengModel: settings.jimengModel?.trim() || DEFAULT_JIMENG_MODEL,
  });
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
      state.coverCandidates === prevState.coverCandidates
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
