import type { AssetItem } from '../types';
import {
  isAICardType,
  isDataContent,
  type AIAnalysisResult,
  type AICard,
  type AIStoryboardPlan,
  type AIVisualSuggestion,
  type AISegment,
  type AISegmentAnalysis,
  type CoverCandidate,
} from '../types/ai';

export interface PersistedAIState {
  version: 3;
  analysisResult: AIAnalysisResult | null;
  coverCandidates: CoverCandidate[];
  motionCards?: AICard[];
  storyboardPlan?: AIStoryboardPlan | null;
}

function normalizeCoverPrompts(prompts: string[]): string[] {
  const prompt = prompts.find((item) => item.trim().length > 0);
  return prompt ? [prompt.trim()] : [];
}

function normalizeAnalysisResult(result: AIAnalysisResult | null): AIAnalysisResult | null {
  if (!result) {
    return null;
  }

  return {
    ...result,
    coverPrompts: normalizeCoverPrompts(result.coverPrompts),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isCardStyle(value: unknown): value is AICard['style'] {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.primaryColor === 'string' &&
    typeof value.backgroundColor === 'string' &&
    Number.isFinite(value.fontSize)
  );
}

function isAISegment(value: unknown): value is AISegment {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.id === 'string' &&
    typeof value.title === 'string' &&
    typeof value.summary === 'string' &&
    Number.isFinite(value.startMs) &&
    Number.isFinite(value.endMs) &&
    (value.transcriptExcerpt === undefined || typeof value.transcriptExcerpt === 'string')
  );
}

function isAISegmentAnalysis(value: unknown): value is AISegmentAnalysis {
  if (!isAISegment(value) || !isRecord(value)) {
    return false;
  }

  return (
    (value.semanticType === 'data' ||
      value.semanticType === 'explanation' ||
      value.semanticType === 'chapter-transition' ||
      value.semanticType === 'quote' ||
      value.semanticType === 'narration') &&
    (value.complexityLevel === 'low' ||
      value.complexityLevel === 'medium' ||
      value.complexityLevel === 'high') &&
    Number.isFinite(value.visualizationScore) &&
    (value.pacingNeed === 'steady' ||
      value.pacingNeed === 'accent' ||
      value.pacingNeed === 'transition') &&
    Array.isArray(value.keywords) &&
    value.keywords.every((item) => typeof item === 'string') &&
    Array.isArray(value.entities) &&
    value.entities.every((item) => typeof item === 'string')
  );
}

function isWebCardPayload(value: unknown): value is NonNullable<AICard['webCard']> {
  if (!isRecord(value)) {
    return false;
  }

  return (
    (typeof value.src === 'string' || typeof value.srcDoc === 'string') &&
    (value.runtimeStatus === undefined ||
      value.runtimeStatus === 'idle' ||
      value.runtimeStatus === 'loading' ||
      value.runtimeStatus === 'ready' ||
      value.runtimeStatus === 'error') &&
    (value.lastGeneratedAt === undefined || Number.isFinite(value.lastGeneratedAt))
  );
}

function isAICard(value: unknown): value is AICard {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.id === 'string' &&
    typeof value.segmentId === 'string' &&
    isAICardType(value.type) &&
    typeof value.title === 'string' &&
    (typeof value.content === 'string' || isDataContent(value.content)) &&
    Number.isFinite(value.startMs) &&
    Number.isFinite(value.endMs) &&
    Number.isFinite(value.displayDurationMs) &&
    (value.displayMode === 'fullscreen' || value.displayMode === 'pip') &&
    typeof value.template === 'string' &&
    typeof value.enabled === 'boolean' &&
    isCardStyle(value.style) &&
    (value.renderMode === undefined ||
      value.renderMode === 'legacy' ||
      value.renderMode === 'web-card' ||
      value.renderMode === 'motion-card') &&
    (value.cardPrompt === undefined || typeof value.cardPrompt === 'string') &&
    (value.webCard === undefined || isWebCardPayload(value.webCard))
  );
}

function isAIVisualSuggestion(value: unknown): value is AIVisualSuggestion {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.id === 'string' &&
    typeof value.segmentId === 'string' &&
    (value.suggestionType === 'content-card' ||
      value.suggestionType === 'data-motion' ||
      value.suggestionType === 'explainer-motion' ||
      value.suggestionType === 'chapter-transition') &&
    Number.isFinite(value.priority) &&
    typeof value.reason === 'string' &&
    typeof value.enabled === 'boolean' &&
    Number.isFinite(value.startMs) &&
    Number.isFinite(value.endMs) &&
    Number.isFinite(value.displayDurationMs) &&
    (value.displayMode === 'fullscreen' || value.displayMode === 'pip') &&
    typeof value.templateKey === 'string' &&
    typeof value.visualBrief === 'string' &&
    typeof value.autoApplyEligible === 'boolean'
  );
}

