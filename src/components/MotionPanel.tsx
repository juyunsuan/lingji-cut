import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActionBar,
  Alert,
  Button,
  Input,
  Select,
  Textarea,
} from '../ui';
import { getAISettingsIssue } from '../lib/ai-settings';
import { createMotionCardService } from '../lib/motion-card-service';
import {
  buildStoryboardMotionCardDrafts,
  isStoryboardMotionCardId,
} from '../lib/motion-autogen';
import type { AIStoryboardPlan } from '../types/ai';
import {
  buildAICardTimelineDraft,
  type AICard,
  type AICardDisplayMode,
  type CardStyle,
} from '../types/ai';
import type { MotionCardPayload } from '../types/motion';
import { loadAISettings, useAIStore } from '../store/ai';
import { useTimelineStore } from '../store/timeline';
import { AppIcon } from './AppIcon';
import { MotionCardItem } from './MotionCardItem';
import styles from './MotionPanel.module.css';

type MotionCardStatus = 'generating' | 'ready' | 'error';

type MotionCard = AICard & {
  type?: string;
  motionCard?: MotionCardPayload;
};

interface MotionPanelProps {
  onOpenCardInspector?: (cardId: string) => void;
  onOpenSettings?: () => void;
}

const MOTION_CARD_STYLE: CardStyle = {
  primaryColor: '#c084fc',
  backgroundColor: '#05060c',
  fontSize: 46,
};

const DISPLAY_MODE_OPTIONS = [
  { value: 'fullscreen', label: '全屏' },
  { value: 'pip', label: 'PiP' },
];

function getCardStatus(card: MotionCard): MotionCardStatus {
  if (!card.motionCard) {
    return 'generating';
  }
  if (card.motionCard.compileError) {
    return 'error';
  }
  if (card.motionCard.compiledCode) {
    return 'ready';
  }
  return 'generating';
}

