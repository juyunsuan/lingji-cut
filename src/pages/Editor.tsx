import type { MouseEvent as ReactMouseEvent } from 'react';
import { type PlayerRef } from '@remotion/player';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AIPanel } from '../components/AIPanel';
import { AssetPanel } from '../components/AssetPanel';
import { EditorInspector, type InspectorSelection } from '../components/EditorInspector';
import { ExportProgress } from '../components/ExportProgress';
import { ExportSettingsModal } from '../components/ExportSettingsModal';
import { PreviewPanel } from '../components/PreviewPanel';
import { Timeline } from '../components/Timeline';
import type { ExportConfig } from '../lib/export-settings';
import { createDefaultTextData } from '../lib/text-templates';
import { DEFAULT_VISUAL_TRACK_ID, type OverlayPosition } from '../types';
import { useViewportSize } from '../hooks/useViewportSize';
import { getEditorLayoutMode, getTimelinePanelBounds } from '../lib/layout';
import { shouldUpdatePlaybackTime } from '../lib/playback';
import { frameToMs, msToFrame } from '../lib/utils';
import { useTimelineStore } from '../store/timeline';
import { Button } from '../ui';
import { FolderOpen, Sparkles } from 'lucide-react';
import styles from './Editor.module.css';

interface EditorProps {
  onAddAsset: () => Promise<void>;
  exportRequestToken: number;
}

const TIMELINE_PANEL_HEIGHT_KEY = 'podcast-editor-timeline-panel-height';
const TIMELINE_RESIZE_HANDLE_HEIGHT = 6;

function readStoredTimelinePanelHeight(): number | null {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return null;
  }

  const raw = window.localStorage.getItem(TIMELINE_PANEL_HEIGHT_KEY);
  if (!raw) {
    return null;
  }

  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

