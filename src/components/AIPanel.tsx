import { type ReactNode, useCallback, useEffect, useState } from 'react';
import {
  createPersistedAIState,
  parsePersistedAIState,
  removeCardsInResult,
  setAllCardsEnabledInResult,
  selectCoverCandidate,
  toggleCardEnabledInResult,
  updateCardInResult,
} from '../lib/ai-persistence';
import { getAISettingsIssue } from '../lib/ai-settings';
import { useAIStore, loadAISettings, saveAISettings } from '../store/ai';
import { getProjectDir, useTimelineStore } from '../store/timeline';
import {
  buildAICardTimelineDraft,
  type AIAnalysisResult,
  type AICard,
  type AISettings,
  type CoverCandidate,
} from '../types/ai';
import { AICardEditModal } from './AICardEditModal';
import { AICardList, type AICardPlacement } from './AICardList';
import { AppIcon, type AppIconName } from './AppIcon';
import { AICoverPanel } from './AICoverPanel';
import { AISettingsModal } from './AISettingsModal';
import { LoadingSpinner } from './LoadingSpinner';
import { Badge, Button, Field, IconButton, Textarea } from '../ui/primitives';
import { ActionBar, PanelHeader, TabBar } from '../ui/patterns';

interface AIPanelProps {
  compact: boolean;
  railHeight?: number;
}

const TAB_META: Record<'cards' | 'cover', { label: string; shortLabel: string; icon: AppIconName }> = {
  cards: { label: '内容卡片', shortLabel: '卡片', icon: 'layout-template' },
  cover: { label: '封面', shortLabel: '封面', icon: 'image' },
};

interface HoverHintProps {
  label: string;
  children: ReactNode;
}

function HoverHint({ label, children }: HoverHintProps) {
  const [visible, setVisible] = useState(false);

  return (
    <span
      style={hoverHintWrapStyle}
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
      onFocus={() => setVisible(true)}
      onBlur={() => setVisible(false)}
    >
      {children}
      <span
        role="tooltip"
        aria-hidden={!visible}
        style={{
          ...hoverHintBubbleStyle,
          opacity: visible ? 1 : 0,
          transform: visible ? 'translate(-50%, 0)' : 'translate(-50%, -4px)',
        }}
      >
        {label}
      </span>
    </span>
  );
}