export function MotionPanel({ onOpenCardInspector, onOpenSettings }: MotionPanelProps) {
  const aiState = useAIStore((state) => state as any);
  const { addAICardsToTimeline, srtEntries } = useTimelineStore();

  const storeCards = (aiState.motionCards as MotionCard[]) ?? null;
  const storeSetMotionCards = aiState.setMotionCards as ((cards: MotionCard[]) => void) | undefined;
  const storeAddMotionCard = aiState.addMotionCard as ((card: MotionCard) => void) | undefined;
  const storeUpdateMotionCard = aiState.updateMotionCard as
    | ((cardId: string, updates: Partial<MotionCard>) => void)
    | undefined;
  const storeRemoveMotionCard = aiState.removeMotionCard as ((cardId: string) => void) | undefined;
  const storeIsGenerating = aiState.isGeneratingMotion as boolean | undefined;
  const storeSetGenerating = aiState.setGeneratingMotion as ((value: boolean) => void) | undefined;
  const storeMotionError = aiState.motionError as string | null | undefined;
  const storeSetMotionError = aiState.setMotionError as ((value: string | null) => void) | undefined;
  const analysisResult = aiState.analysisResult ?? null;
  const storyboardPlan = (aiState.storyboardPlan ?? null) as AIStoryboardPlan | null;
  const isPlanningStoryboard = Boolean(aiState.isPlanningStoryboard);
  const storyboardError = (aiState.storyboardError ?? null) as string | null;
  const setPlanningStoryboard = aiState.setPlanningStoryboard as
    | ((enabled: boolean) => void)
    | undefined;
  const setStoryboardError = aiState.setStoryboardError as
    | ((error: string | null) => void)
    | undefined;
  const setStoryboardPlan = aiState.setStoryboardPlan as
    | ((plan: AIStoryboardPlan | null) => void)
    | undefined;

  const [localCards, setLocalCards] = useState<MotionCard[]>([]);
  const [localGenerating, setLocalGenerating] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  // 视觉编排专属的整体创作提示词，独立于内容卡片的 globalPrompt
  const [storyboardPromptDraft, setStoryboardPromptDraft] = useState(
    () => storyboardPlan?.globalPrompt ?? '',
  );
  useEffect(() => {
    setStoryboardPromptDraft(storyboardPlan?.globalPrompt ?? '');
  }, [storyboardPlan?.globalPrompt]);

  const motionCards = storeCards ?? localCards;
  const isGeneratingMotion =
    typeof storeIsGenerating === 'boolean' ? storeIsGenerating : localGenerating;
  const motionError = storeMotionError ?? localError;

  const setMotionErrorState = useCallback(
    (value: string | null) => {
      if (storeSetMotionError) {
        storeSetMotionError(value);
        return;
      }
      setLocalError(value);
    },
    [storeSetMotionError],
  );

  const setGeneratingState = useCallback(
    (value: boolean) => {
      if (storeSetGenerating) {
        storeSetGenerating(value);
        return;
      }
      setLocalGenerating(value);
    },
    [storeSetGenerating],
  );

  const handleAddMotionCard = useCallback(
    (card: MotionCard) => {
      if (storeAddMotionCard) {
        storeAddMotionCard(card);
        return;
      }
      setLocalCards((prev) => [...prev, card]);
    },
    [storeAddMotionCard],
  );

  const handleUpdateMotionCard = useCallback(
    (cardId: string, updates: Partial<MotionCard>) => {
      if (storeUpdateMotionCard) {
        storeUpdateMotionCard(cardId, updates);
        return;
      }
      setLocalCards((prev) =>
        prev.map((card) => (card.id === cardId ? { ...card, ...updates } : card)),
      );
    },
    [storeUpdateMotionCard],
  );

  const handleRemoveMotionCard = useCallback(
    (cardId: string) => {
      if (storeRemoveMotionCard) {
        storeRemoveMotionCard(cardId);
        return;
      }
      setLocalCards((prev) => prev.filter((card) => card.id !== cardId));
    },
    [storeRemoveMotionCard],
  );

  /**
   * 在开始新一轮视觉编排自动生成之前，清掉上一次自动生成的动画卡片，
   * 保留用户手动"补充创建"的卡片（不以 storyboard- 前缀开头）。
   */
  const clearAutoGeneratedMotionCards = useCallback(() => {
    if (storeSetMotionCards) {
      const currentCards = (storeCards ?? []) as MotionCard[];
      const preserved = currentCards.filter((card) => !isStoryboardMotionCardId(card.id));
      storeSetMotionCards(preserved);
      return;
    }
    setLocalCards((prev) => prev.filter((card) => !isStoryboardMotionCardId(card.id)));
  }, [storeCards, storeSetMotionCards]);

  const [cardStatuses, setCardStatuses] = useState<Record<string, MotionCardStatus>>({});

  const setCardStatus = useCallback((cardId: string, status: MotionCardStatus) => {
    setCardStatuses((prev) => ({ ...prev, [cardId]: status }));
  }, []);

  const clearCardStatus = useCallback((cardId: string) => {
    setCardStatuses((prev) => {
      const next = { ...prev };
      delete next[cardId];
      return next;
    });
  }, []);

  const [prompt, setPrompt] = useState('');
  const [durationSeconds, setDurationSeconds] = useState('5');
  const [displayMode, setDisplayMode] = useState<AICardDisplayMode>('fullscreen');
  const [isManualCreateOpen, setIsManualCreateOpen] = useState(false);

  const parsedSeconds = Number(durationSeconds);
  const normalizedSeconds = Number.isFinite(parsedSeconds) && parsedSeconds >= 1 ? parsedSeconds : 5;
  const durationMs = normalizedSeconds * 1000;

  const handleGenerate = useCallback(() => {
    const trimmed = prompt.trim();
    if (!trimmed) {
      setMotionErrorState('请描述你想要的动画效果');
      return;
    }

    const cardId = `motion-${Date.now()}-${Math.floor(Math.random() * 100_000)}`;
    const newCard: MotionCard = {
      id: cardId,
      segmentId: cardId,
      type: 'motion',
      title: trimmed.slice(0, 32) || '动画卡片',
      content: trimmed,
      cardPrompt: trimmed,
      startMs: 0,
      endMs: durationMs,
      displayDurationMs: durationMs,
      displayMode,
      template: 'motion-default',
      enabled: true,
      style: MOTION_CARD_STYLE,
      renderMode: 'motion-card',
      motionCard: {
        prompt: trimmed,
        sourceCode: '',
        compiledCode: '',
        compiledAt: 0,
        retryCount: 0,
      },
    };

    void (async () => {
      const settings = await loadAISettings();
      const settingsIssue = getAISettingsIssue(settings);
      if (settingsIssue || !settings) {
        setMotionErrorState(settingsIssue ?? '请先完成 AI 配置');
        onOpenSettings?.();
        return;
      }

      handleAddMotionCard(newCard);
      setCardStatus(cardId, 'generating');
      setGeneratingState(true);
      setMotionErrorState(null);

      try {
        const projectBindings = useAIStore.getState().projectBindings;
        const service = createMotionCardService({ settings, projectBindings });
        const result = await service.generate({
          prompt: trimmed,
          durationMs,
          displayMode,
        });

        if (!result.success || !result.sourceCode || !result.compiledCode) {
          throw new Error(result.error ?? '动画生成失败');
        }

        handleUpdateMotionCard(cardId, {
          motionCard: {
            prompt: trimmed,
            sourceCode: result.sourceCode,
            compiledCode: result.compiledCode,
            compiledAt: Date.now(),
            retryCount: result.retryCount,
          },
        });
        setCardStatus(cardId, 'ready');
        setPrompt('');
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        handleUpdateMotionCard(cardId, {
          motionCard: {
            prompt: trimmed,
            sourceCode: '',
            compiledCode: '',
            compiledAt: Date.now(),
            compileError: message,
            retryCount: 0,
          },
        });
        setCardStatus(cardId, 'error');
        setMotionErrorState(message);
      } finally {
        setGeneratingState(false);
      }
    })();
  }, [
    handleAddMotionCard,
    handleUpdateMotionCard,
    onOpenSettings,
    prompt,
    durationMs,
    displayMode,
    setCardStatus,
    setGeneratingState,
    setMotionErrorState,
  ]);

  const handleToggleEnabled = useCallback(
    (cardId: string) => {
      const card = motionCards.find((item) => item.id === cardId);
      if (!card) {
        return;
      }
      handleUpdateMotionCard(cardId, { enabled: !card.enabled });
    },
    [handleUpdateMotionCard, motionCards],
  );

  const handleSelectAll = useCallback(() => {
    const shouldEnableAll = motionCards.some((card) => !card.enabled);
    motionCards.forEach((card) => {
      handleUpdateMotionCard(card.id, { enabled: shouldEnableAll });
    });
  }, [handleUpdateMotionCard, motionCards]);

  const handleDeleteEnabled = useCallback(() => {
    const enabledIds = motionCards.filter((card) => card.enabled).map((card) => card.id);
    enabledIds.forEach((cardId) => {
      handleRemoveMotionCard(cardId);
      clearCardStatus(cardId);
    });
  }, [clearCardStatus, handleRemoveMotionCard, motionCards]);

  const handleApplyToTimeline = useCallback(() => {
    const readyCards = motionCards.filter(
      (card) => card.enabled && card.motionCard?.compiledCode,
    );
    if (readyCards.length === 0) {
      return;
    }
    addAICardsToTimeline(readyCards.map(buildAICardTimelineDraft));
  }, [addAICardsToTimeline, motionCards]);

  /**
   * 基于视觉编排计划自动生成动画卡片。
   * 为了避免 LLM 并发过高，这里采用串行生成；失败单条不影响其他条目。
   */
  const generateMotionCardsFromPlan = useCallback(
    async (plan: AIStoryboardPlan) => {
      const drafts = buildStoryboardMotionCardDrafts(plan, { style: MOTION_CARD_STYLE });
      if (drafts.length === 0) {
        return;
      }

      // 先把骨架卡片一次性注入列表，确保 UI 立即呈现 generating 状态
      drafts.forEach(({ card }) => {
        handleAddMotionCard(card);
        setCardStatus(card.id, 'generating');
      });

      const settings = await loadAISettings();
      const settingsIssue = getAISettingsIssue(settings);
      if (settingsIssue || !settings) {
        const msg = settingsIssue ?? '请先完成 AI 配置';
        drafts.forEach(({ card }) => {
          handleUpdateMotionCard(card.id, {
            motionCard: {
              prompt: card.cardPrompt ?? '',
              sourceCode: '',
              compiledCode: '',
              compiledAt: Date.now(),
              compileError: msg,
              retryCount: 0,
            },
          });
          setCardStatus(card.id, 'error');
        });
        setMotionErrorState(msg);
        onOpenSettings?.();
        return;
      }

      setGeneratingState(true);
      const projectBindings = useAIStore.getState().projectBindings;
      const service = createMotionCardService({ settings, projectBindings });

      for (const { card, prompt: promptText } of drafts) {
        try {
          const result = await service.generate({
            prompt: promptText,
            durationMs: card.displayDurationMs,
            displayMode: card.displayMode,
          });

          if (!result.success || !result.sourceCode || !result.compiledCode) {
            throw new Error(result.error ?? '动画生成失败');
          }

          handleUpdateMotionCard(card.id, {
            motionCard: {
              prompt: promptText,
              sourceCode: result.sourceCode,
              compiledCode: result.compiledCode,
              compiledAt: Date.now(),
              retryCount: result.retryCount,
            },
          });
          setCardStatus(card.id, 'ready');
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          handleUpdateMotionCard(card.id, {
            motionCard: {
              prompt: promptText,
              sourceCode: '',
              compiledCode: '',
              compiledAt: Date.now(),
              compileError: message,
              retryCount: 0,
            },
          });
          setCardStatus(card.id, 'error');
        }
      }

      setGeneratingState(false);
    },
    [
      handleAddMotionCard,
      handleUpdateMotionCard,
      onOpenSettings,
      setCardStatus,
      setGeneratingState,
      setMotionErrorState,
    ],
  );

  const handleAnalyzeStoryboard = useCallback(async () => {
    const settings = await loadAISettings();
    const settingsIssue = getAISettingsIssue(settings);

    if (settingsIssue) {
      setStoryboardError?.(settingsIssue);
      onOpenSettings?.();
      return;
    }

    if (!settings) {
      setStoryboardError?.('请先完成 AI 配置');
      onOpenSettings?.();
      return;
    }

    if (srtEntries.length === 0) {
      setStoryboardError?.('请先导入 SRT 字幕文件');
      return;
    }

    setStoryboardError?.(null);
    setMotionErrorState(null);
    setPlanningStoryboard?.(true);

    // 开始新一轮分析前，先清除上次自动生成的动画卡片
    clearAutoGeneratedMotionCards();

    let nextPlan: AIStoryboardPlan | null = null;
    try {
      nextPlan = await window.electronAPI.planStoryboard({
        entries: srtEntries,
        settings,
        globalPrompt: storyboardPromptDraft.trim() || undefined,
      });
      setStoryboardPlan?.(nextPlan);
    } catch (error) {
      setStoryboardError?.(error instanceof Error ? error.message : '视觉编排分析失败');
      setPlanningStoryboard?.(false);
      return;
    }

    setPlanningStoryboard?.(false);

    if (nextPlan) {
      try {
        await generateMotionCardsFromPlan(nextPlan);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : '自动生成动画卡片失败，请稍后重试';
        setMotionErrorState(message);
      }
    }
  }, [
    storyboardPromptDraft,
    clearAutoGeneratedMotionCards,
    generateMotionCardsFromPlan,
    onOpenSettings,
    setMotionErrorState,
    setPlanningStoryboard,
    setStoryboardError,
    setStoryboardPlan,
    srtEntries,
  ]);

  const enabledReadyCount = motionCards.filter(
    (card) => card.enabled && card.motionCard?.compiledCode,
  ).length;

  const enabledMotionCount = motionCards.filter((card) => card.enabled).length;
  const allMotionCardsEnabled = motionCards.length > 0 && motionCards.every((card) => card.enabled);

  const readyCount = motionCards.filter((card) => card.motionCard?.compiledCode).length;

  const statusedCards = useMemo(() => {
    return motionCards.map((card) => ({
      card,
      status: cardStatuses[card.id] ?? getCardStatus(card),
    }));
  }, [cardStatuses, motionCards]);

  return (
    <div className={styles.root}>
      {/* ─── 整体创作提示词 + 分析入口 ─── */}
      <section className={styles.globalPromptSection}>
        <label className={styles.globalPromptLabel}>整体创作提示词</label>
        <div className={styles.globalPromptCard}>
          <Textarea
            value={storyboardPromptDraft}
            onChange={(event) => setStoryboardPromptDraft(event.target.value)}
            placeholder="描述视觉风格偏好，例如：偏简洁数据风，减少文字装饰..."
            rows={3}
            size="sm"
            resize="none"
            className={styles.globalPromptTextarea}
          />
        </div>
        <Button
          variant={storyboardPlan ? 'secondary' : 'primary'}
          size="sm"
          fullWidth
          loading={isPlanningStoryboard || isGeneratingMotion}
          loadingText={isPlanningStoryboard ? '分析中...' : '生成中...'}
          leftIcon={<AppIcon name="sparkles" size={13} />}
          onClick={() => void handleAnalyzeStoryboard()}
          disabled={srtEntries.length === 0}
        >
          {storyboardPlan ? '重新分析并生成' : '分析并生成动画卡片'}
        </Button>
        {storyboardError ? (
          <Alert variant="destructive">{storyboardError}</Alert>
        ) : null}
      </section>

      {motionError ? (
        <div className={styles.errorWrap}>
          <Alert variant="destructive">{motionError}</Alert>
        </div>
      ) : null}

      {/* ─── 动画卡片列表 ─── */}
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <span className={styles.sectionTitle}>
            <span className={styles.sectionDot} />
            动画卡片
          </span>
          {motionCards.length > 0 ? (
            <span className={styles.sectionMeta}>
              {readyCount} 就绪 · {motionCards.length} 总计
            </span>
          ) : null}
        </div>

        {motionCards.length === 0 ? (
          <div className={styles.emptyState}>
            <span className={styles.emptyStateIcon}>
              <AppIcon name="film" size={18} />
            </span>
            <span className={styles.emptyStateTitle}>还没有动画卡片</span>
            <span>填写创作提示词后点击"分析并生成动画卡片"，系统会根据字幕自动生成动画</span>
          </div>
        ) : (
          <>
            <ActionBar
              className={styles.actionBar}
              start={
                <Button
                  variant="secondary"
                  size="xs"
                  onClick={handleSelectAll}
                >
                  {allMotionCardsEnabled ? '取消全选' : '全选'}
                </Button>
              }
              center={
                <div className={styles.selectionSummary}>
                  {enabledMotionCount} / {motionCards.length} 已选
                </div>
              }
              end={
                <Button
                  variant="destructive"
                  size="xs"
                  onClick={handleDeleteEnabled}
                  disabled={enabledMotionCount === 0}
                >
                  删除已选
                </Button>
              }
            />
            <div className={styles.cardList}>
              {statusedCards.map(({ card, status }) => (
                <MotionCardItem
                  key={card.id}
                  card={card}
                  status={status}
                  onToggleEnabled={handleToggleEnabled}
                  onClick={(id) => onOpenCardInspector?.(id)}
                />
              ))}
            </div>
          </>
        )}
      </section>

      {/* ─── 补充创建（折叠） ─── */}
      <section className={styles.section}>
        <Button
          variant="ghost"
          className={styles.manualToggle}
          style={{ height: 'auto' }}
          aria-expanded={isManualCreateOpen}
          onClick={() => setIsManualCreateOpen((prev) => !prev)}
        >
          <span className={styles.manualToggleLabel}>
            <AppIcon
              name={isManualCreateOpen ? 'chevron-down' : 'chevron-right'}
              size={12}
            />
            补充创建动画
          </span>
          <span className={styles.manualToggleHint}>手动描述一张额外的动画卡片</span>
        </Button>

        {isManualCreateOpen ? (
          <div className={styles.promptShell}>
            <Textarea
              size="sm"
              resize="none"
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="例如：从左向右飞入的柱状图，持续 3 秒，带轻微 motion blur"
              rows={3}
              className={styles.promptTextarea}
            />
            <div className={styles.toolbar}>
              <div className={styles.toolbarRow}>
                <div className={styles.toolbarItem}>
                  <span className={styles.toolbarLabel}>时长（秒）</span>
                  <Input
                    variant="number"
                    size="sm"
                    min={1}
                    max={60}
                    value={durationSeconds}
                    onChange={(event) => setDurationSeconds(event.target.value)}
                  />
                </div>
                <div className={styles.toolbarItem}>
                  <span className={styles.toolbarLabel}>显示模式</span>
                  <Select
                    value={displayMode}
                    onChange={(event) => setDisplayMode(event.target.value as AICardDisplayMode)}
                    options={DISPLAY_MODE_OPTIONS}
                    className={styles.toolbarSelect}
                  />
                </div>
              </div>
              <Button
                variant="secondary"
                size="sm"
                fullWidth
                loading={isGeneratingMotion}
                loadingText="生成中..."
                leftIcon={<AppIcon name="sparkles" size={12} />}
                onClick={() => void handleGenerate()}
              >
                生成一张补充动画
              </Button>
            </div>
          </div>
        ) : null}
      </section>

      {motionCards.length > 0 ? (
        <div className={styles.footer}>
          <Button
            variant="primary"
            size="sm"
            fullWidth
            disabled={enabledReadyCount === 0}
            leftIcon={<AppIcon name="arrow-up-to-line" size={13} />}
            onClick={handleApplyToTimeline}
          >
            上轨 {enabledReadyCount} 张动画
          </Button>
        </div>
      ) : null}
    </div>
  );
}
