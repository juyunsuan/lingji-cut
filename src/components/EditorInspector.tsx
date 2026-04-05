import { X } from 'lucide-react';
import { Button, EmptyState } from '../ui';
import { AICardInspector } from './AICardInspector';
import { SubtitleInspector } from './SubtitleInspector';
import { useAICardInspector } from '../hooks/useAICardInspector';
import styles from './EditorInspector.module.css';

export type InspectorSelection =
  | { type: 'empty' }
  | { type: 'ai-card'; cardId: string }
  | { type: 'subtitle-style' };

interface EditorInspectorProps {
  selection: InspectorSelection;
  timelineWidth: number;
  timelineHeight: number;
  onClose: () => void;
}

export function EditorInspector({
  selection,
  timelineHeight,
  timelineWidth,
  onClose,
}: EditorInspectorProps) {
  const {
    card,
    errorMessage,
    isPlacedOnTimeline,
    isRegeneratingCard,
    regenerateCard,
    saveCard,
  } = useAICardInspector(selection.type === 'ai-card' ? selection.cardId : null);

  /* ── eyebrow pill 内容 ── */
  const eyebrowLabel =
    selection.type === 'subtitle-style'
      ? '字幕块'
      : selection.type === 'ai-card'
      ? 'AI 卡片'
      : '检查器';

  /* ── 右侧索引/状态标签 ── */
  const indexLabel =
    selection.type === 'ai-card' && card
      ? isPlacedOnTimeline
        ? '已上轨'
        : '仅素材'
      : null;

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
          onRegenerate={regenerateCard}
          onSave={saveCard}
        />
      );
    }

    return (
      <div className={styles.emptyWrap}>
        <EmptyState
          title="右侧配置区"
          description="从左侧 AI 内容卡片或底部时间轴中选择一个对象后，这里会显示对应的配置表单。"
        />
      </div>
    );
  };

  return (
    <div
      className={styles.shell}
      data-editor-region="inspector-shell"
    >
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <span className={styles.eyebrowPill}>{eyebrowLabel}</span>
        </div>
        <div className={styles.headerRight}>
          {indexLabel && (
            <span className={styles.indexLabel}>{indexLabel}</span>
          )}
          {selection.type !== 'empty' && (
            <Button.Icon
              variant="ghost"
              aria-label="关闭右侧配置区"
              title="关闭右侧配置区"
              onClick={onClose}
              className={styles.closeBtn}
            >
              <X size={14} />
            </Button.Icon>
          )}
        </div>
      </div>

      {/* Body */}
      <div className={styles.body}>{renderBody()}</div>
    </div>
  );
}
