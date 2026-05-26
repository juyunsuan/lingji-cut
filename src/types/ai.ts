import type { MotionCardPayload } from './motion';
import type { PromptKind } from '../lib/prompts/types';
import type { CoverEditState } from '../lib/cover-editor/contracts';
export type { MotionCardPayload } from './motion';

export type AICardType =
  | 'summary'
  | 'data'
  | 'insight'
  | 'chapter'
  | 'quote'
  | 'motion'
  | 'image'
  | 'video';

export type AICardMediaType = 'image' | 'video';
export type AICardDisplayMode = 'fullscreen' | 'pip';
export type AICardRenderMode = 'legacy' | 'motion-card';

export interface DataContent {
  chartType: 'bar' | 'comparison' | 'ranking' | 'stat';
  items: Array<{
    label: string;
    value: string | number;
    highlight?: boolean;
  }>;
}

export interface MediaCardContent {
  mediaType: AICardMediaType;
  /** 相对 projectDir，例：'ai-cards/<cardId>/image.png' */
  assetPath: string | null;
  /** 仅 video：首帧海报，相对 projectDir */
  posterPath?: string | null;
  /** 仅 video：生成产物的真实时长（ms） */
  mediaDurationMs?: number;
  /** 字段类型为 ImageAspectRatio；video 卡运行时仅接受 '16:9' | '9:16' | '1:1' 子集，由 form 与 IPC handler 双向校验 */
  aspectRatio: ImageAspectRatio;
  prompt: string;
  negativePrompt?: string;
  providerId: string | null;
  model: string | null;
  generationStatus:
    | 'idle'
    | 'pending'
    | 'generating'
    | 'ready'
    | 'failed'
    | 'cancelled';
  errorMessage?: string;
  generatedAt?: number;
  extraParams?: Record<string, unknown>;
}

export interface CardStyle {
  primaryColor: string;
  backgroundColor: string;
  fontSize: number;
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

/**
 * 段落最适合的卡片可视化形式：
 * - motion：抽象 / 摘要 / 数据演示 / 时间线 / 概念对比 → 适合 Remotion 动画卡片
 * - image：产品 / 参数 / 界面 / 物件 / 复杂场景 → 适合 AI 生成的实拍/插画图片
 *
 * planning.segment LLM 自行判定；缺省回退 motion。
 */
export type AISegmentVisualType = 'motion' | 'image';

export interface AISegmentAnalysis extends AISegment {
  semanticType: AISegmentSemanticType;
  complexityLevel: AISegmentComplexityLevel;
  visualizationScore: number;
  pacingNeed: AISegmentPacingNeed;
  keywords: string[];
  entities: string[];
  visualType?: AISegmentVisualType;
}

export interface AICard {
  id: string;
  segmentId: string;
  type: AICardType;
  title: string;
  content: string | DataContent | MediaCardContent;
  startMs: number;
  endMs: number;
  displayDurationMs: number;
  displayMode: AICardDisplayMode;
  template: string;
  enabled: boolean;
  style: CardStyle;
  renderMode?: AICardRenderMode;
  cardPrompt?: string;
  motionCard?: MotionCardPayload;
}

export interface CoverCandidate {
  id: string;
  prompt: string;
  imageUrl: string;
  selected: boolean;
  error?: string;
  /** 来源候选 id；AI 原图为 undefined */
  editedFrom?: string;
  /** 编辑状态快照，用于再编辑时恢复工具面板 */
  edits?: CoverEditState;
  /** 生成时间戳 */
  createdAt?: number;
}

export type { CoverEditState, CoverTextOverlay } from '../lib/cover-editor/contracts';

export interface AIAnalysisCardError {
  segmentId: string;
  segmentTitle?: string;
  segmentIndex?: number;
  totalSegments?: number;
  message: string;
}

export interface AIAnalysisResult {
  segments: AISegment[];
  cards: AICard[];
  coverPrompts: string[];
  summary: string;
  keywords: string[];
  globalPrompt?: string;
  /**
   * 段卡片生成中失败的段（不阻塞其它段）。UI 可据此在 Editor 里
   * 引导用户对失败段单独执行"重生成卡片"。
   */
  cardErrors?: AIAnalysisCardError[];
}

/** LM Studio 默认 OpenAI 兼容端点 */
export const LMSTUDIO_DEFAULT_BASE_URL = 'http://localhost:1234/v1';

/** 单个 LLM Provider 配置 */
export interface LLMProvider {
  id: string;
  name: string;
  type: 'openai_compatible' | 'anthropic' | 'gemini' | 'lmstudio' | 'claude_code_acp';
  baseUrl: string;
  apiKey: string;
  models: string[];
  /** 是否启用模型思考模式；缺省视为 true */
  enableThinking?: boolean;
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
  /** @deprecated 已迁移到 LLMProvider.enableThinking；保留仅用于旧数据迁移 */
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
  // —— 新增：图像 Provider ——
  imageProviders: ImageProvider[];
  defaultImageProviderId: string | null;
  defaultImageModel: string | null;
  /**
   * 全局封面图生成提示词。
   * 在生成封面图时与"基于内容生成的提示词"拼接后再发送给图像 Provider，
   * 用于稳定承载用户偏好的整体风格、品牌、画质等约束。
   */
  globalCoverImagePrompt?: string;
  // —— 新增：视频 Provider ——
  videoProviders: VideoProvider[];
  defaultVideoProviderId: string | null;
  defaultVideoModel: string | null;
  // —— 新增：提示词 → AI 绑定（全局层）——
  promptBindings: PromptBindingMap;
  /**
   * 段落信息卡片（含信息图）生成并发数。
   * 控制 analyzeSrt 中分段卡片生成 worker 数；image 卡片的图像 Provider 调用
   * 嵌套在 worker 内，因此该值同时决定信息图并行生成数。
   * 必须 >= 1，默认 2。
   */
  cardGenerationConcurrency?: number;
}

export const DEFAULT_JIMENG_MODEL = 'jimeng-5.0';

export interface AICardOverlayData {
  sourceCardId?: string;
  cardType: AICardType;
  title: string;
  content: string | DataContent | MediaCardContent;
  template: string;
  displayMode: AICardDisplayMode;
  style: CardStyle;
  renderMode?: AICardRenderMode;
  cardPrompt?: string;
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
  image: { primaryColor: '#79c4ff', backgroundColor: DEFAULT_CARD_BACKGROUND, fontSize: 48 },
  video: { primaryColor: '#ff8f7a', backgroundColor: DEFAULT_CARD_BACKGROUND, fontSize: 48 },
};

export const DEFAULT_CARD_DURATION_MS = 5_000;

export function getDefaultTemplate(type: AICardType): string {
  return `${type}-default`;
}

export function getDefaultCardStyle(type: AICardType): CardStyle {
  return { ...DEFAULT_CARD_STYLE[type] };
}

export function isAICardType(value: unknown): value is AICardType {
  return [
    'summary',
    'data',
    'insight',
    'chapter',
    'quote',
    'motion',
    'image',
    'video',
  ].includes(String(value));
}

export function isDataContent(value: unknown): value is DataContent {
  if (!value || typeof value !== 'object' || !('chartType' in value) || !('items' in value)) {
    return false;
  }

  return Array.isArray(value.items);
}

export function isMediaContent(value: unknown): value is MediaCardContent {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    'mediaType' in v &&
    'aspectRatio' in v &&
    'generationStatus' in v &&
    (v.mediaType === 'image' || v.mediaType === 'video')
  );
}

