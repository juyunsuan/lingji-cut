import { create } from 'zustand';
import { v4 as uuid } from 'uuid';
import type {
  AssetItem,
  AssetType,
  OverlayItem,
  SrtEntry,
  SubtitleHighlight,
  SubtitleStyle,
  TimelineData,
} from '../types';
import { DEFAULT_VISUAL_TRACK_ID, DEFAULT_AI_CARDS_TRACK_ID, createDefaultTimeline, createVisualTrack } from '../types';
import type { AICardTimelineDraft } from '../types/ai';
import { getFileNameFromPath } from '../lib/utils';
import { getNextVisualTrack, normalizeTimelineData } from '../lib/timeline-tracks';
import { getAICardOverlayPosition, isFullscreenAICardPosition } from '../lib/ai-card-layout';
import {
  clampOverlayDurationByNeighbors,
  findAvailableTrack,
  findNearestAvailablePlacement,
  isOverlayTrackManaged,
} from '../lib/timeline-placement';

type OverlayDraft = Omit<OverlayItem, 'id'>;
type TimelineSnapshot = TimelineData;
type TimelineCommitState = Pick<TimelineStore, 'timeline' | 'assets' | 'historyPast'>;
type OverlayClipboardMode = 'copy' | 'cut';
type OverlayClipboardItem = OverlayDraft & { mode: OverlayClipboardMode };

export interface RecentProject {
  path: string;
  name: string;
  lastOpenedAt: number;
}

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export interface TimelineStore {
  timeline: TimelineData;
  srtEntries: SrtEntry[];
  assets: AssetItem[];
  overlayClipboard: OverlayClipboardItem | null;
  canUndo: boolean;
  canRedo: boolean;
  setTimeline: (timeline: TimelineData) => void;
  setSrtEntries: (entries: SrtEntry[]) => void;
  setSubtitleHighlights: (highlights: SubtitleHighlight[]) => void;
  clearSubtitleHighlights: () => void;
  updateSubtitleStyle: (updates: Partial<SubtitleStyle>) => void;
  setPodcast: (audioPath: string, srtPath: string, durationMs: number) => void;
  setGlobalBackground: (path: string) => void;
  addAsset: (path: string, type: AssetType, durationMs?: number) => void;
  addAssets: (items: { path: string; type: AssetType; durationMs?: number }[]) => void;
  removeAsset: (path: string) => void;
  addTrack: () => string;
  removeTrack: (id: string) => void;
  addOverlay: (overlay: OverlayDraft) => string;
  addAICardsToTimeline: (cards: AICardTimelineDraft[]) => void;
  removeAICardOverlaysBySourceIds: (sourceCardIds: string[]) => void;
  copyOverlay: (id: string) => boolean;
  cutOverlay: (id: string) => boolean;
  pasteOverlay: (options: { trackId: string; startMs: number }) => string | null;
  updateOverlay: (id: string, updates: Partial<OverlayItem>) => void;
  removeOverlay: (id: string) => void;
  undo: () => void;
  redo: () => void;
  historyPast: TimelineSnapshot[];
  historyFuture: TimelineSnapshot[];
}

const PROJECT_DIR_KEY = 'podcast-editor-project-dir';
const RECENT_PROJECTS_KEY = 'podcast-editor-recent-projects';
const MAX_TIMELINE_HISTORY = 40;
let currentSaveStatus: SaveStatus = 'idle';
const saveStatusListeners = new Set<(status: SaveStatus) => void>();

const buildAsset = (
  path: string,
  type: AssetType,
  durationMs = type === 'image' || type === 'text' ? 5000 : 10000,
  locked = false,
): AssetItem => ({
  path,
  type,
  name: getFileNameFromPath(path),
  durationMs,
  ...(locked ? { locked: true } : {}),
});

const dedupeAssets = (assets: AssetItem[]): AssetItem[] => {
  const assetMap = new Map<string, AssetItem>();

  for (const asset of assets) {
    assetMap.set(asset.path, asset);
  }

  return [...assetMap.values()];
};

