import { isAICardType, isDataContent, type AIAnalysisResult, type AICard, type CoverCandidate } from '../types/ai';

export interface PersistedAIState {
  version: 1;
  analysisResult: AIAnalysisResult | null;
  coverCandidates: CoverCandidate[];
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
    (value.renderMode === undefined || value.renderMode === 'legacy' || value.renderMode === 'web-card') &&
    (value.cardPrompt === undefined || typeof value.cardPrompt === 'string') &&
    (value.webCard === undefined || isWebCardPayload(value.webCard))
  );
}

function isAIAnalysisResult(value: unknown): value is AIAnalysisResult {
  if (!isRecord(value)) {
    return false;
  }

  return (
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

export function createPersistedAIState(
  analysisResult: AIAnalysisResult | null,
  coverCandidates: CoverCandidate[],
): PersistedAIState {
  return {
    version: 1,
    analysisResult: normalizeAnalysisResult(analysisResult),
    coverCandidates,
  };
}

export function parsePersistedAIState(value: unknown): PersistedAIState | null {
  if (isAIAnalysisResult(value)) {
    return createPersistedAIState(value, []);
  }

  if (!isRecord(value) || !('analysisResult' in value) || !('coverCandidates' in value)) {
    return null;
  }

  if (value.analysisResult !== null && !isAIAnalysisResult(value.analysisResult)) {
    return null;
  }

  if (!Array.isArray(value.coverCandidates) || !value.coverCandidates.every(isCoverCandidate)) {
    return null;
  }

  return createPersistedAIState(normalizeAnalysisResult(value.analysisResult), value.coverCandidates);
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
