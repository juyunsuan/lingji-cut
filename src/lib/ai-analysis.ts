import type { SrtEntry } from '../types';
import {
  DEFAULT_CARD_DURATION_MS,
  getDefaultCardStyle,
  getDefaultTemplate,
  isAICardType,
  isDataContent,
  type AIAnalysisResult,
  type AICard,
  type AISettings,
  type CardStyle,
  type WebCardPayload,
} from '../types/ai';
import { callLLM, parseLLMJsonResponse } from './llm-client';

interface AnalyzeSrtOptions {
  maxTokens?: number;
  callModel?: typeof callLLM;
  globalPrompt?: string;
}

interface RegenerateCardOptions {
  callModel?: typeof callLLM;
  globalPrompt?: string;
  cardPrompt?: string;
  contextPaddingMs?: number;
}

interface RegenerateCoverPromptOptions {
  callModel?: typeof callLLM;
  globalPrompt?: string;
  currentPrompt?: string;
}

function msToTimestamp(ms: number): string {
  const totalSeconds = Math.floor(ms / 1_000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const millis = ms % 1_000;

  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(millis).padStart(3, '0')}`;
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length * 1.3);
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

function normalizeCard(rawCard: unknown, index: number): AICard | null {
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
  const renderMode =
    candidate.renderMode === 'web-card' || webCard ? 'web-card' : 'legacy';

  return {
    id: typeof candidate.id === 'string' && candidate.id ? candidate.id : `card-${index + 1}`,
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
    cardPrompt: typeof candidate.cardPrompt === 'string' ? candidate.cardPrompt : undefined,
    webCard,
  };
}

function formatCardContentForPrompt(content: AICard['content']): string {
  return typeof content === 'string' ? content : JSON.stringify(content, null, 2);
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
- summary: #6366f1
- data: #10b981
- insight: #f59e0b
- chapter: #8b5cf6
- quote: #ec4899`;
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

function parsePartialResult(value: unknown): AIAnalysisResult | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const candidate = value as Record<string, unknown>;
  const cards = Array.isArray(candidate.cards)
    ? candidate.cards.map(normalizeCard).filter(Boolean)
    : [];

  return {
    cards,
    coverPrompts: normalizeCoverPrompts(candidate.coverPrompts),
    summary: typeof candidate.summary === 'string' ? candidate.summary : '',
    keywords: Array.isArray(candidate.keywords)
      ? candidate.keywords.filter((item): item is string => typeof item === 'string')
      : [],
    globalPrompt: typeof candidate.globalPrompt === 'string' ? candidate.globalPrompt : undefined,
  };
}

export function buildSrtText(entries: SrtEntry[]): string {
  return entries
    .map((entry) => `[${msToTimestamp(entry.startMs)} --> ${msToTimestamp(entry.endMs)}] ${entry.text}`)
    .join('\n');
}

export function chunkSrtEntries(
  entries: SrtEntry[],
  maxTokens: number,
  overlapEntries = 1,
): SrtEntry[][] {
  if (entries.length === 0) {
    return [];
  }

  if (estimateTokens(buildSrtText(entries)) <= maxTokens) {
    return [entries];
  }

  const chunks: SrtEntry[][] = [];
  let currentChunk: SrtEntry[] = [];
  let currentTokens = 0;

  for (const entry of entries) {
    const entryTokens = estimateTokens(buildSrtText([entry]));
    if (currentChunk.length > 0 && currentTokens + entryTokens > maxTokens) {
      chunks.push(currentChunk);
      currentChunk = currentChunk.slice(-overlapEntries);
      currentTokens = estimateTokens(buildSrtText(currentChunk));
    }

    currentChunk.push(entry);
    currentTokens += entryTokens;
  }

  if (currentChunk.length > 0) {
    chunks.push(currentChunk);
  }

  return chunks;
}

