import { describe, expect, it, vi } from 'vitest';
import {
  analyzeSrt,
  buildCardRegenerationPrompt,
  buildAnalysisPrompt,
  buildCoverPromptRegenerationPrompt,
  buildSrtText,
  chunkSrtEntries,
  getCardContextEntries,
  mergeAnalysisResults,
  regenerateAICard,
  regenerateCoverPrompt,
} from '../src/lib/ai-analysis';
import type { SrtEntry } from '../src/types';
import type { AIAnalysisResult, AISettings } from '../src/types/ai';

const makeSrtEntry = (index: number, startMs: number, endMs: number, text: string): SrtEntry => ({
  index,
  startMs,
  endMs,
  text,
});

const settings: AISettings = {
  llmBaseUrl: 'https://api.openai.com/v1',
  llmApiKey: 'sk-test',
  llmModel: 'gpt-4o-mini',
  jimengApiUrl: '',
  jimengSessionId: '',
};

describe('buildSrtText', () => {
  it('formats subtitle entries into readable timestamped lines', () => {
    const entries = [
      makeSrtEntry(1, 0, 3_000, '你好，欢迎收听'),
      makeSrtEntry(2, 3_000, 6_000, '今天我们讨论 AI'),
    ];

    const text = buildSrtText(entries);

    expect(text).toContain('[00:00.000 --> 00:03.000]');
    expect(text).toContain('你好，欢迎收听');
    expect(text).toContain('[00:03.000 --> 00:06.000]');
    expect(text).toContain('今天我们讨论 AI');
  });
});

describe('chunkSrtEntries', () => {
  it('returns a single chunk for short content', () => {
    const entries = [makeSrtEntry(1, 0, 3_000, '短内容')];
    const chunks = chunkSrtEntries(entries, 8_000);

    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toHaveLength(1);
  });

  it('splits long subtitles into multiple chunks', () => {
    const entries = Array.from({ length: 120 }, (_, index) =>
      makeSrtEntry(
        index + 1,
        index * 3_000,
        (index + 1) * 3_000,
        `这是第 ${index + 1} 段非常长的字幕内容，包含了很多很多的文字信息`,
      ),
    );

    const chunks = chunkSrtEntries(entries, 500);

    expect(chunks.length).toBeGreaterThan(1);
  });
});

describe('buildAnalysisPrompt', () => {
  it('returns a prompt that requests JSON card output', () => {
    const prompt = buildAnalysisPrompt('整体偏商业分析风');

    expect(prompt).toContain('JSON');
    expect(prompt).toContain('cards');
    expect(prompt).toContain('coverPrompts');
    expect(prompt).toContain('数组中只能有 1 条');
    expect(prompt).toContain('webCard');
    expect(prompt).toContain('整体偏商业分析风');
    expect(prompt).toContain('必须使用简体中文');
    expect(prompt).toContain('统一视觉基线（首次生成与二次重生成都必须遵守）');
    expect(prompt).toContain('summary: #79c4ff');
    expect(prompt).toContain('禁止输出任何“数据来源”');
  });
});

describe('buildCoverPromptRegenerationPrompt', () => {
  it('requests a single simplified Chinese cover prompt', () => {
    const prompt = buildCoverPromptRegenerationPrompt({
      globalPrompt: '整体偏财经媒体封面',
      currentPrompt: '旧提示词',
    });

    expect(prompt).toContain('只返回 1 条封面提示词');
    expect(prompt).toContain('必须使用简体中文');
    expect(prompt).toContain('旧提示词');
    expect(prompt).toContain('整体偏财经媒体封面');
  });
});

describe('buildCardRegenerationPrompt', () => {
  it('reuses the first-pass visual baseline and includes current card cues', () => {
    const prompt = buildCardRegenerationPrompt(
      {
        id: 'card-1',
        type: 'summary',
        title: '本期要点',
        content: '内容',
        startMs: 0,
        endMs: 5_000,
        displayDurationMs: 5_000,
        displayMode: 'fullscreen',
        template: 'summary-default',
        enabled: true,
        style: {
          primaryColor: '#79c4ff',
          backgroundColor: '#151922',
          fontSize: 48,
        },
      },
      {
        globalPrompt: '整体偏商业分析风',
        cardPrompt: '这一张做成更像封面海报',
      },
    );

    expect(prompt).toContain('整体偏商业分析风');
    expect(prompt).toContain('这一张做成更像封面海报');
    expect(prompt).toContain('webCard');
    expect(prompt).toContain('统一视觉基线（首次生成与二次重生成都必须遵守）');
    expect(prompt).toContain('template: summary-default');
    expect(prompt).toContain('style.primaryColor: #79c4ff');
    expect(prompt).toContain('视觉风格必须与首次生成保持一致');
    expect(prompt).toContain('禁止输出任何“数据来源”');
  });
});