function isMediaOverlay(overlay: OverlayItem): boolean {
  return overlay.overlayType !== 'ai-card' && Boolean(overlay.assetPath);
}

function getDefaultBackgroundDuration(timeline: TimelineData): number {
  return Math.max(1_000, timeline.podcast.durationMs || 5_000);
}

function getDefaultBackgroundTrackId(timeline: TimelineData): string {
  const tracks = Array.isArray(timeline.tracks) ? timeline.tracks : [];
  const visualTracks = tracks.filter((track) => track.kind === 'visual');

  if (visualTracks.length === 0) {
    return DEFAULT_VISUAL_TRACK_ID;
  }

  return [...visualTracks]
    .sort((left, right) => {
      if (left.order !== right.order) {
        return left.order - right.order;
      }

      return left.id.localeCompare(right.id);
    })[0]
    .id;
}

function normalizeDefaultBackgroundOverlays(timeline: TimelineData): TimelineData {
  const overlays = Array.isArray(timeline.overlays) ? timeline.overlays : [];
  const hasDefaultBackground = overlays.some(
    (overlay) => overlay.overlayRole === 'default-background',
  );

  if (!hasDefaultBackground) {
    return timeline;
  }

  const trackId = getDefaultBackgroundTrackId(timeline);
  const durationMs = getDefaultBackgroundDuration(timeline);

  return {
    ...timeline,
    overlays: overlays.map((overlay) =>
      overlay.overlayRole === 'default-background'
        ? {
            ...overlay,
            type: 'image',
            trackId,
            startMs: 0,
            durationMs,
            position: {
              x: 0,
              y: 0,
              width: timeline.width,
              height: timeline.height,
            },
          }
        : overlay,
    ),
  };
}

const buildPodcastAssets = (timeline: TimelineData): AssetItem[] => {
  const assets: AssetItem[] = [];

  if (timeline.podcast.audioPath) {
    assets.push(buildAsset(timeline.podcast.audioPath, 'audio', timeline.podcast.durationMs, true));
  }

  if (timeline.podcast.srtPath) {
    assets.push(buildAsset(timeline.podcast.srtPath, 'srt', timeline.podcast.durationMs, true));
  }

  return assets;
};

const deriveAssetsFromTimeline = (timeline: TimelineData): AssetItem[] => {
  return dedupeAssets(
    [
      ...buildPodcastAssets(timeline),
      ...timeline.overlays.filter(isMediaOverlay).map((overlay) =>
        buildAsset(overlay.assetPath, overlay.type, overlay.durationMs),
      ),
    ],
  );
};

const syncAssetsWithTimeline = (assets: AssetItem[], timeline: TimelineData): AssetItem[] => {
  const persistentAssets = assets.filter(
    (asset) =>
      !asset.locked &&
      asset.path !== timeline.podcast.audioPath &&
      asset.path !== timeline.podcast.srtPath &&
      !timeline.overlays.some((overlay) => isMediaOverlay(overlay) && overlay.assetPath === asset.path),
  );

  return dedupeAssets([...persistentAssets, ...deriveAssetsFromTimeline(timeline)]);
};

const cloneTimeline = (timeline: TimelineData): TimelineData =>
  JSON.parse(JSON.stringify(timeline)) as TimelineData;

const cloneOverlayDraft = <T extends OverlayDraft>(overlay: T): T =>
  JSON.parse(JSON.stringify(overlay)) as T;

function buildOverlayClipboardItem(overlay: OverlayItem): OverlayClipboardItem {
  const { id: _id, ...draft } = overlay;
  return {
    ...cloneOverlayDraft(draft),
    mode: 'copy',
  };
}

const normalizeTimeline = (timeline: TimelineData): TimelineData =>
  normalizeTimelineData(cloneTimeline(normalizeDefaultBackgroundOverlays(timeline)));

const pushHistorySnapshot = (
  past: TimelineSnapshot[],
  timeline: TimelineData,
): TimelineSnapshot[] => [...past.slice(-(MAX_TIMELINE_HISTORY - 1)), cloneTimeline(timeline)];

