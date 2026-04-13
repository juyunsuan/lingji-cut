import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  createAIConfigSnapshot,
  hasUnsavedAIConfigChanges,
  normalizeProviderSelection,
  validateProviderDraft,
} from '../src/components/settings/ai-config-utils';
import type { LLMProvider } from '../src/types/ai';

function createProvider(overrides?: Partial<LLMProvider>): LLMProvider {
  return {
    id: 'provider-1',
    name: 'OpenAI',
    type: 'openai_compatible',
    baseUrl: 'https://api.openai.com/v1',
    apiKey: 'sk-demo',
    models: ['gpt-4.1'],
    ...overrides,
  };
}

describe('ai-config-utils', () => {
  it('flags all required provider fields when they are missing', () => {
    expect(
      validateProviderDraft(
        createProvider({
          name: '   ',
          baseUrl: '  ',
          apiKey: '',
          models: [],
        }),
      ),
    ).toEqual({
      name: '请输入 Provider 名称',
      baseUrl: '请输入 Base URL',
      apiKey: '请输入 API Key',
      models: '请至少添加一个模型',
    });
  });

  it('normalizes default selection to the active provider first model', () => {
    const primary = createProvider({ id: 'primary', models: ['gpt-4.1', 'gpt-4o-mini'] });
    const backup = createProvider({ id: 'backup', name: 'Backup', models: ['claude-3-7-sonnet'] });

    expect(
      normalizeProviderSelection([primary, backup], 'missing-provider', 'missing-model'),
    ).toEqual({
      defaultProviderId: 'primary',
      defaultModel: 'gpt-4.1',
    });

    expect(
      normalizeProviderSelection([primary, backup], 'backup', 'missing-model'),
    ).toEqual({
      defaultProviderId: 'backup',
      defaultModel: 'claude-3-7-sonnet',
    });
  });

  it('detects unsaved AI config changes from normalized snapshots', () => {
    const baseSnapshot = createAIConfigSnapshot({
      providers: [createProvider()],
      defaultProviderId: 'provider-1',
      defaultModel: 'gpt-4.1',
      enableThinking: true,
      jimengApiUrl: 'https://jimeng.example.com',
      jimengSessionId: 'session-a',
      jimengModel: 'jimeng-5.0',
    });

    expect(
      hasUnsavedAIConfigChanges(
        baseSnapshot,
        createAIConfigSnapshot({
          providers: [createProvider()],
          defaultProviderId: 'provider-1',
          defaultModel: 'gpt-4.1',
          enableThinking: true,
          jimengApiUrl: 'https://jimeng.example.com',
          jimengSessionId: 'session-a',
          jimengModel: 'jimeng-5.0',
        }),
      ),
    ).toBe(false);

    expect(
      hasUnsavedAIConfigChanges(
        baseSnapshot,
        createAIConfigSnapshot({
          providers: [createProvider()],
          defaultProviderId: 'provider-1',
          defaultModel: 'gpt-4.1',
          enableThinking: true,
          jimengApiUrl: 'https://jimeng.example.com',
          jimengSessionId: 'session-b',
          jimengModel: 'jimeng-5.0',
        }),
      ),
    ).toBe(true);
  });

  it('wires an unsaved-change guard into AIConfigTab and settings navigation', () => {
    const aiConfigSource = readFileSync(
      new URL('../src/components/settings/AIConfigTab.tsx', import.meta.url),
      'utf8',
    );
    const settingsSource = readFileSync(
      new URL('../src/pages/Settings.tsx', import.meta.url),
      'utf8',
    );

    expect(aiConfigSource).toContain('useSettingsTabGuard');
    expect(aiConfigSource).toContain('onRegisterLeaveGuard');
    expect(aiConfigSource).toContain("settings?.jimengApiUrl ?? ''");
    expect(aiConfigSource).toContain('https://jimeng.example.com');
    expect(aiConfigSource).not.toMatch(/\b(?:\d{1,3}\.){3}\d{1,3}:8330\b/);
    expect(settingsSource).toContain('tabLeaveGuardRef');
    expect(settingsSource).toContain('onRegisterLeaveGuard');
  });
});
