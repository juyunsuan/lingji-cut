import type { MouseEvent as ReactMouseEvent } from 'react';
import { getOverlayMoveDraft, type TrackDragZone } from '../lib/overlay-drag';
import type { OverlayItem } from '../types';
import { clamp, getFileNameFromPath } from '../lib/utils';
import { useTimelineStore } from '../store/timeline';
import { AssetThumbnail } from './AssetThumbnail';

interface OverlayBlockProps {
  overlay: OverlayItem;
  pxPerMs: number;
  trackHeight?: number;
  getTrackDragZones?: () => TrackDragZone[];
  onTrackHoverChange?: (trackId: string | null) => void;
}

export function OverlayBlock({
  overlay,
  pxPerMs,
  trackHeight = 48,
  getTrackDragZones,
  onTrackHoverChange,
}: OverlayBlockProps) {
  const { assets, removeOverlay, timeline, updateOverlay } = useTimelineStore();
  const asset = assets.find((item) => item.path === overlay.assetPath);
  const isAICard = overlay.overlayType === 'ai-card';
  const isDefaultBackground = overlay.overlayRole === 'default-background';
  const color = isDefaultBackground
    ? '#7bd5ff'
    : isAICard
    ? overlay.aiCardData?.style.primaryColor ?? '#8b5cf6'
    : overlay.type === 'video'
      ? '#3ea6ff'
      : '#d6864a';
  const colorGlow = isDefaultBackground
    ? 'rgba(123,213,255,0.22)'
    : isAICard
    ? 'rgba(139,92,246,0.24)'
    : overlay.type === 'video'
      ? 'rgba(62,166,255,0.25)'
      : 'rgba(214,134,74,0.24)';
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
    const startMs = overlay.startMs;
    let currentTrackId = overlay.trackId;

    onTrackHoverChange?.(overlay.trackId);

    const handleMouseMove = (moveEvent: globalThis.MouseEvent) => {
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
      style={{
        position: 'absolute',
        left,
        top: 3,
        width,
        height: blockHeight,
        borderRadius: 8,
        border: `1px solid ${color}cc`,
        background: `linear-gradient(180deg, ${colorGlow}, rgba(19,24,32,0.92))`,
        boxShadow: `inset 0 1px 0 rgba(255,255,255,0.06), 0 2px 8px rgba(0,0,0,0.18)`,
        display: 'flex',
        alignItems: 'center',
        overflow: 'hidden',
        cursor: isDefaultBackground ? 'default' : 'grab',
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 2,
          background: color,
        }}
      />

      {showImageThumbnail ? (
        <div
          style={{
            width: thumbnailWidth,
            height: '100%',
            flex: '0 0 auto',
            borderRight: `1px solid ${color}44`,
            background: 'rgba(8, 12, 20, 0.86)',
          }}
        >
          <AssetThumbnail asset={asset} />
        </div>
      ) : null}

      <div
        style={{
          padding: showImageThumbnail ? '0 8px' : '0 10px',
          fontSize: 11,
          fontWeight: 600,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          color: '#f1f5fb',
          minWidth: 0,
          flex: 1,
        }}
      >
        <span style={{ color, marginRight: 6 }}>{badge}</span>
        {label}
      </div>

      {isDefaultBackground ? null : (
        <div
          data-resize="true"
          onMouseDown={handleResizeMouseDown}
          style={{
            marginLeft: 'auto',
            width: 8,
            alignSelf: 'stretch',
            cursor: 'ew-resize',
            background:
              'repeating-linear-gradient(180deg, rgba(255,255,255,0.3) 0 2px, transparent 2px 4px)',
          }}
        />
      )}
    </div>
  );
}