function buildCommittedTimelineState(
  state: TimelineCommitState,
  nextTimeline: TimelineData,
  options?: {
    assetSource?: AssetItem[];
    overlayClipboard?: OverlayClipboardItem | null;
  },
) {
  const assetSource = options?.assetSource ?? state.assets;

  return {
    historyPast: pushHistorySnapshot(state.historyPast, state.timeline),
    historyFuture: [],
    canUndo: true,
    canRedo: false,
    timeline: nextTimeline,
    assets: syncAssetsWithTimeline(assetSource, nextTimeline),
    ...(options && 'overlayClipboard' in options
      ? { overlayClipboard: options.overlayClipboard ?? null }
      : {}),
  };
}

function resolveOverlayInsert(
  state: TimelineCommitState,
  draft: OverlayItem,
): { overlay: OverlayItem; createdTrack?: ReturnType<typeof getNextVisualTrack> } {
  if (!isOverlayTrackManaged(draft)) {
    return { overlay: draft };
  }

  const sameTrackResult = findNearestAvailablePlacement({
    targetStartMs: draft.startMs,
    durationMs: draft.durationMs,
    trackId: draft.trackId,
    overlays: state.timeline.overlays,
  });

  if (sameTrackResult.fits) {
    return { overlay: { ...draft, startMs: sameTrackResult.startMs } };
  }

  const otherTrackResult = findAvailableTrack({
    targetStartMs: draft.startMs,
    durationMs: draft.durationMs,
    overlays: state.timeline.overlays,
    tracks: state.timeline.tracks,
  });

  if (otherTrackResult.trackId) {
    return {
      overlay: {
        ...draft,
        trackId: otherTrackResult.trackId,
        startMs: otherTrackResult.startMs,
      },
    };
  }

  const newTrack = getNextVisualTrack(state.timeline.tracks);
  return {
    overlay: { ...draft, trackId: newTrack.id },
    createdTrack: newTrack,
  };
}

function emitSaveStatus(status: SaveStatus): void {
  currentSaveStatus = status;
  for (const listener of saveStatusListeners) {
    listener(status);
  }
}

function getStorageItem(key: string): string {
  if (!hasBrowserStorage()) {
    return '';
  }

  return window.localStorage.getItem(key) || '';
}

function setStorageItem(key: string, value: string): void {
  if (!hasBrowserStorage()) {
    return;
  }

  window.localStorage.setItem(key, value);
}

function removeStorageItem(key: string): void {
  if (!hasBrowserStorage()) {
    return;
  }

  window.localStorage.removeItem(key);
}

function persistRecentProjects(projects: RecentProject[]): void {
  setStorageItem(RECENT_PROJECTS_KEY, JSON.stringify(projects));
}

export function getCurrentSaveStatus(): SaveStatus {
  return currentSaveStatus;
}

export function subscribeToSaveStatus(listener: (status: SaveStatus) => void): () => void {
  saveStatusListeners.add(listener);
  listener(currentSaveStatus);
  return () => {
    saveStatusListeners.delete(listener);
  };
}

