import { useEffect, useState } from 'react';
import { Eye, RefreshCw, Save, Trash2 } from 'lucide-react';
import { getAICardOverlayPosition } from '../lib/ai-card-layout';
import type { AICard, AICardType } from '../types/ai';
import { Button, Input, NumberField, PillGroup, type PillGroupItem, Textarea } from '../ui';
import { WebCardPreview } from './WebCardPreview';
import styles from './AICardInspector.module.css';

interface AICardInspectorProps {
  card: AICard | null;
  errorMessage?: string | null;
  isRegenerating?: boolean;
  previewWidth?: number;
  previewHeight?: number;
  showCancel?: boolean;
  onCancel?: () => void;
  onDelete?: () => void;
  onRegenerate: (updates: Partial<AICard>) => Promise<AICard | null>;
  onSave: (cardId: string, updates: Partial<AICard>) => void;
}

const CARD_TYPES: Array<PillGroupItem<AICardType>> = [
  { value: 'summary', label: '摘要' },
  { value: 'data', label: '数据' },
  { value: 'insight', label: '观点' },
  { value: 'chapter', label: '章节' },
  { value: 'quote', label: '金句' },
];

const DISPLAY_MODES: Array<PillGroupItem<'fullscreen' | 'pip'>> = [
  { value: 'fullscreen' as const, label: '全屏' },
  { value: 'pip' as const, label: '画中画' },
];

