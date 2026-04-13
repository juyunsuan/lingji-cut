import { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Input,
  Select,
  Textarea,
} from '../ui';
import { getAISettingsIssue } from '../lib/ai-settings';
import { createMotionCardService } from '../lib/motion-card-service';
import { AIVisualSuggestionList } from './AIVisualSuggestionList';
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

const MOTION_EXAMPLES: Array<{
  id: string;
  title: string;
  description: string;
  prompt: string;
  durationSeconds: number;
  displayMode: AICardDisplayMode;
}> = [
  {
    id: 'bar-chart-fly-in',
    title: '飞入柱状图',
    description: '柱子依次飞入并轻微回弹，适合数据观点开场。',
    prompt:
      '生成一个 16:9 全屏 Remotion 动画：深色背景下 5 根柱状图从左到右依次飞入并有轻微回弹，数值标签同步淡入，整体节奏克制、利落，适合播客数据观点开场。',
    durationSeconds: 5,
    displayMode: 'fullscreen',
  },
  {
    id: 'number-counter-flip',
    title: '数字翻牌',
    description: '核心数字快速跳变并定格，适合强调增长或对比。',
    prompt:
      '生成一个 16:9 全屏 Remotion 动画：中央大数字以翻牌器效果从 0 快速跳到目标值，底部配简洁副标题和细线装饰，整体像商业播客里的关键指标揭晓。',
    durationSeconds: 4,
    displayMode: 'fullscreen',
  },
  {
    id: 'logo-glow-reveal',
    title: 'Logo 光晕',
    description: '中心标识被柔和光圈托起，适合片头或章节转场。',
    prompt:
      '生成一个 16:9 全屏 Remotion 动画：中心 Logo 或标题从模糊中显现，周围有柔和扩散光晕和极轻粒子漂浮，节奏高级克制，适合作为章节转场。',
    durationSeconds: 6,
    displayMode: 'fullscreen',
  },
  {
    id: 'audio-wave-breathing',
    title: '波形呼吸',
    description: '波形缓慢起伏，适合陪衬式背景动画。',
    prompt:
      '生成一个 16:9 PiP Remotion 动画：横向音频波形像呼吸一样缓慢起伏，带轻微辉光和柔和流动背景，信息密度低，适合做旁白时的陪衬动画。',
    durationSeconds: 5,
    displayMode: 'pip',
  },
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
  const { addAICardsToTimeline } = useTimelineStore();

  const storeCards = (aiState.motionCards as MotionCard[]) ?? null;
  const storeAddMotionCard = aiState.addMotionCard as ((card: MotionCard) => void) | undefined;
  const storeUpdateMotionCard = aiState.updateMotionCard as
    | ((cardId: string, updates: Partial<MotionCard>) => void)
    | undefined;
  const storeRemoveMotionCard = aiState.removeMotionCard as ((cardId: string) => void) | undefined;
  const storeIsGenerating = aiState.isGeneratingMotion as boolean | undefined;
  const storeSetGenerating = aiState.setGeneratingMotion as ((value: boolean) => void) | undefined;
  const storeMotionError = aiState.motionError as string | null | undefined;
  const storeSetMotionError = aiState.setMotionError as ((value: string | null) => void) | undefined;
  const storyboardPlan = aiState.storyboardPlan ?? null;
  const autoApplyVisualSuggestions = Boolean(aiState.autoApplyVisualSuggestions);
  const setAutoApplyVisualSuggestions = aiState.setAutoApplyVisualSuggestions as
    | ((enabled: boolean) => void)
    | undefined;

  const [localCards, setLocalCards] = useState<MotionCard[]>([]);
  const [localGenerating, setLocalGenerating] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

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

  const parsedSeconds = Number(durationSeconds);
  const normalizedSeconds = Number.isFinite(parsedSeconds) && parsedSeconds >= 1 ? parsedSeconds : 5;
  const durationMs = normalizedSeconds * 1000;

  const handleApplyExample = useCallback(
    (exampleId: string) => {
      const example = MOTION_EXAMPLES.find((item) => item.id === exampleId);
      if (!example) {
        return;
      }
      setPrompt(example.prompt);
      setDurationSeconds(String(example.durationSeconds));
      setDisplayMode(example.displayMode);
      setMotionErrorState(null);
    },
    [setMotionErrorState],
  );

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
        const service = createMotionCardService({ settings });
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

  const handleModify = useCallback(
    (cardId: string) => {
      const current = motionCards.find((card) => card.id === cardId);
      const currentMotionCard = current?.motionCard;
      if (!currentMotionCard?.sourceCode) {
        setMotionErrorState('当前动画还没有可修改的源码');
        return;
      }

      const instruction =
        typeof window !== 'undefined' && typeof window.prompt === 'function'
          ? window.prompt('描述你想怎么修改这张动画卡片', currentMotionCard.prompt)?.trim() ?? ''
          : '';
      if (!instruction) {
        return;
      }

      void (async () => {
        const settings = await loadAISettings();
        const settingsIssue = getAISettingsIssue(settings);
        if (settingsIssue || !settings) {
          setMotionErrorState(settingsIssue ?? '请先完成 AI 配置');
          onOpenSettings?.();
          return;
        }

        setCardStatus(cardId, 'generating');
        setGeneratingState(true);
        setMotionErrorState(null);

        try {
          const service = createMotionCardService({ settings });
          const result = await service.modify({
            sourceCode: currentMotionCard.sourceCode,
            instruction,
          });

          if (!result.success || !result.sourceCode || !result.compiledCode) {
            throw new Error(result.error ?? '动画修改失败');
          }

          handleUpdateMotionCard(cardId, {
            motionCard: {
              prompt: currentMotionCard.prompt,
              sourceCode: result.sourceCode,
              compiledCode: result.compiledCode,
              compiledAt: Date.now(),
              retryCount: result.retryCount,
            },
          });
          setCardStatus(cardId, 'ready');
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          handleUpdateMotionCard(cardId, {
            motionCard: {
              ...currentMotionCard,
              compileError: message,
            },
          });
          setCardStatus(cardId, 'error');
          setMotionErrorState(message);
        } finally {
          setGeneratingState(false);
        }
      })();
    },
    [
      handleUpdateMotionCard,
      motionCards,
      onOpenSettings,
      setCardStatus,
      setGeneratingState,
      setMotionErrorState,
    ],
  );

  const handleDelete = useCallback(
    (cardId: string) => {
      handleRemoveMotionCard(cardId);
      clearCardStatus(cardId);
    },
    [clearCardStatus, handleRemoveMotionCard],
  );

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

  const handleApplyToTimeline = useCallback(() => {
    const readyCards = motionCards.filter(
      (card) => card.enabled && card.motionCard?.compiledCode,
    );
    if (readyCards.length === 0) {
      return;
    }
    addAICardsToTimeline(readyCards.map(buildAICardTimelineDraft));
  }, [addAICardsToTimeline, motionCards]);

  const enabledReadyCount = motionCards.filter(
    (card) => card.enabled && card.motionCard?.compiledCode,
  ).length;

  const readyCount = motionCards.filter((card) => card.motionCard?.compiledCode).length;

  const statusedCards = useMemo(() => {
    return motionCards.map((card) => ({
      card,
      status: cardStatuses[card.id] ?? getCardStatus(card),
    }));
  }, [cardStatuses, motionCards]);

  return (
    <div className={styles.root}>
      <section className={styles.section}>
        <AIVisualSuggestionList
          storyboardPlan={storyboardPlan}
          autoApplyEnabled={autoApplyVisualSuggestions}
          onToggleAutoApply={setAutoApplyVisualSuggestions}
        />
      </section>

      {/* ─── 快速示例（横向滑动）─── */}
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <span className={styles.sectionTitle}>
            <span className={styles.sectionDot} />
            快速开始
          </span>
          <span className={styles.sectionMeta}>点一下带入</span>
        </div>
        <div className={styles.examplesRow}>
          {MOTION_EXAMPLES.map((example) => (
            <button
              key={example.id}
              type="button"
              className={styles.exampleChip}
              onClick={() => handleApplyExample(example.id)}
              title={example.description}
            >
              <span className={styles.exampleChipTitle}>{example.title}</span>
              <span className={styles.exampleChipBody}>{example.description}</span>
              <span className={styles.exampleChipFoot}>
                <Badge variant="secondary" size="xs">
                  {example.durationSeconds}s
                </Badge>
                <Badge variant="glass" size="xs">
                  {example.displayMode === 'fullscreen' ? '全屏' : 'PiP'}
                </Badge>
              </span>
            </button>
          ))}
        </div>
      </section>

      {/* ─── 描述 + 工具栏 ─── */}
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <span className={styles.sectionTitle}>
            <span className={styles.sectionDot} />
            动画描述
          </span>
          <span className={styles.sectionMeta}>越具体越稳定</span>
        </div>
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
              variant="primary"
              size="sm"
              fullWidth
              loading={isGeneratingMotion}
              loadingText="生成中..."
              leftIcon={<AppIcon name="sparkles" size={12} />}
              onClick={() => void handleGenerate()}
            >
              生成动画
            </Button>
          </div>
        </div>
      </section>

      {motionError ? (
        <div className={styles.errorWrap}>
          <Alert variant="destructive">{motionError}</Alert>
        </div>
      ) : null}

      {/* ─── 卡片列表 ─── */}
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
            <span>从上方示例开始，或者直接描述你想要的动画</span>
          </div>
        ) : (
          <div className={styles.cardList}>
            {statusedCards.map(({ card, status }) => (
              <MotionCardItem
                key={card.id}
                card={card}
                status={status}
                onToggleEnabled={handleToggleEnabled}
                onModify={handleModify}
                onDelete={handleDelete}
                onClick={(id) => onOpenCardInspector?.(id)}
              />
            ))}
          </div>
        )}
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
