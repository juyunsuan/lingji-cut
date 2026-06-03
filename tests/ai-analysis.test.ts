import { describe, expect, it, vi } from 'vitest';
import {
  analyzeSrt,
  buildCoverPromptRegenerationPrompt,
  buildSegmentCardPrompt,
  buildSegmentPlanningPrompt,
  buildPlainTranscriptRange,
  buildSrtText,
  generateCardForSegment,
  planTranscriptSegments,
  regenerateAICard,
  regenerateCoverPrompt,
} from '../src/lib/ai-analysis';
import type { SrtEntry } from '../src/types';
import type { AICard, AISegment, AISettings } from '../src/types/ai';
import { generateStructuredData } from '../src/lib/llm';

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

const baseEntries = [
  makeSrtEntry(1, 0, 3_000, '欢迎收听本期节目，我们先聊 AI 视频生产的背景。'),
  makeSrtEntry(2, 3_000, 7_000, '接下来进入第二部分，重点分析工作流拆分与卡片生成方式。'),
];

const fullTranscript = buildSrtText(baseEntries);

const baseSegment: AISegment = {
  id: 'seg-1',
  title: 'AI 视频生产背景',
  summary: '概括节目开场对 AI 视频生产现状的说明',
  startMs: 0,
  endMs: 3_000,
  transcriptExcerpt: '欢迎收听本期节目，我们先聊 AI 视频生产的背景。',
};

const secondSegment: AISegment = {
  id: 'seg-2',
  title: '工作流拆分',
  summary: '分析为什么要先做 segment planning，再逐段生成卡片',
  startMs: 3_000,
  endMs: 7_000,
  transcriptExcerpt: '接下来进入第二部分，重点分析工作流拆分与卡片生成方式。',
};

const baseCard: AICard = {
  id: 'card-1',
  segmentId: 'seg-1',
  type: 'summary',
  title: '旧标题',
  content: '旧内容',
  startMs: 0,
  endMs: 3_000,
  displayDurationMs: 5_000,
  displayMode: 'fullscreen',
  template: 'summary-default',
  enabled: true,
  style: {
    primaryColor: '#79c4ff',
    backgroundColor: '#151922',
    fontSize: 48,
  },
  cardPrompt: '做成更像商业海报',
};

/** 一段可被 Remotion 渲染的 Motion Card TSX（default export 函数组件） */
const VALID_MOTION_TSX = `import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
export default function MotionCard() {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 12], [0, 1], { extrapolateRight: 'clamp' });
  return <AbsoluteFill style={{ opacity }}>摘要卡</AbsoluteFill>;
}`;

const makeLongEntries = () =>
  Array.from({ length: 18 }, (_, index) =>
    makeSrtEntry(
      index + 1,
      index * 10_000,
      (index + 1) * 10_000,
      `第 ${index + 1} 条长字幕内容`,
    ),
  );

const longSegment = {
  id: 'long-seg',
  title: '超长主题',
  summary: '一个被模型误判成单段的超长主题',
  startMs: 0,
  endMs: 180_000,
  transcriptExcerpt: '超长主题原始摘录',
  semanticType: 'explanation',
  complexityLevel: 'medium',
  visualizationScore: 80,
  pacingNeed: 'steady',
  keywords: ['长视频', '分段'],
  entities: ['Motion Card'],
  visualType: 'motion',
};

describe('buildSrtText', () => {
  it('formats subtitle entries into readable timestamped lines', () => {
    const text = buildSrtText(baseEntries);

    expect(text).toContain('[00:00.000 --> 00:03.000]');
    expect(text).toContain('欢迎收听本期节目');
    expect(text).toContain('[00:03.000 --> 00:07.000]');
    expect(text).toContain('重点分析工作流拆分与卡片生成方式');
  });
});

