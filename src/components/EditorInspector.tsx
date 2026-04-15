import { useCallback, useMemo, useState } from 'react';
import { Button, EmptyState } from '../ui';
import { MotionCardInspector, type MotionCardEdits } from './MotionCardInspector';
import { AICardInspector } from './AICardInspector';
import { AppIcon } from './AppIcon';
import { OverlayInspector } from './OverlayInspector';
import { ProjectOverviewPanel, type ProjectOverviewMeta } from './ProjectOverviewPanel';
import { SubtitleInspector } from './SubtitleInspector';
import { useAICardInspector } from '../hooks/useAICardInspector';
import { getAISettingsIssue } from '../lib/ai-settings';
import { loadAISettings, useAIStore } from '../store/ai';
import { createMotionCardService } from '../lib/motion-card-service';
import { useTimelineStore } from '../store/timeline';
import styles from './EditorInspector.module.css';

export type InspectorSelection =
  | { type: 'empty' }
  | { type: 'ai-card'; cardId: string }
  | { type: 'motion-card'; cardId: string }
  | { type: 'overlay'; overlayId: string }
  | { type: 'subtitle-style' };

interface EditorInspectorProps {
  assetCount?: number;
  isProjectMetaLoading?: boolean;
  overlayCount?: number;
  projectDir?: string;
  projectMeta?: ProjectOverviewMeta | null;
  selection: InspectorSelection;
  timelineWidth: number;
  timelineHeight: number;
  timelineFps?: number;
  onClose: () => void;
}

