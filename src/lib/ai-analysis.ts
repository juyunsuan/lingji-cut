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
  type PromptBindingMap,
  type WebCardPayload,
} from '../types/ai';
import type { MotionCardPayload } from '../types/motion';
import { generateStructuredData } from './llm';
import { resolvePromptBinding } from './llm/binding-resolver';
import type { PromptKind } from './prompts/types';
import {
  getBuiltinPromptTemplate,
  renderTemplate,
  type PromptTemplate,
} from './prompts';

interface AnalyzeSrtOptions {
  maxTokens?: number;
  generateStructuredData?: typeof generateStructuredData;
  globalPrompt?: string;
  planningTemplate?: PromptTemplate;
  cardTemplate?: PromptTemplate;
  projectBindings?: PromptBindingMap | null;
}

interface RegenerateCardOptions {
  generateStructuredData?: typeof generateStructuredData;
  globalPrompt?: string;
  cardPrompt?: string;
  programSummary?: string;
  keywords?: string[];
  cardTemplate?: PromptTemplate;
  projectBindings?: PromptBindingMap | null;
}

interface RegenerateCoverPromptOptions {
  generateStructuredData?: typeof generateStructuredData;
  globalPrompt?: string;
  currentPrompt?: string;
  coverTemplate?: PromptTemplate;
  projectBindings?: PromptBindingMap | null;
}

/**
 * 仅当显式传入 projectBindings（包括 null）时才解析绑定；undefined 时跳过（供测试 mock 调用）。
 */
