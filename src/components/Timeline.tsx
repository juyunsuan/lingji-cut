import type { CSSProperties, DragEvent, MouseEvent, ReactNode } from 'react';
import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ConfirmDialog, ContextMenu } from '../ui';
import type { TrackDragZone } from '../lib/overlay-drag';
import {
  getTimelineContextMenuItems,
  type TimelineContextMenuActionKey,
} from '../lib/timeline-context-menu';
import { getRenderableVisualTracks, getVisualTracks } from '../lib/timeline-tracks';
import { filterValidSubtitleHighlights } from '../lib/subtitle-highlights';
import { formatTime, getEffectiveTimelineDurationMs } from '../lib/utils';
import {
  clampTimelineZoom,
  getAnchoredTimelineScrollLeft,
  getBaseTimelineWidth,
  getContinuousTimelineZoom,
  getTimelineContentWidthPx,
  getTimelineVisualEndMs,
  getTimelineWheelZoomMode,
  getWheelTimelineZoom,
} from '../lib/timeline-view';
import type { TimelineTrack } from '../types';
import { getTextTemplateById } from '../lib/text-templates';
import { useTimelineStore } from '../store/timeline';
import { AppIcon } from './AppIcon';
import { OverlayBlock } from './OverlayBlock';
import { TimelineAudioWaveform } from './TimelineAudioWaveform';
import { TimelineSubtitleBlocks } from './TimelineSubtitleBlocks';
import { TimelineToolbar } from './timeline/TimelineToolbar';
import styles from './Timeline.module.css';

interface TimelineProps {
  currentTimeMs: number;
  onSeek: (ms: number) => void;
  compact: boolean;
  onOpenAICardInspector?: (cardId: string) => void;
  onOpenOverlayInspector?: (overlayId: string) => void;
  onOpenSubtitleInspector?: () => void;
}

interface PendingTrackDeletion {
  trackId: string;
  trackLabel: string;
  overlayCount: number;
}

interface AssetLike {
  path: string;
  type: 'video' | 'image' | 'text';
  durationMs: number;
  overlayRole?: 'default-background';
}

type TimelineContextTarget =
  | {
      kind: 'track';
      trackId: string;
      startMs: number;
    }
  | {
      kind: 'overlay';
      overlayId: string;
      trackId: string;
      startMs: number;
    };

