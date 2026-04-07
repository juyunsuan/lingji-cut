import type { MouseEvent as ReactMouseEvent } from 'react';
import { Clipboard, Copy } from 'lucide-react';
import { getOverlayMoveDraft, type TrackDragZone } from '../lib/overlay-drag';
import type { OverlayItem } from '../types';
import { clamp, getFileNameFromPath } from '../lib/utils';
import { useTimelineStore } from '../store/timeline';
import { ContextMenu } from '../ui';
import { AppIcon } from './AppIcon';
import { AssetThumbnail } from './AssetThumbnail';
import styles from './OverlayBlock.module.css';

interface OverlayBlockProps {
  overlay: OverlayItem;
  pxPerMs: number;
  trackHeight?: number;
  selected?: boolean;
  getTrackDragZones?: () => TrackDragZone[];
  onTrackHoverChange?: (trackId: string | null) => void;
  onSelect?: () => void;
  onContextMenu?: (event: ReactMouseEvent<HTMLDivElement>) => void;
}

export function OverlayBlock({
  overlay,
  pxPerMs,
  trackHeight = 48,
  selected = false,
  getTrackDragZones,
  onTrackHoverChange,
  onSelect,
  onContextMenu,
}: OverlayBlockProps) {
  const {
    assets,
    copyOverlay,
    cutOverlay,
    overlayClipboard,
    pasteOverlay,
    removeOverlay,
    timeline,
    updateOverlay,
  } = useTimelineStore();
  const asset = assets.find((item) => item.path === overlay.assetPath);
  const isAICard = overlay.overlayType === 'ai-card';
  const isDefaultBackground = overlay.overlayRole === 'default-background';
  const isTextOverlay = overlay.type === 'text';
  const color = isDefaultBackground
    ? 'var(--color-brand-accent)'
    : isAICard
    ? overlay.aiCardData?.style.primaryColor ?? 'var(--color-brand-accent)'
    : isTextOverlay
    ? '#10b981'
    : overlay.type === 'video'
      ? 'var(--color-selection-blue-hover)'
      : 'var(--color-brand-warm)';
  const colorGlow = isDefaultBackground
    ? 'color-mix(in srgb, var(--color-brand-accent) 22%, transparent)'
    : isAICard
    ? 'color-mix(in srgb, var(--color-brand-accent) 24%, transparent)'
    : isTextOverlay
    ? 'color-mix(in srgb, #10b981 22%, transparent)'
    : overlay.type === 'video'
      ? 'color-mix(in srgb, var(--color-selection-blue-hover) 24%, transparent)'
      : 'color-mix(in srgb, var(--color-brand-warm) 22%, transparent)';
  const left = overlay.startMs * pxPerMs;
  const width = Math.max(24, overlay.durationMs * pxPerMs);
  const thumbnailWidth = Math.max(0, Math.min(38, width - 26));
  const blockHeight = Math.max(24, trackHeight - 6);
  const showImageThumbnail =
    !isAICard && !isTextOverlay && overlay.type === 'image' && Boolean(asset) && thumbnailWidth >= 24;
  const projectDuration = timeline.podcast.durationMs || overlay.durationMs;
  const maxDurationForAsset =
    overlay.type === 'video' ? asset?.durationMs ?? overlay.durationMs : Number.POSITIVE_INFINITY;
  const label = isDefaultBackground
    ? `默认背景 · ${getFileNameFromPath(overlay.assetPath)}`
    : isAICard
      ? overlay.aiCardData?.title ?? 'AI 卡片'
      : isTextOverlay
        ? overlay.textData?.content?.slice(0, 20) ?? '文字'
        : getFileNameFromPath(overlay.assetPath);
  const badge = isDefaultBackground
    ? 'BG'
    : isAICard
      ? 'AI'
      : isTextOverlay
        ? 'TXT'
        : overlay.type === 'video'
          ? 'VID'
          : 'IMG';
  const canManageOverlay = !isDefaultBackground;
  const canPaste = Boolean(overlayClipboard);

  const handleMoveMouseDown = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (event.button !== 0) {
      return;
    }

    if (isDefaultBackground) {
      return;
    }

    if ((event.target as HTMLElement).dataset.resize === 'true') {
      return;
    }

    event.preventDefault();
    const startX = event.clientX;
    const startY = event.clientY;
    const startMs = overlay.startMs;
    let currentTrackId = overlay.trackId;
    let didMove = false;

    onTrackHoverChange?.(overlay.trackId);

    const handleMouseMove = (moveEvent: globalThis.MouseEvent) => {
      if (
        !didMove &&
        (Math.abs(moveEvent.clientX - startX) > 3 || Math.abs(moveEvent.clientY - startY) > 3)
      ) {
        didMove = true;
      }

      const nextMoveDraft = getOverlayMoveDraft({
        startMs,
        startClientX: startX,
        currentClientX: moveEvent.clientX,
        pxPerMs,
        projectDurationMs: projectDuration,
        overlayDurationMs: overlay.durationMs,
        fallbackTrackId: currentTrackId,
        clientY: moveEvent.clientY,
        trackZones: getTrackDragZones?.() ?? [],
      });

      currentTrackId = nextMoveDraft.trackId;
      onTrackHoverChange?.(nextMoveDraft.trackId);
      updateOverlay(overlay.id, nextMoveDraft);
    };

    const handleMouseUp = () => {
      onTrackHoverChange?.(null);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      if (!didMove) {
        onSelect?.();
      }
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const handleResizeMouseDown = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (event.button !== 0) {
      return;
    }

    if (isDefaultBackground) {
      return;
    }

    event.stopPropagation();
    event.preventDefault();
    const startX = event.clientX;
    const startDuration = overlay.durationMs;

    const handleMouseMove = (moveEvent: globalThis.MouseEvent) => {
      const deltaMs = (moveEvent.clientX - startX) / pxPerMs;
      const maxByTimeline = Math.max(500, projectDuration - overlay.startMs);
      const nextDuration = clamp(
        Math.round(startDuration + deltaMs),
        500,
        Math.min(maxDurationForAsset, maxByTimeline),
      );
      updateOverlay(overlay.id, { durationMs: nextDuration });
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const block = (
    <div
      data-overlay-block="true"
      onMouseDown={handleMoveMouseDown}
      onContextMenu={(event) => {
        onSelect?.();
        onContextMenu?.(event);
      }}
      className={[
        styles.root,
        isDefaultBackground ? styles.locked : '',
        selected ? styles.selected : '',
      ].filter(Boolean).join(' ')}
      style={{
        left,
        width,
        height: blockHeight,
        ['--overlay-color' as string]: color,
        ['--overlay-glow' as string]: colorGlow,
      }}
    >
      <div className={styles.accentLine} />

      {showImageThumbnail ? (
        <div
          className={styles.thumbnail}
          style={{ width: thumbnailWidth }}
        >
          <AssetThumbnail asset={asset} />
        </div>
      ) : null}

      <div
        className={[
          styles.content,
          showImageThumbnail ? styles.contentWithThumbnail : styles.contentStandalone,
        ].join(' ')}
      >
        <span className={styles.badge}>{badge}</span>
        {label}
      </div>

      {!isDefaultBackground && selected ? (
        <button
          className={styles.deleteButton}
          onMouseDown={(event) => {
            event.stopPropagation();
          }}
          onClick={(event) => {
            event.stopPropagation();
            removeOverlay(overlay.id);
          }}
          aria-label="删除"
          title="删除"
        >
          <AppIcon name="trash-2" size={12} />
        </button>
      ) : null}

      {isDefaultBackground ? null : (
        <div
          data-resize="true"
          onMouseDown={handleResizeMouseDown}
          className={styles.resizeHandle}
        />
      )}
    </div>
  );

  if (!canManageOverlay) {
    return block;
  }

  return (
    <ContextMenu>
      <ContextMenu.Trigger asChild>{block}</ContextMenu.Trigger>
      <ContextMenu.Content>
        <ContextMenu.Item
          onSelect={() => {
            copyOverlay(overlay.id);
          }}
        >
          <Copy size={11} className="mr-1 shrink-0" />
          <span>复制</span>
          <ContextMenu.Shortcut>⌘C</ContextMenu.Shortcut>
        </ContextMenu.Item>

        <ContextMenu.Item
          onSelect={() => {
            cutOverlay(overlay.id);
          }}
        >
          <AppIcon name="scissors" size={11} className="mr-1 shrink-0" />
          <span>剪切</span>
          <ContextMenu.Shortcut>⌘X</ContextMenu.Shortcut>
        </ContextMenu.Item>

        <ContextMenu.Item
          disabled={!canPaste}
          onSelect={() => {
            pasteOverlay({
              trackId: overlay.trackId,
              startMs: overlay.startMs + overlay.durationMs,
            });
          }}
        >
          <Clipboard size={11} className="mr-1 shrink-0" />
          <span>粘贴</span>
          <ContextMenu.Shortcut>⌘V</ContextMenu.Shortcut>
        </ContextMenu.Item>

        <ContextMenu.Separator />

        <ContextMenu.Item
          destructive
          onSelect={() => {
            removeOverlay(overlay.id);
          }}
        >
          <AppIcon name="trash-2" size={11} className="mr-1 shrink-0" />
          <span>删除</span>
          <ContextMenu.Shortcut>⌫</ContextMenu.Shortcut>
        </ContextMenu.Item>
      </ContextMenu.Content>
    </ContextMenu>
  );
}