function isAIAnalysisResult(value: unknown): value is AIAnalysisResult {
  if (!isRecord(value)) {
    return false;
  }

  return (
    Array.isArray(value.segments) &&
    value.segments.every(isAISegment) &&
    Array.isArray(value.cards) &&
    value.cards.every(isAICard) &&
    Array.isArray(value.coverPrompts) &&
    value.coverPrompts.every((prompt) => typeof prompt === 'string') &&
    typeof value.summary === 'string' &&
    Array.isArray(value.keywords) &&
    value.keywords.every((keyword) => typeof keyword === 'string') &&
    (value.globalPrompt === undefined || typeof value.globalPrompt === 'string')
  );
}

function isCoverCandidate(value: unknown): value is CoverCandidate {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.id === 'string' &&
    typeof value.prompt === 'string' &&
    typeof value.imageUrl === 'string' &&
    typeof value.selected === 'boolean' &&
    (value.error === undefined || typeof value.error === 'string')
  );
}

function isAIStoryboardPlan(value: unknown): value is AIStoryboardPlan {
  if (!isRecord(value)) {
    return false;
  }

  return (
    Array.isArray(value.segments) &&
    value.segments.every(isAISegmentAnalysis) &&
    Array.isArray(value.suggestions) &&
    value.suggestions.every(isAIVisualSuggestion) &&
    typeof value.summary === 'string' &&
    (value.globalPrompt === undefined || typeof value.globalPrompt === 'string') &&
    Number.isFinite(value.generatedAt)
  );
}

export function createPersistedAIState(
  analysisResult: AIAnalysisResult | null,
  coverCandidates: CoverCandidate[],
  motionCards: AICard[] = [],
  storyboardPlan: AIStoryboardPlan | null = null,
): PersistedAIState {
  const persisted: PersistedAIState = {
    version: 3,
    analysisResult: normalizeAnalysisResult(analysisResult),
    coverCandidates,
  };

  if (motionCards.length > 0) {
    persisted.motionCards = motionCards;
  }

  if (storyboardPlan) {
    persisted.storyboardPlan = storyboardPlan;
  }

  return persisted;
}

export function parsePersistedAIState(value: unknown): PersistedAIState | null {
  if (
    !isRecord(value) ||
    (value.version !== 2 && value.version !== 3) ||
    !('analysisResult' in value) ||
    !('coverCandidates' in value)
  ) {
    return null;
  }

  if (value.analysisResult !== null && !isAIAnalysisResult(value.analysisResult)) {
    return null;
  }

  if (!Array.isArray(value.coverCandidates) || !value.coverCandidates.every(isCoverCandidate)) {
    return null;
  }

  const motionCards =
    Array.isArray(value.motionCards) && value.motionCards.every(isAICard) ? value.motionCards : [];
  const storyboardPlan =
    value.storyboardPlan === null || value.storyboardPlan === undefined
      ? null
      : isAIStoryboardPlan(value.storyboardPlan)
        ? value.storyboardPlan
        : null;

  return createPersistedAIState(
    normalizeAnalysisResult(value.analysisResult),
    value.coverCandidates,
    motionCards,
    storyboardPlan,
  );
}

export function toggleCardEnabledInResult(
  result: AIAnalysisResult | null,
  cardId: string,
): AIAnalysisResult | null {
  if (!result) {
    return null;
  }

  return {
    ...result,
    cards: result.cards.map((card) =>
      card.id === cardId ? { ...card, enabled: !card.enabled } : card,
    ),
  };
}

export function setAllCardsEnabledInResult(
  result: AIAnalysisResult | null,
  enabled: boolean,
): AIAnalysisResult | null {
  if (!result) {
    return null;
  }

  return {
    ...result,
    cards: result.cards.map((card) => ({ ...card, enabled })),
  };
}

export function updateCardInResult(
  result: AIAnalysisResult | null,
  cardId: string,
  updates: Partial<AICard>,
): AIAnalysisResult | null {
  if (!result) {
    return null;
  }

  return {
    ...result,
    cards: result.cards.map((card) =>
      card.id === cardId ? { ...card, ...updates, id: cardId } : card,
    ),
  };
}

