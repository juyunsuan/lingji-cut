import { memo, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { Player, type PlayerRef } from '@remotion/player';
import { fitPreviewStage } from '../lib/preview';
import { formatTime, msToFrame } from '../lib/utils';
import { PodcastComposition } from '../remotion/PodcastComposition';
import { useTimelineStore } from '../store/timeline';
import { Badge, Button } from '../ui/primitives';
import { PanelHeader } from '../ui/patterns';

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
  onExport,
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
  const previewAreaRef = useRef<HTMLDivElement | null>(null);
  const [stageSize, setStageSize] = useState(() => ({
    width: timeline.width,
    height: timeline.height,
  }));

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
    <div
      style={{
        height: '100%',
        minHeight: 0,
        borderRadius: 24,
        border: '1px solid rgba(148, 163, 184, 0.12)',
        background:
          'linear-gradient(180deg, rgba(15, 23, 42, 0.95) 0%, rgba(15, 23, 42, 0.85) 100%)',
        overflow: 'hidden',
        display: 'grid',
        gridTemplateRows: 'auto minmax(0, 1fr) auto',
        boxShadow: '0 24px 80px rgba(15, 23, 42, 0.75)',
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
      }}
    >
      <div
        style={{
          padding: '16px 20px',
          borderBottom: '1px solid rgba(148, 163, 184, 0.10)',
          background: 'linear-gradient(180deg, rgba(15, 23, 42, 0.9) 0%, rgba(15, 23, 42, 0.7) 100%)',
        }}
      >
        <PanelHeader
          eyebrow="PREVIEW"
          title="播客预览"
          meta={<Badge variant="neutral">{timeline.width} × {timeline.height} · {fps}fps</Badge>}
        />
      </div>

      <div
        ref={previewAreaRef}
        style={{
          padding: compact ? 16 : 24,
          display: 'grid',
          placeItems: 'center',
          minHeight: 0,
          overflow: 'hidden',
          background: 'radial-gradient(circle at 50% 50%, rgba(15, 23, 42, 0.4) 0%, rgba(2, 6, 23, 0.95) 100%)',
        }}
      >
        <div
          style={{
            width: Math.max(0, stageSize.width),
            height: Math.max(0, stageSize.height),
            maxWidth: '100%',
            maxHeight: '100%',
            borderRadius: 20,
            overflow: 'hidden',
            background: '#020617',
            boxShadow: '0 28px 80px rgba(0, 0, 0, 0.65), 0 0 0 1px rgba(148, 163, 184, 0.12) inset',
            border: '1px solid rgba(15, 23, 42, 0.8)',
            position: 'relative',
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
              background: '#000',
            }}
          />
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: compact ? 'stretch' : 'center',
          justifyContent: 'space-between',
          flexDirection: compact ? 'column' : 'row',
          gap: compact ? 12 : 16,
          padding: compact ? '14px 18px 18px' : '16px 24px 24px',
          borderTop: '1px solid rgba(148, 163, 184, 0.10)',
          background: 'linear-gradient(180deg, rgba(15, 23, 42, 0.7) 0%, rgba(15, 23, 42, 0.9) 100%)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: compact ? 'stretch' : 'center',
            flexDirection: compact ? 'column' : 'row',
            gap: 12,
            minWidth: 0,
          }}
        >
          <Button
            onClick={onTogglePlay}
            variant={isPlaying ? 'tint' : 'secondary'}
            size="lg"
            style={{ height: 48, padding: '0 24px', borderRadius: 16, fontSize: 15 }}
          >
            {isPlaying ? '⏸ 暂停' : '▶ 播放'}
          </Button>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              flexWrap: 'wrap',
            }}
          >
            <div
              style={{
                padding: '10px 16px',
                borderRadius: 14,
                background: 'rgba(15, 23, 42, 0.6)',
                color: '#f1f5f9',
                fontSize: 14,
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                fontWeight: 600,
                border: '1px solid rgba(148, 163, 184, 0.15)',
                boxShadow: '0 4px 12px rgba(15, 23, 42, 0.4)',
              }}
            >
              {formatTime(currentTimeMs)} / {formatTime(durationMs)}
            </div>
            <div>
              <Badge variant={isPlaying ? 'info' : 'neutral'}>
              {isPlaying ? '● 播放中' : '⏸ 已暂停'}
              </Badge>
            </div>
          </div>
        </div>

        <Button
          onClick={onExport}
          variant="danger"
          size="lg"
          style={{ height: 48, padding: '0 28px', borderRadius: 16, fontSize: 15, alignSelf: compact ? 'stretch' : 'auto' }}
        >
          导出 MP4
        </Button>
      </div>
    </div>
  );
}

export const PreviewPanel = memo(PreviewPanelComponent);
