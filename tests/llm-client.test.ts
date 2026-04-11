import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AISettings } from '../src/types/ai';

const { invokeMock, bindInvokeMock, bindMock, streamMock, chatOpenAIMock } = vi.hoisted(() => {
  const invoke = vi.fn();
  const bindInvoke = vi.fn();
  const bind = vi.fn(() => ({
    invoke: bindInvoke,
  }));
  const stream = vi.fn();
  const chatOpenAI = vi.fn().mockImplementation(() => ({
    invoke,
    bind,
    stream,
  }));

  return {
    invokeMock: invoke,
    bindInvokeMock: bindInvoke,
    bindMock: bind,
    streamMock: stream,
    chatOpenAIMock: chatOpenAI,
  };
});

vi.mock('@langchain/openai', () => ({
  ChatOpenAI: chatOpenAIMock,
}));

import { generateStructuredData, generateText } from '../src/lib/llm';
import { parseLLMJsonResponse } from '../src/lib/llm/content';

const BASE_SETTINGS: AISettings = {
  llmBaseUrl: 'https://example.com/v1/',
  llmApiKey: 'test-key',
  llmModel: 'qwen3.6-plus',
  jimengApiUrl: '',
  jimengSessionId: '',
};

describe('llm-client langchain adapter', () => {
  beforeEach(() => {
    invokeMock.mockReset();
    bindInvokeMock.mockReset();
    bindMock.mockClear();
    streamMock.mockReset();
    chatOpenAIMock.mockClear();
  });

  it('passes enableThinking=false via modelKwargs and uses json mode binding', async () => {
    bindInvokeMock.mockResolvedValue({
      content: '{"ok":true}',
    });

    await generateStructuredData(
      {
        ...BASE_SETTINGS,
        enableThinking: false,
      },
      '系统提示',
      '用户输入',
    );

    expect(chatOpenAIMock).toHaveBeenCalledTimes(1);
    expect(chatOpenAIMock).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: 'test-key',
        model: 'qwen3.6-plus',
        temperature: 0.3,
        configuration: {
          apiKey: 'test-key',
          baseURL: 'https://example.com/v1',
        },
        modelKwargs: {
          enable_thinking: false,
        },
      }),
    );
    expect(bindMock).toHaveBeenCalledWith({
      response_format: { type: 'json_object' },
    });
    expect(bindInvokeMock).toHaveBeenCalledTimes(1);
    expect(bindInvokeMock.mock.calls[0]?.[0]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ content: '系统提示' }),
        expect.objectContaining({ content: '用户输入' }),
      ]),
    );
  });

  it('does not inject modelKwargs when thinking mode is enabled for plain text generation', async () => {
    invokeMock.mockResolvedValue({
      content: '最终答案',
    });

    await generateText(
      {
        ...BASE_SETTINGS,
        enableThinking: true,
      },
      '系统提示',
      '用户输入',
    );

    expect(chatOpenAIMock).toHaveBeenCalledTimes(1);
    const config = chatOpenAIMock.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(config.modelKwargs).toBeUndefined();
    expect(invokeMock).toHaveBeenCalledTimes(1);
    expect(invokeMock.mock.calls[0]?.[0]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ content: '系统提示' }),
        expect.objectContaining({ content: '用户输入' }),
      ]),
    );
  });

  it('parses fenced json blocks for structured output compatibility', () => {
    expect(parseLLMJsonResponse('```json\n{"cards":[]}\n```')).toEqual({ cards: [] });
  });

  it('returns null for invalid structured output', () => {
    expect(parseLLMJsonResponse('not json')).toBeNull();
  });

  it('throws when plain text generation returns empty content', async () => {
    invokeMock.mockResolvedValue({ content: '' });

    await expect(generateText(BASE_SETTINGS, '系统提示', '用户输入')).rejects.toThrow('LLM 返回空内容');
  });
});
