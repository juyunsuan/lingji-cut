import type { ExportRenderConfig } from '../lib/export-settings';
import { AbsoluteFill, Audio, useVideoConfig } from 'remotion';
import { getRenderableOverlays } from '../lib/timeline-tracks';
import type { SrtEntry, TimelineData } from '../types';
import { resolveRemotionAssetSrc } from '../lib/remotion-assets';
import { AICardOverlay } from './AICardOverlay';
import { MediaOverlay } from './MediaOverlay';
import { SubtitleTrack } from './SubtitleTrack';
import { TextOverlay } from './TextOverlay';

interface PodcastCompositionProps {
  timeline: TimelineData;
  srtEntries: SrtEntry[];
  renderConfig?: ExportRenderConfig | null;
}

export function PodcastComposition({ timeline, srtEntries }: PodcastCompositionProps) {
  const { width, height } = useVideoConfig();
  const previewScale = Math.min(width / timeline.width, height / timeline.height);
  const renderableOverlays = getRenderableOverlays(timeline);
  // AI 卡片需要独立计数以显示章节序号
  let aiCardIndex = 0;

  return (
    <AbsoluteFill style={{ background: '#04060a', overflow: 'hidden' }}>
      {timeline.podcast.audioPath ? <Audio src={resolveRemotionAssetSrc(timeline.podcast.audioPath)} /> : null}

      <div
        style={{
          position: 'absolute',
          inset: 0,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: timeline.width,
            height: timeline.height,
            transform: `scale(${previewScale})`,
            transformOrigin: 'top left',
          }}
        >
          {renderableOverlays.map((overlay) => {
            if (overlay.overlayType === 'ai-card') {
              aiCardIndex += 1;
              return (
                <AICardOverlay
                  key={overlay.id}
                  overlay={overlay}
                  fps={timeline.fps}
                  chapterIndex={aiCardIndex}
                />
              );
            }
            if (overlay.type === 'text') {
              return <TextOverlay key={overlay.id} overlay={overlay} fps={timeline.fps} />;
            }
            return <MediaOverlay key={overlay.id} overlay={overlay} fps={timeline.fps} />;
          })}

          <SubtitleTrack
            entries={srtEntries}
            style={timeline.subtitle}
            highlights={timeline.subtitleHighlights}
          />
        </div>
      </div>
    </AbsoluteFill>
  );
}
