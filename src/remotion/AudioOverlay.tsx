import { Audio, Sequence } from 'remotion';
import type { OverlayItem } from '../types';
import { resolveRemotionAssetSrc } from '../lib/remotion-assets';
import { msToFrame } from '../lib/utils';

interface AudioOverlayProps {
  overlay: OverlayItem;
  fps: number;
}

/**
 * 时间线上的次级音频 overlay。通过 Remotion 的 <Audio> 实现多音轨混音。
 * - startFrom / endAt 实现源音频裁剪
 * - volume 由帧索引映射出线性音量（支持淡入/淡出）
 */
export function AudioOverlay({ overlay, fps }: AudioOverlayProps) {
  if (overlay.type !== 'audio' || !overlay.assetPath) {
    return null;
  }

  const audioData = overlay.audioData;
  const from = msToFrame(overlay.startMs, fps);
  const durationInFrames = Math.max(1, msToFrame(overlay.durationMs, fps));
  const trimStartFrames = Math.max(0, msToFrame(audioData?.trimStartMs ?? 0, fps));
  const fadeInFrames = Math.max(0, msToFrame(audioData?.fadeInMs ?? 0, fps));
  const fadeOutFrames = Math.max(0, msToFrame(audioData?.fadeOutMs ?? 0, fps));
  const baseVolume = Math.max(0, audioData?.muted ? 0 : audioData?.volume ?? 1);

  const volumeFn = (frame: number) => {
    if (baseVolume === 0) return 0;
    let factor = 1;
    if (fadeInFrames > 0 && frame < fadeInFrames) {
      factor *= frame / fadeInFrames;
    }
    const exitStart = durationInFrames - fadeOutFrames;
    if (fadeOutFrames > 0 && frame >= exitStart) {
      const remain = Math.max(0, durationInFrames - frame);
      factor *= remain / fadeOutFrames;
    }
    return baseVolume * Math.max(0, Math.min(1, factor));
  };

  return (
    <Sequence from={from} durationInFrames={durationInFrames}>
      <Audio
        src={resolveRemotionAssetSrc(overlay.assetPath)}
        startFrom={trimStartFrames}
        endAt={trimStartFrames + durationInFrames}
        volume={volumeFn}
      />
    </Sequence>
  );
}