describe('buildPlainTranscriptRange', () => {
  it('returns only the verbatim text of entries overlapping the exact range, without timecodes', () => {
    const text = buildPlainTranscriptRange(baseEntries, 0, 3_000);

    expect(text).toBe('欢迎收听本期节目，我们先聊 AI 视频生产的背景。');
    expect(text).not.toContain('-->');
    expect(text).not.toContain('[00:');
  });

  it('joins multiple overlapping entries with newlines in time order', () => {
    const text = buildPlainTranscriptRange(baseEntries, 0, 7_000);

    expect(text).toBe(
      '欢迎收听本期节目，我们先聊 AI 视频生产的背景。\n接下来进入第二部分，重点分析工作流拆分与卡片生成方式。',
    );
  });

  it('does not include neighbour entries outside the range (no padding)', () => {
    const text = buildPlainTranscriptRange(baseEntries, 0, 3_000);

    expect(text).not.toContain('第二部分');
  });

  it('returns an empty string when no subtitle overlaps the range', () => {
    expect(buildPlainTranscriptRange(baseEntries, 8_000, 9_000)).toBe('');
  });
});

describe('buildSegmentPlanningPrompt', () => {
  it('asks the model to plan segments instead of generating cards directly', () => {
    const prompt = buildSegmentPlanningPrompt('整体偏商业分析风');

    expect(prompt).toContain('segments');
    expect(prompt).toContain('coverPrompts');
    expect(prompt).toContain('整体偏商业分析风');
    expect(prompt).not.toContain('webCard');
    expect(prompt).not.toContain('srcDoc');
  });
});

describe('buildSegmentCardPrompt', () => {
  it('requires HyperFrames HTML output and exposes the GSAP timeline contract', () => {
    const programContext = '节目摘要：节目总结\n节目关键词：AI、工作流\n当前段标题：AI 视频生产背景';
    const prompt = buildSegmentCardPrompt({
      programContext,
      segment: baseSegment,
      globalPrompt: '整体偏商业分析风',
      cardPrompt: '这一张做成粒子聚合',
      currentCard: baseCard,
      programSummary: '节目总结',
      keywords: ['AI', '工作流'],
    });

    expect(prompt).toContain(programContext);
    expect(prompt).not.toContain(fullTranscript);
    expect(prompt).toContain('AI 视频生产背景');
    expect(prompt).toContain('概括节目开场对 AI 视频生产现状的说明');
    expect(prompt).toContain('整体偏商业分析风');
    expect(prompt).toContain('这一张做成粒子聚合');
    expect(prompt).toContain('motionCard.html');
    expect(prompt).toContain('gsap.timeline');
    expect(prompt).toContain('window.__lingjiMotionTimelines');
    // Web Card 痕迹不得残留
    expect(prompt).not.toContain('webCard.srcDoc');
    expect(prompt).not.toContain('web-card');
  });
});

describe('buildCoverPromptRegenerationPrompt', () => {
  it('requests a single simplified Chinese cover prompt', () => {
    const prompt = buildCoverPromptRegenerationPrompt({
      globalPrompt: '整体偏财经媒体封面',
      currentPrompt: '旧提示词',
    });

    expect(prompt).toContain('1 条可直接喂给 AI 生图');
    expect(prompt).toContain('必须使用简体中文');
    expect(prompt).toContain('旧提示词');
    expect(prompt).toContain('整体偏财经媒体封面');
  });
});

describe('planTranscriptSegments', () => {
  it('plans segments from the full transcript', async () => {
    const modelCaller = vi.fn<typeof generateStructuredData>().mockResolvedValue({
      segments: [baseSegment, secondSegment],
      coverPrompts: ['封面提示词'],
      summary: '节目总结',
      keywords: ['AI', '播客'],
      globalPrompt: '整体偏商业分析风',
    });

    const result = await planTranscriptSegments(baseEntries, settings, {
      generateStructuredData: modelCaller,
      globalPrompt: '整体偏商业分析风',
    });

    expect(result.segments).toHaveLength(2);
    expect(result.segments[0]?.id).toBe('seg-1');
    expect(result.coverPrompts).toEqual(['封面提示词']);
    expect(result.summary).toBe('节目总结');
    expect(result.keywords).toEqual(['AI', '播客']);
    expect(modelCaller).toHaveBeenCalledTimes(1);
    expect(modelCaller.mock.calls[0]?.[2]).toBe(fullTranscript);
  });

  it('splits overlong planned segments by subtitle boundaries', async () => {
    const longEntries = makeLongEntries();
    const modelCaller = vi.fn<typeof generateStructuredData>().mockResolvedValue({
      segments: [longSegment],
      coverPrompts: ['封面提示词'],
      summary: '节目总结',
      keywords: ['AI', '播客'],
    });

    const result = await planTranscriptSegments(longEntries, settings, {
      generateStructuredData: modelCaller,
    });

    expect(result.segments).toHaveLength(5);
    expect(result.segments.every((segment) => segment.endMs - segment.startMs <= 60_000)).toBe(
      true,
    );
    expect(result.segments.map((segment) => segment.id)).toEqual([
      'long-seg-part-1',
      'long-seg-part-2',
      'long-seg-part-3',
      'long-seg-part-4',
      'long-seg-part-5',
    ]);
    expect(result.segments[0]?.title).toBe('超长主题（1/5）');
    expect(result.segments[0]?.summary).toContain('第 1/5 小节');
    expect(result.segments[0]?.transcriptExcerpt).toContain('第 1 条长字幕内容');
    expect(result.segments[0]?.transcriptExcerpt).not.toContain('第 8 条长字幕内容');
    expect(result.segments[0]?.keywords).toEqual(['长视频', '分段']);
    expect(result.segments[0]?.visualType).toBe('motion');
  });
});

