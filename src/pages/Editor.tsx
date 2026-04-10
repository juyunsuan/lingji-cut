import type { MouseEvent as ReactMouseEvent } from 'react';
import { type PlayerRef } from '@remotion/player';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AIPanel } from '../components/AIPanel';
import { AssetPanel } from '../components/AssetPanel';
import { EditorInspector, type InspectorSelection } from '../components/EditorInspector';
import { ExportProgress } from '../components/ExportProgress';
import { ExportSettingsModal } from '../components/ExportSettingsModal';
import { PreviewPanel } from '../components/PreviewPanel';
import { TimelineAIOverlay } from '../components/TimelineAIOverlay';
import { Timeline } from '../components/Timeline';
import type { ProjectOverviewMeta } from '../components/ProjectOverviewPanel';
import type { ProjectMetadata } from '../lib/electron-api';
import { createPersistedAIState } from '../lib/ai-persistence';
import { getAISettingsIssue } from '../lib/ai-settings';
import type { ExportConfig } from '../lib/export-settings';
import { createDefaultTextData } from '../lib/text-templates';
import { DEFAULT_VISUAL_TRACK_ID, type OverlayPosition } from '../types';
import type { AIAnalysisResult } from '../types/ai';
import { useAIVideoWorkflow } from '../hooks/useAIVideoWorkflow';
import { useViewportSize } from '../hooks/useViewportSize';
import { getEditorLayoutMode, getTimelinePanelBounds } from '../lib/layout';
import { shouldUpdatePlaybackTime } from '../lib/playback';
import { frameToMs, getFileNameFromPath, msToFrame } from '../lib/utils';
import { loadAISettings, useAIStore } from '../store/ai';
import { useTimelineStore } from '../store/timeline';
import { Button } from '../ui';
import { AppIcon } from '../components/AppIcon';
import styles from './Editor.module.css';

