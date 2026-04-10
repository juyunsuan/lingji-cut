import { useCallback, useEffect, useState } from 'react';
import {
  createPersistedAIState,
  parsePersistedAIState,
  removeCardsInResult,
  setAllCardsEnabledInResult,
  selectCoverCandidate,
  toggleCardEnabledInResult,
} from '../lib/ai-persistence';
import { getAISettingsIssue } from '../lib/ai-settings';
import { useAIStore, loadAISettings, saveAISettings } from '../store/ai';
import { getProjectDir, useTimelineStore } from '../store/timeline';
import {
  buildAICardTimelineDraft,
  type AIAnalysisResult,
  type AISettings,
  type CoverCandidate,
} from '../types/ai';
import { AICardList, type AICardPlacement } from './AICardList';
import { AppIcon } from './AppIcon';
import { AICoverPanel } from './AICoverPanel';
import { AISettingsModal } from './AISettingsModal';
import { Alert, Button, Spinner, StepIndicator, Textarea } from '../ui';
import styles from './AIPanel.module.css';

interface AIPanelProps {
  compact: boolean;
  railHeight?: number;
  inspectedCardId?: string | null;
  onClearInspector?: () => void;
  onOpenCardInspector?: (cardId: string) => void;
}

const TAB_META: Record<'cards' | 'cover', { label: string; shortLabel: string }> = {
  cards: { label: '内容卡片', shortLabel: '卡片' },
  cover: { label: '封面', shortLabel: '封面' },
};

