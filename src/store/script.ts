import { create } from 'zustand';
import {
  createPersistedScriptState,
  debouncedSaveState,
  persistScriptProjectDir,
} from '../lib/script-persistence';

export type ScriptStep = 1 | 2 | 3 | 4 | 5;

export type AnnotationSeverity = 'error' | 'warning' | 'info';
export type AnnotationStatus = 'pending' | 'accepted' | 'dismissed';

export interface Annotation {
  id: string;
  startOffset: number;
  endOffset: number;
  originalText: string;
  issue: string;
  suggestion: string;
  severity: AnnotationSeverity;
  status: AnnotationStatus;
}

interface ScriptState {
  projectDir: string | null;
  currentStep: ScriptStep;
  originalText: string;
  scriptText: string;
  selectedTemplate: string;
  annotations: Annotation[];
  generating: boolean;
  reviewing: boolean;
}

interface ScriptActions {
  setProjectDir: (dir: string | null) => void;
  setCurrentStep: (step: ScriptStep) => void;
  setOriginalText: (text: string) => void;
  setScriptText: (text: string) => void;
  setSelectedTemplate: (id: string) => void;
  setAnnotations: (annotations: Annotation[]) => void;
  setGenerating: (generating: boolean) => void;
  setReviewing: (reviewing: boolean) => void;
  acceptAnnotation: (id: string) => void;
  dismissAnnotation: (id: string) => void;
  acceptAllAnnotations: () => void;
  restoreState: (params: {
    projectDir: string;
    currentStep: ScriptStep;
    originalText: string;
    scriptText: string;
    selectedTemplate: string;
    annotations: Annotation[];
  }) => void;
  reset: () => void;
}

const initialState: ScriptState = {
  projectDir: null,
  currentStep: 1,
  originalText: '',
  scriptText: '',
  selectedTemplate: 'news-broadcast',
  annotations: [],
  generating: false,
  reviewing: false,
};

export const useScriptStore = create<ScriptState & ScriptActions>((set, get) => ({
  ...initialState,

  setProjectDir: (dir) => {
    set({ projectDir: dir });
    persistScriptProjectDir(dir);
  },
  setCurrentStep: (step) => set({ currentStep: step }),
  setOriginalText: (text) => set({ originalText: text }),
  setScriptText: (text) => set({ scriptText: text }),
  setSelectedTemplate: (id) => set({ selectedTemplate: id }),
  setAnnotations: (annotations) => set({ annotations }),
  setGenerating: (generating) => set({ generating }),
  setReviewing: (reviewing) => set({ reviewing }),

  acceptAnnotation: (id) => {
    const { annotations, scriptText } = get();
    const annotation = annotations.find((a) => a.id === id);
    if (!annotation || annotation.status !== 'pending') return;

    const updatedText = scriptText.replace(annotation.originalText, annotation.suggestion);
    set({
      scriptText: updatedText,
      annotations: annotations.map((a) =>
        a.id === id ? { ...a, status: 'accepted' as const } : a,
      ),
    });
  },

  dismissAnnotation: (id) => {
    set({
      annotations: get().annotations.map((a) =>
        a.id === id ? { ...a, status: 'dismissed' as const } : a,
      ),
    });
  },

  acceptAllAnnotations: () => {
    const { annotations, scriptText } = get();
    const pending = annotations.filter((a) => a.status === 'pending');
    // 按 startOffset 降序排列，避免替换时偏移错位
    const sorted = [...pending].sort((a, b) => b.startOffset - a.startOffset);

    let updatedText = scriptText;
    for (const annotation of sorted) {
      updatedText = updatedText.replace(annotation.originalText, annotation.suggestion);
    }

    set({
      scriptText: updatedText,
      annotations: annotations.map((a) =>
        a.status === 'pending' ? { ...a, status: 'accepted' as const } : a,
      ),
    });
  },

  restoreState: (params) =>
    set({
      projectDir: params.projectDir,
      currentStep: params.currentStep,
      originalText: params.originalText,
      scriptText: params.scriptText,
      selectedTemplate: params.selectedTemplate,
      annotations: params.annotations,
      generating: false,
      reviewing: false,
    }),

  reset: () => {
    set(initialState);
    persistScriptProjectDir(null);
  },
}));

// 自动保存：当 step / template / annotations 变化时，防抖写入 script-state.json
useScriptStore.subscribe((state, prevState) => {
  if (!state.projectDir) return;

  const changed =
    state.currentStep !== prevState.currentStep ||
    state.selectedTemplate !== prevState.selectedTemplate ||
    state.annotations !== prevState.annotations;

  if (!changed) return;

  debouncedSaveState(
    state.projectDir,
    createPersistedScriptState(
      state.currentStep,
      state.selectedTemplate,
      state.annotations,
    ),
  );
});