export function Timeline({
  currentTimeMs,
  onSeek,
  compact,
  onOpenAICardInspector,
  onOpenOverlayInspector,
  onOpenSubtitleInspector,
}: TimelineProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const pendingScrollLeftRef = useRef<number | null>(null);
  const trackLaneRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [hoverTrackId, setHoverTrackId] = useState<string | null>(null);
  const [selectedOverlayId, setSelectedOverlayId] = useState<string | null>(null);
  const [contextTarget, setContextTarget] = useState<TimelineContextTarget | null>(null);
  const [pendingTrackDeletion, setPendingTrackDeletion] = useState<PendingTrackDeletion | null>(null);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [viewportWidth, setViewportWidth] = useState(0);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const {
    addOverlay,
    addTrack,
    copyOverlay,
    cutOverlay,
    overlayClipboard,
    pasteOverlay,
    removeOverlay,
    removeTrack,
    setGlobalBackground,
    srtEntries,
    timeline,
  } = useTimelineStore();
  // 考虑动画 / 媒体 overlay 末端，没素材时也保证尺子能容纳已经添加的卡片
  const durationMs = useMemo(() => getEffectiveTimelineDurationMs(timeline), [timeline]);
  // 内容末端（不含尾部留白）：用于 pxPerMs 推导与 seek clamp
  const visualEndMs = useMemo(
    () => Math.max(1, getTimelineVisualEndMs(timeline), durationMs),
    [timeline, durationMs],
  );
  const outerPadding = compact ? 8 : 10;
  const sidebarWidth = compact ? 86 : 104;
  const toolbarHeight = compact ? 36 : 40;
  const rulerHeight = 24;
  const audioTrackHeight = compact ? 26 : 30;
  const subtitleTrackHeight = compact ? 52 : 60;
  const overlayTrackHeight = compact ? 30 : 34;
  // 轨道内容区宽度（含尾部一屏留白）。替代旧的 trackWidth。
  const contentWidth = useMemo(
    () =>
      getTimelineContentWidthPx(timeline, zoomLevel, Math.max(480, viewportWidth || 960)),
    [timeline, viewportWidth, zoomLevel],
  );
  // pxPerMs 基于"有效内容末端"反推，保持 1 秒在屏幕上的像素密度恒定；
  // 留白区由 contentWidth 本身提供，不改变秒的视觉密度。
  const pxPerMs = useMemo(() => {
    const clampedZoom = clampTimelineZoom(zoomLevel);
    const basePx = getBaseTimelineWidth(visualEndMs) * clampedZoom;
    return basePx / visualEndMs;
  }, [visualEndMs, zoomLevel]);
  const trackColumns = `${sidebarWidth}px ${contentWidth}px`;
  const visualTracks = useMemo(() => getVisualTracks(timeline.tracks), [timeline.tracks]);
  const renderableTracks = useMemo(
    () => getRenderableVisualTracks(timeline.tracks),
    [timeline.tracks],
  );
  // canvas 外层总宽度（含左侧 sidebar），用于最外层 DOM 布局
  const canvasWidth = sidebarWidth + contentWidth;
  const majorTickInterval = useMemo(() => {
    if (visualEndMs <= 30_000) {
      return 5_000;
    }

    if (visualEndMs <= 120_000) {
      return 10_000;
    }

    return 30_000;
  }, [visualEndMs]);
  const minorTickInterval = Math.max(1_000, Math.round(majorTickInterval / 5));
  // ruler 覆盖整条内容区（含尾部留白），按 pxPerMs 反推最大刻度 ms
  const totalRulerMs = useMemo(
    () => (pxPerMs > 0 ? Math.floor(contentWidth / pxPerMs) : visualEndMs),
    [contentWidth, pxPerMs, visualEndMs],
  );
  const ticks = useMemo(() => {
    const values: number[] = [];

    for (let cursor = 0; cursor <= totalRulerMs; cursor += majorTickInterval) {
      values.push(cursor);
    }

    if (values.length === 0 || values[values.length - 1] !== totalRulerMs) {
      values.push(totalRulerMs);
    }

    return values;
  }, [totalRulerMs, majorTickInterval]);
  const overlaysByTrack = useMemo(() => {
    const groups = new Map<string, typeof timeline.overlays>();

    for (const track of renderableTracks) {
      groups.set(track.id, []);
    }

    for (const overlay of timeline.overlays) {
      const group = groups.get(overlay.trackId);
      if (group) {
        group.push(overlay);
      }
    }

    return groups;
  }, [renderableTracks, timeline.overlays]);
  const validSubtitleHighlights = useMemo(
    () => filterValidSubtitleHighlights(srtEntries, timeline.subtitleHighlights ?? []),
    [srtEntries, timeline.subtitleHighlights],
  );
  const storedSubtitleHighlightCount = timeline.subtitleHighlights?.length ?? 0;
  const expiredSubtitleHighlightCount = Math.max(
    0,
    storedSubtitleHighlightCount - validSubtitleHighlights.length,
  );
  const subtitleHighlightHint = useMemo(() => {
    if (!timeline.podcast.srtPath) {
      return '';
    }

    if (expiredSubtitleHighlightCount > 0) {
      return validSubtitleHighlights.length > 0 ? '部分高亮已过期' : '高亮已过期';
    }

    if (validSubtitleHighlights.length > 0) {
      return '';
    }

    return storedSubtitleHighlightCount > 0 ? '高亮已过期' : '未生成高亮';
  }, [
    expiredSubtitleHighlightCount,
    storedSubtitleHighlightCount,
    timeline.podcast.srtPath,
    validSubtitleHighlights.length,
  ]);
  const subtitleHighlightSummary = useMemo(() => {
    if (!timeline.podcast.srtPath) {
      return '等待导入字幕';
    }

    if (storedSubtitleHighlightCount === 0) {
      return '尚未生成关键词高亮';
    }

    if (expiredSubtitleHighlightCount > 0) {
      return validSubtitleHighlights.length > 0
        ? `${validSubtitleHighlights.length} 处有效 · ${expiredSubtitleHighlightCount} 处过期`
        : '当前高亮结果已全部失效';
    }

    return `${validSubtitleHighlights.length} 处关键词高亮已就绪`;
  }, [
    expiredSubtitleHighlightCount,
    storedSubtitleHighlightCount,
    timeline.podcast.srtPath,
    validSubtitleHighlights.length,
  ]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    let rafId = 0;
    const updateWidth = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        const next = container.clientWidth - outerPadding * 2 - sidebarWidth;
        // 仅在宽度实际变化时更新，避免 ResizeObserver → state → layout 振荡
        setViewportWidth((prev) => (prev === next ? prev : next));
      });
    };

    updateWidth();

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', updateWidth);
      return () => {
        cancelAnimationFrame(rafId);
        window.removeEventListener('resize', updateWidth);
      };
    }

    const observer = new ResizeObserver(updateWidth);
    observer.observe(container);

    return () => {
      cancelAnimationFrame(rafId);
      observer.disconnect();
    };
  }, [outerPadding, sidebarWidth]);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container || pendingScrollLeftRef.current === null) {
      return;
    }

    container.scrollLeft = pendingScrollLeftRef.current;
    pendingScrollLeftRef.current = null;
  }, [contentWidth]);

  const gridBackground = useMemo(() => {
    const major = Math.max(40, majorTickInterval * pxPerMs);
    const minor = Math.max(8, minorTickInterval * pxPerMs);

    return {
      backgroundImage: [
        `repeating-linear-gradient(to right, color-mix(in srgb, var(--color-border-strong) 48%, transparent) 0 1px, transparent 1px ${major}px)`,
        `repeating-linear-gradient(to right, color-mix(in srgb, var(--color-border-subtle) 62%, transparent) 0 1px, transparent 1px ${minor}px)`,
      ].join(','),
      backgroundColor: 'var(--color-recessed-bg)',
    } satisfies CSSProperties;
  }, [majorTickInterval, minorTickInterval, pxPerMs]);

  const resolveTimelineOffset = (clientX: number) => {
    const rect = containerRef.current?.getBoundingClientRect();

    if (!rect) {
      return null;
    }

    const offsetX =
      clientX -
      rect.left +
      (containerRef.current?.scrollLeft || 0) -
      outerPadding -
      sidebarWidth;

    return offsetX;
  };

  const resolveContextMenuStartMs = useCallback(
    (clientX: number) => {
      const offsetX = resolveTimelineOffset(clientX);
      if (offsetX === null) {
        return 0;
      }

      return Math.max(0, Math.min(visualEndMs, Math.round(offsetX / pxPerMs)));
    },
    [visualEndMs, pxPerMs],
  );

  const canPasteOverlay = Boolean(overlayClipboard);

  const handleOverlayContextMenu = useCallback(
    (overlayId: string, trackId: string, clientX: number) => {
      setSelectedOverlayId(overlayId);
      setContextTarget({
        kind: 'overlay',
        overlayId,
        trackId,
        startMs: resolveContextMenuStartMs(clientX),
      });
    },
    [resolveContextMenuStartMs],
  );

  const handleTrackContextMenu = useCallback(
    (trackId: string, clientX: number) => {
      setSelectedOverlayId(null);
      setContextTarget({
        kind: 'track',
        trackId,
        startMs: resolveContextMenuStartMs(clientX),
      });
    },
    [resolveContextMenuStartMs],
  );

  const handleContextMenuAction = useCallback(
    (
      action: TimelineContextMenuActionKey,
      options: {
        overlayId?: string;
        trackId: string;
        startMs: number;
      },
    ) => {
      if (action === 'copy') {
        if (options.overlayId) {
          copyOverlay(options.overlayId);
        }
        return;
      }

      if (action === 'cut') {
        if (!options.overlayId) {
          return;
        }
        if (cutOverlay(options.overlayId) && selectedOverlayId === options.overlayId) {
          setSelectedOverlayId(null);
        }
        return;
      }

      if (action === 'paste') {
        const pastedOverlayId = pasteOverlay({
          trackId: options.trackId,
          startMs: options.startMs,
        });

        if (pastedOverlayId) {
          setSelectedOverlayId(pastedOverlayId);
        }
        return;
      }

      if (!options.overlayId) {
        return;
      }

      removeOverlay(options.overlayId);
      if (selectedOverlayId === options.overlayId) {
        setSelectedOverlayId(null);
      }
    },
    [copyOverlay, cutOverlay, pasteOverlay, removeOverlay, selectedOverlayId],
  );

  const renderContextMenuItems = useCallback(
    (
      items: ReturnType<typeof getTimelineContextMenuItems>,
      options: {
        overlayId?: string;
        trackId: string;
        startMs: number;
      },
    ) =>
      items.map((item) => (
        <Fragment key={item.key}>
          {item.separatorBefore ? <ContextMenu.Separator /> : null}
          <ContextMenu.Item
            disabled={item.disabled}
            destructive={item.destructive}
            onSelect={() => handleContextMenuAction(item.key, options)}
          >
            <div className={styles.contextMenuItem}>
              <AppIcon name={item.icon} size={14} className={styles.contextMenuIcon} />
              <span className={styles.contextMenuLabel}>{item.label}</span>
              <ContextMenu.Shortcut>{item.shortcut}</ContextMenu.Shortcut>
            </div>
          </ContextMenu.Item>
        </Fragment>
      )),
    [handleContextMenuAction],
  );

  const handleSeekClick = (event: MouseEvent<HTMLDivElement>) => {
    // 点击轨道空白区域时取消选中
    const target = event.target as HTMLElement;
    if (!target.closest(`.${styles.overlayRow} [data-overlay-block]`)) {
      setSelectedOverlayId(null);
    }

    const offsetX = resolveTimelineOffset(event.clientX);

    if (offsetX === null || offsetX < 0) {
      return;
    }

    onSeek(Math.max(0, Math.min(visualEndMs, Math.round(offsetX / pxPerMs))));
  };

  const handleWheelZoom = useCallback((event: WheelEvent) => {
    const zoomMode = getTimelineWheelZoomMode(event);
    if (!zoomMode) {
      return;
    }

    const container = containerRef.current;
    if (!container) {
      return;
    }

    event.preventDefault();

    const nextZoom =
      zoomMode === 'pinch'
        ? getContinuousTimelineZoom(zoomLevel, event.deltaY, event.deltaMode)
        : getWheelTimelineZoom(zoomLevel, event.deltaY);
    if (nextZoom === zoomLevel) {
      return;
    }

    const rect = container.getBoundingClientRect();
    const visibleTrackWidth = Math.max(1, container.clientWidth - sidebarWidth - outerPadding * 2);
    const hasValidClientX = event.clientX >= rect.left && event.clientX <= rect.right;
    const pointerX = hasValidClientX
      ? Math.max(
          0,
          Math.min(visibleTrackWidth, event.clientX - rect.left - sidebarWidth - outerPadding),
        )
      : visibleTrackWidth / 2;
    const nextContentWidth = getTimelineContentWidthPx(
      timeline,
      nextZoom,
      Math.max(480, viewportWidth || 960),
    );

    pendingScrollLeftRef.current = getAnchoredTimelineScrollLeft({
      scrollLeft: container.scrollLeft,
      pointerX,
      previousTrackWidth: contentWidth,
      nextTrackWidth: nextContentWidth,
    });

    setZoomLevel(nextZoom);
  }, [timeline, outerPadding, sidebarWidth, contentWidth, viewportWidth, zoomLevel]);

  // 通过 ref 保持最新版本的 handler，避免 native listener 中的 stale closure
  const handleWheelZoomRef = useRef(handleWheelZoom);
  useEffect(() => {
    handleWheelZoomRef.current = handleWheelZoom;
  });

  // 使用 non-passive 原生监听器，确保 event.preventDefault() 生效，
  // 防止浏览器 page-level zoom 干扰触摸板 pinch 缩放
  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const handler = (event: WheelEvent) => handleWheelZoomRef.current(event);
    container.addEventListener('wheel', handler, { passive: false });
    return () => container.removeEventListener('wheel', handler);
  }, []);

  // 键盘快捷键：S 分割、⌘Z 撤销、⌘⇧Z / ⌘Y 重做
  const splitCtxRef = useRef({ currentTimeMs, selectedOverlayId });
  useEffect(() => {
    splitCtxRef.current = { currentTimeMs, selectedOverlayId };
  }, [currentTimeMs, selectedOverlayId]);

  useEffect(() => {
    const isEditableTarget = (target: EventTarget | null) => {
      if (!(target instanceof HTMLElement)) {
        return false;
      }
      const tag = target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
        return true;
      }
      if (target.isContentEditable) {
        return true;
      }
      return false;
    };

    const handler = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) {
        return;
      }

      const mod = event.metaKey || event.ctrlKey;

      if (mod && (event.key === 'z' || event.key === 'Z')) {
        event.preventDefault();
        if (event.shiftKey) {
          useTimelineStore.getState().redo();
        } else {
          useTimelineStore.getState().undo();
        }
        return;
      }

      if (mod && (event.key === 'y' || event.key === 'Y')) {
        event.preventDefault();
        useTimelineStore.getState().redo();
        return;
      }

      if (!mod && !event.altKey && (event.key === 's' || event.key === 'S')) {
        event.preventDefault();
        const { currentTimeMs: nowMs, selectedOverlayId: selId } = splitCtxRef.current;
        useTimelineStore
          .getState()
          .splitOverlayClipsAt(nowMs, selId ? [selId] : undefined);
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const placeAssetOnTrack = (trackId: string, asset: AssetLike, clientX: number) => {
    if (asset.overlayRole === 'default-background') {
      setGlobalBackground(asset.path);
      return;
    }

    const offsetX = resolveTimelineOffset(clientX);
    if (offsetX === null) {
      return;
    }

    const startMs = Math.max(0, Math.round(offsetX / pxPerMs));

    // 文字模板处理
    if (asset.type === 'text') {
      const template = getTextTemplateById(asset.path);
      if (!template) return;
      addOverlay({
        type: 'text',
        assetPath: '',
        trackId,
        startMs,
        durationMs: asset.durationMs,
        position: {
          x: (timeline.width - 800) / 2,
          y: (timeline.height - 200) / 2,
          width: 800,
          height: 200,
        },
        textData: { ...template.textData },
      });
      return;
    }

    addOverlay({
      type: asset.type,
      assetPath: asset.path,
      trackId,
      startMs,
      durationMs: asset.durationMs,
      position: {
        x: 0,
        y: 0,
        width: timeline.width,
        height: timeline.height,
      },
    });
  };

  const handleTrackDrop =
    (trackId: string) =>
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setHoverTrackId(null);
      const raw = event.dataTransfer.getData('application/json');

      if (!raw) {
        return;
      }

      placeAssetOnTrack(trackId, JSON.parse(raw) as AssetLike, event.clientX);
    };

  const getTrackDragZones = (): TrackDragZone[] => {
    return visualTracks.flatMap((track) => {
      const trackLane = trackLaneRefs.current[track.id];
      if (!trackLane) {
        return [];
      }

      const rect = trackLane.getBoundingClientRect();
      return [
        {
          trackId: track.id,
          top: rect.top,
          bottom: rect.bottom,
        },
      ];
    });
  };

  const renderTrackControls = (options: {
    tone: string;
    name: string;
    actions?: ReactNode;
  }) => (
    <div className={styles.trackControls}>
      <div className={styles.trackControlsBody}>
        <div className={styles.trackNameLine} style={{ color: options.tone }}>
          {options.name}
        </div>
      </div>
      {options.actions ?? null}
    </div>
  );

  const renderLaneBase = (
    track: TimelineTrack,
    trackHeight: number,
    children: ReactNode,
    laneClassName?: string,
    extraStyle?: CSSProperties,
  ) => (
    <div
      key={track.id}
      className={styles.laneRow}
      style={{ gridTemplateColumns: trackColumns, minHeight: trackHeight }}
    >
      {children}
      <div
        className={joinClassNames(styles.laneMain, laneClassName)}
        style={{
          height: trackHeight,
          ...gridBackground,
          ...extraStyle,
        }}
      />
    </div>
  );

  return (
    <div
      className={styles.root}
      style={{
        gridTemplateRows: `${toolbarHeight}px minmax(0, 1fr)`,
      }}
    >
      <TimelineToolbar
        zoomLevel={zoomLevel}
        onZoomChange={setZoomLevel}
        timelineDurationMs={getTimelineVisualEndMs(timeline)}
        viewportWidth={viewportWidth}
        snapEnabled={snapEnabled}
        onToggleSnap={() => setSnapEnabled((v) => !v)}
        onAddTrack={() => addTrack()}
        onSplit={() =>
          useTimelineStore
            .getState()
            .splitOverlayClipsAt(
              currentTimeMs,
              selectedOverlayId ? [selectedOverlayId] : undefined,
            )
        }
      />

      <div
        ref={containerRef}
        onClick={handleSeekClick}
        className={styles.scrollArea}
      >
        <div
          className={styles.canvas}
          style={{
            width: canvasWidth + outerPadding * 2,
            padding: outerPadding,
          }}
        >
          <div className={styles.content} style={{ width: canvasWidth }}>
            <div
              className={styles.rulerRow}
              style={{ gridTemplateColumns: trackColumns, height: rulerHeight }}
            >
              <div className={styles.rulerSide}>轨道</div>

              <div className={styles.rulerMain} style={{ height: rulerHeight }}>
                {ticks.map((tick) => (
                  <div
                    key={tick}
                    className={styles.tick}
                    style={{ left: tick * pxPerMs }}
                  >
                    <div className={styles.tickMarker} />
                    <div className={styles.tickLabel}>{formatTime(tick)}</div>
                  </div>
                ))}
              </div>
            </div>

            {renderLaneBase(
              timeline.tracks[0],
              audioTrackHeight,
              renderTrackControls({
                tone: 'var(--color-track-audio)',
                name: '轨道 1',
              }),
              styles.lockedLane,
              {
                overflow: 'hidden',
              },
            )}
            <div
              className={styles.lockedLaneOverlay}
              style={{
                marginTop: -audioTrackHeight,
                marginLeft: sidebarWidth,
                width: Math.max(0, Math.round(visualEndMs * pxPerMs)),
                height: audioTrackHeight,
              }}
            >
              <TimelineAudioWaveform
                audioPath={timeline.podcast.audioPath}
                durationMs={durationMs}
                trackWidth={Math.max(0, Math.round(visualEndMs * pxPerMs))}
                trackHeight={audioTrackHeight}
              />
            </div>

            {renderLaneBase(
              timeline.tracks[1],
              subtitleTrackHeight,
              renderTrackControls({
                tone: 'var(--color-track-subtitle)',
                name: '轨道 1',
              }),
              styles.lockedLane,
            )}
            <div
              className={styles.lockedLaneOverlay}
              style={{
                marginTop: -subtitleTrackHeight,
                marginLeft: sidebarWidth,
                width: contentWidth,
                height: subtitleTrackHeight,
              }}
            >
              <TimelineSubtitleBlocks
                entries={srtEntries}
                durationMs={durationMs}
                pxPerMs={pxPerMs}
                trackHeight={subtitleTrackHeight}
                highlightHint={subtitleHighlightHint}
                onClickBlock={onOpenSubtitleInspector}
              />
            </div>

            {visualTracks.map((track, index) => {
              const overlays = overlaysByTrack.get(track.id) ?? [];
              const isHover = hoverTrackId === track.id;
              const isTopLayer = index === 0;
              const trackMenuItems = getTimelineContextMenuItems({
                target: 'track',
                canPaste: canPasteOverlay,
              });
              const trackMenuStartMs =
                contextTarget?.kind === 'track' && contextTarget.trackId === track.id
                  ? contextTarget.startMs
                  : 0;

              return (
                <div
                  key={track.id}
                  className={styles.overlayRow}
                  style={{
                    gridTemplateColumns: trackColumns,
                    minHeight: overlayTrackHeight,
                  }}
                >
                  {renderTrackControls({
                    tone: isTopLayer
                      ? 'var(--color-track-primary)'
                      : 'var(--color-track-secondary)',
                    name: `轨道 ${visualTracks.length - index}`,
                    actions: (
                      <button
                        className={styles.trackDeleteButton}
                        onClick={(event) => {
                          event.stopPropagation();
                          if (overlays.length > 0) {
                            setPendingTrackDeletion({
                              trackId: track.id,
                              trackLabel: track.label,
                              overlayCount: overlays.length,
                            });
                            return;
                          }
                          removeTrack(track.id);
                        }}
                        aria-label={`删除${track.label}`}
                        title="删除轨道"
                      >
                        <AppIcon name="trash-2" size={12} />
                      </button>
                    ),
                  })}
                  <ContextMenu>
                    <ContextMenu.Trigger asChild>
                      <div
                        ref={(node) => {
                          trackLaneRefs.current[track.id] = node;
                        }}
                        onContextMenu={(event) => {
                          handleTrackContextMenu(track.id, event.clientX);
                        }}
                        onDragOver={(event) => {
                          event.preventDefault();
                          event.dataTransfer.dropEffect = 'copy';
                          if (hoverTrackId !== track.id) {
                            setHoverTrackId(track.id);
                          }
                        }}
                        onDragLeave={() => {
                          if (hoverTrackId === track.id) {
                            setHoverTrackId(null);
                          }
                        }}
                        onDrop={handleTrackDrop(track.id)}
                        className={joinClassNames(
                          styles.trackDropLane,
                          isHover ? styles.trackDropLaneHover : '',
                        )}
                        style={{
                          height: overlayTrackHeight,
                          ...gridBackground,
                        }}
                      >
                        {overlays.map((overlay) => {
                          const overlayBlock = (
                            <OverlayBlock
                              overlay={overlay}
                              pxPerMs={pxPerMs}
                              trackHeight={overlayTrackHeight}
                              selected={selectedOverlayId === overlay.id}
                              getTrackDragZones={getTrackDragZones}
                              onTrackHoverChange={setHoverTrackId}
                              onContextMenu={(event) => {
                                handleOverlayContextMenu(overlay.id, overlay.trackId, event.clientX);
                              }}
                              onSelect={() => {
                                setSelectedOverlayId(overlay.id);
                                const sourceCardId = overlay.aiCardData?.sourceCardId;
                                if (overlay.overlayType === 'ai-card' && sourceCardId) {
                                  onOpenAICardInspector?.(sourceCardId);
                                  return;
                                }
                                // 所有视觉 overlay（文字/图片/视频）统一打开 Inspector
                                onOpenOverlayInspector?.(overlay.id);
                              }}
                            />
                          );

                          if (overlay.overlayRole === 'default-background') {
                            return (
                              <Fragment key={overlay.id}>
                                {overlayBlock}
                              </Fragment>
                            );
                          }

                          const overlayMenuItems = getTimelineContextMenuItems({
                            target: 'overlay',
                            canPaste: canPasteOverlay,
                          });
                          const overlayMenuStartMs =
                            contextTarget?.kind === 'overlay' &&
                            contextTarget.overlayId === overlay.id
                              ? contextTarget.startMs
                              : overlay.startMs;

                          return (
                            <ContextMenu key={overlay.id}>
                              <ContextMenu.Trigger asChild>{overlayBlock}</ContextMenu.Trigger>
                              <ContextMenu.Content glass>
                                {renderContextMenuItems(overlayMenuItems, {
                                  overlayId: overlay.id,
                                  trackId: overlay.trackId,
                                  startMs: overlayMenuStartMs,
                                })}
                              </ContextMenu.Content>
                            </ContextMenu>
                          );
                        })}

                        {overlays.length === 0 ? (
                          <div
                            className={[
                              styles.emptyHint,
                              isHover ? styles.emptyHintHover : '',
                            ].filter(Boolean).join(' ')}
                          >
                            拖入图片或视频到 {track.label}
                          </div>
                        ) : null}
                      </div>
                    </ContextMenu.Trigger>
                    <ContextMenu.Content glass>
                      {renderContextMenuItems(trackMenuItems, {
                        trackId: track.id,
                        startMs: trackMenuStartMs,
                      })}
                    </ContextMenu.Content>
                  </ContextMenu>
                </div>
              );
            })}

            <div
              className={styles.playhead}
              style={{ left: sidebarWidth + currentTimeMs * pxPerMs }}
            >
              <div className={styles.playheadHandle} />
            </div>
          </div>
        </div>
      </div>
      <ConfirmDialog
        open={Boolean(pendingTrackDeletion)}
        onOpenChange={(open) => {
          if (!open) {
            setPendingTrackDeletion(null);
          }
        }}
        title="删除轨道"
        description={
          pendingTrackDeletion
            ? `此轨道包含 ${pendingTrackDeletion.overlayCount} 个素材，删除后将一并移除。`
            : undefined
        }
        confirmText={`删除${pendingTrackDeletion?.trackLabel ?? '轨道'}`}
        cancelText="取消"
        confirmVariant="destructive"
        onConfirm={() => {
          if (!pendingTrackDeletion) {
            return;
          }
          removeTrack(pendingTrackDeletion.trackId);
          setPendingTrackDeletion(null);
        }}
      />
    </div>
  );
}

function joinClassNames(...values: Array<string | undefined>): string {
  return values.filter(Boolean).join(' ');
}