export function EditorInspector({
  assetCount = 0,
  isProjectMetaLoading = false,
  selection,
  overlayCount = 0,
  projectDir = '',
  projectMeta = null,
  timelineHeight,
  timelineFps = 30,
  timelineWidth,
  onClose,
}: EditorInspectorProps) {
  const {
    card,
    cardSequenceLabel,
    deleteCard,
    errorMessage,
    isRegeneratingCard,
    regenerateCard,
    saveCard,
  } = useAICardInspector(selection.type === 'ai-card' ? selection.cardId : null);
  const motionCards = useAIStore((state) => state.motionCards);
  const setMotionCards = useAIStore((state) => state.setMotionCards);
  const updateMotionCard = useAIStore((state) => state.updateMotionCard);
  const timeline = useTimelineStore((state) => state.timeline);

  const [isModifyingMotion, setIsModifyingMotion] = useState(false);
  const [motionModifyError, setMotionModifyError] = useState<string | null>(null);

  const handleModifyMotion = useCallback(
    async (instruction: string, edits: MotionCardEdits) => {
      if (selection.type !== 'motion-card') return;
      const { cardId } = selection;
      const currentCard = motionCards.find((item) => item.id === cardId);
      if (!currentCard) return;

      setMotionModifyError(null);
      setIsModifyingMotion(true);

      try {
        const settings = await loadAISettings();
        const settingsIssue = getAISettingsIssue(settings);
        if (settingsIssue || !settings) {
          setMotionModifyError(settingsIssue ?? '请先完成 AI 配置');
          return;
        }

        const service = createMotionCardService({ settings });
        const currentMotionCard = currentCard.motionCard;
        let result;

        if (currentMotionCard?.sourceCode && instruction.trim()) {
          result = await service.modify({
            sourceCode: currentMotionCard.sourceCode,
            instruction: instruction.trim(),
          });
        } else {
          const prompt = instruction.trim() || currentCard.cardPrompt || currentMotionCard?.prompt || edits.title;
          result = await service.generate({
            prompt,
            durationMs: edits.durationMs,
            displayMode: edits.displayMode,
          });
        }

        if (!result.success || !result.sourceCode || !result.compiledCode) {
          throw new Error(result.error ?? '动画生成失败');
        }

        updateMotionCard(cardId, {
          title: edits.title,
          displayDurationMs: edits.durationMs,
          displayMode: edits.displayMode,
          motionCard: {
            prompt: currentMotionCard?.prompt ?? edits.title,
            sourceCode: result.sourceCode,
            compiledCode: result.compiledCode,
            compiledAt: Date.now(),
            retryCount: result.retryCount,
          },
        });
      } catch (error) {
        setMotionModifyError(error instanceof Error ? error.message : '操作失败');
      } finally {
        setIsModifyingMotion(false);
      }
    },
    [motionCards, selection, updateMotionCard],
  );

  const handleSaveMotion = useCallback(
    (edits: MotionCardEdits) => {
      if (selection.type !== 'motion-card') return;
      const { cardId } = selection;
      updateMotionCard(cardId, {
        title: edits.title,
        displayDurationMs: edits.durationMs,
        displayMode: edits.displayMode,
      });
    },
    [selection, updateMotionCard],
  );

  /* ── eyebrow pill 内容 ── */
  const selectedOverlay =
    selection.type === 'overlay'
      ? timeline.overlays.find((item) => item.id === selection.overlayId) ?? null
      : null;
  const eyebrowLabel =
    selection.type === 'subtitle-style'
      ? 'SUBTITLE'
      : selection.type === 'ai-card'
      ? 'AI CARD'
      : selection.type === 'motion-card'
      ? 'MOTION CARD'
      : selection.type === 'overlay'
      ? selectedOverlay?.type === 'audio'
        ? 'AUDIO'
        : selectedOverlay?.type === 'text'
        ? 'TEXT'
        : 'OVERLAY'
      : 'INSPECTOR';

  /* ── 右侧索引/状态标签 ── */
  const isSubtitleStyle = selection.type === 'subtitle-style';
  const indexLabel = selection.type === 'ai-card' ? cardSequenceLabel : null;
  const motionCard =
    selection.type === 'motion-card'
      ? motionCards.find((item) => item.id === selection.cardId) ?? null
      : null;
  const isMotionOnTimeline = useMemo(() => {
    if (!selection || selection.type !== 'motion-card') {
      return false;
    }
    return timeline.overlays.some(
      (overlay) =>
        overlay.overlayType === 'ai-card' &&
        overlay.aiCardData?.sourceCardId === selection.cardId,
    );
  }, [selection, timeline.overlays]);
  const motionStatusHint = isMotionOnTimeline ? '已上轨，可在时间轴预览' : '尚未上轨';
  const renderBody = () => {
    if (selection.type === 'subtitle-style') {
      return <SubtitleInspector />;
    }

    if (selection.type === 'ai-card') {
      if (!card) {
        return (
          <div className={styles.emptyWrap}>
            <EmptyState
              title="卡片不存在"
              description="当前 AI 卡片可能已被删除，请重新从左侧卡片列表或时间轴中选择。"
            />
          </div>
        );
      }

      return (
        <AICardInspector
          card={card}
          errorMessage={errorMessage}
          isRegenerating={isRegeneratingCard}
          previewWidth={timelineWidth}
          previewHeight={timelineHeight}
          onDelete={() => {
            deleteCard();
            onClose();
          }}
          onRegenerate={regenerateCard}
          onSave={saveCard}
        />
      );
    }

    if (selection.type === 'motion-card') {
      return (
        <MotionCardInspector
          cardId={selection.cardId}
          title={motionCard?.title}
          prompt={motionCard?.cardPrompt ?? motionCard?.motionCard?.prompt}
          durationMs={motionCard?.displayDurationMs}
          displayMode={motionCard?.displayMode}
          motionCard={motionCard?.motionCard ?? null}
          isModifying={isModifyingMotion}
          errorMessage={motionModifyError}
          onModify={handleModifyMotion}
          onSave={handleSaveMotion}
          onDelete={() => {
            setMotionCards(motionCards.filter((item) => item.id !== selection.cardId));
            useTimelineStore.getState().removeAICardOverlaysBySourceIds([selection.cardId]);
            onClose();
          }}
        />
      );
    }

    if (selection.type === 'overlay') {
      return (
        <OverlayInspector
          overlayId={selection.overlayId}
          onDelete={() => {
            useTimelineStore.getState().removeOverlay(selection.overlayId);
            onClose();
          }}
        />
      );
    }

    return (
      <ProjectOverviewPanel
        assetCount={assetCount}
        isProjectMetaLoading={isProjectMetaLoading}
        overlayCount={overlayCount}
        projectDir={projectDir}
        projectMeta={projectMeta}
        timelineFps={timelineFps}
        timelineHeight={timelineHeight}
        timelineWidth={timelineWidth}
      />
    );
  };

  return (
    <div
      className={styles.shell}
      data-editor-region="inspector-shell"
    >
      <div className={styles.header}>
        <span
          className={styles.eyebrowPill}
          data-variant={isSubtitleStyle ? 'subtitle' : 'default'}
        >
          {eyebrowLabel}
        </span>

        {isSubtitleStyle ? (
          <>
            <div className={styles.headerSpacer} />
            <span className={styles.headerMeta}>字幕样式</span>
            <Button.Icon
              variant="ghost"
              aria-label="关闭右侧配置区"
              title="关闭右侧配置区"
              onClick={onClose}
              className={styles.closeButton}
            >
              <AppIcon name="x" size={14} />
            </Button.Icon>
          </>
        ) : (
          <div className={styles.headerRight}>
            {indexLabel ? (
              <span className={styles.indexLabel}>{indexLabel}</span>
            ) : null}
            {selection.type !== 'empty' ? (
              <Button.Icon
                variant="ghost"
                aria-label="关闭右侧配置区"
                title="关闭右侧配置区"
                onClick={onClose}
                className={styles.closeButton}
              >
                <AppIcon name="x" size={14} />
              </Button.Icon>
            ) : null}
          </div>
        )}
      </div>

      <div className={styles.body}>{renderBody()}</div>
    </div>
  );
}