export function Editor({ onAddAsset, exportRequestToken }: EditorProps) {
  const viewport = useViewportSize();
  const layout = getEditorLayoutMode(viewport.width, viewport.height);
  const panelBounds = getTimelinePanelBounds(viewport.height, layout.compactTimeline);
  const playerRef = useRef<PlayerRef>(null);
  const currentTimeRef = useRef(0);
  const dragStateRef = useRef<{ startY: number; startHeight: number } | null>(null);
  const [timelinePanelHeight, setTimelinePanelHeight] = useState(layout.timelineHeight);
  const [isResizingTimeline, setIsResizingTimeline] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTimeMs, setCurrentTimeMs] = useState(0);
  const [isExportSettingsOpen, setIsExportSettingsOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [outputPath, setOutputPath] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [activePanel, setActivePanel] = useState<'assets' | 'ai'>('assets');
  const [inspectorSelection, setInspectorSelection] = useState<InspectorSelection>({ type: 'empty' });
  const { timeline } = useTimelineStore();
  const fps = timeline.fps || 30;

  useEffect(() => {
    setTimelinePanelHeight((currentHeight) => {
      const storedHeight = readStoredTimelinePanelHeight();
      const nextHeight = storedHeight ?? currentHeight ?? layout.timelineHeight;

      return Math.max(panelBounds.minHeight, Math.min(panelBounds.maxHeight, nextHeight));
    });
  }, [layout.timelineHeight, panelBounds.maxHeight, panelBounds.minHeight]);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
      return;
    }

    window.localStorage.setItem(TIMELINE_PANEL_HEIGHT_KEY, String(timelinePanelHeight));
  }, [timelinePanelHeight]);

  useEffect(() => {
    if (!isResizingTimeline) {
      return;
    }

    const handleMouseMove = (event: globalThis.MouseEvent) => {
      const dragState = dragStateRef.current;
      if (!dragState) {
        return;
      }

      const nextHeight = dragState.startHeight - (event.clientY - dragState.startY);
      setTimelinePanelHeight(
        Math.max(panelBounds.minHeight, Math.min(panelBounds.maxHeight, Math.round(nextHeight))),
      );
    };
    const handleMouseUp = () => {
      dragStateRef.current = null;
      setIsResizingTimeline(false);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizingTimeline, panelBounds.maxHeight, panelBounds.minHeight]);

  useEffect(() => {
    const cleanup = window.electronAPI.onRenderProgress((progress) => {
      setExportProgress(progress);
    });

    return cleanup;
  }, []);

  useEffect(() => {
    const player = playerRef.current;
    if (!player) {
      return;
    }

    const handleFrameUpdate = ({ detail }: { detail: { frame: number } }) => {
      const nextTimeMs = frameToMs(detail.frame, fps);

      if (!shouldUpdatePlaybackTime(currentTimeRef.current, nextTimeMs)) {
        return;
      }

      currentTimeRef.current = nextTimeMs;
      setCurrentTimeMs(nextTimeMs);
    };
    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    const handleEnded = () => {
      currentTimeRef.current = timeline.podcast.durationMs;
      setCurrentTimeMs(timeline.podcast.durationMs);
      setIsPlaying(false);
    };

    player.addEventListener('frameupdate', handleFrameUpdate);
    player.addEventListener('play', handlePlay);
    player.addEventListener('pause', handlePause);
    player.addEventListener('ended', handleEnded);

    return () => {
      player.removeEventListener('frameupdate', handleFrameUpdate);
      player.removeEventListener('play', handlePlay);
      player.removeEventListener('pause', handlePause);
      player.removeEventListener('ended', handleEnded);
    };
  }, [fps, timeline.podcast.durationMs]);

  useEffect(() => {
    if (exportRequestToken === 0) {
      return;
    }

    setIsExportSettingsOpen(true);
  }, [exportRequestToken]);

  const handleTogglePlay = useCallback(() => {
    const player = playerRef.current;
    if (!player) {
      return;
    }

    if (player.isPlaying()) {
      player.pause();
      return;
    }

    player.play();
  }, []);

  const handleSeek = useCallback(
    (targetMs: number) => {
      const player = playerRef.current;
      if (!player) {
        return;
      }

      player.seekTo(msToFrame(targetMs, fps));
      currentTimeRef.current = targetMs;
      setCurrentTimeMs(targetMs);
    },
    [fps],
  );

  const handleExport = useCallback(async () => {
    setIsExportSettingsOpen(true);
  }, []);

  const handleOpenAICardInspector = useCallback((cardId: string) => {
    setInspectorSelection({ type: 'ai-card', cardId });
    setActivePanel('ai');
  }, []);

  const handleOpenSubtitleInspector = useCallback(() => {
    setInspectorSelection({ type: 'subtitle-style' });
  }, []);

  const handleCloseInspector = useCallback(() => {
    setInspectorSelection({ type: 'empty' });
  }, []);

  const handleOpenTextInspector = useCallback(
    (overlayId: string) => {
      setInspectorSelection({ type: 'text-overlay', overlayId });
    },
    [],
  );

  const handleAddTextOverlay = useCallback(() => {
    const store = useTimelineStore.getState();
    const currentTime = currentTimeRef.current;
    const { width, height } = store.timeline;

    // 找到第一条视觉轨道
    const visualTrack = store.timeline.tracks.find((t) => t.kind === 'visual');
    const trackId = visualTrack?.id ?? DEFAULT_VISUAL_TRACK_ID;

    const overlayId = store.addOverlay({
      type: 'text',
      assetPath: '',
      trackId,
      startMs: Math.max(0, Math.round(currentTime)),
      durationMs: 5000,
      position: {
        x: (width - 800) / 2,
        y: (height - 200) / 2,
        width: 800,
        height: 200,
      },
      textData: createDefaultTextData(),
    });

    // 自动打开文字检查器
    setInspectorSelection({ type: 'text-overlay', overlayId });
  }, []);

  const handleSelectOverlayOnCanvas = useCallback(
    (overlayId: string | null) => {
      if (overlayId) {
        const overlay = timeline.overlays.find((o) => o.id === overlayId);
        if (overlay?.type === 'text') {
          setInspectorSelection({ type: 'text-overlay', overlayId });
          return;
        }
      }
      setInspectorSelection({ type: 'empty' });
    },
    [timeline.overlays],
  );

  const handleUpdateOverlayPosition = useCallback(
    (overlayId: string, position: OverlayPosition) => {
      useTimelineStore.getState().updateOverlay(overlayId, { position });
    },
    [],
  );

  const handleTimelineResizeStart = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      event.preventDefault();
      dragStateRef.current = {
        startY: event.clientY,
        startHeight: timelinePanelHeight,
      };
      setIsResizingTimeline(true);
    },
    [timelinePanelHeight],
  );

  const handleConfirmExport = useCallback(async ({ outputPath: savePath, exportConfig }: {
    outputPath: string;
    exportConfig: ExportConfig;
  }) => {
    setIsExportSettingsOpen(false);
    setOutputPath(savePath);
    setIsExporting(true);
    setExportProgress(0);
    setExportError(null);

    try {
      await window.electronAPI.renderVideo({
        timeline: JSON.stringify(timeline),
        outputPath: savePath,
        exportConfig,
      });
      setExportProgress(1);
    } catch (error) {
      console.error('导出失败:', error);
      setExportError('导出失败，请查看控制台日志后重试。');
    }
  }, [timeline]);

  return (
    <div
      className={styles.root}
      data-editor-region="root"
      style={{
        gridTemplateRows: `minmax(0, 1fr) ${TIMELINE_RESIZE_HANDLE_HEIGHT}px ${timelinePanelHeight}px`,
      }}
    >
      <div
        className={styles.workspace}
        data-editor-region="workspace"
        style={{
          gridTemplateColumns: layout.stackSidebar
            ? 'minmax(0, 1fr)'
            : '224px minmax(0, 1fr) 260px',
          gridTemplateRows: layout.stackSidebar
            ? `minmax(0, 1fr) ${layout.sidebarRailHeight}px`
            : 'minmax(0, 1fr)',
        }}
      >
        {layout.stackSidebar && inspectorSelection.type !== 'empty' ? (
          <>
            <div className={styles.previewWrap}>
              <PreviewPanel
                playerRef={playerRef}
                isPlaying={isPlaying}
                onTogglePlay={handleTogglePlay}
                onExport={handleExport}
                currentTimeMs={currentTimeMs}
                durationMs={timeline.podcast.durationMs}
                compact={layout.compactToolbar}
                selectedOverlayId={
                  inspectorSelection.type === 'text-overlay' ? inspectorSelection.overlayId : null
                }
                onSelectOverlay={handleSelectOverlayOnCanvas}
                onUpdateOverlayPosition={handleUpdateOverlayPosition}
              />
            </div>
            <div className={styles.inspectorWrap}>
              <EditorInspector
                selection={inspectorSelection}
                timelineWidth={timeline.width}
                timelineHeight={timeline.height}
                onClose={handleCloseInspector}
              />
            </div>
          </>
        ) : (
          <>
            <div
              className={styles.sidebarShell}
              data-editor-region="sidebar-shell"
              data-editor-sidebar-style="flat-panel"
              data-editor-sidebar-width="224"
            >
              <div className={styles.tabStrip}>
                <div className={styles.topTabBar} role="tablist" aria-label="侧边栏面板切换">
                  <Button
                    role="tab"
                    aria-selected={activePanel === 'assets'}
                    variant="ghost"
                    size="sm"
                    className={joinClassNames(
                      styles.topTabButton,
                      activePanel === 'assets' ? styles.topTabButtonActive : '',
                    )}
                    onClick={() => setActivePanel('assets')}
                  >
                    <FolderOpen size={13} className={styles.topTabIcon} />
                    <span>素材</span>
                  </Button>
                  <Button
                    role="tab"
                    aria-selected={activePanel === 'ai'}
                    variant="ghost"
                    size="sm"
                    className={joinClassNames(
                      styles.topTabButton,
                      activePanel === 'ai' ? styles.topTabButtonActive : '',
                    )}
                    onClick={() => setActivePanel('ai')}
                  >
                    <Sparkles size={13} className={styles.topTabIcon} />
                    <span>AI 助手</span>
                  </Button>
                </div>
              </div>
              <div className={styles.panelBody}>
                {activePanel === 'assets' ? (
                  <AssetPanel
                    compact={layout.stackSidebar}
                    railHeight={layout.sidebarRailHeight}
                    onAddAsset={onAddAsset}
                    onOpenSubtitleInspector={handleOpenSubtitleInspector}
                    onAddTextOverlay={handleAddTextOverlay}
                  />
                ) : (
                  <AIPanel
                    compact={layout.stackSidebar}
                    railHeight={layout.sidebarRailHeight}
                    inspectedCardId={inspectorSelection.type === 'ai-card' ? inspectorSelection.cardId : null}
                    onClearInspector={handleCloseInspector}
                    onOpenCardInspector={handleOpenAICardInspector}
                  />
                )}
              </div>
            </div>
            <div className={styles.previewWrap}>
              <PreviewPanel
                playerRef={playerRef}
                isPlaying={isPlaying}
                onTogglePlay={handleTogglePlay}
                onExport={handleExport}
                currentTimeMs={currentTimeMs}
                durationMs={timeline.podcast.durationMs}
                compact={layout.compactToolbar}
                selectedOverlayId={
                  inspectorSelection.type === 'text-overlay' ? inspectorSelection.overlayId : null
                }
                onSelectOverlay={handleSelectOverlayOnCanvas}
                onUpdateOverlayPosition={handleUpdateOverlayPosition}
              />
            </div>
            {!layout.stackSidebar ? (
              <div className={styles.inspectorWrap}>
                <EditorInspector
                  selection={inspectorSelection}
                  timelineWidth={timeline.width}
                  timelineHeight={timeline.height}
                  onClose={handleCloseInspector}
                />
              </div>
            ) : null}
          </>
        )}
      </div>

      <div
        onMouseDown={handleTimelineResizeStart}
        className={[
          styles.resizeHandle,
          isResizingTimeline ? styles.resizeActive : '',
        ].filter(Boolean).join(' ')}
        data-editor-region="resize-handle"
      >
        <div className={styles.resizeThumb} />
      </div>

      <div className={styles.timelineWrap} data-editor-region="timeline-wrap">
        <Timeline
          currentTimeMs={currentTimeMs}
          onSeek={handleSeek}
          compact={layout.compactTimeline}
          onOpenAICardInspector={handleOpenAICardInspector}
          onOpenSubtitleInspector={handleOpenSubtitleInspector}
          onOpenTextInspector={handleOpenTextInspector}
        />
      </div>

      <ExportProgress
        visible={isExporting}
        progress={exportProgress}
        outputPath={outputPath}
        errorMessage={exportError}
        onClose={() => {
          setIsExporting(false);
          setExportProgress(0);
          setExportError(null);
        }}
      />
      <ExportSettingsModal
        visible={isExportSettingsOpen}
        timelineWidth={timeline.width}
        timelineHeight={timeline.height}
        onClose={() => setIsExportSettingsOpen(false)}
        onConfirm={handleConfirmExport}
      />
    </div>
  );
}

function joinClassNames(...values: Array<string | undefined>): string {
  return values.filter(Boolean).join(' ');
}
