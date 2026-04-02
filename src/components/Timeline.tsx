import type { CSSProperties, DragEvent, MouseEvent, ReactNode, WheelEvent } from 'react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { TrackDragZone } from '../lib/overlay-drag';
import { getRenderableVisualTracks, getVisualTracks } from '../lib/timeline-tracks';
import { formatTime, getFileNameFromPath } from '../lib/utils';
import {
  getAnchoredTimelineScrollLeft,
  getFitTimelineZoom,
  getNextTimelineZoom,
  getTimelineTrackWidth,
  getWheelTimelineZoom,
} from '../lib/timeline-view';
import type { TimelineTrack } from '../types';
import { useTimelineStore } from '../store/timeline';
import { OverlayBlock } from './OverlayBlock';

interface TimelineProps {
  currentTimeMs: number;
  onSeek: (ms: number) => void;
  compact: boolean;
}

interface AssetLike {
  path: string;
  type: 'video' | 'image';
  durationMs: number;
  overlayRole?: 'default-background';
}

const iconBadgeStyle: CSSProperties = {
  width: 18,
  height: 18,
  borderRadius: 5,
  border: '1px solid rgba(255,255,255,0.08)',
  background: 'rgba(255,255,255,0.04)',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: '#a8b4c7',
  fontSize: 10,
};

const timeActionButtonStyle: CSSProperties = {
  width: 24,
  height: 24,
  borderRadius: 7,
  border: '1px solid rgba(255,255,255,0.08)',
  background: 'rgba(255,255,255,0.04)',
  color: '#f3f6fb',
  cursor: 'pointer',
  fontSize: 13,
  lineHeight: 1,
};

