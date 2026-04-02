import { useCallback, useEffect, useState } from 'react';
import {
  createPersistedAIState,
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

interface AIPanelProps {
  compact: boolean;
  railHeight?: number;
}

const TAB_META: Record<'cards' | 'cover', { label: string; shortLabel: string; icon: AppIconName }> = {
  cards: { label: '内容卡片', shortLabel: '卡片', icon: 'layout-template' },
  cover: { label: '封面', shortLabel: '封面', icon: 'image' },
};

export function AIPanel({ compact, railHeight }: AIPanelProps) {
  const { srtEntries, timeline, addAICardsToTimeline, setGlobalBackground } = useTimelineStore();
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
    toggleCardEnabled,
    updateCard,
    setCoverCandidates,
    selectCover,
    setGeneratingCovers,
    setActiveTab,
  } = useAIStore();
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [editingCardId, setEditingCardId] = useState<string | null>(null);
  const [isRegeneratingCard, setIsRegeneratingCard] = useState(false);
  const [globalPromptDraft, setGlobalPromptDraft] = useState('');
  const editingCard = analysisResult?.cards.find((card) => card.id === editingCardId) ?? null;
  const enabledCount = analysisResult?.cards.filter((card) => card.enabled).length ?? 0;
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
      const projectDir = getProjectDir();
      if (!projectDir) {
        return;
      }

      await window.electronAPI.saveAIAnalysis(
        projectDir,
        JSON.stringify(createPersistedAIState(result, candidates), null, 2),
      );
    },
    [],
  );

  const handleToggleEnabled = useCallback(
    (cardId: string) => {
      const nextResult = toggleCardEnabledInResult(analysisResult, cardId);
      if (!nextResult) {
        return;
      }

      toggleCardEnabled(cardId);
      void persistAIState(nextResult, coverCandidates);
    },
    [analysisResult, coverCandidates, persistAIState, toggleCardEnabled],
  );

  const handleSaveCard = useCallback(
    (cardId: string, updates: Partial<AICard>) => {
      const nextResult = updateCardInResult(analysisResult, cardId, updates);
      if (!nextResult) {
        return;
      }

      updateCard(cardId, updates);
      const updatedCard = nextResult.cards.find((card) => card.id === cardId);
      if (updatedCard && cardPlacements[cardId]) {
        addAICardsToTimeline([buildAICardTimelineDraft(updatedCard)]);
      }
      void persistAIState(nextResult, coverCandidates);
    },
    [addAICardsToTimeline, analysisResult, cardPlacements, coverCandidates, persistAIState, updateCard],
  );

  const handleSelectCover = useCallback(
    (candidateId: string) => {
      const nextCandidates = selectCoverCandidate(coverCandidates, candidateId);
      selectCover(candidateId);
      void persistAIState(analysisResult, nextCandidates);
    },
    [analysisResult, coverCandidates, persistAIState, selectCover],
  );

  const handlePersistedCovers = useCallback(
    async (candidates: CoverCandidate[]) => {
      setCoverCandidates(candidates);
      await persistAIState(analysisResult, candidates);
    },
    [analysisResult, persistAIState, setCoverCandidates],
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
      setAnalysisResult(result);
      setCoverCandidates(nextCandidates);
      await persistAIState(result, nextCandidates);
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
  const handleRegenerateCard = useCallback(async (draftUpdates: Partial<AICard>) => {
    if (!editingCard || !analysisResult) {
      return;
    }

    const settings = loadAISettings();
    const settingsIssue = getAISettingsIssue(settings);
    if (settingsIssue) {
      setAnalysisError(settingsIssue);
      setIsSettingsOpen(true);
      return;
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
        return;
      }

      updateCard(editingCard.id, {
        ...draftUpdates,
        ...regeneratedCard,
      });
      if (cardPlacements[editingCard.id]) {
        addAICardsToTimeline([buildAICardTimelineDraft(regeneratedCard)]);
      }
      await persistAIState(nextResult, coverCandidates);
    } catch (error) {
      console.error('单卡重生成失败:', error);
      setAnalysisError(error instanceof Error ? error.message : '单卡重生成失败');
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
    updateCard,
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
    void persistAIState(nextResult, coverCandidates);
  }, [analysisResult, coverCandidates, globalPromptDraft, persistAIState, setAnalysisResult]);
  const panelSettings = loadAISettings();
  const aiSettingsIssue = getAISettingsIssue(panelSettings);
  const hasSrtEntries = srtEntries.length > 0;
  const analyzeButtonDisabled = !hasSrtEntries || isAnalyzing;
  const analyzeButtonCursor = !hasSrtEntries ? 'not-allowed' : isAnalyzing ? 'wait' : 'pointer';
  const analyzeButtonOpacity = !hasSrtEntries ? 0.55 : isAnalyzing ? 0.72 : 1;
  const showInitialState = !analysisResult;
  const analysisHeadline = analysisResult ? '正在重新分析内容卡片' : '正在拆解字幕与生成卡片';
  const analysisDescription = analysisResult
    ? '正在根据最新字幕和提示词重新组织结构，完成后会自动刷新当前卡片列表。'
    : '正在解析字幕、提炼重点并生成可编辑卡片，这通常需要几十秒。';

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
      <div style={{ ...headerStyle, gap: compact ? 6 : 8 }}>
        <div style={{ ...headerInfoStyle, gap: compact ? 6 : 8 }}>
          <div style={{ ...headerTitleWrapStyle, gap: compact ? 6 : 8 }}>
            <span
              style={{
                ...headerIconWrapStyle,
                width: compact ? 20 : 22,
                height: compact ? 20 : 22,
              }}
            >
              <AppIcon name="sparkles" size={14} />
            </span>
            <div style={headerTitleStyle}>AI 助手</div>
          </div>
          {analysisResult && !compact ? (
            <div style={summaryChipStyle}>
              已选 {enabledCount}/{analysisResult.cards.length}
            </div>
          ) : null}
        </div>
        <div style={headerActionsStyle}>
          {analysisResult ? (
            <button
              type="button"
              onClick={handleAnalyze}
              disabled={isAnalyzing}
              style={{
                ...iconButtonStyle,
                width: headerButtonSize,
                height: headerButtonSize,
                opacity: isAnalyzing ? 0.7 : 1,
                cursor: isAnalyzing ? 'wait' : 'pointer',
              }}
              title={isAnalyzing ? '分析中' : '重新分析'}
              aria-label={isAnalyzing ? '分析中' : '重新分析'}
            >
              {isAnalyzing ? <LoadingSpinner size={14} color="#c7d2fe" /> : <AppIcon name="refresh-cw" size={14} />}
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => setIsSettingsOpen(true)}
            style={{ ...iconButtonStyle, width: headerButtonSize, height: headerButtonSize }}
            title="AI 设置"
            aria-label="AI 设置"
          >
            <AppIcon name="settings-2" size={14} />
          </button>
        </div>
      </div>

      <div style={tabBarStyle}>
        {(['cards', 'cover'] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            style={{
              ...tabButtonStyle,
              padding: compact ? '6px 0' : '8px 0',
              borderBottom:
                activeTab === tab ? '2px solid #6366f1' : '2px solid transparent',
              color: activeTab === tab ? '#6366f1' : '#64748b',
              fontWeight: activeTab === tab ? 700 : 500,
            }}
            title={TAB_META[tab].label}
          >
            <span style={tabContentStyle}>
              <AppIcon name={TAB_META[tab].icon} size={14} />
              {compact ? TAB_META[tab].shortLabel : TAB_META[tab].label}
            </span>
          </button>
        ))}
      </div>

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
              <div style={fieldLabelStyle}>整体创作提示词</div>
              <textarea
                value={globalPromptDraft}
                onChange={(event) => setGlobalPromptDraft(event.target.value)}
                onBlur={handleGlobalPromptBlur}
                placeholder="例如：整体做成财经研报感，少字强结论，版式更像商业媒体封面"
                rows={3}
                style={promptTextareaStyle}
              />
            </div>

            {showInitialState ? (
              <div
                style={{
                  ...emptyStateStyle,
                  padding: isAnalyzing ? 20 : 18,
                }}
                aria-busy={isAnalyzing}
              >
                <div style={emptyStateBadgeStyle}>
                  {isAnalyzing ? <LoadingSpinner size={14} color="#c7d2fe" /> : <AppIcon name="sparkles" size={14} />}
                  {isAnalyzing ? 'AI 正在工作' : '准备生成内容卡片'}
                </div>
                <div style={emptyStateTextStyle}>
                  {isAnalyzing
                    ? `已载入 ${srtEntries.length} 条字幕，正在为你拆解结构与重点`
                    : srtEntries.length === 0
                    ? '请先导入 SRT 字幕文件'
                    : `已加载 ${srtEntries.length} 条字幕，点击分析`}
                </div>
                {aiSettingsIssue ? <div style={hintTextStyle}>{aiSettingsIssue}</div> : null}
                <button
                  type="button"
                  onClick={handleAnalyze}
                  disabled={analyzeButtonDisabled}
                  style={{
                    ...analyzeButtonStyle,
                    height: compact ? 34 : 36,
                    opacity: analyzeButtonOpacity,
                    cursor: analyzeButtonCursor,
                    boxShadow: isAnalyzing
                      ? '0 16px 36px rgba(99,102,241,0.28)'
                      : '0 12px 30px rgba(99,102,241,0.2)',
                  }}
                >
                  <span style={primaryActionContentStyle}>
                    {isAnalyzing ? (
                      <LoadingSpinner size={14} color="#ffffff" />
                    ) : (
                      <AppIcon name={aiSettingsIssue ? 'settings-2' : 'sparkles'} size={14} />
                    )}
                    {isAnalyzing ? '分析中...' : aiSettingsIssue ? '先配置 AI' : '分析内容'}
                  </span>
                </button>

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

            {analysisResult && isAnalyzing ? (
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
            {analysisResult ? (
              <div
                style={{
                  opacity: isAnalyzing ? 0.68 : 1,
                  pointerEvents: isAnalyzing ? 'none' : 'auto',
                  transition: 'opacity 180ms ease',
                }}
              >
                <AICardList
                  cards={analysisResult.cards}
                  placements={cardPlacements}
                  onToggleEnabled={handleToggleEnabled}
                  onEditCard={setEditingCardId}
                />
              </div>
            ) : null}
          </>
        ) : (
          <AICoverPanel
            coverPrompts={analysisResult?.coverPrompts ?? []}
            candidates={coverCandidates}
            isGenerating={isGeneratingCovers}
            selectedCandidateId={selectedCoverCandidate?.id}
            onGenerateCovers={handleGenerateCovers}
            onSelectCover={handleSelectCover}
            onAddToTimeline={handleAddCoverToTimeline}
          />
        )}
      </div>

      {activeTab === 'cards' && analysisResult ? (
        <div style={footerStyle}>
          <button
            type="button"
            onClick={handleApplyToTimeline}
            disabled={enabledCount === 0 || isAnalyzing}
            style={{
              ...applyButtonStyle,
              minHeight: primaryButtonHeight,
              height: primaryButtonHeight,
              opacity: enabledCount === 0 || isAnalyzing ? 0.55 : 1,
              cursor: enabledCount === 0 || isAnalyzing ? 'not-allowed' : 'pointer',
            }}
          >
            <span style={primaryActionContentStyle}>
              {isAnalyzing ? <LoadingSpinner size={14} color="#ffffff" /> : <AppIcon name="send-horizontal" size={14} />}
              {isAnalyzing ? '分析中...' : '应用到时间线'}
              <span style={countBadgeStyle}>{enabledCount}</span>
            </span>
          </button>
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
