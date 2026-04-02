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

export interface OverlayItem {
  id: string;
  type: 'video' | 'image';
  assetPath: string;
  trackId: string;
  startMs: number;
  durationMs: number;
  position: OverlayPosition;
  overlayType?: 'media' | 'ai-card';
  overlayRole?: OverlayRole;
  aiCardData?: AICardOverlayData;
}

export interface SubtitleStyle {
  fontSize: number;
  color: string;
  position: 'top' | 'bottom' | 'center';
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
}

export type AssetType = 'video' | 'image' | 'audio' | 'srt';

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
    subtitle: {
      fontSize: 48,
      color: '#FFFFFF',
      position: 'bottom',
    },
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
