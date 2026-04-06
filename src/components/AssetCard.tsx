import type { DragEventHandler } from 'react';
import { Film, ImageIcon, Music, FileText, Type, Play, Plus } from 'lucide-react';
import type { AssetItem, AssetType } from '../types';
import { useThumbnail } from '../hooks/useThumbnail';
import { Button } from '../ui';
import styles from './AssetCard.module.css';

interface AssetCardProps {
  asset: AssetItem;
  compact: boolean;
  usageCount: number;
  onDragStart: DragEventHandler<HTMLDivElement>;
  onRemove: (path: string) => void;
  onClick?: () => void;
}

/** 每种类型的视觉配置 */
const TYPE_META: Record<
  AssetType,
  { Icon: React.ElementType; iconColor: string; className: string }
> = {
  video: {
    Icon: Film,
    iconColor: 'color-mix(in srgb, var(--color-selection-blue-hover) 75%, transparent)',
    className: styles.typeVideo,
  },
  image: {
    Icon: ImageIcon,
    iconColor: 'color-mix(in srgb, var(--color-success) 75%, transparent)',
    className: styles.typeImage,
  },
  audio: {
    Icon: Music,
    iconColor: 'color-mix(in srgb, var(--color-brand-warm) 75%, transparent)',
    className: styles.typeAudio,
  },
  srt: {
    Icon: FileText,
    iconColor: 'color-mix(in srgb, #B48CFF 75%, transparent)',
    className: styles.typeSrt,
  },
  text: {
    Icon: Type,
    iconColor: 'color-mix(in srgb, #10b981 75%, transparent)',
    className: styles.typeText,
  },
};

/** Ghost 导入卡片 — 放在网格末尾 */
export function AssetImportCard({ onClick }: { onClick: () => void }) {
  return (
    <Button
      variant="ghost"
      className={[styles.root, styles.ghost].join(' ')}
      onClick={onClick}
      aria-label="导入素材"
    >
      <Plus size={18} color="var(--color-text-muted)" strokeWidth={1.5} />
      <span className={styles.ghostLabel}>导入</span>
    </Button>
  );
}

export function AssetCard({ asset, compact, usageCount: _usageCount, onDragStart, onRemove: _onRemove, onClick }: AssetCardProps) {
  const meta = TYPE_META[asset.type];
  const isDraggable = !asset.locked && (asset.type === 'image' || asset.type === 'video' || asset.type === 'text');
  const thumbnail = useThumbnail(asset.path, asset.type);

  return (
    <div
      draggable={isDraggable}
      onDragStart={onDragStart}
      onClick={onClick}
      className={[
        styles.root,
        compact ? styles.compact : styles.regular,
        isDraggable ? styles.draggable : '',
        onClick ? styles.clickable : '',
        thumbnail ? styles.hasThumbnail : meta.className,
      ].filter(Boolean).join(' ')}
    >
      {/* 顶部预览区 */}
      <div className={styles.iconArea}>
        {thumbnail ? (
          <>
            <img src={thumbnail} alt={asset.name} className={styles.thumbnail} draggable={false} />
            {asset.type === 'video' && (
              <div className={styles.playBadge}>
                <Play size={10} fill="white" color="white" strokeWidth={0} />
              </div>
            )}
          </>
        ) : (
          <meta.Icon size={20} color={meta.iconColor} strokeWidth={1.5} />
        )}
      </div>

      {/* 底部文件名 */}
      <div className={styles.nameArea}>
        <span className={styles.name} title={asset.name}>
          {asset.name}
        </span>
      </div>
    </div>
  );
}
