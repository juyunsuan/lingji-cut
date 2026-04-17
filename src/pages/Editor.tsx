import { type PlayerRef } from '@remotion/player';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AIPanel } from '../components/AIPanel';
import { AssetPanel } from '../components/AssetPanel';
import { EditorInspector, type InspectorSelection } from '../components/EditorInspector';
import { ResizeHandle } from '../components/ResizeHandle';
import { useTaskProgressStore } from '../store/task-progress';
import { ExportSettingsModal } from '../components/ExportSettingsModal';
import { PreviewPanel } from '../components/PreviewPanel';
import { TimelineAIOverlay } from '../components/TimelineAIOverlay';
import { Timeline } from '../components/Timeline';
import type { ProjectOverviewMeta } from '../components/ProjectOverviewPanel';
import {
  isReusablePodcastMedia,
  readStoredExistingMediaDecision,
  resolveWorkflowStartStep,
  writeStoredExistingMediaDecision,
  type ExistingMediaDecision,
} from '../lib/ai-clip-reuse';
import type { ProjectMetadata } from '../lib/electron-api';
import { createPersistedAIState } from '../lib/ai-persistence';
import { mergeCoverCandidatesFromScannedAssets } from '../lib/ai-persistence';
import { getAISettingsIssue } from '../lib/ai-settings';
import type { ExportConfig } from '../lib/export-settings';
import { createDefaultTextData } from '../lib/text-templates';
import { DEFAULT_VISUAL_TRACK_ID, type OverlayPosition } from '../types';
import type { AIAnalysisResult } from '../types/ai';
import { useAIVideoWorkflow } from '../hooks/useAIVideoWorkflow';
import { useViewportSize } from '../hooks/useViewportSize';
import { getEditorLayoutMode, getTimelinePanelBounds } from '../lib/layout';
import { shouldUpdatePlaybackTime } from '../lib/playback';
import {
  frameToMs,
  getEffectiveTimelineDurationMs,
  getFileNameFromPath,
  msToFrame,
} from '../lib/utils';
import { loadAISettings, useAIStore } from '../store/ai';
import { useTimelineStore } from '../store/timeline';
import {
  Alert,
  Button,
  Card,
  CardContent,
  Checkbox,
  ConfirmDialog,
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '../ui';
import { AppIcon } from '../components/AppIcon';
import styles from './Editor.module.css';

interface EditorProps {
  onAddAsset: () => Promise<void>;
  initialActivePanel?: 'assets' | 'ai';
  onOpenSettings: () => void;
  onUseAsPodcastAudio: (path: string, durationMs: number) => Promise<void>;
  onUseAsPodcastSrt: (path: string) => Promise<void>;
  exportRequestToken: number;
  projectDir?: string;
  isActive?: boolean;
}

const TIMELINE_PANEL_HEIGHT_KEY = 'podcast-editor-timeline-panel-height';
const SIDEBAR_WIDTH_KEY = 'podcast-editor-sidebar-width';
const INSPECTOR_WIDTH_KEY = 'podcast-editor-inspector-width';
const RESIZE_HANDLE_THICKNESS = 6;
const SIDEBAR_DEFAULT_WIDTH = 224;
const INSPECTOR_DEFAULT_WIDTH = 260;
const SIDEBAR_MIN_WIDTH = 180;
const SIDEBAR_MAX_WIDTH = 420;
const INSPECTOR_MIN_WIDTH = 220;
const INSPECTOR_MAX_WIDTH = 480;
const PREVIEW_MIN_WIDTH = 360;

function readStoredNumber(key: string): number | null {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return null;
  }

  const raw = window.localStorage.getItem(key);
  if (!raw) {
    return null;
  }

  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function Editor({
  onAddAsset,
  initialActivePanel = 'assets',
  onOpenSettings,
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
  const [timelinePanelHeight, setTimelinePanelHeight] = useState(layout.timelineHeight);
  const [sidebarWidth, setSidebarWidth] = useState(SIDEBAR_DEFAULT_WIDTH);
  const [inspectorWidth, setInspectorWidth] = useState(INSPECTOR_DEFAULT_WIDTH);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTimeMs, setCurrentTimeMs] = useState(0);
  const [isExportSettingsOpen, setIsExportSettingsOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [outputPath, setOutputPath] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [missingScriptDialogOpen, setMissingScriptDialogOpen] = useState(false);
  const [existingMediaDialogOpen, setExistingMediaDialogOpen] = useState(false);
  const [pendingWorkflowScript, setPendingWorkflowScript] = useState<string | null>(null);
  const [rememberExistingMediaDecision, setRememberExistingMediaDecision] = useState(false);
  const [regeneratePodcastDialogOpen, setRegeneratePodcastDialogOpen] = useState(false);
  const [pendingRegenerateScript, setPendingRegenerateScript] = useState<string | null>(null);
  const [pendingReanalyzeEntries, setPendingReanalyzeEntries] = useState<
    ReturnType<typeof useTimelineStore.getState>['srtEntries'] | null
  >(null);
  const [activePanel, setActivePanel] = useState<'assets' | 'ai'>(initialActivePanel);
  const [inspectorSelection, setInspectorSelection] = useState<InspectorSelection>({ type: 'empty' });
  const [projectMeta, setProjectMeta] = useState<ProjectOverviewMeta | null>(null);
  const [isProjectMetaLoading, setIsProjectMetaLoading] = useState(false);
  const store = useTimelineStore();
  const clearAIAnalysis = useAIStore((state) => state.clearAnalysis);
  const setAIAnalysisError = useAIStore((state) => state.setAnalysisError);
  const setAIAnalysisResult = useAIStore((state) => state.setAnalysisResult);
  const setCoverCandidates = useAIStore((state) => state.setCoverCandidates);
  const motionCards = useAIStore((state) => state.motionCards);
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
  // 时间轴有效时长：取 max(口播音频, 任意 overlay 末端, 1s 兜底)。
  // 没有口播素材时仍保证 Player 能播放完已经添加的动画卡片。
  const effectiveDurationMs = useMemo(
    () => getEffectiveTimelineDurationMs(timeline),
    [timeline],
  );

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

    void window.electronAPI
      .scanProjectAssets(projectDir)
      .then((scanned) => {
        if (cancelled || scanned.length === 0) {
          return;
        }

        useTimelineStore.getState().addAssets(scanned);

        const aiState = useAIStore.getState();
        const mergedCandidates = mergeCoverCandidatesFromScannedAssets(
          projectDir,
          aiState.coverCandidates,
          scanned,
          aiState.analysisResult?.coverPrompts[0] ?? '目录扫描封面',
        );

        if (JSON.stringify(mergedCandidates) === JSON.stringify(aiState.coverCandidates)) {
          return;
        }

        setCoverCandidates(mergedCandidates);

        const persistedState = createPersistedAIState(
          aiState.analysisResult,
          mergedCandidates,
          aiState.motionCards,
          aiState.storyboardPlan,
        );

        void window.electronAPI.saveProjectSection(
          projectDir,
          'aiAnalysis',
          JSON.stringify({
            analysisResult: persistedState.analysisResult,
            coverCandidates: persistedState.coverCandidates,
            motionCards: persistedState.motionCards ?? [],
          }),
        );
      })
      .catch((err) => {
        console.error('扫描项目素材失败:', err);
      });

    return () => { cancelled = true; };
  }, [projectDir, setCoverCandidates]);

  const sidebarMaxWidth = useMemo(
    () => Math.min(
      SIDEBAR_MAX_WIDTH,
      Math.max(SIDEBAR_MIN_WIDTH, viewport.width - inspectorWidth - PREVIEW_MIN_WIDTH - RESIZE_HANDLE_THICKNESS * 2),
    ),
    [inspectorWidth, viewport.width],
  );

  const inspectorMaxWidth = useMemo(
    () => Math.min(
      INSPECTOR_MAX_WIDTH,
      Math.max(INSPECTOR_MIN_WIDTH, viewport.width - sidebarWidth - PREVIEW_MIN_WIDTH - RESIZE_HANDLE_THICKNESS * 2),
    ),
    [sidebarWidth, viewport.width],
  );

  useEffect(() => {
    setTimelinePanelHeight((currentHeight) => {
      const storedHeight = readStoredNumber(TIMELINE_PANEL_HEIGHT_KEY);
      const nextHeight = storedHeight ?? currentHeight ?? layout.timelineHeight;

      return clamp(nextHeight, panelBounds.minHeight, panelBounds.maxHeight);
    });
  }, [layout.timelineHeight, panelBounds.maxHeight, panelBounds.minHeight]);

  useEffect(() => {
    setSidebarWidth((current) => {
      const stored = readStoredNumber(SIDEBAR_WIDTH_KEY);
      const next = stored ?? current ?? SIDEBAR_DEFAULT_WIDTH;
      return clamp(next, SIDEBAR_MIN_WIDTH, sidebarMaxWidth);
    });
  }, [sidebarMaxWidth]);

  useEffect(() => {
    setInspectorWidth((current) => {
      const stored = readStoredNumber(INSPECTOR_WIDTH_KEY);
      const next = stored ?? current ?? INSPECTOR_DEFAULT_WIDTH;
      return clamp(next, INSPECTOR_MIN_WIDTH, inspectorMaxWidth);
    });
  }, [inspectorMaxWidth]);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
      return;
    }

    window.localStorage.setItem(TIMELINE_PANEL_HEIGHT_KEY, String(timelinePanelHeight));
  }, [timelinePanelHeight]);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
      return;
    }
    window.localStorage.setItem(SIDEBAR_WIDTH_KEY, String(sidebarWidth));
  }, [sidebarWidth]);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
      return;
    }
    window.localStorage.setItem(INSPECTOR_WIDTH_KEY, String(inspectorWidth));
  }, [inspectorWidth]);

  useEffect(() => {
    const cleanup = window.electronAPI.onRenderProgress((progress) => {
      setExportProgress(progress);
      // 更新统一进度系统
      const tasks = useTaskProgressStore.getState().tasks;
      for (const [id, task] of tasks) {
        if (task.category === 'export' && task.status === 'active') {
          useTaskProgressStore.getState().updateTask(id, {
            progress: Math.round(progress * 100),
            phase: progress < 0.1 ? 'bundling' : 'rendering',
          });
          break;
        }
      }
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
      currentTimeRef.current = effectiveDurationMs;
      setCurrentTimeMs(effectiveDurationMs);
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
  }, [fps, effectiveDurationMs]);

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

      const motionCards = useAIStore.getState().motionCards;
      const storyboardPlan = useAIStore.getState().storyboardPlan;
      const persistedState = createPersistedAIState(result, [], motionCards, storyboardPlan);
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
          projectDir: projectDir || undefined,
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
      projectDir,
      setAIAnalysisError,
      setAIAnalysisResult,
      setCoverCandidates,
    ],
  );

  const handleOpenAICardInspector = useCallback((cardId: string) => {
    const hasMotionCard = motionCards.some((card) => card.id === cardId);
    setInspectorSelection({ type: hasMotionCard ? 'motion-card' : 'ai-card', cardId });
    setActivePanel('ai');
  }, [motionCards]);

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

    setPendingReanalyzeEntries(entries);
  }, [store]);

  const handleRegeneratePodcastFromScript = useCallback(async () => {
    if (!projectDir) {
      return;
    }
    if (workflow.step !== 'idle' && workflow.step !== 'error') {
      return;
    }

    const scriptContent = await window.electronAPI
      .loadScriptFile(projectDir, 'script.md')
      .catch(() => null);

    if (!scriptContent?.trim()) {
      setMissingScriptDialogOpen(true);
      return;
    }

    setPendingRegenerateScript(scriptContent);
    setRegeneratePodcastDialogOpen(true);
  }, [projectDir, workflow.step]);

  const handleConfirmRegeneratePodcast = useCallback(() => {
    const scriptContent = pendingRegenerateScript;
    setRegeneratePodcastDialogOpen(false);
    setPendingRegenerateScript(null);
    if (!scriptContent?.trim()) {
      return;
    }
    startWorkflow(scriptContent, {
      startFromStep: 'tts_generating',
      ttsOnly: true,
    });
  }, [pendingRegenerateScript, startWorkflow]);

  const handleStartAIClip = useCallback(async () => {
    if (!projectDir) {
      return;
    }

    const scriptContent = await window.electronAPI
      .loadScriptFile(projectDir, 'script.md')
      .catch(() => null);

    if (!scriptContent?.trim()) {
      setMissingScriptDialogOpen(true);
      return;
    }

    const hasReusableMedia = isReusablePodcastMedia(podcastAudioPath, podcastSrtPath);
    const rememberedDecision = hasReusableMedia
      ? readStoredExistingMediaDecision()
      : null;

    if (hasReusableMedia && rememberedDecision) {
      startWorkflow(scriptContent, {
        startFromStep: resolveWorkflowStartStep(rememberedDecision),
      });
      return;
    }

    if (hasReusableMedia) {
      setPendingWorkflowScript(scriptContent);
      setRememberExistingMediaDecision(false);
      setExistingMediaDialogOpen(true);
      return;
    }

    startWorkflow(scriptContent);
  }, [podcastAudioPath, podcastSrtPath, projectDir, startWorkflow]);

  const handleExistingMediaDecision = useCallback(
    (decision: ExistingMediaDecision) => {
      const scriptContent = pendingWorkflowScript;
      if (!scriptContent?.trim()) {
        setExistingMediaDialogOpen(false);
        setPendingWorkflowScript(null);
        setRememberExistingMediaDecision(false);
        return;
      }

      if (rememberExistingMediaDecision) {
        writeStoredExistingMediaDecision(decision);
      }

      setExistingMediaDialogOpen(false);
      setPendingWorkflowScript(null);
      setRememberExistingMediaDecision(false);
      startWorkflow(scriptContent, {
        startFromStep: resolveWorkflowStartStep(decision),
      });
    },
    [pendingWorkflowScript, rememberExistingMediaDecision, startWorkflow],
  );

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

  const handleConfirmExport = useCallback(async ({ outputPath: savePath, exportConfig }: {
    outputPath: string;
    exportConfig: ExportConfig;
  }) => {
    setIsExportSettingsOpen(false);
    setOutputPath(savePath);
    setIsExporting(true);
    setExportProgress(0);
    setExportError(null);

    const exportTaskId = `export-video-${Date.now()}`;
    useTaskProgressStore.getState().startTask({
      id: exportTaskId,
      category: 'export',
      label: '视频导出',
      mode: 'determinate',
      progress: 0,
      phase: 'bundling',
      level: 2,
      canCancel: false,
    });

    try {
      await window.electronAPI.renderVideo({
        timeline: JSON.stringify(timeline),
        outputPath: savePath,
        exportConfig,
      });
      setExportProgress(1);
      useTaskProgressStore.getState().completeTask(exportTaskId, {
        label: '在 Finder 中显示',
        handler: () => window.electronAPI.showItemInFolder(savePath),
      });
    } catch (error) {
      console.error('导出失败:', error);
      const errMsg = '导出失败，请查看控制台日志后重试。';
      setExportError(errMsg);
      useTaskProgressStore.getState().failTask(exportTaskId, errMsg);
    }
  }, [timeline]);

  return (
    <div
      className={styles.root}
      data-editor-region="root"
      style={{
        gridTemplateRows: `minmax(0, 1fr) ${RESIZE_HANDLE_THICKNESS}px ${timelinePanelHeight}px`,
      }}
    >
      <div
        className={styles.workspace}
        data-editor-region="workspace"
        style={{
          gridTemplateColumns: layout.stackSidebar
            ? 'minmax(0, 1fr)'
            : `${sidebarWidth}px ${RESIZE_HANDLE_THICKNESS}px minmax(0, 1fr) ${RESIZE_HANDLE_THICKNESS}px ${inspectorWidth}px`,
          gridTemplateRows: layout.stackSidebar
            ? `minmax(0, 1fr) ${layout.sidebarRailHeight}px`
            : 'minmax(0, 1fr)',
          gap: layout.stackSidebar ? '1px' : '0',
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
                durationMs={effectiveDurationMs}
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
              <Tabs
                value={activePanel}
                onValueChange={(next) => setActivePanel(next as 'assets' | 'ai')}
                className={styles.sidebarTabs}
              >
                <div className={styles.tabStrip}>
                  <TabsList className={styles.sidebarTabsList} aria-label="侧边栏面板切换">
                    <TabsTrigger
                      value="assets"
                      className={styles.sidebarTabsTrigger}
                      icon={<AppIcon name="folder-open" size={14} />}
                    >
                      素材
                    </TabsTrigger>
                    <TabsTrigger
                      value="ai"
                      className={styles.sidebarTabsTrigger}
                      icon={<AppIcon name="sparkles" size={14} />}
                    >
                      AI 助手
                    </TabsTrigger>
                  </TabsList>
                </div>
                <div className={styles.panelBody}>
                  <TabsContent value="assets" className={styles.sidebarTabsContent}>
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
                      onRegeneratePodcastFromScript={
                        projectDir
                          ? () => {
                              void handleRegeneratePodcastFromScript();
                            }
                          : undefined
                      }
                      regeneratePodcastFromScriptDisabled={
                        workflow.step !== 'idle' && workflow.step !== 'error'
                      }
                    />
                  </TabsContent>
                  <TabsContent value="ai" className={styles.sidebarTabsContent}>
                    <AIPanel
                      compact={layout.stackSidebar}
                      railHeight={layout.sidebarRailHeight}
                      inspectedCardId={inspectorSelection.type === 'ai-card' ? inspectorSelection.cardId : null}
                      onClearInspector={handleCloseInspector}
                      onOpenCardInspector={handleOpenAICardInspector}
                      onOpenSettings={onOpenSettings}
                    />
                  </TabsContent>
                </div>
              </Tabs>
            </div>
            {!layout.stackSidebar ? (
              <ResizeHandle
                axis="x"
                direction="grow"
                value={sidebarWidth}
                min={SIDEBAR_MIN_WIDTH}
                max={sidebarMaxWidth}
                onChange={setSidebarWidth}
                ariaLabel="调整侧边栏宽度"
                thickness={RESIZE_HANDLE_THICKNESS}
              />
            ) : null}
            <div className={styles.previewWrap}>
              <PreviewPanel
                playerRef={playerRef}
                isPlaying={isPlaying}
                onTogglePlay={handleTogglePlay}
                onExport={handleExport}
                currentTimeMs={currentTimeMs}
                durationMs={effectiveDurationMs}
                compact={layout.compactToolbar}
                selectedOverlayId={
                  inspectorSelection.type === 'overlay' ? inspectorSelection.overlayId : null
                }
                onSelectOverlay={handleSelectOverlayOnCanvas}
                onUpdateOverlayPosition={handleUpdateOverlayPosition}
              />
            </div>
            {!layout.stackSidebar ? (
              <>
                <ResizeHandle
                  axis="x"
                  direction="shrink"
                  value={inspectorWidth}
                  min={INSPECTOR_MIN_WIDTH}
                  max={inspectorMaxWidth}
                  onChange={setInspectorWidth}
                  ariaLabel="调整详情面板宽度"
                  thickness={RESIZE_HANDLE_THICKNESS}
                />
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
            ) : null}
          </>
        )}
      </div>

      <ResizeHandle
        axis="y"
        direction="shrink"
        value={timelinePanelHeight}
        min={panelBounds.minHeight}
        max={panelBounds.maxHeight}
        onChange={setTimelinePanelHeight}
        ariaLabel="调整时间线面板高度"
        thickness={RESIZE_HANDLE_THICKNESS}
      />

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
      </div>

      <TimelineAIOverlay
        workflow={workflow}
        timelineContainerRef={timelineWrapRef}
        compactTimeline={layout.compactTimeline}
        onCancel={cancelWorkflow}
        onRetry={retryWorkflow}
      />

      <ExportSettingsModal
        visible={isExportSettingsOpen}
        timelineWidth={timeline.width}
        timelineHeight={timeline.height}
        onClose={() => setIsExportSettingsOpen(false)}
        onConfirm={handleConfirmExport}
      />
      <Dialog
        open={existingMediaDialogOpen}
        onOpenChange={(open) => {
          setExistingMediaDialogOpen(open);
          if (!open) {
            setPendingWorkflowScript(null);
            setRememberExistingMediaDecision(false);
          }
        }}
      >
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>已检测到现有口播资源</DialogTitle>
            <DialogDescription>
              当前工程里已经有口播音频和字幕文件。默认建议直接跳过已有资源，
              继续生成内容卡片，避免重复等待。
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <Card>
              <CardContent className="grid gap-2.5">
                <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
                  音频：{getFileNameFromPath(podcastAudioPath) || '未识别'}
                </div>
                <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
                  字幕：{getFileNameFromPath(podcastSrtPath) || '未识别'}
                </div>
              </CardContent>
            </Card>
            <div style={{ marginTop: 16 }}>
              <Checkbox
                checked={rememberExistingMediaDecision}
                onChange={setRememberExistingMediaDecision}
                label="记住我的选择，后续默认这样处理"
              />
            </div>
          </DialogBody>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => {
                setExistingMediaDialogOpen(false);
                setPendingWorkflowScript(null);
                setRememberExistingMediaDecision(false);
              }}
            >
              取消
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                handleExistingMediaDecision('regenerate');
              }}
            >
              重新生成音频和字幕
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                handleExistingMediaDecision('skip-existing');
              }}
            >
              跳过已有并继续
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={regeneratePodcastDialogOpen}
        onOpenChange={(open) => {
          setRegeneratePodcastDialogOpen(open);
          if (!open) {
            setPendingRegenerateScript(null);
          }
        }}
      >
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>从文稿重新生成口播</DialogTitle>
            <DialogDescription>
              将读取当前工程的 script.md，使用 MiniMax TTS 重新合成口播音频与字幕，并覆盖现有的口播资源。
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <Card>
              <CardContent className="grid gap-2.5">
                <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
                  当前音频：{getFileNameFromPath(podcastAudioPath) || '未设置'}
                </div>
                <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
                  当前字幕：{getFileNameFromPath(podcastSrtPath) || '未设置'}
                </div>
              </CardContent>
            </Card>
            {hasAICardOverlays ? (
              <Alert
                variant="warning"
                className="mt-3"
                description={'注意：时间线上已有 AI 内容卡片。新字幕的时间点可能发生变化，卡片位置可能与音频不再对齐，建议随后在 AI 面板重新运行"内容分析"来刷新卡片。'}
              />
            ) : null}
            <div style={{ marginTop: 12, fontSize: 12, color: 'var(--color-text-secondary)', lineHeight: 1.6 }}>
              本次仅重跑 TTS，不会自动运行 AI 分析、封面与排版。
            </div>
          </DialogBody>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => {
                setRegeneratePodcastDialogOpen(false);
                setPendingRegenerateScript(null);
              }}
            >
              取消
            </Button>
            <Button variant="primary" onClick={handleConfirmRegeneratePodcast}>
              开始生成
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={Boolean(pendingReanalyzeEntries)}
        onOpenChange={(open) => {
          if (!open) {
            setPendingReanalyzeEntries(null);
          }
        }}
        title="替换字幕后重新分析？"
        description="替换字幕后，现有 AI 卡片分析会失效。建议立即重新分析以保持卡片内容准确。"
        confirmText="立即重新分析"
        cancelText="稍后再说"
        onConfirm={() => {
          if (!pendingReanalyzeEntries) {
            return;
          }
          void rerunAiAnalysisForCurrentSrt(pendingReanalyzeEntries);
          setPendingReanalyzeEntries(null);
        }}
      />
      <ConfirmDialog
        open={missingScriptDialogOpen}
        onOpenChange={setMissingScriptDialogOpen}
        title="未找到 script.md"
        description="请先在文稿工作台完成口播稿生成，再启动 AI 一键成片。"
        confirmText="我知道了"
        showCancel={false}
        onConfirm={() => setMissingScriptDialogOpen(false)}
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