export function Timeline({ currentTimeMs, onSeek, compact }: TimelineProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const pendingScrollLeftRef = useRef<number | null>(null);
  const trackLaneRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [hoverTrackId, setHoverTrackId] = useState<string | null>(null);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [viewportWidth, setViewportWidth] = useState(0);
  const { addOverlay, addTrack, setGlobalBackground, timeline } = useTimelineStore();
  const durationMs = Math.max(1000, timeline.podcast.durationMs);
  const outerPadding = compact ? 10 : 12;
  const sidebarWidth = compact ? 92 : 108;
  const toolbarHeight = compact ? 40 : 44;
  const rulerHeight = 24;
  const lockedTrackHeight = compact ? 30 : 32;
  const overlayTrackHeight = compact ? 34 : 38;
  const trackGap = compact ? 4 : 6;
  const trackWidth = useMemo(
    () => getTimelineTrackWidth(durationMs, zoomLevel, Math.max(480, viewportWidth || 960)),
    [durationMs, viewportWidth, zoomLevel],
  );
  const pxPerMs = trackWidth / durationMs;
  const visualTracks = useMemo(() => getVisualTracks(timeline.tracks), [timeline.tracks]);
  const renderableTracks = useMemo(
    () => getRenderableVisualTracks(timeline.tracks),
    [timeline.tracks],
  );
  const contentWidth = sidebarWidth + trackWidth;
  const majorTickInterval = useMemo(() => {
    if (durationMs <= 30_000) {
      return 5_000;
    }

    if (durationMs <= 120_000) {
      return 10_000;
    }

    return 30_000;
  }, [durationMs]);
  const minorTickInterval = Math.max(1_000, Math.round(majorTickInterval / 5));
  const ticks = useMemo(() => {
    const values: number[] = [];

    for (let cursor = 0; cursor <= durationMs; cursor += majorTickInterval) {
      values.push(cursor);
    }

    if (values[values.length - 1] !== durationMs) {
      values.push(durationMs);
    }

    return values;
  }, [durationMs, majorTickInterval]);
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

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const updateWidth = () => {
      setViewportWidth(container.clientWidth - outerPadding * 2 - sidebarWidth);
    };

    updateWidth();

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', updateWidth);
      return () => window.removeEventListener('resize', updateWidth);
    }

    const observer = new ResizeObserver(updateWidth);
    observer.observe(container);

    return () => observer.disconnect();
  }, [outerPadding, sidebarWidth]);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container || pendingScrollLeftRef.current === null) {
      return;
    }

    container.scrollLeft = pendingScrollLeftRef.current;
    pendingScrollLeftRef.current = null;
  }, [trackWidth]);

  const gridBackground = useMemo(() => {
    const major = Math.max(40, majorTickInterval * pxPerMs);
    const minor = Math.max(8, minorTickInterval * pxPerMs);

    return {
      backgroundImage: [
        `linear-gradient(180deg, rgba(255,255,255,0.025), rgba(255,255,255,0.012))`,
        `repeating-linear-gradient(to right, rgba(255,255,255,0.055) 0 1px, transparent 1px ${major}px)`,
        `repeating-linear-gradient(to right, rgba(255,255,255,0.022) 0 1px, transparent 1px ${minor}px)`,
      ].join(','),
      backgroundColor: '#242424',
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

  const handleSeekClick = (event: MouseEvent<HTMLDivElement>) => {
    const offsetX = resolveTimelineOffset(event.clientX);

    if (offsetX === null || offsetX < 0) {
      return;
    }

    onSeek(Math.max(0, Math.min(durationMs, Math.round(offsetX / pxPerMs))));
  };

  const handleWheelZoom = (event: WheelEvent<HTMLDivElement>) => {
    if (!event.metaKey) {
      return;
    }

    const container = containerRef.current;
    if (!container) {
      return;
    }

    event.preventDefault();

    const nextZoom = getWheelTimelineZoom(zoomLevel, event.deltaY);
    if (nextZoom === zoomLevel) {
      return;
    }

    const rect = container.getBoundingClientRect();
    const pointerX = Math.max(0, event.clientX - rect.left - sidebarWidth);
    const nextTrackWidth = getTimelineTrackWidth(
      durationMs,
      nextZoom,
      Math.max(480, viewportWidth || 960),
    );

    pendingScrollLeftRef.current = getAnchoredTimelineScrollLeft({
      scrollLeft: container.scrollLeft,
      pointerX,
      previousTrackWidth: trackWidth,
      nextTrackWidth,
    });

    setZoomLevel(nextZoom);
  };

  const placeAssetOnTrack = (trackId: string, asset: AssetLike, clientX: number) => {
    if (asset.overlayRole === 'default-background') {
      setGlobalBackground(asset.path);
      return;
    }

    const offsetX = resolveTimelineOffset(clientX);
    if (offsetX === null) {
      return;
    }

    addOverlay({
      type: asset.type,
      assetPath: asset.path,
      trackId,
      startMs: Math.max(0, Math.round(offsetX / pxPerMs)),
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

  const renderTrackControls = (track: TimelineTrack, options: {
    tone: string;
    title: string;
    subtitle: string;
    label: string;
  }) => (
    <div
      style={{
        position: 'sticky',
        left: 0,
        zIndex: 3,
        height: '100%',
        borderRight: '1px solid rgba(255,255,255,0.06)',
        background: '#232323',
        display: 'flex',
        alignItems: 'center',
        padding: compact ? '0 8px' : '0 10px',
        boxSizing: 'border-box',
      }}
    >
      <div style={{ width: '100%', minWidth: 0 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
          }}
        >
          <div
            style={{
              minWidth: 34,
              height: 20,
              borderRadius: 6,
              background: options.tone,
              color: '#f6f8fc',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: '0.04em',
              padding: '0 6px',
            }}
          >
            {options.label}
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            <span style={iconBadgeStyle}>{track.locked ? 'L' : 'V'}</span>
            <span style={iconBadgeStyle}>E</span>
            <span style={iconBadgeStyle}>S</span>
          </div>
        </div>
        <div
          style={{
            marginTop: 4,
            color: '#d7deea',
            fontSize: 11,
            fontWeight: 600,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {options.title}
        </div>
        <div
          style={{
            marginTop: 1,
            color: '#76859a',
            fontSize: 10,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {options.subtitle}
        </div>
      </div>
    </div>
  );

  const renderLaneBase = (
    track: TimelineTrack,
    trackHeight: number,
    children: ReactNode,
    extraStyle?: CSSProperties,
  ) => (
    <div
      key={track.id}
      style={{
        display: 'grid',
        gridTemplateColumns: `${sidebarWidth}px ${trackWidth}px`,
        minHeight: trackHeight,
      }}
    >
      {children}
      <div
        style={{
          position: 'relative',
          height: trackHeight,
          borderBottom: '1px solid rgba(255,255,255,0.04)',
          ...gridBackground,
          ...extraStyle,
        }}
      />
    </div>
  );

  return (
    <div
      style={{
        height: '100%',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 18,
        background: '#1d1d1d',
        display: 'grid',
        gridTemplateRows: `${toolbarHeight}px minmax(0, 1fr)`,
        minHeight: 0,
        overflow: 'hidden',
        boxShadow: '0 -10px 26px rgba(0,0,0,0.22)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          padding: '0 12px',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          background: 'linear-gradient(180deg, rgba(34,34,34,0.98), rgba(28,28,28,0.98))',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <div
            style={{
              padding: '4px 8px',
              borderRadius: 7,
              background: 'rgba(255,255,255,0.04)',
              color: '#c8d1df',
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.08em',
            }}
          >
            TIMELINE
          </div>
          <div style={{ color: '#8794a7', fontSize: 11 }}>
            {visualTracks.length} 条视觉轨 · 拖到指定轨道落片
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button onClick={() => addTrack()} style={toolbarTrackButtonStyle}>
            + 轨道
          </button>
          <button
            onClick={() => setZoomLevel((current) => getNextTimelineZoom(current, 'out'))}
            style={timeActionButtonStyle}
          >
            −
          </button>
          <div
            style={{
              minWidth: 46,
              textAlign: 'center',
              color: '#f5f7fb',
              fontSize: 11,
              fontWeight: 700,
            }}
          >
            {Math.round(zoomLevel * 100)}%
          </div>
          <button
            onClick={() => setZoomLevel((current) => getNextTimelineZoom(current, 'in'))}
            style={timeActionButtonStyle}
          >
            +
          </button>
          <button
            onClick={() => setZoomLevel(getFitTimelineZoom(durationMs, Math.max(480, viewportWidth || 960)))}
            style={toolbarFitButtonStyle}
          >
            Fit
          </button>
        </div>
      </div>

      <div
        ref={containerRef}
        onClick={handleSeekClick}
        onWheel={handleWheelZoom}
        style={{ overflow: 'auto', minHeight: 0 }}
      >
        <div
          style={{
            width: contentWidth + outerPadding * 2,
            minHeight: '100%',
            padding: outerPadding,
            boxSizing: 'border-box',
          }}
        >
          <div style={{ width: contentWidth, position: 'relative' }}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: `${sidebarWidth}px ${trackWidth}px`,
                height: rulerHeight,
                position: 'relative',
              }}
            >
              <div
                style={{
                  position: 'sticky',
                  left: 0,
                  zIndex: 4,
                  background: '#232323',
                  borderRight: '1px solid rgba(255,255,255,0.06)',
                  borderBottom: '1px solid rgba(255,255,255,0.04)',
                  display: 'flex',
                  alignItems: 'center',
                  padding: '0 10px',
                  color: '#7f8da0',
                  fontSize: 10,
                }}
              >
                轨道
              </div>

              <div
                style={{
                  position: 'relative',
                  height: rulerHeight,
                  borderBottom: '1px solid rgba(255,255,255,0.04)',
                  background: '#242424',
                }}
              >
                {ticks.map((tick) => (
                  <div
                    key={tick}
                    style={{
                      position: 'absolute',
                      left: tick * pxPerMs,
                      top: 0,
                      bottom: 0,
                      transform: 'translateX(-50%)',
                    }}
                  >
                    <div
                      style={{
                        position: 'absolute',
                        top: 4,
                        left: '50%',
                        width: 1,
                        height: 8,
                        background: 'rgba(255,255,255,0.12)',
                      }}
                    />
                    <div
                      style={{
                        marginTop: 10,
                        color: '#7f8da0',
                        fontSize: 10,
                      }}
                    >
                      {formatTime(tick)}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {renderLaneBase(
              timeline.tracks[0],
              lockedTrackHeight,
              renderTrackControls(timeline.tracks[0], {
                tone: 'linear-gradient(135deg, #1c8fd6, #0ea5d9)',
                label: 'AUD',
                title: '口播',
                subtitle: timeline.podcast.audioPath
                  ? getFileNameFromPath(timeline.podcast.audioPath)
                  : '等待导入音频',
              }),
              {
                overflow: 'hidden',
              },
            )}
            <div
              style={{
                position: 'relative',
                marginTop: -lockedTrackHeight,
                marginLeft: sidebarWidth,
                width: trackWidth,
                height: lockedTrackHeight,
                pointerEvents: 'none',
                overflow: 'hidden',
              }}
            >
              {Array.from({ length: Math.max(48, Math.floor(trackWidth / 6)) }).map((_, index) => {
                const height = 8 + ((index * 17) % 18);
                const left = index * (trackWidth / Math.max(48, Math.floor(trackWidth / 6)));

                return (
                  <span
                    key={`wave-${index}`}
                    style={{
                      position: 'absolute',
                      left,
                      bottom: 4,
                      width: 2,
                      height,
                      background: 'rgba(46,170,236,0.88)',
                      borderRadius: 999,
                    }}
                  />
                );
              })}
            </div>

            {renderLaneBase(
              timeline.tracks[1],
              lockedTrackHeight,
              renderTrackControls(timeline.tracks[1], {
                tone: 'linear-gradient(135deg, #a35d2e, #cb7444)',
                label: 'TXT',
                title: '字幕',
                subtitle: timeline.podcast.srtPath
                  ? getFileNameFromPath(timeline.podcast.srtPath)
                  : '等待导入字幕',
              }),
            )}
            <div
              style={{
                position: 'relative',
                marginTop: -lockedTrackHeight,
                marginLeft: sidebarWidth,
                width: trackWidth,
                height: lockedTrackHeight,
                overflow: 'hidden',
                pointerEvents: 'none',
              }}
            >
              {Array.from({ length: Math.max(14, Math.floor(trackWidth / 42)) }).map((_, index) => (
                <span
                  key={`subtitle-chip-${index}`}
                  style={{
                    position: 'absolute',
                    left: index * 42 + 6,
                    top: 6,
                    height: 18,
                    minWidth: 28,
                    padding: '0 6px',
                    borderRadius: 6,
                    background: 'rgba(203,116,68,0.84)',
                    color: '#fff3eb',
                    fontSize: 10,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    whiteSpace: 'nowrap',
                  }}
                >
                  字幕
                </span>
              ))}
            </div>

            {visualTracks.map((track, index) => {
              const overlays = overlaysByTrack.get(track.id) ?? [];
              const isHover = hoverTrackId === track.id;
              const isTopLayer = index === 0;

              return (
                <div
                  key={track.id}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: `${sidebarWidth}px ${trackWidth}px`,
                    minHeight: overlayTrackHeight,
                  }}
                >
                  {renderTrackControls(track, {
                    tone: isTopLayer
                      ? 'linear-gradient(135deg, #2563eb, #1d4ed8)'
                      : 'linear-gradient(135deg, #3a4a61, #2b3646)',
                    label: `V${visualTracks.length - index}`,
                    title: track.label,
                    subtitle: isTopLayer ? `最上层 · L${track.order}` : `覆盖级 L${track.order}`,
                  })}
                  <div
                    ref={(node) => {
                      trackLaneRefs.current[track.id] = node;
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
                    style={{
                      position: 'relative',
                      height: overlayTrackHeight,
                      borderBottom: '1px solid rgba(255,255,255,0.04)',
                      ...gridBackground,
                      backgroundColor: isHover ? '#28333d' : '#242424',
                      boxShadow: isHover ? 'inset 0 0 0 1px rgba(123,213,255,0.22)' : 'none',
                    }}
                  >
                    {overlays.map((overlay) => (
                      <OverlayBlock
                        key={overlay.id}
                        overlay={overlay}
                        pxPerMs={pxPerMs}
                        trackHeight={overlayTrackHeight}
                        getTrackDragZones={getTrackDragZones}
                        onTrackHoverChange={setHoverTrackId}
                      />
                    ))}

                    {overlays.length === 0 ? (
                      <div
                        style={{
                          position: 'absolute',
                          left: 10,
                          top: '50%',
                          transform: 'translateY(-50%)',
                          color: isHover ? '#9edfff' : '#5f6d81',
                          fontSize: 11,
                          pointerEvents: 'none',
                        }}
                      >
                        拖入图片或视频到 {track.label}
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            })}

            <div
              style={{
                position: 'absolute',
                top: 0,
                bottom: 0,
                left: sidebarWidth + currentTimeMs * pxPerMs,
                width: 2,
                background: '#ffffff',
                pointerEvents: 'none',
                zIndex: 5,
                boxShadow: '0 0 0 1px rgba(0,0,0,0.12)',
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  top: -2,
                  left: -5,
                  width: 12,
                  height: 12,
                  borderRadius: '0 0 8px 8px',
                  background: '#ffffff',
                }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const toolbarTrackButtonStyle: CSSProperties = {
  height: 24,
  padding: '0 8px',
  borderRadius: 7,
  border: '1px solid rgba(85,164,255,0.26)',
  background: 'rgba(37,99,235,0.16)',
  color: '#b9d3ff',
  cursor: 'pointer',
  fontSize: 11,
  fontWeight: 700,
};

const toolbarFitButtonStyle: CSSProperties = {
  height: 24,
  padding: '0 8px',
  borderRadius: 7,
  border: '1px solid rgba(255,255,255,0.08)',
  background: 'rgba(255,255,255,0.04)',
  color: '#dce4f1',
  cursor: 'pointer',
  fontSize: 11,
  fontWeight: 700,
};
