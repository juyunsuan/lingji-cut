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
import { getAllTemplates, getRoleById } from '../lib/script-templates';
import { replaceEditorContent } from '../lib/editor-document';
import { clearVirtualCursor } from '../lib/virtual-cursor';
import { waitForValue } from '../lib/wait-for-value';
import { AnnotationList } from '../components/script/AnnotationList';
import { ConflictDialog } from '../components/script/ConflictDialog';
import { EmptyGuide } from '../components/script/EmptyGuide';
import { FileTabs } from '../components/script/FileTabs';
import { FileTreePanel } from '../components/script/FileTreePanel';
import { QuickActionBar } from '../components/script/QuickActionBar';
import { ReviewStatusBar } from '../components/script/ReviewStatusBar';
import { SideDrawer } from '../components/script/SideDrawer';
import { TemplateDrawerContent } from '../components/script/TemplateDrawerContent';
import { ThinkingBlock } from '../components/agent/ThinkingBlock';
import { ScriptEditor } from '../ui/components/script-editor';
import { AlertProvider } from '../ui/components/alert';
import { Button } from '../ui';
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
    currentStep,
    originalText,
    scriptText,
    selectedTemplate,
    projectDir,
    annotations,
    generating,
    reviewing,
    setCurrentStep,
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
  } = useScriptStore();

  const [restoring, setRestoring] = useState(false);
  const [conflictDialogOpen, setConflictDialogOpen] = useState(false);
  const [conflictChoices, setConflictChoices] = useState<Record<string, 'mine' | 'external'>>({});
  /** 用户显式关闭的标签页（包括 special 文件），阻止 tabs 自动重现 */
  const [closedTabs, setClosedTabs] = useState<Set<string>>(new Set());
  const [thinkingText, setThinkingText] = useState('');

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
      setProjectDir(dir);
      await window.electronAPI.startWatching(dir);

      const entries = await refreshFileTree(dir);
      const fullState = await loadFullScriptState(dir);

      const hasOriginal = entries.some((e) => e.name === 'original.md');
      const hasScript = entries.some((e) => e.name === 'script.md');
      setWorkspaceFiles({ hasOriginalFile: hasOriginal, hasScriptFile: hasScript });

      if (fullState) {
        const { persisted } = fullState;
        const derivedStep =
          persisted.reviewState === 'clean'
            ? 4
            : persisted.reviewState === 'issues'
              ? 3
              : fullState.scriptText.length > 0
                ? 2
                : fullState.originalText.length > 0
                  ? 1
                  : 0;

        restoreState({
          projectDir: dir,
          currentStep: derivedStep as 0 | 1 | 2 | 3 | 4,
          originalText: fullState.originalText,
          scriptText: fullState.scriptText,
          selectedTemplate: persisted.templateId,
          annotations: persisted.annotations,
          reviewState: persisted.reviewState,
          scriptDocVersion: persisted.lastReviewedDocVersion,
          workspaceFiles: { hasOriginalFile: hasOriginal, hasScriptFile: hasScript },
        });
        setFileEntries(entries);
        if (!openedFile) {
          const fileToOpen = hasScript ? 'script.md' : hasOriginal ? 'original.md' : null;
          if (fileToOpen) openFileTab(fileToOpen);
        }
        hydratedDirRef.current = dir;
        return dir;
      }

      const [originalFromDisk, scriptFromDisk] = await Promise.all([
        window.electronAPI.loadScriptFile(dir, 'original.md'),
        window.electronAPI.loadScriptFile(dir, 'script.md'),
      ]);

      const nextStep = originalFromDisk !== null ? 1 : 0;
      restoreState({
        projectDir: dir,
        currentStep: nextStep as 0 | 1,
        originalText: originalFromDisk ?? '',
        scriptText: scriptFromDisk ?? '',
        selectedTemplate: 'news-broadcast',
        annotations: [],
        workspaceFiles: { hasOriginalFile: hasOriginal, hasScriptFile: hasScript },
      });
      setFileEntries(entries);
      if (!openedFile) {
        const fileToOpen = originalFromDisk !== null ? 'original.md' : scriptFromDisk !== null ? 'script.md' : null;
        if (fileToOpen) openFileTab(fileToOpen);
      }
      hydratedDirRef.current = dir;
      return dir;
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

  // 已完成 hydrate 的目录，防止重复加载
  const hydratedDirRef = useRef<string | null>(null);
  // hydrateProjectDirectory 引用不稳定（依赖 openedFile 等），用 ref 打断 effect 循环
  const hydrateRef = useRef(hydrateProjectDirectory);
  hydrateRef.current = hydrateProjectDirectory;

  // 1. 挂载初始化：从 store / localStorage 恢复工作目录
  useEffect(() => {
    const restore = async () => {
      if (useScriptStore.getState().projectDir) {
        const dir = useScriptStore.getState().projectDir!;
        hydratedDirRef.current = dir;
        await window.electronAPI.startWatching(dir);
        await refreshFileTree(dir);
        return;
      }

      const savedDir = loadPersistedScriptProjectDir();
      if (!savedDir) return;

      setRestoring(true);
      try {
        await hydrateRef.current(savedDir);
        hydratedDirRef.current = savedDir;
      } catch (error) {
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
  }, [refreshFileTree]);

  // 2. 外部目录变更：App.tsx 同步了新的 projectDir 时重新加载
  useEffect(() => {
    if (!projectDir || projectDir === hydratedDirRef.current) return;

    void (async () => {
      setRestoring(true);
      try {
        await hydrateRef.current(projectDir);
        hydratedDirRef.current = projectDir;
      } catch (error) {
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
      } else if (!(file in useScriptStore.getState().extraFileContents)) {
        const content = await window.electronAPI.loadScriptFile(projectDir, file);
        if (content !== null) setExtraFileContent(file, content);
      }

      // 延迟一帧后解除 loading 标记，确保本轮编辑器 onChange 已被跳过
      requestAnimationFrame(() => { loadingFileRef.current = false; });
    },
    [projectDir, openFileTab, setOriginalText, setScriptText, setExtraFileContent],
  );

  // 关闭标签页
  const handleCloseTab = useCallback(
    (file: string) => {
      // 清除非 special 文件的缓存内容
      if (!SPECIAL_FILES.has(file)) {
        removeExtraFile(file);
      }
      // 标记为已关闭（special 文件也可以关闭标签）
      setClosedTabs((prev) => new Set(prev).add(file));
      // 如果关闭的是当前打开的文件，切到其他 tab
      if (file === activeFile) {
        const remaining = tabs.filter((t) => t !== file);
        setOpenedFile(remaining.length > 0 ? remaining[remaining.length - 1] : null);
      }
      setFileDirty(file, false);
    },
    [activeFile, tabs, setOpenedFile, setFileDirty, removeExtraFile],
  );

  const handleImportText = useCallback(async () => {
    const dir = await ensureProjectDirectory();
    if (!dir) return;

    const result = await window.electronAPI.selectTextFile();
    if (!result) return;

    setOriginalText(result.content);
    setScriptText('');
    setAnnotations([]);
    setCurrentStep(1);
    openFileTab('original.md');
    setFileDirty('original.md', false);
    await window.electronAPI.saveScriptFile(dir, 'original.md', result.content);
    await refreshFileTree(dir);
  }, [
    ensureProjectDirectory,
    refreshFileTree,
    setAnnotations,
    setCurrentStep,
    setFileDirty,
    openFileTab,
    setOriginalText,
    setScriptText,
  ]);

  const handleCreateBlank = useCallback(async () => {
    const dir = await ensureProjectDirectory();
    if (!dir) return;

    await window.electronAPI.saveScriptFile(dir, 'original.md', '');
    setOriginalText('');
    setScriptText('');
    setAnnotations([]);
    setCurrentStep(1);
    openFileTab('original.md');
    setFileDirty('original.md', false);
    await refreshFileTree(dir);
  }, [
    ensureProjectDirectory,
    refreshFileTree,
    setAnnotations,
    setCurrentStep,
    setFileDirty,
    openFileTab,
    setOriginalText,
    setScriptText,
  ]);

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
      try {
        const state = useScriptStore.getState();
        const streamId = `mcp-generate-${Date.now()}`;
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
        let didEnqueueStreamText = false;

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
      openFileTab('script.md');
      setFileDirty('script.md', true);
    } catch (error) {
      console.error('生成口播稿失败:', error);
      alert(`生成失败: ${error instanceof Error ? error.message : '未知错误'}`);
    } finally {
      setGenerating(false);
    }
  }, [originalText, selectedTemplate, bumpScriptDocVersion, setAnnotations, setFileDirty, setGenerating, openFileTab, setReviewState, setScriptText]);

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
      setCurrentStep(1);
      openFileTab('original.md');
      setFileDirty('original.md', false);
      setWorkspaceFiles({ hasOriginalFile: true });
      await refreshFileTree(dir);
    },
    [ensureProjectDirectory, refreshFileTree, setAnnotations, setCurrentStep, setFileDirty, openFileTab, setOriginalText, setScriptText, setWorkspaceFiles],
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

    // 获取编辑器状态
    unsubs.push(
      window.mcpAPI.onGetEditorState((payload: any) => {
        const state = useScriptStore.getState();
        window.mcpAPI!.reply(payload._replyChannel, {
          projectDir: state.projectDir,
          openFiles: state.fileEntries.map((f) => f.name),
          activeFile: state.openedFile,
          cursorPosition: null,
        });
      }),
    );

    // 读取脚本文件内容
    unsubs.push(
      window.mcpAPI.onReadScript((payload: any) => {
        const state = useScriptStore.getState();
        let filePath = payload.filePath || state.openedFile || 'script.md';
        // 标准化：将绝对路径转为项目目录下的相对路径
        if (state.projectDir && filePath.startsWith(state.projectDir)) {
          filePath = filePath.slice(state.projectDir.length).replace(/^\//, '');
        }
        let content = '';
        if (filePath === 'script.md') {
          content = state.scriptText;
        } else if (filePath === 'original.md') {
          content = state.originalText;
        } else {
          content = state.extraFileContents[filePath] ?? '';
        }
        const lineCount = content ? content.split('\n').length : 0;
        window.mcpAPI!.reply(payload._replyChannel, { filePath, content, lineCount });
      }),
    );

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

    // 提交审查批注
    unsubs.push(
      window.mcpAPI.onSubmitReview((payload: any) => {
        const state = useScriptStore.getState();
        const annotationsInput: Array<{
          quotedText?: string;
          line?: number;
          endLine?: number;
          text: string;
          suggestion?: string;
          severity?: string;
        }> = payload.annotations ?? [];
        const scriptContent = state.scriptText;
        const scriptLines = scriptContent.split('\n');

        // 预计算行偏移表（仅在需要行号定位时使用）
        const lineOffsets: number[] = [0];
        for (let i = 0; i < scriptLines.length; i++) {
          lineOffsets.push(lineOffsets[i] + scriptLines[i].length + 1);
        }

        const newAnnotations: typeof state.annotations = [];
        let skipped = 0;

        for (let idx = 0; idx < annotationsInput.length; idx++) {
          const a = annotationsInput[idx];
          let startOffset: number;
          let endOffset: number;
          let originalText: string;

          if (a.quotedText) {
            // 优先使用 quotedText 精确匹配（与 script-review.ts 同逻辑）
            const matchIdx = scriptContent.indexOf(a.quotedText);
            if (matchIdx === -1) {
              skipped++;
              continue; // 找不到匹配，跳过此批注
            }
            startOffset = matchIdx;
            endOffset = matchIdx + a.quotedText.length;
            originalText = a.quotedText;
          } else if (a.line != null) {
            // 降级到行号定位
            const startLine = Math.max(1, Math.min(a.line, scriptLines.length));
            const endLine = Math.max(startLine, Math.min(a.endLine ?? startLine, scriptLines.length));
            startOffset = lineOffsets[startLine - 1];
            endOffset = lineOffsets[endLine] - 1; // 不含末尾换行
            originalText = scriptLines.slice(startLine - 1, endLine).join('\n');
          } else {
            skipped++;
            continue; // 既无 quotedText 也无 line，跳过
          }

          newAnnotations.push({
            id: `mcp-review-${Date.now()}-${idx}`,
            startOffset,
            endOffset,
            originalText,
            quotedText: originalText,
            docVersion: state.scriptDocVersion,
            issue: a.text,
            // 仅当 agent 明确提供 suggestion 时才设置，否则留空
            suggestion: a.suggestion ?? '',
            severity: (['error', 'warning', 'info'].includes(a.severity ?? '') ? a.severity as 'error' | 'warning' | 'info' : 'info'),
            status: 'pending' as const,
          });
        }

        state.setAnnotations(newAnnotations);
        state.setReviewState(newAnnotations.length > 0 ? 'issues' : 'clean');

        window.mcpAPI!.reply(payload._replyChannel, {
          success: true,
          filePath: 'script.md',
          annotationCount: newAnnotations.length,
          skipped,
        });
      }),
    );

    // 列出项目文件
    unsubs.push(
      window.mcpAPI.onListProjectFiles((payload: any) => {
        const state = useScriptStore.getState();
        window.mcpAPI!.reply(payload._replyChannel, {
          projectDir: state.projectDir,
          files: state.fileEntries.map((f) => ({
            path: f.name,
            name: f.name,
            isDirectory: f.type === 'directory',
          })),
        });
      }),
    );

    // 获取项目上下文
    unsubs.push(
      window.mcpAPI.onGetProjectContext((payload: any) => {
        const state = useScriptStore.getState();
        const templates = getAllTemplates();
        const selectedTpl = templates.find((t) => t.id === state.selectedTemplate);
        const selectedRole = getRoleById(state.selectedRole);
        window.mcpAPI!.reply(payload._replyChannel, {
          projectName: state.projectDir?.split('/').pop() ?? null,
          projectDir: state.projectDir,
          selectedTemplate: state.selectedTemplate,
          // 返回当前选中模板的完整写作指令，供 agent 按风格写稿
          selectedTemplatePrompt: selectedTpl?.systemPrompt ?? null,
          // 返回当前选中的角色设定
          selectedRole: selectedRole ? {
            id: selectedRole.id,
            name: selectedRole.name,
            description: selectedRole.description,
            rolePrompt: selectedRole.rolePrompt,
          } : null,
          // 角色使用说明
          roleInstruction: selectedRole && selectedRole.id !== 'none'
            ? `【重要】用户已选择「${selectedRole.name}」作为口播角色。写稿时请严格遵循以下角色设定：\n${selectedRole.rolePrompt}\n请将此角色风格融入模板要求中生成口播稿。`
            : null,
          templates: templates.map((t) => ({
            id: t.id,
            name: t.name,
            description: t.description,
            // 返回完整 systemPrompt，让 agent 能按风格写稿
            systemPrompt: t.systemPrompt,
          })),
          hasOriginalFile: state.workspaceFiles.hasOriginalFile,
          hasScriptFile: state.workspaceFiles.hasScriptFile,
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
          />

          {/* 快捷操作栏：根据工作流状态展示导入/生成/审稿等操作 */}
          {projectDir && (
            <QuickActionBar onImportText={() => { void handleImportText(); }} />
          )}
          {projectDir ? (
            <div className={styles.workflowBar}>
              {(workflow.step === 'idle' ||
                workflow.step === 'done' ||
                workflow.step === 'error') ? (
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
                  <button type="button" onClick={() => handleUseExternalVersion(activeFile)}>
                    使用外部版本
                  </button>
                  <button type="button" onClick={() => clearConflict(activeFile)}>
                    保留当前版本
                  </button>
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
                      <ThinkingBlock text={thinkingText} />
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
                    <ScriptEditor
                      value={
                        activeFile === 'script.md'
                          ? scriptText
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
                      readOnly={editorAgent.readOnly}
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
    </AlertProvider>
  );
}