export function AIPanel({ compact, railHeight }: AIPanelProps) {
  const {
    srtEntries,
    timeline,
    addAICardsToTimeline,
    removeAICardOverlaysBySourceIds,
    setGlobalBackground,
  } = useTimelineStore();
  const {
    analysisResult,
    isAnalyzing,
    analysisError,
    coverCandidates,
    isGeneratingCovers,
    activeTab,
    setAnalysisResult,
    setAnalyzing,
    setAnalysisError,
    setCoverCandidates,
    selectCover,
    setGeneratingCovers,
    setActiveTab,
  } = useAIStore();
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [editingCardId, setEditingCardId] = useState<string | null>(null);
  const [isRegeneratingCard, setIsRegeneratingCard] = useState(false);
  const [isRegeneratingCoverPrompt, setIsRegeneratingCoverPrompt] = useState(false);
  const [globalPromptDraft, setGlobalPromptDraft] = useState('');
  const editingCard = analysisResult?.cards.find((card) => card.id === editingCardId) ?? null;
  const enabledCount = analysisResult?.cards.filter((card) => card.enabled).length ?? 0;
  const enabledCardIds =
    analysisResult?.cards.filter((card) => card.enabled).map((card) => card.id) ?? [];
  const selectedCount = enabledCardIds.length;
  const selectedCoverCandidate =
    coverCandidates.find((candidate) => candidate.selected) ?? coverCandidates[0] ?? null;
  const cardPlacements = (timeline.overlays ?? []).reduce<Record<string, AICardPlacement>>(
    (placements, overlay) => {
      if (overlay.overlayType !== 'ai-card') {
        return placements;
      }

      const sourceCardId = overlay.aiCardData?.sourceCardId;
      if (!sourceCardId || placements[sourceCardId]) {
        return placements;
      }

      const track = timeline.tracks?.find((item) => item.id === overlay.trackId);
      placements[sourceCardId] = {
        trackId: overlay.trackId,
        trackLabel: track?.label ?? overlay.trackId,
      };
      return placements;
    },
    {},
  );
  const panelPadding = compact ? 10 : 14;
  const panelGap = compact ? 8 : 10;
  const headerButtonSize = compact ? 26 : 28;
  const primaryButtonHeight = compact ? 34 : 38;

  useEffect(() => {
    setGlobalPromptDraft(analysisResult?.globalPrompt ?? '');
  }, [analysisResult?.globalPrompt]);

  const persistAIState = useCallback(
    async (result: AIAnalysisResult | null, candidates: CoverCandidate[]) => {
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

  const handleToggleEnabled = useCallback(
    (cardId: string) => {
      const nextResult = toggleCardEnabledInResult(analysisResult, cardId);
      if (!nextResult) {
        return;
      }

      setAnalysisResult(nextResult);
      void persistAIState(nextResult, coverCandidates).then((persistedState) => {
        if (persistedState.analysisResult) {
          setAnalysisResult(persistedState.analysisResult);
        }
        setCoverCandidates(persistedState.coverCandidates);
      });
    },
    [analysisResult, coverCandidates, persistAIState, setAnalysisResult, setCoverCandidates],
  );

  const handleSaveCard = useCallback(
    (cardId: string, updates: Partial<AICard>) => {
      const nextResult = updateCardInResult(analysisResult, cardId, updates);
      if (!nextResult) {
        return;
      }

      setAnalysisResult(nextResult);
      void persistAIState(nextResult, coverCandidates).then((persistedState) => {
        const persistedResult = persistedState.analysisResult ?? nextResult;
        setAnalysisResult(persistedResult);
        setCoverCandidates(persistedState.coverCandidates);
        const updatedCard = persistedResult.cards.find((card) => card.id === cardId);
        if (updatedCard && cardPlacements[cardId]) {
          addAICardsToTimeline([buildAICardTimelineDraft(updatedCard)]);
        }
      });
    },
    [addAICardsToTimeline, analysisResult, cardPlacements, coverCandidates, persistAIState, setAnalysisResult, setCoverCandidates],
  );

  const handleSelectCover = useCallback(
    (candidateId: string) => {
      const nextCandidates = selectCoverCandidate(coverCandidates, candidateId);
      selectCover(candidateId);
      void persistAIState(analysisResult, nextCandidates).then((persistedState) => {
        if (persistedState.analysisResult) {
          setAnalysisResult(persistedState.analysisResult);
        }
        setCoverCandidates(persistedState.coverCandidates);
      });
    },
    [analysisResult, coverCandidates, persistAIState, selectCover, setAnalysisResult, setCoverCandidates],
  );

  const handlePersistedCovers = useCallback(
    async (candidates: CoverCandidate[]) => {
      const persistedState = await persistAIState(analysisResult, candidates);
      if (persistedState.analysisResult) {
        setAnalysisResult(persistedState.analysisResult);
      }
      setCoverCandidates(persistedState.coverCandidates);
    },
    [analysisResult, persistAIState, setAnalysisResult, setCoverCandidates],
  );

  const handleAddCoverToTimeline = useCallback(
    (candidateId: string) => {
      const candidate = coverCandidates.find((item) => item.id === candidateId);
      if (!candidate?.imageUrl) {
        return;
      }

      setGlobalBackground(candidate.imageUrl);
    },
    [coverCandidates, setGlobalBackground],
  );

  const handleAnalyze = useCallback(async () => {
    const settings = loadAISettings();
    const settingsIssue = getAISettingsIssue(settings);
    if (settingsIssue) {
      setAnalysisError(settingsIssue);
      setIsSettingsOpen(true);
      return;
    }

    if (!timeline.podcast.srtPath) {
      setAnalysisError('请先导入 SRT 字幕文件');
      return;
    }

    setAnalyzing(true);
    setAnalysisError(null);
    console.info('[ai-analysis] 开始分析字幕', {
      entryCount: srtEntries.length,
      projectDir: getProjectDir(),
      model: settings.llmModel,
    });

    try {
      const result = (await window.electronAPI.analyzeSrt({
        entries: srtEntries,
        settings,
        globalPrompt: globalPromptDraft.trim() || undefined,
      })) as AIAnalysisResult;
      const nextCandidates: CoverCandidate[] = [];
      const persistedState = await persistAIState(result, nextCandidates);
      setAnalysisResult(persistedState.analysisResult ?? result);
      setCoverCandidates(persistedState.coverCandidates);
    } catch (error) {
      console.error('[ai-analysis] 分析失败', error);
      setAnalysisError(error instanceof Error ? error.message : '分析失败');
    } finally {
      setAnalyzing(false);
    }
  }, [
    persistAIState,
    setAnalysisError,
    setAnalysisResult,
    setAnalyzing,
    setCoverCandidates,
    srtEntries,
    globalPromptDraft,
    timeline.podcast.srtPath,
  ]);

  const handleApplyToTimeline = useCallback(() => {
    if (!analysisResult) {
      return;
    }

    addAICardsToTimeline(
      analysisResult.cards
        .filter((card) => card.enabled)
        .map(buildAICardTimelineDraft),
    );
  }, [addAICardsToTimeline, analysisResult]);

  const handleGenerateCovers = useCallback(
    async (prompts: string[]) => {
      const settings = loadAISettings();
      if (!settings?.jimengSessionId) {
        setAnalysisError('请先在 AI 配置中填写即梦 Session ID');
        setIsSettingsOpen(true);
        return;
      }

      const projectDir = getProjectDir();
      if (!projectDir) {
        return;
      }

      setGeneratingCovers(true);
      try {
        const candidates = await window.electronAPI.generateCoverImages({
          prompts,
          settings,
          projectDir,
        });
        await handlePersistedCovers(candidates);
      } catch (error) {
        console.error('封面生成失败:', error);
      } finally {
        setGeneratingCovers(false);
      }
    },
    [handlePersistedCovers, setGeneratingCovers],
  );

  const handleRegenerateCoverPrompt = useCallback(async () => {
    if (!analysisResult) {
      return;
    }

    const settings = loadAISettings();
    const settingsIssue = getAISettingsIssue(settings);
    if (settingsIssue) {
      setAnalysisError(settingsIssue);
      setIsSettingsOpen(true);
      return;
    }

    if (srtEntries.length === 0) {
      setAnalysisError('当前没有可用于生成封面提示词的字幕内容');
      return;
    }

    setIsRegeneratingCoverPrompt(true);
    setAnalysisError(null);

    try {
      const prompts = await window.electronAPI.regenerateCoverPrompt({
        entries: srtEntries,
        settings,
        globalPrompt: analysisResult.globalPrompt,
        currentPrompt: analysisResult.coverPrompts[0],
      });
      const nextResult = {
        ...analysisResult,
        coverPrompts: prompts,
      };
      setAnalysisResult(nextResult);
      const persistedState = await persistAIState(nextResult, []);
      setAnalysisResult(persistedState.analysisResult ?? nextResult);
      setCoverCandidates([]);
    } catch (error) {
      console.error('封面提示词重生成失败:', error);
      setAnalysisError(error instanceof Error ? error.message : '封面提示词重生成失败');
    } finally {
      setIsRegeneratingCoverPrompt(false);
    }
  }, [
    analysisResult,
    persistAIState,
    setAnalysisError,
    setAnalysisResult,
    setCoverCandidates,
    srtEntries,
  ]);

  const handleRegenerateCard = useCallback(async (draftUpdates: Partial<AICard>) => {
    if (!editingCard || !analysisResult) {
      return null;
    }

    const settings = loadAISettings();
    const settingsIssue = getAISettingsIssue(settings);
    if (settingsIssue) {
      setAnalysisError(settingsIssue);
      setIsSettingsOpen(true);
      return null;
    }

    setIsRegeneratingCard(true);
    setAnalysisError(null);

    try {
      const draftCard = {
        ...editingCard,
        ...draftUpdates,
        id: editingCard.id,
      };
      const regeneratedCard = await window.electronAPI.regenerateAICard({
        entries: srtEntries,
        card: draftCard,
        settings,
        globalPrompt: globalPromptDraft.trim() || undefined,
        cardPrompt: draftCard.cardPrompt,
      });

      const nextResult = updateCardInResult(analysisResult, editingCard.id, {
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
      const persistedCard = persistedResult.cards.find((card) => card.id === editingCard.id);
      if (persistedCard && cardPlacements[editingCard.id]) {
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
  }, [
    addAICardsToTimeline,
    analysisResult,
    cardPlacements,
    coverCandidates,
    editingCard,
    globalPromptDraft,
    persistAIState,
    setAnalysisError,
    srtEntries,
    setAnalysisResult,
    setCoverCandidates,
  ]);
  const handleGlobalPromptBlur = useCallback(() => {
    const normalizedPrompt = globalPromptDraft.trim();
    const currentPrompt = analysisResult?.globalPrompt ?? '';
    if (normalizedPrompt === currentPrompt) {
      return;
    }

    if (!analysisResult) {
      return;
    }

    const nextResult = {
      ...analysisResult,
      globalPrompt: normalizedPrompt || undefined,
    };
    setAnalysisResult(nextResult);
    void persistAIState(nextResult, coverCandidates).then((persistedState) => {
      if (persistedState.analysisResult) {
        setAnalysisResult(persistedState.analysisResult);
      }
      setCoverCandidates(persistedState.coverCandidates);
    });
  }, [analysisResult, coverCandidates, globalPromptDraft, persistAIState, setAnalysisResult, setCoverCandidates]);
  const handleSelectAllCards = useCallback(() => {
    if (!analysisResult?.cards.length) {
      return;
    }

    const shouldEnableAll = analysisResult.cards.some((card) => !card.enabled);
    const nextResult = setAllCardsEnabledInResult(analysisResult, shouldEnableAll);
    if (!nextResult) {
      return;
    }

    setAnalysisResult(nextResult);
    void persistAIState(nextResult, coverCandidates).then((persistedState) => {
      if (persistedState.analysisResult) {
        setAnalysisResult(persistedState.analysisResult);
      }
      setCoverCandidates(persistedState.coverCandidates);
    });
  }, [analysisResult, coverCandidates, persistAIState, setAnalysisResult, setCoverCandidates]);
  const handleDeleteCards = useCallback(
    (cardIds: string[]) => {
      const nextResult = removeCardsInResult(analysisResult, cardIds);
      if (!nextResult) {
        return;
      }

      setAnalysisResult(nextResult);
      if (editingCardId && cardIds.includes(editingCardId)) {
        setEditingCardId(null);
      }
      removeAICardOverlaysBySourceIds(cardIds);
      void persistAIState(nextResult, coverCandidates).then((persistedState) => {
        if (persistedState.analysisResult) {
          setAnalysisResult(persistedState.analysisResult);
        }
        setCoverCandidates(persistedState.coverCandidates);
      });
    },
    [
      analysisResult,
      coverCandidates,
      editingCardId,
      persistAIState,
      removeAICardOverlaysBySourceIds,
      setAnalysisResult,
      setCoverCandidates,
    ],
  );
  const panelSettings = loadAISettings();
  const aiSettingsIssue = getAISettingsIssue(panelSettings);
  const hasSrtEntries = srtEntries.length > 0;
  const analyzeButtonDisabled = !hasSrtEntries || isAnalyzing;
  const analyzeButtonCursor = !hasSrtEntries ? 'not-allowed' : isAnalyzing ? 'wait' : 'pointer';
  const analyzeButtonOpacity = !hasSrtEntries ? 0.55 : isAnalyzing ? 0.72 : 1;
  const hasGeneratedCards = (analysisResult?.cards.length ?? 0) > 0;
  const isCardListEmpty = Boolean(analysisResult && !hasGeneratedCards);
  const showCardGenerationState = !analysisResult || !hasGeneratedCards;
  const allCardsSelected = hasGeneratedCards && enabledCount === (analysisResult?.cards.length ?? 0);
  const analysisHeadline = analysisResult ? '正在重新分析内容卡片' : '正在拆解字幕与生成卡片';
  const analysisDescription = analysisResult
    ? '正在根据最新字幕和提示词重新组织结构，完成后会自动刷新当前卡片列表。'
    : '正在解析字幕、提炼重点并生成可编辑卡片，这通常需要几十秒。';
  const analysisOverlayTitle = analysisResult
    ? 'AI 正在重新生成当前内容卡片'
    : 'AI 正在生成首批内容卡片';
  const analysisOverlayText = analysisResult
    ? '当前卡片区会暂时锁定，分析完成后将自动替换成新的卡片结果。'
    : '请稍候，AI 会先解析字幕，再提炼重点并生成可编辑卡片。';
  const generationStateBadgeLabel = isAnalyzing
    ? 'AI 正在工作'
    : isCardListEmpty
    ? '卡片已清空'
    : '准备生成内容卡片';
  const generationStateText = isAnalyzing
    ? `已载入 ${srtEntries.length} 条字幕，正在为你拆解结构与重点`
    : srtEntries.length === 0
    ? '请先导入 SRT 字幕文件'
    : isCardListEmpty
    ? `内容卡片已全部删除，当前仍有 ${srtEntries.length} 条字幕可重新分析生成`
    : `已加载 ${srtEntries.length} 条字幕，点击分析`;
  const analyzeButtonLabel = isAnalyzing
    ? '分析中...'
    : aiSettingsIssue
    ? '先配置 AI'
    : isCardListEmpty
    ? '重新生成卡片'
    : '分析内容';

  return (
    <aside
      style={{
        flex: 1,
        minHeight: 0,
        background: 'rgba(21, 23, 28, 0.98)',
        padding: panelPadding,
        display: 'flex',
        flexDirection: 'column',
        gap: panelGap,
        maxHeight: '100%',
        overflow: 'hidden',
        boxSizing: 'border-box',
      }}
    >
      <PanelHeader
        title="AI 助手"
        leading={
          <HoverHint label="AI 分析与生成助手">
            <span
              style={{
                ...headerIconWrapStyle,
                width: compact ? 20 : 22,
                height: compact ? 20 : 22,
              }}
              title="AI 分析与生成助手"
              aria-label="AI 分析与生成助手"
            >
              <AppIcon name="sparkles" size={14} />
            </span>
          </HoverHint>
        }
        meta={
          hasGeneratedCards && !compact ? (
            <Badge variant="brand">已选 {enabledCount}/{analysisResult.cards.length}</Badge>
          ) : null
        }
        actions={
          <>
            {analysisResult ? (
              <HoverHint label={isAnalyzing ? 'AI 正在重新分析内容卡片' : '根据当前字幕和提示词重新生成内容卡片'}>
                <IconButton
                  onClick={() => void handleAnalyze()}
                  disabled={isAnalyzing}
                  variant="subtle"
                  size={compact ? 'sm' : 'md'}
                  title={isAnalyzing ? '分析中' : '重新分析'}
                  aria-label={isAnalyzing ? '分析中' : '重新分析'}
                >
                  {isAnalyzing ? <LoadingSpinner size={14} color="#c7d2fe" /> : <AppIcon name="refresh-cw" size={14} />}
                </IconButton>
              </HoverHint>
            ) : null}
            <HoverHint label="打开 AI 全局设置">
              <IconButton
                onClick={() => setIsSettingsOpen(true)}
                variant="subtle"
                size={compact ? 'sm' : 'md'}
                title="打开 AI 全局设置"
                aria-label="打开 AI 全局设置"
              >
                <AppIcon name="settings-2" size={14} />
              </IconButton>
            </HoverHint>
          </>
        }
      />

      <TabBar
        items={(['cards', 'cover'] as const).map((tab) => ({
          value: tab,
          label: (
            <span style={tabContentStyle}>
              <AppIcon name={TAB_META[tab].icon} size={14} />
              {compact ? TAB_META[tab].shortLabel : TAB_META[tab].label}
            </span>
          ),
        }))}
        value={activeTab}
        onChange={setActiveTab}
      />

      <div style={bodyStyle}>
        {activeTab === 'cards' ? (
          <>
            <div
              style={{
                ...promptSectionStyle,
                opacity: isAnalyzing ? 0.86 : 1,
                transition: 'opacity 180ms ease',
              }}
            >
              <Field label="整体创作提示词">
                <Textarea
                  value={globalPromptDraft}
                  onChange={(event) => setGlobalPromptDraft(event.target.value)}
                  onBlur={handleGlobalPromptBlur}
                  placeholder="例如：整体做成财经研报感，少字强结论，版式更像商业媒体封面"
                  rows={3}
                  style={promptTextareaStyle}
                />
              </Field>
            </div>

            {showCardGenerationState ? (
              <div
                style={{
                  ...emptyStateStyle,
                  padding: isAnalyzing ? 20 : 18,
                }}
                aria-busy={isAnalyzing}
              >
                <Badge variant="brand">
                  {isAnalyzing ? <LoadingSpinner size={14} color="#c7d2fe" /> : <AppIcon name="sparkles" size={14} />}
                  {generationStateBadgeLabel}
                </Badge>
                <div style={emptyStateTextStyle}>{generationStateText}</div>
                {aiSettingsIssue ? <div style={hintTextStyle}>{aiSettingsIssue}</div> : null}
                <Button
                  onClick={handleAnalyze}
                  disabled={analyzeButtonDisabled}
                  variant="primary"
                  size="md"
                  style={{ opacity: analyzeButtonOpacity, cursor: analyzeButtonCursor }}
                >
                  <span style={primaryActionContentStyle}>
                    {isAnalyzing ? (
                      <LoadingSpinner size={14} color="#ffffff" />
                    ) : (
                      <AppIcon name={aiSettingsIssue ? 'settings-2' : 'sparkles'} size={14} />
                    )}
                    {analyzeButtonLabel}
                  </span>
                </Button>

                {isAnalyzing ? (
                  <div style={analysisNoticeStyle} role="status" aria-live="polite">
                    <div style={analysisNoticeHeaderStyle}>
                      <LoadingSpinner size={16} color="#818cf8" />
                      <span style={analysisNoticeTitleStyle}>{analysisHeadline}</span>
                    </div>
                    <div style={analysisNoticeTextStyle}>{analysisDescription}</div>
                    <div style={analysisStepRowStyle}>
                      {['解析字幕', '提炼重点', '生成卡片'].map((label) => (
                        <span key={label} style={analysisStepChipStyle}>
                          <LoadingSpinner size={12} color="#94a3b8" />
                          {label}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}

            {analysisResult && hasGeneratedCards && isAnalyzing ? (
              <div style={analysisBannerStyle} role="status" aria-live="polite">
                <div style={analysisBannerHeaderStyle}>
                  <span style={analysisBannerBadgeStyle}>
                    <LoadingSpinner size={12} color="#ffffff" />
                    分析中
                  </span>
                  <span style={analysisBannerTitleStyle}>{analysisHeadline}</span>
                </div>
                <div style={analysisBannerTextStyle}>{analysisDescription}</div>
              </div>
            ) : null}
            {analysisError ? <div style={errorStyle}>{analysisError}</div> : null}
            {hasGeneratedCards ? (
              <div style={analysisWorkspaceStyle}>
                <div
                  style={{
                    opacity: isAnalyzing ? 0.38 : 1,
                    transition: 'opacity 180ms ease',
                  }}
                >
                  <ActionBar
                    start={
                      <Button onClick={handleSelectAllCards} variant="secondary" size="sm">
                        {allCardsSelected ? '取消全选' : '全选'}
                      </Button>
                    }
                    center={
                      <div style={selectionSummaryStyle}>
                        已选 {selectedCount}/{analysisResult?.cards.length ?? 0}
                      </div>
                    }
                    end={
                      <Button
                        onClick={() => handleDeleteCards(enabledCardIds)}
                        disabled={selectedCount === 0 || isAnalyzing}
                        variant="danger"
                        size="sm"
                      >
                        删除已选
                      </Button>
                    }
                  />
                  <AICardList
                    cards={analysisResult?.cards ?? []}
                    placements={cardPlacements}
                    onToggleEnabled={handleToggleEnabled}
                    onDeleteCard={(cardId) => handleDeleteCards([cardId])}
                    onEditCard={setEditingCardId}
                  />
                </div>
                {isAnalyzing ? (
                  <div style={analysisOverlayStyle} role="status" aria-live="polite">
                    <div style={analysisOverlayCardStyle}>
                      <span style={analysisBannerBadgeStyle}>
                        <LoadingSpinner size={12} color="#ffffff" />
                        重新分析中
                      </span>
                      <div style={analysisOverlayTitleStyle}>{analysisOverlayTitle}</div>
                      <div style={analysisOverlayTextStyle}>{analysisOverlayText}</div>
                      <div style={analysisStepRowStyle}>
                        {['解析字幕', '提炼重点', '生成卡片'].map((label) => (
                          <span key={label} style={analysisStepChipStyle}>
                            <LoadingSpinner size={12} color="#94a3b8" />
                            {label}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
          </>
        ) : (
          <AICoverPanel
            coverPrompts={analysisResult?.coverPrompts ?? []}
            candidates={coverCandidates}
            isGenerating={isGeneratingCovers}
            isRegeneratingPrompt={isRegeneratingCoverPrompt}
            selectedCandidateId={selectedCoverCandidate?.id}
            onGenerateCovers={handleGenerateCovers}
            onRegeneratePrompt={handleRegenerateCoverPrompt}
            onSelectCover={handleSelectCover}
            onAddToTimeline={handleAddCoverToTimeline}
          />
        )}
      </div>

      {activeTab === 'cards' && hasGeneratedCards ? (
        <div style={footerStyle}>
          <Button
            onClick={handleApplyToTimeline}
            disabled={enabledCount === 0 || isAnalyzing}
            variant="primary"
            size={compact ? 'sm' : 'md'}
            fullWidth
            style={{ minHeight: primaryButtonHeight, height: primaryButtonHeight }}
          >
            <span style={primaryActionContentStyle}>
              {isAnalyzing ? <LoadingSpinner size={14} color="#ffffff" /> : <AppIcon name="send-horizontal" size={14} />}
              {isAnalyzing ? '分析中...' : '应用到时间线'}
              <span style={countBadgeStyle}>{enabledCount}</span>
            </span>
          </Button>
        </div>
      ) : null}

      <AICardEditModal
        visible={editingCardId !== null}
        card={editingCard}
        isRegenerating={isRegeneratingCard}
        previewWidth={timeline.width}
        previewHeight={timeline.height}
        onClose={() => setEditingCardId(null)}
        onRegenerate={handleRegenerateCard}
        onSave={handleSaveCard}
      />
      <AISettingsModal
        visible={isSettingsOpen}
        settings={panelSettings}
        onClose={() => setIsSettingsOpen(false)}
        onSave={(settings: AISettings) => saveAISettings(settings)}
      />
    </aside>
  );
}

const headerStyle = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 8,
  flexShrink: 0,
};

const headerInfoStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  minWidth: 0,
};

const headerTitleWrapStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
};

const headerIconWrapStyle = {
  width: 22,
  height: 22,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: 7,
  background: 'rgba(99,102,241,0.18)',
  color: '#818cf8',
};

const headerTitleStyle = {
  fontSize: 13,
  fontWeight: 700,
  color: '#f4f7fb',
};

const hoverHintWrapStyle = {
  position: 'relative' as const,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
};

const hoverHintBubbleStyle = {
  position: 'absolute' as const,
  top: 'calc(100% + 8px)',
  left: '50%',
  zIndex: 8,
  padding: '6px 9px',
  borderRadius: 8,
  background: 'rgba(15,23,42,0.96)',
  border: '1px solid rgba(148,163,184,0.18)',
  color: '#e2e8f0',
  fontSize: 11,
  lineHeight: 1.35,
  whiteSpace: 'nowrap' as const,
  pointerEvents: 'none' as const,
  boxShadow: '0 10px 30px rgba(2,6,23,0.28)',
  transition: 'opacity 140ms ease, transform 140ms ease',
};

const summaryChipStyle = {
  padding: '3px 8px',
  borderRadius: 999,
  background: 'rgba(99,102,241,0.12)',
  color: '#a5b4fc',
  fontSize: 10,
  fontWeight: 700,
  whiteSpace: 'nowrap' as const,
};

const headerActionsStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  flexShrink: 0,
};

const iconButtonStyle = {
  width: 28,
  height: 28,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: 8,
  border: '1px solid rgba(255,255,255,0.08)',
  background: 'rgba(255,255,255,0.02)',
  color: '#94a3b8',
  cursor: 'pointer',
};

const tabBarStyle = {
  display: 'flex',
  borderBottom: '1px solid rgba(255,255,255,0.06)',
  flexShrink: 0,
};

const tabButtonStyle = {
  flex: 1,
  padding: '8px 0',
  background: 'none',
  borderLeft: 'none',
  borderRight: 'none',
  borderTop: 'none',
  fontSize: 12,
  cursor: 'pointer',
};

const tabContentStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 6,
};

const bodyStyle = {
  flex: 1,
  minHeight: 0,
  overflowY: 'auto' as const,
  overflowX: 'hidden' as const,
  paddingRight: 4,
  paddingBottom: 2,
};

const promptSectionStyle = {
  marginBottom: 12,
};

const bulkActionBarStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  marginBottom: 10,
};

const analysisWorkspaceStyle = {
  position: 'relative' as const,
  minHeight: 220,
};

const selectionActionButtonStyle = {
  height: 28,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: 8,
  border: '1px solid rgba(255,255,255,0.08)',
  background: 'rgba(255,255,255,0.04)',
  color: '#cbd5e1',
  cursor: 'pointer',
  padding: '0 10px',
  fontSize: 11,
  fontWeight: 600,
};

const deleteSelectionButtonStyle = {
  ...selectionActionButtonStyle,
  border: '1px solid rgba(248,113,113,0.22)',
  background: 'rgba(127,29,29,0.24)',
  color: '#fda4af',
};

const selectionSummaryStyle = {
  flex: 1,
  minWidth: 0,
  color: '#94a3b8',
  fontSize: 11,
  fontWeight: 600,
};

const emptyStateStyle = {
  display: 'flex',
  flexDirection: 'column' as const,
  alignItems: 'center',
  textAlign: 'center' as const,
  padding: 18,
  borderRadius: 16,
  background: 'linear-gradient(180deg, rgba(255,255,255,0.03) 0%, rgba(99,102,241,0.08) 100%)',
  border: '1px solid rgba(129,140,248,0.14)',
};

const emptyStateTextStyle = {
  color: '#cbd5e1',
  fontSize: 12,
  marginBottom: 12,
  lineHeight: 1.6,
  maxWidth: 260,
};

const hintTextStyle = {
  marginBottom: 12,
  color: '#facc15',
  fontSize: 12,
  lineHeight: 1.5,
};

const fieldLabelStyle = {
  fontSize: 12,
  color: '#91a2bc',
  marginBottom: 8,
};

const promptTextareaStyle = {
  width: '100%',
  padding: 12,
  borderRadius: 12,
  border: '1px solid rgba(255,255,255,0.08)',
  background: 'rgba(255,255,255,0.03)',
  color: '#f5f7fb',
  fontSize: 13,
  boxSizing: 'border-box' as const,
  outline: 'none',
  resize: 'vertical' as const,
  lineHeight: 1.6,
  transition: 'border-color 180ms ease, box-shadow 180ms ease, opacity 180ms ease',
};

const analyzeButtonStyle = {
  height: 36,
  padding: '0 20px',
  borderRadius: 12,
  border: 'none',
  background: 'linear-gradient(90deg, #6366f1, #8b5cf6)',
  color: '#fff',
  fontSize: 13,
  fontWeight: 700,
  transition: 'transform 160ms ease, box-shadow 180ms ease, opacity 180ms ease',
};

const primaryActionContentStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 6,
};

const emptyStateBadgeStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '6px 12px',
  borderRadius: 999,
  background: 'rgba(99,102,241,0.16)',
  color: '#c7d2fe',
  fontSize: 12,
  fontWeight: 700,
  marginBottom: 12,
};

const analysisNoticeStyle = {
  width: '100%',
  marginTop: 14,
  padding: 14,
  borderRadius: 14,
  background: 'rgba(15,23,42,0.72)',
  border: '1px solid rgba(129,140,248,0.16)',
  boxSizing: 'border-box' as const,
};

const analysisNoticeHeaderStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  justifyContent: 'center',
  marginBottom: 8,
};

const analysisNoticeTitleStyle = {
  color: '#eef2ff',
  fontSize: 13,
  fontWeight: 700,
};

const analysisNoticeTextStyle = {
  color: '#94a3b8',
  fontSize: 12,
  lineHeight: 1.6,
  textAlign: 'center' as const,
};

const analysisStepRowStyle = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexWrap: 'wrap' as const,
  gap: 8,
  marginTop: 12,
};

const analysisStepChipStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '6px 10px',
  borderRadius: 999,
  background: 'rgba(148,163,184,0.12)',
  color: '#cbd5e1',
  fontSize: 11,
  fontWeight: 600,
};

const analysisOverlayStyle = {
  position: 'absolute' as const,
  inset: 0,
  display: 'grid',
  placeItems: 'center',
  padding: 18,
  borderRadius: 16,
  background: 'linear-gradient(180deg, rgba(2,6,23,0.18) 0%, rgba(2,6,23,0.72) 100%)',
  cursor: 'wait',
};

const analysisOverlayCardStyle = {
  width: '100%',
  maxWidth: 340,
  padding: '18px 16px',
  borderRadius: 18,
  border: '1px solid rgba(129,140,248,0.24)',
  background: 'rgba(15,23,42,0.94)',
  boxShadow: '0 20px 50px rgba(2,6,23,0.38)',
  boxSizing: 'border-box' as const,
  textAlign: 'center' as const,
};

const analysisOverlayTitleStyle = {
  marginTop: 12,
  color: '#eef2ff',
  fontSize: 14,
  fontWeight: 700,
};

const analysisOverlayTextStyle = {
  marginTop: 8,
  color: '#cbd5e1',
  fontSize: 12,
  lineHeight: 1.6,
};

const errorStyle = {
  padding: 12,
  borderRadius: 8,
  background: 'rgba(239,68,68,0.1)',
  color: '#fca5a5',
  fontSize: 12,
  marginBottom: 8,
};

const footerStyle = {
  display: 'flex',
  paddingTop: 6,
  paddingBottom: 4,
  borderTop: '1px solid rgba(255,255,255,0.06)',
  flexShrink: 0,
  background: 'linear-gradient(180deg, rgba(21,23,28,0) 0%, rgba(21,23,28,0.98) 36%)',
};

const analysisBannerStyle = {
  padding: '12px 14px',
  borderRadius: 14,
  background: 'rgba(99,102,241,0.1)',
  border: '1px solid rgba(129,140,248,0.18)',
  marginBottom: 10,
};

const analysisBannerHeaderStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  flexWrap: 'wrap' as const,
  marginBottom: 6,
};

const analysisBannerBadgeStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '4px 10px',
  borderRadius: 999,
  background: '#6366f1',
  color: '#ffffff',
  fontSize: 11,
  fontWeight: 700,
};

const analysisBannerTitleStyle = {
  color: '#e2e8f0',
  fontSize: 12,
  fontWeight: 700,
};

const analysisBannerTextStyle = {
  color: '#94a3b8',
  fontSize: 12,
  lineHeight: 1.6,
};

const applyButtonStyle = {
  width: '100%',
  borderRadius: 10,
  border: 'none',
  background: '#6366f1',
  color: '#fff',
  fontSize: 12,
  fontWeight: 700,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '0 12px',
  lineHeight: 1.1,
  boxSizing: 'border-box' as const,
  whiteSpace: 'nowrap' as const,
  overflow: 'hidden',
};

const countBadgeStyle = {
  minWidth: 18,
  height: 18,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '0 6px',
  borderRadius: 999,
  background: 'rgba(255,255,255,0.16)',
  color: '#ffffff',
  fontSize: 10,
  lineHeight: 1,
  flexShrink: 0,
};
