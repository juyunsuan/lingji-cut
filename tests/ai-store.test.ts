import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadAISettings, saveAISettings, useAIStore } from '../src/store/ai';

const AI_SETTINGS_KEY = 'podcast-editor-ai-settings';

function createStorageMock() {
  const storage = new Map<string, string>();

  return {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => {
      storage.set(key, value);
    },
    removeItem: (key: string) => {
      storage.delete(key);
    },
    clear: () => {
      storage.clear();
    },
  };
}

describe('AI settings store helpers', () => {
  beforeEach(() => {
    const localStorage = createStorageMock();
    vi.stubGlobal('window', { localStorage });
    localStorage.clear();
    useAIStore.getState().resetWorkflow();
  });

  it('defaults enableThinking to true when loading legacy settings', async () => {
    window.localStorage.setItem(
      AI_SETTINGS_KEY,
      JSON.stringify({
        llmBaseUrl: 'https://api.openai.com/v1',
        llmApiKey: 'sk-test',
        llmModel: 'gpt-4o',
        jimengApiUrl: 'https://jimeng.example.com',
        jimengSessionId: 'session-test',
      }),
    );

    await expect(loadAISettings()).resolves.toMatchObject({
      enableThinking: true,
      jimengModel: 'jimeng-5.0',
      minimaxApiKey: '',
      minimaxVoiceId: 'male-qn-qingse',
      minimaxSpeed: 1.0,
    });
  });

  it('persists enableThinking and minimax settings when explicitly configured', async () => {
    // saveAISettings 也是异步的，但在没有 electronAPI 时是 no-op
    // 通过 localStorage 直接写入来模拟已保存状态
    window.localStorage.setItem(
      AI_SETTINGS_KEY,
      JSON.stringify({
        llmBaseUrl: 'https://api.openai.com/v1',
        llmApiKey: 'sk-test',
        llmModel: 'gpt-4o',
        jimengApiUrl: 'https://jimeng.example.com',
        jimengSessionId: 'session-test',
        enableThinking: false,
        minimaxApiKey: 'mm-key',
        minimaxVoiceId: 'female-yujie',
        minimaxSpeed: 1.25,
      }),
    );

    await expect(loadAISettings()).resolves.toMatchObject({
      enableThinking: false,
      minimaxApiKey: 'mm-key',
      minimaxVoiceId: 'female-yujie',
      minimaxSpeed: 1.25,
    });
  });

  it('merges aiSettings into existing global settings instead of overwriting other sections', async () => {
    const loadGlobalSettings = vi.fn().mockResolvedValue(
      JSON.stringify({
        reviewCriteria: '保留这段审查规则',
        selectedRole: 'deep-insight-podcast',
      }),
    );
    const saveGlobalSettings = vi.fn().mockResolvedValue(undefined);

    vi.stubGlobal('window', {
      electronAPI: {
        loadGlobalSettings,
        saveGlobalSettings,
      },
    });

    await saveAISettings({
      llmProviders: [],
      defaultProviderId: null,
      defaultModel: null,
      llmBaseUrl: 'https://api.openai.com/v1',
      llmApiKey: 'sk-test',
      llmModel: 'gpt-4o',
      jimengApiUrl: 'https://jimeng.example.com',
      jimengSessionId: 'session-test',
      minimaxApiKey: '',
      minimaxVoiceId: 'male-qn-qingse',
      minimaxSpeed: 1.0,
    });

    expect(loadGlobalSettings).toHaveBeenCalledTimes(1);
    expect(saveGlobalSettings).toHaveBeenCalledTimes(1);

    const savedPayload = JSON.parse(saveGlobalSettings.mock.calls[0][0] as string);
    expect(savedPayload.reviewCriteria).toBe('保留这段审查规则');
    expect(savedPayload.selectedRole).toBe('deep-insight-podcast');
    expect(savedPayload.aiSettings.llmApiKey).toBe('sk-test');
  });

  it('supports workflow updates and reset', () => {
    useAIStore.getState().setWorkflow({
      step: 'tts_generating',
      progress: 42,
      stepLabel: '正在生成语音…',
      canCancel: true,
    });

    expect(useAIStore.getState().workflow).toMatchObject({
      step: 'tts_generating',
      progress: 42,
      stepLabel: '正在生成语音…',
      canCancel: true,
      error: null,
    });

    useAIStore.getState().resetWorkflow();

    expect(useAIStore.getState().workflow).toEqual({
      step: 'idle',
      progress: 0,
      stepLabel: '',
      error: null,
      canCancel: false,
    });
  });

  it('clearing analysis error does not cancel an in-flight analyze state', () => {
    useAIStore.getState().setAnalyzing(true);
    useAIStore.getState().setAnalysisError(null);

    expect(useAIStore.getState().isAnalyzing).toBe(true);
    expect(useAIStore.getState().analysisError).toBeNull();
  });
});
