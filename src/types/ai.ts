import type { MotionCardPayload } from './motion';
export type { MotionCardPayload } from './motion';

export type AICardType = 'summary' | 'data' | 'insight' | 'chapter' | 'quote' | 'motion';
export type AICardDisplayMode = 'fullscreen' | 'pip';
export type AICardRenderMode = 'legacy' | 'web-card' | 'motion-card';

export interface DataContent {
  chartType: 'bar' | 'comparison' | 'ranking' | 'stat';
  items: Array<{
    label: string;
    value: string | number;
    highlight?: boolean;
  }>;
}

export interface CardStyle {
  primaryColor: string;
  backgroundColor: string;
  fontSize: number;
}

export interface WebCardPayload {
  src?: string;
  srcDoc?: string;
  runtimeStatus?: 'idle' | 'loading' | 'ready' | 'error';
  lastGeneratedAt?: number;
}

export interface AISegment {
  id: string;
  title: string;
  summary: string;
  startMs: number;
  endMs: number;
  transcriptExcerpt?: string;
}

export type AISegmentSemanticType =
  | 'data'
  | 'explanation'
  | 'chapter-transition'
  | 'quote'
  | 'narration';

export type AISegmentComplexityLevel = 'low' | 'medium' | 'high';
export type AISegmentPacingNeed = 'steady' | 'accent' | 'transition';

export interface AISegmentAnalysis extends AISegment {
  semanticType: AISegmentSemanticType;
  complexityLevel: AISegmentComplexityLevel;
  visualizationScore: number;
  pacingNeed: AISegmentPacingNeed;
  keywords: string[];
  entities: string[];
}

export type AIVisualSuggestionType =
  | 'content-card'
  | 'data-motion'
  | 'explainer-motion'
  | 'chapter-transition';

export interface AIVisualSuggestion {
  id: string;
  segmentId: string;
  suggestionType: AIVisualSuggestionType;
  priority: number;
  reason: string;
  enabled: boolean;
  startMs: number;
  endMs: number;
  displayDurationMs: number;
  displayMode: AICardDisplayMode;
  templateKey: string;
  visualBrief: string;
  autoApplyEligible: boolean;
}

export interface AIStoryboardPlan {
  segments: AISegmentAnalysis[];
  suggestions: AIVisualSuggestion[];
  summary: string;
  globalPrompt?: string;
  generatedAt: number;
}

export function buildDefaultStoryboardPlan(): AIStoryboardPlan {
  return {
    segments: [],
    suggestions: [],
    summary: '',
    generatedAt: 0,
  };
}

export interface AICard {
  id: string;
  segmentId: string;
  type: AICardType;
  title: string;
  content: string | DataContent;
  startMs: number;
  endMs: number;
  displayDurationMs: number;
  displayMode: AICardDisplayMode;
  template: string;
  enabled: boolean;
  style: CardStyle;
  renderMode?: AICardRenderMode;
  cardPrompt?: string;
  webCard?: WebCardPayload;
  motionCard?: MotionCardPayload;
}

export interface CoverCandidate {
  id: string;
  prompt: string;
  imageUrl: string;
  selected: boolean;
  error?: string;
}

export interface AIAnalysisResult {
  segments: AISegment[];
  cards: AICard[];
  coverPrompts: string[];
  summary: string;
  keywords: string[];
  globalPrompt?: string;
}

/** 单个 LLM Provider 配置 */
export interface LLMProvider {
  id: string;
  name: string;
  type: 'openai_compatible' | 'anthropic';
  baseUrl: string;
  apiKey: string;
  models: string[];
}

export interface AISettings {
  // 多 Provider
  llmProviders: LLMProvider[];
  defaultProviderId: string | null;
  defaultModel: string | null;
  // OpenAI / OpenAI-compatible
  /** @deprecated 迁移后由 llmProviders 替代 */
  llmBaseUrl: string;
  /** @deprecated 迁移后由 llmProviders 替代 */
  llmApiKey: string;
  /** @deprecated 迁移后由 llmProviders 替代 */
  llmModel: string;
  /** 是否开启模型思考模式，默认开启 */
  enableThinking?: boolean;
  // 图片生成
  jimengApiUrl: string;
  jimengSessionId: string;
  jimengModel?: string;
  // MiniMax TTS
  minimaxApiKey: string;
  minimaxVoiceId: string;
  minimaxSpeed: number;
  minimaxVol?: number;
  minimaxPitch?: number;
  minimaxEmotion?: string;
  minimaxModel?: string;
}

