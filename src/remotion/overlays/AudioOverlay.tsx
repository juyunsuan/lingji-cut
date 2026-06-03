import { Audio } from 'remotion';
import type { RenderableAudio } from '../timeline-to-sequences';
import { toFileSrc } from '../../lib/utils';

export function AudioOverlay({ clip, fps }: { clip: RenderableAudio; fps: number }) {
  return (
    <Audio
      src={toFileSrc(clip.assetPath)}
      volume={clip.volume}
      startFrom={Math.round((clip.trimStartMs / 1000) * fps)}
    />
  );
}