function maybeResolveBinding(
  kind: PromptKind,
  settings: AISettings,
  projectBindings: PromptBindingMap | null | undefined,
): ReturnType<typeof resolvePromptBinding> | undefined {
  if (projectBindings === undefined) {
    return undefined;
  }
  return resolvePromptBinding(kind, settings, projectBindings);
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
    sourceKind:
      value.sourceKind === 'imported-file' || value.sourceKind === 'generated'
        ? value.sourceKind
        : undefined,
    sourceLabel: typeof value.sourceLabel === 'string' ? value.sourceLabel : undefined,
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

export function buildSegmentPlanningPrompt(
  globalPrompt?: string,
  template?: PromptTemplate,
): string {
  const tpl = template ?? getBuiltinPromptTemplate('planning.segment');
  const trimmed = globalPrompt?.trim();
  const globalPromptLine = trimmed ? `额外创作要求：${trimmed}` : '';
  return renderTemplate(tpl.user, { globalPromptLine });
}

export function buildCoverPromptRegenerationPrompt(
  options: {
    globalPrompt?: string;
    currentPrompt?: string;
  } = {},
  template?: PromptTemplate,
): string {
  const tpl = template ?? getBuiltinPromptTemplate('cover.regeneration');
  const globalPrompt = options.globalPrompt?.trim();
  const currentPrompt = options.currentPrompt?.trim();
  return renderTemplate(tpl.user, {
    globalPrompt: globalPrompt || '无',
    currentPrompt: currentPrompt || '无',
  });
}

export function buildSegmentCardPrompt(
  params: {
    fullTranscript: string;
    segment: AISegment;
    globalPrompt?: string;
    cardPrompt?: string;
    currentCard?: AICard;
    programSummary?: string;
    keywords?: string[];
  },
  template?: PromptTemplate,
): string {
  const {
    fullTranscript,
    segment,
    globalPrompt,
    cardPrompt,
    currentCard,
    programSummary,
    keywords = [],
  } = params;
  const tpl = template ?? getBuiltinPromptTemplate('cards.segment');

  const currentCardSection = currentCard
    ? [
        '当前卡片线索（仅用于延续已有风格和信息结构，不要机械照抄）：',
        `- id: ${currentCard.id}`,
        `- type: ${currentCard.type}`,
        `- title: ${currentCard.title}`,
        `- content: ${
          typeof currentCard.content === 'string'
            ? currentCard.content
            : JSON.stringify(currentCard.content, null, 2)
        }`,
        `- displayMode: ${currentCard.displayMode}`,
        `- template: ${currentCard.template}`,
        `- style.primaryColor: ${currentCard.style.primaryColor}`,
        `- style.backgroundColor: ${currentCard.style.backgroundColor}`,
        `- style.fontSize: ${currentCard.style.fontSize}`,
      ].join('\n')
    : '当前卡片线索：无';

  return renderTemplate(tpl.user, {
    globalPrompt: globalPrompt?.trim() || '无',
    programSummary: programSummary?.trim() || '无',
    keywords: keywords.length > 0 ? keywords.join('、') : '无',
    segmentId: segment.id,
    segmentTitle: segment.title,
    segmentSummary: segment.summary,
    segmentStartMs: segment.startMs,
    segmentEndMs: segment.endMs,
    segmentTranscriptExcerpt: segment.transcriptExcerpt || '无',
    cardPrompt: cardPrompt?.trim() || '无',
    currentCardSection,
    fullTranscript,
  });
}

export async function planTranscriptSegments(
  entries: SrtEntry[],
  settings: AISettings,
  options: AnalyzeSrtOptions = {},
): Promise<SegmentPlanningResult> {
  const {
    generateStructuredData: requestStructuredData = generateStructuredData,
    globalPrompt,
    planningTemplate,
    projectBindings,
  } = options;

  if (entries.length === 0) {
    throw new Error('没有可分析的字幕内容');
  }

  const binding = maybeResolveBinding('planning.segment', settings, projectBindings);
  const payload = await requestStructuredData(
    settings,
    buildSegmentPlanningPrompt(globalPrompt, planningTemplate),
    buildSrtText(entries),
    binding,
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
  planning: Pick<SegmentPlanningResult, 'summary' | 'keywords' | 'globalPrompt'>,
  segment: AISegment,
  settings: AISettings,
  options: {
    generateStructuredData?: typeof generateStructuredData;
    globalPrompt?: string;
    cardPrompt?: string;
    currentCard?: AICard;
    cardTemplate?: PromptTemplate;
    projectBindings?: PromptBindingMap | null;
  } = {},
): Promise<AICard> {
  const {
    generateStructuredData: requestStructuredData = generateStructuredData,
    globalPrompt,
    cardPrompt,
    currentCard,
    cardTemplate,
    projectBindings,
  } = options;

  if (entries.length === 0) {
    throw new Error('没有可用于生成卡片的字幕内容');
  }

  const fullTranscript = buildSrtText(entries);
  const binding = maybeResolveBinding('cards.segment', settings, projectBindings);
  const payload = await requestStructuredData(
    settings,
    buildSegmentCardPrompt(
      {
        fullTranscript,
        segment,
        globalPrompt: globalPrompt?.trim() || planning.globalPrompt,
        cardPrompt,
        currentCard,
        programSummary: planning.summary,
        keywords: planning.keywords,
      },
      cardTemplate,
    ),
    fullTranscript,
    binding,
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
    planningTemplate,
    cardTemplate,
    projectBindings,
  } = options;

  const planning = await planTranscriptSegments(entries, settings, {
    generateStructuredData: requestStructuredData,
    globalPrompt,
    planningTemplate,
    projectBindings,
  });

  const cards: AICard[] = [];
  for (const segment of planning.segments) {
    cards.push(
      await generateCardForSegment(entries, planning, segment, settings, {
        generateStructuredData: requestStructuredData,
        globalPrompt: planning.globalPrompt,
        cardTemplate,
        projectBindings,
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
    cardTemplate,
    projectBindings,
  } = options;

  if (!segment) {
    throw new Error('缺少卡片对应的段落信息');
  }

  const regenerated = await generateCardForSegment(
    entries,
    {
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
      cardTemplate,
      projectBindings,
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
    coverTemplate,
    projectBindings,
  } = options;

  if (entries.length === 0) {
    throw new Error('没有可用于生成封面提示词的字幕内容');
  }

  const binding = maybeResolveBinding('cover.regeneration', settings, projectBindings);
  const payload = await requestStructuredData(
    settings,
    buildCoverPromptRegenerationPrompt(
      {
        globalPrompt,
        currentPrompt,
      },
      coverTemplate,
    ),
    buildSrtText(entries),
    binding,
  );
  const prompts = parseCoverPromptResult(payload);

  if (prompts.length === 0) {
    throw new Error('LLM 未返回有效的封面提示词');
  }

  return prompts;
}
