import { AlertTriangle, Sparkles, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { EditorView } from '@codemirror/view';
import { AppIcon } from '../components/AppIcon';
import { useAIVideoWorkflow } from '../hooks/useAIVideoWorkflow';
import type { FileEntry } from '../lib/electron-api';
import {
  createPersistedScriptState,
  isSavingFile,
  loadFullScriptState,
  loadPersistedScriptProjectDir,
  markFileSaving,
  saveAllDirtyFiles,
  saveScriptState,
} from '../lib/script-persistence';
import { LiveStreamingEditor } from '../lib/live-streaming-editor';
import { diffToFrames } from '../lib/diff-to-frames';
import {
  generateScriptDraft,
  generateScriptDraftStream,
  runScriptReview,
  runScriptReviewStream,
} from '../lib/script-utils';
import { ReviewCursorAnimator } from '../lib/review-cursor-animator';
import { useScriptStore } from '../store/script';
import { useTaskProgressStore } from '../store/task-progress';
import { loadAISettings } from '../store/ai';
import { useTimelineStore } from '../store/timeline';
import { resolveProvider } from '../lib/llm/provider-utils';
import { replaceEditorContent } from '../lib/editor-document';
import { clearVirtualCursor } from '../lib/virtual-cursor';
import { openSearchPanel } from '@codemirror/search';
import { setOpenWithReplace } from '../ui/components/script-editor-search';
import { waitForValue } from '../lib/wait-for-value';
import { AnnotationList } from '../components/script/AnnotationList';
import { ConflictDialog } from '../components/script/ConflictDialog';
import { DouyinImportDialog } from '../components/script/DouyinImportDialog';
import { EmptyGuide } from '../components/script/EmptyGuide';
import { FileTabs } from '../components/script/FileTabs';
import { FileTreePanel } from '../components/script/FileTreePanel';
import { QuickActionBar } from '../components/script/QuickActionBar';
import { VideoImportPreviewPane } from '../components/script/VideoImportPreviewPane';
import { VersionPreviewBar } from '../components/script/VersionPreviewBar';
import { ReviewStatusBar } from '../components/script/ReviewStatusBar';
import { SideDrawer } from '../components/script/SideDrawer';
import { TemplateDrawerContent } from '../components/script/TemplateDrawerContent';
import { ThinkingBlock } from '../components/agent/ThinkingBlock';
import {
  getProjectRelativePath,
  isVideoImportPreviewFile,
  parseVideoImportPreviewDocument,
} from '../lib/video-import-preview';
import { ScriptEditor } from '../ui/components/script-editor';
import { AlertProvider } from '../ui/components/alert';
import { Button } from '../ui';
import {
  getNextOpenedWorkbenchTab,
  getWorkbenchTabCloseTargets,
  type WorkbenchTabCloseAction,
} from '../lib/script-tab-actions';
import styles from './ScriptWorkbench.module.css';

interface ScriptWorkbenchProps {
  onBack: () => void;
  onNavigateToEditor?: () => void;
}

const SPECIAL_FILES = new Set(['original.md', 'script.md']);

export function ScriptWorkbench({ onBack, onNavigateToEditor }: ScriptWorkbenchProps) {
  const {
    start: startWorkflow,
    cancel: cancelWorkflow,
    retry: retryWorkflow,
    workflow,
  } = useAIVideoWorkflow();
  const {
    originalText,
    scriptText,
    selectedTemplate,
    projectDir,
    annotations,
    generating,
    reviewing,
    setProjectDir,
    setOriginalText,
    setScriptText,
    setSelectedTemplate,
    setAnnotations,
    setGenerating,
    setReviewing,
    setOpenedFile,
    setFileDirty,
    setFileConflict,
    stashExternalContent,
    clearAllDirty,
    clearConflict,
    openDrawer,
    closeDrawer,
    drawerVisible,
    drawerContent,
    fileDirtyMap,
    fileConflictMap,
    stashedContent,
    openedFile,
    fileEntries,
    setFileEntries,
    restoreState,
    acceptAnnotation,
    dismissAnnotation,
    acceptAllAnnotations,
    dismissAllAnnotations,
    setActiveStream,
    activeStream,
    setAgentOperation,
    agentOperation,
    backgroundAgentOperation,
    bumpScriptDocVersion,
    setWorkspaceFiles,
    editorAgent,
    extraFileContents,
    setExtraFileContent,
    removeExtraFile,
    setMcpChangeHighlightLines,
    clearMcpChangeHighlight,
    setReviewState,
    reviewState,
    scriptDocVersion,
    mcpChangeHighlightLines,
    showReviewBanner,
    setShowReviewBanner,
    reviewCursorPos,
    reviewBreathing,
    videoImportProgress,
    lastVideoImport,
    setVideoImportProgress,
    setLastVideoImport,
    clearVideoImportState,
    historyPreview,
    selectedProviderId,
    selectedModel,
    pendingDouyinUrl,
    setPendingDouyinUrl,
  } = useScriptStore();

  const hasAICardOverlays = useTimelineStore(
    (state) => state.timeline.overlays?.some((o) => o.overlayType === 'ai-card') ?? false,
  );

  const [restoring, setRestoring] = useState(false);
  const [conflictDialogOpen, setConflictDialogOpen] = useState(false);
  const [conflictChoices, setConflictChoices] = useState<Record<string, 'mine' | 'external'>>({});
  /** 用户显式关闭的标签页（包括 special 文件），阻止 tabs 自动重现 */
  const [closedTabs, setClosedTabs] = useState<Set<string>>(new Set());
  const [thinkingText, setThinkingText] = useState('');
  const [douyinImportOpen, setDouyinImportOpen] = useState(false);
  const [douyinImportBusy, setDouyinImportBusy] = useState(false);
  const [douyinImportError, setDouyinImportError] = useState<string | null>(null);

  const editorViewRef = useRef<EditorView | null>(null);
  const liveStreamingRef = useRef<LiveStreamingEditor | null>(null);
  const reviewAnimatorRef = useRef<ReviewCursorAnimator | null>(null);
  /** 正在从磁盘加载文件时为 true，抑制 onChange 的 dirty 标记 */
  const loadingFileRef = useRef(false);

  const stopActivePlayback = useCallback(() => {
    if (liveStreamingRef.current?.isPlaying) {
      liveStreamingRef.current.stop();
    }
  }, []);

  const waitForEditorViewReady = useCallback(
    () => waitForValue(() => editorViewRef.current, { maxAttempts: 12 }),
    [],
  );

  useEffect(() => {
    if (workflow.step === 'tts_done' && onNavigateToEditor) {
      onNavigateToEditor();
    }
  }, [onNavigateToEditor, workflow.step]);

  const syncContentToStore = useCallback(
    (filePath: string, content: string) => {
      if (filePath === 'script.md') {
        setScriptText(content);
      } else if (filePath === 'original.md') {
        setOriginalText(content);
      } else {
        setExtraFileContent(filePath, content);
      }
    },
    [setExtraFileContent, setOriginalText, setScriptText],
  );

  /** 打开文件并清除关闭标记 */
  const openFileTab = useCallback(
    (file: string) => {
      setOpenedFile(file);
      setClosedTabs((prev) => {
        if (!prev.has(file)) return prev;
        const next = new Set(prev);
        next.delete(file);
        return next;
      });
    },
    [setOpenedFile],
  );

  const activeFile = useMemo(() => {
    if (openedFile && !closedTabs.has(openedFile)) return openedFile;
    return null;
  }, [openedFile, closedTabs]);

  const activePreviewDocument = useMemo(() => {
    if (!activeFile || !isVideoImportPreviewFile(activeFile)) {
      return null;
    }

    return parseVideoImportPreviewDocument(extraFileContents[activeFile] ?? '');
  }, [activeFile, extraFileContents]);

  const activeFileIsVideoPreview = Boolean(
    activeFile && isVideoImportPreviewFile(activeFile),
  );

  const activePreviewPending = Boolean(
    activeFileIsVideoPreview && !(activeFile! in extraFileContents),
  );

  const hasDouyinDetailAction = Boolean(
    lastVideoImport && lastVideoImport.sourceType === 'douyin',
  );

  // 正在/已经完成 hydrate 的目录，避免挂载恢复与 projectDir 监听重复执行
  const hydratedDirRef = useRef<string | null>(null);

  const tabs = useMemo(() => {
    const collected = new Set<string>();

    // 有内容的 special 文件（排除用户显式关闭的）
    if ((originalText.length > 0 || activeFile === 'original.md') && !closedTabs.has('original.md')) {
      collected.add('original.md');
    }
    if ((scriptText.length > 0 || activeFile === 'script.md') && !closedTabs.has('script.md')) {
      collected.add('script.md');
    }

    // 已加载的额外文件（排除已关闭的）
    for (const file of Object.keys(extraFileContents)) {
      if (!closedTabs.has(file)) {
        collected.add(file);
      }
    }

    // 当前打开的文件
    if (activeFile) collected.add(activeFile);

    return Array.from(collected);
  }, [activeFile, originalText.length, scriptText.length, extraFileContents, closedTabs]);

  const refreshFileTree = useCallback(
    async (dir: string) => {
      const entries = await window.electronAPI.readDirectory(dir);
      setFileEntries(entries);
      return entries;
    },
    [setFileEntries],
  );

  const hydrateProjectDirectory = useCallback(
    async (dir: string) => {
      hydratedDirRef.current = dir;

      try {
        setProjectDir(dir);
        await window.electronAPI.startWatching(dir);

        const entries = await refreshFileTree(dir);
        const fullState = await loadFullScriptState(dir);

        const hasOriginal = entries.some((e) => e.name === 'original.md');
        const hasScript = entries.some((e) => e.name === 'script.md');
        setWorkspaceFiles({ hasOriginalFile: hasOriginal, hasScriptFile: hasScript });

        if (fullState) {
          const { persisted } = fullState;
          restoreState({
            projectDir: dir,
            originalText: fullState.originalText,
            scriptText: fullState.scriptText,
            selectedTemplate: persisted.templateId,
            annotations: persisted.annotations,
            reviewState: persisted.reviewState,
            scriptDocVersion: persisted.lastReviewedDocVersion,
            manualStageOverride: persisted.manualStageOverride ?? null,
            workspaceFiles: { hasOriginalFile: hasOriginal, hasScriptFile: hasScript },
          });
          setFileEntries(entries);
          if (!openedFile) {
            const fileToOpen = hasScript ? 'script.md' : hasOriginal ? 'original.md' : null;
            if (fileToOpen) openFileTab(fileToOpen);
          }
          return dir;
        }

        const [originalFromDisk, scriptFromDisk] = await Promise.all([
          window.electronAPI.loadScriptFile(dir, 'original.md'),
          window.electronAPI.loadScriptFile(dir, 'script.md'),
        ]);

        restoreState({
          projectDir: dir,
          originalText: originalFromDisk ?? '',
          scriptText: scriptFromDisk ?? '',
          selectedTemplate: 'news-broadcast',
          annotations: [],
          manualStageOverride: null,
          workspaceFiles: { hasOriginalFile: hasOriginal, hasScriptFile: hasScript },
        });
        setFileEntries(entries);
        if (!openedFile) {
          const fileToOpen = originalFromDisk !== null ? 'original.md' : scriptFromDisk !== null ? 'script.md' : null;
          if (fileToOpen) openFileTab(fileToOpen);
        }
        return dir;
      } catch (error) {
        if (hydratedDirRef.current === dir) {
          hydratedDirRef.current = null;
        }
        throw error;
      }
    },
    [openedFile, refreshFileTree, restoreState, setFileEntries, openFileTab, setProjectDir, setWorkspaceFiles],
  );

  const ensureProjectDirectory = useCallback(async () => {
    if (useScriptStore.getState().projectDir) {
      return useScriptStore.getState().projectDir;
    }

    const dir = await window.electronAPI.selectProjectDirectory();
    if (!dir) return null;
    return hydrateProjectDirectory(dir);
  }, [hydrateProjectDirectory]);

  // hydrateProjectDirectory 引用不稳定（依赖 openedFile 等），用 ref 打断 effect 循环
  const hydrateRef = useRef(hydrateProjectDirectory);
  hydrateRef.current = hydrateProjectDirectory;

  // 1. 挂载初始化：从 store / localStorage 恢复工作目录
  useEffect(() => {
    const restore = async () => {
      const dir =
        useScriptStore.getState().projectDir ?? loadPersistedScriptProjectDir();
      if (!dir) return;

      setRestoring(true);
      try {
        await hydrateRef.current(dir);
      } catch (error) {
        hydratedDirRef.current = null;
        console.error('恢复口播稿状态失败:', error);
      } finally {
        setRestoring(false);
      }
    };

    void restore();

    return () => {
      void window.electronAPI.stopWatching();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- hydrateRef 是稳定 ref
  }, []);

  // 2. 外部目录变更：App.tsx 同步了新的 projectDir 时重新加载
  useEffect(() => {
    if (!projectDir || projectDir === hydratedDirRef.current) return;

    void (async () => {
      setRestoring(true);
      try {
        await hydrateRef.current(projectDir);
      } catch (error) {
        hydratedDirRef.current = null;
        console.error('切换工作目录失败:', error);
      } finally {
        setRestoring(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- hydrateRef 是稳定 ref，仅响应 projectDir 变化
  }, [projectDir]);

  useEffect(() => {
    if (!projectDir) return;

    const unsubscribeChanged = window.electronAPI.onFileChanged(({ file, content }) => {
      // MCP 或内部操作正在保存的文件，跳过冲突检测
      if (isSavingFile(file)) return;

      const state = useScriptStore.getState();

      // Agent 正在操作中（MCP 写入），自动同步而不触发冲突
      if (state.agentOperation.isOperating) {
        if (file === 'original.md') {
          state.setOriginalText(content);
        } else if (file === 'script.md') {
          state.setScriptText(content);
        } else if (file in state.extraFileContents) {
          state.setExtraFileContent(file, content);
        }
        // 清除该文件的 dirty 标记（MCP 写入是权威来源）
        state.setFileDirty(file, false);
        return;
      }

      if (state.fileDirtyMap[file]) {
        state.setFileConflict(file, true);
        state.stashExternalContent(file, content);
        return;
      }

      if (file === 'original.md') {
        state.setOriginalText(content);
      } else if (file === 'script.md') {
        state.setScriptText(content);
      } else if (file in state.extraFileContents) {
        state.setExtraFileContent(file, content);
      }
    });

    const unsubscribeTree = window.electronAPI.onFileTreeChanged(async () => {
      const entries = await refreshFileTree(projectDir);
      // 刷新 workspace 文件存在状态
      const hasOriginal = entries.some((e: { name: string }) => e.name === 'original.md');
      const hasScript = entries.some((e: { name: string }) => e.name === 'script.md');
      useScriptStore.getState().setWorkspaceFiles({ hasOriginalFile: hasOriginal, hasScriptFile: hasScript });
    });

    return () => {
      unsubscribeChanged();
      unsubscribeTree();
    };
  }, [projectDir, refreshFileTree]);

  const handleEditorChange = useCallback(
    (value: string) => {
      if (!activeFile) return;
      if (loadingFileRef.current) return; // 加载文件触发的 onChange，忽略
      if (activeFile === 'script.md') {
        setScriptText(value);
      } else if (activeFile === 'original.md') {
        setOriginalText(value);
      } else {
        setExtraFileContent(activeFile, value);
      }
      setFileDirty(activeFile, true);
    },
    [activeFile, setFileDirty, setOriginalText, setScriptText, setExtraFileContent],
  );

  const handleSelectDirectory = useCallback(async () => {
    const dir = await window.electronAPI.selectProjectDirectory();
    if (!dir) return;
    await hydrateProjectDirectory(dir);
  }, [hydrateProjectDirectory]);

  // 打开文件树中的任意文件
  const handleOpenFile = useCallback(
    async (file: string) => {
      loadingFileRef.current = true;
      openFileTab(file);
      if (!projectDir) {
        // 延迟一帧后解除，确保编辑器 onChange 已跳过
        requestAnimationFrame(() => { loadingFileRef.current = false; });
        return;
      }

      if (file === 'original.md') {
        const content = await window.electronAPI.loadScriptFile(projectDir, file);
        if (content !== null) setOriginalText(content);
      } else if (file === 'script.md') {
        const content = await window.electronAPI.loadScriptFile(projectDir, file);
        if (content !== null) setScriptText(content);
      } else if (
        isVideoImportPreviewFile(file) ||
        !(file in useScriptStore.getState().extraFileContents)
      ) {
        const content = await window.electronAPI.loadScriptFile(projectDir, file);
        if (content !== null) setExtraFileContent(file, content);
      }

      // 延迟一帧后解除 loading 标记，确保本轮编辑器 onChange 已被跳过
      requestAnimationFrame(() => { loadingFileRef.current = false; });
    },
    [projectDir, openFileTab, setOriginalText, setScriptText, setExtraFileContent],
  );

  const closeTabs = useCallback(
    (files: string[]) => {
      const closingFiles = tabs.filter((tab) => files.includes(tab));
      if (!closingFiles.length) return;

      for (const file of closingFiles) {
        if (!SPECIAL_FILES.has(file)) {
          removeExtraFile(file);
        }
        setFileDirty(file, false);
      }

      setClosedTabs((prev) => {
        const next = new Set(prev);
        closingFiles.forEach((file) => next.add(file));
        return next;
      });

      const nextOpenedFile = getNextOpenedWorkbenchTab(tabs, activeFile, closingFiles);
      if (nextOpenedFile !== activeFile) {
        setOpenedFile(nextOpenedFile);
      }
    },
    [activeFile, removeExtraFile, setFileDirty, setOpenedFile, tabs],
  );

  // 关闭标签页
  const handleCloseTab = useCallback(
    (file: string) => {
      closeTabs([file]);
    },
    [closeTabs],
  );

  const handleTabMenuAction = useCallback(
    (action: WorkbenchTabCloseAction, file: string) => {
      closeTabs(getWorkbenchTabCloseTargets(tabs, file, action));
    },
    [closeTabs, tabs],
  );

  const handleShowTabContextMenu = useCallback(
    async (file: string) => {
      await window.electronAPI.showWorkbenchTabContextMenu({
        file,
        projectDir,
        tabIndex: tabs.indexOf(file),
        tabCount: tabs.length,
      });
    },
    [projectDir, tabs],
  );

  useEffect(() => {
    return window.electronAPI.onWorkbenchTabMenuAction(({ action, file }) => {
      handleTabMenuAction(action, file);
    });
  }, [handleTabMenuAction]);

  const handleImportText = useCallback(async () => {
    const dir = await ensureProjectDirectory();
    if (!dir) return;

    const result = await window.electronAPI.selectTextFile();
    if (!result) return;

    setOriginalText(result.content);
    setScriptText('');
    setAnnotations([]);
    setWorkspaceFiles({ hasOriginalFile: true, hasScriptFile: false });
    openFileTab('original.md');
    setFileDirty('original.md', false);
    await window.electronAPI.saveScriptFile(dir, 'original.md', result.content);
    await refreshFileTree(dir);
  }, [
    ensureProjectDirectory,
    refreshFileTree,
    setAnnotations,
    setFileDirty,
    openFileTab,
    setOriginalText,
    setScriptText,
    setWorkspaceFiles,
  ]);

  const handleCreateBlank = useCallback(async () => {
    const dir = await ensureProjectDirectory();
    if (!dir) return;

    await window.electronAPI.saveScriptFile(dir, 'original.md', '');
    setOriginalText('');
    setScriptText('');
    setAnnotations([]);
    setWorkspaceFiles({ hasOriginalFile: true, hasScriptFile: false });
    openFileTab('original.md');
    setFileDirty('original.md', false);
    await refreshFileTree(dir);
  }, [
    ensureProjectDirectory,
    refreshFileTree,
    setAnnotations,
    setFileDirty,
    openFileTab,
    setOriginalText,
    setScriptText,
    setWorkspaceFiles,
  ]);

  const finalizeVideoImport = useCallback(
    async (dir: string) => {
      const [originalFromDisk, entries] = await Promise.all([
        window.electronAPI.loadScriptFile(dir, 'original.md'),
        refreshFileTree(dir),
      ]);

      const hasOriginal = entries.some((entry) => entry.name === 'original.md');
      const hasScript = entries.some((entry) => entry.name === 'script.md');

      setWorkspaceFiles({ hasOriginalFile: hasOriginal, hasScriptFile: hasScript });
      setOriginalText(originalFromDisk ?? '');
      setAnnotations([]);
      openFileTab('original.md');
      setFileDirty('original.md', false);
    },
    [
      openFileTab,
      refreshFileTree,
      setAnnotations,
      setFileDirty,
      setOriginalText,
      setWorkspaceFiles,
    ],
  );

  const waitForVideoImport = useCallback(
    async (importId: string, dir: string) => {
      const importTaskId = `import-douyin-${Date.now()}`;
      useTaskProgressStore.getState().startTask({
        id: importTaskId,
        category: 'import',
        label: '抖音视频导入',
        mode: 'determinate',
        progress: 0,
        phase: '下载中',
        level: 2,
        canCancel: false,
      });

      for (let attempt = 0; attempt < 240; attempt += 1) {
        const status = await window.electronAPI.getVideoImportStatus(importId);
        if (status) {
          setVideoImportProgress(status);

          const phaseLabels: Record<string, string> = {
            downloading: '下载中',
            extracting_audio: '提取音频',
            transcribing: '转录字幕',
            syncing: '同步到项目',
          };
          useTaskProgressStore.getState().updateTask(importTaskId, {
            progress: status.progress ?? 0,
            phase: phaseLabels[status.status] ?? status.status,
          });

          if (status.status === 'done' && status.result) {
            setLastVideoImport(status.result);
            await finalizeVideoImport(dir);
            useTaskProgressStore.getState().completeTask(importTaskId);
            setDouyinImportBusy(false);
            return;
          }
          if (status.status === 'error') {
            setDouyinImportError(status.error ?? '抖音导入失败');
            useTaskProgressStore.getState().failTask(importTaskId, status.error ?? '导入失败');
            setDouyinImportBusy(false);
            return;
          }
        }

        await new Promise((resolve) => setTimeout(resolve, 500));
      }

      useTaskProgressStore.getState().failTask(importTaskId, '导入状态查询超时');
      setDouyinImportError('导入状态查询超时，请稍后重试');
      setDouyinImportBusy(false);
    },
    [
      finalizeVideoImport,
      setLastVideoImport,
      setVideoImportProgress,
    ],
  );

  const handleImportDouyin = useCallback(
    async (url?: string) => {
      const link = url?.trim();
      if (!link) {
        setDouyinImportError('请先粘贴抖音分享链接');
        return;
      }

      const dir = await ensureProjectDirectory();
      if (!dir) return;

      clearVideoImportState();
      setDouyinImportBusy(true);
      setDouyinImportError(null);

      try {
        const initialProgress = await window.electronAPI.importVideoSource({
          sourceType: 'douyin',
          url: link,
          projectDir: dir,
          syncToOriginal: true,
        });
        setVideoImportProgress(initialProgress);
        await waitForVideoImport(initialProgress.importId, dir);
      } catch (error) {
        setDouyinImportError(
          error instanceof Error ? error.message : '抖音导入失败',
        );
        setDouyinImportBusy(false);
      }
    },
    [
      clearVideoImportState,
      ensureProjectDirectory,
      setVideoImportProgress,
      waitForVideoImport,
    ],
  );

  const handleOpenImportPreview = useCallback(() => {
    const state = useScriptStore.getState();
    const result = state.lastVideoImport;
    const dir = state.projectDir;
    if (!result || !dir) return;

    const relativePath = getProjectRelativePath(dir, result.previewMetadataPath);
    setDouyinImportOpen(false);
    void handleOpenFile(relativePath);
  }, [handleOpenFile]);

  const runInternalGenerateScript = useCallback(
    async ({
      templateCode,
      rawText,
      operationType = 'generate',
      canInterrupt = true,
      replyChannel,
    }: {
      templateCode: string;
      rawText: string;
      operationType?: 'generate' | 'rewrite';
      canInterrupt?: boolean;
      replyChannel?: string;
    }) => {
      const streamId = `mcp-generate-${Date.now()}`;
      try {
        const state = useScriptStore.getState();
        const streamKind = operationType === 'rewrite' ? 'rewrite' : 'generate';

        // 抑制编辑器 onChange 触发的 dirty 标记
        loadingFileRef.current = true;
        state.setOriginalText(rawText);
        state.setSelectedTemplate(templateCode);

        // 清除旧审稿数据，避免历史批注影响新文稿
        state.setAnnotations([]);
        state.setReviewState('idle');
        state.setShowReviewBanner(false);
        state.bumpScriptDocVersion();
        setThinkingText('');

        // 切换到 script.md 标签页并清空编辑器
        state.setScriptText('');
        openFileTab('script.md');
        const initialView = await waitForEditorViewReady();
        if (initialView) {
          // 真实清空编辑器内容，避免旧 script/original 文稿残留导致打字机动画不可见。
          replaceEditorContent(initialView, '', { cursorPos: 0 });
        }

        // 进入生成状态：readOnly + streamingActive 阻止 React→CM6 同步
        state.setAgentOperation({
          isOperating: true,
          operationType,
          progress: 0,
          canInterrupt,
          backgrounded: false,
        });
        state.setEditorAgent({ readOnly: true, virtualCursorPos: 0, streamingActive: true });
        state.setActiveStream({ streamId, filePath: 'script.md', kind: streamKind, phase: 'preparing' });
        useTaskProgressStore.getState().startTask({
          id: streamId,
          category: 'ai-write',
          label: operationType === 'rewrite' ? 'AI 重写稿件' : 'AI 生成稿件',
          mode: 'streaming',
          progress: 0,
          phase: '准备中',
          level: 2,
          canCancel: canInterrupt,
          // 工作台的生成流不是 ACP 会话，而是内部 LLM 流。取消时只能停止本地
          // 的打字机播放器；底层网络请求没有 AbortController，会继续跑到结束。
          onCancel: canInterrupt ? () => stopActivePlayback() : undefined,
        });

        stopActivePlayback();
        liveStreamingRef.current = null;

        const ensureGeneratePlayer = (viewOverride?: EditorView | null) => {
          const view = viewOverride ?? editorViewRef.current;
          if (!view) return null;
          if (!liveStreamingRef.current) {
            liveStreamingRef.current = new LiveStreamingEditor(view, {
              chunkSize: 2,
              frameDelayMs: 20,
              minFrameDelayMs: 6,
              maxChunkSize: 18,
              catchUpThreshold: 48,
              onProgress: ({ committedChars }) => {
                const latestState = useScriptStore.getState();
                latestState.setEditorAgent({ virtualCursorPos: committedChars });
                if (latestState.activeStream.phase !== 'streaming') {
                  latestState.setActiveStream({ phase: 'streaming' });
                }
              },
              onComplete: (committedContent) => {
                useScriptStore.getState().setScriptText(committedContent);
              },
              onStopped: (committedContent) => {
                const latestState = useScriptStore.getState();
                latestState.setScriptText(committedContent);
                latestState.setActiveStream({ phase: 'stopped' });
              },
            });
          }
          return liveStreamingRef.current;
        };

        ensureGeneratePlayer(initialView);
        // 某些模型首包返回较慢，先切到 streaming，避免界面长时间停在 preparing。
        state.setActiveStream({ phase: 'streaming' });
        useTaskProgressStore.getState().updateTask(streamId, { phase: '写入中' });
        let didEnqueueStreamText = false;

        // 解析当前选择的 Provider / Model
        const aiSettings = await loadAISettings();
        const currentProvider = aiSettings
          ? resolveProvider(aiSettings.llmProviders, state.selectedProviderId, aiSettings.defaultProviderId)
          : null;
        const currentModel = state.selectedModel ?? undefined;

        // 流式调用 LLM：chunk 先进入实时播放器，再逐段写入编辑器
        const result = await generateScriptDraftStream(
          rawText,
          templateCode,
          state.selectedRole,
          (chunk) => {
            const latestState = useScriptStore.getState();

            // 后台模式下跳过编辑器写入，最终一次性同步
            if (latestState.agentOperation.backgrounded) return;
            if (latestState.activeStream.phase !== 'streaming') {
              latestState.setActiveStream({ phase: 'streaming' });
            }
            const player = ensureGeneratePlayer(editorViewRef.current);
            if (player && chunk) {
              player.pushText(chunk);
              didEnqueueStreamText = true;
            }
          },
          {
            onReasoningChunk: (chunk) => {
              if (!chunk) return;
              setThinkingText((prev) => prev + chunk);
            },
            provider: currentProvider ?? undefined,
            model: currentModel,
          },
        );

        if (!useScriptStore.getState().agentOperation.backgrounded) {
          const player = ensureGeneratePlayer(editorViewRef.current);
          // 兜底：如果底层把全文缓冲到结束才返回，仍然回放最终文本，确保有打字机效果。
          if (!didEnqueueStreamText && result) {
            useScriptStore.getState().setActiveStream({ phase: 'streaming' });
            player?.pushText(result);
          }
          useScriptStore.getState().setActiveStream({ phase: 'finalizing' });
          await player?.finish();
        }

        // 生成完成：同步 store 并退出操作状态
        const finalState = useScriptStore.getState();
        finalState.setScriptText(result);
        finalState.setWorkspaceFiles({ hasOriginalFile: true, hasScriptFile: true });
        finalState.stopAgentOperation();
        useTaskProgressStore.getState().completeTask(streamId);
        finalState.setShowReviewBanner(true);
        liveStreamingRef.current = null;
        loadingFileRef.current = false;

        // 防御性清除 CM6 虚拟光标，确保任何路径下光标都不残留
        if (editorViewRef.current) {
          editorViewRef.current.dispatch({ effects: clearVirtualCursor.of(null) });
        }

        // 保存到磁盘
        const dir = finalState.projectDir;
        if (dir) {
          markFileSaving('original.md');
          markFileSaving('script.md');
          finalState.setFileDirty('original.md', false);
          finalState.setFileDirty('script.md', false);
          await window.electronAPI.saveScriptFile(dir, 'original.md', rawText);
          await window.electronAPI.saveScriptFile(dir, 'script.md', result);
          await refreshFileTree(dir);

          // 创建版本历史记录
          if (result && window.scriptHistoryAPI) {
            void window.scriptHistoryAPI.create({
              projectId: dir,
              fileName: 'script.md',
              content: result,
              source: 'ai_generate',
              providerId: currentProvider?.id ?? null,
              providerName: currentProvider?.name ?? null,
              modelName: currentModel ?? aiSettings?.defaultModel ?? null,
            });
          }
        }

        if (replyChannel) {
          const linesGenerated = result.split('\n').length;
          window.mcpAPI!.reply(replyChannel, {
            success: true,
            filePath: 'script.md',
            summary: `已生成 ${linesGenerated} 行脚本`,
            linesGenerated,
          });
        }
      } catch (err: any) {
        if (liveStreamingRef.current?.isPlaying) {
          liveStreamingRef.current.stop();
        }
        liveStreamingRef.current = null;
        loadingFileRef.current = false;
        const currentState = useScriptStore.getState();
        currentState.stopAgentOperation({
          resetStream: currentState.activeStream.phase === 'stopped' ? false : true,
        });
        useTaskProgressStore.getState().failTask(streamId, String(err));
        // 防御性清除光标
        if (editorViewRef.current) {
          editorViewRef.current.dispatch({ effects: clearVirtualCursor.of(null) });
        }
        const errorMsg = err?.message ?? String(err);
        const isAIConfigError = errorMsg.includes('LLM API Key') || errorMsg.includes('未找到');
        console.error('生成口播稿失败:', err);

        if (replyChannel) {
          window.mcpAPI!.reply(replyChannel, {
            success: false,
            error: errorMsg,
            hint: isAIConfigError
              ? '内置 AI 未配置。请改用以下流程：1) lingji_get_project_context 获取模板写作指令；2) lingji_read_script 读取 original.md；3) 你自己按模板风格撰写口播稿；4) lingji_update_script 写入 script.md。'
              : undefined,
          });
          return;
        }

        alert(`生成失败: ${errorMsg}`);
      }
    },
    [openFileTab, refreshFileTree, stopActivePlayback, waitForEditorViewReady],
  );

  /** 首次生成口播稿：直接走内部 LLM 流式生成 */
  const handleFirstGenerate = useCallback(async () => {
    const state = useScriptStore.getState();
    if (!state.originalText.trim()) return;

    await runInternalGenerateScript({
      templateCode: state.selectedTemplate,
      rawText: state.originalText,
      operationType: 'generate',
      canInterrupt: true,
    });
  }, [runInternalGenerateScript]);

  const handleDirectRegenerate = useCallback(async () => {
    const state = useScriptStore.getState();
    if (!state.originalText.trim()) return;

    await runInternalGenerateScript({
      templateCode: state.selectedTemplate,
      rawText: state.originalText,
      operationType: 'rewrite',
      canInterrupt: false,
    });
  }, [runInternalGenerateScript]);

  // ── 内置 LLM 审稿流程（带扫描动画）──────────────────
  const runInternalReviewScript = useCallback(async () => {
    const state = useScriptStore.getState();
    if (!state.scriptText.trim()) return;

    const reviewTaskId = `ai-review-${Date.now()}`;
    try {
      // 1. 准备状态
      state.setAnnotations([]);
      state.setReviewState('pending');
      state.setShowReviewBanner(false);
      setThinkingText('');

      openFileTab('script.md');

      state.setAgentOperation({
        isOperating: true,
        operationType: 'review',
        progress: 0,
        canInterrupt: true,
        backgrounded: false,
      });
      useTaskProgressStore.getState().startTask({
        id: reviewTaskId,
        category: 'ai-review',
        label: 'AI 审稿',
        mode: 'determinate',
        progress: 0,
        phase: '等待响应',
        level: 2,
        canCancel: true,
        // AI 审稿同样走内部 LLM 流，取消只做本地光标 / 扫描动画停止。
        onCancel: () => reviewAnimatorRef.current?.stop(),
      });
      state.setEditorAgent({ readOnly: true, virtualCursorPos: 0, streamingActive: false });
      state.setActiveStream({
        streamId: `internal-review-${Date.now()}`,
        filePath: 'script.md',
        kind: 'generate', // 复用已有 phase 逻辑
        phase: 'preparing',
      });

      // 2. 启动呼吸光效（等待 LLM 响应期间的视觉反馈）
      const view = await waitForEditorViewReady();
      if (!view) throw new Error('编辑器未就绪');

      reviewAnimatorRef.current?.stop();
      state.setReviewBreathing(true);
      state.setActiveStream({ phase: 'streaming' });

      const revealedAnnotations: typeof state.annotations = [];
      let parsedAnnotations: typeof state.annotations = [];

      const animator = new ReviewCursorAnimator(view, {
        annotationPauseMs: 500,
        annotationPostPauseMs: 350,
        onCursorMove: (pos) => {
          useScriptStore.getState().setReviewCursorPos(pos);
        },
        onPhaseChange: (phase) => {
          const s = useScriptStore.getState();
          if (phase === 'annotating') {
            s.setReviewBreathing(false);
            s.setActiveStream({ phase: 'finalizing' });
            useTaskProgressStore.getState().updateTask(reviewTaskId, { phase: '标注中', progress: 70 });
          } else if (phase === 'complete') {
            s.setReviewBreathing(false);
          }
        },
        onAnnotationReveal: (index) => {
          revealedAnnotations.push(parsedAnnotations[index]);
          useScriptStore.getState().setAnnotations([...revealedAnnotations]);
        },
      });
      reviewAnimatorRef.current = animator;
      animator.startBreathing();

      // 3. 等待 LLM 响应（呼吸光效持续中）
      const annotations = await runScriptReviewStream(
        state.scriptText,
        () => {},
        {
          onReasoningChunk: (chunk) => {
            if (!chunk) return;
            setThinkingText((prev) => prev + chunk);
          },
        },
      );
      parsedAnnotations = annotations;

      // 4. LLM 完成 → 关闭呼吸 → 播放指针批注动画
      useScriptStore.getState().setReviewBreathing(false);

      if (annotations.length > 0) {
        await animator.animateAnnotations(annotations.map((a) => a.startOffset));
      }

      // 5. 完成
      const finalState = useScriptStore.getState();
      finalState.setAnnotations(annotations);
      finalState.setReviewState(annotations.length > 0 ? 'issues' : 'clean');
      finalState.stopAgentOperation();
      useTaskProgressStore.getState().completeTask(reviewTaskId);
      finalState.setReviewCursorPos(null);
      finalState.setReviewBreathing(false);
      reviewAnimatorRef.current = null;

      if (editorViewRef.current) {
        editorViewRef.current.dispatch({ effects: clearVirtualCursor.of(null) });
      }
    } catch (err: any) {
      reviewAnimatorRef.current?.stop();
      reviewAnimatorRef.current = null;

      const currentState = useScriptStore.getState();
      currentState.stopAgentOperation();
      useTaskProgressStore.getState().failTask(reviewTaskId, String(err));
      currentState.setReviewState('idle');
      currentState.setReviewCursorPos(null);
      currentState.setReviewBreathing(false);

      if (editorViewRef.current) {
        editorViewRef.current.dispatch({ effects: clearVirtualCursor.of(null) });
      }

      const errorMsg = err?.message ?? String(err);
      console.error('内置审稿失败:', err);
      alert(`审稿失败: ${errorMsg}`);
    }
  }, [openFileTab, waitForEditorViewReady]);

  const handleGenerate = useCallback(async () => {
    if (!originalText.trim()) return;

    // 清除旧审稿数据，避免历史批注影响新生成的文稿
    setAnnotations([]);
    setReviewState('idle');
    bumpScriptDocVersion();

    setGenerating(true);
    try {
      const result = await generateScriptDraft(originalText, selectedTemplate);
      setScriptText(result);
      setWorkspaceFiles({ hasOriginalFile: true, hasScriptFile: true });
      openFileTab('script.md');
      setFileDirty('script.md', true);
    } catch (error) {
      console.error('生成口播稿失败:', error);
      alert(`生成失败: ${error instanceof Error ? error.message : '未知错误'}`);
    } finally {
      setGenerating(false);
    }
  }, [originalText, selectedTemplate, bumpScriptDocVersion, setAnnotations, setFileDirty, setGenerating, openFileTab, setReviewState, setScriptText, setWorkspaceFiles]);

  const handleReview = useCallback(async () => {
    if (!scriptText.trim()) return;

    setReviewing(true);
    try {
      const result = await runScriptReview(scriptText);
      setAnnotations(result);
      openDrawer('annotations');
    } catch (error) {
      console.error('AI 审查失败:', error);
      alert(`审查失败: ${error instanceof Error ? error.message : '未知错误'}`);
    } finally {
      setReviewing(false);
    }
  }, [openDrawer, scriptText, setAnnotations, setReviewing]);

  const handleGenerateVideo = useCallback(() => {
    if (!scriptText.trim()) {
      return;
    }

    startWorkflow(scriptText, { pauseAfterTts: true });
  }, [scriptText, startWorkflow]);

  const handleUseExternalVersion = useCallback(
    (file: string) => {
      const externalContent = stashedContent[file];
      if (externalContent === undefined) return;

      if (file === 'original.md') {
        setOriginalText(externalContent);
      } else if (file === 'script.md') {
        setScriptText(externalContent);
      }

      setFileDirty(file, false);
      clearConflict(file);
    },
    [clearConflict, setFileDirty, setOriginalText, setScriptText, stashedContent],
  );

  const performSaveAll = useCallback(async () => {
    if (!projectDir) return;

    await saveAllDirtyFiles(projectDir, useScriptStore.getState().fileDirtyMap, (file) => {
      const latestState = useScriptStore.getState();
      if (file === 'script.md') return latestState.scriptText;
      if (file === 'original.md') return latestState.originalText;
      return latestState.extraFileContents[file] ?? '';
    });
    clearAllDirty();
    await saveScriptState(
      projectDir,
      createPersistedScriptState(
        useScriptStore.getState().reviewState,
        useScriptStore.getState().scriptDocVersion,
        useScriptStore.getState().selectedTemplate,
        useScriptStore.getState().annotations,
        {
          manualStageOverride: useScriptStore.getState().manualStageOverride,
          selectedProviderId: useScriptStore.getState().selectedProviderId,
          selectedModel: useScriptStore.getState().selectedModel,
        },
      ),
    );
    await refreshFileTree(projectDir);
  }, [clearAllDirty, projectDir, refreshFileTree]);

  const handleSave = useCallback(async () => {
    const conflicts = Object.keys(fileConflictMap).filter((file) => fileConflictMap[file]);
    if (conflicts.length > 0) {
      setConflictChoices(Object.fromEntries(conflicts.map((file) => [file, 'mine' as const])));
      setConflictDialogOpen(true);
      return;
    }

    await performSaveAll();
  }, [fileConflictMap, performSaveAll]);

  const handleAcceptAllAndSave = useCallback(async () => {
    acceptAllAnnotations();
    await performSaveAll();
  }, [acceptAllAnnotations, performSaveAll]);

  const handleConfirmConflicts = useCallback(async () => {
    for (const file of Object.keys(conflictChoices)) {
      if (conflictChoices[file] === 'external') {
        handleUseExternalVersion(file);
      } else {
        clearConflict(file);
      }
    }

    setConflictDialogOpen(false);
    await performSaveAll();
  }, [clearConflict, conflictChoices, handleUseExternalVersion, performSaveAll]);

  // 选择工作区文件并创建 original.md
  const handleImportFileAsOriginal = useCallback(
    async (relativePath: string) => {
      const dir = await ensureProjectDirectory();
      if (!dir) return;
      const content = await window.electronAPI.loadScriptFile(dir, relativePath);
      if (content === null) return;
      await window.electronAPI.saveScriptFile(dir, 'original.md', content);
      setOriginalText(content);
      setScriptText('');
      setAnnotations([]);
      setWorkspaceFiles({ hasOriginalFile: true, hasScriptFile: false });
      openFileTab('original.md');
      setFileDirty('original.md', false);
      await refreshFileTree(dir);
    },
    [ensureProjectDirectory, refreshFileTree, setAnnotations, setFileDirty, openFileTab, setOriginalText, setScriptText, setWorkspaceFiles],
  );

  // 注册工作台回调供 GuideCards 等组件调用
  const { registerWorkbenchCallbacks, setWorkbenchMounted } = useScriptStore();
  useEffect(() => {
    setWorkbenchMounted(true);
    registerWorkbenchCallbacks({
      importText: () => void handleImportText(),
      createBlank: () => void handleCreateBlank(),
      focusEditor: () => editorViewRef.current?.focus(),
      importFileAsOriginal: handleImportFileAsOriginal,
      generateScript: handleFirstGenerate,
      regenerateScript: handleDirectRegenerate,
      reviewScript: runInternalReviewScript,
      save: () => void handleSave(),
      find: () => {
        const view = editorViewRef.current;
        if (view) openSearchPanel(view);
      },
      findReplace: () => {
        const view = editorViewRef.current;
        if (view) {
          setOpenWithReplace();
          openSearchPanel(view);
        }
      },
    });
    return () => {
      setWorkbenchMounted(false);
      registerWorkbenchCallbacks({
        importText: null,
        createBlank: null,
        focusEditor: null,
        importFileAsOriginal: null,
        generateScript: null,
        regenerateScript: null,
        reviewScript: null,
        save: null,
        find: null,
        findReplace: null,
      });
    };
  }, [
    registerWorkbenchCallbacks,
    setWorkbenchMounted,
    handleImportText,
    handleCreateBlank,
    handleImportFileAsOriginal,
    handleFirstGenerate,
    handleDirectRegenerate,
    runInternalReviewScript,
    handleSave,
  ]);

  // ── 从欢迎页带入的抖音链接：自动触发下载 + 转录，无需用户二次操作 ──
  useEffect(() => {
    if (!pendingDouyinUrl) return;
    const url = pendingDouyinUrl;
    // 立即清除，避免重复触发
    setPendingDouyinUrl(null);
    // 打开导入弹窗并自动开始导入
    setDouyinImportOpen(true);
    void handleImportDouyin(url);
  }, [pendingDouyinUrl, setPendingDouyinUrl, handleImportDouyin]);

  // 后台化操作已移除：用户点击编辑器区域不再中断 AI 流式输出。
  // 如需后台化功能，应由用户主动触发（如 QuickActionBar 按钮），而非全局 pointerdown。

  // --- MCP 日志转发到渲染进程 console ---
  useEffect(() => {
    if (!window.mcpAPI?.onLog) return;
    return window.mcpAPI.onLog(({ level, message }) => {
      if (level === 'error') {
        console.error(message);
      } else {
        console.log(message);
      }
    });
  }, []);

  // --- MCP Tool 事件监听 ---
  useEffect(() => {
    if (!window.mcpAPI) return;
    const unsubs: Array<() => void> = [];

    // 生成脚本草稿（真实流式写入编辑器）
    unsubs.push(
      window.mcpAPI.onGenerateScript(async (payload: any) => {
        const { templateCode, rawText, _replyChannel } = payload;
        await runInternalGenerateScript({
          templateCode,
          rawText,
          operationType: 'generate',
          canInterrupt: true,
          replyChannel: _replyChannel,
        });
      }),
    );

    // 更新脚本内容
    unsubs.push(
      window.mcpAPI.onUpdateScript(async (payload: any) => {
        const state = useScriptStore.getState();
        const filePath = payload.filePath || state.openedFile || 'script.md';
        const newContent: string = payload.content ?? '';
        const streamId = `mcp-update-${Date.now()}`;
        const streamKind =
          state.agentOperation.isOperating &&
          (state.agentOperation.operationType === 'generate' ||
            state.agentOperation.operationType === 'rewrite')
            ? state.agentOperation.operationType
            : 'update';

        // 获取旧内容
        let oldContent = '';
        if (filePath === 'script.md') {
          oldContent = state.scriptText;
        } else if (filePath === 'original.md') {
          oldContent = state.originalText;
        } else {
          oldContent = state.extraFileContents[filePath] ?? '';
        }

        // script.md 内容变更时清除旧审稿数据
        if (filePath === 'script.md' && state.annotations.length > 0) {
          state.setAnnotations([]);
          state.setReviewState('idle');
          state.bumpScriptDocVersion();
        }

        // 抑制编辑器 onChange 产生的 dirty 标记
        loadingFileRef.current = true;

        if (state.agentOperation.isOperating) {
          state.setAgentOperation({ progress: 0 });
        }

        // 尝试流式写入：如果目标是当前活动文件且有编辑器实例
        const isActiveFile = filePath === (state.openedFile || 'script.md');
        const view = editorViewRef.current;
        const canStream = isActiveFile && view && oldContent !== newContent;

        try {
          if (canStream) {
            state.setEditorAgent({ readOnly: true, streamingActive: true, virtualCursorPos: 0 });
            state.setActiveStream({ streamId, filePath, kind: streamKind, phase: 'preparing' });
            stopActivePlayback();

            const frames = diffToFrames(oldContent, newContent, {
              chunkSize: 20,
              baseDelayMs: 15,
            });

            if (frames.length > 0) {
              const player = new LiveStreamingEditor(view, {
                frameDelayMs: 15,
                onProgress: ({ committedChars, processedSteps, totalSteps }) => {
                  const s = useScriptStore.getState();
                  s.setEditorAgent({ virtualCursorPos: committedChars });
                  if (s.agentOperation.isOperating) {
                    s.setAgentOperation({
                      progress:
                        totalSteps > 0
                          ? Math.round((processedSteps / totalSteps) * 100)
                          : 100,
                    });
                  }
                  if (s.activeStream.phase !== 'streaming') {
                    s.setActiveStream({ phase: 'streaming' });
                  }
                },
              });
              liveStreamingRef.current = player;
              player.pushFrames(frames);
              useScriptStore.getState().setActiveStream({ phase: 'streaming' });
              await player.finish();
              if (liveStreamingRef.current === player) {
                liveStreamingRef.current = null;
              }
              useScriptStore.getState().setActiveStream({ phase: 'finalizing' });
            } else {
              state.setActiveStream({ streamId, filePath, kind: streamKind, phase: 'finalizing' });
            }

            syncContentToStore(filePath, newContent);
            state.setEditorAgent({ readOnly: false, streamingActive: false, virtualCursorPos: null });
            state.setFileDirty(filePath, false);
            state.setActiveStream({ streamId: null, filePath: null, kind: null, phase: 'idle' });
            loadingFileRef.current = false;
          } else {
            // 非活动文件或无编辑器：直接更新 store
            syncContentToStore(filePath, newContent);
            state.setFileDirty(filePath, false);
            state.setEditorAgent({ readOnly: false, streamingActive: false, virtualCursorPos: null });
            state.setActiveStream({ streamId: null, filePath: null, kind: null, phase: 'idle' });
            requestAnimationFrame(() => { loadingFileRef.current = false; });
          }
        } catch (err: any) {
          if (liveStreamingRef.current?.isPlaying) {
            liveStreamingRef.current.stop();
          }
          liveStreamingRef.current = null;
          loadingFileRef.current = false;
          state.setEditorAgent({ readOnly: false, streamingActive: false, virtualCursorPos: null });
          state.setActiveStream({ streamId: null, filePath: null, kind: null, phase: 'idle' });
          if (state.agentOperation.isOperating) {
            state.setAgentOperation({ progress: 0 });
          }
          window.mcpAPI!.reply(payload._replyChannel, {
            success: false,
            filePath,
            error: err?.message ?? String(err),
          });
          return;
        }

        // 计算变更行（用于高亮）
        const oldLines = oldContent.split('\n');
        const newLines = newContent.split('\n');
        const changedLines: number[] = [];
        const maxLen = Math.max(oldLines.length, newLines.length);
        for (let i = 0; i < maxLen; i++) {
          if (oldLines[i] !== newLines[i]) {
            changedLines.push(i + 1);
          }
        }

        // 高亮变更行，5 秒后自动清除
        useScriptStore.getState().setMcpChangeHighlightLines(changedLines);
        setTimeout(() => {
          useScriptStore.getState().clearMcpChangeHighlight();
        }, 5000);

        // 保存到磁盘（标记为 saving 以抑制文件监听器）
        const dir = useScriptStore.getState().projectDir;
        if (dir) {
          markFileSaving(filePath);
          await window.electronAPI.saveScriptFile(dir, filePath, newContent);
        }

        window.mcpAPI!.reply(payload._replyChannel, {
          success: true,
          filePath,
          linesChanged: changedLines.length,
        });
      }),
    );

    return () => {
      for (const unsub of unsubs) {
        unsub();
      }
    };
  }, []);

  if (restoring) {
    return <div className={styles.centerHint}>正在恢复上次工作状态...</div>;
  }

  return (
    <AlertProvider>
      <div className={styles.page}>
        <FileTreePanel
          projectDir={projectDir}
          fileEntries={fileEntries}
          openedFile={activeFile}
          fileDirtyMap={fileDirtyMap}
          fileConflictMap={fileConflictMap}
          onSelectProjectDir={() => {
            void handleSelectDirectory();
          }}
          onOpenFile={(file) => void handleOpenFile(file)}
        />

        <div className={styles.workArea}>
          <FileTabs
            tabs={tabs}
            openedFile={activeFile}
            fileDirtyMap={fileDirtyMap}
            fileConflictMap={fileConflictMap}
            onOpenFile={(file) => {
              // 流式输出期间不允许切换离开 script.md，避免编辑器内容与 tab 不一致
              if (editorAgent.streamingActive && activeFile === 'script.md' && file !== 'script.md') return;
              void handleOpenFile(file);
            }}
            onCloseTab={handleCloseTab}
            onTabContextMenu={(file) => {
              void handleShowTabContextMenu(file);
            }}
          />

          {/* 版本预览横幅 */}
          <VersionPreviewBar />

          {/* 快捷操作栏：根据工作流状态展示导入/生成/审稿等操作 */}
          {projectDir && (
            <QuickActionBar
              onImportText={() => { void handleImportText(); }}
              onImportDouyin={() => {
                setDouyinImportError(null);
                setDouyinImportOpen(true);
              }}
            />
          )}
          {projectDir ? (
            <div className={styles.workflowBar}>
              {(workflow.step === 'idle' ||
                workflow.step === 'error') &&
                !hasAICardOverlays ? (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={!scriptText.trim()}
                    className={styles.workflowButton}
                    onClick={handleGenerateVideo}
                  >
                    <AppIcon name="film" size={14} />
                    <span>生成视频</span>
                  </Button>
                  {hasDouyinDetailAction ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className={styles.workflowButton}
                      onClick={handleOpenImportPreview}
                    >
                      <AppIcon name="folder-open" size={14} />
                      <span>查看抖音详情</span>
                    </Button>
                  ) : null}
                </>
              ) : null}
              {workflow.step !== 'idle' &&
              workflow.step !== 'done' &&
              workflow.step !== 'error' ? (
                <div className={styles.workflowStatus}>
                  <span>AI 视频流程进行中</span>
                  <span>{workflow.stepLabel} {Math.round(workflow.progress)}%</span>
                </div>
              ) : null}
              {workflow.step === 'error' && workflow.error ? (
                <div className={styles.workflowError}>{workflow.error}</div>
              ) : null}
            </div>
          ) : null}
          <div className={styles.editorBody}>
            {workflow.step !== 'idle' && workflow.step !== 'done' ? (
              <div className={styles.workflowOverlay}>
                <div className={styles.workflowOverlayCard}>
                  <div className={styles.workflowOverlayHeader}>
                    <span className={styles.workflowOverlayTitle}>
                      {workflow.step === 'error' ? 'AI 视频流程已中断' : 'AI 正在生成视频草稿'}
                    </span>
                    <span className={styles.workflowOverlayMeta}>
                      {workflow.step === 'error'
                        ? workflow.error ?? '发生未知错误'
                        : `${workflow.stepLabel} ${Math.round(workflow.progress)}%`}
                    </span>
                  </div>
                  {workflow.step !== 'error' ? (
                    <div className={styles.workflowOverlayProgressTrack}>
                      <div
                        className={styles.workflowOverlayProgressValue}
                        style={{ width: `${workflow.progress}%` }}
                      />
                    </div>
                  ) : null}
                  <div className={styles.workflowOverlayActions}>
                    {workflow.canCancel ? (
                      <Button variant="ghost" size="sm" onClick={cancelWorkflow}>
                        取消
                      </Button>
                    ) : null}
                    {workflow.step === 'error' ? (
                      <>
                        <Button variant="secondary" size="sm" onClick={retryWorkflow}>
                          断点重试
                        </Button>
                        <Button variant="ghost" size="sm" onClick={cancelWorkflow}>
                          关闭
                        </Button>
                      </>
                    ) : null}
                  </div>
                </div>
              </div>
            ) : null}
            {activeFile && fileConflictMap[activeFile] ? (
              <div className={styles.conflictBanner}>
                <div className={styles.conflictBannerText}>
                  <AlertTriangle size={14} />
                  <span>此文件已被外部修改，保存前需要先处理冲突。</span>
                </div>
                <div className={styles.conflictBannerActions}>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => handleUseExternalVersion(activeFile)}
                  >
                    使用外部版本
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => clearConflict(activeFile)}
                  >
                    保留当前版本
                  </Button>
                </div>
              </div>
            ) : null}

            <div className={`${styles.editorSurface}${reviewBreathing ? ` ${styles.reviewBreathing}` : ''}`}>
              {!projectDir ? (
                <EmptyGuide
                  hasProjectDir={Boolean(projectDir)}
                  onSelectProjectDir={() => {
                    void handleSelectDirectory();
                  }}
                  onImportText={() => {
                    void handleImportText();
                  }}
                  onImportDouyin={() => {
                    setDouyinImportError(null);
                    setDouyinImportOpen(true);
                  }}
                  onCreateBlank={() => {
                    void handleCreateBlank();
                  }}
                  onDropFile={(relativePath) => {
                    void handleImportFileAsOriginal(relativePath);
                  }}
                />
              ) : activeFile ? (
                <>
                  {activeFile === 'script.md' && thinkingText.trim() ? (
                    <div className={styles.thinkingPanel}>
                      <ThinkingBlock
                        text={thinkingText}
                        streaming={agentOperation.isOperating}
                      />
                    </div>
                  ) : null}

                  {/* 审稿推荐横幅：生成完成后引导用户审稿 */}
                  {activeFile === 'script.md' && showReviewBanner && !agentOperation.isOperating && (
                    <div className={styles.reviewBanner}>
                      <Sparkles size={14} />
                      <span>口播稿已生成完成，建议进行 AI 审稿以提升质量</span>
                      <button
                        type="button"
                        className={styles.reviewBannerBtn}
                        onClick={() => {
                          setShowReviewBanner(false);
                          void runInternalReviewScript();
                        }}
                      >
                        AI 审稿
                      </button>
                      <button
                        type="button"
                        className={styles.reviewBannerClose}
                        onClick={() => setShowReviewBanner(false)}
                        aria-label="关闭"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  )}

                  <div className={styles.editorContainer}>
                    {activeFileIsVideoPreview ? (
                      activePreviewDocument ? (
                        <VideoImportPreviewPane
                          document={activePreviewDocument}
                          filePath={activeFile}
                        />
                      ) : (
                        <div
                          style={{
                            display: 'flex',
                            flexDirection: 'column',
                            justifyContent: 'center',
                            alignItems: 'center',
                            gap: 12,
                            width: '100%',
                            height: '100%',
                            padding: 24,
                            color: 'var(--color-text-secondary)',
                          }}
                        >
                          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--color-text-primary)' }}>
                            {activePreviewPending ? '正在加载抖音预览…' : '预览文件格式无效'}
                          </div>
                          <div style={{ maxWidth: 520, textAlign: 'center', lineHeight: 1.7 }}>
                            {activePreviewPending
                              ? '工作台正在读取 preview.json，并准备视频播放器与字幕预览。'
                              : '这个 preview.json 没有通过标准校验，暂时无法按视频预览模式渲染。'}
                          </div>
                        </div>
                      )
                    ) : (
                      <>
                        <ScriptEditor
                          value={
                            activeFile === 'script.md'
                              ? (historyPreview.active ? historyPreview.content ?? '' : scriptText)
                              : activeFile === 'original.md'
                                ? originalText
                                : extraFileContents[activeFile] ?? ''
                          }
                          onChange={handleEditorChange}
                          placeholder={
                            activeFile === 'script.md'
                              ? '口播稿内容...'
                              : activeFile === 'original.md'
                                ? '报告原文内容...'
                                : `${activeFile}`
                          }
                          annotations={activeFile === 'script.md' ? annotations : undefined}
                          onAcceptAnnotation={activeFile === 'script.md' ? acceptAnnotation : undefined}
                          onDismissAnnotation={activeFile === 'script.md' ? dismissAnnotation : undefined}
                          editorViewRef={editorViewRef}
                          readOnly={
                            ((activeFile === 'script.md' || activeFile === 'original.md') && editorAgent.readOnly) ||
                            historyPreview.active
                          }
                          streamingActive={editorAgent.streamingActive}
                          mcpChangeHighlightLines={mcpChangeHighlightLines}
                        />
                        {activeFile === 'script.md' &&
                          activeStream.filePath === activeFile &&
                          !(agentOperation.isOperating && agentOperation.backgrounded) &&
                          (activeStream.phase === 'preparing' ||
                            activeStream.phase === 'streaming' ||
                            activeStream.phase === 'finalizing') && (
                            <div className={
                              agentOperation.operationType === 'review'
                                ? styles.agentReviewIndicator
                                : styles.agentTypingIndicator
                            }>
                              {agentOperation.operationType === 'review'
                                ? activeStream.phase === 'preparing'
                                  ? 'AI 正在准备审稿'
                                  : activeStream.phase === 'finalizing'
                                    ? 'AI 正在标注问题'
                                    : 'AI 正在审阅全文'
                                : activeStream.kind === 'update'
                                  ? activeStream.phase === 'preparing'
                                    ? 'AI 正在准备更新'
                                    : activeStream.phase === 'finalizing'
                                      ? 'AI 正在同步修改'
                                      : 'AI 正在写入改动'
                                  : activeStream.phase === 'preparing'
                                    ? 'AI 正在准备写稿'
                                    : activeStream.phase === 'finalizing'
                                      ? 'AI 正在收尾保存'
                                      : 'AI 正在打字'}
                            </div>
                          )}
                      </>
                    )}
                  </div>

                  {/* 审稿状态栏：仅在查看 script.md 且有批注时显示 */}
                  {activeFile === 'script.md' && annotations.length > 0 && (
                    <ReviewStatusBar
                      annotations={annotations}
                      onAcceptAll={handleAcceptAllAndSave}
                      onDismissAll={dismissAllAnnotations}
                    />
                  )}

                  {/* 审查结果面板：仅在查看 script.md 且有批注时显示 */}
                  {activeFile === 'script.md' && annotations.length > 0 && (
                    <div className={styles.annotationPanel}>
                      <div className={styles.annotationPanelBody}>
                        <AnnotationList
                          annotations={annotations}
                          onAccept={acceptAnnotation}
                          onDismiss={dismissAnnotation}
                        />
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <EmptyGuide
                  hasProjectDir={Boolean(projectDir)}
                  onSelectProjectDir={() => {
                    void handleSelectDirectory();
                  }}
                  onImportText={() => {
                    void handleImportText();
                  }}
                  onImportDouyin={() => {
                    setDouyinImportError(null);
                    setDouyinImportOpen(true);
                  }}
                  onCreateBlank={() => {
                    void handleCreateBlank();
                  }}
                  onDropFile={(relativePath) => {
                    void handleImportFileAsOriginal(relativePath);
                  }}
                />
              )}
            </div>

            <SideDrawer
              open={drawerVisible}
              title={drawerContent === 'template' ? '模板选择' : '批注列表'}
              onClose={closeDrawer}
            >
              {drawerContent === 'template' ? (
                <TemplateDrawerContent
                  selectedTemplate={selectedTemplate}
                  onSelectTemplate={setSelectedTemplate}
                />
              ) : (
                <AnnotationList
                  annotations={annotations}
                  onAccept={acceptAnnotation}
                  onDismiss={dismissAnnotation}
                />
              )}
            </SideDrawer>
          </div>
        </div>
      </div>

      {/* 审稿浮动指针：AI 模拟人类审阅时的虚拟鼠标 */}
      {reviewCursorPos && (
        <div
          className={styles.aiReviewCursor}
          style={{
            left: reviewCursorPos.x - 4,
            top: reviewCursorPos.y - 2,
          }}
        >
          <svg width="20" height="24" viewBox="0 0 20 24" fill="none">
            <path
              d="M1 1L1 18.5L5.5 14L10.5 22L13.5 20.5L8.5 12.5L14 11.5L1 1Z"
              fill="rgba(52, 211, 153, 0.85)"
              stroke="rgba(255,255,255,0.6)"
              strokeWidth="1.2"
              strokeLinejoin="round"
            />
          </svg>
          <span className={styles.aiReviewCursorLabel}>AI</span>
        </div>
      )}

      <ConflictDialog
        open={conflictDialogOpen}
        files={Object.keys(conflictChoices)}
        resolutions={conflictChoices}
        onChangeResolution={(file, resolution) =>
          setConflictChoices((prev) => ({ ...prev, [file]: resolution }))
        }
        onCancel={() => setConflictDialogOpen(false)}
        onConfirm={() => {
          void handleConfirmConflicts();
        }}
      />
      <DouyinImportDialog
        open={douyinImportOpen}
        busy={douyinImportBusy}
        progress={videoImportProgress}
        lastResult={lastVideoImport}
        onOpenPreview={handleOpenImportPreview}
        errorMessage={douyinImportError}
        onOpenChange={(open) => {
          setDouyinImportOpen(open);
          if (!open && !douyinImportBusy) {
            setDouyinImportError(null);
          }
        }}
        onSubmit={handleImportDouyin}
      />
    </AlertProvider>
  );
}
