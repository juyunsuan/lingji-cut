import { describe, expect, it, vi } from 'vitest';
import { autoFixMotionSource } from '../src/lib/motion-auto-fix';
import type { AISettings } from '../src/types/ai';
import type { MotionCompileResult } from '../src/types/motion';

const BASE_SETTINGS: AISettings = {
  llmProviders: [
    {
      id: 'test-provider',
      name: 'Test Provider',
      type: 'openai_compatible',
      baseUrl: 'https://example.com/v1',
      apiKey: 'test-key',
      models: ['test-model'],
    },
  ],
  defaultProviderId: 'test-provider',
  defaultModel: 'test-model',
  llmBaseUrl: 'https://example.com/v1',
  llmApiKey: 'test-key',
  llmModel: 'test-model',
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

describe('autoFixMotionSource', () => {
  it('在一次修复后返回成功结果', async () => {
    const generateTextImpl = vi
      .fn<typeof import('../src/lib/llm').generateText>()
      .mockResolvedValue('const MotionComponent = () => React.createElement("div", null, "fixed");');
    const compileImpl = vi
      .fn<(sourceCode: string) => MotionCompileResult>()
      .mockImplementation((sourceCode) =>
        sourceCode.includes('fixed')
          ? { success: true, compiledCode: 'compiled-fixed' }
          : { success: false, error: '首次编译失败' },
      );

    const result = await autoFixMotionSource({
      settings: BASE_SETTINGS,
      projectBindings: null,
      sourceCode: 'const MotionComponent = () => broken(',
      error: '首次编译失败',
      generateTextImpl,
      compileImpl,
    });

    expect(result).toEqual({
      success: true,
      sourceCode: 'const MotionComponent = () => React.createElement("div", null, "fixed");',
      compiledCode: 'compiled-fixed',
      retryCount: 1,
    });
  });

  it('超过最大重试次数后停止', async () => {
    const generateTextImpl = vi
      .fn<typeof import('../src/lib/llm').generateText>()
      .mockResolvedValue('const MotionComponent = () => brokenAgain(');
    const compileImpl = vi
      .fn<(sourceCode: string) => MotionCompileResult>()
      .mockReturnValue({ success: false, error: '始终失败' });

    const result = await autoFixMotionSource({
      settings: BASE_SETTINGS,
      projectBindings: null,
      sourceCode: 'const MotionComponent = () => broken(',
      error: '首次编译失败',
      maxRetries: 2,
      generateTextImpl,
      compileImpl,
    });

    expect(result.success).toBe(false);
    expect(result.retryCount).toBe(2);
    expect(result.error).toBe('始终失败');
    expect(generateTextImpl).toHaveBeenCalledTimes(2);
  });
});