export function buildAnalysisPrompt(globalPrompt?: string): string {
  const promptLine = globalPrompt?.trim()
    ? `\n额外创作要求：${globalPrompt.trim()}\n`
    : '\n';
  const visualPrompt = buildUnifiedVisualPromptSection();

  return `你是一个播客内容分析助手，同时也是一个网页信息卡设计师。请分析字幕并输出严格 JSON。${promptLine}

输出结构必须包含：
- cards: 3-8 张卡片，类型只能是 summary、data、insight、chapter、quote
- coverPrompts: 1 组封面提示词，数组中只能有 1 条
- summary: 一句话总结
- keywords: 关键词数组
- globalPrompt: 沿用输入的整期创作提示词，没有则返回空字符串

cards 中每一项必须包含：
- id
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
- webCard

data 类型的 content 使用对象：
{
  "chartType": "bar|comparison|ranking|stat",
  "items": [{ "label": "标签", "value": 72, "highlight": true }]
}

renderMode 默认输出 "web-card"。

webCard 使用对象：
{
  "srcDoc": "<!doctype html>...</html>"
}

srcDoc 要求：
- 必须是完整 HTML 文档
- 允许 HTML/CSS/JS
- 允许外部图片、脚本、字体和样式
- coverPrompts 必须使用简体中文撰写，适合直接用于封面图生成
- coverPrompts 避免英文，除非品牌名、专有名词或必要缩写
${visualPrompt}

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

export function buildCardRegenerationPrompt(
  card: AICard,
  options: {
    globalPrompt?: string;
    cardPrompt?: string;
  } = {},
): string {
  const globalPrompt = options.globalPrompt?.trim();
  const cardPrompt = options.cardPrompt?.trim();
  const visualPrompt = buildUnifiedVisualPromptSection();
  const currentContent = formatCardContentForPrompt(card.content);

  return `你是一个播客内容分析助手，同时也是一个网页信息卡设计师。现在要重生成一张播客信息卡，请输出严格 JSON，且只返回单张卡片对象。

这次重生成必须沿用首次生成时的统一视觉基线；如果没有明确要求，不要另起一套新的设计语言。

当前卡片信息：
- id: ${card.id}
- type: ${card.type}
- title: ${card.title}
- content: ${currentContent}
- startMs: ${card.startMs}
- endMs: ${card.endMs}
- displayDurationMs: ${card.displayDurationMs}
- displayMode: ${card.displayMode}
- template: ${card.template}
- style.primaryColor: ${card.style.primaryColor}
- style.backgroundColor: ${card.style.backgroundColor}
- style.fontSize: ${card.style.fontSize}

整期创作提示词：
${globalPrompt || '无'}

单卡追加提示词：
${cardPrompt || '无'}

输出字段必须包含：
- id
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
${visualPrompt}
- 可以基于当前卡片信息和追加提示词调整文案组织与排版细节
- 视觉风格必须与首次生成保持一致
- 优先延续当前卡片的 template 与 style 线索

请只返回 JSON 对象，不要附加解释。`;
}

export function mergeAnalysisResults(results: AIAnalysisResult[]): AIAnalysisResult {
  const seenStartMs = new Set<number>();
  const cards: AICard[] = [];
  const keywords = new Set<string>();
  let coverPrompts: string[] = [];
  const summaries: string[] = [];
  let globalPrompt = '';

  for (const result of results) {
    for (const card of result.cards) {
      if (seenStartMs.has(card.startMs)) {
        continue;
      }

      seenStartMs.add(card.startMs);
      cards.push(card);
    }

    for (const keyword of result.keywords) {
      keywords.add(keyword);
    }

    if (result.coverPrompts.length > 0) {
      coverPrompts = normalizeCoverPrompts(result.coverPrompts);
    }

    if (result.summary) {
      summaries.push(result.summary);
    }

    if (result.globalPrompt) {
      globalPrompt = result.globalPrompt;
    }
  }

  return {
    cards: cards.sort((left, right) => left.startMs - right.startMs),
    coverPrompts,
    summary: summaries.join('；'),
    keywords: [...keywords],
    globalPrompt: globalPrompt || undefined,
  };
}

export function getCardContextEntries(
  entries: SrtEntry[],
  card: Pick<AICard, 'startMs' | 'endMs'>,
  paddingMs = 10_000,
): SrtEntry[] {
  const startMs = Math.max(0, card.startMs - paddingMs);
  const endMs = card.endMs + paddingMs;

  return entries.filter((entry) => entry.endMs >= startMs && entry.startMs <= endMs);
}

export async function analyzeSrt(
  entries: SrtEntry[],
  settings: AISettings,
  options: AnalyzeSrtOptions = {},
): Promise<AIAnalysisResult> {
  const { maxTokens = 8_000, callModel = callLLM, globalPrompt } = options;
  const chunks = chunkSrtEntries(entries, maxTokens);
  if (chunks.length === 0) {
    throw new Error('没有可分析的字幕内容');
  }

  const systemPrompt = buildAnalysisPrompt(globalPrompt);
  const partialResults: AIAnalysisResult[] = [];

  for (const chunk of chunks) {
    const rawResult = await callModel(settings, systemPrompt, buildSrtText(chunk));
    const parsed = parsePartialResult(parseLLMJsonResponse(rawResult));
    if (parsed) {
      partialResults.push(parsed);
      continue;
    }
  }

  if (partialResults.length === 0) {
    throw new Error('LLM 未返回有效的分析结果');
  }

  return {
    ...mergeAnalysisResults(partialResults),
    globalPrompt: globalPrompt?.trim() || undefined,
  };
}

export async function regenerateAICard(
  entries: SrtEntry[],
  card: AICard,
  settings: AISettings,
  options: RegenerateCardOptions = {},
): Promise<AICard> {
  const {
    callModel = callLLM,
    globalPrompt,
    cardPrompt = card.cardPrompt,
    contextPaddingMs = 10_000,
  } = options;

  const contextEntries = getCardContextEntries(entries, card, contextPaddingMs);
  if (contextEntries.length === 0) {
    throw new Error('未找到与该卡片对应的字幕上下文');
  }

  const rawResult = await callModel(
    settings,
    buildCardRegenerationPrompt(card, {
      globalPrompt,
      cardPrompt,
    }),
    buildSrtText(contextEntries),
  );
  const parsed = normalizeCard(parseLLMJsonResponse(rawResult), 0);
  if (!parsed) {
    throw new Error('LLM 未返回有效的卡片结果');
  }

  return {
    ...card,
    ...parsed,
    id: card.id,
    enabled: card.enabled,
    cardPrompt: cardPrompt?.trim() || undefined,
  };
}

export async function regenerateCoverPrompt(
  entries: SrtEntry[],
  settings: AISettings,
  options: RegenerateCoverPromptOptions = {},
): Promise<string[]> {
  const { callModel = callLLM, globalPrompt, currentPrompt } = options;

  if (entries.length === 0) {
    throw new Error('没有可用于生成封面提示词的字幕内容');
  }

  const rawResult = await callModel(
    settings,
    buildCoverPromptRegenerationPrompt({
      globalPrompt,
      currentPrompt,
    }),
    buildSrtText(entries),
  );
  const prompts = parseCoverPromptResult(parseLLMJsonResponse(rawResult));

  if (prompts.length === 0) {
    throw new Error('LLM 未返回有效的封面提示词');
  }

  return prompts;
}
