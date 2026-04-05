import type { MouseEvent as ReactMouseEvent } from 'react';
import { getOverlayMoveDraft, type TrackDragZone } from '../lib/overlay-drag';
import type { OverlayItem } from '../types';
import { clamp, getFileNameFromPath } from '../lib/utils';
import { useTimelineStore } from '../store/timeline';
import { AssetThumbnail } from './AssetThumbnail';
import styles from './OverlayBlock.module.css';

interface OverlayBlockProps {
  overlay: OverlayItem;
  pxPerMs: number;
  trackHeight?: number;
  getTrackDragZones?: () => TrackDragZone[];
  onTrackHoverChange?: (trackId: string | null) => void;
  onSelect?: () => void;
}

export function OverlayBlock({
  overlay,
  pxPerMs,
  trackHeight = 48,
  getTrackDragZones,
  onTrackHoverChange,
  onSelect,
}: OverlayBlockProps) {
  const { assets, removeOverlay, timeline, updateOverlay } = useTimelineStore();
  const asset = assets.find((item) => item.path === overlay.assetPath);
  const isAICard = overlay.overlayType === 'ai-card';
  const isDefaultBackground = overlay.overlayRole === 'default-background';
  const color = isDefaultBackground
    ? 'var(--color-brand-accent)'
    : isAICard
    ? overlay.aiCardData?.style.primaryColor ?? 'var(--color-brand-accent)'
    : overlay.type === 'video'
      ? 'var(--color-selection-blue-hover)'
      : 'var(--color-brand-warm)';
  const colorGlow = isDefaultBackground
    ? 'color-mix(in srgb, var(--color-brand-accent) 22%, transparent)'
    : isAICard
    ? 'color-mix(in srgb, var(--color-brand-accent) 24%, transparent)'
    : overlay.type === 'video'
      ? 'color-mix(in srgb, var(--color-selection-blue-hover) 24%, transparent)'
      : 'color-mix(in srgb, var(--color-brand-warm) 22%, transparent)';
  const left = overlay.startMs * pxPerMs;
  const width = Math.max(24, overlay.durationMs * pxPerMs);
  const thumbnailWidth = Math.max(0, Math.min(38, width - 26));
  const blockHeight = Math.max(24, trackHeight - 6);
  const showImageThumbnail =
    !isAICard && overlay.type === 'image' && Boolean(asset) && thumbnailWidth >= 24;
  const projectDuration = timeline.podcast.durationMs || overlay.durationMs;
  const maxDurationForAsset =
    overlay.type === 'video' ? asset?.durationMs ?? overlay.durationMs : Number.POSITIVE_INFINITY;
  const label = isDefaultBackground
    ? `默认背景 · ${getFileNameFromPath(overlay.assetPath)}`
    : isAICard
      ? overlay.aiCardData?.title ?? 'AI 卡片'
      : getFileNameFromPath(overlay.assetPath);
  const badge = isDefaultBackground ? 'BG' : isAICard ? 'AI' : overlay.type === 'video' ? 'VID' : 'IMG';

  const handleMoveMouseDown = (event: ReactMouseEvent<HTMLDivElement>) => {
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

  return (
    <div
      onMouseDown={handleMoveMouseDown}
      onContextMenu={(event) => {
        event.preventDefault();
        removeOverlay(overlay.id);
      }}
      className={[
        styles.root,
        isDefaultBackground ? styles.locked : '',
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

      {isDefaultBackground ? null : (
        <div
          data-resize="true"
          onMouseDown={handleResizeMouseDown}
          className={styles.resizeHandle}
        />
      )}
    </div>
  );
}