interface EditorProps {
  onAddAsset: () => Promise<void>;
  onUseAsPodcastAudio: (path: string, durationMs: number) => Promise<void>;
  onUseAsPodcastSrt: (path: string) => Promise<void>;
  exportRequestToken: number;
  projectDir?: string;
  isActive?: boolean;
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

export function Editor({
  onAddAsset,
  onUseAsPodcastAudio,
  onUseAsPodcastSrt,
  exportRequestToken,
  projectDir = '',
  isActive = false,
}: EditorProps) {
  const viewport = useViewportSize();
  const layout = getEditorLayoutMode(viewport.width, viewport.height);
  const panelBounds = getTimelinePanelBounds(viewport.height, layout.compactTimeline);
  const playerRef = useRef<PlayerRef>(null);
  const timelineWrapRef = useRef<HTMLDivElement>(null);
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
  const [projectMeta, setProjectMeta] = useState<ProjectOverviewMeta | null>(null);
  const [isProjectMetaLoading, setIsProjectMetaLoading] = useState(false);
  const store = useTimelineStore();
  const clearAIAnalysis = useAIStore((state) => state.clearAnalysis);
  const setAIAnalysisError = useAIStore((state) => state.setAnalysisError);
  const setAIAnalysisResult = useAIStore((state) => state.setAnalysisResult);
  const setCoverCandidates = useAIStore((state) => state.setCoverCandidates);
  const {
    start: startWorkflow,
    cancel: cancelWorkflow,
    retry: retryWorkflow,
    continueFromTtsDone,
    workflow,
  } = useAIVideoWorkflow();
  const assets = store.assets ?? [];
  const { timeline } = store;
  const overlayCount = timeline.overlays?.length ?? 0;
  const hasAICardOverlays = timeline.overlays?.some(
    (overlay) => overlay.overlayType === 'ai-card',
  ) ?? false;
  const podcastAudioPath = timeline.podcast?.audioPath ?? '';
  const podcastSrtPath = timeline.podcast?.srtPath ?? '';
  const fps = timeline.fps || 30;

  useEffect(() => {
    let cancelled = false;

    if (!projectDir || !window.electronAPI?.getProjectMetadata) {
      setProjectMeta(null);
      setIsProjectMetaLoading(false);
      return () => {
        cancelled = true;
      };
    }

    setIsProjectMetaLoading(true);

    void window.electronAPI
      .getProjectMetadata(projectDir)
      .then((metadata: ProjectMetadata) => {
        if (cancelled) {
          return;
        }

        setProjectMeta(mapProjectMetadata(metadata));
      })
      .catch((error) => {
        console.error('读取项目元数据失败:', error);
        if (!cancelled) {
          setProjectMeta(null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsProjectMetaLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [overlayCount, podcastAudioPath, podcastSrtPath, projectDir]);

  // 自动扫描项目目录下的媒体素材
  useEffect(() => {
    if (!projectDir) return;
    let cancelled = false;

    void window.electronAPI.scanProjectAssets(projectDir).then((scanned) => {
      if (cancelled || scanned.length === 0) return;
      useTimelineStore.getState().addAssets(scanned);
    }).catch((err) => {
      console.error('扫描项目素材失败:', err);
    });

    return () => { cancelled = true; };
  }, [projectDir]);

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

  useEffect(() => {
    if (isActive && workflow.step === 'tts_done' && projectDir) {
      continueFromTtsDone(projectDir);
    }
  }, [continueFromTtsDone, isActive, projectDir, workflow.step]);

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

  const persistAIState = useCallback(
    async (result: AIAnalysisResult | null) => {
      if (!projectDir) {
        return;
      }

      const persistedState = createPersistedAIState(result, []);
      await window.electronAPI.saveProjectSection(
        projectDir,
        'aiAnalysis',
        JSON.stringify(persistedState),
      );
    },
    [projectDir],
  );

  const rerunAiAnalysisForCurrentSrt = useCallback(
    async (entries: ReturnType<typeof useTimelineStore.getState>['srtEntries']) => {
      const settings = await loadAISettings();
      const settingsIssue = getAISettingsIssue(settings);

      clearAIAnalysis();
      await persistAIState(null);

      if (settingsIssue || !settings) {
        setAIAnalysisError(settingsIssue ?? '请先完成 AI 配置后再重新分析');
        setActivePanel('ai');
        return;
      }

      try {
        const result = (await window.electronAPI.analyzeSrt({
          entries,
          settings,
        })) as AIAnalysisResult;
        setAIAnalysisResult(result);
        setCoverCandidates([]);
        await persistAIState(result);
      } catch (error) {
        console.error('重新分析字幕失败:', error);
        setAIAnalysisError(
          error instanceof Error ? error.message : '重新分析字幕失败，请稍后重试。',
        );
      }
    },
    [
      clearAIAnalysis,
      persistAIState,
      setAIAnalysisError,
      setAIAnalysisResult,
      setCoverCandidates,
    ],
  );

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

  const handleOpenOverlayInspector = useCallback(
    (overlayId: string) => {
      setInspectorSelection({ type: 'overlay', overlayId });
    },
    [],
  );

  const handleReplaceAudio = useCallback(async () => {
    const audioPath = await window.electronAPI.selectMediaFile('audio');
    if (!audioPath) {
      return;
    }

    const durationMs = await window.electronAPI
      .getAudioDuration(audioPath)
      .catch(() => store.timeline.podcast?.durationMs ?? 0);

    store.setPodcast(
      audioPath,
      store.timeline.podcast?.srtPath ?? '',
      durationMs,
    );
  }, [store]);

  const handleReplaceSrt = useCallback(async () => {
    const srtPath = await window.electronAPI.selectMediaFile('srt');
    if (!srtPath) {
      return;
    }

    const { entries, durationMs } = await window.electronAPI.parseSrtFile(srtPath);
    store.setSrtEntries(entries);
    store.setPodcast(store.timeline.podcast?.audioPath ?? '', srtPath, durationMs);

    const shouldReanalyze = window.confirm(
      '替换字幕后，AI 卡片分析将失效。是否立即重新分析？',
    );

    if (shouldReanalyze) {
      await rerunAiAnalysisForCurrentSrt(entries);
    }
  }, [rerunAiAnalysisForCurrentSrt, store]);

  const handleStartAIClip = useCallback(async () => {
    if (!projectDir) {
      return;
    }

    const scriptContent = await window.electronAPI
      .loadScriptFile(projectDir, 'script.md')
      .catch(() => null);

    if (!scriptContent?.trim()) {
      window.alert('未找到 script.md，请先在文稿工作台完成口播稿生成。');
      return;
    }

    startWorkflow(scriptContent);
  }, [projectDir, startWorkflow]);

  const handleAddTextOverlay = useCallback(() => {
    const store = useTimelineStore.getState();
    const currentTime = currentTimeRef.current;
    const { width, height } = store.timeline;

    // 找到最顶层（order 最高）的视觉轨道，确保文字渲染在最前面
    const visualTracks = store.timeline.tracks
      .filter((t) => t.kind === 'visual')
      .sort((a, b) => b.order - a.order);
    const trackId = visualTracks[0]?.id ?? DEFAULT_VISUAL_TRACK_ID;

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

    // 自动打开 overlay 检查器
    setInspectorSelection({ type: 'overlay', overlayId });
  }, []);

  const handleSelectOverlayOnCanvas = useCallback(
    (overlayId: string | null) => {
      if (overlayId) {
        const overlay = timeline.overlays.find((o) => o.id === overlayId);
        if (overlay) {
          setInspectorSelection({ type: 'overlay', overlayId });
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
                  inspectorSelection.type === 'overlay' ? inspectorSelection.overlayId : null
                }
                onSelectOverlay={handleSelectOverlayOnCanvas}
                onUpdateOverlayPosition={handleUpdateOverlayPosition}
              />
            </div>
            <div className={styles.inspectorWrap}>
              <EditorInspector
                assetCount={assets.length}
                isProjectMetaLoading={isProjectMetaLoading}
                overlayCount={overlayCount}
                projectDir={projectDir}
                projectMeta={projectMeta}
                selection={inspectorSelection}
                timelineFps={fps}
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
                <div className={styles.tabHeader}>
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
                      <AppIcon name="folder-open" size={14} className={styles.topTabIcon} />
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
                      <AppIcon name="sparkles" size={14} className={styles.topTabIcon} />
                      <span>AI 助手</span>
                    </Button>
                  </div>
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
                    onUseAsPodcastAudio={onUseAsPodcastAudio}
                    onUseAsPodcastSrt={onUseAsPodcastSrt}
                    onReplaceAudio={handleReplaceAudio}
                    onReplaceSrt={handleReplaceSrt}
                    showAIClip={
                      (workflow.step === 'idle' ||
                        workflow.step === 'error') &&
                      Boolean(projectDir) &&
                      !hasAICardOverlays
                    }
                    onStartAIClip={() => {
                      void handleStartAIClip();
                    }}
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
                  inspectorSelection.type === 'overlay' ? inspectorSelection.overlayId : null
                }
                onSelectOverlay={handleSelectOverlayOnCanvas}
                onUpdateOverlayPosition={handleUpdateOverlayPosition}
              />
            </div>
            {!layout.stackSidebar ? (
              <div className={styles.inspectorWrap}>
                <EditorInspector
                  assetCount={assets.length}
                  isProjectMetaLoading={isProjectMetaLoading}
                  overlayCount={overlayCount}
                  projectDir={projectDir}
                  projectMeta={projectMeta}
                  selection={inspectorSelection}
                  timelineFps={fps}
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

      <div
        ref={timelineWrapRef}
        className={styles.timelineWrap}
        data-editor-region="timeline-wrap"
      >
        <Timeline
          currentTimeMs={currentTimeMs}
          onSeek={handleSeek}
          compact={layout.compactTimeline}
          onOpenAICardInspector={handleOpenAICardInspector}
          onOpenSubtitleInspector={handleOpenSubtitleInspector}
          onOpenOverlayInspector={handleOpenOverlayInspector}
        />
        <TimelineAIOverlay
          workflow={workflow}
          timelineContainerRef={timelineWrapRef}
          compactTimeline={layout.compactTimeline}
          onCancel={cancelWorkflow}
          onRetry={retryWorkflow}
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

function mapProjectMetadata(metadata: ProjectMetadata): ProjectOverviewMeta {
  return {
    projectName: getFileNameFromPath(metadata.projectDir),
    projectPath: metadata.projectDir,
    createdAt: metadata.createdAtMs,
    sizeBytes: metadata.sizeBytes,
  };
}

function joinClassNames(...values: Array<string | undefined>): string {
  return values.filter(Boolean).join(' ');
}
