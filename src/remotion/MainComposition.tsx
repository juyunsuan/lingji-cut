import { AbsoluteFill, Sequence } from 'remotion';
import type { SrtEntry, TimelineData } from '../types';
import { buildRenderPlan } from './timeline-to-sequences';
import { VideoOverlay } from './overlays/VideoOverlay';
import { ImageOverlay } from './overlays/ImageOverlay';
import { TextOverlay } from './overlays/TextOverlay';
import { AudioOverlay } from './overlays/AudioOverlay';
import { SubtitleLayer } from './overlays/SubtitleLayer';
import { AICardOverlay } from './overlays/AICardOverlay';

// 用 type 而非 interface：Remotion 的 Composition 要求 props 可赋值给
// Record<string, unknown>，interface 缺少隐式索引签名会导致类型不匹配。
export type MainCompositionProps = {
  timeline: TimelineData;
  srtEntries: SrtEntry[];
};

export function MainComposition({ timeline, srtEntries }: MainCompositionProps) {
  const plan = buildRenderPlan(timeline, srtEntries, timeline.fps ?? 30);
  return (
    <AbsoluteFill style={{ backgroundColor: '#04060a' }}>
      {plan.audio.map((a) => (
        <Sequence key={a.id} from={a.startFrame} durationInFrames={a.durationFrames}>
          <AudioOverlay clip={a} fps={plan.fps} />
        </Sequence>
      ))}
      {plan.visual.map((c) => (
        <Sequence key={c.id} from={c.startFrame} durationInFrames={c.durationFrames}>
          {c.kind === 'ai-card' ? (
            <AICardOverlay overlay={c.overlay} zIndex={c.zIndex} />
          ) : c.kind === 'text' ? (
            <TextOverlay overlay={c.overlay} zIndex={c.zIndex} durationFrames={c.durationFrames} />
          ) : c.kind === 'video' ? (
            <VideoOverlay overlay={c.overlay} zIndex={c.zIndex} />
          ) : (
            <ImageOverlay overlay={c.overlay} zIndex={c.zIndex} />
          )}
        </Sequence>
      ))}
      {plan.subtitles.map((s) => (
        <Sequence key={`sub-${s.index}`} from={s.startFrame} durationInFrames={s.durationFrames}>
          <SubtitleLayer cue={s} style={timeline.subtitle} highlights={timeline.subtitleHighlights ?? []} />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
}
