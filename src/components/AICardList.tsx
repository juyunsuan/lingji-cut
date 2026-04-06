import type { AICard, AICardType } from '../types/ai';
import { Badge, Checkbox } from '../ui';
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

function getPreviewText(content: AICard['content']): string {
  const text = typeof content === 'string' ? content : JSON.stringify(content);
  return text.length > 74 ? `${text.slice(0, 74)}…` : text;
}

const CARD_TYPE_META: Record<AICardType, { label: string; color: string; tone: string }> = {
  summary: { label: '摘要', color: '#0A84FF', tone: 'blue' },
  data: { label: '数据', color: '#32D74B', tone: 'green' },
  insight: { label: '观点', color: '#FF9F0A', tone: 'orange' },
  chapter: { label: '章节', color: '#BF5AF2', tone: 'purple' },
  quote: { label: '金句', color: '#FFD60A', tone: 'yellow' },
};

export function AICardList({
  cards,
  onToggleEnabled,
  onEditCard,
}: AICardListProps) {
  return (
    <div className={styles.list} data-ai-card-list="true">
      {cards.map((card) => {
        const meta = CARD_TYPE_META[card.type];

        return (
          <article
            key={card.id}
            className={styles.card}
            data-ai-card-type={card.type}
            data-enabled={card.enabled}
            onClick={() => onEditCard(card.id)}
          >
            <div className={styles.cardHead}>
              <div
                className={styles.checkbox}
                onClick={(event) => event.stopPropagation()}
              >
                <Checkbox
                  checked={card.enabled}
                  onChange={() => onToggleEnabled(card.id)}
                  aria-label={`切换 ${card.title} 是否上轨`}
                  size="sm"
                  className={styles.checkboxControl}
                  boxClassName={styles.checkboxVisual}
                />
              </div>

              <Badge
                size="xs"
                color={meta.color}
                className={styles.badge}
                data-tone={meta.tone}
              >
                {meta.label}
              </Badge>

              <span className={styles.title}>{card.title}</span>
            </div>

            <p className={styles.body} data-ai-card-copy="true">
              {getPreviewText(card.content)}
            </p>
          </article>
        );
      })}
    </div>
  );
}