describe('generateCardForSegment', () => {
  it('returns a motion-card with HyperFrames HTML when LLM response is well-formed', async () => {
    const modelCaller = vi.fn<typeof generateStructuredData>().mockResolvedValue({
      id: 'generated-card-1',
      type: 'summary',
      title: '新标题',
      content: '新内容',
      startMs: 100,
      endMs: 2_900,
      displayDurationMs: 5_500,
      displayMode: 'fullscreen',
      template: 'summary-default',
      enabled: true,
      renderMode: 'motion-card',
      motionCard: {
        tsx: VALID_MOTION_TSX,
      },
      style: {
        primaryColor: '#79c4ff',
        backgroundColor: '#151922',
        fontSize: 48,
      },
    });

    const result = await generateCardForSegment(
      baseEntries,
      {
        segments: [baseSegment],
        coverPrompts: ['封面提示词'],
        summary: '节目总结',
        keywords: ['AI'],
        globalPrompt: '整体偏商业分析风',
      },
      baseSegment,
      settings,
      {
        generateStructuredData: modelCaller,
        globalPrompt: '整体偏商业分析风',
        cardPrompt: '做成粒子聚合',
        currentCard: baseCard,
      },
    );

    expect(result.segmentId).toBe('seg-1');
    expect(result.title).toBe('新标题');
    expect(result.renderMode).toBe('motion-card');
    expect(result.motionCard?.tsx).toContain('export default');
    expect(result.motionCard?.tsx).toContain('useCurrentFrame');
    expect(modelCaller).toHaveBeenCalledTimes(1);
    expect(modelCaller.mock.calls[0]?.[2]).toBe(fullTranscript);
    expect(modelCaller.mock.calls[0]?.[1]).toContain('AI 视频生产背景');
  });

  it('overrides text-card content with the verbatim segment subtitle text', async () => {
    const modelCaller = vi.fn<typeof generateStructuredData>().mockResolvedValue({
      id: 'generated-card-1',
      type: 'summary',
      title: '新标题',
      content: 'AI 改写后可能丢字的内容',
      startMs: 100,
      endMs: 2_900,
      displayDurationMs: 5_500,
      displayMode: 'fullscreen',
      template: 'summary-default',
      enabled: true,
      renderMode: 'motion-card',
      motionCard: { tsx: VALID_MOTION_TSX },
      style: { primaryColor: '#79c4ff', backgroundColor: '#151922', fontSize: 48 },
    });

    const result = await generateCardForSegment(
      baseEntries,
      { segments: [baseSegment], coverPrompts: [], summary: '', keywords: [] },
      baseSegment,
      settings,
      { generateStructuredData: modelCaller },
    );

    expect(result.content).toBe('欢迎收听本期节目，我们先聊 AI 视频生产的背景。');
  });

  it('leaves DataContent untouched for data cards', async () => {
    const dataContent = {
      chartType: 'bar' as const,
      items: [
        { label: '2024', value: 10 },
        { label: '2025', value: 20, highlight: true },
      ],
    };
    const modelCaller = vi.fn<typeof generateStructuredData>().mockResolvedValue({
      id: 'generated-data-card',
      type: 'data',
      title: '数据卡',
      content: dataContent,
      startMs: 0,
      endMs: 3_000,
      displayDurationMs: 5_000,
      displayMode: 'fullscreen',
      template: 'data-default',
      enabled: true,
      renderMode: 'motion-card',
      motionCard: { tsx: VALID_MOTION_TSX },
      style: { primaryColor: '#79c4ff', backgroundColor: '#151922', fontSize: 48 },
    });

    const result = await generateCardForSegment(
      baseEntries,
      { segments: [baseSegment], coverPrompts: [], summary: '', keywords: [] },
      baseSegment,
      settings,
      { generateStructuredData: modelCaller },
    );

    expect(result.content).toEqual(dataContent);
  });

  it('keeps the AI content when the segment range has no subtitle text', async () => {
    const offRangeSegment: AISegment = {
      ...baseSegment,
      id: 'seg-off',
      startMs: 8_000,
      endMs: 9_000,
    };
    const modelCaller = vi.fn<typeof generateStructuredData>().mockResolvedValue({
      id: 'generated-card-empty',
      type: 'summary',
      title: '兜底标题',
      content: '没有字幕时保留的 AI 内容',
      startMs: 8_000,
      endMs: 9_000,
      displayDurationMs: 5_000,
      displayMode: 'fullscreen',
      template: 'summary-default',
      enabled: true,
      renderMode: 'motion-card',
      motionCard: { tsx: VALID_MOTION_TSX },
      style: { primaryColor: '#79c4ff', backgroundColor: '#151922', fontSize: 48 },
    });

    const result = await generateCardForSegment(
      baseEntries,
      { segments: [offRangeSegment], coverPrompts: [], summary: '', keywords: [] },
      offRangeSegment,
      settings,
      { generateStructuredData: modelCaller },
    );

    expect(result.content).toBe('没有字幕时保留的 AI 内容');
  });

  it('throws a regenerate-hinted error when motion html cannot compile', async () => {
    const modelCaller = vi.fn<typeof generateStructuredData>().mockResolvedValue({
      id: 'generated-card-bad',
      type: 'summary',
      title: '无法编译的卡片',
      content: '内容',
      startMs: 0,
      endMs: 3_000,
      displayDurationMs: 5_000,
      displayMode: 'fullscreen',
      template: 'summary-default',
      enabled: true,
      renderMode: 'motion-card',
      motionCard: {
        html: 'this is not a valid html motion source',
      },
      style: { primaryColor: '#79c4ff', backgroundColor: '#151922', fontSize: 48 },
    });

    await expect(
      generateCardForSegment(
        baseEntries,
        {
          segments: [baseSegment],
          coverPrompts: [],
          summary: '',
          keywords: [],
        },
        baseSegment,
        settings,
        { generateStructuredData: modelCaller },
      ),
    ).rejects.toThrow(/请重新生成/);
  });

  it('rejects missing motionCard html instead of generating a fallback card', async () => {
    const modelCaller = vi.fn<typeof generateStructuredData>().mockResolvedValue({
      id: 'generated-card-without-html',
      type: 'summary',
      title: '缺失源码卡片',
      content: '模型只返回了结构化文案，没有返回 Motion 源码。',
      startMs: 0,
      endMs: 3_000,
      displayDurationMs: 5_000,
      displayMode: 'fullscreen',
      template: 'summary-default',
      enabled: true,
      renderMode: 'motion-card',
      style: { primaryColor: '#79c4ff', backgroundColor: '#151922', fontSize: 48 },
    });

    await expect(
      generateCardForSegment(
        baseEntries,
        {
          segments: [baseSegment],
          coverPrompts: [],
          summary: '',
          keywords: [],
        },
        baseSegment,
        settings,
        { generateStructuredData: modelCaller },
      ),
    ).rejects.toThrow(/motionCard/);
  });
});