describe('mergeAnalysisResults', () => {
  it('merges partial results and deduplicates cards by startMs', () => {
    const resultA: AIAnalysisResult = {
      cards: [
        {
          id: '1',
          type: 'summary',
          title: 'A',
          content: 'a',
          startMs: 0,
          endMs: 5_000,
          displayDurationMs: 5_000,
          displayMode: 'fullscreen',
          template: 'summary-default',
          enabled: true,
          style: {
            primaryColor: '#6366f1',
            backgroundColor: '#0f172a',
            fontSize: 48,
          },
        },
      ],
      coverPrompts: [],
      summary: '部分1',
      keywords: ['AI'],
      globalPrompt: '整体偏商业分析风',
    };
    const resultB: AIAnalysisResult = {
      cards: [
        {
          id: '2',
          type: 'insight',
          title: 'B',
          content: 'b',
          startMs: 60_000,
          endMs: 65_000,
          displayDurationMs: 5_000,
          displayMode: 'fullscreen',
          template: 'insight-default',
          enabled: true,
          style: {
            primaryColor: '#f59e0b',
            backgroundColor: '#0f172a',
            fontSize: 48,
          },
        },
        {
          id: '3',
          type: 'quote',
          title: 'C',
          content: 'c',
          startMs: 0,
          endMs: 8_000,
          displayDurationMs: 5_000,
          displayMode: 'fullscreen',
          template: 'quote-default',
          enabled: true,
          style: {
            primaryColor: '#ec4899',
            backgroundColor: '#0f172a',
            fontSize: 48,
          },
        },
      ],
      coverPrompts: ['prompt-1'],
      summary: '部分2',
      keywords: ['编程'],
    };

    const merged = mergeAnalysisResults([resultA, resultB]);

    expect(merged.cards).toHaveLength(2);
    expect(merged.cards.map((card) => card.startMs)).toEqual([0, 60_000]);
    expect(merged.keywords).toEqual(['AI', '编程']);
    expect(merged.coverPrompts).toEqual(['prompt-1']);
    expect(merged.globalPrompt).toBe('整体偏商业分析风');
  });
});

describe('getCardContextEntries', () => {
  it('returns subtitle context around the card time range', () => {
    const entries = [
      makeSrtEntry(1, 0, 2_000, '开场'),
      makeSrtEntry(2, 5_000, 7_000, '中段'),
      makeSrtEntry(3, 15_000, 18_000, '结尾'),
    ];

    const result = getCardContextEntries(entries, { startMs: 6_000, endMs: 8_000 }, 3_000);

    expect(result.map((entry) => entry.index)).toEqual([2]);
  });
});

describe('analyzeSrt', () => {
  it('calls the model for each chunk and merges the valid responses', async () => {
    const entries = Array.from({ length: 40 }, (_, index) =>
      makeSrtEntry(index + 1, index * 1_000, index * 1_000 + 800, `内容段落 ${index + 1}`),
    );
    const modelCaller = vi
      .fn<(settings: AISettings, systemPrompt: string, userMessage: string) => Promise<string>>()
      .mockImplementation(async (_settings, _systemPrompt, userMessage) => {
        if (userMessage.includes('内容段落 1')) {
          return JSON.stringify({
            cards: [
              {
                id: 'card-1',
                type: 'summary',
                title: '第一段',
                content: '总结',
                startMs: 0,
                endMs: 5_000,
              displayDurationMs: 5_000,
              displayMode: 'fullscreen',
              template: 'summary-default',
              enabled: true,
              renderMode: 'web-card',
              webCard: {
                srcDoc: '<!doctype html><html><body><div>第一段网页卡片</div></body></html>',
              },
              style: {
                primaryColor: '#6366f1',
                backgroundColor: '#0f172a',
                  fontSize: 48,
                },
              },
            ],
            coverPrompts: [],
            summary: '前半段',
            keywords: ['AI'],
          });
        }

        return JSON.stringify({
          cards: [
            {
              id: 'card-2',
              type: 'insight',
              title: '第二段',
              content: '观点',
              startMs: 20_000,
              endMs: 25_000,
              displayDurationMs: 5_000,
              displayMode: 'fullscreen',
              template: 'insight-default',
              enabled: true,
              renderMode: 'web-card',
              webCard: {
                srcDoc: '<!doctype html><html><body><div>第二段网页卡片</div></body></html>',
              },
              style: {
                primaryColor: '#f59e0b',
                backgroundColor: '#0f172a',
                fontSize: 48,
              },
            },
          ],
          coverPrompts: ['封面提示词'],
          summary: '后半段',
          keywords: ['播客'],
        });
      });

    const result = await analyzeSrt(entries, settings, {
      maxTokens: 500,
      callModel: modelCaller,
      globalPrompt: '整体偏商业分析风',
    });

    expect(modelCaller.mock.calls.length).toBeGreaterThan(1);
    expect(result.cards).toHaveLength(2);
    expect(result.coverPrompts).toEqual(['封面提示词']);
    expect(result.keywords).toEqual(['AI', '播客']);
    expect(result.cards[0]?.renderMode).toBe('web-card');
    expect(result.cards[0]?.webCard?.srcDoc).toContain('网页卡片');
    expect(result.globalPrompt).toBe('整体偏商业分析风');
    expect(modelCaller.mock.calls[0]?.[1]).toContain('统一视觉基线（首次生成与二次重生成都必须遵守）');
  });
});

