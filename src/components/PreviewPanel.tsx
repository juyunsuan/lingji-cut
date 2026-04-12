import { memo, useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { Player, type PlayerRef } from '@remotion/player';
import { fitPreviewStage } from '../lib/preview';
import { formatTime, msToFrame } from '../lib/utils';
import { PodcastComposition } from '../remotion/PodcastComposition';
import { useTimelineStore } from '../store/timeline';
import { Button, Card, Tooltip, TooltipContent, TooltipTrigger } from '../ui';
import { AppIcon } from './AppIcon';
import { CanvasInteractionLayer } from './CanvasInteractionLayer';
import type { OverlayPosition } from '../types';
import styles from './PreviewPanel.module.css';

interface PreviewPanelProps {
  playerRef: RefObject<PlayerRef | null>;
  isPlaying: boolean;
  onTogglePlay: () => void;
  onExport: () => void;
  currentTimeMs: number;
  durationMs: number;
  compact: boolean;
  selectedOverlayId?: string | null;
  onSelectOverlay?: (overlayId: string | null) => void;
  onUpdateOverlayPosition?: (overlayId: string, position: OverlayPosition) => void;
}

function PreviewPanelComponent({
  playerRef,
  isPlaying,
  onTogglePlay,
  currentTimeMs,
  durationMs,
  compact,
  selectedOverlayId,
  onSelectOverlay,
  onUpdateOverlayPosition,
}: PreviewPanelProps) {
  const { timeline, srtEntries } = useTimelineStore();
  const fps = timeline.fps || 30;
  const durationInFrames = useMemo(
    () => Math.max(1, msToFrame(timeline.podcast.durationMs || 1000, fps)),
    [fps, timeline.podcast.durationMs],
  );
  const playerInputProps = useMemo(() => ({ timeline, srtEntries }), [srtEntries, timeline]);
  const cardRef = useRef<HTMLDivElement>(null);
  const previewAreaRef = useRef<HTMLDivElement | null>(null);
  const stageFrameRef = useRef<HTMLDivElement>(null);
  const [stageFrameRect, setStageFrameRect] = useState<DOMRect | null>(null);
  const [stageSize, setStageSize] = useState(() => ({
    width: timeline.width,
    height: timeline.height,
  }));
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const handleChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handleChange);
    return () => document.removeEventListener('fullscreenchange', handleChange);
  }, []);

  const handleToggleFullscreen = useCallback(() => {
    const el = cardRef.current;
    if (!el) return;
    if (!document.fullscreenElement) {
      el.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
  }, []);

  useEffect(() => {
    const container = previewAreaRef.current;
    if (!container) {
      return;
    }

    const updateStageSize = () => {
      const nextStageSize = fitPreviewStage(
        container.clientWidth,
        container.clientHeight,
        timeline.width,
        timeline.height,
      );
      setStageSize(nextStageSize);
      if (stageFrameRef.current) {
        setStageFrameRect(stageFrameRef.current.getBoundingClientRect());
      }
    };

    updateStageSize();

    const observer = new ResizeObserver(() => {
      updateStageSize();
    });
    observer.observe(container);

    return () => {
      observer.disconnect();
    };
  }, [timeline.height, timeline.width]);

  return (
    <Card ref={cardRef} className={styles.root}>
      {/* Header */}
      <div className={styles.header}>
        <span className={styles.headerTitle}>预览</span>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className={styles.resolutionPill}
              aria-label={`分辨率 ${timeline.width}×${timeline.height}，帧率 ${fps}`}
            >
              <AppIcon name="monitor" size={12} />
              <span>{timeline.width}×{timeline.height}</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            {`分辨率: ${timeline.width}×${timeline.height} · ${fps}fps`}
          </TooltipContent>
        </Tooltip>
      </div>

      {/* Stage 区域 */}
      <div
        ref={previewAreaRef}
        className={styles.stageArea}
        style={{ padding: compact ? 10 : 14 }}
      >
        <div
          ref={stageFrameRef}
          className={styles.stageFrame}
          style={{
            width: Math.max(0, stageSize.width),
            height: Math.max(0, stageSize.height),
          }}
        >
          <Player
            key={timeline.podcast.audioPath || 'empty'}
            ref={playerRef}
            component={PodcastComposition}
            inputProps={playerInputProps}
            durationInFrames={durationInFrames}
            fps={fps}
            compositionWidth={timeline.width}
            compositionHeight={timeline.height}
            controls={false}
            style={{
              width: '100%',
              height: '100%',
              display: 'block',
              background: 'var(--color-preview-bg)',
            }}
          />
          {onSelectOverlay && (
            <CanvasInteractionLayer
              overlays={timeline.overlays}
              selectedOverlayId={selectedOverlayId ?? null}
              currentTimeMs={currentTimeMs}
              canvasWidth={timeline.width}
              canvasHeight={timeline.height}
              stageRect={stageFrameRect}
              onSelect={onSelectOverlay}
              onUpdatePosition={onUpdateOverlayPosition ?? (() => {})}
            />
          )}
        </div>
      </div>

      {/* Footer 播放控件 */}
      <div className={styles.footer}>
        {/* 左段 — 时间组 */}
        <div className={styles.footerLeft}>
          <AppIcon name="volume-2" size={14} className={styles.volumeIcon} />
          <span className={styles.timeCurrentLabel}>{formatTime(currentTimeMs)}</span>
          <span className={styles.timeSeparator}>/</span>
          <span className={styles.timeTotalLabel}>{formatTime(durationMs)}</span>
        </div>

        {/* 中段 — 播放控件 */}
        <div className={styles.footerCenter}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className={styles.skipButton} aria-label="上一段">
                <AppIcon name="skip-back" size={18} />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">上一段</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className={styles.playButton}
                onClick={onTogglePlay}
                aria-label={isPlaying ? '暂停' : '播放'}
              >
                {isPlaying
                  ? <AppIcon name="pause" size={16} className={styles.playIcon} />
                  : <AppIcon name="play" size={16} className={styles.playIcon} />
                }
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">{isPlaying ? '暂停' : '播放'}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className={styles.skipButton} aria-label="下一段">
                <AppIcon name="skip-forward" size={18} />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">下一段</TooltipContent>
          </Tooltip>
        </div>

        {/* 右段 — 辅助控件 */}
        <div className={styles.footerRight}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="sm" className={styles.speedButton} aria-label="播放速度">
                1×
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">播放速度</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className={styles.auxButton}
                aria-label={isFullscreen ? '退出全屏' : '全屏'}
                onClick={handleToggleFullscreen}
              >
                {isFullscreen
                  ? <AppIcon name="minimize-2" size={14} />
                  : <AppIcon name="maximize-2" size={14} />
                }
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">{isFullscreen ? '退出全屏' : '全屏'}</TooltipContent>
          </Tooltip>
        </div>
      </div>
    </Card>
  );
}

export const PreviewPanel = memo(PreviewPanelComponent);