export function AICardInspector({
  card,
  errorMessage = null,
  isRegenerating = false,
  previewWidth = 1_920,
  previewHeight = 1_080,
  showCancel = false,
  onCancel,
  onDelete,
  onRegenerate,
  onSave,
}: AICardInspectorProps) {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [cardPrompt, setCardPrompt] = useState('');
  const [type, setType] = useState<AICardType>('summary');
  const [displayMode, setDisplayMode] = useState<'fullscreen' | 'pip'>('fullscreen');
  const [displayDurationMs, setDisplayDurationMs] = useState(5_000);
  const [previewWebCard, setPreviewWebCard] = useState<AICard['webCard']>();

  useEffect(() => {
    if (!card) {
      return;
    }

    setTitle(card.title);
    setContent(
      typeof card.content === 'string' ? card.content : JSON.stringify(card.content, null, 2),
    );
    setCardPrompt(card.cardPrompt ?? '');
    setType(card.type);
    setDisplayMode(card.displayMode);
    setDisplayDurationMs(card.displayDurationMs);
    setPreviewWebCard(card.webCard);
  }, [card]);

  if (!card) {
    return null;
  }

  const parsedContent =
    type === 'data'
      ? (() => {
          try {
            return JSON.parse(content);
          } catch {
            return card.content;
          }
        })()
      : content;

  const draftUpdates: Partial<AICard> = {
    title,
    content: parsedContent,
    type,
    displayMode,
    displayDurationMs,
    cardPrompt: cardPrompt.trim() || undefined,
    template: `${type}-default`,
  };

  const effectiveWebCard = previewWebCard ?? card.webCard;
  const hasPreview = Boolean(effectiveWebCard?.src || effectiveWebCard?.srcDoc);
  const previewCardPosition = getAICardOverlayPosition(displayMode, previewWidth, previewHeight);
  const previewFrameStyle =
    displayMode === 'fullscreen'
      ? undefined
      : {
          left: `${(previewCardPosition.x / Math.max(1, previewWidth)) * 100}%`,
          top: `${(previewCardPosition.y / Math.max(1, previewHeight)) * 100}%`,
          width: `${(previewCardPosition.width / Math.max(1, previewWidth)) * 100}%`,
        };

  const handleRegenerateClick = async () => {
    if (previewWebCard) {
      setPreviewWebCard({
        ...previewWebCard,
        runtimeStatus: 'loading',
      });
    }

    const regeneratedCard = await onRegenerate(draftUpdates);
    if (regeneratedCard?.webCard) {
      setPreviewWebCard(regeneratedCard.webCard);
      return;
    }

    setPreviewWebCard(card.webCard);
  };

  return (
    <div className={styles.root}>
      {errorMessage ? <span className={styles.errorText}>{errorMessage}</span> : null}

      <div className={styles.section} data-ai-card-section="text-content">
        <span className={styles.sectionTitle}>文字内容</span>

        <PillGroup
          items={CARD_TYPES}
          value={type}
          onChange={setType}
          size="sm"
          className={styles.pillRow}
          itemClassName={styles.pillItem}
        />

        <label className={styles.fieldStack}>
          <span className={styles.fieldLabel}>标题</span>
          <Input
            size="sm"
            value={title}
            className={styles.textInput}
            onChange={(event) => setTitle(event.target.value)}
          />
        </label>

        <label className={styles.fieldStack}>
          <span className={styles.fieldLabel}>内容</span>
          <Textarea
            size="sm"
            value={content}
            rows={5}
            resize="none"
            className={styles.textArea}
            onChange={(event) => setContent(event.target.value)}
          />
        </label>

        <label className={styles.fieldStack}>
          <span className={styles.fieldLabel}>追加提示词</span>
          <Textarea
            size="sm"
            value={cardPrompt}
            rows={3}
            resize="none"
            className={styles.promptArea}
            placeholder="输入额外的生成指导…"
            onChange={(event) => setCardPrompt(event.target.value)}
          />
        </label>
      </div>

      <div className={styles.section} data-ai-card-section="display-settings">
        <span className={styles.sectionTitle}>展示设置</span>

        <PillGroup
          items={DISPLAY_MODES}
          value={displayMode}
          onChange={setDisplayMode}
          size="sm"
          className={styles.pillRow}
          itemClassName={styles.pillItem}
        />

        <div className={styles.inlineFieldRow}>
          <span className={styles.fieldLabel}>时长</span>
          <span className={styles.inlineSpacer} />
          <NumberField
            value={displayDurationMs / 1_000}
            min={1}
            step={0.5}
            unit="秒"
            className={styles.durationField}
            onChange={(value) => setDisplayDurationMs(value * 1_000)}
          />
        </div>
      </div>

      <div className={styles.section} data-ai-card-section="preview">
        <span className={styles.sectionTitle}>网页卡片预览</span>

        <div className={styles.previewFrameShell} data-ai-card-preview-frame="true">
          {hasPreview ? (
            <div
              className={styles.previewStage}
              style={{ aspectRatio: `${Math.max(1, previewWidth)} / ${Math.max(1, previewHeight)}` }}
            >
              <div className={styles.previewCanvas} />
              <div
                className={[
                  styles.previewFrame,
                  displayMode === 'fullscreen'
                    ? styles.previewFrameFullscreen
                    : styles.previewFramePip,
                ].join(' ')}
                style={previewFrameStyle}
              >
                <WebCardPreview
                  webCard={effectiveWebCard}
                  stageWidth={previewWidth}
                  stageHeight={previewHeight}
                  preserveAspectRatio={false}
                  className={styles.previewCardSurface}
                  isLoading={isRegenerating}
                  loadingLabel="正在重生成网页卡片..."
                />
              </div>
            </div>
          ) : (
            <div className={styles.previewPlaceholder}>
              <Eye size={20} className={styles.previewIcon} />
              <span className={styles.previewHint}>卡片预览区</span>
              <span className={styles.previewBadge}>
                {displayMode === 'fullscreen' ? '全屏模式' : '画中画模式'}
              </span>
            </div>
          )}
        </div>

        <div className={styles.actions}>
          {showCancel && onCancel ? (
            <Button variant="secondary" size="sm" className={styles.secondaryAction} onClick={onCancel}>
              取消
            </Button>
          ) : null}

          <Button
            variant="secondary"
            size="sm"
            className={styles.secondaryAction}
            leftIcon={<RefreshCw size={12} className={isRegenerating ? styles.spin : undefined} />}
            onClick={() => {
              void handleRegenerateClick();
            }}
            disabled={isRegenerating}
          >
            {isRegenerating ? '重生成中...' : '重新生成'}
          </Button>

          <Button
            variant="primary"
            size="sm"
            className={styles.primaryAction}
            leftIcon={<Save size={12} />}
            onClick={() => {
              onSave(card.id, draftUpdates);
            }}
          >
            保存
          </Button>
        </div>
      </div>

      <div className={styles.section} data-ai-card-section="danger">
        <span className={styles.dangerTitle}>危险操作</span>
        <Button
          variant="destructive"
          size="sm"
          className={styles.dangerButton}
          leftIcon={<Trash2 size={13} />}
          onClick={() => onDelete?.()}
        >
          删除此卡片
        </Button>
      </div>
    </div>
  );
}