export function removeCardsInResult(
  result: AIAnalysisResult | null,
  cardIds: string[],
): AIAnalysisResult | null {
  if (!result || cardIds.length === 0) {
    return result;
  }

  const cardIdSet = new Set(cardIds);

  return {
    ...result,
    cards: result.cards.filter((card) => !cardIdSet.has(card.id)),
  };
}

export function removeCardInResult(
  result: AIAnalysisResult | null,
  cardId: string,
): AIAnalysisResult | null {
  return removeCardsInResult(result, [cardId]);
}

export function selectCoverCandidate(
  candidates: CoverCandidate[],
  candidateId: string,
): CoverCandidate[] {
  return candidates.map((candidate) => ({
    ...candidate,
    selected: candidate.id === candidateId,
  }));
}

function normalizeFsPath(value: string): string {
  return value.replace(/\\/g, '/').replace(/\/+$/, '');
}

function getProjectRelativePath(projectDir: string, assetPath: string): string | null {
  const normalizedProjectDir = normalizeFsPath(projectDir);
  const normalizedAssetPath = normalizeFsPath(assetPath);

  if (!normalizedProjectDir || !normalizedAssetPath) {
    return null;
  }

  const lowerProjectDir = normalizedProjectDir.toLowerCase();
  const lowerAssetPath = normalizedAssetPath.toLowerCase();

  if (lowerAssetPath === lowerProjectDir) {
    return '';
  }

  const projectPrefix = `${lowerProjectDir}/`;
  if (!lowerAssetPath.startsWith(projectPrefix)) {
    return null;
  }

  return normalizedAssetPath.slice(normalizedProjectDir.length + 1);
}

function isCoverDirectoryImage(projectDir: string, asset: Pick<AssetItem, 'path' | 'type'>): boolean {
  if (asset.type !== 'image') {
    return false;
  }

  const relativePath = getProjectRelativePath(projectDir, asset.path);
  if (!relativePath) {
    return false;
  }

  const [topLevelDir] = relativePath.split('/');
  const normalizedTopLevelDir = topLevelDir?.toLowerCase() ?? '';
  return normalizedTopLevelDir === 'cover' || normalizedTopLevelDir === 'covers';
}

function buildScannedCoverCandidateId(projectDir: string, assetPath: string): string {
  const relativePath = getProjectRelativePath(projectDir, assetPath) ?? normalizeFsPath(assetPath);

  return `cover-scan:${relativePath
    .toLowerCase()
    .replace(/[^a-z0-9._/-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')}`;
}

function ensureSingleSelectedCoverCandidate(candidates: CoverCandidate[]): CoverCandidate[] {
  const selectedIndex = candidates.findIndex(
    (candidate) => candidate.selected && candidate.imageUrl.trim().length > 0,
  );

  if (selectedIndex >= 0) {
    return candidates.map((candidate, index) => ({
      ...candidate,
      selected: index === selectedIndex,
    }));
  }

  const firstValidIndex = candidates.findIndex((candidate) => candidate.imageUrl.trim().length > 0);
  if (firstValidIndex < 0) {
    return candidates;
  }

  return candidates.map((candidate, index) => ({
    ...candidate,
    selected: index === firstValidIndex,
  }));
}

export function mergeCoverCandidatesFromScannedAssets(
  projectDir: string,
  currentCandidates: CoverCandidate[],
  scannedAssets: Array<Pick<AssetItem, 'path' | 'type'>>,
  fallbackPrompt = '',
): CoverCandidate[] {
  if (!projectDir) {
    return currentCandidates;
  }

  const scannedCoverImages = scannedAssets.filter((asset) =>
    isCoverDirectoryImage(projectDir, asset),
  );

  if (scannedCoverImages.length === 0) {
    return currentCandidates;
  }

  const mergedCandidates = [...currentCandidates];
  const existingImagePaths = new Set(
    currentCandidates
      .map((candidate) => candidate.imageUrl.trim())
      .filter((imageUrl) => imageUrl.length > 0),
  );

  for (const asset of scannedCoverImages) {
    const normalizedImagePath = asset.path.trim();
    if (!normalizedImagePath || existingImagePaths.has(normalizedImagePath)) {
      continue;
    }

    mergedCandidates.push({
      id: buildScannedCoverCandidateId(projectDir, normalizedImagePath),
      prompt: fallbackPrompt,
      imageUrl: normalizedImagePath,
      selected: false,
    });
    existingImagePaths.add(normalizedImagePath);
  }

  return ensureSingleSelectedCoverCandidate(mergedCandidates);
}