export const DEFAULT_JIMENG_MODEL = 'jimeng-5.0';

export interface AICardOverlayData {
  sourceCardId?: string;
  cardType: AICardType;
  title: string;
  content: string | DataContent;
  template: string;
  displayMode: AICardDisplayMode;
  style: CardStyle;
  renderMode?: AICardRenderMode;
  cardPrompt?: string;
  webCard?: WebCardPayload;
  motionCard?: MotionCardPayload;
  sourceStartMs?: number;
  sourceEndMs?: number;
}

export interface AICardTimelineDraft {
  sourceCardId: string;
  startMs: number;
  durationMs: number;
  aiCardData: AICardOverlayData;
}

const DEFAULT_CARD_BACKGROUND = '#151922';

export const DEFAULT_CARD_STYLE: Record<AICardType, CardStyle> = {
  summary: { primaryColor: '#79c4ff', backgroundColor: DEFAULT_CARD_BACKGROUND, fontSize: 48 },
  data: { primaryColor: '#4ed38a', backgroundColor: DEFAULT_CARD_BACKGROUND, fontSize: 48 },
  insight: { primaryColor: '#ffb347', backgroundColor: DEFAULT_CARD_BACKGROUND, fontSize: 48 },
  chapter: { primaryColor: '#9eb7ff', backgroundColor: DEFAULT_CARD_BACKGROUND, fontSize: 48 },
  quote: { primaryColor: '#ff8f7a', backgroundColor: DEFAULT_CARD_BACKGROUND, fontSize: 48 },
  motion: { primaryColor: '#7df9ff', backgroundColor: DEFAULT_CARD_BACKGROUND, fontSize: 48 },
};

export const DEFAULT_CARD_DURATION_MS = 5_000;

export function getDefaultTemplate(type: AICardType): string {
  return `${type}-default`;
}

export function getDefaultCardStyle(type: AICardType): CardStyle {
  return { ...DEFAULT_CARD_STYLE[type] };
}

export function isAICardType(value: unknown): value is AICardType {
  return ['summary', 'data', 'insight', 'chapter', 'quote', 'motion'].includes(String(value));
}

export function isDataContent(value: unknown): value is DataContent {
  if (!value || typeof value !== 'object' || !('chartType' in value) || !('items' in value)) {
    return false;
  }

  return Array.isArray(value.items);
}

export function hasWebCardSource(webCard?: WebCardPayload | null): boolean {
  return Boolean(webCard?.src || webCard?.srcDoc);
}

export function buildAICardOverlayData(card: AICard): AICardOverlayData {
  return {
    sourceCardId: card.id,
    cardType: card.type,
    title: card.title,
    content: card.content,
    template: card.template,
    displayMode: card.displayMode,
    style: card.style,
    renderMode: card.renderMode ?? 'legacy',
    cardPrompt: card.cardPrompt,
    webCard: card.webCard,
    motionCard: card.motionCard,
    sourceStartMs: card.startMs,
    sourceEndMs: card.endMs,
  };
}

export function buildAICardTimelineDraft(card: AICard): AICardTimelineDraft {
  const sourceStartMs = Number.isFinite(card.startMs) ? Math.max(0, Math.round(card.startMs)) : 0;
  const sourceEndMs = Number.isFinite(card.endMs)
    ? Math.max(sourceStartMs, Math.round(card.endMs))
    : sourceStartMs;
  const durationMs =
    Number.isFinite(card.displayDurationMs) && card.displayDurationMs > 0
      ? Math.round(card.displayDurationMs)
      : DEFAULT_CARD_DURATION_MS;
  const topicSpanMs = Math.max(0, sourceEndMs - sourceStartMs);
  const timelineStartMs = topicSpanMs > durationMs ? sourceEndMs - durationMs : sourceStartMs;

  return {
    sourceCardId: card.id,
    startMs: timelineStartMs,
    durationMs,
    aiCardData: buildAICardOverlayData(card),
  };
}
