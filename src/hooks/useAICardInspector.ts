import { useCallback, useMemo, useState } from 'react';
import { getAISettingsIssue } from '../lib/ai-settings';
import {
  createPersistedAIState,
  parsePersistedAIState,
  removeCardInResult,
  updateCardInResult,
} from '../lib/ai-persistence';
import { getAICardSequenceLabel } from '../lib/ai-card-inspector';
import { loadAISettings, useAIStore } from '../store/ai';
import { getProjectDir, useTimelineStore } from '../store/timeline';
import { buildAICardTimelineDraft, type AICard, type CoverCandidate } from '../types/ai';

export function useAICardInspector(cardId: string | null) {
  const {
    analysisError,
    analysisResult,
    coverCandidates,
    setAnalysisError,
    setAnalysisResult,
    setCoverCandidates,
  } = useAIStore();
  const { addAICardsToTimeline, removeAICardOverlaysBySourceIds, srtEntries, timeline } = useTimelineStore();
  const [isRegeneratingCard, setIsRegeneratingCard] = useState(false);

  const card = useMemo(
    () => analysisResult?.cards.find((item) => item.id === cardId) ?? null,
    [analysisResult, cardId],
  );
  const isPlacedOnTimeline = useMemo(
    () =>
      Boolean(
        cardId &&
          timeline.overlays.some(
            (overlay) =>
              overlay.overlayType === 'ai-card' && overlay.aiCardData?.sourceCardId === cardId,
          ),
      ),
    [cardId, timeline.overlays],
  );
  const cardSequenceLabel = useMemo(
    () => getAICardSequenceLabel(analysisResult?.cards, cardId),
    [analysisResult?.cards, cardId],
  );

  const persistAIState = useCallback(
    async (result: typeof analysisResult, candidates: CoverCandidate[]) => {
      const fallbackState = createPersistedAIState(result, candidates);
      const projectDir = getProjectDir();
      if (!projectDir) {
        return fallbackState;
      }

      const savedState = await window.electronAPI.saveAIAnalysis(
        projectDir,
        JSON.stringify(fallbackState, null, 2),
      );

      try {
        return parsePersistedAIState(JSON.parse(savedState)) ?? fallbackState;
      } catch {
        return fallbackState;
      }
    },
    [],
  );

  const saveCard = useCallback(
    (targetCardId: string, updates: Partial<AICard>) => {
      const nextResult = updateCardInResult(analysisResult, targetCardId, updates);
      if (!nextResult) {
        return;
      }

      setAnalysisError(null);
      setAnalysisResult(nextResult);
      void persistAIState(nextResult, coverCandidates).then((persistedState) => {
        const persistedResult = persistedState.analysisResult ?? nextResult;
        setAnalysisResult(persistedResult);
        setCoverCandidates(persistedState.coverCandidates);
        const updatedCard = persistedResult.cards.find((item) => item.id === targetCardId);
        if (
          updatedCard &&
          timeline.overlays.some(
            (overlay) =>
              overlay.overlayType === 'ai-card' &&
              overlay.aiCardData?.sourceCardId === targetCardId,
          )
        ) {
          addAICardsToTimeline([buildAICardTimelineDraft(updatedCard)]);
        }
      });
    },
    [
      addAICardsToTimeline,
      analysisResult,
      coverCandidates,
      persistAIState,
      setAnalysisError,
      setAnalysisResult,
      setCoverCandidates,
      timeline.overlays,
    ],
  );

  const regenerateCard = useCallback(
    async (draftUpdates: Partial<AICard>) => {
      if (!card || !analysisResult) {
        return null;
      }

      const settings = await loadAISettings();
      const settingsIssue = getAISettingsIssue(settings);
      if (settingsIssue) {
        setAnalysisError(settingsIssue);
        return null;
      }
      if (!settings) {
        setAnalysisError('请先完成 AI 配置');
        return null;
      }

      setIsRegeneratingCard(true);
      setAnalysisError(null);

      try {
        const draftCard = {
          ...card,
          ...draftUpdates,
          id: card.id,
        };
        const regeneratedCard = await window.electronAPI.regenerateAICard({
          entries: srtEntries,
          card: draftCard,
          settings,
          globalPrompt: analysisResult.globalPrompt?.trim() || undefined,
          cardPrompt: draftCard.cardPrompt,
        });

        const nextResult = updateCardInResult(analysisResult, card.id, {
          ...draftUpdates,
          ...regeneratedCard,
        });
        if (!nextResult) {
          return null;
        }

        const persistedState = await persistAIState(nextResult, coverCandidates);
        const persistedResult = persistedState.analysisResult ?? nextResult;
        setAnalysisResult(persistedResult);
        setCoverCandidates(persistedState.coverCandidates);
        const persistedCard = persistedResult.cards.find((item) => item.id === card.id);

        if (
          persistedCard &&
          timeline.overlays.some(
            (overlay) =>
              overlay.overlayType === 'ai-card' &&
              overlay.aiCardData?.sourceCardId === card.id,
          )
        ) {
          addAICardsToTimeline([buildAICardTimelineDraft(persistedCard)]);
        }

        return persistedCard ?? null;
      } catch (error) {
        console.error('单卡重生成失败:', error);
        setAnalysisError(error instanceof Error ? error.message : '单卡重生成失败');
        return null;
      } finally {
        setIsRegeneratingCard(false);
      }
    },
    [
      addAICardsToTimeline,
      analysisResult,
      card,
      coverCandidates,
      persistAIState,
      setAnalysisError,
      setAnalysisResult,
      setCoverCandidates,
      srtEntries,
      timeline.overlays,
    ],
  );

  const deleteCard = useCallback(() => {
    if (!card || !analysisResult) {
      return;
    }

    const nextResult = removeCardInResult(analysisResult, card.id);
    if (!nextResult) {
      return;
    }

    setAnalysisError(null);
    setAnalysisResult(nextResult);
    removeAICardOverlaysBySourceIds([card.id]);

    void persistAIState(nextResult, coverCandidates).then((persistedState) => {
      const persistedResult = persistedState.analysisResult ?? nextResult;
      setAnalysisResult(persistedResult);
      setCoverCandidates(persistedState.coverCandidates);
    });
  }, [
    analysisResult,
    card,
    coverCandidates,
    persistAIState,
    removeAICardOverlaysBySourceIds,
    setAnalysisError,
    setAnalysisResult,
    setCoverCandidates,
  ]);

  return {
    card,
    cardSequenceLabel,
    deleteCard,
    errorMessage: analysisError,
    isPlacedOnTimeline,
    isRegeneratingCard,
    regenerateCard,
    saveCard,
  };
}
