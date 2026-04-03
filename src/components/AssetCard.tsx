import type { DragEventHandler } from 'react';
import { formatTime } from '../lib/utils';
import type { AssetItem, AssetType } from '../types';
import { Badge, IconButton } from '../ui/primitives';
import { AssetThumbnail } from './AssetThumbnail';

interface AssetCardProps {
  asset: AssetItem;
  compact: boolean;
  usageCount: number;
  onDragStart: DragEventHandler<HTMLDivElement>;
  onRemove: (path: string) => void;
}

const TYPE_META: Record<AssetType, { label: string; accent: string; background: string }> = {
  video: {
    label: '视频',
    accent: '#5ad2ff',
    background: 'rgba(90,210,255,0.16)',
  },
  image: {
    label: '图片',
    accent: '#ffbc5e',
    background: 'rgba(255,188,94,0.16)',
  },
  audio: {
    label: '音频',
    accent: '#5fe0ff',
    background: 'rgba(95,224,255,0.18)',
  },
  srt: {
    label: '字幕',
    accent: '#c7b7ff',
    background: 'rgba(199,183,255,0.18)',
  },
};

function getAssetStatus(asset: AssetItem, usageCount: number): string {
  if (asset.locked) {
    return '默认素材';
  }

  if (usageCount > 0) {
    return `轨道使用 ${usageCount} 次`;
  }

  if (asset.type === 'image' || asset.type === 'video') {
    return '可拖到时间轴';
  }

  return '素材已导入';
}

export function AssetCard({ asset, compact, usageCount, onDragStart, onRemove }: AssetCardProps) {
  const theme = TYPE_META[asset.type];
  const statusText = getAssetStatus(asset, usageCount);
  const isDraggable = !asset.locked && (asset.type === 'image' || asset.type === 'video');

  return (
    <div
      draggable={isDraggable}
      onDragStart={onDragStart}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        minWidth: compact ? 138 : 0,
        width: compact ? 138 : '100%',
        cursor: isDraggable ? 'grab' : 'default',
      }}
    >
      <div
        style={{
          position: 'relative',
          aspectRatio: '16 / 9',
          minHeight: compact ? 76 : 72,
          borderRadius: 16,
          overflow: 'hidden',
          border: '1px solid rgba(255,255,255,0.08)',
          background: '#0b1320',
          boxShadow: '0 16px 28px rgba(0,0,0,0.22)',
        }}
      >
        <AssetThumbnail asset={asset} />
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background:
              'linear-gradient(180deg, rgba(0,0,0,0.48) 0%, rgba(0,0,0,0.1) 42%, rgba(0,0,0,0.22) 100%)',
            pointerEvents: 'none',
          }}
        />
        <div
          style={{
            position: 'absolute',
            top: 8,
            left: 8,
            padding: '3px 8px',
            borderRadius: 999,
            background: 'rgba(0,0,0,0.62)',
            color: '#f7faff',
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '0.03em',
          }}
        >
          已添加
        </div>
        <div
          style={{
            position: 'absolute',
            top: 8,
            right: 8,
            padding: '3px 7px',
            borderRadius: 999,
            background: 'rgba(0,0,0,0.48)',
            color: '#f7faff',
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: '0.02em',
          }}
        >
          {formatTime(asset.durationMs)}
        </div>
      </div>

      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontSize: 12,
            lineHeight: 1.35,
            fontWeight: 600,
            color: '#eef4ff',
            display: '-webkit-box',
            WebkitBoxOrient: 'vertical',
            WebkitLineClamp: compact ? 1 : 2,
            overflow: 'hidden',
            wordBreak: 'break-word',
          }}
        >
          {asset.name}
        </div>
        <div
          style={{
            marginTop: 6,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
          }}
        >
          <Badge
            variant="neutral"
            style={{
              background: theme.background,
              color: theme.accent,
            }}
          >
            {theme.label}
          </Badge>
          {asset.locked ? (
            <span
              style={{
                color: '#93a4bb',
                fontSize: 11,
                whiteSpace: 'nowrap',
              }}
            >
              锁定
            </span>
          ) : (
            <IconButton
              aria-label={`删除 ${asset.name}`}
              onClick={() => onRemove(asset.path)}
              variant="subtle"
              size="sm"
              style={{ lineHeight: 1, flex: '0 0 auto' }}
            >
              ×
            </IconButton>
          )}
        </div>
        <div
          style={{
            marginTop: 6,
            color: '#8593a7',
            fontSize: 11,
            lineHeight: 1.4,
            display: '-webkit-box',
            WebkitBoxOrient: 'vertical',
            WebkitLineClamp: compact ? 1 : 2,
            overflow: 'hidden',
          }}
        >
          {statusText}
        </div>
      </div>
    </div>
  );
}
