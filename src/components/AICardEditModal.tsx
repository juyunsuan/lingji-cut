import { useEffect, useState } from 'react';
import type { AICard, AICardType } from '../types/ai';
import { getAICardOverlayPosition } from '../lib/ai-card-layout';
import { Button, Field, Input, ModalShell, Textarea } from '../ui/primitives';
import { WebCardPreview } from './WebCardPreview';

interface AICardEditModalProps {
  visible: boolean;
  card: AICard | null;
  isRegenerating?: boolean;
  previewWidth?: number;
  previewHeight?: number;
  onClose: () => void;
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

export function AICardEditModal({
  visible,
  card,
  isRegenerating = false,
  previewWidth = 1_920,
  previewHeight = 1_080,
  onClose,
  onRegenerate,
  onSave,
}: AICardEditModalProps) {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [cardPrompt, setCardPrompt] = useState('');
  const [type, setType] = useState<AICardType>('summary');
  const [displayMode, setDisplayMode] = useState<'fullscreen' | 'pip'>('fullscreen');
  const [displayDurationMs, setDisplayDurationMs] = useState(5_000);
  const [previewWebCard, setPreviewWebCard] = useState<AICard['webCard']>();

  useEffect(() => {
    if (!visible || !card) {
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
  }, [card, visible]);

  if (!visible || !card) {
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
      ? previewFullscreenFrameStyle
      : {
          ...previewPipFrameStyle,
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
    <ModalShell
      visible={visible}
      eyebrow="EDIT CARD"
      title="编辑卡片"
      size="lg"
      zIndex={160}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            取消
          </Button>
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
            size="lg"
            onClick={() => {
              onSave(card.id, draftUpdates);
              onClose();
            }}
          >
            保存
          </Button>
        </>
      }
    >
      <div style={formStyle}>
        <Field label="卡片类型">
          <div style={pillRowStyle}>
            {CARD_TYPES.map((item) => (
              <Button
                key={item.value}
                onClick={() => setType(item.value)}
                variant={type === item.value ? 'primary' : 'secondary'}
                size="sm"
              >
                {item.label}
              </Button>
            ))}
          </div>
        </Field>

        <Field label="标题">
          <Input value={title} onChange={(event) => setTitle(event.target.value)} />
        </Field>

        <Field label="内容">
          <Textarea value={content} onChange={(event) => setContent(event.target.value)} rows={5} />
        </Field>

        <Field label="单卡追加提示词">
          <Textarea
            value={cardPrompt}
            onChange={(event) => setCardPrompt(event.target.value)}
            rows={3}
            placeholder="例如：做成更有冲击力的封面海报感，结论更前置"
          />
        </Field>

        <Field label="网页卡片预览">
          <div
            style={{
              ...previewStageStyle,
              aspectRatio: `${Math.max(1, previewWidth)} / ${Math.max(1, previewHeight)}`,
            }}
          >
            <div style={previewCanvasStyle} />
            <div style={previewFrameStyle}>
              <WebCardPreview
                webCard={previewWebCard ?? card.webCard}
                stageWidth={previewWidth}
                stageHeight={previewHeight}
                isLoading={isRegenerating}
                loadingLabel="正在重生成网页卡片..."
              />
            </div>
            <span style={previewModeBadgeStyle}>
              {displayMode === 'fullscreen' ? '全屏位置预览' : '画中画位置预览'}
            </span>
          </div>
        </Field>

        <div style={twoColumnStyle}>
          <Field label="展示时长（秒）">
            <Input
              type="number"
              min={1}
              max={30}
              value={displayDurationMs / 1_000}
              onChange={(event) =>
                setDisplayDurationMs(Math.max(1, Number(event.target.value) || 1) * 1_000)
              }
            />
          </Field>

          <Field label="展示方式">
            <div style={pillRowStyle}>
              {DISPLAY_MODES.map((item) => (
                <Button
                  key={item.value}
                  onClick={() => setDisplayMode(item.value)}
                  variant={displayMode === item.value ? 'primary' : 'secondary'}
                  size="sm"
                  style={{ flex: 1 }}
                >
                  {item.label}
                </Button>
              ))}
            </div>
          </Field>
        </div>
      </div>
    </ModalShell>
  );
}

const formStyle = {
  display: 'flex',
  flexDirection: 'column' as const,
  gap: 16,
};

const pillRowStyle = {
  display: 'flex',
  gap: 6,
  flexWrap: 'wrap' as const,
};

const twoColumnStyle = {
  display: 'flex',
  gap: 16,
};

const previewStageStyle = {
  position: 'relative' as const,
  overflow: 'hidden' as const,
  borderRadius: 18,
  border: '1px solid rgba(255,255,255,0.08)',
  background:
    'linear-gradient(180deg, rgba(15,23,42,0.98) 0%, rgba(8,12,20,0.94) 100%)',
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)',
};

const previewCanvasStyle = {
  position: 'absolute' as const,
  inset: 0,
  background:
    'radial-gradient(circle at top, rgba(99,102,241,0.14) 0%, rgba(15,23,42,0) 46%), linear-gradient(180deg, rgba(148,163,184,0.04) 0%, rgba(15,23,42,0) 100%)',
};

const previewFullscreenFrameStyle = {
  position: 'absolute' as const,
  inset: 0,
};

const previewPipFrameStyle = {
  position: 'absolute' as const,
};

const previewModeBadgeStyle = {
  position: 'absolute' as const,
  left: 12,
  top: 12,
  display: 'inline-flex',
  alignItems: 'center',
  padding: '6px 10px',
  borderRadius: 999,
  border: '1px solid rgba(255,255,255,0.08)',
  background: 'rgba(2,6,23,0.68)',
  color: '#cbd5e1',
  fontSize: 12,
  fontWeight: 600,
  letterSpacing: '0.02em',
};