export function isMediaCardType(t: AICardType): t is 'image' | 'video' {
  return t === 'image' || t === 'video';
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
    motionCard: card.motionCard,
    sourceStartMs: card.startMs,
    sourceEndMs: card.endMs,
  };
}

/** 受支持的图像生成 Provider 类型 */
export type ImageProviderType =
  | 'jimeng'
  | 'openai_image'
  | 'minimax'
  | 'doubao'
  | 'imagen'
  | 'wanx'
  | 'apimart'
  | 'custom';

/** 图像宽高比公共集 */
export type ImageAspectRatio = '1:1' | '16:9' | '9:16' | '4:3' | '3:4';

/** Provider 能力描述（由 adapter 在 image-gen 注册表内注入，types 仅做类型契约） */
export interface ImageProviderCapabilities {
  aspectRatios: ImageAspectRatio[];
  maxN: number;
  supportsImageToImage: boolean;
  isAsync: boolean;
  defaultModels: string[];
}

/** 单个 Image Provider 配置（文生图） */
export interface ImageProvider {
  id: string;
  name: string;
  type: ImageProviderType;
  baseUrl: string;
  apiKey: string;          // 即梦下：实际承载 sessionId（client 层适配）
  models: string[];
  /** provider-specific 额外配置：imagen.projectId、wanx.region 等 */
  extras?: Record<string, unknown>;
}

/** 受支持的视频生成 Provider 类型 */
export type VideoProviderType =
  | 'vidu'
  | 'kling'
  | 'runway'
  | 'minimax_video'
  | 'custom';

/** 视频宽高比公共集（video 卡运行时仅接受该子集） */
export type VideoAspectRatio = '16:9' | '9:16' | '1:1';

/** 单个 Video Provider 配置（文生/图生视频） */
export interface VideoProvider {
  id: string;
  name: string;
  type: VideoProviderType;
  baseUrl: string;
  apiKey: string;
  models: string[];
  /** provider-specific 额外配置 */
  extras?: Record<string, unknown>;
}

/** 单个提示词的 AI 绑定（null 表示继承） */
export interface PromptBinding {
  providerId: string | null;
  model: string | null;
  // 仅 cover.regeneration 写入
  imageProviderId?: string | null;
  imageModel?: string | null;
  // 视频生成相关提示词写入
  videoProviderId?: string | null;
  videoModel?: string | null;
}

/**
 * 提示词 → 绑定映射；缺失 key 视为继承。
 * Key 空间：
 * - PromptKind（如 'script.review', 'planning.segment'）
 * - `user:<category>:<id>`（如 'user:script-template:news-broadcast'）—— 用户自定义提示词条目的项目级绑定
 */
export type PromptBindingMap = Partial<Record<string, PromptBinding>>;

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
