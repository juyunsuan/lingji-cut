import type { SrtEntry } from '../types';
import {
  DEFAULT_CARD_DURATION_MS,
  getDefaultCardStyle,
  getDefaultTemplate,
  isAICardType,
  isDataContent,
  type AIAnalysisResult,
  type AICard,
  type AISegmentAnalysis,
  type AISegment,
  type AISegmentComplexityLevel,
  type AISegmentPacingNeed,
  type AISegmentSemanticType,
  type AISettings,
  type CardStyle,
  type WebCardPayload,
} from '../types/ai';
import type { MotionCardPayload } from '../types/motion';
import { generateStructuredData } from './llm';

interface AnalyzeSrtOptions {
  maxTokens?: number;
  generateStructuredData?: typeof generateStructuredData;
  globalPrompt?: string;
}

interface RegenerateCardOptions {
  generateStructuredData?: typeof generateStructuredData;
  globalPrompt?: string;
  cardPrompt?: string;
  programSummary?: string;
  keywords?: string[];
}

interface RegenerateCoverPromptOptions {
  generateStructuredData?: typeof generateStructuredData;
  globalPrompt?: string;
  currentPrompt?: string;
}

interface SegmentPlanningResult {
  segments: AISegmentAnalysis[];
  coverPrompts: string[];
  summary: string;
  keywords: string[];
  globalPrompt?: string;
}

