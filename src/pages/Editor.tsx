import type { CSSProperties, MouseEvent as ReactMouseEvent } from 'react';
import { type PlayerRef } from '@remotion/player';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AIPanel } from '../components/AIPanel';
import { AssetPanel } from '../components/AssetPanel';
import { ExportProgress } from '../components/ExportProgress';
import { ExportSettingsModal } from '../components/ExportSettingsModal';
import { PreviewPanel } from '../components/PreviewPanel';
import { Timeline } from '../components/Timeline';
import type { ExportConfig } from '../lib/export-settings';
import { useViewportSize } from '../hooks/useViewportSize';
import { getEditorLayoutMode, getTimelinePanelBounds } from '../lib/layout';
import { shouldUpdatePlaybackTime } from '../lib/playback';
import { frameToMs, msToFrame } from '../lib/utils';
import { useTimelineStore } from '../store/timeline';
import { TabBar } from '../ui/patterns';

interface EditorProps {
  onAddAsset: () => Promise<void>;
  exportRequestToken: number;
}

const TIMELINE_PANEL_HEIGHT_KEY = 'podcast-editor-timeline-panel-height';
const TIMELINE_RESIZE_HANDLE_HEIGHT = 10;

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
      style={{
        display: 'grid',
        gridTemplateRows: `minmax(0, 1fr) ${TIMELINE_RESIZE_HANDLE_HEIGHT}px ${timelinePanelHeight}px`,
        height: '100%',
        minHeight: 0,
        background: 'linear-gradient(135deg, #020617 0%, #020617 50%, #020617 100%)',
      }}
    >
      <div
        style={{
          minHeight: 0,
          display: 'grid',
          gridTemplateColumns: layout.stackSidebar ? 'minmax(0, 1fr)' : 'minmax(0, 1fr) minmax(260px, 300px)',
          gridTemplateRows: layout.stackSidebar
            ? `minmax(0, 1fr) ${layout.sidebarRailHeight}px`
            : 'minmax(0, 1fr)',
          overflow: 'hidden',
          gap: 16,
          padding: 16,
        }}
      >
        <div style={{ minWidth: 0, minHeight: 0 }}>
          <PreviewPanel
            playerRef={playerRef}
            isPlaying={isPlaying}
            onTogglePlay={handleTogglePlay}
            onExport={handleExport}
            currentTimeMs={currentTimeMs}
            durationMs={timeline.podcast.durationMs}
            compact={layout.compactToolbar}
          />
        </div>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            minHeight: 0,
            overflow: 'hidden',
            background: 'rgba(15, 23, 42, 0.85)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            borderRadius: 20,
            border: '1px solid rgba(148, 163, 184, 0.12)',
            boxShadow: '0 24px 60px rgba(15, 23, 42, 0.65)',
          }}
        >
          <div
            style={{
              borderBottom: '1px solid rgba(148, 163, 184, 0.10)',
              flexShrink: 0,
              padding: '6px 8px 0',
              background: 'linear-gradient(180deg, rgba(15, 23, 42, 0.6) 0%, rgba(15, 23, 42, 0.3) 100%)',
            }}
          >
            <TabBar
              items={[
                { value: 'assets', label: '素材' },
                { value: 'ai', label: 'AI 助手' },
              ]}
              value={activePanel}
              onChange={setActivePanel}
            />
          </div>
          <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex' }}>
            {activePanel === 'assets' ? (
              <AssetPanel
                compact={layout.stackSidebar}
                railHeight={layout.sidebarRailHeight}
                onAddAsset={onAddAsset}
              />
            ) : (
              <AIPanel compact={layout.stackSidebar} railHeight={layout.sidebarRailHeight} />
            )}
          </div>
        </div>
      </div>

      <div
        onMouseDown={handleTimelineResizeStart}
        style={{
          ...timelineResizeHandleStyle,
          cursor: 'ns-resize',
        }}
      >
        <div
          style={{
            width: 80,
            height: 5,
            borderRadius: 999,
            background: isResizingTimeline
              ? 'linear-gradient(90deg, rgba(56, 189, 248, 0.9), rgba(129, 140, 248, 0.9))'
              : 'rgba(148, 163, 184, 0.25)',
            boxShadow: isResizingTimeline
              ? '0 0 20px rgba(56, 189, 248, 0.35)'
              : 'none',
            transition: 'all 200ms ease-out',
          }}
        />
      </div>

      <div
        style={{
          minHeight: 0,
          padding: '0 16px 16px',
          boxSizing: 'border-box',
          overflow: 'hidden',
        }}
      >
        <Timeline currentTimeMs={currentTimeMs} onSeek={handleSeek} compact={layout.compactTimeline} />
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

const timelineResizeHandleStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  userSelect: 'none',
  background: 'linear-gradient(180deg, rgba(2, 6, 23, 0.98), rgba(15, 23, 42, 0.96))',
  borderTop: '1px solid rgba(148, 163, 184, 0.10)',
  borderBottom: '1px solid rgba(148, 163, 184, 0.08)',
};
