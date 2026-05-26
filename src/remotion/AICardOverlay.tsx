import type { CSSProperties } from 'react';
import { Img, OffthreadVideo, Sequence } from 'remotion';
import type { OverlayItem, SrtEntry } from '../types';
import { isDataContent, isMediaContent } from '../types/ai';
import { msToFrame } from '../lib/utils';
import { resolveRemotionAssetSrc } from '../lib/remotion-assets';
import type { MotionSubtitleCue } from '../types/motion';
import { SummaryCard } from './cards/SummaryCard';
import { DataCard } from './cards/DataCard';
import { InsightCard } from './cards/InsightCard';
import { ChapterCard } from './cards/ChapterCard';
import { QuoteCard } from './cards/QuoteCard';
import { MotionCardOverlay } from './MotionCardOverlay';
import { MediaCardPlaceholder } from './MediaCardPlaceholder';

interface AICardOverlayProps {
  overlay: OverlayItem;
  fps: number;
  chapterIndex?: number;
  zIndex?: number;
  srtEntries?: SrtEntry[];
}

function sliceSubtitlesForOverlay(
  entries: SrtEntry[] | undefined,
  overlay: OverlayItem,
  fps: number,
): MotionSubtitleCue[] {
  if (!entries || entries.length === 0) return [];
  const overlayStart = overlay.startMs;
  const overlayEnd = overlay.startMs + overlay.durationMs;
  const cues: MotionSubtitleCue[] = [];
  for (const entry of entries) {
    if (entry.endMs <= overlayStart) continue;
    if (entry.startMs >= overlayEnd) break;
    const clampedStart = Math.max(entry.startMs, overlayStart);
    const clampedEnd = Math.min(entry.endMs, overlayEnd);
    cues.push({
      startMs: entry.startMs,
      endMs: entry.endMs,
      text: entry.text,
      relativeStartFrame: msToFrame(clampedStart - overlayStart, fps),
      relativeEndFrame: msToFrame(clampedEnd - overlayStart, fps),
    });
  }
  return cues;
}

function formatTime(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1_000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

interface RenderCardContext {
  motionDurationInFrames: number;
  motionWidth: number;
  motionHeight: number;
  motionSubtitles: MotionSubtitleCue[];
}

function renderCard(
  overlay: OverlayItem,
  chapterIndex: number,
  context: RenderCardContext,
) {
  const data = overlay.aiCardData;
  if (!data) {
    return null;
  }

  if (data.renderMode === 'motion-card' && data.motionCard?.compiledCode) {
    return (
      <MotionCardOverlay
        motionCard={data.motionCard}
        durationInFrames={context.motionDurationInFrames}
        width={context.motionWidth}
        height={context.motionHeight}
        subtitles={context.motionSubtitles}
      />
    );
  }

  if (data.cardType === 'image' && isMediaContent(data.content)) {
    if (!data.content.assetPath) {
      return <MediaCardPlaceholder type="image" status={data.content.generationStatus} />;
    }
    return (
      <Img
        src={resolveRemotionAssetSrc(data.content.assetPath)}
        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
      />
    );
  }

  if (data.cardType === 'video' && isMediaContent(data.content)) {
    if (!data.content.assetPath) {
      return <MediaCardPlaceholder type="video" status={data.content.generationStatus} />;
    }
    return (
      <OffthreadVideo
        src={resolveRemotionAssetSrc(data.content.assetPath)}
        muted
        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
      />
    );
  }

  if (data.cardType === 'summary') {
    return <SummaryCard title={data.title} content={String(data.content)} style={data.style} />;
  }

  if (data.cardType === 'data' && isDataContent(data.content)) {
    return <DataCard title={data.title} content={data.content} style={data.style} />;
  }

  if (data.cardType === 'insight') {
    return <InsightCard title={data.title} content={String(data.content)} style={data.style} />;
  }

  if (data.cardType === 'chapter') {
    const range = `${formatTime(data.sourceStartMs ?? overlay.startMs)} - ${formatTime(
      data.sourceEndMs ?? overlay.startMs + overlay.durationMs,
    )}`;
    return (
      <ChapterCard
        title={data.title}
        chapterIndex={chapterIndex}
        timeRange={range}
        style={data.style}
      />
    );
  }

  return <QuoteCard content={String(data.content)} style={data.style} />;
}

export function AICardOverlay({
  overlay,
  fps,
  chapterIndex = 1,
  zIndex,
  srtEntries,
}: AICardOverlayProps) {
  if (overlay.overlayType !== 'ai-card' || !overlay.aiCardData) {
    return null;
  }

  const from = msToFrame(overlay.startMs, fps);
  const durationInFrames = Math.max(1, msToFrame(overlay.durationMs, fps));
  const isFullscreen = overlay.aiCardData.displayMode === 'fullscreen';
  const isMotionCard =
    overlay.aiCardData.renderMode === 'motion-card' &&
    !!overlay.aiCardData.motionCard?.compiledCode;
  // 自带 100%×100% 布局的卡片：motion / image / video。否则按 1920×1080 设计基准 + scale。
  const isMediaCard =
    overlay.aiCardData.cardType === 'image' || overlay.aiCardData.cardType === 'video';
  const isSpecialCard = isMotionCard || isMediaCard;
  const scale = Math.min(overlay.position.width / 1_920, overlay.position.height / 1_080);
  // Motion Card 需要知道 sequence 自己的宽高（非整个 composition），
  // PiP 模式下用 overlay 实际尺寸，fullscreen 模式回退到 1920x1080 设计基准。
  const motionWidth = isFullscreen ? 1920 : Math.max(1, overlay.position.width);
  const motionHeight = isFullscreen ? 1080 : Math.max(1, overlay.position.height);
  const renderContext: RenderCardContext = {
    motionDurationInFrames: durationInFrames,
    motionWidth,
    motionHeight,
    motionSubtitles: sliceSubtitlesForOverlay(srtEntries, overlay, fps),
  };
  const wrapperStyle: CSSProperties = isFullscreen
    ? { position: 'absolute', inset: 0, zIndex }
    : {
        position: 'absolute',
        left: overlay.position.x,
        top: overlay.position.y,
        width: overlay.position.width,
        height: overlay.position.height,
        borderRadius: 18,
        overflow: 'hidden',
        boxShadow: '0 10px 30px rgba(0,0,0,0.45)',
        zIndex,
      };
  // Motion Card 自身承载 props.width/height 的布局约束；传统卡片保留 1920×1080 设计
  // 并用 scale 落到 overlay 的像素盒子里。
  const contentStyle: CSSProperties = isSpecialCard
    ? { width: '100%', height: '100%' }
    : isFullscreen
      ? {}
      : { transform: `scale(${scale})`, transformOrigin: 'top left' };

  return (
    <Sequence from={from} durationInFrames={durationInFrames}>
      <div style={wrapperStyle}>
        <div style={contentStyle}>{renderCard(overlay, chapterIndex, renderContext)}</div>
      </div>
    </Sequence>
  );
}