export const useTimelineStore = create<TimelineStore>((set) => ({
  timeline: createDefaultTimeline(),
  srtEntries: [],
  assets: [],
  overlayClipboard: null,
  canUndo: false,
  canRedo: false,
  historyPast: [],
  historyFuture: [],
  setTimeline: (timeline) =>
    set(() => {
      const normalizedTimeline = normalizeTimeline(timeline);

      return {
        timeline: normalizedTimeline,
        assets: syncAssetsWithTimeline([], normalizedTimeline),
        overlayClipboard: null,
        historyPast: [],
        historyFuture: [],
        canUndo: false,
        canRedo: false,
      };
    }),
  setSrtEntries: (entries) => set({ srtEntries: entries }),
  setSubtitleHighlights: (highlights) =>
    set((state) => {
      const nextTimeline = normalizeTimeline({
        ...state.timeline,
        subtitleHighlights: [...highlights],
      });

      return buildCommittedTimelineState(state, nextTimeline);
    }),
  clearSubtitleHighlights: () =>
    set((state) => {
      const nextTimeline = normalizeTimeline({
        ...state.timeline,
        subtitleHighlights: [],
      });

      return buildCommittedTimelineState(state, nextTimeline);
    }),
  updateSubtitleStyle: (updates) =>
    set((state) => {
      const nextTimeline = normalizeTimeline({
        ...state.timeline,
        subtitle: {
          ...state.timeline.subtitle,
          ...updates,
        },
      });

      return buildCommittedTimelineState(state, nextTimeline);
    }),
  setPodcast: (audioPath, srtPath, durationMs) =>
    set((state) => {
      const nextTimeline = normalizeTimeline({
        ...state.timeline,
        podcast: {
          audioPath,
          srtPath,
          durationMs,
        },
      });

      return buildCommittedTimelineState(state, nextTimeline);
    }),
  setGlobalBackground: (path) =>
    set((state) => {
      const existingOverlay = state.timeline.overlays.find(
        (overlay) => overlay.overlayRole === 'default-background',
      );
      const backgroundOverlay: OverlayItem = {
        id: existingOverlay?.id ?? `background-${uuid()}`,
        type: 'image',
        assetPath: path,
        trackId: existingOverlay?.trackId ?? DEFAULT_VISUAL_TRACK_ID,
        startMs: 0,
        durationMs: getDefaultBackgroundDuration(state.timeline),
        position: {
          x: 0,
          y: 0,
          width: state.timeline.width,
          height: state.timeline.height,
        },
        overlayRole: 'default-background',
      };
      const overlays = existingOverlay
        ? state.timeline.overlays.map((overlay) =>
            overlay.overlayRole === 'default-background' ? backgroundOverlay : overlay,
          )
        : [backgroundOverlay, ...state.timeline.overlays];
      const nextTimeline = normalizeTimeline({
        ...state.timeline,
        overlays,
      });

      return buildCommittedTimelineState(state, nextTimeline);
    }),
  addAsset: (path, type, durationMs) =>
    set((state) => ({
      assets: dedupeAssets([...state.assets, buildAsset(path, type, durationMs)]),
    })),
  addAssets: (items) =>
    set((state) => ({
      assets: dedupeAssets([
        ...state.assets,
        ...items.map((i) => buildAsset(i.path, i.type, i.durationMs)),
      ]),
    })),
  removeAsset: (path) =>
    set((state) => {
      const targetAsset = state.assets.find((asset) => asset.path === path);
      if (!targetAsset || targetAsset.locked) {
        return {};
      }

      const nextTimeline = normalizeTimeline({
        ...state.timeline,
        overlays: state.timeline.overlays.filter((overlay) => overlay.assetPath !== path),
      });

      return buildCommittedTimelineState(state, nextTimeline, {
        assetSource: state.assets.filter((asset) => asset.path !== path),
      });
    }),
  addTrack: () => {
    const track = getNextVisualTrack(useTimelineStore.getState().timeline.tracks);

    set((state) => {
      const nextTimeline = normalizeTimeline({
        ...state.timeline,
        tracks: [...state.timeline.tracks, track],
      });

      return buildCommittedTimelineState(state, nextTimeline);
    });

    return track.id;
  },
  removeTrack: (id) =>
    set((state) => {
      const target = state.timeline.tracks.find((track) => track.id === id);
      // 音频轨和字幕轨禁止删除
      if (!target || target.locked || target.kind === 'audio' || target.kind === 'subtitle') {
        return {};
      }

      const nextTimeline = normalizeTimeline({
        ...state.timeline,
        tracks: state.timeline.tracks.filter((track) => track.id !== id),
        overlays: state.timeline.overlays.filter((overlay) => overlay.trackId !== id),
      });

      return buildCommittedTimelineState(state, nextTimeline);
    }),
  addOverlay: (overlay) => {
    const id = uuid();
    set((state) => {
      const { overlay: resolved, createdTrack } = resolveOverlayInsert(
        state,
        { ...overlay, id },
      );
      const tracks = createdTrack
        ? [...state.timeline.tracks, createdTrack]
        : state.timeline.tracks;
      const nextTimeline = normalizeTimeline({
        ...state.timeline,
        tracks,
        overlays: [...state.timeline.overlays, resolved],
      });

      return buildCommittedTimelineState(state, nextTimeline);
    });

    return id;
  },
  addAICardsToTimeline: (cards) =>
    set((state) => {
      const existingAITrack = state.timeline.tracks.find(
        (track) => track.id === DEFAULT_AI_CARDS_TRACK_ID,
      );
      const trackId = existingAITrack?.id ?? DEFAULT_AI_CARDS_TRACK_ID;
      const tracks = existingAITrack
        ? state.timeline.tracks
        : [...state.timeline.tracks, createVisualTrack(2, 2)];
      const overlays = [...state.timeline.overlays];

      for (const card of cards) {
        const existingOverlayIndex = overlays.findIndex(
          (overlay) =>
            overlay.overlayType === 'ai-card' &&
            overlay.aiCardData?.sourceCardId === card.sourceCardId,
        );
        const nextDefaultPosition = getAICardOverlayPosition(
          card.aiCardData.displayMode,
          state.timeline.width,
          state.timeline.height,
        );

        if (existingOverlayIndex >= 0) {
          const existingOverlay = overlays[existingOverlayIndex];
          const shouldResetPosition =
            existingOverlay.aiCardData?.displayMode !== card.aiCardData.displayMode ||
            (card.aiCardData.displayMode === 'pip' &&
              isFullscreenAICardPosition(
                existingOverlay.position,
                state.timeline.width,
                state.timeline.height,
              ));
          overlays[existingOverlayIndex] = {
            ...existingOverlay,
            type: 'image',
            assetPath: '',
            startMs: card.startMs,
            durationMs: card.durationMs,
            position: shouldResetPosition ? nextDefaultPosition : existingOverlay.position,
            overlayType: 'ai-card',
            aiCardData: {
              ...card.aiCardData,
              sourceCardId: card.sourceCardId,
            },
          };
          continue;
        }

        overlays.push({
          id: `${card.sourceCardId}-${uuid()}`,
          type: 'image',
          assetPath: '',
          trackId,
          startMs: card.startMs,
          durationMs: card.durationMs,
          position: nextDefaultPosition,
          overlayType: 'ai-card',
          aiCardData: {
            ...card.aiCardData,
            sourceCardId: card.sourceCardId,
          },
        });
      }
      const nextTimeline = normalizeTimeline({
        ...state.timeline,
        tracks,
        overlays,
      });

      return buildCommittedTimelineState(state, nextTimeline);
    }),
  removeAICardOverlaysBySourceIds: (sourceCardIds) =>
    set((state) => {
      if (sourceCardIds.length === 0) {
        return {};
      }

      const sourceCardIdSet = new Set(sourceCardIds);
      const nextTimeline = normalizeTimeline({
        ...state.timeline,
        overlays: state.timeline.overlays.filter(
          (overlay) =>
            overlay.overlayType !== 'ai-card' ||
            !overlay.aiCardData?.sourceCardId ||
            !sourceCardIdSet.has(overlay.aiCardData.sourceCardId),
        ),
      });

      return buildCommittedTimelineState(state, nextTimeline);
    }),
  copyOverlay: (id) => {
    let copied = false;

    set((state) => {
      const current = state.timeline.overlays.find((overlay) => overlay.id === id);
      if (!current || current.overlayRole === 'default-background') {
        return {};
      }

      copied = true;
      return {
        overlayClipboard: {
          ...buildOverlayClipboardItem(current),
          mode: 'copy',
        },
      };
    });

    return copied;
  },
  cutOverlay: (id) => {
    let cut = false;

    set((state) => {
      const current = state.timeline.overlays.find((overlay) => overlay.id === id);
      if (!current || current.overlayRole === 'default-background') {
        return {};
      }

      cut = true;
      const nextTimeline = normalizeTimeline({
        ...state.timeline,
        overlays: state.timeline.overlays.filter((overlay) => overlay.id !== id),
      });

      return buildCommittedTimelineState(state, nextTimeline, {
        overlayClipboard: {
          ...buildOverlayClipboardItem(current),
          mode: 'cut',
        },
      });
    });

    return cut;
  },
  pasteOverlay: ({ trackId, startMs }) => {
    let pastedOverlayId: string | null = null;

    set((state) => {
      if (!state.overlayClipboard) {
        return {};
      }

      const { mode, ...clipboardDraft } = state.overlayClipboard;
      const draft: OverlayItem = {
        ...cloneOverlayDraft(clipboardDraft),
        id: uuid(),
        trackId,
        startMs,
      };
      const { overlay: resolved, createdTrack } = resolveOverlayInsert(state, draft);
      pastedOverlayId = resolved.id;
      const nextTimeline = normalizeTimeline({
        ...state.timeline,
        tracks: createdTrack ? [...state.timeline.tracks, createdTrack] : state.timeline.tracks,
        overlays: [...state.timeline.overlays, resolved],
      });

      return buildCommittedTimelineState(state, nextTimeline, {
        overlayClipboard: mode === 'copy' ? state.overlayClipboard : null,
      });
    });

    return pastedOverlayId;
  },
  updateOverlay: (id, updates) =>
    set((state) => {
      const current = state.timeline.overlays.find((o) => o.id === id);
      if (!current) {
        return {};
      }

      let merged = { ...current, ...updates, id };
      const affectsPlacement =
        'startMs' in updates || 'durationMs' in updates || 'trackId' in updates;

      if (affectsPlacement && isOverlayTrackManaged(merged)) {
        const isDurationOnly =
          'durationMs' in updates && !('startMs' in updates) && !('trackId' in updates);

        if (isDurationOnly) {
          // 拉伸只做邻居 clamp，不移动位置
          merged = {
            ...merged,
            durationMs: clampOverlayDurationByNeighbors({
              overlayId: id,
              startMs: merged.startMs,
              requestedDurationMs: merged.durationMs,
              trackId: merged.trackId,
              overlays: state.timeline.overlays,
            }),
          };
        } else {
          // 拖动或跨轨移动：先 clamp 时长，再寻找合法位置
          if ('durationMs' in updates) {
            merged = {
              ...merged,
              durationMs: clampOverlayDurationByNeighbors({
                overlayId: id,
                startMs: merged.startMs,
                requestedDurationMs: merged.durationMs,
                trackId: merged.trackId,
                overlays: state.timeline.overlays,
              }),
            };
          }

          const placement = findNearestAvailablePlacement({
            targetStartMs: merged.startMs,
            durationMs: merged.durationMs,
            trackId: merged.trackId,
            excludeOverlayId: id,
            overlays: state.timeline.overlays,
          });

          if (placement.fits) {
            merged = { ...merged, startMs: placement.startMs };
          } else {
            const available = findAvailableTrack({
              targetStartMs: merged.startMs,
              durationMs: merged.durationMs,
              excludeOverlayId: id,
              overlays: state.timeline.overlays,
              tracks: state.timeline.tracks,
            });

            if (available.trackId) {
              merged = {
                ...merged,
                trackId: available.trackId,
                startMs: available.startMs,
              };
            } else {
              // 无法放置，创建新轨道
              const newTrack = getNextVisualTrack(state.timeline.tracks);
              merged = { ...merged, trackId: newTrack.id };
              const nextTimeline = normalizeTimeline({
                ...state.timeline,
                tracks: [...state.timeline.tracks, newTrack],
                overlays: state.timeline.overlays.map((o) =>
                  o.id === id ? merged : o,
                ),
              });
              return buildCommittedTimelineState(state, nextTimeline);
            }
          }
        }
      }

      const nextTimeline = normalizeTimeline({
        ...state.timeline,
        overlays: state.timeline.overlays.map((o) =>
          o.id === id ? merged : o,
        ),
      });
      return buildCommittedTimelineState(state, nextTimeline);
    }),
  removeOverlay: (id) =>
    set((state) => {
      const nextTimeline = normalizeTimeline({
        ...state.timeline,
        overlays: state.timeline.overlays.filter((overlay) => overlay.id !== id),
      });

      return buildCommittedTimelineState(state, nextTimeline);
    }),
  undo: () =>
    set((state) => {
      if (state.historyPast.length === 0) {
        return {};
      }

      const previousTimeline = state.historyPast[state.historyPast.length - 1];
      const nextPast = state.historyPast.slice(0, -1);
      const nextFuture = [cloneTimeline(state.timeline), ...state.historyFuture].slice(
        0,
        MAX_TIMELINE_HISTORY,
      );
      const normalizedTimeline = normalizeTimeline(previousTimeline);

      return {
        timeline: normalizedTimeline,
        assets: syncAssetsWithTimeline(state.assets, normalizedTimeline),
        historyPast: nextPast,
        historyFuture: nextFuture,
        canUndo: nextPast.length > 0,
        canRedo: nextFuture.length > 0,
      };
    }),
  redo: () =>
    set((state) => {
      if (state.historyFuture.length === 0) {
        return {};
      }

      const [nextTimeline, ...remainingFuture] = state.historyFuture;
      const nextPast = pushHistorySnapshot(state.historyPast, state.timeline);
      const normalizedTimeline = normalizeTimeline(nextTimeline);

      return {
        timeline: normalizedTimeline,
        assets: syncAssetsWithTimeline(state.assets, normalizedTimeline),
        historyPast: nextPast,
        historyFuture: remainingFuture,
        canUndo: nextPast.length > 0,
        canRedo: remainingFuture.length > 0,
      };
    }),
}));

function hasBrowserStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

export function getCurrentProjectDir(): string {
  return getStorageItem(PROJECT_DIR_KEY);
}

export function getProjectDir(): string {
  return getCurrentProjectDir();
}

export function getRecentProjects(): RecentProject[] {
  const raw = getStorageItem(RECENT_PROJECTS_KEY);
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as RecentProject[];
    return parsed.filter((project) => Boolean(project?.path));
  } catch {
    return [];
  }
}

export function rememberRecentProject(projectDir: string): RecentProject[] {
  const now = Date.now();
  const nextProjects = [
    {
      path: projectDir,
      name: getFileNameFromPath(projectDir),
      lastOpenedAt: now,
    },
    ...getRecentProjects().filter((project) => project.path !== projectDir),
  ].slice(0, 5);

  persistRecentProjects(nextProjects);
  return nextProjects;
}

export function removeRecentProject(projectDir: string): RecentProject[] {
  const nextProjects = getRecentProjects().filter((project) => project.path !== projectDir);
  persistRecentProjects(nextProjects);
  return nextProjects;
}

export function setCurrentProjectDir(projectDir: string): void {
  setStorageItem(PROJECT_DIR_KEY, projectDir);
}

export function setProjectDir(projectDir: string): void {
  setCurrentProjectDir(projectDir);
  rememberRecentProject(projectDir);
}

export function clearCurrentProject(): void {
  removeStorageItem(PROJECT_DIR_KEY);
  emitSaveStatus('idle');
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;

if (typeof window !== 'undefined') {
  useTimelineStore.subscribe((state, previousState) => {
    if (state.timeline === previousState.timeline) {
      return;
    }

    const projectDir = getProjectDir();
    if (!projectDir || !window.electronAPI?.saveProjectSection) {
      return;
    }

    emitSaveStatus('saving');
    if (saveTimer) {
      clearTimeout(saveTimer);
    }

    saveTimer = setTimeout(() => {
      void window.electronAPI
        .saveProjectSection(projectDir, 'timeline', JSON.stringify(state.timeline))
        .then(() => {
          emitSaveStatus('saved');
        })
        .catch((error) => {
          console.error('保存 timeline 失败:', error);
          emitSaveStatus('error');
        });
    }, 300);
  });
}
