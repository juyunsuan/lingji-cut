import type { ComponentProps, ComponentType } from 'react';
import { Composition } from 'remotion';
import type { ExportRenderConfig } from '../lib/export-settings';
import { createDefaultTimeline } from '../types';
import { PodcastComposition } from './PodcastComposition';

type PodcastCompositionProps = ComponentProps<typeof PodcastComposition>;
const PodcastCompositionComponent =
  PodcastComposition as unknown as ComponentType<Record<string, unknown>>;

export function RemotionRoot() {
  return (
    <Composition
      id="PodcastComposition"
      component={PodcastCompositionComponent}
      defaultProps={{
        timeline: createDefaultTimeline(),
        srtEntries: [],
        renderConfig: null,
      }}
      durationInFrames={300}
      fps={30}
      width={1920}
      height={1080}
      calculateMetadata={({ props }) => {
        const compositionProps = props as Partial<PodcastCompositionProps>;
        const timeline = compositionProps.timeline ?? createDefaultTimeline();
        const renderConfig = (compositionProps.renderConfig as ExportRenderConfig | null | undefined) ?? null;
        return {
          width: renderConfig?.renderWidth ?? timeline.width,
          height: renderConfig?.renderHeight ?? timeline.height,
          fps: timeline.fps,
          durationInFrames: Math.max(
            1,
            Math.round((timeline.podcast.durationMs / 1000) * timeline.fps),
          ),
        };
      }}
    />
  );
}
