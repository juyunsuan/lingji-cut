import { X } from 'lucide-react';
import { Button, EmptyState } from '../ui';
import { AICardInspector } from './AICardInspector';
import { SubtitleInspector } from './SubtitleInspector';
import { TextInspector } from './TextInspector';
import { useAICardInspector } from '../hooks/useAICardInspector';
import { useTimelineStore } from '../store/timeline';
import styles from './EditorInspector.module.css';

export type InspectorSelection =
  | { type: 'empty' }
  | { type: 'ai-card'; cardId: string }
  | { type: 'subtitle-style' }
  | { type: 'text-overlay'; overlayId: string };

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
    cardSequenceLabel,
    deleteCard,
    errorMessage,
    isRegeneratingCard,
    regenerateCard,
    saveCard,
  } = useAICardInspector(selection.type === 'ai-card' ? selection.cardId : null);

  /* ── eyebrow pill 内容 ── */
  const eyebrowLabel =
    selection.type === 'subtitle-style'
      ? 'SUBTITLE'
      : selection.type === 'ai-card'
      ? 'AI CARD'
      : selection.type === 'text-overlay'
      ? 'TEXT'
      : 'INSPECTOR';

  /* ── 右侧索引/状态标签 ── */
  const indexLabel = selection.type === 'ai-card' ? cardSequenceLabel : null;
  const isSubtitleStyle = selection.type === 'subtitle-style';

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

    if (selection.type === 'text-overlay') {
      return (
        <TextInspector
          overlayId={selection.overlayId}
          onDelete={() => {
            useTimelineStore.getState().removeOverlay(selection.overlayId);
            onClose();
          }}
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
              <X size={14} />
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
                <X size={14} />
              </Button.Icon>
            ) : null}
          </div>
        )}
      </div>

      <div className={styles.body}>{renderBody()}</div>
    </div>
  );
}