export function AIPanel({
  compact,
  railHeight: _railHeight,
  inspectedCardId = null,
  onClearInspector,
  onOpenCardInspector,
}: AIPanelProps) {
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
  const [isRegeneratingCoverPrompt, setIsRegeneratingCoverPrompt] = useState(false);
  const [globalPromptDraft, setGlobalPromptDraft] = useState('');

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
    if (!settings) {
      setAnalysisError('请先完成 AI 配置');
      setIsSettingsOpen(true);
      return;
    }

    if (!timeline.podcast.srtPath) {
      setAnalysisError('请先导入 SRT 字幕文件');
      return;
    }

    setAnalyzing(true);
    setAnalysisError(null);

    try {
      const result = (await window.electronAPI.analyzeSrt({
        entries: srtEntries,
        settings,
        globalPrompt: globalPromptDraft.trim() || undefined,
      })) as AIAnalysisResult;
      const persistedState = await persistAIState(result, []);
      setAnalysisResult(persistedState.analysisResult ?? result);
      setCoverCandidates(persistedState.coverCandidates);
    } catch (error) {
      setAnalysisError(error instanceof Error ? error.message : '分析失败');
    } finally {
      setAnalyzing(false);
    }
  }, [
    globalPromptDraft,
    persistAIState,
    setAnalysisError,
    setAnalysisResult,
    setAnalyzing,
    setCoverCandidates,
    srtEntries,
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
    [handlePersistedCovers, setGeneratingCovers, setAnalysisError],
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
    if (!settings) {
      setAnalysisError('请先完成 AI 配置');
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

  const handleGlobalPromptBlur = useCallback(() => {
    const normalizedPrompt = globalPromptDraft.trim();
    const currentPrompt = analysisResult?.globalPrompt ?? '';
    if (normalizedPrompt === currentPrompt || !analysisResult) {
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
      if (inspectedCardId && cardIds.includes(inspectedCardId)) {
        onClearInspector?.();
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
      inspectedCardId,
      onClearInspector,
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
  const analysisSteps = [
    { label: '解析字幕', status: 'active' as const },
    { label: '提炼重点', status: 'active' as const },
    { label: '生成卡片', status: 'active' as const },
  ];
  const analyzeButtonLabel = isAnalyzing
    ? '分析中...'
    : aiSettingsIssue
      ? '先配置 AI'
      : isCardListEmpty
        ? '重新生成卡片'
        : '分析内容';

  return (
    <aside
      className={styles.root}
      data-ai-panel-root="true"
      data-ai-panel-tab={activeTab}
      data-compact={compact ? 'true' : 'false'}
    >
      <div className={styles.header} data-ai-panel-header="true">
        <div className={styles.headerMain}>
          <span className={styles.headerIcon}>
            <AppIcon name="brain" size={14} />
          </span>
          <span className={styles.headerTitle}>AI 分析</span>
          {hasGeneratedCards ? (
            <span className={styles.headerBadge}>已选 {enabledCount}/{analysisResult?.cards.length ?? 0}</span>
          ) : null}
        </div>
        <div className={styles.headerActions}>
          <Button.Icon
            variant="ghost"
            className={styles.iconButton}
            onClick={() => void handleAnalyze()}
            aria-label={analysisResult ? '重新分析' : '分析内容'}
            title={analysisResult ? '重新分析' : '分析内容'}
          >
            {isAnalyzing ? <Spinner size={12} color="#EBEBF599" /> : <AppIcon name="refresh-cw" size={14} />}
          </Button.Icon>
          <Button.Icon
            variant="ghost"
            className={styles.iconButton}
            onClick={() => setIsSettingsOpen(true)}
            aria-label="打开 AI 全局设置"
            title="打开 AI 全局设置"
          >
            <AppIcon name="settings-2" size={14} />
          </Button.Icon>
        </div>
      </div>

      <div className={styles.subTabs} role="tablist" aria-label="AI 助手子标签">
        {(['cards', 'cover'] as const).map((tab) => (
          <Button
            key={tab}
            role="tab"
            aria-selected={activeTab === tab}
            variant="ghost"
            size="sm"
            className={joinClassNames(
              styles.subTab,
              activeTab === tab ? styles.subTabActive : '',
            )}
            onClick={() => setActiveTab(tab)}
          >
            {compact ? TAB_META[tab].shortLabel : TAB_META[tab].label}
          </Button>
        ))}
      </div>

      <div className={styles.body}>
        {activeTab === 'cards' ? (
          <>
            <section className={styles.promptSection}>
              <label className={styles.promptLabel}>整体创作提示词</label>
              <div className={styles.promptCard}>
                <Textarea
                  value={globalPromptDraft}
                  onChange={(event) => setGlobalPromptDraft(event.target.value)}
                  onBlur={handleGlobalPromptBlur}
                  placeholder="描述你想要的纵深风格和内容方向..."
                  rows={3}
                  size="sm"
                  resize="none"
                  className={styles.promptTextarea}
                />
              </div>
            </section>

            {analysisError ? (
              <div className={styles.errorWrap}>
                <Alert variant="destructive">{analysisError}</Alert>
              </div>
            ) : null}

            {showCardGenerationState ? (
              <section className={styles.emptyState} aria-busy={isAnalyzing}>
                <div className={styles.stateBadge}>{generationStateBadgeLabel}</div>
                <div className={styles.emptyStateText}>{generationStateText}</div>
                {aiSettingsIssue ? <div className={styles.hintText}>{aiSettingsIssue}</div> : null}
                <Button
                  variant="primary"
                  size="sm"
                  className={styles.primaryButton}
                  onClick={() => void handleAnalyze()}
                  disabled={analyzeButtonDisabled}
                >
                  {isAnalyzing ? (
                    <>
                      <Spinner size={12} color="#FFFFFF" />
                      {analyzeButtonLabel}
                    </>
                  ) : (
                    <>
                      <AppIcon name={aiSettingsIssue ? 'settings-2' : 'sparkles'} size={14} />
                      {analyzeButtonLabel}
                    </>
                  )}
                </Button>

                {isAnalyzing ? (
                  <div className={styles.analysisStatus}>
                    <div className={styles.analysisStatusTitle}>{analysisHeadline}</div>
                    <div className={styles.analysisStatusText}>{analysisDescription}</div>
                    <StepIndicator steps={analysisSteps} />
                  </div>
                ) : null}
              </section>
            ) : null}

            {hasGeneratedCards ? (
              <section className={styles.cardsSection}>
                <div className={styles.actionBar} data-ai-action-bar="true">
                  <Button
                    variant="secondary"
                    size="sm"
                    className={styles.actionButton}
                    onClick={handleSelectAllCards}
                  >
                    {allCardsSelected ? '取消全选' : '全选'}
                  </Button>
                  <div className={styles.selectionSummary} data-ai-selection-summary="true">
                    {selectedCount} / {analysisResult?.cards.length ?? 0} 已选
                  </div>
                  <Button
                    variant="destructive"
                    size="sm"
                    className={joinClassNames(styles.actionButton, styles.deleteButton)}
                    onClick={() => handleDeleteCards(enabledCardIds)}
                    disabled={selectedCount === 0 || isAnalyzing}
                  >
                    删除已选
                  </Button>
                </div>

                <div className={styles.analysisWorkspace}>
                  {analysisResult && hasGeneratedCards && isAnalyzing ? (
                    <div className={styles.analysisBanner}>
                      <div className={styles.analysisBannerBadge}>重新分析中</div>
                      <div className={styles.analysisBannerTitle}>{analysisOverlayTitle}</div>
                      <div className={styles.analysisBannerText}>{analysisOverlayText}</div>
                    </div>
                  ) : null}

                  <div className={joinClassNames(styles.workspaceContent, isAnalyzing ? styles.workspaceContentDimmed : '')}>
                    <AICardList
                      cards={analysisResult?.cards ?? []}
                      placements={cardPlacements}
                      onToggleEnabled={handleToggleEnabled}
                      onDeleteCard={(cardId) => handleDeleteCards([cardId])}
                      onEditCard={(cardId) => onOpenCardInspector?.(cardId)}
                    />
                  </div>
                </div>
              </section>
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
        <div className={styles.footer}>
          <Button
            variant="primary"
            size="sm"
            className={styles.footerButton}
            data-ai-footer-button="true"
            onClick={handleApplyToTimeline}
            disabled={enabledCount === 0 || isAnalyzing}
          >
            <AppIcon name="arrow-up-to-line" size={14} />
            <span>上轨 {enabledCount}</span>
          </Button>
        </div>
      ) : null}

      <AISettingsModal
        visible={isSettingsOpen}
        settings={panelSettings}
        onClose={() => setIsSettingsOpen(false)}
        onSave={(settings: AISettings) => saveAISettings(settings)}
      />
    </aside>
  );
}

function joinClassNames(...values: Array<string | undefined>): string {
  return values.filter(Boolean).join(' ');
}
