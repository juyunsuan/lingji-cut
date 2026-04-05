import { useEffect, useState } from 'react';
import { Type, Monitor, Clock, Trash2 } from 'lucide-react';
import { getAICardOverlayPosition } from '../lib/ai-card-layout';
import type { AICard, AICardType } from '../types/ai';
import { Button, PillGroup, Input, Textarea, Field, NumberField } from '../ui';
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
  onRegenerate: (updates: Partial<AICard>) => Promise<AICard | null>;
  onSave: (cardId: string, updates: Partial<AICard>) => void;
}

const CARD_TYPES: Array<{ value: AICardType; label: string }> = [
  { value: 'summary', label: '摘要' },
  { value: 'data', label: '数据' },
  { value: 'insight', label: '观点' },
  { value: 'chapter', label: '章节' },
  { value: 'quote', label: '金句' },
];

const DISPLAY_MODES = [
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
      {errorMessage && (
        <span className={styles.errorText}>{errorMessage}</span>
      )}

      {/* Section 1 — 文字内容 */}
      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <Type size={12} className={styles.sectionIcon} />
          <span className={styles.sectionTitle}>文字内容</span>
        </div>

        {/* 卡片类型 */}
        <div className={styles.fieldRow}>
          <span className={styles.fieldLabel}>类型</span>
          <div className={styles.fieldControl}>
            <PillGroup items={CARD_TYPES} value={type} onChange={setType} />
          </div>
        </div>

        {/* 标题 */}
        <div className={styles.fieldRow}>
          <span className={styles.fieldLabel}>标题</span>
          <div className={styles.fieldControl}>
            <Input
              size="sm"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
        </div>

        {/* 内容 */}
        <Field label="内容">
          <Textarea
            size="sm"
            value={content}
            rows={5}
            resize="vertical"
            onChange={(e) => setContent(e.target.value)}
          />
        </Field>

        {/* 追加提示词 */}
        <Field label="追加提示词">
          <Textarea
            size="sm"
            value={cardPrompt}
            rows={3}
            resize="none"
            placeholder="例如：做成更有冲击力的封面海报感，结论更前置"
            onChange={(e) => setCardPrompt(e.target.value)}
          />
        </Field>
      </div>

      {/* Section 2 — 展示设置 */}
      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <Monitor size={12} className={styles.sectionIcon} />
          <span className={styles.sectionTitle}>展示设置</span>
        </div>

        {/* 展示方式 */}
        <div className={styles.fieldRow}>
          <span className={styles.fieldLabel}>方式</span>
          <div className={styles.fieldControl}>
            <PillGroup
              items={DISPLAY_MODES}
              value={displayMode}
              onChange={setDisplayMode}
              fullWidth
            />
          </div>
        </div>

        {/* 展示时长 */}
        <div className={styles.fieldRow}>
          <span className={styles.fieldLabel}>时长</span>
          <div className={styles.fieldControl}>
            <NumberField
              value={displayDurationMs / 1_000}
              min={1}
              step={0.5}
              unit="s"
              onChange={(v) => setDisplayDurationMs(v * 1_000)}
            />
          </div>
        </div>
      </div>

      {/* Section 3 — 网页卡片预览 */}
      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <Clock size={12} className={styles.sectionIcon} />
          <span className={styles.sectionTitle}>网页卡片预览</span>
        </div>

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
              webCard={previewWebCard ?? card.webCard}
              stageWidth={previewWidth}
              stageHeight={previewHeight}
              isLoading={isRegenerating}
              loadingLabel="正在重生成网页卡片..."
            />
          </div>
          <span className={styles.previewModeBadge}>
            {displayMode === 'fullscreen' ? '全屏' : '画中画'}
          </span>
        </div>

        {/* 操作按钮 */}
        <div className={styles.actions}>
          {showCancel && onCancel ? (
            <Button variant="secondary" onClick={onCancel}>
              取消
            </Button>
          ) : null}
          <Button
            variant="secondary"
            onClick={() => {
              void handleRegenerateClick();
            }}
            disabled={isRegenerating}
            loading={isRegenerating}
          >
            {isRegenerating ? '重生成中...' : '重新生成此卡'}
          </Button>
          <Button
            variant="primary"
            onClick={() => {
              onSave(card.id, draftUpdates);
            }}
          >
            保存
          </Button>
        </div>
      </div>

      {/* Section 4 — 危险操作 */}
      <div className={styles.section}>
        <Button
          variant="destructive"
          fullWidth
          leftIcon={<Trash2 size={12} />}
          onClick={() => {
            /* 删除操作由父层通过 onSave 传入后实现，此处预留 */
          }}
        >
          删除此卡片
        </Button>
      </div>
    </div>
  );
}
