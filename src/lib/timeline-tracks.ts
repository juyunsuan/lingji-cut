import {
  DEFAULT_AUDIO_TRACK_ID,
  DEFAULT_SUBTITLE_TRACK_ID,
  DEFAULT_TIMELINE_VERSION,
  DEFAULT_VISUAL_TRACK_ID,
  createVisualTrack,
  sortOverlaysByStart,
  type OverlayItem,
  type TimelineData,
  type TimelineTrack,
} from '../types';

function buildLockedTrack(id: string, label: string, kind: 'audio' | 'subtitle'): TimelineTrack {
  return {
    id,
    kind,
    label,
    order: 0,
    locked: true,
  };
}

function dedupeTracks(tracks: TimelineTrack[]): TimelineTrack[] {
  const seen = new Set<string>();

  return tracks.filter((track) => {
    if (seen.has(track.id)) {
      return false;
    }

    seen.add(track.id);
    return true;
  });
}

export function getVisualTracks(tracks: TimelineTrack[]): TimelineTrack[] {
  return tracks
    .filter((track) => track.kind === 'visual')
    .sort((left, right) => {
      if (left.order !== right.order) {
        return right.order - left.order;
      }

      return left.id.localeCompare(right.id);
    });
}

export function getRenderableVisualTracks(tracks: TimelineTrack[]): TimelineTrack[] {
  return [...getVisualTracks(tracks)].reverse();
}

export function getNextVisualTrack(tracks: TimelineTrack[]): TimelineTrack {
  const visualTracks = getVisualTracks(tracks);
  const nextOrder = (visualTracks[0]?.order ?? 0) + 1;
  const nextIndex =
    visualTracks.reduce((maxValue, track) => {
      const match = track.id.match(/visual-(\d+)/);
      const parsed = match ? Number.parseInt(match[1], 10) : 0;
      return Number.isFinite(parsed) ? Math.max(maxValue, parsed) : maxValue;
    }, 0) + 1;

  return createVisualTrack(nextIndex, nextOrder);
}

export function normalizeTimelineData(timeline: TimelineData): TimelineData {
  const rawTracks = Array.isArray(timeline.tracks) ? timeline.tracks : [];
  const rawOverlays = Array.isArray(timeline.overlays) ? timeline.overlays : [];
  const visualTracks = rawTracks.filter((track) => track.kind === 'visual');
  const normalizedVisualTracks =
    visualTracks.length > 0
      ? dedupeTracks(
          visualTracks.map((track, index) => ({
            ...track,
            kind: 'visual',
            label: track.label || `轨道 ${index + 1}`,
            order: Number.isFinite(track.order) ? track.order : index + 1,
          })),
        )
      : [createVisualTrack(1)];

  const normalizedTracks = [
    buildLockedTrack(DEFAULT_AUDIO_TRACK_ID, '口播轨', 'audio'),
    buildLockedTrack(DEFAULT_SUBTITLE_TRACK_ID, '字幕轨', 'subtitle'),
    ...normalizedVisualTracks,
  ];
  const visualTrackIds = new Set(normalizedVisualTracks.map((track) => track.id));
  const fallbackTrackId = normalizedVisualTracks[0]?.id ?? DEFAULT_VISUAL_TRACK_ID;

  return {
    ...timeline,
    version: DEFAULT_TIMELINE_VERSION,
    tracks: normalizedTracks,
    overlays: sortOverlaysByStart(
      rawOverlays.map((overlay) => ({
        ...overlay,
        trackId: visualTrackIds.has(overlay.trackId) ? overlay.trackId : fallbackTrackId,
      })),
    ),
  };
}

export function getRenderableOverlays(timeline: TimelineData): OverlayItem[] {
  const trackOrderMap = new Map(
    getRenderableVisualTracks(timeline.tracks).map((track) => [track.id, track.order]),
  );

  return [...timeline.overlays].sort((left, right) => {
    const leftIsBackground = left.overlayRole === 'default-background';
    const rightIsBackground = right.overlayRole === 'default-background';

    if (leftIsBackground !== rightIsBackground) {
      return leftIsBackground ? -1 : 1;
    }

    const leftOrder = trackOrderMap.get(left.trackId) ?? 0;
    const rightOrder = trackOrderMap.get(right.trackId) ?? 0;

    if (leftOrder !== rightOrder) {
      return leftOrder - rightOrder;
    }

    if (left.startMs !== right.startMs) {
      return left.startMs - right.startMs;
    }

    return left.id.localeCompare(right.id);
  });
}
