import type { AICardOverlayData } from './types/ai';

export interface SrtEntry {
  index: number;
  startMs: number;
  endMs: number;
  text: string;
}

export interface OverlayPosition {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type OverlayRole = 'default-background';

export type TimelineTrackKind = 'audio' | 'subtitle' | 'visual';

export interface TimelineTrack {
  id: string;
  kind: TimelineTrackKind;
  label: string;
  order: number;
  locked?: boolean;
}

export interface AudioOverlayData {
  /** 线性音量 0..1.5，1 表示原始响度 */
  volume: number;
  /** 淡入时长（毫秒） */
  fadeInMs: number;
  /** 淡出时长（毫秒） */
  fadeOutMs: number;
  /** 源音频裁剪起点（毫秒），从源文件的该位置开始播放 */
  trimStartMs: number;
  /** 源音频总时长（毫秒），用于 UI 限制裁剪上限 */
  sourceDurationMs: number;
  /** 静音 */
  muted?: boolean;
}

export interface OverlayItem {
  id: string;
  type: 'video' | 'image' | 'text' | 'audio';
  assetPath: string;
  trackId: string;
  startMs: number;
  durationMs: number;
  position: OverlayPosition;
  motion?: OverlayMotion;
  overlayType?: 'media' | 'ai-card';
  overlayRole?: OverlayRole;
  aiCardData?: AICardOverlayData;
  textData?: TextOverlayData;
  audioData?: AudioOverlayData;
}

export function createDefaultAudioOverlayData(sourceDurationMs: number): AudioOverlayData {
  return {
    volume: 1,
    fadeInMs: 0,
    fadeOutMs: 0,
    trimStartMs: 0,
    sourceDurationMs: Math.max(0, Math.round(sourceDurationMs)),
  };
}

export interface SubtitleStyle {
  fontSize: number;
  color: string;
  position: 'top' | 'bottom' | 'center';
  highlightEnabled: boolean;
  highlightBackgroundColor: string;
  highlightTextColor: string;
  highlightPaddingX: number;
  highlightPaddingY: number;
  highlightRadius: number;
  highlightAnimation: 'pop' | 'wipe' | 'none';
}

export interface SubtitleHighlight {
  entryIndex: number;
  start: number;
  end: number;
  highlightText: string;
  sourceText: string;
}

// ── Text Overlay Types ──

export type TextEnterAnimation =
  | 'none' | 'fadeIn' | 'slideInLeft' | 'slideInRight'
  | 'slideInUp' | 'slideInDown' | 'scaleIn' | 'bounceIn';

export type TextExitAnimation =
  | 'none' | 'fadeOut' | 'slideOutLeft' | 'slideOutRight'
  | 'slideOutUp' | 'slideOutDown' | 'scaleOut' | 'bounceOut';

export type TextLoopAnimation =
  | 'none' | 'pulse' | 'float' | 'flicker' | 'typewriter';

export type OverlayEnterAnimation = Exclude<TextEnterAnimation, never>;
export type OverlayExitAnimation = Exclude<TextExitAnimation, never>;
export type OverlayLoopAnimation = Exclude<TextLoopAnimation, 'typewriter'>;

export interface OverlayMotion {
  enter: OverlayEnterAnimation;
  enterDurationMs: number;
  exit: OverlayExitAnimation;
  exitDurationMs: number;
  loop: OverlayLoopAnimation;
}

export interface TextAnimation {
  enter: TextEnterAnimation;
  enterDurationMs: number;
  exit: TextExitAnimation;
  exitDurationMs: number;
  loop: TextLoopAnimation;
}

export interface TextOverlayData {
  content: string;
  fontFamily: string;
  fontSize: number;
  fontColor: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  textAlign: 'left' | 'center' | 'right';
  backgroundColor: string;
  strokeColor: string;
  strokeWidth: number;
  shadowColor: string;
  shadowOffsetX: number;
  shadowOffsetY: number;
  shadowBlur: number;
  letterSpacing: number;
  lineHeight: number;
  opacity: number;
  rotation: number;
  animation: TextAnimation;
}

export interface TimelineData {
  version: number;
  fps: number;
  width: number;
  height: number;
  podcast: {
    audioPath: string;
    srtPath: string;
    durationMs: number;
  };
  tracks: TimelineTrack[];
  overlays: OverlayItem[];
  subtitle: SubtitleStyle;
  subtitleHighlights?: SubtitleHighlight[];
}

export type AssetType = 'video' | 'image' | 'audio' | 'srt' | 'text';

export interface AssetItem {
  path: string;
  type: AssetType;
  name: string;
  durationMs: number;
  locked?: boolean;
}

export const DEFAULT_TIMELINE_VERSION = 2;
export const DEFAULT_AUDIO_TRACK_ID = 'audio';
export const DEFAULT_SUBTITLE_TRACK_ID = 'subtitle';
export const DEFAULT_VISUAL_TRACK_ID = 'visual-1';
export const DEFAULT_AI_CARDS_TRACK_ID = 'visual-2';
export const DEFAULT_AUDIO_OVERLAY_TRACK_ID = 'audio-overlay-1';

export function createAudioOverlayTrack(index: number): TimelineTrack {
  return {
    id: `audio-overlay-${index}`,
    kind: 'audio',
    label: `音轨 ${index}`,
    order: index,
  };
}

export function createVisualTrack(index: number, order = index): TimelineTrack {
  return {
    id: `visual-${index}`,
    kind: 'visual',
    label: `轨道 ${index}`,
    order,
  };
}

export function createDefaultTracks(): TimelineTrack[] {
  return [
    {
      id: DEFAULT_AUDIO_TRACK_ID,
      kind: 'audio',
      label: '口播轨',
      order: 0,
      locked: true,
    },
    {
      id: DEFAULT_SUBTITLE_TRACK_ID,
      kind: 'subtitle',
      label: '字幕轨',
      order: 0,
      locked: true,
    },
    createVisualTrack(1),
  ];
}

export function createDefaultTimeline(): TimelineData {
  return {
    version: DEFAULT_TIMELINE_VERSION,
    fps: 30,
    width: 1920,
    height: 1080,
    podcast: {
      audioPath: '',
      srtPath: '',
      durationMs: 0,
    },
    tracks: createDefaultTracks(),
    overlays: [],
    subtitle: createDefaultSubtitleStyle(),
    subtitleHighlights: [],
  };
}

export function createDefaultSubtitleStyle(): SubtitleStyle {
  return {
    fontSize: 48,
    color: '#FFFFFF',
    position: 'bottom',
    highlightEnabled: false,
    highlightBackgroundColor: '#F8DC48',
    highlightTextColor: '#111827',
    highlightPaddingX: 10,
    highlightPaddingY: 4,
    highlightRadius: 12,
    highlightAnimation: 'pop',
  };
}

export function sortOverlaysByStart(overlays: OverlayItem[]): OverlayItem[] {
  return [...overlays].sort((left, right) => {
    if (left.startMs !== right.startMs) {
      return left.startMs - right.startMs;
    }

    return left.id.localeCompare(right.id);
  });
}
