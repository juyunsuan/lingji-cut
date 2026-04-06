import { memo, useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { Player, type PlayerRef } from '@remotion/player';
import {
  Maximize2,
  Minimize2,
  Monitor,
  Pause,
  Play,
  SkipBack,
  SkipForward,
  Volume2,
} from 'lucide-react';
import { fitPreviewStage } from '../lib/preview';
import { formatTime, msToFrame } from '../lib/utils';
import { PodcastComposition } from '../remotion/PodcastComposition';
import { useTimelineStore } from '../store/timeline';
import { Button, Card } from '../ui';
import styles from './PreviewPanel.module.css';

interface PreviewPanelProps {
  playerRef: RefObject<PlayerRef | null>;
  isPlaying: boolean;
  onTogglePlay: () => void;
  onExport: () => void;
  currentTimeMs: number;
  durationMs: number;
  compact: boolean;
}

function PreviewPanelComponent({
  playerRef,
  isPlaying,
  onTogglePlay,
  currentTimeMs,
  durationMs,
  compact,
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
        <Button
          variant="ghost"
          size="sm"
          className={styles.resolutionPill}
          title={`分辨率: ${timeline.width}×${timeline.height} · ${fps}fps`}
        >
          <Monitor size={12} />
          <span>{timeline.width}×{timeline.height}</span>
        </Button>
      </div>

      {/* Stage 区域 */}
      <div
        ref={previewAreaRef}
        className={styles.stageArea}
        style={{ padding: compact ? 10 : 14 }}
      >
        <div
          className={styles.stageFrame}
          style={{
            width: Math.max(0, stageSize.width),
            height: Math.max(0, stageSize.height),
          }}
        >
          <Player
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
        </div>
      </div>

      {/* Footer 播放控件 */}
      <div className={styles.footer}>
        {/* 左段 — 时间组 */}
        <div className={styles.footerLeft}>
          <Volume2 size={14} className={styles.volumeIcon} />
          <span className={styles.timeCurrentLabel}>{formatTime(currentTimeMs)}</span>
          <span className={styles.timeSeparator}>/</span>
          <span className={styles.timeTotalLabel}>{formatTime(durationMs)}</span>
        </div>

        {/* 中段 — 播放控件 */}
        <div className={styles.footerCenter}>
          <Button variant="ghost" size="icon" className={styles.skipButton} title="上一段" aria-label="上一段">
            <SkipBack size={18} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className={styles.playButton}
            onClick={onTogglePlay}
            title={isPlaying ? '暂停' : '播放'}
            aria-label={isPlaying ? '暂停' : '播放'}
          >
            {isPlaying
              ? <Pause size={16} className={styles.playIcon} />
              : <Play size={16} className={styles.playIcon} />
            }
          </Button>
          <Button variant="ghost" size="icon" className={styles.skipButton} title="下一段" aria-label="下一段">
            <SkipForward size={18} />
          </Button>
        </div>

        {/* 右段 — 辅助控件 */}
        <div className={styles.footerRight}>
          <Button variant="ghost" size="sm" className={styles.speedButton} title="播放速度" aria-label="播放速度">
            1×
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className={styles.auxButton}
            title={isFullscreen ? '退出全屏' : '全屏'}
            aria-label={isFullscreen ? '退出全屏' : '全屏'}
            onClick={handleToggleFullscreen}
          >
            {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </Button>
        </div>
      </div>
    </Card>
  );
}

export const PreviewPanel = memo(PreviewPanelComponent);
