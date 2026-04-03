import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { AICard, AICardType } from '../types/ai';
import { WebCardPreview } from './WebCardPreview';
import { getAICardOverlayPosition } from '../lib/ai-card-layout';

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

  const modalContent = (
    <div style={overlayStyle}>
      <div style={modalStyle}>
        <div style={eyebrowStyle}>EDIT CARD</div>
        <h3 style={titleStyle}>编辑卡片</h3>

        <div style={formStyle}>
          <div>
            <div style={fieldLabelStyle}>卡片类型</div>
            <div style={pillRowStyle}>
              {CARD_TYPES.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => setType(item.value)}
                  style={{
                    ...pillButtonStyle,
                    background: type === item.value ? '#6366f1' : 'rgba(255,255,255,0.06)',
                    color: type === item.value ? '#fff' : '#94a3b8',
                  }}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div style={fieldLabelStyle}>标题</div>
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              style={inputStyle}
            />
          </div>

          <div>
            <div style={fieldLabelStyle}>内容</div>
            <textarea
              value={content}
              onChange={(event) => setContent(event.target.value)}
              rows={5}
              style={textareaStyle}
            />
          </div>

          <div>
            <div style={fieldLabelStyle}>单卡追加提示词</div>
            <textarea
              value={cardPrompt}
              onChange={(event) => setCardPrompt(event.target.value)}
              rows={3}
              placeholder="例如：做成更有冲击力的封面海报感，结论更前置"
              style={textareaStyle}
            />
          </div>

          <div>
            <div style={fieldLabelStyle}>网页卡片预览</div>
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
          </div>

          <div style={twoColumnStyle}>
            <div>
              <div style={fieldLabelStyle}>展示时长（秒）</div>
              <input
                type="number"
                min={1}
                max={30}
                value={displayDurationMs / 1_000}
                onChange={(event) =>
                  setDisplayDurationMs(Math.max(1, Number(event.target.value) || 1) * 1_000)
                }
                style={inputStyle}
              />
            </div>
            <div>
              <div style={fieldLabelStyle}>展示方式</div>
              <div style={pillRowStyle}>
                {DISPLAY_MODES.map((item) => (
                  <button
                    key={item.value}
                    type="button"
                    onClick={() => setDisplayMode(item.value)}
                    style={{
                      ...pillButtonStyle,
                      flex: 1,
                      background:
                        displayMode === item.value ? '#6366f1' : 'rgba(255,255,255,0.06)',
                      color: displayMode === item.value ? '#fff' : '#94a3b8',
                    }}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div style={actionsStyle}>
          <button type="button" onClick={onClose} style={secondaryButtonStyle}>
            取消
          </button>
          <button
            type="button"
            onClick={() => {
              void handleRegenerateClick();
            }}
            disabled={isRegenerating}
            style={{
              ...secondaryButtonStyle,
              opacity: isRegenerating ? 0.6 : 1,
              cursor: isRegenerating ? 'wait' : 'pointer',
            }}
          >
            {isRegenerating ? '重生成中...' : '重新生成此卡'}
          </button>
          <button
            type="button"
            onClick={() => {
              onSave(card.id, draftUpdates);
              onClose();
            }}
            style={primaryButtonStyle}
          >
            保存
          </button>
        </div>
      </div>
    </div>
  );

  if (typeof document === 'undefined' || !document.body) {
    return modalContent;
  }

  return createPortal(modalContent, document.body);
}

const overlayStyle = {
  position: 'fixed' as const,
  inset: 0,
  background: 'rgba(0,0,0,0.68)',
  display: 'grid',
  placeItems: 'center',
  zIndex: 160,
  padding: 20,
};

const modalStyle = {
  width: 'min(760px, calc(100vw - 40px))',
  maxHeight: '88vh',
  overflowY: 'auto' as const,
  borderRadius: 26,
  border: '1px solid rgba(255,255,255,0.08)',
  background: '#0b1220',
  padding: 28,
  boxSizing: 'border-box' as const,
};

const eyebrowStyle = {
  fontSize: 12,
  letterSpacing: '0.16em',
  color: '#91a2bc',
};

const titleStyle = {
  margin: '10px 0 20px',
  fontSize: 22,
};

const formStyle = {
  display: 'flex',
  flexDirection: 'column' as const,
  gap: 16,
};

const fieldLabelStyle = {
  fontSize: 12,
  color: '#91a2bc',
  marginBottom: 8,
};

const pillRowStyle = {
  display: 'flex',
  gap: 6,
  flexWrap: 'wrap' as const,
};

const pillButtonStyle = {
  padding: '8px 12px',
  borderRadius: 12,
  border: 'none',
  cursor: 'pointer',
  fontSize: 12,
};

const inputStyle = {
  width: '100%',
  height: 42,
  padding: '0 12px',
  borderRadius: 12,
  border: '1px solid rgba(255,255,255,0.08)',
  background: 'rgba(255,255,255,0.03)',
  color: '#f5f7fb',
  fontSize: 13,
  boxSizing: 'border-box' as const,
  outline: 'none',
};

const textareaStyle = {
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

const actionsStyle = {
  display: 'flex',
  justifyContent: 'flex-end',
  gap: 12,
  marginTop: 24,
};

const secondaryButtonStyle = {
  height: 44,
  padding: '0 18px',
  borderRadius: 14,
  border: '1px solid rgba(255,255,255,0.1)',
  background: 'rgba(255,255,255,0.04)',
  color: '#f5f7fb',
  fontWeight: 700,
  cursor: 'pointer',
};

const primaryButtonStyle = {
  height: 44,
  padding: '0 20px',
  borderRadius: 14,
  border: 'none',
  background: 'linear-gradient(90deg, #6366f1, #8b5cf6)',
  color: '#fff',
  fontSize: 14,
  fontWeight: 800,
  cursor: 'pointer',
};