describe('regenerateCoverPrompt', () => {
  it('regenerates exactly one cover prompt and trims extra prompts', async () => {
    const modelCaller = vi.fn().mockResolvedValue(
      JSON.stringify({
        coverPrompts: ['新的封面提示词', '不应保留的第二条'],
      }),
    );

    const result = await regenerateCoverPrompt(
      [
        makeSrtEntry(1, 0, 2_000, '第一句'),
        makeSrtEntry(2, 2_000, 4_000, '第二句'),
      ],
      settings,
      {
        callModel: modelCaller,
        globalPrompt: '整体偏商业媒体封面',
        currentPrompt: '旧提示词',
      },
    );

    expect(result).toEqual(['新的封面提示词']);
    expect(modelCaller).toHaveBeenCalledTimes(1);
    expect(modelCaller.mock.calls[0]?.[1]).toContain('必须使用简体中文');
    expect(modelCaller.mock.calls[0]?.[1]).toContain('旧提示词');
  });
});

describe('regenerateAICard', () => {
  it('regenerates a single card with web-card payload and preserves card id', async () => {
    const card = {
      id: 'card-1',
      type: 'summary' as const,
      title: '旧标题',
      content: '旧内容',
      startMs: 3_000,
      endMs: 8_000,
      displayDurationMs: 5_000,
      displayMode: 'fullscreen' as const,
      template: 'summary-default',
      enabled: true,
      style: {
        primaryColor: '#79c4ff',
        backgroundColor: '#151922',
        fontSize: 48,
      },
      cardPrompt: '做成更像封面',
    };
    const modelCaller = vi.fn().mockResolvedValue(
      JSON.stringify({
        id: 'another-id',
        type: 'summary',
        title: '新标题',
        content: '新内容',
        startMs: 3_500,
        endMs: 8_500,
        displayDurationMs: 6_000,
        displayMode: 'fullscreen',
        template: 'summary-default',
        enabled: true,
        renderMode: 'web-card',
        cardPrompt: '做成更像封面',
        webCard: {
          srcDoc: '<!doctype html><html><body><h1>新网页卡</h1></body></html>',
        },
        style: {
          primaryColor: '#79c4ff',
          backgroundColor: '#151922',
          fontSize: 48,
        },
      }),
    );

    const result = await regenerateAICard(
      [
        makeSrtEntry(1, 0, 2_000, '开场'),
        makeSrtEntry(2, 4_000, 7_000, '上下文内容'),
      ],
      card,
      settings,
      {
        callModel: modelCaller,
        globalPrompt: '整体偏商业分析风',
      },
    );

    expect(result.id).toBe('card-1');
    expect(result.title).toBe('新标题');
    expect(result.displayDurationMs).toBe(6_000);
    expect(result.renderMode).toBe('web-card');
    expect(result.webCard?.srcDoc).toContain('新网页卡');
    expect(modelCaller).toHaveBeenCalledTimes(1);
    expect(modelCaller.mock.calls[0]?.[1]).toContain('统一视觉基线（首次生成与二次重生成都必须遵守）');
    expect(modelCaller.mock.calls[0]?.[1]).toContain('template: summary-default');
    expect(modelCaller.mock.calls[0]?.[1]).toContain('style.primaryColor: #79c4ff');
  });
});