describe('analyzeSrt', () => {
  it('uses one planning call plus one card-generation call per segment', async () => {
    const modelCaller = vi.fn<typeof generateStructuredData>()
      .mockResolvedValueOnce({
        segments: [baseSegment, secondSegment],
        coverPrompts: ['封面提示词'],
        summary: '节目总结',
        keywords: ['AI', '播客'],
        globalPrompt: '整体偏商业分析风',
      })
      .mockResolvedValueOnce({
        id: 'card-seg-1',
        type: 'summary',
        title: '第一段卡片',
        content: '第一段内容',
        startMs: 0,
        endMs: 3_000,
        displayDurationMs: 5_000,
        displayMode: 'fullscreen',
        template: 'summary-default',
        enabled: true,
        renderMode: 'motion-card',
        motionCard: { tsx: VALID_MOTION_TSX },
        style: {
          primaryColor: '#79c4ff',
          backgroundColor: '#151922',
          fontSize: 48,
        },
      })
      .mockResolvedValueOnce({
        id: 'card-seg-2',
        type: 'motion',
        title: '第二段卡片',
        content: '第二段内容',
        startMs: 3_000,
        endMs: 7_000,
        displayDurationMs: 5_000,
        displayMode: 'fullscreen',
        template: 'motion-default',
        enabled: true,
        renderMode: 'motion-card',
        cardPrompt: '做一个粒子聚合动画',
        motionCard: { tsx: VALID_MOTION_TSX },
        style: {
          primaryColor: '#7df9ff',
          backgroundColor: '#151922',
          fontSize: 48,
        },
      });

    const result = await analyzeSrt(baseEntries, settings, {
      generateStructuredData: modelCaller,
      globalPrompt: '整体偏商业分析风',
    });

    expect(modelCaller).toHaveBeenCalledTimes(3);
    expect(modelCaller.mock.calls.every((call) => call[2] === fullTranscript)).toBe(true);
    expect(modelCaller.mock.calls[0]?.[1]).toContain('segments');
    expect(modelCaller.mock.calls[1]?.[1]).toContain('AI 视频生产背景');
    expect(modelCaller.mock.calls[2]?.[1]).toContain('工作流拆分');
    expect(result.segments).toHaveLength(2);
    expect(result.cards).toHaveLength(2);
    expect(result.cards.map((card) => card.segmentId)).toEqual(['seg-1', 'seg-2']);
    expect(result.cards[0]?.renderMode).toBe('motion-card');
    expect(result.cards[0]?.motionCard?.tsx).toContain('export default');
    expect(result.cards[1]?.motionCard?.tsx).toContain('export default');
    expect(result.coverPrompts).toEqual(['封面提示词']);
  });

  it('continues with other segments when one card generation fails and returns cardErrors', async () => {
    const modelCaller = vi.fn<typeof generateStructuredData>();
    modelCaller.mockImplementation(async (_settings, _system, _user, _binding, opts) => {
      const label = opts?.label;
      if (label === 'planning.segment') {
        return {
          segments: [baseSegment, secondSegment],
          coverPrompts: ['封面提示词'],
          summary: '节目总结',
          keywords: ['AI', '播客'],
          globalPrompt: '整体偏商业分析风',
        };
      }
      if (typeof label === 'string' && label.includes('seg-1')) {
        throw new Error('LLM 结构化输出请求 空闲超时');
      }
      return {
        id: 'card-seg-2',
        type: 'summary',
        title: '第二段卡片',
        content: '第二段内容',
        startMs: 3_000,
        endMs: 7_000,
        displayDurationMs: 5_000,
        displayMode: 'fullscreen',
        template: 'summary-default',
        enabled: true,
        renderMode: 'motion-card',
        motionCard: { tsx: VALID_MOTION_TSX },
        style: { primaryColor: '#79c4ff', backgroundColor: '#151922', fontSize: 48 },
      };
    });

    const result = await analyzeSrt(baseEntries, settings, {
      generateStructuredData: modelCaller,
      globalPrompt: '整体偏商业分析风',
    });

    expect(modelCaller).toHaveBeenCalledTimes(3);
    expect(result.cards.map((card) => card.segmentId)).toEqual(['seg-2']);
    expect(result.cardErrors).toBeDefined();
    expect(result.cardErrors).toHaveLength(1);
    expect(result.cardErrors?.[0]?.segmentId).toBe('seg-1');
    expect(result.cardErrors?.[0]?.message).toContain('空闲超时');
    expect(result.segments).toHaveLength(2);
  });

  it('generates one card per split segment when planning returns an overlong segment', async () => {
    const longEntries = makeLongEntries();
    const modelCaller = vi.fn<typeof generateStructuredData>();
    modelCaller.mockImplementation(async (_settings, _system, _user, _binding, opts) => {
      if (opts?.label === 'planning.segment') {
        return {
          segments: [longSegment],
          coverPrompts: ['封面提示词'],
          summary: '节目总结',
          keywords: ['AI', '播客'],
        };
      }

      const label = typeof opts?.label === 'string' ? opts.label : '';
      const idMatch = /（(.+?)）$/.exec(label);
      const segmentId = idMatch?.[1] ?? 'unknown';
      return {
        id: `card-${segmentId}`,
        type: 'summary',
        title: `卡片 ${segmentId}`,
        content: '拆分后的子段内容',
        startMs: 0,
        endMs: 30_000,
        displayDurationMs: 5_000,
        displayMode: 'fullscreen',
        template: 'summary-default',
        enabled: true,
        renderMode: 'motion-card',
        motionCard: { tsx: VALID_MOTION_TSX },
        style: { primaryColor: '#79c4ff', backgroundColor: '#151922', fontSize: 48 },
      };
    });

    const result = await analyzeSrt(longEntries, settings, {
      generateStructuredData: modelCaller,
    });

    expect(result.segments).toHaveLength(5);
    expect(result.cards).toHaveLength(5);
    expect(result.cards.map((card) => card.segmentId)).toEqual([
      'long-seg-part-1',
      'long-seg-part-2',
      'long-seg-part-3',
      'long-seg-part-4',
      'long-seg-part-5',
    ]);
    expect(modelCaller).toHaveBeenCalledTimes(6);
  });
});

