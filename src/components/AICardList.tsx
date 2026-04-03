import { AppIcon, type AppIconName } from './AppIcon';
import { formatTime } from '../lib/utils';
import type { AICard, AICardType } from '../types/ai';
import { Badge, Button, IconButton } from '../ui/primitives';

export interface AICardPlacement {
  trackId: string;
  trackLabel: string;
}

interface AICardListProps {
  cards: AICard[];
  placements?: Record<string, AICardPlacement>;
  onToggleEnabled: (cardId: string) => void;
  onDeleteCard: (cardId: string) => void;
  onEditCard: (cardId: string) => void;
}

const CARD_TYPE_META: Record<AICardType, { label: string; color: string; icon: AppIconName }> = {
  summary: { label: '摘要', color: '#6366f1', icon: 'file-text' },
  data: { label: '数据', color: '#10b981', icon: 'chart-column' },
  insight: { label: '观点', color: '#f59e0b', icon: 'lightbulb' },
  chapter: { label: '章节', color: '#8b5cf6', icon: 'book-open-text' },
  quote: { label: '金句', color: '#ec4899', icon: 'quote' },
};

export function AICardList({
  cards,
  placements = {},
  onToggleEnabled,
  onDeleteCard,
  onEditCard,
}: AICardListProps) {
  return (
    <div style={listStyle}>
      {cards.map((card) => {
        const meta = CARD_TYPE_META[card.type];
        const placement = placements[card.id];
        const placementText = placement ? `已在${placement.trackLabel}` : '未上轨';
        return (
          <div
            key={card.id}
            onClick={() => onEditCard(card.id)}
            style={{
              ...cardStyle,
              borderLeft: `3px solid ${meta.color}`,
              boxShadow: card.enabled ? '0 0 0 1px rgba(99,102,241,0.4)' : 'none',
              opacity: card.enabled ? 1 : 0.58,
            }}
          >
            <div style={cardRowStyle}>
              <div style={{ ...cardTypeBadgeStyle, color: meta.color }} title={meta.label}>
                <AppIcon name={meta.icon} size={14} />
              </div>
              <div style={cardContentStyle}>
                <div style={cardHeaderStyle}>
                  <IconButton
                    aria-label={card.enabled ? `取消选择卡片 ${card.title}` : `选择卡片 ${card.title}`}
                    title={card.enabled ? '已选' : '未选'}
                    onClick={(event) => {
                      event.stopPropagation();
                      onToggleEnabled(card.id);
                    }}
                    variant={card.enabled ? 'brand' : 'ghost'}
                    size="sm"
                    style={{ color: card.enabled ? '#22c55e' : '#64748b' }}
                  >
                    <AppIcon name={card.enabled ? 'circle-check-big' : 'circle'} size={15} />
                  </IconButton>
                  <div style={cardTitleStyle}>{card.title}</div>
                </div>
                <div style={cardMetaStyle}>
                  {formatTime(card.startMs)} - {formatTime(card.endMs)}
                </div>
                <div style={cardPlacementStyle}>
                  <Badge variant={placement ? 'info' : 'neutral'}>{placementText}</Badge>
                </div>
              </div>
              <Button
                aria-label={`删除卡片 ${card.title}`}
                title="删除卡片"
                onClick={(event) => {
                  event.stopPropagation();
                  onDeleteCard(card.id);
                }}
                variant="danger"
                size="sm"
              >
                删除
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

const listStyle = {
  display: 'flex',
  flexDirection: 'column' as const,
  gap: 8,
};

const cardStyle = {
  background: 'rgba(255,255,255,0.04)',
  padding: '8px 10px',
  borderRadius: 10,
  cursor: 'pointer',
};

const cardRowStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
};

const cardTypeBadgeStyle = {
  width: 24,
  height: 24,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: 8,
  background: 'rgba(255,255,255,0.06)',
  flexShrink: 0,
};

const cardContentStyle = {
  flex: 1,
  minWidth: 0,
};

const cardHeaderStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  minWidth: 0,
};

const cardTitleStyle = {
  color: '#f4f7fb',
  fontSize: 12,
  fontWeight: 600,
  lineHeight: 1.3,
  whiteSpace: 'nowrap' as const,
  overflow: 'hidden',
  textOverflow: 'ellipsis' as const,
};

const cardMetaStyle = {
  marginTop: 3,
  color: '#64748b',
  fontSize: 10,
  letterSpacing: '0.01em',
};

const cardPlacementStyle = {
  marginTop: 4,
  fontSize: 10,
  fontWeight: 600,
  letterSpacing: '0.01em',
};
