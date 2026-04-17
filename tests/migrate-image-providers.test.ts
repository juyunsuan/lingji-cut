import { describe, expect, it } from 'vitest';
import type { AISettings } from '../src/types/ai';
import { migrateImageProviders } from '../src/lib/llm/migrate-image-providers';

function baseSettings(): AISettings {
  return {
    llmProviders: [],
    defaultProviderId: null,
    defaultModel: null,
    llmBaseUrl: '',
    llmApiKey: '',
    llmModel: '',
    jimengApiUrl: '',
    jimengSessionId: '',
    minimaxApiKey: '',
    minimaxVoiceId: '',
    minimaxSpeed: 1,
    imageProviders: [],
    defaultImageProviderId: null,
    defaultImageModel: null,
    promptBindings: {},
  };
}

describe('migrateImageProviders', () => {
  it('已迁移（imageProviders 非空）时直接返回，幂等', () => {
    const s: AISettings = {
      ...baseSettings(),
      imageProviders: [{
        id: 'x', name: 'X', type: 'custom',
        baseUrl: 'u', apiKey: 'k', models: ['m'],
      }],
    };
    expect(migrateImageProviders(s)).toBe(s);
  });

  it('无即梦配置：返回空 imageProviders 列表', () => {
    const s = baseSettings();
    const next = migrateImageProviders(s);
    expect(next.imageProviders).toEqual([]);
    expect(next.defaultImageProviderId).toBeNull();
    expect(next.defaultImageModel).toBeNull();
  });

  it('有即梦配置：迁移成 imageProviders[0] 并清空旧字段', () => {
    const s: AISettings = {
      ...baseSettings(),
      jimengApiUrl: 'https://api.jimeng.com',
      jimengSessionId: 'sess-abc',
      jimengModel: 'jimeng-5.0',
    };
    const next = migrateImageProviders(s);
    expect(next.imageProviders).toHaveLength(1);
    expect(next.imageProviders[0]).toMatchObject({
      id: 'jimeng-default',
      name: '即梦',
      type: 'jimeng',
      baseUrl: 'https://api.jimeng.com',
      apiKey: 'sess-abc',
      models: ['jimeng-5.0'],
    });
    expect(next.defaultImageProviderId).toBe('jimeng-default');
    expect(next.defaultImageModel).toBe('jimeng-5.0');
    expect(next.jimengApiUrl).toBe('');
    expect(next.jimengSessionId).toBe('');
    expect(next.jimengModel).toBe('');
  });

  it('jimengModel 缺失时使用 DEFAULT_JIMENG_MODEL', () => {
    const s: AISettings = {
      ...baseSettings(),
      jimengApiUrl: 'https://api.jimeng.com',
      jimengSessionId: 'sess-abc',
    };
    const next = migrateImageProviders(s);
    expect(next.imageProviders[0].models).toEqual(['jimeng-5.0']);
    expect(next.defaultImageModel).toBe('jimeng-5.0');
  });
});