describe('regenerateCoverPrompt', () => {
  it('regenerates exactly one cover prompt and trims extra prompts', async () => {
    const modelCaller = vi.fn().mockResolvedValue({
      coverPrompts: ['新的封面提示词', '不应保留的第二条'],
    });

    const result = await regenerateCoverPrompt(baseEntries, settings, {
      generateStructuredData: modelCaller,
      globalPrompt: '整体偏商业媒体封面',
      currentPrompt: '旧提示词',
    });

    expect(result).toEqual(['新的封面提示词']);
    expect(modelCaller).toHaveBeenCalledTimes(1);
    expect(modelCaller.mock.calls[0]?.[1]).toContain('必须使用简体中文');
    expect(modelCaller.mock.calls[0]?.[1]).toContain('旧提示词');
  });
});

describe('regenerateAICard', () => {
  it('regenerates a single motion-card and preserves original card id', async () => {
    const modelCaller = vi.fn<typeof generateStructuredData>().mockResolvedValue({
      id: 'another-id',
      type: 'summary',
      title: '新标题',
      content: '新内容',
      startMs: 100,
      endMs: 2_900,
      displayDurationMs: 6_000,
      displayMode: 'fullscreen',
      template: 'summary-default',
      enabled: true,
      renderMode: 'motion-card',
      cardPrompt: '做成粒子聚合',
      motionCard: { tsx: VALID_MOTION_TSX },
      style: {
        primaryColor: '#79c4ff',
        backgroundColor: '#151922',
        fontSize: 48,
      },
    });

    const result = await regenerateAICard(
      baseEntries,
      baseCard,
      baseSegment,
      settings,
      {
        generateStructuredData: modelCaller,
        globalPrompt: '整体偏商业分析风',
      },
    );

    expect(result.id).toBe('card-1');
    expect(result.segmentId).toBe('seg-1');
    expect(result.title).toBe('新标题');
    expect(result.displayDurationMs).toBe(6_000);
    expect(result.renderMode).toBe('motion-card');
    expect(result.motionCard?.tsx).toContain('export default');
  });

  it('fails fast when segment is missing', async () => {
    await expect(
      regenerateAICard(
        baseEntries,
        baseCard,
        null as unknown as AISegment,
        settings,
        {
          generateStructuredData: vi.fn(),
        },
      ),
    ).rejects.toThrow('缺少卡片对应的段落信息');
  });
});
