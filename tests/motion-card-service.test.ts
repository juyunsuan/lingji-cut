import { describe, expect, it, vi } from 'vitest';
import { createMotionCardService } from '../src/lib/motion-card-service';
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

describe('createMotionCardService', () => {
  it('generate 会提取 fenced code 并编译', async () => {
    const generateTextImpl = vi
      .fn<typeof import('../src/lib/llm').generateText>()
      .mockResolvedValue(
        '```tsx\nconst MotionComponent = () => React.createElement("div", null, "hello");\n```',
      );
    const compileImpl = vi
      .fn<(sourceCode: string) => MotionCompileResult>()
      .mockReturnValue({ success: true, compiledCode: 'compiled-motion' });

    const service = createMotionCardService({
      settings: BASE_SETTINGS,
      projectBindings: null,
      generateTextImpl,
      compileImpl,
    });

    const result = await service.generate({
      prompt: '做一个呼吸感背景动画',
    });

    expect(result).toEqual({
      success: true,
      sourceCode: 'const MotionComponent = () => React.createElement("div", null, "hello");',
      compiledCode: 'compiled-motion',
      retryCount: 0,
    });
    expect(generateTextImpl).toHaveBeenCalledTimes(1);
  });

  it('modify 在编译失败时会委托 auto-fix', async () => {
    const generateTextImpl = vi
      .fn<typeof import('../src/lib/llm').generateText>()
      .mockResolvedValue('const MotionComponent = () => broken(');
    const compileImpl = vi
      .fn<(sourceCode: string) => MotionCompileResult>()
      .mockReturnValue({ success: false, error: '编译失败' });
    const autoFixImpl = vi
      .fn<typeof import('../src/lib/motion-auto-fix').autoFixMotionSource>()
      .mockResolvedValue({
        success: true,
        sourceCode: 'const MotionComponent = () => React.createElement("div", null, "fixed");',
        compiledCode: 'compiled-fixed',
        retryCount: 2,
      });

    const service = createMotionCardService({
      settings: BASE_SETTINGS,
      projectBindings: null,
      generateTextImpl,
      compileImpl,
      autoFixImpl,
    });

    const result = await service.modify({
      sourceCode: 'const MotionComponent = () => React.createElement("div", null, "old");',
      instruction: '把动画改得更快一点',
    });

    expect(result.success).toBe(true);
    expect(autoFixImpl).toHaveBeenCalledTimes(1);
    expect(service.getApiReference()).toContain('Remotion 核心:');
  });
});
