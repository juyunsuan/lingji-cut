import { getRenderableOverlays, getRenderableVisualTracks } from '../lib/timeline-tracks';
import { getEffectiveTimelineDurationMs, toFileSrc } from '../lib/utils';
import type { OverlayItem, SrtEntry, SubtitleHighlight, SubtitleStyle, TimelineData } from '../types';
import { filterValidSubtitleHighlights } from '../lib/subtitle-highlights';
import { isDataContent, isMediaContent } from '../types/ai';
import type { HyperframesCompositionInput, HyperframesCompositionResult } from './types';
import { hydrateAICardAssetPaths, isAbsoluteFilesystemPath } from './assets';

const SUBTITLE_Z_INDEX = 1000;
const BACKGROUND_Z_INDEX = 1;
const VISUAL_BASE_Z_INDEX = 10;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttr(value: string): string {
  return escapeHtml(value);
}

function escapeJs(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

function escapeScript(value: string): string {
  return value.replace(/<\/script/gi, '<\\/script');
}

function seconds(ms: number): string {
  return (Math.max(0, ms) / 1000).toFixed(3).replace(/\.?0+$/, '');
}

function cssNumber(value: number): string {
  return Number.isFinite(value) ? String(Math.round(value * 1000) / 1000) : '0';
}

function px(value: number): string {
  return `${cssNumber(value)}px`;
}

function mediaSrc(source: string): string {
  // 导出链路会先把绝对路径改写成相对的 assets/... 路径，这类相对路径原样返回。
  // 预览链路（含 npm run dev 的 http origin）拿到的是绝对文件路径，需要转成 file://，
  // 否则在 hyperframes-player 的 srcdoc iframe 里会被解析成 http://host/Users/... 而无法加载。
  if (!source || !isAbsoluteFilesystemPath(source)) {
    return source;
  }
  return toFileSrc(source);
}

function formatTime(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function styleToCss(style: Record<string, string | number | undefined>): string {
  return Object.entries(style)
    .filter(([, value]) => value !== undefined && value !== '')
    .map(([key, value]) => `${key}:${value}`)
    .join(';');
}

function getTrackZIndex(timeline: TimelineData, overlay: OverlayItem): number {
  if (overlay.overlayRole === 'default-background') return BACKGROUND_Z_INDEX;
  const map = new Map(getRenderableVisualTracks(timeline.tracks).map((track) => [track.id, track.order]));
  return VISUAL_BASE_Z_INDEX + (map.get(overlay.trackId) ?? 0);
}

function getVisualClipTrackIndex(index: number): number {
  return 100 + index;
}

function renderBaseStyle(overlay: OverlayItem, zIndex: number): string {
  return styleToCss({
    position: 'absolute',
    left: px(overlay.position.x),
    top: px(overlay.position.y),
    width: px(overlay.position.width),
    height: px(overlay.position.height),
    'z-index': zIndex,
    overflow: 'hidden',
  });
}

function renderMediaOverlay(overlay: OverlayItem, zIndex: number, trackIndex: number): string {
  const commonAttrs = [
    `id="${escapeAttr(overlay.id)}"`,
    `class="clip hf-overlay hf-media-overlay"`,
    `data-start="${seconds(overlay.startMs)}"`,
    `data-duration="${seconds(overlay.durationMs)}"`,
    `data-track-index="${trackIndex}"`,
    `style="${renderBaseStyle(overlay, zIndex)}"`,
  ].join(' ');
  if (overlay.type === 'video') {
    return `<video ${commonAttrs} src="${escapeAttr(mediaSrc(overlay.assetPath))}" muted playsinline preload="auto"></video>`;
  }
  return `<img ${commonAttrs} src="${escapeAttr(mediaSrc(overlay.assetPath))}" alt="" />`;
}

function renderAudioOverlay(overlay: OverlayItem, zIndex: number): string {
  const data = overlay.audioData;
  const volume = data?.muted ? 0 : Math.max(0, Math.min(1.5, data?.volume ?? 1));
  return `<audio id="${escapeAttr(overlay.id)}" class="clip" data-start="${seconds(overlay.startMs)}" data-duration="${seconds(overlay.durationMs)}" data-media-start="${seconds(data?.trimStartMs ?? 0)}" data-volume="${volume}" data-track-index="${zIndex}" src="${escapeAttr(mediaSrc(overlay.assetPath))}" preload="auto"></audio>`;
}

function renderTextOverlay(overlay: OverlayItem, zIndex: number, trackIndex: number): string {
  const text = overlay.textData;
  if (!text) return '';
  const css = styleToCss({
    ...Object.fromEntries(
      renderBaseStyle(overlay, zIndex)
        .split(';')
        .filter(Boolean)
        .map((item) => {
          const index = item.indexOf(':');
          return [item.slice(0, index), item.slice(index + 1)];
        }),
    ),
    display: 'flex',
    'align-items': 'center',
    'justify-content':
      text.textAlign === 'center' ? 'center' : text.textAlign === 'right' ? 'flex-end' : 'flex-start',
    'font-family': text.fontFamily,
    'font-size': px(text.fontSize),
    color: text.fontColor,
    'font-weight': text.bold ? '700' : '400',
    'font-style': text.italic ? 'italic' : 'normal',
    'text-decoration': text.underline ? 'underline' : 'none',
    'text-align': text.textAlign,
    'background-color': text.backgroundColor,
    '-webkit-text-stroke': text.strokeWidth > 0 ? `${px(text.strokeWidth)} ${text.strokeColor}` : undefined,
    'text-shadow':
      text.shadowBlur > 0 || text.shadowOffsetX !== 0 || text.shadowOffsetY !== 0
        ? `${px(text.shadowOffsetX)} ${px(text.shadowOffsetY)} ${px(text.shadowBlur)} ${text.shadowColor}`
        : undefined,
    'letter-spacing': px(text.letterSpacing),
    'line-height': text.lineHeight,
    opacity: text.opacity,
    transform: text.rotation ? `rotate(${text.rotation}deg)` : undefined,
    'word-break': 'break-word',
    'white-space': 'pre-wrap',
    padding: '0',
  });

  return `<div id="${escapeAttr(overlay.id)}" class="clip hf-overlay hf-text-overlay" data-start="${seconds(overlay.startMs)}" data-duration="${seconds(overlay.durationMs)}" data-track-index="${trackIndex}" style="${css}">${escapeHtml(text.content)}</div>`;
}

function renderLegacyCardContent(overlay: OverlayItem, chapterIndex: number): string {
  const card = overlay.aiCardData;
  if (!card) return '';
  const style = card.style;
  const bg = style.backgroundColor || '#151922';
  const accent = style.primaryColor || '#79c4ff';
  const title = escapeHtml(card.title || '');

  if ((card.cardType === 'image' || card.cardType === 'video') && isMediaContent(card.content)) {
    if (!card.content.assetPath) {
      return `<div class="hf-card-placeholder">素材生成中</div>`;
    }
    if (card.cardType === 'video') {
      return `<video class="hf-card-media" src="${escapeAttr(mediaSrc(card.content.assetPath))}" muted playsinline preload="auto"></video>`;
    }
    return `<img class="hf-card-media" src="${escapeAttr(mediaSrc(card.content.assetPath))}" alt="" />`;
  }

  if (card.cardType === 'data' && isDataContent(card.content)) {
    const max = Math.max(
      1,
      ...card.content.items.map((item) => {
        const n = typeof item.value === 'number' ? item.value : Number.parseFloat(String(item.value));
        return Number.isFinite(n) ? n : 1;
      }),
    );
    const bars = card.content.items
      .slice(0, 5)
      .map((item) => {
        const raw = typeof item.value === 'number' ? item.value : Number.parseFloat(String(item.value));
        const pct = Math.max(8, Math.min(100, ((Number.isFinite(raw) ? raw : 1) / max) * 100));
        return `<div class="hf-data-row"><span>${escapeHtml(item.label)}</span><b>${escapeHtml(String(item.value))}</b><i style="width:${pct}%"></i></div>`;
      })
      .join('');
    return `<div class="hf-card" style="--card-bg:${bg};--card-accent:${accent}"><div class="hf-card-kicker">DATA</div><h2>${title}</h2><div class="hf-data">${bars}</div></div>`;
  }

  if (card.cardType === 'chapter') {
    return `<div class="hf-card" style="--card-bg:${bg};--card-accent:${accent}"><div class="hf-card-kicker">CHAPTER ${chapterIndex}</div><h1>${title}</h1><div class="hf-card-rule"></div><p>${formatTime(card.sourceStartMs ?? overlay.startMs)} - ${formatTime(card.sourceEndMs ?? overlay.startMs + overlay.durationMs)}</p></div>`;
  }

  if (card.cardType === 'quote') {
    return `<div class="hf-card hf-quote" style="--card-bg:${bg};--card-accent:${accent}"><div class="hf-quote-mark">"</div><h2>${escapeHtml(String(card.content))}</h2><p>${title}</p></div>`;
  }

  const kicker = card.cardType.toUpperCase();
  return `<div class="hf-card" style="--card-bg:${bg};--card-accent:${accent}"><div class="hf-card-kicker">${kicker}</div><h2>${title}</h2><p>${escapeHtml(String(card.content))}</p></div>`;
}

function renderMotionCard(overlay: OverlayItem): string | null {
  const html = overlay.aiCardData?.motionCard?.html ?? '';
  if (html.trim()) return html;
  return null;
}

function renderAICardOverlay(
  overlay: OverlayItem,
  zIndex: number,
  trackIndex: number,
  chapterIndex: number,
): string {
  const card = overlay.aiCardData;
  if (!card) return '';
  if (card.renderMode === 'motion-card' && !card.motionCard?.html?.trim()) {
    throw new Error(`AI Motion Card 缺少 HyperFrames HTML：${overlay.id}`);
  }
  const fullscreen = card.displayMode === 'fullscreen';
  const wrapperStyle = fullscreen
    ? styleToCss({ position: 'absolute', inset: '0', 'z-index': zIndex, overflow: 'hidden' })
    : `${renderBaseStyle(overlay, zIndex)};border-radius:18px;box-shadow:0 10px 30px rgba(0,0,0,.45)`;
  const motionHtml = card.renderMode === 'motion-card' ? renderMotionCard(overlay) : null;
  return `<div id="${escapeAttr(overlay.id)}" class="clip hf-overlay hf-ai-card" data-start="${seconds(overlay.startMs)}" data-duration="${seconds(overlay.durationMs)}" data-track-index="${trackIndex}" style="${wrapperStyle}">${motionHtml ?? renderLegacyCardContent(overlay, chapterIndex)}</div>`;
}

function renderSubtitleEntry(
  entry: SrtEntry,
  style: SubtitleStyle,
  highlights: SubtitleHighlight[],
): string {
  const validHighlight = filterValidSubtitleHighlights([entry], highlights)[0];
  if (!validHighlight || !style.highlightEnabled) {
    return `<span class="hf-subtitle-text">${escapeHtml(entry.text)}</span>`;
  }
  const before = escapeHtml(entry.text.slice(0, validHighlight.start));
  const focus = escapeHtml(entry.text.slice(validHighlight.start, validHighlight.end));
  const after = escapeHtml(entry.text.slice(validHighlight.end));
  return `<span class="hf-subtitle-text">${before}<span class="hf-subtitle-highlight">${focus}</span>${after}</span>`;
}

function renderSubtitles(entries: SrtEntry[], style: SubtitleStyle, highlights: SubtitleHighlight[]): string {
  const positionClass = `hf-subtitles-${style.position}`;
  return entries
    .map((entry, index) => {
      const duration = Math.max(1, entry.endMs - entry.startMs);
      return `<div id="subtitle-${index}" class="clip hf-subtitle ${positionClass}" data-start="${seconds(entry.startMs)}" data-duration="${seconds(duration)}" data-track-index="${SUBTITLE_Z_INDEX}">${renderSubtitleEntry(entry, style, highlights)}</div>`;
    })
    .join('\n');
}

function renderGsapLoader(input: HyperframesCompositionInput): string {
  if (input.gsapScript) {
    return `<script>${escapeScript(input.gsapScript)}</script>`;
  }
  if (input.gsapSrc) {
    return `<script src="${escapeAttr(input.gsapSrc)}"></script>`;
  }
  throw new Error('HyperFrames composition requires gsapSrc or gsapScript');
}

function renderOverlayAnimationScript(visualOverlays: OverlayItem[]): string {
  const overlayIds = visualOverlays.map((overlay) => overlay.id);
  return `
    const motionTimelines = window.__lingjiMotionTimelines || [];
    const overlayIds = ${escapeJs(overlayIds)};
    for (const id of overlayIds) {
      const el = document.getElementById(id);
      if (!el) continue;
      const duration = Number(el.getAttribute('data-duration') || 0);
      const local = gsap.timeline({ paused: true });
      local.from(el, { opacity: 0, y: 18, duration: Math.min(0.45, Math.max(0.18, duration * 0.18)), ease: 'power2.out' }, 0);
      if (duration > 0.8) {
        local.to(el, { opacity: 0, y: -12, duration: Math.min(0.35, duration * 0.14), ease: 'power2.in' }, Math.max(0, duration - Math.min(0.35, duration * 0.14)));
      }
      tl.add(local, Number(el.getAttribute('data-start') || 0));
      // 子时间线以 paused:true 创建（避免在 add 前自走时钟），加入父时间线后必须交还控制权，
      // 否则父级 seek/play 不会驱动它，入场 from(opacity:0) 会把元素永久定格在隐藏态。
      local.paused(false);
    }
    Array.from(document.querySelectorAll('.hf-ai-card[data-start]')).forEach((el, index) => {
      const motion = motionTimelines[index];
      if (motion && typeof motion.pause === 'function') {
        tl.add(motion, Number(el.getAttribute('data-start') || 0));
        // Motion Card 的 timeline 同样按 paused:true 约定生成，加入后交还父级控制。
        motion.paused(false);
      }
    });
    ${renderSubtitleVisibilityScript()}
  `;
}

function renderSubtitleVisibilityScript(): string {
  // 预览 player 把 window.__timelines 里的 GSAP 时间线当作 direct-timeline 适配器直接
  // seek/play，不会注入 @hyperframes/core 运行时，因此 .clip 的 data-start/data-duration
  // 显隐控制不会自动生效。字幕没有进入主时间线 tl 时，所有字幕 div 会同时可见并堆叠在
  // 同一绝对定位处（“挤在一起”），且播放时不随播放头切换（“不动”）。这里把字幕显隐写进
  // tl，让预览的 direct-timeline 适配器驱动；导出链路的运行时会嵌套 tl，行为保持一致。
  return `
    Array.from(document.querySelectorAll('.hf-subtitle[data-start]')).forEach((el) => {
      const start = Number(el.getAttribute('data-start') || 0);
      const duration = Number(el.getAttribute('data-duration') || 0);
      // 立即隐藏，避免主时间线首帧渲染前出现闪烁。
      gsap.set(el, { autoAlpha: 0 });
      // 进入主时间线：t=0 隐藏（保证反向 seek 回到起点仍隐藏）→ 字幕窗口内显示 → 窗口结束后隐藏。
      tl.set(el, { autoAlpha: 0 }, 0);
      tl.set(el, { autoAlpha: 1 }, start);
      if (duration > 0) {
        tl.set(el, { autoAlpha: 0 }, start + duration);
      }
    });
  `;
}

function renderHtml(input: HyperframesCompositionInput): HyperframesCompositionResult {
  const timeline = hydrateAICardAssetPaths(input.timeline, input.projectDir ?? null);
  const durationMs = getEffectiveTimelineDurationMs(timeline);
  const renderable = getRenderableOverlays(timeline);
  const audioOverlays = renderable.filter((overlay) => overlay.type === 'audio');
  const visualOverlays = renderable.filter((overlay) => overlay.type !== 'audio');
  let chapterIndex = 0;
  const visualHtml = visualOverlays
    .map((overlay, index) => {
      const zIndex = getTrackZIndex(timeline, overlay);
      const trackIndex = getVisualClipTrackIndex(index);
      if (overlay.overlayType === 'ai-card') {
        chapterIndex += 1;
        return renderAICardOverlay(overlay, zIndex, trackIndex, chapterIndex);
      }
      if (overlay.type === 'text') return renderTextOverlay(overlay, zIndex, trackIndex);
      return renderMediaOverlay(overlay, zIndex, trackIndex);
    })
    .join('\n');
  const audioHtml = [
    timeline.podcast.audioPath
      ? `<audio id="podcast-audio" data-start="0" data-duration="${seconds(timeline.podcast.durationMs || durationMs)}" data-volume="1" data-track-index="0" src="${escapeAttr(mediaSrc(timeline.podcast.audioPath))}" preload="auto"></audio>`
      : '',
    ...audioOverlays.map((overlay, index) => renderAudioOverlay(overlay, 2000 + index)),
  ].join('\n');

  const subtitleCss = styleToCss({
    'font-size': px(timeline.subtitle.fontSize),
    color: timeline.subtitle.color,
  });

  const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Lingji HyperFrames Composition</title>
  <style>
    html, body { margin: 0; width: 100%; height: 100%; background: #04060a; overflow: hidden; }
    #lingji-composition { position: relative; width: ${timeline.width}px; height: ${timeline.height}px; overflow: hidden; background: #04060a; font-family: Inter, system-ui, sans-serif; }
    .hf-media-overlay, .hf-card-media { object-fit: cover; width: 100%; height: 100%; }
    .hf-ai-card { background: #151922; color: #f6f8fb; }
    .hf-card { width: 100%; height: 100%; box-sizing: border-box; padding: 7.5%; display: flex; flex-direction: column; justify-content: center; gap: 28px; background: var(--card-bg); color: #f6f8fb; }
    .hf-card h1 { margin: 0; font-size: 112px; line-height: 1.04; letter-spacing: 0; color: var(--card-accent); }
    .hf-card h2 { margin: 0; font-size: 72px; line-height: 1.12; letter-spacing: 0; }
    .hf-card p { margin: 0; max-width: 72%; font-size: 34px; line-height: 1.45; color: rgba(246,248,251,.82); }
    .hf-card-kicker { font: 700 24px/1 "JetBrains Mono", ui-monospace, monospace; color: var(--card-accent); letter-spacing: .12em; }
    .hf-card-rule { width: 12%; height: 6px; background: var(--card-accent); }
    .hf-quote-mark { font-size: 150px; line-height: .8; color: var(--card-accent); }
    .hf-data { display: grid; gap: 18px; }
    .hf-data-row { position: relative; display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 20px; align-items: center; font-size: 28px; padding-bottom: 12px; }
    .hf-data-row i { position: absolute; left: 0; bottom: 0; height: 4px; background: var(--card-accent); display: block; }
    .hf-card-placeholder, .hf-motion-card-source { width: 100%; height: 100%; display: grid; place-items: center; font-size: 28px; color: #f6f8fb; background: #101827; }
    .hf-subtitle { position: absolute; left: 0; right: 0; z-index: ${SUBTITLE_Z_INDEX}; text-align: center; padding: 0 80px; box-sizing: border-box; pointer-events: none; }
    .hf-subtitles-top { top: 60px; }
    .hf-subtitles-center { top: 50%; transform: translateY(-50%); }
    .hf-subtitles-bottom { bottom: 64px; }
    .hf-subtitle-text { ${subtitleCss}; display: inline-block; max-width: 100%; white-space: pre-line; font-weight: 700; line-height: 1.42; text-shadow: 0 2px 10px rgba(0,0,0,.72), 0 0 24px rgba(0,0,0,.55); }
    .hf-subtitle-highlight { display: inline-block; margin: 0 .12em; padding: ${px(timeline.subtitle.highlightPaddingY)} ${px(timeline.subtitle.highlightPaddingX)}; border-radius: ${px(timeline.subtitle.highlightRadius)}; background: ${timeline.subtitle.highlightBackgroundColor}; color: ${timeline.subtitle.highlightTextColor}; box-shadow: 0 10px 24px rgba(0,0,0,.28); }
  </style>
</head>
<body>
  ${renderGsapLoader(input)}
  <script>window.__lingjiMotionTimelines = [];</script>
  <div id="lingji-composition" data-composition-id="lingji-composition" data-start="0" data-duration="${seconds(durationMs)}" data-width="${timeline.width}" data-height="${timeline.height}">
    ${audioHtml}
    ${visualHtml}
    ${renderSubtitles(input.srtEntries, timeline.subtitle, timeline.subtitleHighlights ?? [])}
  </div>
  <script>
    window.__timelines = window.__timelines || {};
    const tl = gsap.timeline({ paused: true });
    ${renderOverlayAnimationScript(visualOverlays)}
    window.__timelines["lingji-composition"] = tl;
  </script>
</body>
</html>`;

  return {
    html,
    durationMs,
    width: timeline.width,
    height: timeline.height,
    fps: timeline.fps || 30,
  };
}

export function createHyperframesComposition(
  input: HyperframesCompositionInput,
): HyperframesCompositionResult {
  return renderHtml(input);
}
