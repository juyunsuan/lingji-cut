import { AnimatePresence, m } from 'framer-motion';
import { useState } from 'react';
import { MoreHorizontal } from 'lucide-react';
import { toFileSrc } from '../lib/utils';
import { useAIStore } from '../store/ai';
import type { AICard, AICardType, MediaCardContent } from '../types/ai';
import { Badge, Checkbox } from '../ui';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '../ui/components/dropdown-menu';
import { springs } from '../ui/lib/motion';
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
  /** 转换为 image/video 后立即聚焦该卡片到 Inspector；可选 */
  onSelect?: (cardId: string) => void;
}

function getPreviewText(content: AICard['content']): string {
  if (content && typeof content === 'object' && 'mediaType' in content) {
    const media = content as MediaCardContent;
    return media.prompt || (media.mediaType === 'image' ? '图片卡（未填提示词）' : '视频卡（未填提示词）');
  }
  const text = typeof content === 'string' ? content : JSON.stringify(content);
  return text.length > 74 ? `${text.slice(0, 74)}…` : text;
}

function getMediaContent(card: AICard): MediaCardContent | null {
  return card.content && typeof card.content === 'object' && 'mediaType' in card.content
    ? (card.content as MediaCardContent)
    : null;
}

function buildThumbnailSrc(
  card: AICard,
  currentProjectDir: string | null,
): string | null {
  const media = getMediaContent(card);
  if (!media) return null;
  const value =
    media.mediaType === 'video'
      ? (media.posterPath ?? media.assetPath ?? null)
      : media.assetPath;
  if (!value) return null;
  if (value.startsWith('file://') || value.startsWith('http://') || value.startsWith('https://')) {
    return value;
  }
  if (!currentProjectDir) return null;
  const abs = `${currentProjectDir.replace(/\/$/, '')}/${value.replace(/^\//, '')}`;
  return toFileSrc(abs);
}

const CARD_TYPE_META: Record<AICardType, { label: string; color: string; tone: string }> = {
  summary: { label: '摘要', color: '#0A84FF', tone: 'blue' },
  data: { label: '数据', color: '#32D74B', tone: 'green' },
  insight: { label: '观点', color: '#FF9F0A', tone: 'orange' },
  chapter: { label: '章节', color: '#BF5AF2', tone: 'purple' },
  quote: { label: '金句', color: '#FFD60A', tone: 'yellow' },
  motion: { label: '动画', color: '#c084fc', tone: 'purple' },
  image: { label: '图片卡', color: '#32D74B', tone: 'green' },
  video: { label: '视频卡', color: '#FFD60A', tone: 'yellow' },
};

export function AICardList({
  cards,
  onToggleEnabled,
  onEditCard,
  onSelect,
}: AICardListProps) {
  // selector 订阅 currentProjectDir 变更；?? getState() 兼容 SSR
  const currentProjectDir =
    useAIStore((s) => s.currentProjectDir) ?? useAIStore.getState().currentProjectDir;
  const convertCardToMedia = useAIStore((s) => s.convertCardToMedia);
  const [openMenuCardId, setOpenMenuCardId] = useState<string | null>(null);

  const handleConvert = async (
    cardId: string,
    mediaType: 'image' | 'video',
  ): Promise<void> => {
    const next = await convertCardToMedia(cardId, mediaType);
    if (next) {
      onSelect?.(next.id);
    }
  };

  return (
    <div className={styles.list} data-ai-card-list="true">
      <AnimatePresence mode="popLayout" initial={false}>
        {cards.map((card) => {
          const meta = CARD_TYPE_META[card.type];
          const isMedia = card.type === 'image' || card.type === 'video';
          const media = isMedia ? getMediaContent(card) : null;
          const thumbSrc = isMedia ? buildThumbnailSrc(card, currentProjectDir) : null;
          const status = media?.generationStatus ?? 'idle';
          const isGenerating = status === 'generating' || status === 'pending';
          const isFailed = status === 'failed';

          return (
            <m.article
              key={card.id}
              layoutId={`ai-card-${card.id}`}
              className={styles.card}
              data-ai-card-type={card.type}
              data-enabled={card.enabled}
              onClick={() => onEditCard(card.id)}
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 12 }}
              transition={springs.smooth}
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
                  />
                </div>

                {isMedia ? (
                  <div className={styles.thumbnail} data-ai-card-thumbnail={card.type}>
                    {thumbSrc ? (
                      <img src={thumbSrc} alt="" className={styles.thumbnailImg} />
                    ) : (
                      <span className={styles.thumbnailPlaceholder} aria-hidden="true">
                        {card.type === 'image' ? '🖼' : '🎬'}
                      </span>
                    )}
                    {isGenerating ? (
                      <span
                        className={`${styles.statusBadge} ${styles.badgeGenerating}`}
                        data-ai-card-status="generating"
                        aria-label="生成中"
                      />
                    ) : null}
                    {isFailed ? (
                      <span
                        className={`${styles.statusBadge} ${styles.badgeFailed}`}
                        data-ai-card-status="failed"
                        aria-label="生成失败"
                      />
                    ) : null}
                  </div>
                ) : null}

                <Badge
                  size="xs"
                  color={meta.color}
                  className={styles.badge}
                  data-tone={meta.tone}
                >
                  {meta.label}
                </Badge>

                <span className={styles.title}>{card.title}</span>

                <div
                  className={styles.cardActions}
                  onClick={(event) => event.stopPropagation()}
                >
                  <DropdownMenu
                    open={openMenuCardId === card.id}
                    onOpenChange={(open) =>
                      setOpenMenuCardId(open ? card.id : null)
                    }
                  >
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        className={styles.cardMenuTrigger}
                        aria-label={`${card.title} 更多操作`}
                      >
                        <MoreHorizontal size={14} />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" sideOffset={4}>
                      <DropdownMenuItem
                        disabled={card.type === 'image'}
                        onSelect={() => {
                          void handleConvert(card.id, 'image');
                        }}
                      >
                        转为图片卡
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        disabled={card.type === 'video'}
                        onSelect={() => {
                          void handleConvert(card.id, 'video');
                        }}
                      >
                        转为视频卡
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>

              <p className={styles.body} data-ai-card-copy="true">
                {getPreviewText(card.content)}
              </p>
            </m.article>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
