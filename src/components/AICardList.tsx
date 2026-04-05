import type { CSSProperties } from 'react';
import { Trash2 } from 'lucide-react';
import { formatTime } from '../lib/utils';
import type { AICard, AICardType } from '../types/ai';
import { Badge, Button, Card } from '../ui';
import { AppIcon, type AppIconName } from './AppIcon';
import styles from './AICardList.module.css';

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
  summary: { label: '摘要', color: 'var(--color-selection-blue)', icon: 'file-text' },
  data: { label: '数据', color: 'var(--color-success)', icon: 'chart-column' },
  insight: { label: '观点', color: 'var(--color-warning)', icon: 'lightbulb' },
  chapter: { label: '章节', color: 'var(--color-brand-accent)', icon: 'book-open-text' },
  quote: { label: '金句', color: 'var(--color-danger)', icon: 'quote' },
};

export function AICardList({
  cards,
  placements = {},
  onToggleEnabled,
  onDeleteCard,
  onEditCard,
}: AICardListProps) {
  return (
    <div className={styles.list}>
      {cards.map((card) => {
        const meta = CARD_TYPE_META[card.type];
        const placement = placements[card.id];
        const placementText = placement ? `已在${placement.trackLabel}` : '未上轨';

        return (
          <Card
            key={card.id}
            onClick={() => onEditCard(card.id)}
            className={styles.card}
            data-enabled={card.enabled}
            style={createCardAccentStyle(meta.color)}
          >
            <div className={styles.cardRow}>
              <div className={styles.iconChip} title={meta.label}>
                <AppIcon name={meta.icon} size={14} />
              </div>

              <div className={styles.content}>
                <div className={styles.header}>
                  <Button
                    aria-label={card.enabled ? `取消选择卡片 ${card.title}` : `选择卡片 ${card.title}`}
                    title={card.enabled ? '已选' : '未选'}
                    onClick={(event) => {
                      event.stopPropagation();
                      onToggleEnabled(card.id);
                    }}
                    variant={card.enabled ? 'accent' : 'ghost'}
                    iconOnly
                    className={styles.toggleButton}
                    data-enabled={card.enabled}
                  >
                    <AppIcon name={card.enabled ? 'circle-check-big' : 'circle'} size={15} />
                  </Button>
                  <div className={styles.title}>{card.title}</div>
                </div>

                <div className={styles.meta}>
                  {formatTime(card.startMs)} - {formatTime(card.endMs)}
                </div>
                <div className={styles.placement}>
                  <Badge variant={placement ? 'info' : 'secondary'}>{placementText}</Badge>
                </div>
              </div>

              <Button
                aria-label={`删除卡片 ${card.title}`}
                title="删除卡片"
                onClick={(event) => {
                  event.stopPropagation();
                  onDeleteCard(card.id);
                }}
                variant="ghost"
                iconOnly
                className={styles.deleteButton}
              >
                <Trash2 size={13} />
              </Button>
            </div>
          </Card>
        );
      })}
    </div>
  );
}

function createCardAccentStyle(color: string): CSSProperties {
  return {
    ['--card-accent' as string]: color,
  };
}