function msToTimestamp(ms: number): string {
  const totalSeconds = Math.floor(ms / 1_000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const millis = ms % 1_000;

  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(millis).padStart(3, '0')}`;
}

function normalizeStyle(type: AICard['type'], style: unknown): CardStyle {
  if (!style || typeof style !== 'object') {
    return getDefaultCardStyle(type);
  }

  const candidate = style as Partial<CardStyle>;
  const defaults = getDefaultCardStyle(type);
  return {
    primaryColor: candidate.primaryColor ?? defaults.primaryColor,
    backgroundColor: candidate.backgroundColor ?? defaults.backgroundColor,
    fontSize: Number.isFinite(candidate.fontSize) ? Number(candidate.fontSize) : defaults.fontSize,
  };
}

function isWebCardPayload(value: unknown): value is WebCardPayload {
  return Boolean(
    value &&
      typeof value === 'object' &&
      (('src' in value && typeof (value as { src?: unknown }).src === 'string') ||
        ('srcDoc' in value && typeof (value as { srcDoc?: unknown }).srcDoc === 'string')),
  );
}

function normalizeWebCardPayload(value: unknown): WebCardPayload | undefined {
  if (!isWebCardPayload(value)) {
    return undefined;
  }

  return {
    src: typeof value.src === 'string' ? value.src : undefined,
    srcDoc: typeof value.srcDoc === 'string' ? value.srcDoc : undefined,
    runtimeStatus:
      value.runtimeStatus === 'loading' ||
      value.runtimeStatus === 'ready' ||
      value.runtimeStatus === 'error'
        ? value.runtimeStatus
        : 'idle',
    lastGeneratedAt: Number.isFinite(value.lastGeneratedAt) ? Number(value.lastGeneratedAt) : Date.now(),
  };
}

function isMotionCardPayload(value: unknown): value is MotionCardPayload {
  return Boolean(
    value &&
      typeof value === 'object' &&
      typeof (value as MotionCardPayload).sourceCode === 'string' &&
      typeof (value as MotionCardPayload).compiledCode === 'string',
  );
}

function normalizeMotionCardPayload(value: unknown, promptFallback: string): MotionCardPayload | undefined {
  if (!isMotionCardPayload(value)) {
    return undefined;
  }

  return {
    sourceCode: value.sourceCode,
    compiledCode: value.compiledCode,
    compiledAt: Number.isFinite(value.compiledAt) ? Number(value.compiledAt) : Date.now(),
    compileError: typeof value.compileError === 'string' ? value.compileError : undefined,
    prompt: typeof value.prompt === 'string' && value.prompt.trim() ? value.prompt.trim() : promptFallback,
    retryCount:
      Number.isFinite(value.retryCount) && Number(value.retryCount) >= 0 ? Number(value.retryCount) : 0,
  };
}

function normalizeSemanticType(value: unknown): AISegmentSemanticType {
  return value === 'data' ||
    value === 'explanation' ||
    value === 'chapter-transition' ||
    value === 'quote'
    ? value
    : 'narration';
}

function normalizeComplexityLevel(value: unknown): AISegmentComplexityLevel {
  return value === 'low' || value === 'high' ? value : 'medium';
}

function normalizePacingNeed(value: unknown): AISegmentPacingNeed {
  return value === 'steady' || value === 'transition' ? value : 'accent';
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
}

function normalizeSegment(rawSegment: unknown, index: number): AISegmentAnalysis | null {
  if (!rawSegment || typeof rawSegment !== 'object') {
    return null;
  }

  const candidate = rawSegment as Record<string, unknown>;
  const startMs = Number(candidate.startMs);
  const endMs = Number(candidate.endMs);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
    return null;
  }

  return {
    id: typeof candidate.id === 'string' && candidate.id.trim() ? candidate.id.trim() : `segment-${index + 1}`,
    title:
      typeof candidate.title === 'string' && candidate.title.trim()
        ? candidate.title.trim()
        : `段落 ${index + 1}`,
    summary:
      typeof candidate.summary === 'string' && candidate.summary.trim()
        ? candidate.summary.trim()
        : `段落 ${index + 1}`,
    startMs,
    endMs,
    transcriptExcerpt:
      typeof candidate.transcriptExcerpt === 'string' && candidate.transcriptExcerpt.trim()
        ? candidate.transcriptExcerpt.trim()
        : undefined,
    semanticType: normalizeSemanticType(candidate.semanticType),
    complexityLevel: normalizeComplexityLevel(candidate.complexityLevel),
    visualizationScore: Number.isFinite(candidate.visualizationScore)
      ? Math.max(0, Math.min(100, Number(candidate.visualizationScore)))
      : 50,
    pacingNeed: normalizePacingNeed(candidate.pacingNeed),
    keywords: normalizeStringArray(candidate.keywords),
    entities: normalizeStringArray(candidate.entities),
  };
}

function normalizeCard(
  rawCard: unknown,
  index: number,
  segmentId: string,
  promptFallback?: string,
): AICard | null {
  if (!rawCard || typeof rawCard !== 'object') {
    return null;
  }

  const candidate = rawCard as Record<string, unknown>;
  if (!isAICardType(candidate.type)) {
    return null;
  }

  const startMs = Number(candidate.startMs);
  const endMs = Number(candidate.endMs);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
    return null;
  }

  const content =
    typeof candidate.content === 'string' || isDataContent(candidate.content)
      ? candidate.content
      : '';
  const webCard = normalizeWebCardPayload(candidate.webCard);
  const cardPrompt =
    typeof candidate.cardPrompt === 'string' && candidate.cardPrompt.trim()
      ? candidate.cardPrompt.trim()
      : promptFallback?.trim() || undefined;
  const motionCard = normalizeMotionCardPayload(candidate.motionCard, cardPrompt ?? '');
  const renderMode =
    candidate.renderMode === 'motion-card' || motionCard
      ? 'motion-card'
      : candidate.renderMode === 'web-card' || webCard
        ? 'web-card'
        : 'legacy';

  return {
    id:
      typeof candidate.id === 'string' && candidate.id.trim()
        ? candidate.id.trim()
        : `${segmentId}-card-${index + 1}`,
    segmentId:
      typeof candidate.segmentId === 'string' && candidate.segmentId.trim()
        ? candidate.segmentId.trim()
        : segmentId,
    type: candidate.type,
    title: typeof candidate.title === 'string' ? candidate.title : `卡片 ${index + 1}`,
    content,
    startMs,
    endMs,
    displayDurationMs:
      Number.isFinite(candidate.displayDurationMs) && Number(candidate.displayDurationMs) > 0
        ? Number(candidate.displayDurationMs)
        : DEFAULT_CARD_DURATION_MS,
    displayMode: candidate.displayMode === 'pip' ? 'pip' : 'fullscreen',
    template:
      typeof candidate.template === 'string' && candidate.template
        ? candidate.template
        : getDefaultTemplate(candidate.type),
    enabled: candidate.enabled !== false,
    style: normalizeStyle(candidate.type, candidate.style),
    renderMode,
    cardPrompt,
    webCard,
    motionCard,
  };
}

function buildUnifiedVisualPromptSection(): string {
  return `统一视觉基线（首次生成与二次重生成都必须遵守）：
- 必须按 1920x1080 的 16:9 画布设计，并默认铺满整个画面
- 禁止只做居中的窄卡片、手机比例、小弹窗或大量留白布局
- 不要把主要内容限制在很小的 max-width 容器里
- 尽量做成信息层级清晰、视觉冲击力强的 16:9 卡片
- 不要输出 markdown 代码块
- 内容必须忠于字幕事实，不要编造
- 禁止输出任何“数据来源”“来源：”“Source”"数据统计口径"之类的底部标注、免责声明、署名或角标文案
- 请保留 card 的 title/content 作为结构化兜底文本

颜色建议：
- summary: #79c4ff
- data: #4ed38a
- insight: #ffb347
- chapter: #9eb7ff
- quote: #ff8f7a

整体风格建议：
- 偏 macOS desktop dark / Swift UI 的半透明磨砂层次
- 高光和阴影要克制，避免霓虹紫、强饱和电商橙、网页营销页式渐变`;
}

function buildTimelinePromptSection(): string {
  return `时间轴约束（非常重要）：
- startMs 必须对应“观众真正听到该主题”的那句字幕开始时间
- 不要把铺垫、转场、提问或上一话题的时间提前算进来
- endMs 必须对应该主题核心表达完成的那句字幕结束时间
- displayDurationMs 必须覆盖这张卡片对应的核心表达，不能在主题刚讲到时就结束
- 如果一个主题在后半段才真正展开，宁可把 startMs 设晚，也不要让卡片提前出现
- startMs、endMs、displayDurationMs 必须输出毫秒数字`;
}

function normalizeCoverPrompts(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const prompt = value.find(
    (item): item is string => typeof item === 'string' && item.trim().length > 0,
  );
  return prompt ? [prompt.trim()] : [];
}

function parseCoverPromptResult(value: unknown): string[] {
  if (!value || typeof value !== 'object') {
    return [];
  }

  const candidate = value as Record<string, unknown>;
  if (typeof candidate.coverPrompt === 'string' && candidate.coverPrompt.trim()) {
    return [candidate.coverPrompt.trim()];
  }

  return normalizeCoverPrompts(candidate.coverPrompts);
}

export function parseSegmentPlanningResult(value: unknown): SegmentPlanningResult | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const candidate = value as Record<string, unknown>;
  const segments = Array.isArray(candidate.segments)
    ? candidate.segments
        .map(normalizeSegment)
        .filter((segment): segment is AISegmentAnalysis => segment !== null)
    : [];

  if (segments.length === 0) {
    return null;
  }

  return {
    segments,
    coverPrompts: normalizeCoverPrompts(candidate.coverPrompts),
    summary: typeof candidate.summary === 'string' ? candidate.summary : '',
    keywords: normalizeStringArray(candidate.keywords),
    globalPrompt: typeof candidate.globalPrompt === 'string' ? candidate.globalPrompt : undefined,
  };
}

export function buildSrtText(entries: SrtEntry[]): string {
  return entries
    .map((entry) => `[${msToTimestamp(entry.startMs)} --> ${msToTimestamp(entry.endMs)}] ${entry.text}`)
    .join('\n');
}

export function buildSegmentPlanningPrompt(globalPrompt?: string): string {
  const promptLine = globalPrompt?.trim()
    ? `\n额外创作要求：${globalPrompt.trim()}\n`
    : '\n';

  return `你是一个播客内容分析助手。请先完整理解整篇字幕，再把节目拆成有明确语义边界的段落，并输出严格 JSON。${promptLine}

输出结构必须包含：
- segments: 2-8 个段落
- coverPrompts: 1 组封面提示词，数组中只能有 1 条
- summary: 一句话总结
- keywords: 关键词数组
- globalPrompt: 沿用输入的整期创作提示词，没有则返回空字符串

segments 中每一项必须包含：
- id
- title
- summary
- startMs
- endMs
- transcriptExcerpt
- semanticType: data / explanation / chapter-transition / quote / narration
- complexityLevel: low / medium / high
- visualizationScore: 0-100
- pacingNeed: steady / accent / transition
- keywords: 该段关键词数组
- entities: 该段关键实体数组

段落拆分要求：
- 必须按真实话题边界拆分，而不是按 token 长度硬切
- startMs / endMs 必须对应该段真正开始与结束的字幕时间
- 如果前面只是铺垫，不要把时间提前算进该段
- transcriptExcerpt 保留该段最关键的原始字幕摘录，便于后续逐段生成卡片

coverPrompts 要求：
- 必须使用简体中文
- 适合直接用于 16:9 播客封面生成
- 除品牌名、专有名词或必要缩写外，不要使用英文

请只返回 JSON，不要附加解释。`;
}

export function buildCoverPromptRegenerationPrompt(
  options: {
    globalPrompt?: string;
    currentPrompt?: string;
  } = {},
): string {
  const globalPrompt = options.globalPrompt?.trim();
  const currentPrompt = options.currentPrompt?.trim();

  return `你是一个播客封面创意助手。请结合字幕内容，为这一期播客输出严格 JSON，且只返回 1 条封面提示词。

已有整期创作提示词：
${globalPrompt || '无'}

当前封面提示词（仅用于参考，可改写）：
${currentPrompt || '无'}

输出结构必须包含：
- coverPrompts: 数组，但只能包含 1 条字符串

要求：
- 必须使用简体中文
- 适合直接用于 AI 生成 16:9 播客封面
- 画面感强，信息聚焦，避免空泛形容词堆砌
- 尽量体现节目核心主题、关键人物或冲突感
- 除品牌名、专有名词或必要缩写外，不要使用英文

请只返回 JSON，不要附加解释。`;
}

export function buildSegmentCardPrompt(params: {
  fullTranscript: string;
  segment: AISegment;
  globalPrompt?: string;
  cardPrompt?: string;
  currentCard?: AICard;
  programSummary?: string;
  keywords?: string[];
}): string {
  const {
    fullTranscript,
    segment,
    globalPrompt,
    cardPrompt,
    currentCard,
    programSummary,
    keywords = [],
  } = params;

  const currentCardSection = currentCard
    ? `当前卡片线索（仅用于延续已有风格和信息结构，不要机械照抄）：
- id: ${currentCard.id}
- type: ${currentCard.type}
- title: ${currentCard.title}
- content: ${typeof currentCard.content === 'string' ? currentCard.content : JSON.stringify(currentCard.content, null, 2)}
- displayMode: ${currentCard.displayMode}
- template: ${currentCard.template}
- style.primaryColor: ${currentCard.style.primaryColor}
- style.backgroundColor: ${currentCard.style.backgroundColor}
- style.fontSize: ${currentCard.style.fontSize}
`
    : '当前卡片线索：无\n';

  return `你是一个播客内容分析助手，同时也是一个网页信息卡设计师。现在要围绕单个内容段落生成一张网页信息卡，请输出严格 JSON，且只返回单张卡片对象。

整期创作提示词：
${globalPrompt?.trim() || '无'}

节目级总结：
${programSummary?.trim() || '无'}

节目关键词：
${keywords.length > 0 ? keywords.join('、') : '无'}

当前 segment 信息：
- id: ${segment.id}
- title: ${segment.title}
- summary: ${segment.summary}
- startMs: ${segment.startMs}
- endMs: ${segment.endMs}
- transcriptExcerpt: ${segment.transcriptExcerpt || '无'}

单卡追加提示词：
${cardPrompt?.trim() || '无'}

${currentCardSection}
输出字段必须包含：
- id
- segmentId
- type
- title
- content
- startMs
- endMs
- displayDurationMs
- displayMode
- template
- enabled
- style
- renderMode
- cardPrompt
- webCard

其中：
- renderMode 默认输出 "web-card"
- webCard.srcDoc 必须是完整 HTML 文档
- 允许 HTML/CSS/JS 和外部资源
${buildTimelinePromptSection()}
${buildUnifiedVisualPromptSection()}
- 必须围绕当前 segment 生成，不要偏离整期主线
- 可以参考“当前卡片线索”延续排版与视觉方向，但不要照抄旧内容
- 请基于整篇全文理解这段内容在整期中的作用，再决定卡片信息结构

完整字幕全文如下：
${fullTranscript}

请只返回 JSON 对象，不要附加解释。`;
}

export async function planTranscriptSegments(
  entries: SrtEntry[],
  settings: AISettings,
  options: AnalyzeSrtOptions = {},
): Promise<SegmentPlanningResult> {
  const {
    generateStructuredData: requestStructuredData = generateStructuredData,
    globalPrompt,
  } = options;

  if (entries.length === 0) {
    throw new Error('没有可分析的字幕内容');
  }

  const payload = await requestStructuredData(
    settings,
    buildSegmentPlanningPrompt(globalPrompt),
    buildSrtText(entries),
  );
  const parsed = parseSegmentPlanningResult(payload);
  if (!parsed) {
    throw new Error('LLM 未返回有效的段落规划结果');
  }

  return {
    ...parsed,
    globalPrompt: globalPrompt?.trim() || parsed.globalPrompt,
  };
}

export async function generateCardForSegment(
  entries: SrtEntry[],
  planning: SegmentPlanningResult,
  segment: AISegment,
  settings: AISettings,
  options: {
    generateStructuredData?: typeof generateStructuredData;
    globalPrompt?: string;
    cardPrompt?: string;
    currentCard?: AICard;
  } = {},
): Promise<AICard> {
  const {
    generateStructuredData: requestStructuredData = generateStructuredData,
    globalPrompt,
    cardPrompt,
    currentCard,
  } = options;

  if (entries.length === 0) {
    throw new Error('没有可用于生成卡片的字幕内容');
  }

  const fullTranscript = buildSrtText(entries);
  const payload = await requestStructuredData(
    settings,
    buildSegmentCardPrompt({
      fullTranscript,
      segment,
      globalPrompt: globalPrompt?.trim() || planning.globalPrompt,
      cardPrompt,
      currentCard,
      programSummary: planning.summary,
      keywords: planning.keywords,
    }),
    fullTranscript,
  );
  const parsed = normalizeCard(payload, 0, segment.id, cardPrompt);
  if (!parsed) {
    throw new Error('LLM 未返回有效的卡片结果');
  }

  return {
    ...parsed,
    segmentId: segment.id,
    cardPrompt: cardPrompt?.trim() || parsed.cardPrompt,
  };
}

export async function analyzeSrt(
  entries: SrtEntry[],
  settings: AISettings,
  options: AnalyzeSrtOptions = {},
): Promise<AIAnalysisResult> {
  const {
    generateStructuredData: requestStructuredData = generateStructuredData,
    globalPrompt,
  } = options;

  const planning = await planTranscriptSegments(entries, settings, {
    generateStructuredData: requestStructuredData,
    globalPrompt,
  });

  const cards: AICard[] = [];
  for (const segment of planning.segments) {
    cards.push(
      await generateCardForSegment(entries, planning, segment, settings, {
        generateStructuredData: requestStructuredData,
        globalPrompt: planning.globalPrompt,
      }),
    );
  }

  return {
    segments: planning.segments,
    cards,
    coverPrompts: planning.coverPrompts,
    summary: planning.summary,
    keywords: planning.keywords,
    globalPrompt: planning.globalPrompt,
  };
}

export async function regenerateAICard(
  entries: SrtEntry[],
  card: AICard,
  segment: AISegment,
  settings: AISettings,
  options: RegenerateCardOptions = {},
): Promise<AICard> {
  const {
    generateStructuredData: requestStructuredData = generateStructuredData,
    globalPrompt,
    cardPrompt = card.cardPrompt,
    programSummary,
    keywords = [],
  } = options;

  if (!segment) {
    throw new Error('缺少卡片对应的段落信息');
  }

  const regenerated = await generateCardForSegment(
    entries,
    {
      segments: [segment],
      coverPrompts: [],
      summary: programSummary ?? '',
      keywords,
      globalPrompt: globalPrompt?.trim() || undefined,
    },
    segment,
    settings,
    {
      generateStructuredData: requestStructuredData,
      globalPrompt,
      cardPrompt,
      currentCard: card,
    },
  );

  return {
    ...card,
    ...regenerated,
    id: card.id,
    segmentId: segment.id,
    enabled: card.enabled,
    cardPrompt: cardPrompt?.trim() || undefined,
  };
}

export async function regenerateCoverPrompt(
  entries: SrtEntry[],
  settings: AISettings,
  options: RegenerateCoverPromptOptions = {},
): Promise<string[]> {
  const {
    generateStructuredData: requestStructuredData = generateStructuredData,
    globalPrompt,
    currentPrompt,
  } = options;

  if (entries.length === 0) {
    throw new Error('没有可用于生成封面提示词的字幕内容');
  }

  const payload = await requestStructuredData(
    settings,
    buildCoverPromptRegenerationPrompt({
      globalPrompt,
      currentPrompt,
    }),
    buildSrtText(entries),
  );
  const prompts = parseCoverPromptResult(payload);

  if (prompts.length === 0) {
    throw new Error('LLM 未返回有效的封面提示词');
  }

  return prompts;
}
